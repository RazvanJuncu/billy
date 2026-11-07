# Billy Intelligence v1 — Team Correction Memory

## Purpose
Billy Intelligence helps the existing Gemini extractor learn **from explicitly shared
human corrections**, without fine-tuning Gemini or silently copying prior documents.

## Current workflow
1. Gemini extracts an Invoice or Fuel Release using the visible document.
2. The operator reviews, corrects, rechecks, and approves the document.
3. On Ramp Review, **Learn from my corrections** is **unchecked by default**.
4. When the operator explicitly opts in and approves, the server compares the
   immutable original Gemini fields with the final approved fields.
5. Eligible **changed, non-empty text pairs** are saved in
   `public.billy_intelligence_examples` for the same organization.
6. On subsequent documents of the same type, the server retrieves up to six
   recent, varied examples. They become **untrusted few-shot hints** in the
   Gemini extraction prompt. The current document image remains the source of truth.

Billy Intelligence does **not** modify Gemini model weights, train TrOCR,
archive images, or automatically improve every field. Improvements in accuracy
must be established by benchmark tests, not assumed.

## Privacy and security
- Examples are shared **only within the same Billy organization**.
- Server-side membership checks remain mandatory.
- The examples table has RLS enabled, no read/write access for `anon` or
  `authenticated`; only the authenticated server's service role can use it.
- No original PDFs, images, complete invoice bodies, or signatures are stored
  in the Intelligence examples table.
- Some corrected text can still be operational or personally sensitive.
  Obtain your company's authorization before opting in.
- No examples are created from an unmodified/merely confirmed field.
- Unique invoice and release numbers, tax IDs, customer names, flight numbers,
  fueler and receiver names are excluded from automatic lesson creation.
- Absent `null` fields are not saved as training text; their operator
  confirmation remains in `document_records.review_metadata`.
- Use a maximum of six compact examples per Gemini request, selected from
  the same organization **and document type**.

## Observability
- Extraction response: `intelligence.examples_used`.
- Approval response: `intelligence.status` and `examples_saved`.
- Statuses include `not_requested`, `no_eligible_corrections`,
  `saved`, `partially_saved`, and `save_failed`.
- If Intelligence retrieval is temporarily unavailable, regular processing
  continues without hints. If saving lessons fails, normal approval remains
  valid and the error is surfaced honestly.

## Current limitations / next iterations
- Similarity matching is limited to the document type and compact field
  corrections. There is no embedding index, handwriting image training,
  or template-specific similarity score yet.
- Lessons are read as text hints, **not** a verified OCR confidence score.
- Before production use, add organization-admin controls to review and delete
  examples, a configurable retention policy, explicit company privacy approval,
  and benchmark comparisons against a held-out dataset.
- Keep existing meter arithmetic and visual uncertainty checks mandatory.
