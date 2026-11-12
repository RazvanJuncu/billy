-- Nested physical attachments are independent review records linked to a reviewed parent.
-- A child can be linked only to a parent owned by the same organization/account
-- (enforced by the authenticated Vision Edge Function).
alter table public.document_records
  add column if not exists parent_document_id uuid references public.document_records(id) on delete restrict,
  add column if not exists relationship_type text;
alter table public.document_records
  add constraint nested_record_not_self_parent
    check (parent_document_id is null or parent_document_id <> id),
  add constraint nested_record_relationship_consistency
    check ((parent_document_id is null and relationship_type is null)
      or (parent_document_id is not null and relationship_type='attached_document'));
create index if not exists document_records_parent_document_id_idx
  on public.document_records(parent_document_id) where parent_document_id is not null;
comment on column public.document_records.parent_document_id is
  'A separate, independently extracted and approved physical child paper. Parent belongs to the same team and owner.';
comment on column public.document_records.relationship_type is
  'Physical attachment only; does not imply a financial match or duplicate expense.';
