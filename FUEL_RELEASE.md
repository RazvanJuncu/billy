# Billy / Fuel Release v0.6

Fuel Release is a **separate document type** from Invoice. The initial schema and prompt are deliberately generic: until Billy is shown real redacted forms, we cannot confirm which operational fields the user's company needs.

## Preliminary fields

Release reference, fuel supplier, operator, airport, aircraft registration, flight number, date, fuel type, fuel requested/delivered, measurement unit, truck ID, fueler and receiving person. Missing values are null; the model must not infer values from context.

Each **handwritten entry** has:
- \`label\` — printed field label (or short description of its location)
- \`transcription\` — handwritten text if legible, otherwise null
- \`legibility\` — \`clear\`, \`uncertain\` or \`illegible\`

Unclear fields appear in validation warnings and require human verification. The app exposes original and corrected data for later evaluation; these corrections are **not training a model yet**. Fine-tuning requires a controlled, consented and de-identified labeled data set plus a held-out test set. Do not promise any 100% confidence or 100% recognition accuracy.

## Next validation

- Use 20–50 **redacted** genuine Fuel Releases from different handwriting styles and paper forms, ideally with typed ground truth from operators.
- Evaluate each field's exact-match transcription, empty/illegible handling, unit correctness and critical quantity/aircraft-registration errors.
- Validate fuel requested versus delivered carefully; they are not necessarily equal and must never be reconciled automatically.
- Do not use the model's self-reported confidence. Calibrate uncertainty from held-out data and measure error rates.
- Preserve signature images only according to company policy. The model must not identify or infer the signer solely from an illegible signature.
- Refine the schema, training example collection and Excel mappings only after analyzing the actual company forms.

Gemini vision document processing: https://ai.google.dev/gemini-api/docs/document-processing .
