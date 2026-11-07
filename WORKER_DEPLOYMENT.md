# Billy Worker — același motor pe PC sau pe server

## Decizia de arhitectură

**Billy rămâne PWA.** Angajații folosesc exact același site pe iPhone,
Android, Mac sau Windows. Niciun utilizator obișnuit nu trebuie să instaleze
TrOCR.

**Billy Worker** este un proces separat, autorizat să ruleze motorul TrOCR pe
orice calculator al companiei: Windows cu CPU/GPU, Linux sau server dedicat.
Folosește aceleași funcții Python din `billy.handwriting_inference`, deci
mutarea de pe PC pe server nu cere rescrierea modelului sau a aplicației web.

```text
iPhone / tabletă / browser
    |
    v
Billy PWA --- HTTPS ---> Billy cloud API + storage + document queue
                              |          |
                              |          +--> Gemini cloud API (structură)
                              |
                        Pending handwriting jobs
                              |
                    outbound HTTPS, worker authentication
                              |
               +--------------+--------------+
               |                             |
          PC Windows                   Server Linux
          Billy Worker                 Billy Worker
          CPU / optional GPU           CPU / optional GPU
               |                             |
               +---- result back to queue ---+
                              |
                       Ready for Review
```

The diagram is **the target architecture**, not a running deployment.
Currently, Billy's `/api/vision/extract` calls Gemini and optionally
TrOCR **inside the same Python API process**. The remote queue, worker
registration, persistent document storage, job leasing, heartbeat/retry, and
background service are **not implemented yet**. The GitHub Pages site
cannot route uploaded documents to a random PC by itself.

## What is already portable today

The repository includes `billy/worker_cli.py`, a headless local test runner
around the **existing real TrOCR engine**. It accepts a document file and
Gemini-compatible regions JSON, then uses the pretrained Microsoft TrOCR
Small model on CPU (or CUDA-capable NVIDIA hardware). It does not require
fine-tuning or a dedicated GPU. It is currently **manual/offline**, not a
substitute for the future cloud queue.

### On an authorized Windows PC

Install Git and Python 3.11. Inside the repo, in PowerShell:

```powershell
git clone https://github.com/RazvanJuncu/billy.git
cd billy
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-api.txt -r requirements-handwriting-train.txt
.\.venv\Scripts\python.exe -m scripts.smoke_trocr
```

The last command downloads the official model and verifies one inference.
For a local *manual* test on a redacted document with an accompanying
`regions.json` exported from a test Gemini response:

```powershell
$env:BILLY_HANDWRITING_INFERENCE_ENABLED = "1"
.\.venv\Scripts\python.exe -m billy.worker_cli `
  --document "C:\\test\\sample.pdf" `
  --regions "C:\\test\\regions.json" `
  --organization "YOUR-ORGANIZATION-UUID" `
  --output ".billy\\local-worker-result.json"
```

The output is sensitive. It is written to the ignored `.billy/` folder.
A workstation needs reliable connectivity to Google only for Gemini calls
from its backend; the TrOCR model itself runs locally. It downloads the
weights from Hugging Face the first time, then caches them.

Do not install this as an auto-start Windows service yet: automatic queue
polling and credential enrollment are a separate implementation milestone.

### On an authorized Linux / on-prem company server

Same Python code works directly with Python 3.11, or using the included
CPU-oriented Docker container:

```bash
docker build -f Dockerfile.worker -t billy-trocr-worker .
mkdir -p .billy/model-cache .billy/worker-output

# First execution requires network access to download pretrained weights.
# Mount input read-only; keep output and model cache outside image layers.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --mount type=bind,src="$(pwd)/test",dst=/input,readonly \
  --mount type=bind,src="$(pwd)/.billy/worker-output",dst=/work \
  --mount type=bind,src="$(pwd)/.billy/model-cache",dst=/var/cache/billy/huggingface \
  billy-trocr-worker \
  --document /input/sample.pdf \
  --regions /input/regions.json \
  --organization YOUR-ORGANIZATION-UUID \
  --output /work/result.json
```

This image currently packages **CPU PyTorch**. A GPU-enabled server would
use the appropriate CUDA runtime/build and compatible PyTorch wheel (see
https://pytorch.org/get-started/locally/), but the Billy inference source
does not change. The container publishes **no network port**. Docker is
an optional deployment format, not a requirement for Windows.

The `Dockerfile.worker` is untested on a real server and its first build
has not been benchmarked. Do not assume that the example run or Docker
image is production-ready without integration testing.

## Next milestone: automatic Pending jobs

To make the phone upload -> Pending -> PC/server processes flow actually
work, we will add to Billy's **central trusted backend**:

1. Private document storage and a durable queue, with organization-scoped
   access control and an immutable `document_id`.
2. An explicit worker enrollment process restricted to the company, with
   short-lived credentials, separate authorization from normal Billy users
   and a server-side worker/organization binding.
3. An outbound-only worker client: claim one eligible job, download an
   authorized temporary file (prefer cropped handwriting only), run TrOCR,
   submit the result, acknowledge completion.
4. Lease/heartbeat, bounded retries, idempotent results and redelivery
   when a PC goes offline. Duplicate processing must not create duplicate
   approvals or company-register writes.
5. Per-job stages: `uploaded` -> `gemini_extracted` ->
   `awaiting_handwriting` -> `handwriting_processing` ->
   `ready_for_review` -> `approved`.
6. Machine capacity limits, version-pinned model weights, real telemetry,
   explicit model upgrade/rollback, retention/deletion rules, and
   redacted audit logging.

**A visitor opening Billy in a browser must never automatically become a
worker** or download other employees' documents. Only explicitly enrolled
PCs/servers can process jobs.

Gemini and file intake also need a reachable HTTPS backend (or another
trusted hosted processing path) for uploads to work from every device.
Moving TrOCR to a local PC avoids a permanent **GPU** bill but does not
eliminate the need for some cloud coordination/storage. If no authorized
worker is online, handwriting jobs remain Pending until one returns;
Gemini-only review can be offered with an honest 'not double-checked'
indicator.

## Migration plan: PC now -> owned server later

- **Pilot:** enroll one explicitly approved PC with sufficient CPU/RAM.
  The TrOCR engine runs locally on that machine when the future worker agent
  has claimed a pending job.
- **Expand:** enroll additional trusted PCs if necessary. Model/data paths
  and worker capacity are machine settings, not hard-coded in the app.
- **Move to company server:** install identical worker code/compatible
  container and credentials on the server. Transfer only approved,
  versioned model checkpoints through an audited secure path. Change the
  worker registry to prefer the server, then disable old PC workers.
- **Training:** run separately at scheduled times, on permitted machines.
  No user upload should trigger an unbounded fine-tuning job. Only promoted
  and tested checkpoints are distributed to workers.

Do not use production company-confidential documents until identity,
queue access, storage policies, backup/retention and admin approvals have
been implemented and verified.
