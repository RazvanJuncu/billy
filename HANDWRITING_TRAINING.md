# Billy / Learnable Handwriting OCR (TrOCR)

This is a **real fine-tuning implementation**, not prompt-only "learning". It has
not trained on real Billy data yet. All training data, model checkpoints, and
team identifiers stay on a trusted local server; **never store them in GitHub**.

## Immediate baseline: no fine-tuning required

For initial comparisons, enable `BILLY_HANDWRITING_INFERENCE_ENABLED=1`
on the trusted Python backend and install
`requirements-handwriting-train.txt`. The first eligible handwritten
region automatically loads the official pretrained
[`microsoft/trocr-small-handwritten`](https://huggingface.co/microsoft/trocr-small-handwritten)
on **CPU or available CUDA GPU**. It downloads weights to the host's Hugging
Face cache once. Run `python -m scripts.smoke_trocr` to pre-download and
verify local inference before connecting Gemini.

Gemini continues to extract structure and values. Local TrOCR only compares
eligible visually uncertain handwritten/mixed **single-line regions** that
Gemini localizes. The review UI shows both readings and disagreements without
modifying the structured value. If the trained team checkpoint is later
promoted, it replaces the pretrained baseline automatically for that team.

Training capture is an independent toggle and is **not required** for the
baseline. Tests on real, permissioned documents are still necessary to
measure quality, latency and costs. A real Gemini API key and running
FastAPI backend are required for end-to-end extraction.

## Architecture

```text
Billy iPhone / browser
   -> Scan / upload, perspective correction, optional mild Enhance text
   -> Billy Vision (Gemini) extracts layout, structured values and field boxes
   -> Human confirms and fixes fields in visual Review
   -> "Submit & Learn" [only if server-side training capture is enabled]
   -> Existing authenticated approval log (SQLite in local pilot)
   -> Original source bytes + server-stored field coordinates + corrected labels
   -> Cropped verified text-line images in team-private local dataset
   -> A trusted *separate* training worker runs TrOCR fine-tuning on a GPU
   -> Compare baseline versus candidate CER on **document-separated holdout**
   -> Promote candidate only when CER improves and numeric errors do not regress
   -> Next scan: promoted TrOCR re-reads visually uncertain handwritten fields
   -> Disagreements appear as alternatives; do not overwrite quantities or IDs
```

The handwriting checkpoint [microsoft/trocr-base-handwritten](https://huggingface.co/microsoft/trocr-base-handwritten)
is MIT licensed and designed for **single-line handwriting images**. It cannot
by itself discover tables, field hierarchy or arbitrary page structure. Layout
is currently handled separately by Gemini and the existing PaddleOCR tooling.
A separately fine-tuned layout model requires labeled full-page templates and
is **not implemented** in this phase.

## Safety and consent

- Training capture is OFF by default. A team administrator first obtains proper
  permission for the supplier/processor, retention, author access and lawful
  training use, then explicitly enables the pilot on a trusted server.
- When enabled, the Review page offers **Submit & Learn** or **Submit only · don't
  train**. Each action requires one click; the former clearly authorizes cropped
  text submission, while the latter stores approval data only.
- Never assume every field is correct just because someone clicked Submit:
  this pilot collects **only actual corrections** matched to server-stored
  evidence regions classified as handwritten or mixed. Printed-only and unknown
  regions are excluded. Regions can still be wrongly localized; audit samples.
- The backend verifies Supabase membership, original file SHA-256, extraction
  ownership, human approval, server-generated field coordinates and labels.
  The browser cannot invent labels or choose an arbitrary organization's data.
- Only cropped PNG text regions are retained in the training store. The
  original full source file is not retained by this feature. Crop images can
  still contain personal/commercial data and require strict file permissions,
  controlled access, retention and deletion policies.
- Local SQLite and local files are development/pilot only. For production,
  use team-isolated object storage, protected Postgres, auditing, access
  governance, secrets management, quota/rate limits, encryption and backup.
- Never deploy TrOCR training in the GitHub Pages frontend or pass model
  training samples to GitHub Actions or an external public repository.

## Trusted server setup

Python 3.11+ is recommended.

```bash
python -m pip install -r requirements-api.txt
python -m pip install -r requirements-handwriting-capture.txt
# For GPU training and promoted-model inference, install CUDA-compatible torch
# following https://pytorch.org/get-started/locally/ then:
python -m pip install -r requirements-handwriting-train.txt
```

```bash
export GEMINI_API_KEY="...set ONLY on your private server..."
export SUPABASE_URL="...valid Supabase project..."
export SUPABASE_PUBLISHABLE_KEY="...public client key..."
export BILLY_APPROVAL_DB=".billy/approved.sqlite3"
export BILLY_HANDWRITING_DATA_DIR=".billy/handwriting-data"
export BILLY_HANDWRITING_MODEL_DIR=".billy/handwriting-models"

# Do NOT switch these on before reviewing consent and retention policies.
export BILLY_HANDWRITING_CAPTURE_ENABLED=1
export BILLY_HANDWRITING_INFERENCE_ENABLED=1
export BILLY_HANDWRITING_AUTOTRAIN_ENABLED=1

uvicorn api:app --host 127.0.0.1 --port 8000
```

For a remote mobile phone, deploy a properly secured HTTPS reverse proxy with
the required origin allowlist, authentication and storage policies. A GitHub
Pages static site cannot run Python training or act as a Vision API server.

## Fine-tuning manually

Use the actual authenticated organization UUID from the trusted server, never
let an untrusted browser select another organization ID.

```bash
python -m billy.handwriting_train \
  --organization 22222222-2222-4222-8222-222222222222 \
  --epochs 2 --batch-size 2 --min-examples 40 --promote
```

The command consumes *only the selected team's approved crops*, splits them by
original-document hash (no page leakage), runs baseline evaluation, updates
TrOCR weights, evaluates again, saves a checkpoint and promotes it **only if**
held-out character error rate improves and numeric recognition does not
materially worsen. Candidate models and the previous active version remain
on disk for rollback. `active.json` is an atomic pointer to the validated
checkpoint.

Set `BILLY_HANDWRITING_INFERENCE_ENABLED=1` to use the **pretrained Small baseline**, or the promoted team checkpoint if one exists,
as a second opinion at the next extraction. The model does not silently
replace Gemini's values: differences appear as possible alternative readings.

### Automatic improvement with a local worker

```bash
# Run on a GPU-capable trusted host from cron/systemd, NOT via a web request:
BILLY_HANDWRITING_AUTOTRAIN_ENABLED=1 \
python -m billy.handwriting_worker \
  --organization 22222222-2222-4222-8222-222222222222 \
  --min-total 40 --min-new 20 --epochs 2
```

For example, a host scheduler could invoke that command hourly. It only
starts when enough new corrected crops have accumulated; duplicate jobs
are blocked by a lock, and the attempt journal avoids retraining the same
examples repeatedly. It is not running automatically in this repository or
ChatGPT session; it must be configured on the deployment host.

## Evaluation: use CER, not unsupported confidence claims

CER = number of character substitutions, insertions and deletions divided by
the number of characters in manually verified holdout transcriptions. Lower
is better. Track **numeric CER separately** because a confused 1/7 or 0/8 can
change fuel quantities or aircraft registrations. Even a checkpoint that wins
on CER can still make dangerous field-level errors; require human approval.

The initial 40-crop threshold is for validating mechanics of the pipeline,
**not** a guarantee of a statistically robust or production-quality model.
Real improvement usually requires a much broader approved dataset spanning
different handwriting styles, document sources, page conditions and rare
characters. A mix of old and new examples helps prevent catastrophic
forgetting.

Test commands:

```bash
python -m unittest discover -s tests -p 'test_handwriting_learning.py'
python -m unittest discover -s tests -p 'test_visual_feedback.py'
python -m unittest discover -s tests -p 'test_vision.py'
```

## Known gaps before production

- No real document corpus has been supplied for fine-tuning here.
- No GPU is connected to this repository or session; no actual TrOCR weights
  have been updated or benchmarked yet.
- Layout-detection fine-tuning requires a separate labeled full-page dataset.
  The current Gemini/PaddleOCR layout stage stays in place.
- The current crop positions originate from AI estimates and must be
  validated; wrongly located crops can harm fine-tuning.
- TrOCR accepts single lines, so text regions containing multiple lines
  should be split/annotated before being used for high-quality training.
- Robust per-field confidence calibration requires independent evaluation.
- Company document storage, production authentication, long-term audit log
  and Excel integration are not supplied by this OCR training module.

## Primary references

- https://huggingface.co/microsoft/trocr-base-handwritten
- https://huggingface.co/docs/transformers/en/model_doc/trocr
- https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md
