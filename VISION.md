# Billy Vision v0.5 — Pilot architecture

## Decision

Use a commercial multimodal model **on the backend**, not in the browser. The default model is stable \`gemini-3.8-flash\` (Google official model documentation). A model provider adapter in \`billy/vision.py\` keeps vendor-specific HTTP and schema handling separate from \`api.py\` and the review UI. Models may be switched by server configuration, not by giving individual employees API keys.

Source: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash and https://ai.google.dev/gemini-api/docs/generate-content/structured-output

## Pilot flow

1. Capture an image or import a PDF; optionally adjust four corners on the device.
2. Send the document only after pressing **Extract with Vision AI**. The browser sends it to the configured Billy backend, which passes it to Gemini via HTTPS using \`GEMINI_API_KEY\` (server only).
3. Gemini returns structured invoice fields. No model-reported confidence percentage is shown because it is not calibrated.
4. Billy validates subtotals, VAT, line totals, and missing identifiers with Python \`Decimal\`, returning actionable warnings. These checks do not prove correctness.
5. Review allows a human to edit each header field and item row, add and remove rows, and explicitly approve.
6. Approved and originally predicted fields are saved to \`.billy/approved.sqlite3\` in the **local pilot** along with the source SHA-256, a UTC timestamp and the number of corrected groups.
7. The approved invoice can be exported as CSV (spreadsheet-compatible, with formula-injection protection) and JSON. There are **no writes to company Excel files** yet.

## Schema

The extraction contains:
\`supplier_name\`, \`supplier_tax_id\`, \`customer_name\`, \`invoice_number\`,
\`issue_date\`, \`due_date\`, \`currency\`, \`subtotal\`, \`vat_total\`, \`grand_total\`,
\`lines[]\` (\`description\`, \`quantity\`, \`unit_price\`, \`net_amount\`, \`vat_rate\`, \`vat_amount\`),
and \`notes[]\` for ambiguities. Missing values must be \`null\`. Money is represented as text to retain printed precision, not float. JSON schema conformity is not a correctness guarantee.

## Endpoints (development only)

- \`GET /api/vision/health\`: model and whether the API key is configured; does not contact Gemini.
- \`POST /api/vision/extract\`: multipart \`file\`, PDF/JPEG/PNG/WebP up to 10 MiB, validated by extension, content signature and size; returns original model extraction and warnings.
- \`POST /api/vision/approve\`: explicit confirmation with original and corrected JSON. Persists local reviewed examples and prevents duplicate SHA-256 approval.

The existing \`/api/parse\` legacy PaddleOCR path remains for comparison but is not invoked by the new UI. The current local launcher \`start-billy.cmd\` is a separate legacy Paddle development tool; **for Vision use the commands in README**.

## Security boundaries

- This is **not production-ready**. CORS restrictions are not user authentication; the API binds to loopback only in the documented commands.
- Do **not** deploy it on a public server in this form. Before company usage: Microsoft Entra/SSO or equivalent, authentication on **every** API method, file limits and rate limiting, durable database, access policy, audit trail, retention/deletion rules and tenant isolation.
- Avoid free-tier API submission of confidential documents. Obtain company approval for the processor, contracted data-handling conditions and applicable GDPR obligations.
- API keys must be provided in environment variables or secret management. Never send invoices directly from GitHub Pages to Gemini.
- Approved log rows store extracted invoice fields, which may themselves be confidential. Protect and delete pilot databases as required.
- The approved source hash is passed by the client and is **not** server-authenticated. Before production, approvals must refer to server-owned extraction records under authenticated user identities.
- Do not treat model output as accounting authorization. Excel mutations must eventually use a separate deterministic connector, be transactionally idempotent and require approval.

## Validation & next milestones

1. Connect a test API key in a controlled local environment, try a **synthetic invoice** first. Compare each output to ground truth. No real API calls are made in CI.
2. Test a representative anonymized labeled evaluation set (different suppliers, formats and VAT conditions). Record field precision, exact-match per line, document-level success, latency and real token cost.
3. Calibrate per-field uncertainty on held-out data. There is no achievable guarantee of 100% accuracy.
4. Implement enterprise backend + sign-in + approved database; only then connect to OneDrive/SharePoint or a secure local-file agent.
5. Add Excel **dry-run previews**, duplicate detection and rollback/audit before any real writes.

## Pilot-origin safety

The paid Vision endpoints deliberately reject browser requests from the public GitHub Pages origin, even when the local server is running. During this pilot, open the **local** studio at `http://127.0.0.1:5173/`. A production HTTPS backend must replace this with server-side corporate authentication and role-based authorization, not by widening CORS alone.
