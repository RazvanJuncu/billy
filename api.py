"""Local-only FastAPI adapter for the Billy browser interface."""
from __future__ import annotations

import logging
import threading
import os
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from functools import lru_cache
from pydantic import BaseModel, Field
from typing import Any, Literal

from fastapi import FastAPI, File, Form, Depends, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from billy import __version__
from billy.ocr import MAX_UPLOAD_BYTES, SUPPORTED_SUFFIXES, extract_document as extract_ocr_document, make_pipeline
from billy.vision import (
    MAX_VISION_BYTES, VisionProviderError, configured, extract_document, selected_model,
)
from billy.accounts import Principal, require_member
from billy.records import record_extraction, save_approval

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
def parse(request: Request, file: UploadFile = File(...), principal: Principal = Depends(require_member)):
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
            result = extract_ocr_document(name, content, get_pipeline())
        return result.json_data
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        log.exception("OCR processing failed")
        raise HTTPException(status_code=500, detail="OCR failed. Check the local server logs.") from None
    finally:
        file.file.close()


# Billy Accounts v0.6: every paid AI operation requires a verified team member.
# This remains a local developer API until hosted with protected HTTPS, user rate limits,
# organization-scoped durable Postgres storage, monitoring and data retention controls.

class VisionApproval(BaseModel):
    extraction_id: uuid.UUID
    document_type: Literal["invoice", "fuel_release"]
    document: dict[str, Any]
    confirmed: bool


@app.get("/api/vision/health")
def vision_health(principal: Principal = Depends(require_member)):
    return {
        "status": "online",
        "provider": "gemini",
        "model": selected_model(),
        "configured": configured(),
        "requires_review": True,
        "excel_write_enabled": False,
        "document_types": ["invoice", "fuel_release"],
        "organization_id": principal.organization_id,
    }


@app.post("/api/vision/extract")
async def vision_extract(
    file: UploadFile = File(...),
    document_type: Literal["invoice", "fuel_release"] = Form("invoice"),
    principal: Principal = Depends(require_member),
):
    if not configured():
        raise HTTPException(status_code=503, detail="Gemini API key is missing on the Billy server.")
    content = await file.read(MAX_VISION_BYTES + 1)
    filename = file.filename or "document"
    await file.close()
    try:
        result = await extract_document(filename, content, document_type)
        result["extraction_id"] = record_extraction(result, principal)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except VisionProviderError as exc:
        log.warning("Gemini extraction unsuccessful: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail=str(exc)) from None
    except sqlite3.DatabaseError:
        log.exception("Extraction journal unavailable")
        raise HTTPException(status_code=500, detail="Could not save the extraction for review.") from None


@app.post("/api/vision/approve")
def vision_approve(payload: VisionApproval, principal: Principal = Depends(require_member)):
    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Explicit human confirmation is required.")
    try:
        return save_approval(payload.extraction_id, payload.document_type, payload.document, principal)
    except sqlite3.DatabaseError:
        log.exception("Local approval journal unavailable")
        raise HTTPException(status_code=500, detail="Could not save the reviewed document.") from None
