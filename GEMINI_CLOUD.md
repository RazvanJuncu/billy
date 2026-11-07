# Billy Gemini Cloud — working deployment and first real scan

**Current scope:** Gemini-only. The TrOCR handwriting reader, Windows Worker,
job queues, training, original-PDF archive and company Excel posting are on hold.
Billy remains the same PWA on every device.

## What is deployed

- Billy website: https://razvanjuncu.github.io/billy/
- Authenticated Vision backend (Supabase Edge Function):
  `https://ookafdnvavohfopxfxpf.supabase.co/functions/v1/billy-vision`
- Existing Supabase Auth: user login + verified company membership.
- Private PostgreSQL review ledger (`public.document_records`, RLS on):
  structured extraction, evidence boxes, token usage, model, review status,
  approved structured values, validation warnings, timestamps and reviewers.
- **Source files are NOT stored by the cloud function.**
- Only authenticated users belonging to a team can make requests. Approvals
  are restricted to the user and organization that created the extraction.
- The Gemini API key and Supabase service-role key stay on the server.

## One required setup step: configure Gemini API key

An administrator must add a Gemini API key in the **Supabase function secrets**.
The assistant cannot read or set that Google API key with the currently
connected tools; never paste it into GitHub or `site/account-config.js`.

1. Create a Gemini API key at https://aistudio.google.com/apikey .
   A ChatGPT/Gemini app subscription does not provide API credits.
2. Open the Billy Supabase project's function secrets:
   https://supabase.com/dashboard/project/ookafdnvavohfopxfxpf/functions/secrets
3. Add exactly: name `GEMINI_API_KEY`, value your **private** Google AI Studio API key.
   Do not change `SUPABASE_SERVICE_ROLE_KEY`; Supabase supplies this to Edge
   Functions automatically.
4. Confirm the Google project has a suitable tier, quota/billing settings,
   approved company data-processing conditions and reasonable spend limits.
5. Open Billy, sign in to your team, then check Engine status. It should show
   `Vision configured · gemini-3.8-flash`.

The function was deployed with `verify_jwt=true` and only permits Billy's
own web origin (or direct authenticated non-browser requests).
`/api/vision/health` is not public; a logged-in team session is needed.

## First end-to-end test

1. Use a synthetic / permissioned redacted PDF or photograph, <10 MiB.
2. Upload from Billy Web / QuickScan and select **Invoice** or **Fuel Release**.
3. Press **Extract with Vision AI**. Gemini reads the entire source and returns
   structured fields, line items, image-region estimates, and validation warnings.
4. Visually review **every field** against the original source. Correct as needed.
5. Press **Submit corrections**. The server stores approved structured values
   in the organization's Supabase database (and never writes to company Excel).
6. Open **Uploaded Documents** on a *different signed-in device* in the same
   organization. The recent team record should be there; approved JSON can
   be downloaded. The original photograph/PDF is not stored, so you cannot
   reopen the underlying source file from history.

If the Gemini key has not been added, the website will show the Vision backend
as online but **not configured**, and extracting documents remains unavailable.

## API endpoints (all require Supabase JWT + team membership)

Base: `https://ookafdnvavohfopxfxpf.supabase.co/functions/v1/billy-vision`

- `GET /api/vision/health` — model/key status (no secret values).
- `POST /api/vision/extract` — multipart `file` and `document_type`.
  A valid source hash + structured prediction are stored, not the raw file.
- `POST /api/vision/approve` — accept one user-reviewed structured document.
  The same extraction cannot be approved twice.
- `GET /api/vision/records` — up to 50 recent organization records.

Browser requests send `Authorization: Bearer <user access token>`,
`apikey: <Supabase publishable key>`, and
`X-Billy-Organization: <current team UUID>`.

## Accuracy, security and scope restrictions

- Gemini can read handwriting, but it is fallible. There is no calibrated
  accuracy score and **human review is required**.
- "Clear strokes" or agreement with a prior model is not a correctness guarantee.
- Google receives the uploaded document to run Gemini. The function sends
  `store:false` to disable per-request Gemini request logging. Google's
  service-level data processing/retention rules still apply.
- AI results, not raw files, are saved into Supabase for the company's team.
- The cloud Gemini-only flow currently **does not fine-tune model weights**
  or persist prior corrections as reusable prompt guidance.
- No background queue, offline AI processing, automatic Excel updates, or
  handwritten-model server has been connected to this production path.
- A single uploaded file has a 10 MiB limit. We must measure actual latency,
  API costs, and handling of ambiguous handwriting on approved samples before
  calling the integration production-ready.
- The existing Supabase Auth security advisor reports that leaked-password
  detection is disabled. Review the password-security setting before a
  production roll-out:
  https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Developer tests: `node --test tests/gemini-cloud-ui.test.cjs`. Tests use
fake provider responses, fake JWTs and a mocked database — they do not
exercise real Google billing, actual documents, or production credential setup.
