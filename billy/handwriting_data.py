"""Consent-gated, organization-scoped handwriting crop collection (LOCAL pilot).

IMPORTANT:
- No raw source document is retained.
- Only verified, changed text fields with server-stored Gemini regions are saved.
- This is not online fine-tuning: examples must pass validation and a separate
  training/evaluation job before any new weights are activated.
- An authorized team administrator must enable data collection explicitly.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException

MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
MAX_CROPS_PER_DOCUMENT = 80
MAX_PDF_PAGES = 30
MAX_IMAGE_PIXELS = 30_000_000


def capture_enabled() -> bool:
    return os.getenv("BILLY_HANDWRITING_CAPTURE_ENABLED", "") == "1"


def dataset_root() -> Path:
    return Path(os.getenv("BILLY_HANDWRITING_DATA_DIR", ".billy/handwriting-data")).resolve()


def _prepare_folder(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if os.name == "posix":
        path.chmod(0o700)


def _save_image(path: Path, image) -> None:
    import PIL.Image
    stream = io.BytesIO()
    image.save(stream, format="PNG", optimize=True)
    payload = stream.getvalue()
    if len(payload) > 3 * 1024 * 1024:
        raise ValueError("Crop exceeds 3 MiB.")
    tmp = path.with_suffix(".tmp-" + uuid.uuid4().hex)
    fd = os.open(tmp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(payload)
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def _field_value(document: dict, field_path: str):
    """Extract only known field paths; never eval arbitrary model text."""
    if re.fullmatch(r"[a-z_]{1,60}", field_path):
        return document.get(field_path)
    match = re.fullmatch(r"(lines|handwritten_entries)\[(\d{1,3})\]\.([a-z_]{1,40})", field_path)
    if not match:
        return None
    group, ordinal, key = match.groups()
    values = document.get(group)
    index = int(ordinal)
    if not isinstance(values, list) or index >= len(values):
        return None
    item = values[index]
    return item.get(key) if isinstance(item, dict) else None


def _as_verified_label(value) -> str | None:
    # Single-line TrOCR requires one short text crop + exactly its transcription.
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    if not 1 <= len(value) <= 120 or "\n" in value or "\r" in value:
        return None
    return value


def _render_page(content: bytes, mime: str, page_number: int):
    """Open exactly one source page, with upper bounds on memory and page count."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    if mime == "application/pdf":
        try:
            import fitz  # PyMuPDF; optional in the API, required to save PDF crops
        except ImportError as exc:
            raise RuntimeError("Install requirements-handwriting.txt to collect PDF crops.") from exc
        with fitz.open(stream=content, filetype="pdf") as pdf:
            if pdf.needs_pass:
                raise ValueError("Password-protected PDFs are not supported.")
            if not 1 <= len(pdf) <= MAX_PDF_PAGES or page_number > len(pdf):
                raise ValueError("Invalid PDF page number.")
            page = pdf.load_page(page_number - 1)
            # Pixel limit avoids runaway memory use from unusual page sizes.
            scaled_width, scaled_height = page.rect.width * 2, page.rect.height * 2
            if scaled_width * scaled_height > MAX_IMAGE_PIXELS:
                raise ValueError("PDF page too large to rasterize safely.")
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            return image
    if page_number != 1:
        raise ValueError("Image inputs only have one page.")
    try:
        with Image.open(io.BytesIO(content)) as opened:
            opened.verify()
        with Image.open(io.BytesIO(content)) as opened:
            if opened.width * opened.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image dimensions exceed safe limits.")
            return ImageOps.exif_transpose(opened).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Unsupported or corrupted document image.") from exc


def _crop(image, box: list[int]):
    ymin, xmin, ymax, xmax = box
    if not (0 <= ymin < ymax <= 1000 and 0 <= xmin < xmax <= 1000):
        raise ValueError("Invalid normalized region.")
    w, h = image.size
    # Small padding keeps handwriting ascenders/descenders intact.
    padding_x = max(2, int(w * 0.005))
    padding_y = max(2, int(h * 0.005))
    left = max(0, int(xmin * w / 1000) - padding_x)
    upper = max(0, int(ymin * h / 1000) - padding_y)
    right = min(w, int(xmax * w / 1000) + padding_x)
    lower = min(h, int(ymax * h / 1000) + padding_y)
    if right - left < 14 or lower - upper < 8:
        raise ValueError("Region is too small to train on.")
    # TrOCR reads single text lines, not whole pages or multi-row tables.
    if ymax - ymin > 220 or (xmax - xmin) * (ymax - ymin) > 180_000:
        raise ValueError("Region looks too large or multiline for TrOCR.")
    return image.crop((left, upper, right, lower))


