# Billy Intelligence v3 — Cross-Field Issue Memory

Billy Intelligence uses **verified opt-in operator feedback**. It does not modify
AI model weights, archive whole documents, or certify uncertain OCR as correct.

## What's new in v3

Previous versions matched memory mostly by document type and field path. V3
identifies **issues**, independent of source field:
- `glyph:0/9`, `glyph:1/7`, `glyph:3/8`, `glyph:0/O`, etc.
- `quality:handwritten`, `quality:printed`, `quality:mixed` or
  `quality:unknown` when the scan is visually ambiguous without a clean
  two-candidate glyph mismatch.

For example, if a confirmed Fuel Release meter had a `0/9` confusion, that
example can be retrieved when an *Invoice* total has the same `0/9`
ambiguity. **No provider_name, meter_start or document_type filter is applied
to the issue lookup.** Organization membership is always enforced.

## Actual processing flow

1. **First pass:** the AI engine extracts the new document **without historical
   examples**, returning values, localized regions and potential alternatives.
2. **Issue detector:** the server derives a bounded, deterministic issue key
   from an extracted value and its proposed alternatives; at most four issue
   queries per document. A clear scan triggers zero issue lookups.
3. **Tenant-scoped lookup:** an indexed Supabase query filters by
   `organization_id` and `issue_key`, never another team's data. The
   returned prompt context is capped at five verified text examples.
4. **Second visual inspection (conditional):** *only if memory matches*, Billy
   calls the AI engine once more, with the current document image and a
   small set of historical same-issue snippets. This pass can report another
   possible reading or uncertainty.
5. **Operator review:** The second pass **does not overwrite** the initial
   extraction, change a value to green or remove an uncertainty warning.
   It may add an alternative and a visible warning for operator review.
6. **Approval and learning:** With the opt-in checkbox checked, Billy stores
   `corrected` pairs and eligible `confirmed` uncertain readings, tagged
   with `issue_key`, `issue_kind`, optional alternative and script type.

## Privacy, costs and limits

- Learning remains **opt-in per approved document**.
- The table uses RLS and has **no direct `anon` or `authenticated` access**.
  Only the authenticated Edge Function service role queries examples.
- Example lookup is **cross-field and cross-document-type within one organization**.
- Excluded sensitive field types remain excluded from automatic lesson creation.
  Examples can still contain operationally sensitive text; gain company approval.
- Up to four bounded SQL queries and **one additional model call** may occur
  per document with ambiguous evidence and applicable memory.
- Backend returns `intelligence.mode=issue_on_demand`,
  `lookup_status`, `issue_keys`, `examples_used` and safe second-pass
  assessments for testing/audit.
- Failure of issue lookup or review does not prevent ordinary extraction.
  In such cases, `lookup_status=unavailable` and original uncertainty remains.

## Important limitation: no archived visual examples yet

V3 is a **visual-issue classifier with text memory and an on-demand visual
second pass**. It is not yet a visual *image-to-image* retrieval system. Billy
does **not** retain handwriting crops or compare glyph pixels from previous
documents. Doing so would require consented cropped assets, company-approved
retention/deletion controls, access auditing and a visual similarity index.

Because retrieved snippets are untrusted data, Gemini is instructed to treat
them as examples rather than commands, to read the *current* document
independently and not to copy prior totals, registrations or other values.

## Next validation steps

- Benchmark `0/9`, `1/7`, `3/8`, `O/0` false-positive/false-green rates on
  untouched documents versus v2.
- Verify latency and token costs of conditional second-pass calls.
- Test actual live AI responses and a long, mixed document history.
- Before production use, add organization-admin memory review/deletion,
  retention settings, and explicit company policy for any future visual crops.
