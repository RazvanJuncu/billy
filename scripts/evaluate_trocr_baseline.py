"""Aggregate real Gemini-vs-TrOCR handwriting benchmark from approved pilot data.

Compares both readings for the SAME localized handwritten field with the
human-approved value. Does not export original strings or document images.

This measures agreement with reviewed values, not perfectly verified OCR
accuracy: reviewers may miss errors and coordinates can be misplaced.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import uuid
from collections import defaultdict
from pathlib import Path

from billy.handwriting_train import levenshtein


def _text(value):
    return " ".join(value.split()).casefold() if isinstance(value, str) else None


def _field(document: dict, path: str):
    if not isinstance(document, dict) or not isinstance(path, str) or len(path) > 90:
        return None
    if re.fullmatch(r"[a-z_]+", path):
        return document.get(path)
    match = re.fullmatch(r"(lines|handwritten_entries)\[(\d{1,3})\]\.([a-z_]+)", path)
    if not match:
        return None
    items = document.get(match.group(1))
    if not isinstance(items, list):
        return None
    position = int(match.group(2))
    if position >= len(items) or not isinstance(items[position], dict):
        return None
    return items[position].get(match.group(3))


def summarize(rows: list[tuple[str, str, str]]) -> dict:
    totals = defaultdict(lambda: {
        "examples": 0,
        "gemini_matches": 0,
        "trocr_matches": 0,
        "disagreements": 0,
        "reference_chars": 0,
        "gemini_edits": 0,
        "trocr_edits": 0,
    })
    for document_type, regions_json, reviewed_json in rows:
        try:
            regions, approved = json.loads(regions_json), json.loads(reviewed_json)
        except (ValueError, TypeError):
            continue
        if not isinstance(regions, list) or not isinstance(approved, dict):
            continue
        for region in regions[:180]:
            if not isinstance(region, dict) or region.get("script_type") not in ("handwritten", "mixed"):
                continue
            path = region.get("field_path")
            target = _text(_field(approved, path))
            gemini = _text(region.get("transcription"))
            trocr = _text(region.get("trocr_reading"))
            if not target or gemini is None or trocr is None:
                continue
            key = document_type + "." + path
            stat = totals[key]
            stat["examples"] += 1
            stat["gemini_matches"] += int(gemini == target)
            stat["trocr_matches"] += int(trocr == target)
            stat["disagreements"] += int(gemini != trocr)
            stat["reference_chars"] += len(target)
            stat["gemini_edits"] += levenshtein(gemini, target)
            stat["trocr_edits"] += levenshtein(trocr, target)

    fields = {}
    for key, stat in sorted(totals.items()):
        n = stat["examples"]
        chars = stat["reference_chars"]
        fields[key] = {
            "samples": n,
            "gemini_reviewer_agreement_percent": round(100 * stat["gemini_matches"] / n, 1),
            "trocr_reviewer_agreement_percent": round(100 * stat["trocr_matches"] / n, 1),
            "model_disagreement_percent": round(100 * stat["disagreements"] / n, 1),
            "gemini_character_error_rate": round(stat["gemini_edits"] / chars, 4),
            "trocr_character_error_rate": round(stat["trocr_edits"] / chars, 4),
        }
    return {
        "compared_regions": sum(item["samples"] for item in fields.values()),
        "fields": fields,
        "warning": (
            "Agreement with human-approved values is not guaranteed ground truth. "
            "Inspect mislabeled crops and evaluate on independent documents."
        ),
    }


def fetch_rows(database: Path, organization: str) -> list[tuple[str, str, str]]:
    organization = str(uuid.UUID(organization))
    if not database.is_file():
        raise FileNotFoundError(f"Pilot database not found: {database}")
    uri = database.resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        return connection.execute(
            "SELECT e.document_type,e.regions_json,a.reviewed_json "
            "FROM extractions e JOIN team_approvals a ON "
            "a.extraction_id=e.id AND a.organization_id=e.organization_id "
            "WHERE e.organization_id=? ORDER BY a.id",
            (organization,),
        ).fetchall()


def main():
    parser = argparse.ArgumentParser(description="Compare local TrOCR versus Gemini on approved handwriting.")
    parser.add_argument("--database", type=Path, default=Path(".billy/approved.sqlite3"))
    parser.add_argument("--organization", required=True, help="Approved Billy organization UUID")
    parser.add_argument("--output", type=Path, help="Optional path for aggregate-only JSON")
    args = parser.parse_args()
    data = json.dumps(summarize(fetch_rows(args.database, args.organization)), indent=2)
    if args.output:
        args.output.write_text(data + "\n", encoding="utf-8")
    else:
        print(data)


if __name__ == "__main__":
    main()
