-- Preserve source-language text and optional English translations separately.
-- Original scanned files are not archived. Metadata is scoped to its owner record
-- through existing document_records RLS and the authenticated Billy Edge Function.
alter table public.document_records
  add column if not exists translation_metadata jsonb not null default '{}'::jsonb;

comment on column public.document_records.translation_metadata is
 'Detected source language, English translation status and source->English text pairs for selected descriptive fields. No original document image.';