def _db_schema(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS handwriting_samples (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          extraction_id TEXT NOT NULL,
          source_sha256 TEXT NOT NULL,
          document_type TEXT NOT NULL,
          page INTEGER NOT NULL,
          field_path TEXT NOT NULL,
          transcript TEXT NOT NULL,
          crop_path TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (extraction_id, page, field_path)
        )
    """)
    connection.execute(
        "CREATE INDEX IF NOT EXISTS handwriting_org_idx "
        "ON handwriting_samples(organization_id, source_sha256)"
    )


def collect_verified_crops(
    extraction_id: uuid.UUID,
    content: bytes,
    filename: str,
    principal,
) -> dict:
    """Collect user-approved corrections linked to authenticated source evidence.

    The submitted client cannot provide text labels, rectangles or team identity.
    All three come from server-owned extraction and approval records.
    """
    if not capture_enabled():
        raise HTTPException(status_code=503, detail="Handwriting collection is disabled for this deployment.")
    if not content or len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Document exceeds the 10 MiB limit.")
    from billy.records import database_path, init
    from billy.vision import mime_for_document
    mime = mime_for_document(filename, content)
    source_hash = hashlib.sha256(content).hexdigest()
    with sqlite3.connect(database_path(), timeout=15) as conn:
        init(conn)
        _db_schema(conn)
        row = conn.execute(
            "SELECT e.source_sha256,e.document_type,e.original_json,e.regions_json,"
            " a.reviewed_json FROM extractions e "
            " JOIN team_approvals a ON a.extraction_id=e.id "
            " AND a.organization_id=e.organization_id "
            " WHERE e.id=? AND e.organization_id=? AND e.created_by=? "
            " AND a.approved_by=?",
            (str(extraction_id), principal.organization_id,
             principal.user_id, principal.user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Approved extraction not found for this account.")
        stored_hash, doc_type, original_json, regions_json, corrected_json = row
        if stored_hash != source_hash:
            raise HTTPException(status_code=400, detail="File does not match the approved extraction.")
        original, reviewed = json.loads(original_json), json.loads(corrected_json)
        regions = json.loads(regions_json)
        if not isinstance(regions, list):
            regions = []
        root = dataset_root()
        # Organization IDs originate from verified Supabase membership and are UUIDs.
        organization = uuid.UUID(str(principal.organization_id))
        folder = root / str(organization)
        _prepare_folder(folder)
        created = 0
        skipped = 0
        pages: dict[int, object] = {}
        for region in regions[:MAX_CROPS_PER_DOCUMENT]:
            if not isinstance(region, dict):
                skipped += 1
                continue
            # Do not fine-tune a handwriting model on printed-only or
            # unclassified text. The source classifier may still be wrong,
            # so a held-out evaluation gate remains mandatory.
            if region.get("script_type") not in {"handwritten", "mixed"}:
                skipped += 1
                continue
            path, page, box = region.get("field_path"), region.get("page"), region.get("box_2d")
            if not isinstance(path, str) or not isinstance(page, int) or not isinstance(box, list) or len(box) != 4:
                skipped += 1
                continue
            # Only create examples when human corrected the model's text.
            before = _as_verified_label(_field_value(original, path))
            after = _as_verified_label(_field_value(reviewed, path))
            if not after or before == after:
                skipped += 1
                continue
            # Coordinates are generated by Gemini but validated before saving.
            if not (1 <= page <= MAX_PDF_PAGES and all(type(x) is int for x in box)):
                skipped += 1
                continue
            identifier = uuid.uuid5(uuid.NAMESPACE_URL, str(extraction_id) + ":" + str(page) + ":" + path).hex
            destination = folder / (identifier + ".png")
            exists = conn.execute(
                "SELECT 1 FROM handwriting_samples WHERE extraction_id=? AND page=? AND field_path=?",
                (str(extraction_id), page, path),
            ).fetchone()
            if exists:
                skipped += 1
                continue
            try:
                if page not in pages:
                    pages[page] = _render_page(content, mime, page)
                crop = _crop(pages[page], box)
                _save_image(destination, crop)
                conn.execute(
                    "INSERT INTO handwriting_samples "
                    "(id,organization_id,extraction_id,source_sha256,document_type,"
                    "page,field_path,transcript,crop_path,created_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (identifier, str(organization), str(extraction_id), source_hash,
                     doc_type, page, path, after,
                     str(destination.relative_to(root)),
                     datetime.now(timezone.utc).isoformat()),
                )
                created += 1
            except (ValueError, OSError) as exc:
                # One bad region must not prevent saving the valid ones.
                if destination.exists():
                    destination.unlink()
                skipped += 1
                continue
        return {
            "status": "queued_for_training" if created else "no_usable_corrections",
            "examples_added": created,
            "regions_skipped": skipped,
            "model_updated": False,
        }


def approved_examples(organization_id: str, db_path: Path | None = None) -> list[dict]:
    """Return local training index for one team only (never a cross-tenant export)."""
    from billy.records import database_path
    path = db_path or database_path()
    if not path.exists():
        return []
    with sqlite3.connect(path) as conn:
        _db_schema(conn)
        rows = conn.execute(
            "SELECT id,source_sha256,document_type,page,field_path,transcript,crop_path "
            "FROM handwriting_samples WHERE organization_id=? ORDER BY created_at",
            (str(uuid.UUID(organization_id)),),
        ).fetchall()
    keys = ("id", "source_sha256", "document_type", "page", "field_path", "transcript", "crop_path")
    return [dict(zip(keys, row)) for row in rows]
