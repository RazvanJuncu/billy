"""Portable CLI tests; do not download model weights or access network."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from billy.worker_cli import read_regions, run_local

ORG = "33333333-3333-4333-8333-333333333333"


class PortableWorkerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.regions = self.folder / "regions.json"
        self.document = self.folder / "sample.jpg"
        self.regions.write_text(json.dumps({
            "regions": [{
                "field_path": "invoice_number",
                "page": 1,
                "box_2d": [100, 100, 150, 400],
                "script_type": "handwritten",
                "visual_clarity": "ambiguous",
                "transcription": "AB-7",
            }],
        }), encoding="utf-8")
        self.document.write_bytes(b"\xff\xd8synthetic")

    def test_portable_runner_uses_existing_trocr_engine(self):
        def predicted(content, filename, regions, org):
            self.assertEqual(org, ORG)
            self.assertEqual(filename, "sample.jpg")
            regions[0]["trocr_reading"] = "AB-1"
            return {"status": "processed", "comparisons": 1, "disagreements": 1}
        with patch.dict(os.environ, {"BILLY_HANDWRITING_INFERENCE_ENABLED": "1"}), patch(
            "billy.worker_cli.second_opinion", side_effect=predicted,
        ) as model:
            output = run_local(self.document, self.regions, ORG)
        self.assertEqual(output["regions"][0]["transcription"], "AB-7")
        self.assertEqual(output["regions"][0]["trocr_reading"], "AB-1")
        self.assertEqual(output["handwriting_second_opinion"]["comparisons"], 1)
        model.assert_called_once()

    def test_processing_refuses_without_explicit_local_enablement(self):
        with patch.dict(os.environ, {"BILLY_HANDWRITING_INFERENCE_ENABLED": "0"}):
            with self.assertRaises(RuntimeError):
                run_local(self.document, self.regions, ORG)

    def test_regions_file_cannot_be_unbounded_or_malformed(self):
        self.regions.write_text(json.dumps([{}] * 181), encoding="utf-8")
        with self.assertRaises(ValueError):
            read_regions(self.regions)
        self.regions.write_text(json.dumps({"regions": ["bad"]}), encoding="utf-8")
        with self.assertRaises(ValueError):
            read_regions(self.regions)

    def test_rejects_invalid_organization_or_missing_document(self):
        with patch.dict(os.environ, {"BILLY_HANDWRITING_INFERENCE_ENABLED": "1"}):
            with self.assertRaises(ValueError):
                run_local(self.document, self.regions, "not-a-uuid")
            with self.assertRaises(FileNotFoundError):
                run_local(self.folder / "missing.jpg", self.regions, ORG)


if __name__ == "__main__":
    unittest.main()
