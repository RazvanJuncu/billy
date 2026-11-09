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

## Approved target rule: Gemini-first, handwriting-only on-demand verification (2026-11-09)

**Product decision / implementation specification — NOT yet active in production.**

**Principle:** Gemini stays the primary document-intelligence engine and performs its current full-document extraction, interpretation, field mapping, validation and structured JSON output **unchanged**. Billy Intelligence is a specialist second opinion for *handwritten text only*, triggered **after Gemini identifies visually uncertain handwriting**. It is not a replacement for Gemini and it does not interpret printed fields.

1. Gemini first returns the entire document and each evidenced region with `field_path`, `script_type`, `visual_clarity`, `transcription`, `page`, and `box_2d`, as currently supported.
2. **Skip the Billy Intelligence call** for `script_type=printed`, or when the handwritten region is `visual_clarity=clear` with no competing reading or other concern. No second OCR pass is required for clear handwriting.
3. **Invoke Billy Intelligence only on an uncertain handwritten crop:** `script_type=handwritten` (or confirmed handwritten part of `mixed`) and `visual_clarity=slight_uncertainty | ambiguous | unreadable`. The engine independently reads the **original image crop**, without being primed with Gemini's proposed answer. Missing/corrupt region coordinates mean no ungrounded comparison; send to review instead.
4. Normalize harmless formatting differences in a **field-aware** manner for comparison (e.g. space or case), but **never normalize away meaningful decimal points, digits, minus signs, units or identifying characters**. Compare the handwriting transcription with Gemini's transcription for the **same region / field**, not unrelated extracted values.
5. **Match:** The two OCR readings agree. The handwriting-related *soft uncertainty* can be cleared to green **only** where the crop is genuinely readable and **no other warnings, missing-evidence flags, high-risk validation failures or hard review gates are present**. A match is *corroboration*, not proof or a calibrated 100% certainty. `unreadable` remains manual review even on agreement.
6. **Mismatch, missing/unavailable Billy result, unclear crop, or failed localization:** Keep the applicable handwritten field yellow/review-required (or retain red if already critical); never substitute Billy's reading silently for Gemini's value.
7. All **printed fields and other document interpretation** keep the existing Gemini + Confidence Engine behavior. Independent arithmetic, translation, source-evidence, and operator-review requirements are **not overridden** by OCR agreement.
8. Retain bounded per-region provenance for audit: field path, region id/crop reference, Gemini reading, Billy reading, model/version, match/mismatch/unavailable, original risk status, final risk status and trigger reason. Store sensitive crops only with company-authorized retention and access controls.

**Acceptance tests:** clear handwriting does not invoke Billy; uncertain handwriting does; printed text never invokes Billy; agreement can clear a *soft* handwriting flag but not a critical error; disagreement stays yellow; unchanged Gemini extraction; unavailable Billy leaves Gemini values unchanged; mixed/unknown script and bad boxes never cause false-green.

**Why:** Gemini generally has broader contextual document understanding, while a separately trained Billy Intelligence recognizer may become stronger on the narrow task of reading handwriting. Invoke the specialist only when needed to reduce cost, latency, and needless review without bypassing safeguards.

### Approved extension: Gemini visual adjudication on OCR disagreement (2026-11-09)

**Target design decision; not deployed.** If Gemini initially marks a *handwritten* region uncertain and Billy Intelligence returns a **different** transcription, initiate one bounded, conditional **Gemini Visual Recheck**. This does not apply to printed fields or handwriting Gemini originally marked clear.

- Provide Gemini with the **original image crop** (and source page as needed), the original reading, Billy's alternative, field context, and a strict request for *fresh visual analysis*. Do **not** ask which model should be trusted or tell it that Billy is correct.
- Require Gemini to explicitly evaluate visible character evidence, identify distinguishing features supporting its conclusion, and return a structured verdict: `supports_original`, `supports_billy`, or `unclear` (with `visually_clear` and a short evidence-based rationale). Accept `supports_billy` as **visually corroborated** only when source evidence clearly supports the revised text; merely changing its mind or repeating Billy's text is not independent verification.
- **Conditional green** is *eligible* only for a noncritical handwritten field when the recheck clearly supports Billy's reading, the corresponding structured field is deliberately reconciled (not silently overwritten), the source location is sound, and all existing Confidence Engine validations pass. Persist both readings, the recheck decision, visual rationale and field-resolution audit. Gemini's second pass is not statistically independent from its first pass, so this status is a workflow judgement, **not 100% certainty**.
- If Gemini supports its own earlier reading but uncertainty is not genuinely resolved, or the recheck is ambiguous, fails, or conflicts with any validation, keep **yellow** (or existing **red**, if critical). Do not downgrade hard errors. For high-risk values (including fuel quantities, meter readings, registrations when flagged, and other operationally significant figures), **retain manual review whenever image evidence remains ambiguous**, regardless of apparent model agreement.
- Rate-limit and timeout rechecks; failures do not block the normal Gemini extraction or promote fields to green. Only explicitly eligible uncertain handwriting invokes either specialist OCR or visual recheck.

**Required tests:** mismatch+clear grounded recheck on a low-risk field can become green after reconciliation; unsupported Gemini agreement remains yellow; ambiguous fuel quantity never becomes green; unchanged printed/clear handwriting paths; recheck service failure leaves initial Gemini field intact and review-required; audit captures the original, Billy and adjudicated readings.

**Rollout note:** The currently hosted Supabase Edge Function is Gemini-only, and the earlier local optional second-opinion implementation uses TrOCR. Connecting a validated Billy Intelligence Lab model and implementing the status rules above are future work; documenting this decision does not deploy them.
