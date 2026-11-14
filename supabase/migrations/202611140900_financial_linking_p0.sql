-- Financial Linking Engine 1.0 (P0). Financial relations never replace physical nesting.
-- Only the trusted Edge Function can create/revoke links. No browser writes.
create unique index if not exists document_records_org_id_unique
  on public.document_records(organization_id,id);

create table if not exists public.billy_financial_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_document_id uuid not null,
  payment_document_id uuid not null,
  state text not null default 'active' check (state in ('active','revoked')),
  match_method text not null check (match_method in ('same_photo_exact','operator_verified')),
  payment_result text not null default 'unverified'
    check (payment_result in ('unverified','confirmed')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check (amount_minor >= 0 and amount_minor <= 10000000000000),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoke_reason text,
  constraint financial_links_distinct_documents check (expense_document_id <> payment_document_id),
  constraint financial_links_revocation_consistency check
    ((state='active' and revoked_at is null and revoked_by is null)
      or (state='revoked' and revoked_at is not null and revoked_by is not null)),
  foreign key (organization_id,expense_document_id)
    references public.document_records(organization_id,id) on delete cascade,
  foreign key (organization_id,payment_document_id)
    references public.document_records(organization_id,id) on delete cascade
);
-- A POS slip cannot settle two separate invoices; future partial payments can
-- attach multiple distinct slips to one invoice.
create unique index if not exists billy_financial_active_payment_unique
 on public.billy_financial_links(organization_id,payment_document_id)
 where state='active';
create unique index if not exists billy_financial_active_pair_unique
 on public.billy_financial_links(organization_id,expense_document_id,payment_document_id)
 where state='active';
create index if not exists billy_financial_expense_lookup
 on public.billy_financial_links(organization_id,expense_document_id,state);

create table if not exists public.billy_financial_link_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_id uuid not null,
  expense_document_id uuid not null,
  payment_document_id uuid not null,
  event_type text not null check (event_type in ('linked','unlinked','deleted')),
  actor_id uuid references auth.users(id),
  event_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);

create or replace function private.billy_financial_link_validate()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare expense_record public.document_records%rowtype;
  payment_record public.document_records%rowtype;
  payment_profile text;
  expense_profile text;
begin
  if TG_OP='UPDATE' then
    if old.state <> 'active' or new.state <> 'revoked' or
       new.organization_id is distinct from old.organization_id or
       new.expense_document_id is distinct from old.expense_document_id or
       new.payment_document_id is distinct from old.payment_document_id or
       new.amount_minor is distinct from old.amount_minor or
       new.currency is distinct from old.currency or
       new.match_method is distinct from old.match_method or
       new.payment_result is distinct from old.payment_result or
       new.evidence is distinct from old.evidence or
       new.created_by is distinct from old.created_by then
      raise exception 'Financial links can only be revoked, not rewritten';
    end if;
    if new.revoked_by is null then raise exception 'Revocation actor required'; end if;
    new.revoked_at := now();
    return new;
  end if;
  select * into expense_record from public.document_records
    where id=new.expense_document_id and organization_id=new.organization_id;
  select * into payment_record from public.document_records
    where id=new.payment_document_id and organization_id=new.organization_id;
  if expense_record.id is null or payment_record.id is null or
     expense_record.state <> 'approved' or payment_record.state <> 'approved' then
    raise exception 'Financial links require two approved documents from the same team';
  end if;
  payment_profile := payment_record.review_metadata #>> '{classification,profile}';
  expense_profile := expense_record.review_metadata #>> '{classification,profile}';
  if payment_profile <> 'payment_slip' or
     expense_profile is null or expense_profile in
       ('payment_slip','fuel_release','supplier_statement','generic_document') then
    raise exception 'Financial link types are incompatible';
  end if;
  if new.match_method='same_photo_exact' and
     (payment_record.parent_document_id is distinct from expense_record.id or
      payment_record.relationship_type <> 'attached_document') then
    raise exception 'Same-photo match requires a physically nested POS slip';
  end if;
  if not exists (select 1 from public.organization_memberships
    where organization_id=new.organization_id and user_id=new.created_by) then
    raise exception 'Financial link actor must belong to the team';
  end if;
  return new;
end $$;
drop trigger if exists billy_financial_link_validate on public.billy_financial_links;
create trigger billy_financial_link_validate
 before insert or update on public.billy_financial_links
 for each row execute function private.billy_financial_link_validate();

create or replace function private.billy_financial_link_audit()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  insert into public.billy_financial_link_events
    (organization_id,link_id,expense_document_id,payment_document_id,event_type,actor_id,evidence)
  values (
    case when TG_OP='DELETE' then old.organization_id else new.organization_id end,
    case when TG_OP='DELETE' then old.id else new.id end,
    case when TG_OP='DELETE' then old.expense_document_id else new.expense_document_id end,
    case when TG_OP='DELETE' then old.payment_document_id else new.payment_document_id end,
    case when TG_OP='INSERT' then 'linked'
         when TG_OP='DELETE' then 'deleted' else 'unlinked' end,
    case when TG_OP='DELETE' then null
         when TG_OP='INSERT' then new.created_by else new.revoked_by end,
    case when TG_OP='INSERT' then new.evidence
         when TG_OP='UPDATE' then jsonb_build_object('reason',coalesce(new.revoke_reason,''))
         else '{}'::jsonb end
  );
  return null;
end $$;
drop trigger if exists billy_financial_link_audit on public.billy_financial_links;
create trigger billy_financial_link_audit
 after insert or update or delete on public.billy_financial_links
 for each row execute function private.billy_financial_link_audit();

alter table public.billy_financial_links enable row level security;
alter table public.billy_financial_link_events enable row level security;
revoke all on public.billy_financial_links,public.billy_financial_link_events
  from anon,authenticated;
grant select,insert,update,delete on public.billy_financial_links to service_role;
grant select,insert on public.billy_financial_link_events to service_role;
grant usage,select on sequence public.billy_financial_link_events_id_seq to service_role;
comment on table public.billy_financial_links is
  'Explicit payment evidence links. Approval of a receipt is NOT evidence that a payment succeeded. Never auto-count a POS slip as a new expense.';
comment on table public.billy_financial_link_events is
  'Append-only server audit of financial links, unlink actions and source deletions; no browser access.';
