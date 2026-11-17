-- Financial Cards 1.0: masked team catalog only. Never store a full PAN,
-- expiration date, CVV, or import competitor spending balances.
create table if not exists public.billy_payment_cards(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  last4 text not null check(last4 ~ '^[0-9]{4}$'),
  holder_label text not null check(length(btrim(holder_label)) between 2 and 80),
  display_currency text check(display_currency is null or display_currency ~ '^[A-Z]{3}$'),
  program_label text check(program_label is null or length(program_label) between 2 and 25),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  constraint payment_cards_archive_consistency check(
    (active and archived_by is null and archived_at is null) or
    (not active and archived_by is not null and archived_at is not null))
);
create unique index if not exists billy_payment_cards_org_active_last4
  on public.billy_payment_cards(organization_id,last4) where active;
create index if not exists billy_payment_cards_org_idx
  on public.billy_payment_cards(organization_id,active,holder_label);

create table if not exists public.billy_payment_card_events(
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  card_id uuid not null,
  action text not null check(action in ('created','archived','deleted')),
  actor_id uuid references auth.users(id),
  event_at timestamptz not null default now()
);
create or replace function private.billy_card_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if not exists(select 1 from public.organization_memberships
      where organization_id=new.organization_id and user_id=new.created_by
        and role='owner') then
      raise exception 'Only a team owner can register payment cards';
    end if;
    if not new.active or new.archived_by is not null then
      raise exception 'New card must be active';
    end if;
    return new;
  end if;
  if old.active is distinct from true or new.active is distinct from false or
     new.id is distinct from old.id or
     new.organization_id is distinct from old.organization_id or
     new.last4 is distinct from old.last4 or
     new.holder_label is distinct from old.holder_label or
     new.display_currency is distinct from old.display_currency or
     new.program_label is distinct from old.program_label or
     new.created_by is distinct from old.created_by or
     new.created_at is distinct from old.created_at or
     new.archived_by is null or not exists(select 1 from public.organization_memberships
       where organization_id=new.organization_id and user_id=new.archived_by and role='owner')
  then raise exception 'Card metadata is immutable; owner may only archive'; end if;
  new.archived_at:=now();
  return new;
end $$;
drop trigger if exists billy_payment_card_guard on public.billy_payment_cards;
create trigger billy_payment_card_guard
  before insert or update on public.billy_payment_cards for each row
  execute function private.billy_card_guard();

create or replace function private.billy_card_event()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  insert into public.billy_payment_card_events(organization_id,card_id,action,actor_id)
  values(
    case when tg_op='DELETE' then old.organization_id else new.organization_id end,
    case when tg_op='DELETE' then old.id else new.id end,
    case when tg_op='DELETE' then 'deleted' when tg_op='INSERT' then 'created' else 'archived' end,
    case when tg_op='DELETE' then null when tg_op='INSERT' then new.created_by else new.archived_by end
  );
  return null;
end $$;
drop trigger if exists billy_payment_card_event on public.billy_payment_cards;
create trigger billy_payment_card_event after insert or update or delete
  on public.billy_payment_cards for each row execute function private.billy_card_event();

alter table public.billy_payment_cards enable row level security;
alter table public.billy_payment_card_events enable row level security;
revoke all on public.billy_payment_cards, public.billy_payment_card_events from anon, authenticated;
grant select,insert,update,delete on public.billy_payment_cards to service_role;
grant select,insert on public.billy_payment_card_events to service_role;
grant usage,select on sequence public.billy_payment_card_events_id_seq to service_role;
comment on table public.billy_payment_cards is
 'Only masked last-four digits and operator-visible labels. No full PAN, expiry, CVV or imported JetRead totals. Service role access only.';
