-- Non-destructive backfill for existing consented textual lessons.
-- Do NOT infer a glyph pair without a one-character correction. These are
-- general handwriting quality examples only, not evidence that the model trained.
with eligible as (
  select e.id,
    case
      when e.field_path ~ '^handwritten_entries\\[\\]\\.transcription$' then 'handwritten'
      when region.r is not null and region.r->>'visual_clarity' in
        ('slight_uncertainty','ambiguous','unreadable','unassessed')
        then case when region.r->>'script_type' in ('handwritten','printed','mixed','unknown')
          then region.r->>'script_type' else 'unknown' end
      else null
    end as script
  from public.billy_intelligence_examples e
  join public.document_records d on d.id=e.source_record_id
  left join lateral (
    select r from jsonb_array_elements(coalesce(d.regions_data,'[]'::jsonb)) as r
    where r->>'field_path'=e.field_path limit 1
  ) region on true
  where e.issue_key is null and e.feedback_type='corrected'
)
update public.billy_intelligence_examples e
set issue_key='quality:'||eligible.script,
    issue_kind='quality',
    source_script_type=eligible.script
from eligible
where e.id=eligible.id and eligible.script is not null;
