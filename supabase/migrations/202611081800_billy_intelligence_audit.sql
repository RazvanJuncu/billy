-- Billy Intelligence audit v1: keep count-only retrieval diagnostics per scan.
-- No document image or OCR text duplicated in audit JSON.
alter table public.document_records
  add column if not exists intelligence_audit jsonb not null default '{}'::jsonb;

create index if not exists billy_document_identical_source_idx
  on public.document_records
    (organization_id, created_by, source_sha256, document_type, state, created_at desc);

comment on column public.document_records.intelligence_audit is
  'Private per-extraction audit of identical file detection, categorized issue queries, memory retrieval and second-pass outcomes. Values and document images are excluded.';
