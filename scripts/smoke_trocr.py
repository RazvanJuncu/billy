"""Local TrOCR smoke test for one text-line image (not a quality benchmark).

Example:
    python -m scripts.smoke_trocr
    python -m scripts.smoke_trocr --image path/to/redacted-line.png

Only the official, allowlisted Microsoft model is loaded locally. The first
run downloads its weights into the Hugging Face cache; nothing is uploaded.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Test local TrOCR Small on one line.")
    parser.add_argument("--image", type=Path, help="Optional approved/redacted single-line PNG or JPG")
    args = parser.parse_args()

    from PIL import Image, ImageDraw
    from billy.handwriting_inference import _model, pretrained_checkpoint
    import torch

    if args.image:
        if not args.image.is_file():
            parser.error("Image not found.")
        with Image.open(args.image) as original:
            if original.width * original.height > 20_000_000:
                parser.error("Image too large.")
            sample = original.convert("RGB").copy()
        source = "provided local image"
    else:
        # Synthetic PRINTED sample; tests installation only, not handwritten accuracy.
        sample = Image.new("RGB", (510, 95), "white")
        ImageDraw.Draw(sample).text((22, 30), "FUEL 170 L", fill="black")
        source = "synthetic printed sample (installation test only)"

    checkpoint = pretrained_checkpoint()
    started = time.perf_counter()
    processor, model, device = _model(checkpoint, False)
    loaded = time.perf_counter()
    with torch.inference_mode():
        pixel_values = processor(images=sample, return_tensors="pt").pixel_values.to(device)
        ids = model.generate(pixel_values, max_new_tokens=96, num_beams=1)
        reading = processor.batch_decode(ids, skip_special_tokens=True)[0]
    finished = time.perf_counter()
    print(json.dumps({
        "model": checkpoint,
        "device": str(device),
        "input": source,
        "reading": reading,
        "load_seconds": round(loaded - started, 2),
        "recognition_seconds": round(finished - loaded, 2),
        "note": "This measures a single local inference, not field accuracy.",
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
