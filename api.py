"""Local-only FastAPI adapter for the Billy browser interface."""
from __future__ import annotations

import logging
import threading
import os
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from functools import lru_cache
from pydantic import BaseModel, Field

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from billy import __version__
from billy.ocr import MAX_UPLOAD_BYTES, SUPPORTED_SUFFIXES, extract_document, make_pipeline
from billy.vision import (
    MAX_VISION_BYTES, Invoice, VisionProviderError, configured, extract_invoice,
    selected_model, validate_financials,
)

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


# Billy Vision v0.5 is a separate, opt-in path; the original PaddleOCR adapter
# remains untouched for local experiments. This API must stay on loopback during
# development. CORS is not authentication, so do NOT deploy it publicly as-is.

class VisionApproval(BaseModel):
    source_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    original: Invoice
    invoice: Invoice
    confirmed: bool


def allowed_origin(request: Request) -> bool:
    origin = request.headers.get("origin")
    return not origin or origin in ALLOWED_WEB_ORIGINS


@app.get("/api/vision/health")
def vision_health():
    return {
        "status": "online",
        "provider": "gemini",
        "model": selected_model(),
        "configured": configured(),
        "requires_review": True,
        "excel_write_enabled": False,
    }


@app.post("/api/vision/extract")
async def vision_extract(request: Request, file: UploadFile = File(...)):
    if not allowed_origin(request):
        raise HTTPException(status_code=403, detail="Origin not allowed.")
    if not configured():
        raise HTTPException(status_code=503, detail="Gemini API key is missing on the Billy server.")
    content = await file.read(MAX_VISION_BYTES + 1)
    filename = file.filename or "document"
    await file.close()
    try:
        return await extract_invoice(filename, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except VisionProviderError as exc:
        log.warning("Gemini extraction unsuccessful: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=str(exc)) from None


@app.post("/api/vision/approve")
def vision_approve(request: Request, payload: VisionApproval):
    if not allowed_origin(request):
        raise HTTPException(status_code=403, detail="Origin not allowed.")
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Explicit human confirmation is required.")
    # Local proof-of-concept only. In production use authenticated users, server-owned
    # extraction IDs, permission checks and a transactional durable database.
    base = os.getenv("BILLY_APPROVAL_DB", ".billy/approved.sqlite3")
    path = Path(base).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    original = payload.original.model_dump(mode="json")
    approved = payload.invoice.model_dump(mode="json")
    correction_count = sum(original.get(k) != approved.get(k) for k in original)
    warnings = validate_financials(payload.invoice)
    try:
        with sqlite3.connect(path, timeout=5) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS approvals ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, source_sha256 TEXT NOT NULL UNIQUE,"
                "approved_at TEXT NOT NULL, original_json TEXT NOT NULL,"
                "approved_json TEXT NOT NULL, correction_count INTEGER NOT NULL,"
                "warnings_json TEXT NOT NULL)"
            )
            cursor = connection.execute(
                "INSERT INTO approvals (source_sha256,approved_at,original_json,approved_json,correction_count,warnings_json) "
                "VALUES (?,?,?,?,?,?)",
                (
                    payload.source_sha256,
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(original, ensure_ascii=False),
                    json.dumps(approved, ensure_ascii=False),
                    correction_count,
                    json.dumps(warnings, ensure_ascii=False),
                ),
            )
            approval_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="This document has already been approved in this pilot database.") from None
    except sqlite3.DatabaseError:
        log.exception("Local approval database failed")
        raise HTTPException(status_code=500, detail="Could not save the approval.") from None
    return {
        "status": "approved", "approval_id": approval_id,
        "correction_count": correction_count, "validation_warnings": warnings,
        "posted_to_excel": False,
    }
