# Billy Confidence Engine v1

**Status:** active, rule-based field triage. This is **not** a trained ML model,
a probability estimate or a duplicate-document memory system.

## Objective

Reduce needless yellow fields *without* increasing missed transcription errors.
An initial **green** means *no reason for manual attention was flagged*, not
that the field is proven correct. A **blue** field was checked by the operator.

## Current behavior

- A positive fuel meter check (`meter_finish - meter_start == delivered_quantity`)
  is retained in the extraction warnings as contextual information, but does
  not by itself turn three otherwise clear fields yellow. The check does not
  establish OCR accuracy.
- High-risk fields missing localized source evidence remain yellow.
- Missing important values remain red; other missing fields remain yellow.
- Ambiguous/unreadable source regions, competing handwritten digits, failed
  arithmetic, invalid or missing quantities, and translation concerns keep
  their existing manual-review gates.
- Original source crop viewing, operator edits, manual confirmations,
  image-bound Recheck and approval requirements are unchanged.
- No local TrOCR or other second OCR engine is loaded.

## Field decision audit

On approval, the browser includes the following metadata only:

```json
{
  "version": "1.0",
  "field_reviews": [
    {
      "field_path": "meter_start",
      "initial_level": "yellow",
      "initial_signal": "source_slight_uncertainty",
      "final_level": "blue",
      "action": "confirmed"
    }
  ]
}
```

The Supabase Edge Function allowlists path names, levels, signals and actions,
drops unknown keys, and stores the audit under
`document_records.review_metadata.confidence_engine`. No OCR strings,
document photographs, image crops or standalone training examples are added.
An invalid audit is ignored rather than blocking a valid approval.

`source: "client_observed"` explicitly means these are *client-submitted*
decision traces, **not authoritative correctness labels**.

## Evaluation guardrails

Track rates by *initial* level and field type: confirmed yellow, corrected
yellow, corrected green, and how many fields required a second review.
Do not divide the total number of unedited fields by approvals and call the
result accuracy: users do not individually verify every green field.

Promote additional yellow-to-green rules only after reviewing a separate,
representative set of documents, particularly handwritten numbers, dates,
registration strings, and other high-risk fields. Keep a holdout of new
documents instead of reusing the same scans.

## Historical baseline limitations (November 8, 2026)

Eight approved records (seven fuel releases, one invoice) predate v1
instrumentation. A read-only count found 80 extracted top-level scalar fields
and one difference in reviewed top-level scalars, plus 17 explicitly recorded
manual confirmations. These figures **cannot estimate** the error rate:
there may be repeated documents, unverified greens and corrections in nested
rows. New confidence-engine traces are collected only on future approvals.
