# Billy Vision + TrOCR — Windows development setup

These instructions start a **local developer stack**. They do NOT deploy a
production mobile backend or train a model by themselves.

## What runs where?

1. **Billy PWA**: UI in browser/iPhone; camera, contrast, document review.
2. **Billy Python API**: FastAPI on a trusted machine; calls **Gemini 3.8 Flash**
   via Google's HTTPS API. It needs a Gemini API key stored on the server only.
3. **TrOCR**: a Microsoft pretrained handwriting checkpoint (`microsoft/trocr-base-handwritten`,
   MIT license) executed locally using PyTorch/Transformers. Only this component
   is fine-tuned on actual handwriting crops in the current architecture.
4. **PaddleOCR PP-StructureV3**: a separate optional local layout/OCR pipeline.
   The ordinary Billy Vision endpoint currently uses Gemini, not an
   automatically merged three-model ensemble.

## Start locally on Windows (PowerShell)

Install Git and Python 3.11 from their official sources. From PowerShell:

```powershell
git clone https://github.com/RazvanJuncu/billy.git
cd billy
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-api.txt -r requirements-handwriting-capture.txt
```

If PowerShell blocks the virtual environment activation, use
`.venv\Scripts\python.exe` instead of `python` for commands rather than
changing your system-wide execution policy.

Obtain a Gemini API key from https://aistudio.google.com/apikey .
The API key is NOT the same as a Gemini app subscription.
Use a restricted/appropriate key with project budget and quotas. For live company
documents confirm Google's retention/processing terms and authorization first.
**Never put the API key into the public `site/account-config.js` or GitHub.**

In the PowerShell window hosting your API, configure environment variables
with your own values (not committed anywhere):

```powershell
$env:GEMINI_API_KEY = "YOUR_PRIVATE_KEY"
$env:GEMINI_MODEL = "gemini-3.8-flash"
$env:SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLISHABLE_KEY"
python -m uvicorn api:app --host 127.0.0.1 --port 8000
```

The Supabase project must already have Billy's team membership setup, and
the user must have an approved team account. Use the public URL/publishable
key configured for Billy; do not use a service-role/secret key here.

Open a SECOND PowerShell terminal in the same repository:

```powershell
.\.venv\Scripts\Activate.ps1
python -m http.server 5173 --directory site
```

Open http://localhost:5173 in the PC browser, sign in to Billy, open
**Connect Vision server**, enter `http://127.0.0.1:8000`, and press
**Connect**. Process an approved synthetic or redacted test document.

**Important:** the same localhost address will NOT work on an iPhone: it
would point to the iPhone itself. Testing via the installed mobile PWA needs
a properly secured **HTTPS** API hostname, TLS, authentication, CORS,
rate-limits and device/network access. Do not expose a plain uvicorn
development server to the Internet.

## Download and test the local TrOCR model

On the same trusted machine or a dedicated GPU workstation:

```powershell
# If NVIDIA CUDA is available, install the appropriate torch build FIRST:
# https://pytorch.org/get-started/locally/
python -m pip install -r requirements-handwriting-train.txt

# First run downloads TrOCR checkpoint files from Hugging Face.
python -c "from transformers import TrOCRProcessor, VisionEncoderDecoderModel; x='microsoft/trocr-base-handwritten'; p=TrOCRProcessor.from_pretrained(x); m=VisionEncoderDecoderModel.from_pretrained(x); print('TrOCR loaded:', m.__class__.__name__)"
python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
```

Using CPU can verify that TrOCR loads, but full fine-tuning will be impractical
for many normal PCs. On GPU machines, choose the correct PyTorch/CUDA build
using the official selector. Avoid assuming a particular CUDA version.

## Enable approved handwriting feedback, locally

**Only after you have consent/permission for the training use**, in the API
PowerShell terminal, set these BEFORE starting/restarting uvicorn:

```powershell
$env:BILLY_HANDWRITING_CAPTURE_ENABLED = "1"
$env:BILLY_HANDWRITING_INFERENCE_ENABLED = "1"
```

New Gemini extractions now expose the **Submit & Learn** option.
For eligible corrected regions the reviewer can submit cropped handwritten
images plus corrected labels; the server checks the exact original file hash
and team ownership. Only corrected fields with accepted handwritten/mixed
evidence are added to the local dataset, and can still require quality review.

The files and checkpoints remain in ignored directories under `.billy/`.
This is a **local pilot**, not a production multi-tenant storage solution.

## Train manually when the dataset is ready

The first validation threshold is 40 approved corrected crops from at
least 10 different documents. It is a technical minimum, NOT evidence of
production accuracy. Collect more varied writing styles for a useful model.

```powershell
# Replace with the UUID for the approved Billy team:
python -m billy.handwriting_train --organization YOUR-TEAM-UUID --epochs 2 --batch-size 2 --min-examples 40 --promote
```

This fine-tunes Microsoft TrOCR weights and compares both character error
rate (CER) and a numeric-error metric on held-out documents. The candidate
is promoted only when both configured quality gates pass.

On a separate trusted GPU host, an OPTIONAL scheduled worker can check
for sufficient new samples:

```powershell
$env:BILLY_HANDWRITING_AUTOTRAIN_ENABLED = "1"
python -m billy.handwriting_worker --organization YOUR-TEAM-UUID --min-total 40 --min-new 20 --epochs 2
```

A one-time command checks once. Repeated execution requires a system
scheduler, service or other explicit automation on that machine, which is
not installed by Billy itself. If a trained checkpoint is promoted, the
optional second-opinion TrOCR pass uses it on future ambiguous handwritten
fields, but does not override structured Gemini values without human review.

## Licensing and costs

- Microsoft `microsoft/trocr-base-handwritten`: weights labeled **MIT**,
  no weight license fee; MIT notice/license compliance still applies.
- TrOCR compute: local model download/inference is free of per-request
  license charges, but local hardware, GPU rental, electricity and hosting
  are not necessarily free.
- Gemini API: hosted Google service. A limited free tier can be available;
  paid per-token usage and different data-processing terms apply. Do not
  upload confidential company documents on a free tier without confirming
  the terms and necessary authorization.
- For PDF crop collection we use `pypdfium2` (Apache-2.0/BSD-3-Clause,
  plus packaged PDFium dependency licenses), instead of PyMuPDF's
  AGPL/commercial licensing. Always review third-party notices for
  the full dependency bundle before a commercial release.

Primary documentation:
- https://huggingface.co/microsoft/trocr-base-handwritten
- https://huggingface.co/docs/transformers/en/model_doc/trocr
- https://pytorch.org/get-started/locally/
- https://ai.google.dev/gemini-api/docs/pricing
- https://pypdfium2-team.github.io/pypdfium2/readme.html
