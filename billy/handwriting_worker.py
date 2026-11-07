"""Safe one-shot auto-train worker for a LOCAL Billy installation.

Run this from a trusted host cron/systemd timer, never inside FastAPI requests:
    BILLY_HANDWRITING_AUTOTRAIN_ENABLED=1 \
      python -m billy.handwriting_worker --organization TEAM_UUID

The worker promotes a checkpoint only after held-out CER improves without a
material numeric-reading regression. It keeps an attempt journal to avoid
retraining the same corrections forever.
"""
from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from billy.handwriting_data import approved_examples
from billy.handwriting_train import fine_tune


def should_train(organization_id: str, min_total: int, min_new: int, journal: dict) -> dict:
    samples = approved_examples(organization_id)
    documents = len({row["source_sha256"] for row in samples})
    last_count = int(journal.get("last_attempt_samples", 0))
    ready = len(samples) >= min_total and documents >= 10 and len(samples) - last_count >= min_new
    return {
        "eligible": ready,
        "samples": len(samples),
        "documents": documents,
        "new_since_last_attempt": max(0, len(samples) - last_count),
    }


def work_once(organization: str, min_total: int = 40, min_new: int = 20,
              epochs: int = 2, batch_size: int = 2) -> dict:
    if os.getenv("BILLY_HANDWRITING_AUTOTRAIN_ENABLED") != "1":
        return {"status": "disabled", "started": False}
    org = str(uuid.UUID(organization))
    root = Path(os.getenv("BILLY_HANDWRITING_MODEL_DIR", ".billy/handwriting-models")).resolve()
    folder = root / org
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    journal_path = folder / "last-attempt.json"
    journal = json.loads(journal_path.read_text(encoding="utf-8")) if journal_path.is_file() else {}
    status = should_train(org, min_total, min_new, journal)
    if not status["eligible"]:
        return {"status": "more_examples_needed", "started": False, **status}
    # Atomic process lock; a stalled trainer should be investigated instead of
    # launching a concurrent GPU job over the same private training set.
    lock = folder / ".training.lock"
    try:
        lock.mkdir(mode=0o700)
    except FileExistsError:
        return {"status": "already_running", "started": False, **status}
    try:
        metrics = fine_tune(
            org, epochs=epochs, batch_size=batch_size, learning_rate=2e-5,
            min_examples=min_total, promote=True, min_improvement=.005,
        )
        journal = {
            "last_attempt_samples": status["samples"],
            "last_attempt_at": datetime.now(timezone.utc).isoformat(),
            "last_attempt_promoted": metrics["promoted"],
            "last_attempt_version": metrics["version"],
            "last_attempt_candidate_cer": metrics["candidate_cer"],
        }
        temp = folder / ("last-attempt-" + uuid.uuid4().hex + ".json")
        temp.write_text(json.dumps(journal, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, journal_path)
        return {"status": "promoted" if metrics["promoted"] else "held_for_review",
                "started": True, **status, "metrics": metrics}
    finally:
        lock.rmdir()


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and promote team-specific handwriting OCR.")
    parser.add_argument("--organization", required=True, help="Authenticated team UUID")
    parser.add_argument("--min-total", type=int, default=40)
    parser.add_argument("--min-new", type=int, default=20)
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=2)
    args = parser.parse_args()
    if args.min_total < 10 or args.min_new < 1:
        parser.error("At least 10 total examples and 1 new example are required.")
    result = work_once(args.organization, args.min_total, args.min_new,
                       args.epochs, args.batch_size)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
