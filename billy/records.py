"""Local pilot review journal — server-owned extraction IDs, scoped to user and team.

This SQLite module is intentionally NOT a production database or a shared cloud
audit log. Replace with server-managed Postgres for a deployed team instance.
"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import HTTPException

from billy.accounts import Principal
from billy.vision import Invoice, FuelRelease, validate_financials, validate_fuel_release


def database_path() -> Path:
    path = Path(os.getenv("BILLY_APPROVAL_DB", ".billy/approved.sqlite3")).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def init(connection: sqlite3.Connection) -> None:
    connection.execute("""
        CREATE TABLE IF NOT EXISTS extractions (
          id TEXT PRIMARY KEY,
          organization_id TEXT NOT NULL,
          created_by TEXT NOT NULL,
          document_type TEXT NOT NULL,
          source_sha256 TEXT NOT NULL,
          original_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS team_approvals (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          extraction_id TEXT NOT NULL UNIQUE REFERENCES extractions(id),
          organization_id TEXT NOT NULL,
          approved_by TEXT NOT NULL,
          approved_at TEXT NOT NULL,
          reviewed_json TEXT NOT NULL,
          correction_count INTEGER NOT NULL,
          warnings_json TEXT NOT NULL
        )
    """)
    connection.execute("CREATE INDEX IF NOT EXISTS extraction_team_idx ON extractions(organization_id,created_by)")


def record_extraction(result: dict, principal: Principal) -> str:
    doc_type = result["document_type"]
    prediction = result[doc_type]
    if not isinstance(prediction, dict):
        raise ValueError("No structured prediction to save.")
    extraction_id = str(uuid.uuid4())
    with sqlite3.connect(database_path(), timeout=10) as connection:
        init(connection)
        connection.execute(
            "INSERT INTO extractions (id,organization_id,created_by,document_type,source_sha256,original_json,created_at)"
            "VALUES (?,?,?,?,?,?,?)",
            (
                extraction_id, principal.organization_id, principal.user_id, doc_type,
                result["source_sha256"], json.dumps(prediction,ensure_ascii=False),
                datetime.now(timezone.utc).isoformat()
            )
        )
    return extraction_id


def save_approval(extraction_id: uuid.UUID, doc_type: str, reviewed: dict, principal: Principal) -> dict:
    with sqlite3.connect(database_path(), timeout=10) as connection:
        init(connection)
        extraction = connection.execute(
            "SELECT document_type,original_json FROM extractions"
            " WHERE id=? AND organization_id=? AND created_by=?",
            (str(extraction_id),principal.organization_id,principal.user_id),
        ).fetchone()
        if not extraction:
            raise HTTPException(status_code=404,detail="This extraction does not belong to your account and team.")
        if extraction[0] != doc_type:
            raise HTTPException(status_code=400,detail="Document type does not match the original extraction.")
        original = json.loads(extraction[1])
        model = FuelRelease if doc_type == "fuel_release" else Invoice
        document = model.model_validate(reviewed)
        approved = document.model_dump(mode="json")
        corrections = sum(original.get(k) != approved.get(k) for k in approved)
        warnings = validate_fuel_release(document) if doc_type == "fuel_release" else validate_financials(document)
        try:
            cursor = connection.execute(
                "INSERT INTO team_approvals "
                "(extraction_id,organization_id,approved_by,approved_at,reviewed_json,correction_count,warnings_json)"
                "VALUES (?,?,?,?,?,?,?)",
                (
                    str(extraction_id),principal.organization_id,principal.user_id,
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(approved,ensure_ascii=False), corrections,
                    json.dumps(warnings,ensure_ascii=False),
                )
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409,detail="This extraction was already approved.") from None
        approval_id=cursor.lastrowid
    return {
        "status":"approved","approval_id":approval_id,
        "document_type":doc_type,"correction_count":corrections,
        "validation_warnings":warnings,"posted_to_excel":False,
    }


# Privacy-preserving feedback memory for the LOCAL pilot only.
# Corrections are scoped by the authenticated organization, never by an untrusted
# client-supplied team ID. No document values are returned in summaries/prompts.
_FEEDBACK_KEYS = {
    "invoice": (
        "supplier_name", "supplier_tax_id", "customer_name", "invoice_number",
        "issue_date", "due_date", "currency", "subtotal", "vat_total", "grand_total",
    ),
    "fuel_release": (
        "release_number", "supplier_name", "operator_name", "airport",
        "aircraft_registration", "flight_number", "delivery_date", "fuel_type",
        "requested_quantity", "delivered_quantity", "quantity_unit",
        "truck_identifier", "fueler_name", "receiver_name",
    ),
}


def _review_normalize(value: object) -> str | None:
    if value is None:
        return None
    return " ".join(str(value).split()).casefold()


def feedback_summary(principal: Principal, document_type: str) -> dict:
    """Historical reviewer agreement, not calibrated per-document probability.

    No user IDs, source documents or field values leave this function.
    """
    keys = _FEEDBACK_KEYS.get(document_type)
    if not keys:
        return {"samples": 0, "fields": {}, "review_guidance": ""}
    path = database_path()
    if not path.exists():
        return {"samples": 0, "fields": {}, "review_guidance": ""}
    with sqlite3.connect(path, timeout=10) as connection:
        init(connection)
        rows = connection.execute(
            "SELECT e.original_json,a.reviewed_json "
            "FROM team_approvals a JOIN extractions e ON e.id=a.extraction_id "
            "WHERE e.organization_id=? AND a.organization_id=? "
            "AND e.document_type=? ORDER BY a.id DESC LIMIT 200",
            (principal.organization_id, principal.organization_id, document_type),
        ).fetchall()
    fields = {key: {"reviewed": 0, "agreed": 0, "corrected": 0} for key in keys}
    for before_json, after_json in rows:
        try:
            before, after = json.loads(before_json), json.loads(after_json)
        except (ValueError, TypeError):
            continue
        if not isinstance(before, dict) or not isinstance(after, dict):
            continue
        for key in keys:
            if key not in after:
                continue
            prior, corrected = _review_normalize(before.get(key)), _review_normalize(after[key])
            if prior is None and corrected is None:
                continue  # An empty field says nothing about transcription accuracy.
            entry = fields[key]
            entry["reviewed"] += 1
            if prior == corrected:
                entry["agreed"] += 1
            else:
                entry["corrected"] += 1

    # Only aggregate a limited, fixed field vocabulary into subsequent prompts.
    # No invoice numbers, names, phone numbers or other original values are injected.
    most_corrected = sorted(
        [(key, v["corrected"]) for key, v in fields.items() if v["corrected"]],
        key=lambda item: (-item[1], item[0]),
    )[:5]
    guidance = ""
    if most_corrected:
        labels = ", ".join(key.replace("_", " ") for key, _ in most_corrected)
        guidance = (
            "Previous human reviews of this team's documents frequently corrected: "
            + labels + ". Examine those printed fields especially carefully; "
            "never copy values from previous documents or fill unseen values."
        )
    return {
        "samples": len(rows),
        "fields": fields,
        "review_guidance": guidance,
    }
