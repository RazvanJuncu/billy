-- Billy Accounts v0.6 — Supabase Auth + Postgres/RLS.
-- Apply in Supabase SQL Editor AFTER creating a separate Billy project.
-- Does not create any users or organizations by itself.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now(),
  check (length(display_name) <= 120)
);
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('owner','reviewer','operator')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create index if not exists memberships_user_idx on public.organization_memberships(user_id);
create table if not exists public.organization_join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(organization_id,user_id)
);
create index if not exists join_requests_org_status_idx on public.organization_join_requests(organization_id,status);
-- Future server-owned document ledger. No browser write permissions for now.
create table if not exists public.document_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  document_type text not null check (document_type in ('invoice','fuel_release')),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  state text not null default 'extracted' check(state in ('extracted','reviewed','approved')),
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
create index if not exists document_records_org_idx on public.document_records(organization_id,created_at desc);

create or replace function private.is_member(org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.organization_memberships
  where organization_id=org and user_id=(select auth.uid())); $$;
create or replace function private.is_owner(org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.organization_memberships
  where organization_id=org and user_id=(select auth.uid()) and role='owner'); $$;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.is_owner(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;

-- Own workspace creator becomes its sole owner atomically.
create or replace function private.assign_initial_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.organization_memberships(organization_id,user_id,role)
  values(new.id,new.created_by,'owner');
  return new;
end $$;
drop trigger if exists billy_initial_owner on public.organizations;
create trigger billy_initial_owner after insert on public.organizations
for each row execute function private.assign_initial_owner();

create or replace function private.create_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.account_profiles(user_id,display_name,email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''),120),coalesce(new.email,''))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists billy_user_signup on auth.users;
create trigger billy_user_signup after insert on auth.users
for each row execute function private.create_profile();

alter table public.account_profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.organization_join_requests enable row level security;
alter table public.document_records enable row level security;

revoke all on public.account_profiles, public.organizations,
  public.organization_memberships, public.organization_join_requests,
  public.document_records from anon, authenticated;
grant select, update(display_name) on public.account_profiles to authenticated;
grant select, insert, update(name) on public.organizations to authenticated;
grant select, insert, delete on public.organization_memberships to authenticated;
grant select, insert, update(status,reviewed_at) on public.organization_join_requests to authenticated;
grant select on public.document_records to authenticated;

create policy profile_own_select on public.account_profiles
for select to authenticated using (
  user_id=(select auth.uid()) or exists(
    select 1 from public.organization_join_requests q
    where q.user_id=account_profiles.user_id
      and (select private.is_owner(q.organization_id))
  )
);
create policy profile_own_update on public.account_profiles
for update to authenticated using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

create policy org_member_read on public.organizations
for select to authenticated using ((select private.is_member(id)));
create policy org_create_self on public.organizations
for insert to authenticated with check (created_by=(select auth.uid()));
create policy org_owner_name_update on public.organizations
for update to authenticated using ((select private.is_owner(id)))
with check ((select private.is_owner(id)));

create policy membership_read on public.organization_memberships
for select to authenticated using ((select private.is_member(organization_id)));
create policy membership_owner_add_requested on public.organization_memberships
for insert to authenticated with check (
  (select private.is_owner(organization_id))
  and role in ('operator','reviewer')
  and exists (select 1 from public.organization_join_requests q
    where q.organization_id=organization_memberships.organization_id and q.user_id=organization_memberships.user_id and q.status='pending')
);
create policy membership_owner_remove on public.organization_memberships
for delete to authenticated using ((select private.is_owner(organization_id)) and role <> 'owner');

create policy request_own_or_owner_read on public.organization_join_requests
for select to authenticated using (user_id=(select auth.uid()) or (select private.is_owner(organization_id)));
-- Organization UUID is shared by an owner. It is NOT a secret; joining always requires approval.
create policy request_self_insert on public.organization_join_requests
for insert to authenticated with check (user_id=(select auth.uid()) and status='pending' and reviewed_at is null);
create policy request_owner_update on public.organization_join_requests
for update to authenticated using ((select private.is_owner(organization_id)))
with check ((select private.is_owner(organization_id)));

create policy records_member_read on public.document_records
for select to authenticated using ((select private.is_member(organization_id)));

comment on table public.document_records is 'Server-owned future ledger; no client inserts or updates until an authenticated backend is deployed.';
comment on table public.organization_join_requests is 'Joining an organization always needs an owner approval and grants no access by itself.';
