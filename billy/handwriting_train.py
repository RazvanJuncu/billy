"""Fine-tune a team-specific TrOCR handwriting model on approved line crops.

Requires a local GPU machine for practical training. Never runs from a web request
or GitHub Pages. Dataset, checkpoints and promotions remain outside the repository.

Usage:
  python -m billy.handwriting_train --organization UUID --epochs 2 --promote

A model version is promoted ONLY when it beats the previous active checkpoint on
a fixed, document-separated validation split. No metric implies 100% correctness.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from billy.handwriting_data import approved_examples, dataset_root

BASE_MODEL = "microsoft/trocr-base-handwritten"


def levenshtein(a: str, b: str) -> int:
    """Exact edit distance; dependency-free and tested on synthetic examples."""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ch in enumerate(a, start=1):
        current = [i]
        for j, other in enumerate(b, start=1):
            current.append(min(
                current[-1] + 1, prev[j] + 1,
                prev[j - 1] + (ch != other),
            ))
        prev = current
    return prev[-1]


def character_error_rate(reference_pairs: list[tuple[str, str]]) -> float:
    if not reference_pairs:
        raise ValueError("A held-out validation set is required.")
    total = sum(max(1, len(reference)) for _, reference in reference_pairs)
    return sum(levenshtein(prediction, reference) for prediction, reference
               in reference_pairs) / total


def split_by_document(samples: list[dict], fraction: float = .2):
    """Stable holdout: all crops from a document stay in the same split."""
    if not 0 < fraction < .5:
        raise ValueError("Holdout fraction must be between 0 and 0.5.")
    groups = defaultdict(list)
    for sample in samples:
        groups[sample["source_sha256"]].append(sample)
    if len(groups) < 5:
        raise ValueError("Need at least 5 distinct approved documents for evaluation.")
    train, holdout = [], []
    for key, members in sorted(groups.items()):
        # Same document will have the same split across model versions.
        score = int(hashlib.sha256(("billy-ocr-holdout-v1:" + key).encode()).hexdigest()[:12], 16)
        (holdout if score / 0xFFFFFFFFFFFF < fraction else train).extend(members)
    if not train or not holdout:
        raise ValueError("No usable holdout split. Collect more varied documents.")
    return train, holdout


def _safe_samples(organization: str) -> list[dict]:
    root = dataset_root()
    safe = []
    for item in approved_examples(organization):
        path = (root / item["crop_path"]).resolve()
        try:
            if not path.is_relative_to(root) or not path.is_file():
                continue
            if len(item["transcript"]) > 120:
                continue
        except (ValueError, OSError):
            continue
        safe.append({**item, "absolute_path": path})
    return safe


def _load_processor_and_model(checkpoint: str):
    # Keep costly ML imports out of the API process.
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel
    processor = TrOCRProcessor.from_pretrained(checkpoint)
    model = VisionEncoderDecoderModel.from_pretrained(checkpoint)
    model.config.decoder_start_token_id = processor.tokenizer.eos_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.eos_token_id = processor.tokenizer.eos_token_id
    return processor, model


def _active_checkpoint(folder: Path) -> str:
    pointer = folder / "active.json"
    if not pointer.is_file():
        return BASE_MODEL
    metadata = json.loads(pointer.read_text(encoding="utf-8"))
    name = metadata.get("checkpoint")
    if not isinstance(name, str) or not name.startswith("checkpoints/"):
        raise ValueError("Invalid active model pointer.")
    checkpoint = (folder / name).resolve()
    if not checkpoint.is_relative_to(folder.resolve()) or not checkpoint.is_dir():
        raise ValueError("Active model checkpoint is unavailable.")
    return str(checkpoint)


def _decode_batch(model, processor, samples, device, batch_size: int = 2):
    import torch
    from PIL import Image
    model.eval()
    decoded = []
    with torch.inference_mode():
        for start in range(0, len(samples), batch_size):
            rows = samples[start:start + batch_size]
            imgs = []
            for row in rows:
                with Image.open(row["absolute_path"]) as image:
                    imgs.append(image.convert("RGB"))
            tensors = processor(images=imgs, return_tensors="pt").pixel_values.to(device)
            ids = model.generate(tensors, max_new_tokens=128, num_beams=1)
            texts = processor.batch_decode(ids, skip_special_tokens=True)
            decoded.extend((text, row["transcript"]) for text, row in zip(texts, rows))
    return decoded


def _numeric_cer(pairs: list[tuple[str, str]]) -> float | None:
    numeric = [(pred, ref) for pred, ref in pairs if any(ch.isdigit() for ch in ref)]
    return character_error_rate(numeric) if numeric else None


def fine_tune(
    organization: str, epochs: int, batch_size: int, learning_rate: float,
    min_examples: int, promote: bool, min_improvement: float,
) -> dict:
    import torch
    from PIL import Image

    org = str(uuid.UUID(organization))
    samples = _safe_samples(org)
    docs = {s["source_sha256"] for s in samples}
    if len(samples) < min_examples or len(docs) < 10:
        raise ValueError(
            f"Not enough samples: {len(samples)} corrected crops from {len(docs)} documents. "
            f"Require at least {min_examples} crops and 10 distinct documents."
        )
    train, validation = split_by_document(samples)
    if epochs < 1 or epochs > 12 or batch_size < 1 or batch_size > 16:
        raise ValueError("Epochs must be 1–12 and batch size 1–16.")
    if not 0 < learning_rate <= .0001:
        raise ValueError("Learning rate outside safe fine-tuning range.")

    torch.manual_seed(23)
    random.seed(23)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    root = Path(os.getenv("BILLY_HANDWRITING_MODEL_DIR", ".billy/handwriting-models")).resolve()
    folder = root / org
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    initial = _active_checkpoint(folder)
    processor, model = _load_processor_and_model(initial)
    model.to(device)
    print(f"Training TrOCR on {device.type}: {len(train)} crops; "
          f"holdout {len(validation)} crops ({len(docs)} distinct source documents).")
    baseline_pairs = _decode_batch(model, processor, validation, device, batch_size)
    baseline_cer = character_error_rate(baseline_pairs)
    baseline_numeric = _numeric_cer(baseline_pairs)

    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    for epoch in range(epochs):
        random.shuffle(train)
        model.train()
        running_loss = 0.0
        batches = 0
        for index in range(0, len(train), batch_size):
            rows = train[index:index+batch_size]
            images = []
            for row in rows:
                with Image.open(row["absolute_path"]) as source:
                    images.append(source.convert("RGB"))
            pixels = processor(images=images, return_tensors="pt").pixel_values.to(device)
            labels = processor.tokenizer(
                [row["transcript"] for row in rows],
                return_tensors="pt", padding=True,
                max_length=128, truncation=True,
            ).input_ids
            labels[labels == processor.tokenizer.pad_token_id] = -100
            optimizer.zero_grad(set_to_none=True)
            loss = model(pixel_values=pixels, labels=labels.to(device)).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            running_loss += float(loss.detach())
            batches += 1
        print(f"Epoch {epoch + 1}/{epochs}: mean loss {running_loss/max(1,batches):.4f}")

    candidate_pairs = _decode_batch(model, processor, validation, device, batch_size)
    candidate_cer = character_error_rate(candidate_pairs)
    candidate_numeric = _numeric_cer(candidate_pairs)
    improvement = baseline_cer - candidate_cer
    # A numeric regression might make fuel quantities unsafe even if overall CER improves.
    numeric_ok = (baseline_numeric is None or candidate_numeric is None or
                  candidate_numeric <= baseline_numeric + .01)
    better = improvement >= min_improvement and numeric_ok
    version = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    checkpoint = folder / "checkpoints" / version
    checkpoint.mkdir(parents=True, exist_ok=False, mode=0o700)
    processor.save_pretrained(checkpoint)
    model.save_pretrained(checkpoint, safe_serialization=True)

    metrics = {
        "organization_id": org,
        "version": version,
        "base_checkpoint": "active" if initial != BASE_MODEL else BASE_MODEL,
        "train_examples": len(train),
        "validation_examples": len(validation),
        "train_documents": len({s["source_sha256"] for s in train}),
        "validation_documents": len({s["source_sha256"] for s in validation}),
        "baseline_cer": round(baseline_cer, 5),
        "candidate_cer": round(candidate_cer, 5),
        "baseline_numeric_cer": None if baseline_numeric is None else round(baseline_numeric, 5),
        "candidate_numeric_cer": None if candidate_numeric is None else round(candidate_numeric, 5),
        "improvement": round(improvement, 5),
        "numeric_regression_gate_passed": numeric_ok,
        "promotion_gate_passed": better,
        "promoted": bool(promote and better),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    (checkpoint / "metrics.json").write_text(
        json.dumps(metrics, indent=2) + "\n", encoding="utf-8",
    )
    if promote and better:
        # Atomic swap retains the last known-good checkpoint for rollback.
        tmp = folder / ("active-" + uuid.uuid4().hex + ".json")
        tmp.write_text(json.dumps({
            "checkpoint": "checkpoints/" + version,
            "version": version,
            "validation_cer": metrics["candidate_cer"],
        }, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, folder / "active.json")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune Billy team handwriting OCR.")
    parser.add_argument("--organization", required=True, help="Authorized organization UUID")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--min-examples", type=int, default=40)
    parser.add_argument("--min-improvement", type=float, default=.005)
    parser.add_argument("--promote", action="store_true", help="Promote only if held-out validation improves")
    args = parser.parse_args()
    metrics = fine_tune(
        args.organization, args.epochs, args.batch_size,
        args.learning_rate, args.min_examples, args.promote, args.min_improvement,
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
