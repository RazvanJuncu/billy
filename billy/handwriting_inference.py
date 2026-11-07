"""Optional TrOCR second opinion on visually uncertain handwritten fields.

Loads ONLY a locally promoted, organization-specific checkpoint. Model predictions
never silently replace Gemini's values; disagreements create review alternatives.
The endpoint remains functional if ML dependencies/checkpoints are unavailable.
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


def inference_enabled() -> bool:
    return os.getenv("BILLY_HANDWRITING_INFERENCE_ENABLED", "") == "1"


def active_model_path(organization_id: str) -> tuple[Path, str] | None:
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


@lru_cache(maxsize=2)
def _model(checkpoint: str):
    import torch
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel
    processor = TrOCRProcessor.from_pretrained(checkpoint, local_files_only=True)
    model = VisionEncoderDecoderModel.from_pretrained(checkpoint, local_files_only=True)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    return processor, model, device


def second_opinion(
    content: bytes,
    filename: str,
    regions: list[dict],
    organization_id: str,
) -> dict:
    if not inference_enabled():
        return {"model_version": None, "comparisons": 0}
    active = active_model_path(organization_id)
    if active is None:
        return {"model_version": None, "comparisons": 0}
    checkpoint, version = active
    mime = mime_for_document(filename, content)
    processor, model, device = _model(str(checkpoint))
    from PIL import Image
    import torch

    pages = {}
    compared = 0
    # Avoid consuming unbounded OCR cycles on long forms.
    with _INFER_LOCK, torch.inference_mode():
        for region in regions[:180]:
            if compared >= MAX_SECOND_OPINIONS:
                break
            if region.get("visual_clarity") not in (
                "ambiguous", "slight_uncertainty", "unreadable"
            ):
                continue
            field_path = str(region.get("field_path", ""))
            # A handwriting specialist is most useful on full handwritten fields.
            if "legibility" in field_path or ".label" in field_path:
                continue
            page = region.get("page")
            try:
                if page not in pages:
                    pages[page] = _render_page(content, mime, page)
                crop = _crop(pages[page], region["box_2d"])
                pixels = processor(images=crop.convert("RGB"), return_tensors="pt").pixel_values.to(device)
                ids = model.generate(pixels, max_new_tokens=128, num_beams=1)
                guess = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
                compared += 1
                if not guess or len(guess) > 120:
                    continue
                current = (region.get("transcription") or "").strip()
                if guess.casefold() != current.casefold():
                    options = region.get("alternate_readings") or []
                    if guess.casefold() not in {str(x).casefold() for x in options}:
                        region["alternate_readings"] = [*options[:2], guess]
                    if region.get("visual_clarity") == "slight_uncertainty":
                        region["visual_clarity"] = "ambiguous"
                    region["handwriting_disagreement"] = True
            except (OSError, ValueError, RuntimeError, KeyError, IndexError):
                # Keep Gemini result available for normal human review.
                continue
    return {"model_version": version, "comparisons": compared}
