# Billy Intelligence v2 — Correction and Human Confirmation Memory

## Purpose
Billy Intelligence gives the existing AI engine **two kinds of explicitly shared,
verified feedback** without modifying the model weights:

1. **Corrected**: the initial AI reading and the operator-approved reading differ.
2. **Confirmed**: the AI proposed a nonempty reading, initial image-region evidence
   was uncertain (faint, ambiguous, unreadable, unassessed, or had a genuinely
   competing alternative), and the operator explicitly checked and approved
   **the same value**.

Simply approving an already-green field does not create a confirmation example.
An absent field does not create a positive reading example. Corrections and
confirmations are recorded as separate feedback types for audit.

## Opt-in workflow
1. AI engine extracts an Invoice or Fuel Release and returns image-region evidence.
2. Ramp Review highlights doubtful fields. Human corrections and explicit confirmations
   appear in blue; unresolved items still require recheck.
3. Operator can choose **Learn from my corrections and confirmations** (unchecked
   by default) before final approval.
4. Server compares the original stored extraction with the approved document.
   It validates confirmations against the original, initially uncertain
   and image-localized regions, and does not simply trust the green UI state.
5. Eligible text snippets are stored privately in
   `public.billy_intelligence_examples`. Each entry includes
   `feedback_type`, `initial_clarity`, source document ID, field path,
   original AI reading, approved reading, organization and operator.
6. Future scans retrieve up to eight distinct snippets from the same
   organization and document type, balancing corrected and confirmed examples.
   For line items/handwritten fields, the prompt generalizes indexed paths to
   e.g. `handwritten_entries[].transcription`.
7. The model treats examples as **untrusted context**, not current-document
   facts. It must read the current image independently and keep visual warnings
   when glyphs are actually difficult to read.

## What this is / is not
- **Active contextual learning:** previously confirmed values really are
  retrievable examples in the next AI prompt.
- **Not model training:** no Gemini weights are updated and no TrOCR training
  jobs are scheduled.
- **Not automatic certainty:** recurring matches do not force future yellow
  fields to green, because a fresh image may still be ambiguous.
- **Not a visual handwriting training set:** original scans are not archived
  by Intelligence. Text hints cannot teach the vision model new pixel-level
  representations. True visual training would need consented image crops with
  verified transcriptions, benchmarked separately.

## Privacy / safety
- Examples are explicitly opted in, organization-scoped, and server-authorized.
- RLS is on, with no direct `anon` or `authenticated` table grants.
- No source scans/PDFs or full invoice body are stored in the examples table.
- Personal IDs, tax IDs, customer names, invoice/release numbers, signers,
  flight numbers etc. are excluded from automatic lesson creation.
- Text examples may still be sensitive; obtain your organization's approval.
- Deleting a source record cascades to its associated Intelligence entries.
- Keep meter arithmetic and visual uncertainty warnings independently enforced.
- Add administrative example review/deletion, retention policy and opt-in
  governance before processing production company documents.

## Observability
- Extraction: `intelligence.examples_used`,
  `intelligence.corrections_used`, `intelligence.confirmations_used`.
- Approval: `intelligence.examples_saved`,
  `intelligence.corrections_saved`, `intelligence.confirmations_saved`.
- Approval statuses: `not_requested`, `no_eligible_corrections`,
  `saved`, `partially_saved`, `save_failed`.
- When Intelligence storage/retrieval is unavailable, normal extraction and
  approval continue; failures are reported instead of pretending learning succeeded.

## Validation / roadmap
Compare extraction accuracy and warning precision on a held-out collection of
same-type documents before/after memory is introduced. Track particularly
false-green rates and whether confirmed values become correct on new forms.
A later Billy Intelligence version could add consented image-region training,
form-template retrieval, quality scores, and team-admin controls.
