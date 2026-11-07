"""Synthetic regression tests for annotated AI feedback.
No real documents, Gemini calls, or private teams are used.
"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from billy.accounts import Principal
from billy.records import feedback_summary, record_extraction, save_approval
from billy.vision import _clean_regions, _schema_with_regions, SCHEMA, FUEL_SCHEMA


def invoice():
    return {
        "supplier_name": "SYNTHETIC TEST", "supplier_tax_id": None,
        "customer_name": None, "invoice_number": "TEST-ABC",
        "issue_date": "2026-11-07", "due_date": None,
        "currency": "RON", "subtotal": "100.00", "vat_total": "19.00",
        "grand_total": "119.00", "lines": [
            {"description": "Synthetic service", "quantity": "1",
             "unit_price": "100.00", "net_amount": "100.00",
             "vat_rate": "19%", "vat_amount": "19.00"}
        ], "notes": []
    }


class VisualEvidenceTests(unittest.TestCase):
    def test_schema_retains_document_fields_and_adds_regions(self):
        invoice_schema = _schema_with_regions(SCHEMA)
        fuel_schema = _schema_with_regions(FUEL_SCHEMA)
        self.assertIn("invoice_number", invoice_schema["required"])
        self.assertIn("handwritten_entries", fuel_schema["required"])
        self.assertIn("regions", invoice_schema["required"])
        self.assertNotIn("regions", SCHEMA["required"])

    def test_regions_are_validated_without_manufacturing_confidence(self):
        candidates = [
            {"field_path": "invoice_number", "page": 1,
             "box_2d": [120, 220, 170, 490], "transcription": "TEST-ABC"},
            {"field_path": "lines[0].quantity", "page": 2,
             "box_2d": [300, 510, 350, 580], "transcription": "1"},
            {"field_path": "not_a_field", "page": 1,
             "box_2d": [0, 0, 1000, 1000], "transcription": "ignored"},
            {"field_path": "grand_total", "page": 0,
             "box_2d": [1, 2, 3, 4], "transcription": "ignored"},
            {"field_path": "issue_date", "page": 1,
             "box_2d": [500, 400, 100, 600], "transcription": "ignored"},
        ]
        result = _clean_regions(candidates, "invoice")
        self.assertEqual(len(result), 2)
        self.assertEqual(result[1]["field_path"], "lines[0].quantity")
        self.assertNotIn("confidence", result[0])

    def test_visual_clarity_and_alternatives_are_sanitized(self):
        regions = _clean_regions([
            {"field_path":"invoice_number", "page":1,
             "box_2d":[20,30,50,130], "transcription":"AB-7",
             "visual_clarity":"ambiguous","alternate_readings":["AB-1"],
             "visual_reason":"Handwritten 7 may resemble a 1."},
            {"field_path":"grand_total", "page":1,
             "box_2d":[100,30,150,130],"transcription":"100",
             "visual_clarity":"definitely_correct",
             "alternate_readings":[],"visual_reason":None},
        ], "invoice")
        self.assertEqual(regions[0]["visual_clarity"], "ambiguous")
        self.assertEqual(regions[0]["alternate_readings"], ["AB-1"])
        self.assertEqual(regions[1]["visual_clarity"], "unassessed")
        self.assertNotIn("confidence", regions[0])

    def test_repeated_digit_confusion_becomes_cautious_team_guidance(self):
        first = Principal("11111111-1111-4111-8111-111111111111",
                          "22222222-2222-4222-8222-222222222222", "operator")
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {"BILLY_APPROVAL_DB": str(Path(root)/"digits.sqlite3")}):
                for index in range(3):
                    predicted = invoice()
                    predicted["invoice_number"] = "TEST-" + str(index) + "-7"
                    corrected = invoice()
                    corrected["invoice_number"] = "TEST-" + str(index) + "-1"
                    eid = record_extraction({
                        "document_type":"invoice","invoice":predicted,
                        "source_sha256":f"{index+1:064x}"
                    },first)
                    save_approval(__import__("uuid").UUID(eid),"invoice",corrected,first)
                result = feedback_summary(first,"invoice")
                self.assertEqual(result["digit_confusions"][0]["previous"], "7")
                self.assertEqual(result["digit_confusions"][0]["reviewed"], "1")
                self.assertIn("7 vs 1",result["review_guidance"])
                self.assertNotIn("TEST-", result["review_guidance"])
                self.assertIn("Never auto-substitute",result["review_guidance"])

    def test_review_feedback_is_team_scoped_and_not_a_training_claim(self):
        first = Principal("11111111-1111-4111-8111-111111111111",
                          "22222222-2222-4222-8222-222222222222", "operator")
        other_team = Principal("11111111-1111-4111-8111-111111111111",
                               "33333333-3333-4333-8333-333333333333", "operator")
        initial = invoice()
        corrected = invoice()
        corrected["invoice_number"] = "FIXED-XYZ"
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {"BILLY_APPROVAL_DB": str(Path(root) / "reviews.sqlite3")}):
                before = feedback_summary(first, "invoice")
                self.assertEqual(before["samples"], 0)
                extraction_id = record_extraction({
                    "document_type": "invoice", "invoice": initial,
                    "source_sha256": "a" * 64,
                }, first)
                save_approval(__import__("uuid").UUID(extraction_id), "invoice", corrected, first)
                feedback = feedback_summary(first, "invoice")
                self.assertEqual(feedback["samples"], 1)
                self.assertEqual(feedback["fields"]["invoice_number"]["corrected"], 1)
                self.assertIn("invoice number", feedback["review_guidance"])
                self.assertNotIn("TEST-ABC", feedback["review_guidance"])
                self.assertNotIn("FIXED-XYZ", feedback["review_guidance"])
                self.assertEqual(feedback_summary(other_team, "invoice")["samples"], 0)


if __name__ == "__main__":
    unittest.main()
