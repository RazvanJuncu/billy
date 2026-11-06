# BillyDPI — Document Processing Intelligence

**Your invoices, decoded.** Billy is an installable mobile invoice scanning workbench with an offline-capable camera, perspective correction and a separate local Python OCR service built on [PaddleOCR PP-StructureV3](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PP-StructureV3.html).

## BillyDPI magnetic loader v1.1

The upper oval follows a collision-tested path around the lower oval, then
slows into the original floating position. The two shapes stay unchanged.
The site splash reveals the wordmark at the end of the cycle; the image and AI
loaders show only the animated logo.

## BillyDPI v0.9: personalized, icon-led workspace

The home screen cycles through 15 short, friendly greetings using the signed-in
user's first name from Supabase metadata, falling back to a cleaned email prefix.
The profile control contains an account icon, a menu with My account,
Team workspace and Sign out. Card titles and subtitles are separated into
proper text rows, and the second document selection step uses compact
icon-led controls. The design remains flat monochrome without em dashes in UI
copy. Reduced-motion preferences are respected for greeting transitions.

## BillyDPI v0.8: progressive workspace

The product uses the same monochrome, flat, instrument-first design philosophy as Glide. The screen opens with **two wide choices**: New Document and Uploaded Documents. New Document reveals only **Scan** or **Add files**. After capturing/importing a file the interface progresses through **Edit → Process → Review & Approve → Upload / Export**. Every action reveals the next relevant function; the old sidebar and dense inspector remain hidden.

- **Uploaded Documents** currently lists only files added during the current browser session. No persistent company archive is deployed. The screen explicitly discloses this, and opening a file starts a new draft.
- **Upload to company Excel** is not connected and is never simulated. When a real OCR review is approved, the current pilot allows exporting CSV / JSON, not uploading to company workbooks.
- Existing scanner / perspective adjustment, fuel release recognition schema, and team account APIs remain in the app.
- This is a UI/UX iteration, not a claim that the production AI backend or company storage now exists.

## Design direction (v0.4)

Billy is now a **full-screen document instrument environment**, drawing from Glide's actual satin-obsidian design: a compact navigation rail, central document viewport, dedicated control inspector, and iPhone bottom dock. No homepage hero, white dashboard cards or fake status indicators. The four stages are Capture → Straighten → Extract → Review. See [`BRANDING.md`](./BRANDING.md) for the tokens and interaction principles.

## Billy Teams + Fuel Release v0.6 (in development)

Billy now has a separate **team identity layer**, following the Numveil pattern: email registration/sign-in, password recovery, confirmation, company organizations and owner-approved member requests. Identity and document workspaces are separate.

Authentication relies on **Supabase Auth + PostgreSQL RLS**; the public website now has the project URL and publishable key configured, and requires authenticated Supabase sessions before it opens a team workspace. We have created a separate Supabase project and connected its public configuration, but have **not yet configured Auth redirect URLs or an authenticated cloud backend**. See [ACCOUNTS.md](ACCOUNTS.md) for one-time admin setup, roles and limitations.

A new document type, **Fuel Release**, supports handwritten entries, with `clear`, `uncertain` or `illegible` legibility markers and explicit human correction. No handwriting model has been trained yet. See [FUEL_RELEASE.md](FUEL_RELEASE.md).

The Vision backend now checks Supabase session validity and active team membership **for each extraction and approval**. Human approvals refer to server-issued extraction IDs and are scoped to the originating user and organization. The approvals journal remains **local pilot SQLite**, not the final shared PostgreSQL database.

**Do not upload company-confidential documents to this development build.** A private HTTPS backend, persistent team database, admin setup and formal access/security review are prerequisites for team deployment.

## Billy Vision v0.5 — first AI integration (development pilot)

