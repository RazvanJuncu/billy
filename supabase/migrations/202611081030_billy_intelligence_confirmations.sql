-- Billy Intelligence v2: human-confirmed uncertain readings are learning evidence too.
-- Existing corrections retain their original provenance.
alter table public.billy_intelligence_examples
  add column if not exists feedback_type text not null default 'corrected',
  add column if not exists initial_clarity text;
alter table public.billy_intelligence_examples
  drop constraint if exists billy_intelligence_changed;
alter table public.billy_intelligence_examples
  add constraint billy_intelligence_feedback_type
  check (feedback_type in ('corrected','confirmed'));
alter table public.billy_intelligence_examples
  add constraint billy_intelligence_value_consistency
  check (
    (feedback_type='corrected' and original_text<>corrected_text) or
    (feedback_type='confirmed' and original_text=corrected_text)
  );
alter table public.billy_intelligence_examples
  add constraint billy_intelligence_initial_clarity_check
  check (initial_clarity is null or initial_clarity in
    ('clear','slight_uncertainty','ambiguous','unreadable','unassessed'));
comment on table public.billy_intelligence_examples is
 'Opt-in, organization-scoped text-only learning feedback: operator corrections and explicitly confirmed previously uncertain readings. Not model fine-tuning or proof of OCR certainty.';
