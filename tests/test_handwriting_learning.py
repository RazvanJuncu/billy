"""Synthetic, keyless regression tests for the learnable handwriting pipeline."""
from __future__ import annotations

import hashlib
import io
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from api import app
from billy.accounts import require_member

from billy.accounts import Principal
from billy.records import record_extraction, save_approval
from billy.handwriting_data import (
    approved_examples, capture_enabled, collect_verified_crops, _field_value,
    _crop,
)
from billy.handwriting_train import levenshtein, character_error_rate, split_by_document
from billy.handwriting_worker import should_train, work_once
from billy.handwriting_inference import active_model_path


ORG = "22222222-2222-4222-8222-222222222222"
OTHER = "33333333-3333-4333-8333-333333333333"
USER = "11111111-1111-4111-8111-111111111111"


def invoice(number="INV-7"):
    return {
        "supplier_name": "DEMO ONLY", "supplier_tax_id": None,
        "customer_name": None, "invoice_number": number,
        "issue_date": None, "due_date": None,
        "currency": "RON", "subtotal": "100", "vat_total": "19",
        "grand_total": "119", "lines": [], "notes": [],
    }


class HandwritingDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        env = patch.dict(os.environ, {
            "BILLY_APPROVAL_DB": str(Path(self.temp.name) / "review.sqlite3"),
            "BILLY_HANDWRITING_DATA_DIR": str(Path(self.temp.name) / "cropped"),
            "BILLY_HANDWRITING_MODEL_DIR": str(Path(self.temp.name) / "models"),
            "BILLY_HANDWRITING_CAPTURE_ENABLED": "1",
            "BILLY_HANDWRITING_AUTOTRAIN_ENABLED": "0",
        })
        env.start()
        self.addCleanup(env.stop)
        self.owner = Principal(USER, ORG, "operator")

    def _approved(self, payload):
        evidence = [{
            "field_path": "invoice_number", "page": 1,
            "box_2d": [100, 100, 300, 510],
            "transcription": "INV-7", "visual_clarity": "ambiguous",
        }]
        extraction = record_extraction({
            "document_type": "invoice",
            "invoice": invoice("INV-7"),
            "regions": evidence,
            "source_sha256": hashlib.sha256(payload).hexdigest(),
        }, self.owner)
        save_approval(uuid.UUID(extraction), "invoice", invoice("INV-1"), self.owner)
        return uuid.UUID(extraction)

    def test_crops_are_approved_source_bound_and_tenant_scoped(self):
        from PIL import Image, ImageDraw
        image = Image.new("RGB", (800, 400), "white")
        ImageDraw.Draw(image).text((160, 70), "INV-7", fill="black")
        output = io.BytesIO()
        image.save(output, format="PNG")
        payload = output.getvalue()
        extraction = self._approved(payload)
        result = collect_verified_crops(extraction, payload, "source.png", self.owner)
        self.assertEqual(result["examples_added"], 1)
        self.assertFalse(result["model_updated"])
        examples = approved_examples(ORG)
        self.assertEqual(len(examples), 1)
        self.assertEqual(examples[0]["transcript"], "INV-1")
        self.assertFalse("DEMO ONLY" in str(examples))
        destination = Path(os.environ["BILLY_HANDWRITING_DATA_DIR"]) / examples[0]["crop_path"]
        self.assertTrue(destination.is_file())
        with Image.open(destination) as crop:
            self.assertGreaterEqual(crop.width, 14)
            self.assertGreaterEqual(crop.height, 8)
        second = collect_verified_crops(extraction, payload, "source.png", self.owner)
        self.assertEqual(second["examples_added"], 0)
        self.assertEqual(len(approved_examples(ORG)), 1)
        self.assertEqual(approved_examples(OTHER), [])

    def test_wrong_source_and_user_are_rejected(self):
        from PIL import Image
        result = io.BytesIO()
        Image.new("RGB", (800, 400), "white").save(result, "PNG")
        payload = result.getvalue()
        extraction = self._approved(payload)
        other = Principal(USER, OTHER, "operator")
        with self.assertRaises(HTTPException) as blocked:
            collect_verified_crops(extraction, payload, "a.png", other)
        self.assertEqual(blocked.exception.status_code, 404)
        with self.assertRaises(HTTPException) as blocked:
            collect_verified_crops(extraction, b"\x89PNG\r\n\x1a\nnotoriginal", "a.png", self.owner)
        self.assertEqual(blocked.exception.status_code, 400)

    def test_collection_disabled_by_default(self):
        with patch.dict(os.environ, {"BILLY_HANDWRITING_CAPTURE_ENABLED": "0"}):
            self.assertFalse(capture_enabled())
            with self.assertRaises(HTTPException) as blocked:
                collect_verified_crops(uuid.uuid4(), b"abc", "a.png", self.owner)
            self.assertEqual(blocked.exception.status_code, 503)

    def test_training_endpoint_requires_explicit_server_toggle_and_consent(self):
        client = TestClient(app)
        app.dependency_overrides[require_member] = lambda: self.owner
        self.addCleanup(lambda: app.dependency_overrides.pop(require_member, None))
        with patch.dict(os.environ, {"BILLY_HANDWRITING_CAPTURE_ENABLED": "0"}):
            blocked = client.post(
                "/api/handwriting/examples",
                data={"extraction_id": str(uuid.uuid4()), "training_consent": "true"},
                files={"file": ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")},
            )
            self.assertEqual(blocked.status_code, 503)
            progress = client.get("/api/handwriting/status")
            self.assertEqual(progress.status_code, 200)
            self.assertFalse(progress.json()["capture_enabled"])
            self.assertEqual(progress.json()["training_samples"], 0)
        with patch.dict(os.environ, {"BILLY_HANDWRITING_CAPTURE_ENABLED": "1"}):
            no_consent = client.post(
                "/api/handwriting/examples",
                data={"extraction_id": str(uuid.uuid4()), "training_consent": "false"},
                files={"file": ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")},
            )
            self.assertEqual(no_consent.status_code, 400)

    def test_field_paths_are_bounded_and_cannot_execute_expressions(self):
        document = {"invoice_number": "Z-7", "lines": [{"quantity": "1"}]}
        self.assertEqual(_field_value(document, "invoice_number"), "Z-7")
        self.assertEqual(_field_value(document, "lines[0].quantity"), "1")
        self.assertIsNone(_field_value(document, "__class__.__dict__"))
        self.assertIsNone(_field_value(document, "lines[999].quantity"))
        from PIL import Image
        with self.assertRaises(ValueError):
            _crop(Image.new("RGB", (100, 100)), [999, 999, 1, 1])


class HandwritingTrainingTests(unittest.TestCase):
    def test_cer_and_holdout_are_real_metrics(self):
        self.assertEqual(levenshtein("7", "1"), 1)
        self.assertEqual(levenshtein("flight", "flight"), 0)
        self.assertAlmostEqual(character_error_rate([("7", "1"), ("ABC", "ABC")]), .25)
        rows = [
            {"source_sha256": f"{i:064x}", "transcript": "INV-7"}
            for i in range(35)
        ]
        # Fixed deterministic document hash; a split cannot leak crops
        # from one invoice into both training and validation.
        train, val = split_by_document(rows)
        self.assertTrue(train and val)
        self.assertFalse({r["source_sha256"] for r in train} &
                         {r["source_sha256"] for r in val})

    def test_autotraining_is_disabled_and_uses_new_data_thresholds(self):
        with patch.dict(os.environ, {"BILLY_HANDWRITING_AUTOTRAIN_ENABLED": "0"}):
            self.assertEqual(work_once(ORG)["status"], "disabled")
        with patch("billy.handwriting_worker.approved_examples") as mocked:
            mocked.return_value = [{"source_sha256": f"{i:064x}"} for i in range(15)]
            first = should_train(ORG, min_total=10, min_new=5, journal={})
            self.assertTrue(first["eligible"])
            next_run = should_train(ORG, min_total=10, min_new=5,
                                    journal={"last_attempt_samples": 15})
            self.assertFalse(next_run["eligible"])

    def test_model_pointer_rejects_team_traversal(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {"BILLY_HANDWRITING_MODEL_DIR": root}):
                folder = Path(root) / ORG
                folder.mkdir()
                (folder / "active.json").write_text(
                    '{"checkpoint": "checkpoints/../../other", "version": "bad"}')
                with self.assertRaises(ValueError):
                    active_model_path(ORG)


if __name__ == "__main__":
    unittest.main()