Billy Vision uses a server-side Gemini multimodal API, with **Gemini 3.8 Flash** as its configurable initial model. This is a new path separate from the legacy PaddleOCR adapter. The schema-first model returns invoice headers and every line item, then a deterministic decimal validator flags discrepancies. Corrections are human-approved; the approved structured fields and original predictions are stored in a **local SQLite pilot log**, without saving the original image. Approved CSV and JSON may be exported, but **no Excel workbook is modified automatically**.

Do **not** use this development API with confidential company invoices or expose it publicly yet. It lacks enterprise login, server-owned session identity, rate limiting, production document storage and access controls. A company deployment needs corporate authentication, secure HTTPS, audit/retention rules, backups, an approval database and approved Excel connectors.

The GitHub Pages frontend remains a static PWA. It does not embed a Gemini key and it does not provide hosted vision inference. You must run a development API server or deploy a separate authenticated backend for actual extraction. **The AI has not been tested end-to-end against live Gemini or production invoices**; unit tests use synthetic values and mocked upstream responses.

Quick local developer check (Python 3.11 installed):

```powershell
git clone https://github.com/RazvanJuncu/billy.git
cd billy
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-api.txt
$env:GEMINI_API_KEY = "YOUR_PERSONAL_TEST_KEY"
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

In another PowerShell window, from the repository:

```powershell
.\.venv\Scripts\python.exe -m http.server 5173 --bind 127.0.0.1 --directory site
```

Open **http://127.0.0.1:5173/** in your computer browser. Only the server process receives `GEMINI_API_KEY`. **Never paste an API key into the Billy browser UI, commit one, or send one through chat.** Set `BILLY_VISION_MODEL` on the server to choose another supported Gemini ID. Leave the PowerShell server running while testing.

Read [VISION.md](VISION.md) for architecture, field schema, money validation, tests, privacy and the path to enterprise hosting.

## Architecture

- **Web/PWA:** static HTML/CSS/JavaScript in `site/`, published with GitHub Pages through GitHub Actions. Supports iPhone camera, imported photos, paper edge estimates, draggable crop handles, rotation and perspective flattening via on-device canvas processing. Includes offline service worker and iPhone home-screen icons.
- **OCR:** FastAPI in `api.py`, invoking `billy/ocr.py` and PaddleOCR PP-StructureV3.
- **Data:** PDF and image inputs, Markdown and JSON outputs, page-by-page preserved layout where possible.
- **Privacy:** The GitHub Pages site does **not** upload invoices to GitHub. It submits files only to the OCR endpoint the user explicitly connects to, `http://127.0.0.1:8000` when running the web UI locally (no default endpoint on the hosted iPhone app). The API listens on the loopback interface by default. Do not expose the OCR API on the internet without TLS, authentication and hardening.

> GitHub Pages cannot run Python. **Taking photos, cropping, perspective flattening, and saving corrected JPEGs work without an OCR backend. Reading invoice text with PaddleOCR requires a separately running Python API.** No simulated OCR output is presented as genuine.

## Start real OCR on Windows (recommended first)

To resolve **“Scanner ready · OCR not connected”** on a Windows PC:

1. Install **64-bit Python 3.11** from [python.org](https://www.python.org/downloads/) with the Python launcher.
2. Download or clone this GitHub repository to your Windows PC.
3. Double-click **\`start-billy.cmd\`** in the project folder. On first launch it creates a local virtual environment and installs PaddlePaddle CPU 3.2.0, PaddleOCR document parser, FastAPI and other dependencies.
4. Billy opens locally at **http://127.0.0.1:5173/**. The small engine status should automatically change to **OCR engine connected** after the API starts at **http://127.0.0.1:8000/**. Refresh the page once if needed.
5. Capture/import your invoice and choose **Scan invoice**. The first real OCR scan downloads its model files. **The API health check alone does not verify model inference.**

Keep the PowerShell window open while using Billy. Closing it stops the API. Files are processed by the local Python server and not uploaded to GitHub.

> **iPhone is a separate step.** Opening the public \`https://razvanjuncu.github.io/billy/\` app does not automatically reach the Windows OCR server. The phone's \`127.0.0.1\` refers to the phone. OCR from iPhone will require an authenticated HTTPS service or another carefully secured connection; never expose an unauthenticated local port publicly.

### Windows troubleshooting

- If the launcher says Python cannot be found: install Python 3.11 (64-bit) and confirm \`py -3.11 --version\` works in PowerShell.
- If the local website loads but OCR says offline: open \`http://127.0.0.1:8000/api/health\` on the PC. It should return \`{"status":"online", ...}\`. If it does not, inspect the launcher console for errors.
- If \`localhost:5173\` is already in use, stop the other server occupying that port.
- If the engine connects but extraction fails: read the Python console error; the OCR models and CPU inference have **not** yet been tested on your machine.
- If you want to reinstall dependencies, delete the \`.venv\` folder while Billy is stopped, then run \`start-billy.cmd\` again.

## Manual startup — advanced (Windows)

Install **Python 3.11 64-bit** and PaddlePaddle CPU per the [official installation matrix](https://www.paddlepaddle.org.cn/en/install/quick). Then in PowerShell:

```powershell
git clone https://github.com/RazvanJuncu/billy.git
cd billy
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
# Install paddlepaddle using the current official command compatible with your machine.
.\.venv\Scripts\python.exe -m pip install -r requirements-ocr.txt
.\.venv\Scripts\python.exe -m pip install -r requirements-api.txt
.\.venv\Scripts\python.exe -m uvicorn api:app --host 127.0.0.1 --port 8000
```

At first use the Paddle models download; CPU inference can take a while. Check `http://127.0.0.1:8000/api/health`. For local web preview, open another PowerShell window and run:

```powershell
py -3.11 -m http.server 5173 --directory site
```

Visit `http://localhost:5173`, choose an image or PDF, ensure the API status is connected, and click **Scan invoice**.

## Billy on mobile: one-button home and installation

BillyDPI is one application with one logo, one manifest, and one document workflow.
On phones and tablets (iPhone, iPad, Android/Samsung, Huawei), the default authenticated
home screen shows a centered **Upload New** action using the scan-bracket Billy mark.
Tapping it opens the existing camera directly. Closing the camera without capturing
returns to the single-button home. A small **Reveal functions** control temporarily
exposes the full Billy home, greeting, account menu, document controls, and install guide.
**Hide functions** collapses the home again; refreshing/relaunching Billy always resets
to the single-action view. Desktop keeps the regular document home and account menu.

- **Installer tool:** https://razvanjuncu.github.io/billy/install.html
- Access the tool using **Install Billy on your phone** on the desktop home, or
  **Reveal functions > Install Billy on your phone** on mobile. It is also available
  from the expanded account menu.
- **Desktop Windows/macOS/Linux:** the installer shows a QR for the public guide address.
  This QR contains no credentials, tokens, or account details.
- **iPhone/iPad:** open the guide in Safari, tap Open Billy, then use Safari Share >
  Add to Home Screen, with Open as Web App when offered.
- **Android/Samsung:** Chrome/Samsung Internet can offer the normal Billy installation
  prompt, or users can open the main Billy page and choose Install app/Add to Home screen.
- **Huawei:** open the main Billy page in Huawei Browser, then Add to Home screen. On
  some Huawei models this creates a browser shortcut instead of a standalone PWA.
- Old `?crew=1` and `?snap=1` bookmarks now open Billy's normal home. Existing
  separately installed Billy Crew icons may need to be removed manually from devices.
- Billy retains the existing Supabase login and team approval requirements. Depending
  on the platform, installing a PWA can require one login separate from the browser.
- **The corporate Excel upload / permanent company storage backend is not yet
  connected.** The development workflow still follows capture, crop, process,
  review and local export. Do not use confidential company documents before the
  production backend and access controls are ready.

Testing: `node --check site/install.js`, `node --check site/simple.js`,
`node --test tests/simple-ui.test.cjs tests/snap-ui.test.cjs tests/crew-install.test.cjs`,
and physical camera / installation checks on iOS Safari, Android/Samsung and Huawei.

## Billy on iPhone

1. Open **https://razvanjuncu.github.io/billy/** in Safari.
2. Tap **Share → Add to Home Screen**, turn on **Open as Web App**, then choose **Add**.
3. Open Billy from the Home Screen icon. Tap **Upload New** to open the camera and grant permission. Use **Reveal functions** to access additional document controls.
4. Capture the page or choose a photo. Billy attempts to locate bright paper edges against a darker backdrop. **Blue corners are draggable**; refine them manually if detection is inaccurate.
5. Tap **Straighten & use** to transform the trapezoid to a flat document JPEG, or **Save image** to share/download without running OCR. PDF input can still be sent straight to OCR.

The in-browser scan engine operates locally, including when the backend is unavailable. It's a best-effort mobile document scanner, not the iOS Notes scanner: automatic edge detection is heuristic, not a guarantee, and no automatic multi-page PDF assembly is provided yet.

### A separate OCR backend is required on iPhone

The public iPhone app cannot reach your **Windows PC** by using `127.0.0.1`: on the phone that address points to **the phone itself**. To run PaddleOCR from the phone we will later need a reachable HTTPS backend (with authentication, strict upload limits and appropriate privacy controls), or on-device OCR. Do not expose the local port directly to the internet.

### GitHub Pages

`.github/workflows/pages.yml` publishes `site/` on every push to `main`. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** if necessary. The site URL is `https://razvanjuncu.github.io/billy/`; check deployment status in **Actions**. The hosted UI connects to the local API only while that service is running on your own computer. Browser local-network restrictions vary; if connection is blocked, use the local UI above.

## What v0.2 can and cannot do

- Upload PDF, PNG, JPG, JPEG, TIFF and BMP files (max 20 MiB); open compatible iPhone photos for flattening (HEIC support depends on browser decoding).
- Scan with the mobile camera; crop four corners, auto-detect bright paper when possible, rotate and warp photos to flat JPEGs locally.
- Process with PP-StructureV3 **when the Python backend is connected**, preserving detected reading order, text and tables as Markdown/JSON, plus underlying OCR layout.
- Display the original next to the structured result, and export Markdown/JSON.
- No AI financial interpretation, no accounting validation, and no promise of pixel-perfect styling. OCR can make mistakes, especially on decimals, VAT or dense tables.
- The OCR model has **not** yet been benchmarked against real invoices; unit tests mock the model and exercise the surrounding code.

## Tests

```bash
python -m unittest discover -s tests -v
node --check site/app.js
node --check site/scanner.js
node --check site/perspective.js
node --test tests/perspective.test.cjs
```

CI tests need FastAPI + HTTPX but no Paddle model download.

## Next milestones

1. Run iPhone Safari and iOS PWA hands-on tests; calibrate auto-edge detection and mobile cropping.
2. Connect the phone to a properly secured HTTPS PaddleOCR backend and test real Romanian invoices (without committing private sample data).
3. Improve table fidelity, text bounding boxes, multi-page scanning and review controls.
4. Optional AI field interpretation + mathematical validation + RO e-Factura XML import.

**License:** no public license has been selected yet. Do not commit confidential invoices or OCR outputs.

## iPhone OCR connection status

The GitHub Pages app intentionally starts with **Scanner ready · OCR not connected** and no server URL. This is expected: PaddleOCR is a Python backend and cannot run within GitHub Pages. The **Connect OCR to read text** action opens an inline settings area rather than appearing as a dead button. On iPhone, loopback addresses such as 127.0.0.1 do not reach a separate computer. This app does not provide a hosted OCR backend yet.
