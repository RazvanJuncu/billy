"""Local TrOCR handwriting second opinion for Billy's Gemini Vision pipeline.

Gemini extracts document structure and estimated text-line boxes. With explicit
BILLY_HANDWRITING_INFERENCE_ENABLED=1, TrOCR Small loads lazily on the local
Python server (CPU, or CUDA when available) and checks selected handwriting.
An existing *promoted* team checkpoint takes priority over the pretrained
baseline. Gemini's structured values are NEVER overwritten automatically.

The pretrained checkpoint is an official, allowlisted Microsoft model; its
first load downloads files via Hugging Face and subsequent loads use HF cache.
Never download arbitrary model names supplied by clients or documents.
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from functools import lru_cache
from pathlib import Path

from billy.handwriting_data import _crop, _render_page
from billy.vision import mime_for_document

_INFER_LOCK = threading.Lock()
MAX_SECOND_OPINIONS = 12
DEFAULT_PRETRAINED = "microsoft/trocr-small-handwritten"
_ALLOWED_PRETRAINED = frozenset({
    "microsoft/trocr-small-handwritten",
    "microsoft/trocr-base-handwritten",
})


def inference_enabled() -> bool:
    return os.getenv("BILLY_HANDWRITING_INFERENCE_ENABLED", "") == "1"


def pretrained_checkpoint() -> str:
    model = os.getenv("BILLY_TROCR_PRETRAINED_MODEL", DEFAULT_PRETRAINED).strip()
    if model not in _ALLOWED_PRETRAINED:
        raise ValueError("TrOCR baseline must be one of the approved Microsoft checkpoints.")
    return model


def active_model_path(organization_id: str) -> tuple[Path, str] | None:
    """Get previously validated team checkpoint without following external paths."""
    root = Path(os.getenv("BILLY_HANDWRITING_MODEL_DIR", ".billy/handwriting-models")).resolve()
    team = root / str(uuid.UUID(str(organization_id)))
    active = team / "active.json"
    if not active.is_file():
        return None
    metadata = json.loads(active.read_text(encoding="utf-8"))
    rel = metadata.get("checkpoint")
    version = metadata.get("version")
    if not isinstance(rel, str) or not rel.startswith("checkpoints/"):
        raise ValueError("Invalid local handwriting model reference.")
    checkpoint = (team / rel).resolve()
    if not checkpoint.is_relative_to(team.resolve()) or not checkpoint.is_dir():
        raise ValueError("Trained handwriting checkpoint missing.")
    return checkpoint, str(version or checkpoint.name)


def chosen_model(organization_id: str) -> tuple[str, str, bool]:
    """Return (checkpoint, display name/version, local-only checkpoint)."""
    active = active_model_path(organization_id)
    if active:
        checkpoint, version = active
        return str(checkpoint), version, True
    checkpoint = pretrained_checkpoint()
    return checkpoint, checkpoint, False


@lru_cache(maxsize=2)
def _model(checkpoint: str, local_only: bool):
    """Lazy import/download: the normal Gemini-only API needs no PyTorch."""
    import torch
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    # Only approved published Microsoft checkpoints can use network loading.
    if not local_only and checkpoint not in _ALLOWED_PRETRAINED:
        raise ValueError("Unexpected remote TrOCR model.")
    processor = TrOCRProcessor.from_pretrained(
        checkpoint, local_files_only=local_only, trust_remote_code=False,
    )
    model = VisionEncoderDecoderModel.from_pretrained(
        checkpoint, local_files_only=local_only, trust_remote_code=False,
    )
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    return processor, model, device


def inference_status(organization_id: str) -> dict:
    """Lightweight readiness information; does not download/load weights."""
    if not inference_enabled():
        return {"enabled": False, "model": None, "source": "disabled", "loaded": False}
    checkpoint, display, local_only = chosen_model(organization_id)
    return {
        "enabled": True,
        "model": display,
        "source": "fine_tuned" if local_only else "pretrained",
        "loaded": None,  # Health does not load the model; see extraction results.
    }


def second_opinion(
    content: bytes,
    filename: str,
    regions: list[dict],
    organization_id: str,
) -> dict:
    """Add a local OCR reading to *eligible* Gemini regions, and report execution.

    Does not silently claim success if a model was unavailable. Field values in
    result['invoice']/result['fuel_release'] remain untouched for human review.
    """
    if not inference_enabled():
        return {"status": "disabled", "model_version": None, "comparisons": 0, "disagreements": 0}

    eligible = [
        region for region in regions[:180]
        if isinstance(region, dict)
        and region.get("visual_clarity") in ("ambiguous", "slight_uncertainty", "unreadable")
        and region.get("script_type") in ("handwritten", "mixed")
        and "legibility" not in str(region.get("field_path", ""))
        and ".label" not in str(region.get("field_path", ""))
    ][:MAX_SECOND_OPINIONS]
    if not eligible:
        checkpoint, display, local_only = chosen_model(organization_id)
        return {
            "status": "no_eligible_regions",
            "model_version": display, "source": "fine_tuned" if local_only else "pretrained",
            "comparisons": 0, "disagreements": 0,
        }

    checkpoint, display, local_only = chosen_model(organization_id)
    mime = mime_for_document(filename, content)
    # Delay importing large ML libraries until an actual handwritten crop is found.
    processor, model, device = _model(checkpoint, local_only)
    import torch

    pages = {}
    comparisons = 0
    disagreements = 0
    failed_regions = 0
    # The inference lock prevents overlapping CPU/GPU model calls.
    with _INFER_LOCK, torch.inference_mode():
        for region in eligible:
            page = region.get("page")
            try:
                if type(page) is not int or not 1 <= page <= 30:
                    raise ValueError("Invalid page.")
                if page not in pages:
                    pages[page] = _render_page(content, mime, page)
                crop = _crop(pages[page], region["box_2d"])
                pixels = processor(images=crop.convert("RGB"), return_tensors="pt").pixel_values.to(device)
                ids = model.generate(pixels, max_new_tokens=96, num_beams=1)
                reading = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
                if not reading or len(reading) > 120:
                    failed_regions += 1
                    continue
                comparisons += 1
                region["trocr_reading"] = reading
                region["trocr_model"] = display
                current = str(region.get("transcription") or "").strip()
                is_disagreement = reading.casefold() != current.casefold()
                region["handwriting_disagreement"] = is_disagreement
                if is_disagreement:
                    disagreements += 1
                    alternatives = region.get("alternate_readings") or []
                    if reading.casefold() not in {str(item).casefold() for item in alternatives}:
                        region["alternate_readings"] = [*alternatives[:2], reading]
                    if region.get("visual_clarity") == "slight_uncertainty":
                        region["visual_clarity"] = "ambiguous"
            except (OSError, ValueError, RuntimeError, KeyError, IndexError, TypeError):
                failed_regions += 1
                continue
    return {
        "status": "processed" if comparisons else "no_readings",
        "model_version": display,
        "source": "fine_tuned" if local_only else "pretrained",
        "device": str(device),
        "eligible_regions": len(eligible),
        "comparisons": comparisons,
        "disagreements": disagreements,
        "failed_regions": failed_regions,
    }
