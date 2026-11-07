"""Portable Billy TrOCR engine entrypoint.

Runs the SAME local handwriting recognizer on Windows, Linux or in a server
container, with no public listening port. This command is an offline smoke
harness for a future authenticated job-queue worker, not a deployed cloud
queue or service. It never sends document bytes to a model provider.

Usage:
  BILLY_HANDWRITING_INFERENCE_ENABLED=1 python -m billy.worker_cli \
    --document sample.pdf --regions regions.json --organization UUID \
    --output .billy/worker-result.json

`regions.json` must contain a Gemini-style regions list, or a JSON object
with a `regions` list. Only visually uncertain handwritten/mixed lines run
through TrOCR. The original structured fields are never overwritten.
"""
from __future__ import annotations

import argparse
import json
import os
import uuid
from pathlib import Path

from billy.handwriting_inference import inference_enabled, second_opinion
from billy.vision import MAX_VISION_BYTES

MAX_REGION_JSON_BYTES = 300_000
MAX_LOCAL_REGIONS = 180


def read_regions(path: Path) -> list[dict]:
    if not path.is_file() or path.stat().st_size > MAX_REGION_JSON_BYTES:
        raise ValueError("Regions JSON missing or exceeds the 300 KB safety limit.")
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("regions") if isinstance(payload, dict) else payload
    if not isinstance(rows, list) or len(rows) > MAX_LOCAL_REGIONS:
        raise ValueError("Expected a list of at most 180 Gemini regions.")
    if any(not isinstance(item, dict) for item in rows):
        raise ValueError("Every region must be a JSON object.")
    return rows


def run_local(document: Path, regions: Path, organization: str) -> dict:
    if not inference_enabled():
        raise RuntimeError("Set BILLY_HANDWRITING_INFERENCE_ENABLED=1 to enable local OCR.")
    org = str(uuid.UUID(organization))
    if not document.is_file():
        raise FileNotFoundError("Input document not found.")
    if not 0 < document.stat().st_size <= MAX_VISION_BYTES:
        raise ValueError("Document is empty or exceeds Billy Vision size limit.")
    document_bytes = document.read_bytes()
    supplied_regions = read_regions(regions)
    status = second_opinion(document_bytes, document.name, supplied_regions, org)
    return {"handwriting_second_opinion": status, "regions": supplied_regions}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run local Billy TrOCR on Gemini-located handwriting (Windows/Linux)."
    )
    parser.add_argument("--document", type=Path, required=True, help="Locally stored test document")
    parser.add_argument("--regions", type=Path, required=True, help="Gemini regions JSON file")
    parser.add_argument("--organization", required=True, help="Organization UUID for checkpoint isolation")
    parser.add_argument("--output", type=Path, help="Output JSON file; treat as sensitive")
    args = parser.parse_args()
    result = run_local(args.document, args.regions, args.organization)
    if args.output:
        if args.output.exists():
            parser.error("Refusing to overwrite an existing output file.")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # Open with restrictive permissions where the host OS supports them.
        fd = os.open(str(args.output), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as writer:
            json.dump(result, writer, ensure_ascii=False, indent=2)
            writer.write("\n")
    summary = result["handwriting_second_opinion"]
    print(json.dumps({
        "status": summary.get("status"),
        "model": summary.get("model_version"),
        "device": summary.get("device"),
        "compared": summary.get("comparisons", 0),
        "disagreements": summary.get("disagreements", 0),
        "output": str(args.output) if args.output else None,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
