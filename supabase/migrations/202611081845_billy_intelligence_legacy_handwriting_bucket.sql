-- Historical versions normalized handwritten row indices to [].
-- Mark these corrected text-only examples as broad handwriting context.
-- Do not attribute a particular glyph confusion without evidence.
update public.billy_intelligence_examples
set issue_key='quality:handwritten',issue_kind='quality',
    source_script_type='handwritten'
where issue_key is null and feedback_type='corrected'
  and field_path='handwritten_entries[].transcription';
