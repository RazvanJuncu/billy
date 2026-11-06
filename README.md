# billy.

**Your invoices, decoded.** Billy is an installable mobile invoice scanning workbench with an offline-capable camera, perspective correction and a separate local Python OCR service built on [PaddleOCR PP-StructureV3](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PP-StructureV3.html).

## Architecture

- **Web/PWA:** static HTML/CSS/JavaScript in `site/`, published with GitHub Pages through GitHub Actions. Supports iPhone camera, imported photos, paper edge estimates, draggable crop handles, rotation and perspective flattening via on-device canvas processing. Includes offline service worker and iPhone home-screen icons.
- **OCR:** FastAPI in `api.py`, invoking `billy/ocr.py` and PaddleOCR PP-StructureV3.
- **Data:** PDF and image inputs, Markdown and JSON outputs, page-by-page preserved layout where possible.
- **Privacy:** The GitHub Pages site does **not** upload invoices to GitHub. It submits files only to the OCR endpoint the user explicitly connects to, `http://127.0.0.1:8000` when running the web UI locally (no default endpoint on the hosted iPhone app). The API listens on the loopback interface by default. Do not expose the OCR API on the internet without TLS, authentication and hardening.

> GitHub Pages cannot run Python. **Taking photos, cropping, perspective flattening, and saving corrected JPEGs work without an OCR backend. Reading invoice text with PaddleOCR requires a separately running Python API.** No simulated OCR output is presented as genuine.

## Start the OCR backend (Windows)

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

## Billy on iPhone

1. Open **https://razvanjuncu.github.io/billy/** in Safari.
2. Tap **Share → Add to Home Screen**, turn on **Open as Web App**, then choose **Add**.
3. Open Billy from the new Home Screen icon. Choose **Open camera** and grant camera permission, or **Import photo** to correct an existing image.
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
