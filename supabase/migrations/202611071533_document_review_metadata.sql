-- Operator audit decisions are separate from AI-extracted and approved document fields.
-- Additive migration: does not modify historical approved document values.
alter table public.document_records
  add column if not exists review_metadata jsonb not null default '{}'::jsonb;
comment on column public.document_records.review_metadata is
  'Structured operator review audit (for example, source fields confirmed absent). No AI certainty is implied.';
