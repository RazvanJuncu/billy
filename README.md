# billy.

**Your invoices, decoded.** Billy is an invoice scanning workbench: a lightweight web interface and a local Python OCR service built on [PaddleOCR PP-StructureV3](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PP-StructureV3.html).

## Architecture

- **Web:** static HTML/CSS/JavaScript in `site/`, published with GitHub Pages through GitHub Actions, similar to Glide and InfraTrack.
- **OCR:** FastAPI in `api.py`, invoking `billy/ocr.py` and PaddleOCR PP-StructureV3.
- **Data:** PDF and image inputs, Markdown and JSON outputs, page-by-page preserved layout where possible.
- **Privacy:** The GitHub Pages site does **not** upload invoices to GitHub. It submits files only to the OCR endpoint the user explicitly connects to, default `http://127.0.0.1:8000`. The API listens on the loopback interface by default. Do not expose the OCR API on the internet without TLS, authentication and hardening.

> GitHub Pages cannot run Python. The public UI is accessible without the OCR engine, but actual scanning requires the separately running Python API. No simulated OCR output is presented as genuine.

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

### GitHub Pages

`.github/workflows/pages.yml` publishes `site/` on every push to `main`. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** if necessary. The anticipated URL is `https://razvanjuncu.github.io/billy/`; confirm availability in **Actions** and **Settings → Pages**. The hosted UI connects to the local API only while that service is running on your own computer. Browser local-network restrictions vary; if connection is blocked, use the local UI above.

## What v0.1 can and cannot do

- Upload PDF, PNG, JPG, JPEG, TIFF and BMP files (max 20 MiB).
- Process with PP-StructureV3, preserving detected reading order, text and tables as Markdown/JSON, plus the underlying OCR layout.
- Display the original next to the structured result, and export Markdown/JSON.
- No AI financial interpretation, no accounting validation, and no promise of pixel-perfect styling. OCR can make mistakes, especially on decimals, VAT or dense tables.
- The OCR model has **not** yet been benchmarked against real invoices; unit tests mock the model and exercise the surrounding code.

## Tests

```bash
python -m unittest discover -s tests -v
node --check site/app.js
```

CI tests need FastAPI + HTTPX but no Paddle model download.

## Next milestones

1. Validate on real Romanian invoices (with personal data removed from test examples).
2. Improve table fidelity, text bounding boxes and review controls.
3. Optional AI field interpretation + mathematical validation + RO e-Factura XML import.

**License:** no public license has been selected yet. Do not commit confidential invoices or OCR outputs.
