"""Local-only evaluation of Billy's reviewed Vision extractions.

Read the pilot SQLite journal without writing any document data or user identities.
Numbers describe agreement with human-approved fields, NOT verified model accuracy.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any


def normalized(value: Any) -> Any:
    if isinstance(value, str):
        return " ".join(value.split()).casefold()
    if isinstance(value, list):
        return [normalized(entry) for entry in value]
    if isinstance(value, dict):
        return {key: normalized(val) for key, val in value.items()}
    return value


def summarize(rows: list[tuple[str, str, str]]) -> dict[str, Any]:
    counts: dict[str, Any] = defaultdict(
        lambda: {"documents": 0, "fields": defaultdict(lambda: [0, 0])}
    )
    for kind, original_json, corrected_json in rows:
        prediction = json.loads(original_json)
        reviewed = json.loads(corrected_json)
        if not isinstance(prediction, dict) or not isinstance(reviewed, dict):
            continue
        group = counts[kind]
        group["documents"] += 1
        # Corrected fields are the denominator; notes are editorial rather than OCR.
        for key, value in reviewed.items():
            if key == "notes":
                continue
            tally = group["fields"][key]
            tally[1] += 1
            if normalized(prediction.get(key)) == normalized(value):
                tally[0] += 1

    report = {"total_approved_documents": sum(g["documents"] for g in counts.values()),
              "by_document_type": {}}
    for kind in sorted(counts):
        group = counts[kind]
        fields = {}
        for key, (matches, total) in sorted(group["fields"].items()):
            fields[key] = {
                "agreed": matches,
                "reviewed": total,
                "agreement_percent": round(100 * matches / total, 1) if total else None,
            }
        report["by_document_type"][kind] = {
            "documents": group["documents"],
            "fields": fields,
        }
    return report


def load_rows(path: Path) -> list[tuple[str, str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"No Billy approval journal found: {path}")
    with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as connection:
        return connection.execute(
            "SELECT e.document_type, e.original_json, a.reviewed_json "
            "FROM team_approvals AS a JOIN extractions AS e ON e.id=a.extraction_id "
            "AND e.organization_id=a.organization_id "
            "ORDER BY a.id"
        ).fetchall()


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate approved Billy Vision predictions locally.")
    parser.add_argument("--database", type=Path, default=Path(".billy/approved.sqlite3"),
                        help="Path to local pilot approval SQLite database")
    parser.add_argument("--output", type=Path, help="Optional aggregate JSON report output")
    args = parser.parse_args()
    report = summarize(load_rows(args.database.resolve()))
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
