-- Billy Intelligence v1: opt-in, text-only, team-isolated correction examples.
-- No source image, document body or secrets are archived here.
create table if not exists public.billy_intelligence_examples (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_record_id uuid not null references public.document_records(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  document_type text not null check (document_type in ('invoice','fuel_release')),
  field_path text not null check (length(field_path) between 1 and 90),
  field_label text check (field_label is null or length(field_label) <= 120),
  original_text text not null check (length(original_text) between 1 and 180),
  corrected_text text not null check (length(corrected_text) between 1 and 180),
  created_at timestamptz not null default now(),
  constraint billy_intelligence_changed check (original_text <> corrected_text),
  constraint billy_intelligence_unique_source_field unique (source_record_id,field_path)
);
create index if not exists billy_intelligence_lookup_idx
  on public.billy_intelligence_examples (organization_id,document_type,created_at desc);
alter table public.billy_intelligence_examples enable row level security;
-- Only Billy's authenticated Edge Function service role may access examples.
-- No direct browser reads, updates or inserts are permitted.
revoke all on public.billy_intelligence_examples from public, anon, authenticated;
comment on table public.billy_intelligence_examples is
 'Opt-in, organization-scoped confirmed text corrections for few-shot retrieval. No image archive, no model fine-tuning.';
