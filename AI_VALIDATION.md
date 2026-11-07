# Billy Vision — preliminary evaluation protocol

This is an engineering validation plan, **not evidence of a trained or calibrated model**.

## What already exists

- `billy/vision.py` calls a server-side Gemini multimodal model using a schema for invoices or handwritten Fuel Releases.
- The default is `gemini-3.8-flash`, which supports image and PDF inputs as well as structured outputs (Google's official model docs).
- `billy/records.py` keeps original model predictions and explicitly approved corrections in a **local SQLite pilot journal**. The browser never receives the API key.
- The hosted GitHub Pages PWA does **not** yet have a production HTTPS Vision endpoint, company document storage, or Excel upload.

## First measurement, not fine-tuning

1. Obtain **permission** to use a small set of redacted invoices and Fuel Releases. Never commit real scans, identification data, payment details or signatures to this repository.
2. Select documents with different suppliers, layouts, camera angles, handwriting, language and number formats. Keep sources balanced instead of repeating one template.
3. For every sample, compare Billy's prediction to human-verified fields. Review the original scanned document before accepting any correction.
4. Run the local API and approve test extractions; the pilot journal retains their predictions and reviewed values.
5. Execute:

   ```bash
   python scripts/evaluate_approvals.py --database .billy/approved.sqlite3
   ```

   This prints **aggregate field agreement only**; it does not export images, names, original values or account identifiers.
6. Track the model ID, prompt version, document type, sample date and known failure modes outside the submitted document. Freeze a separate held-out sample set for comparisons.
7. Focus first on invoice number, date, supplier, currency, total and line-items; for Fuel Releases focus on registration, airport, date, quantity, unit and handwritten identifiers. A missing value should remain null, never guessed.
8. Improve prompts and deterministic validators, repeat on held-out documents, and only deploy when acceptance criteria are met. Include manual review for critical values regardless of apparent accuracy.

**Interpretation:** Agreement with approved corrections is an informative pilot metric, but not proven ground-truth accuracy: reviewers can also make mistakes, and uncorrected model errors may persist. Structured lines are compared as whole arrays for the initial baseline, so detailed item-level metrics will need a separate evaluator.

Google's Gemini 3.8 Flash documentation indicates that **model tuning is not supported** for that model in the listed platform offering. For now, “training preliminar” means building a carefully labeled evaluation set, prompt iteration, calibration and human feedback, not modifying Gemini's weights.

## Production and confidentiality gates

Keep Gemini credentials server-side only. Before using company-confidential documents, obtain authorization for the processor, data retention and transfer terms; deploy an authenticated HTTPS backend with per-team access, file limits, audit policy, rate limiting and a secured approval database. Test on synthetic or explicitly approved redacted documents first.

Reference:
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash
