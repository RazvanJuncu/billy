-- Financial Operations P1: operator-verified financial overrides with append-only audit.
-- Original reviewed_data and normalized OCR findings are never overwritten.
create table if not exists public.billy_financial_review_events(
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null,
  actor_id uuid not null references auth.users(id),
  before_values jsonb not null default '{}'::jsonb,
  after_values jsonb not null default '{}'::jsonb,
  updated_fields text[] not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id,document_id)
    references public.document_records(organization_id,id) on delete cascade
);
create index if not exists billy_financial_review_events_by_document
  on public.billy_financial_review_events(organization_id,document_id,created_at desc);
alter table public.billy_financial_review_events enable row level security;
revoke all on public.billy_financial_review_events from anon,authenticated;
grant select,insert on public.billy_financial_review_events to service_role;
grant usage,select on sequence public.billy_financial_review_events_id_seq to service_role;

create or replace function public.billy_apply_financial_review(
  p_org uuid,p_actor uuid,p_record uuid,p_values jsonb
) returns jsonb
language plpgsql security invoker set search_path=''
as $$
declare
  v_document public.document_records%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_meta jsonb;
  v_field text;
  v_val jsonb;
  v_total numeric;
  v_curr text;
  v_date text;
begin
  if p_values is null or jsonb_typeof(p_values)<>'object' or
     (select count(*) from jsonb_object_keys(p_values)) not between 1 and 3 then
    raise exception 'Financial review needs one to three fields';
  end if;
  if exists(select 1 from jsonb_object_keys(p_values) name where
    name not in ('grand_total','currency','issue_date')) then
    raise exception 'Unsupported financial review field';
  end if;
  if not exists(select 1 from public.organization_memberships m
    where m.organization_id=p_org and m.user_id=p_actor) then
    raise exception 'Financial reviewer must belong to the team';
  end if;
  select * into v_document from public.document_records d
    where d.id=p_record and d.organization_id=p_org and d.created_by=p_actor
      and d.state='approved' and d.parent_document_id is null
    for update;
  if v_document.id is null then
    raise exception 'Only the approved document owner can review financial fields';
  end if;
  if (v_document.review_metadata #>> '{classification,profile}') in
    ('fuel_release','payment_slip','supplier_statement','generic_document') then
    raise exception 'Only expense documents support financial review';
  end if;
  if exists(select 1 from public.billy_financial_links l
    where l.organization_id=p_org and l.expense_document_id=p_record
      and l.state='active') then
    raise exception 'Unlink the active payment before editing financial values';
  end if;
  v_before:=coalesce(v_document.review_metadata->'financial_overrides','{}'::jsonb);
  v_after:=v_before;
  for v_field in select jsonb_object_keys(p_values) loop
    v_val:=p_values->v_field;
    if v_field='grand_total' then
      if jsonb_typeof(v_val)<>'number' then
        raise exception 'Amount must be numeric';
      end if;
      v_total:=(p_values->>v_field)::numeric;
      if v_total<0 or v_total>10000000000 or round(v_total,2)<>v_total then
        raise exception 'Amount must be a nonnegative two-decimal value';
      end if;
    elsif v_field='currency' then
      if jsonb_typeof(v_val)<>'string' then
        raise exception 'Currency must be a string';
      end if;
      v_curr:=p_values->>v_field;
      if v_curr !~ '^[A-Z]{3}$' then
        raise exception 'Invalid ISO currency format';
      end if;
    elsif v_field='issue_date' then
      if jsonb_typeof(v_val)<>'string' then
        raise exception 'Document date must be a string';
      end if;
      v_date:=p_values->>v_field;
      if v_date !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or
         to_char(to_date(v_date,'YYYY-MM-DD'),'YYYY-MM-DD')<>v_date then
        raise exception 'Document date must be a valid ISO calendar date';
      end if;
    end if;
    v_after:=jsonb_set(v_after,array[v_field],v_val,true);
  end loop;
  if v_after=v_before then
    return jsonb_build_object('saved',true,'unchanged',true,'record_id',p_record);
  end if;
  v_meta:=jsonb_set(coalesce(v_document.review_metadata,'{}'::jsonb),
    '{financial_overrides}',v_after,true);
  update public.document_records set review_metadata=v_meta
    where id=p_record and organization_id=p_org;
  insert into public.billy_financial_review_events(
    organization_id,document_id,actor_id,before_values,after_values,updated_fields
  ) values(p_org,p_record,p_actor,v_before,v_after,
    array(select jsonb_object_keys(p_values)));
  return jsonb_build_object('saved',true,'record_id',p_record,
    'financial_overrides',v_after);
end $$;
revoke all on function public.billy_apply_financial_review(uuid,uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.billy_apply_financial_review(uuid,uuid,uuid,jsonb)
 to service_role;
comment on function public.billy_apply_financial_review(uuid,uuid,uuid,jsonb) is
  'Authenticated edge-only, actor-authorized, audited correction of approved financial attributes. Never edits original OCR values.';
