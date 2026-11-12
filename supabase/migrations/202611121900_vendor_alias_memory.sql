-- Vendor memory v1: exact operator-confirmed aliases per organization.
-- Run before deploying the matching Edge Function. All writes are backend-only.
create table if not exists public.billy_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  name_key text not null check (length(name_key) between 2 and 160),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, name_key),
  unique (organization_id, id)
);
create table if not exists public.billy_vendor_aliases (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alias_key text not null check (length(alias_key) between 2 and 160),
  vendor_id uuid not null,
  source_text text not null check (length(trim(source_text)) between 2 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, alias_key),
  foreign key (organization_id, vendor_id)
    references public.billy_vendors(organization_id, id) on delete cascade
);
create index if not exists billy_vendor_aliases_vendor_idx
  on public.billy_vendor_aliases(organization_id, vendor_id);
alter table public.billy_vendors enable row level security;
alter table public.billy_vendor_aliases enable row level security;
-- Client cannot alter company dictionaries. All operations go through an
-- authenticated Edge Function with verified organization membership.
revoke all on public.billy_vendors, public.billy_vendor_aliases from anon, authenticated;
grant select, insert, update, delete on public.billy_vendors, public.billy_vendor_aliases to service_role;

-- Commit vendor creation, alias learning and document organization together.
-- The Edge Function validates each field and authenticates the operator first.
create or replace function public.billy_organize_with_vendor(
  p_org uuid,
  p_actor uuid,
  p_record uuid,
  p_fields jsonb,
  p_vendor_id uuid,
  p_new_name text,
  p_new_key text,
  p_source_alias text,
  p_source_key text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  r public.document_records%rowtype;
  v_id uuid;
  v_name text;
  v_alias_owner uuid;
  v_overrides jsonb;
  v_metadata jsonb;
  v_key text;
  v_read text;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_org and user_id = p_actor
  ) then
    raise exception 'Organization membership required';
  end if;
  select * into r from public.document_records
   where id = p_record and organization_id = p_org and created_by = p_actor
     and state = 'approved' and parent_document_id is null
   for update;
  if not found then
    raise exception 'Approved parent document not owned by operator';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception 'Invalid organization fields';
  end if;
  for v_key in select jsonb_object_keys(p_fields) loop
    if v_key not in ('aircraft','airport','service') or
       jsonb_typeof(p_fields->v_key) <> 'string' then
      raise exception 'Invalid organization field';
    end if;
  end loop;
  if (p_vendor_id is null) = (p_new_name is null) then
    raise exception 'Select one existing or new vendor';
  end if;
  if p_vendor_id is not null then
    select display_name into v_name from public.billy_vendors
      where organization_id = p_org and id = p_vendor_id;
    if not found then raise exception 'Vendor not in this team'; end if;
    v_id := p_vendor_id;
  else
    if p_new_key is null or length(p_new_key) not between 2 and 160 or
       p_new_name is null or length(trim(p_new_name)) not between 2 and 120 then
      raise exception 'Invalid new vendor';
    end if;
    insert into public.billy_vendors(organization_id,display_name,name_key,created_by)
      values(p_org,p_new_name,p_new_key,p_actor)
      on conflict (organization_id,name_key) do nothing
      returning id,display_name into v_id,v_name;
    if v_id is null then
      select id,display_name into v_id,v_name from public.billy_vendors
        where organization_id=p_org and name_key=p_new_key;
    end if;
  end if;
  -- Prevent forged source names from creating arbitrary aliases. No AI text
  -- is overwritten; the alias points back to the originally approved reading.
  v_read := coalesce(
    nullif(btrim(r.reviewed_data->>'supplier_name'),''),
    nullif(btrim(r.reviewed_data->>'property_name'),''),
    nullif(btrim(r.reviewed_data->>'operator_name'),''),
    nullif(btrim(r.extracted_data->>'supplier_name'),''),
    nullif(btrim(r.extracted_data->>'property_name'),''),
    nullif(btrim(r.extracted_data->>'operator_name'),'')
  );
  if p_source_key is not null then
    if v_read is null or p_source_alias is distinct from v_read or
       length(p_source_key) not between 2 and 160 then
      raise exception 'Alias does not match the approved source';
    end if;
    insert into public.billy_vendor_aliases
      (organization_id,alias_key,vendor_id,source_text,created_by)
      values(p_org,p_source_key,v_id,p_source_alias,p_actor)
      on conflict (organization_id,alias_key) do nothing;
    select vendor_id into v_alias_owner from public.billy_vendor_aliases
      where organization_id=p_org and alias_key=p_source_key;
    if v_alias_owner is distinct from v_id then
      raise exception 'Alias already belongs to a different vendor';
    end if;
  end if;
  v_overrides := coalesce(r.review_metadata->'organization_overrides','{}'::jsonb)
    || p_fields || jsonb_build_object('vendor',v_name,'vendor_id',v_id);
  v_metadata := coalesce(r.review_metadata,'{}'::jsonb)
    || jsonb_build_object(
      'organization_overrides',v_overrides,
      'organization_audit',jsonb_build_object(
        'verified_by',p_actor,'verified_at',now(),
        'source','operator_verified',
        'fields',(select coalesce(jsonb_agg(f.key),'[]'::jsonb)
          from jsonb_object_keys(v_overrides) as f(key) where f.key <> 'vendor_id')
      )
    );
  update public.document_records
    set review_metadata=v_metadata
    where id=p_record and organization_id=p_org and created_by=p_actor;
  return jsonb_build_object('organization_overrides',v_overrides,'vendor_id',v_id);
end $$;
revoke all on function public.billy_organize_with_vendor(
  uuid,uuid,uuid,jsonb,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.billy_organize_with_vendor(
  uuid,uuid,uuid,jsonb,uuid,text,text,text,text) to service_role;

comment on table public.billy_vendor_aliases is
  'Exact OCR aliases, confirmed by an operator; never AI-guessed. Organization scoped.';
