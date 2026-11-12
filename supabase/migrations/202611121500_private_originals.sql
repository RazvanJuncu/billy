-- Private originals are archived only after a successful operator approval.
-- Backend-only uploads/downloads through authenticated billy-vision routes.
-- No browser storage.objects policies: service role is server-side only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('billy-originals','billy-originals',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

alter table public.document_records
  add column if not exists original_storage_key text,
  add column if not exists original_mime text,
  add column if not exists original_bytes integer,
  add column if not exists original_saved_at timestamptz;

alter table public.document_records
  add constraint document_original_metadata_consistency
  check (
    (original_storage_key is null and original_mime is null
       and original_bytes is null and original_saved_at is null)
    or
    (original_storage_key is not null and original_mime is not null
       and original_bytes is not null and original_saved_at is not null)
  ),
  add constraint document_original_mime_valid
    check (original_mime is null or original_mime in
      ('application/pdf','image/jpeg','image/png','image/webp')),
  add constraint document_original_size_valid
    check (original_bytes is null or original_bytes between 1 and 10485760),
  add constraint document_original_path_valid
    check (original_storage_key is null or
      original_storage_key ~ (
        '^' || organization_id::text || '/' || id::text ||
        '/original\.(pdf|jpg|png|webp)$'
      ));

create unique index if not exists document_records_original_storage_key_unique
  on public.document_records(original_storage_key)
  where original_storage_key is not null;

comment on column public.document_records.original_storage_key is
  'Private, server-owned Storage object path; no public URL and no client write permission.';
comment on column public.document_records.original_mime is
  'Validated original PDF/image MIME, linked only when file SHA-256 matches extraction.';
