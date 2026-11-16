-- Financial Reconciliation 3B.2 (operator-reported payments and partial coverage).
-- Distinguish POS evidence from reports; on_account is NOT a payment.
-- All writes are via the authenticated Edge Function/service role; immutable events.
create or replace function private.billy_financial_amount_minor(p_metadata jsonb)
returns bigint language plpgsql immutable set search_path=''
as $$
declare amount_text text;
begin
  amount_text:=coalesce(p_metadata#>>'{financial_overrides,grand_total}',
    p_metadata#>>'{normalization,approved,values,grand_total}');
  if amount_text is null or amount_text !~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' then
    return null;
  end if;
  return round(amount_text::numeric*100)::bigint;
end $$;

create or replace function private.billy_financial_currency(p_metadata jsonb)
returns text language sql immutable set search_path=''
as $$
  select case when coalesce(p_metadata#>>'{financial_overrides,currency}',
    p_metadata#>>'{normalization,approved,values,currency}') ~ '^[A-Z]{3}$'
    then coalesce(p_metadata#>>'{financial_overrides,currency}',
    p_metadata#>>'{normalization,approved,values,currency}')
    else null end
$$;

create table if not exists public.billy_financial_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_document_id uuid not null,
  method text not null check(method in ('bank_transfer','cash','other','on_account')),
  amount_minor bigint not null check(amount_minor between 0 and 1000000000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  state text not null default 'active' check(state in ('active','revoked')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  constraint billy_financial_allocation_amount_check check(
    (method='on_account' and amount_minor=0) or
    (method<>'on_account' and amount_minor>0)),
  constraint billy_financial_allocation_revocation_check check(
    (state='active' and revoked_by is null and revoked_at is null) or
    (state='revoked' and revoked_by is not null and revoked_at is not null)),
  foreign key(organization_id,expense_document_id)
    references public.document_records(organization_id,id) on delete cascade
);
create index if not exists billy_financial_allocations_expense_idx
  on public.billy_financial_allocations(organization_id,expense_document_id,state);
create unique index if not exists billy_financial_one_active_account_flag
  on public.billy_financial_allocations(organization_id,expense_document_id)
  where state='active' and method='on_account';

create table if not exists public.billy_financial_allocation_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  allocation_id uuid not null,
  expense_document_id uuid not null,
  event_type text not null check(event_type in ('recorded','revoked','deleted')),
  actor_id uuid references auth.users(id),
  method text not null,
  amount_minor bigint not null,
  currency text not null,
  event_at timestamptz not null default now()
);
create index if not exists billy_financial_allocation_events_idx
  on public.billy_financial_allocation_events(organization_id,expense_document_id,event_at desc);

create or replace function private.billy_financial_allocation_validate()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare expense public.document_records%rowtype;
  expected_amount bigint;
  expected_currency text;
  used_amount bigint;
begin
  if TG_OP='UPDATE' then
    if old.state<>'active' or new.state<>'revoked' or
       new.id is distinct from old.id or
       new.organization_id is distinct from old.organization_id or
       new.expense_document_id is distinct from old.expense_document_id or
       new.method is distinct from old.method or
       new.amount_minor is distinct from old.amount_minor or
       new.currency is distinct from old.currency or
       new.created_by is distinct from old.created_by or
       new.created_at is distinct from old.created_at or
       new.revoked_by is null then
      raise exception 'Financial allocations are immutable; only revocation is allowed';
    end if;
    new.revoked_at:=now();
    return new;
  end if;
  -- Serialize both POS and manual allocations on the same invoice.
  select * into expense from public.document_records
    where organization_id=new.organization_id and id=new.expense_document_id
    for update;
  if expense.id is null or expense.state<>'approved' or
     expense.parent_document_id is not null or expense.created_by<>new.created_by or
     (expense.review_metadata#>>'{classification,profile}') in
       ('payment_slip','fuel_release','supplier_statement','generic_document') then
    raise exception 'Only an approved expense owner may record a financial allocation';
  end if;
  if not exists(select 1 from public.organization_memberships
    where organization_id=new.organization_id and user_id=new.created_by) then
    raise exception 'Financial allocation actor must belong to the team';
  end if;
  expected_amount:=private.billy_financial_amount_minor(expense.review_metadata);
  expected_currency:=private.billy_financial_currency(expense.review_metadata);
  if expected_amount is null or expected_currency is null or
     expected_amount<=0 or new.currency<>expected_currency then
    raise exception 'Approved invoice amount and currency are required';
  end if;
  select coalesce(sum(amount_minor),0) into used_amount
    from public.billy_financial_allocations
    where organization_id=new.organization_id and expense_document_id=new.expense_document_id
      and state='active' and method<>'on_account';
  used_amount:=used_amount+coalesce((
    select sum(amount_minor) from public.billy_financial_links
    where organization_id=new.organization_id and expense_document_id=new.expense_document_id
      and state='active'),0);
  if new.method='on_account' and used_amount>=expected_amount then
    raise exception 'A fully covered invoice cannot be marked on account';
  end if;
  if used_amount+new.amount_minor>expected_amount then
    raise exception 'Allocated payments exceed the approved invoice amount';
  end if;
  return new;
end $$;
drop trigger if exists billy_financial_allocation_validate on public.billy_financial_allocations;
create trigger billy_financial_allocation_validate before insert or update
  on public.billy_financial_allocations for each row
  execute function private.billy_financial_allocation_validate();

-- Guard the other direction too: adding a POS proof cannot over-allocate an
-- invoice that already has operator-reported payments or other POS proofs.
create or replace function private.billy_financial_link_coverage()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare expense public.document_records%rowtype;
  limit_minor bigint;
  limit_currency text;
  allocated bigint;
begin
  select * into expense from public.document_records
    where organization_id=new.organization_id and id=new.expense_document_id for update;
  if expense.id is null then raise exception 'Invoice unavailable'; end if;
  limit_minor:=private.billy_financial_amount_minor(expense.review_metadata);
  limit_currency:=private.billy_financial_currency(expense.review_metadata);
  if limit_minor is null or limit_currency is null or
     limit_minor<=0 or new.currency<>limit_currency then
    raise exception 'Cannot link POS without approved invoice amount and currency';
  end if;
  select coalesce(sum(amount_minor),0) into allocated
    from public.billy_financial_links where organization_id=new.organization_id
      and expense_document_id=new.expense_document_id and state='active';
  allocated:=allocated+coalesce((
    select sum(amount_minor) from public.billy_financial_allocations
    where organization_id=new.organization_id and expense_document_id=new.expense_document_id
      and state='active' and method<>'on_account'),0);
  if allocated+new.amount_minor>limit_minor then
    raise exception 'Payment links would exceed invoice amount';
  end if;
  return new;
end $$;
drop trigger if exists billy_financial_link_coverage on public.billy_financial_links;
create trigger billy_financial_link_coverage before insert
  on public.billy_financial_links for each row
  execute function private.billy_financial_link_coverage();

create or replace function private.billy_financial_allocation_audit()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  insert into public.billy_financial_allocation_events(
    organization_id,allocation_id,expense_document_id,event_type,
    actor_id,method,amount_minor,currency)
  values (
    case when TG_OP='DELETE' then old.organization_id else new.organization_id end,
    case when TG_OP='DELETE' then old.id else new.id end,
    case when TG_OP='DELETE' then old.expense_document_id else new.expense_document_id end,
    case when TG_OP='DELETE' then 'deleted'
         when TG_OP='INSERT' then 'recorded' else 'revoked' end,
    case when TG_OP='DELETE' then null
         when TG_OP='INSERT' then new.created_by else new.revoked_by end,
    case when TG_OP='DELETE' then old.method else new.method end,
    case when TG_OP='DELETE' then old.amount_minor else new.amount_minor end,
    case when TG_OP='DELETE' then old.currency else new.currency end
  );
  return null;
end $$;
drop trigger if exists billy_financial_allocation_audit on public.billy_financial_allocations;
create trigger billy_financial_allocation_audit after insert or update or delete
  on public.billy_financial_allocations for each row
  execute function private.billy_financial_allocation_audit();

alter table public.billy_financial_allocations enable row level security;
alter table public.billy_financial_allocation_events enable row level security;
revoke all on public.billy_financial_allocations,public.billy_financial_allocation_events
  from anon,authenticated;
grant select,insert,update,delete on public.billy_financial_allocations to service_role;
grant select,insert on public.billy_financial_allocation_events to service_role;
grant usage,select on sequence public.billy_financial_allocation_events_id_seq to service_role;
comment on table public.billy_financial_allocations is
  'Operator-reported payment coverage. Bank transfer/cash/other are not independent bank confirmations. On account has zero paid amount. Immutable except revocation.';
comment on table public.billy_financial_allocation_events is
  'Append-only reconciliation audit. No direct browser access.';
