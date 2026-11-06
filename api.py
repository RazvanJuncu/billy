"""Local-only FastAPI adapter for the Billy browser interface."""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from functools import lru_cache

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from billy import __version__
from billy.ocr import MAX_UPLOAD_BYTES, SUPPORTED_SUFFIXES, extract_document, make_pipeline

ALLOWED_WEB_ORIGINS = {
    "https://razvanjuncu.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

app = FastAPI(title="Billy OCR API", version=__version__)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_WEB_ORIGINS),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
# Paddle inference is serialized to avoid overlapping heavyweight calls on a CPU.
_inference_lock = threading.Lock()
log = logging.getLogger("billy")


@lru_cache(maxsize=1)
def get_pipeline():
    return make_pipeline()


@app.get("/api/health")
def health():
    return {
        "status": "online",
        "version": __version__,
        "engine": "PaddleOCR PP-StructureV3",
        "model_loaded": get_pipeline.cache_info().currsize > 0,
    }


@app.post("/api/parse")
def parse(request: Request, file: UploadFile = File(...)):
    origin = request.headers.get("origin")
    if origin and origin not in ALLOWED_WEB_ORIGINS:
        raise HTTPException(status_code=403, detail="Origin not allowed.")
    name = file.filename or "invoice"
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MiB.")
    if not content:
        raise HTTPException(status_code=400, detail="File is empty.")
    if Path(name).suffix.lower() not in SUPPORTED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported file extension.")
    try:
        with _inference_lock:
            result = extract_document(name, content, get_pipeline())
        return result.json_data
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        log.exception("OCR processing failed")
        raise HTTPException(status_code=500, detail="OCR failed. Check the local server logs.") from None
    finally:
        file.file.close()
