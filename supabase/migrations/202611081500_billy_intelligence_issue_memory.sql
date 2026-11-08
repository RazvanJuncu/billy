-- Billy Intelligence v3: cross-field/cross-document issue taxonomy.
-- No document images are archived; existing tenant RLS remains unchanged.
alter table public.billy_intelligence_examples
  add column if not exists issue_key text,
  add column if not exists issue_kind text,
  add column if not exists alternative_text text,
  add column if not exists source_script_type text;

alter table public.billy_intelligence_examples
  add constraint billy_intelligence_issue_kind_check
    check (issue_kind is null or issue_kind in ('glyph','quality')),
  add constraint billy_intelligence_issue_key_check
    check (issue_key is null or issue_key ~ '^(glyph:[0-9A-Z]/[0-9A-Z]|quality:(handwritten|printed|mixed|unknown))$'),
  add constraint billy_intelligence_alternative_length_check
    check (alternative_text is null or length(alternative_text)<=180),
  add constraint billy_intelligence_script_check
    check (source_script_type is null or source_script_type in ('handwritten','printed','mixed','unknown'));

create index if not exists billy_intelligence_issue_lookup_idx
  on public.billy_intelligence_examples(organization_id,issue_key,created_at desc)
  where issue_key is not null;

-- Backfill simple single-glyph corrections without reading or changing source records.
with single_diff as (
  select e.id, min(n) as pos
  from public.billy_intelligence_examples e
  cross join lateral generate_series(1,least(length(e.original_text),length(e.corrected_text))) as n
  where e.issue_key is null and e.feedback_type='corrected'
    and length(e.original_text)=length(e.corrected_text)
    and upper(substr(e.original_text,n,1))<>upper(substr(e.corrected_text,n,1))
  group by e.id
  having count(*)=1
)
update public.billy_intelligence_examples e
set issue_kind='glyph',
    issue_key='glyph:' ||
      least(upper(substr(e.original_text,d.pos,1)),upper(substr(e.corrected_text,d.pos,1))) || '/' ||
      greatest(upper(substr(e.original_text,d.pos,1)),upper(substr(e.corrected_text,d.pos,1)))
from single_diff d
where e.id=d.id
  and upper(substr(e.original_text,d.pos,1)) ~ '^[0-9A-Z]$'
  and upper(substr(e.corrected_text,d.pos,1)) ~ '^[0-9A-Z]$';

comment on column public.billy_intelligence_examples.issue_key is
 'Cross-field issue signature (e.g. glyph:0/9). Scoped by organization, not field type.';
