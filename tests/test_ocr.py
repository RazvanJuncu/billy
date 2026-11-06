import unittest
import json
from pathlib import Path
from unittest.mock import Mock
from billy.ocr import MAX_UPLOAD_BYTES, extract_document, DocumentResult, PageResult


class FakePrediction:
    def __init__(self, number):
        self.number = number

    def save_to_json(self, save_path):
        Path(save_path, "result.json").write_text(
            json.dumps({"page": self.number, "boxes": [[0, 0, 4, 4]]}), encoding="utf-8"
        )

    def save_to_markdown(self, save_path):
        Path(save_path, "result.md").write_text(
            "| Item | Price |\n|---|---|\n| Sample " + str(self.number) + " | 12.00 |",
            encoding="utf-8",
        )


class TestOCR(unittest.TestCase):
    def test_multipage(self):
        pipeline = Mock()
        pipeline.predict.return_value = [FakePrediction(1), FakePrediction(2)]
        result = extract_document("invoice.pdf", b"stub", pipeline)
        self.assertEqual(result.json_data["page_count"], 2)
        self.assertIn("Sample 1", result.markdown)
        self.assertIn("Sample 2", result.markdown)
        self.assertEqual(result.json_data["pages"][1]["ocr"]["result.json"]["page"], 2)

    def test_sanitizes_uploaded_filename(self):
        pipeline = Mock()
        pipeline.predict.return_value = [FakePrediction(1)]
        result = extract_document("../../invoice.png", b"stub", pipeline)
        self.assertEqual(result.filename, "invoice.png")
        self.assertEqual(Path(pipeline.predict.call_args.kwargs["input"]).name, "invoice.png")

    def test_invalid_extension(self):
        with self.assertRaises(ValueError):
            extract_document("invoice.exe", b"stub", Mock())

    def test_empty_file(self):
        with self.assertRaises(ValueError):
            extract_document("invoice.pdf", b"", Mock())

    def test_oversized_file(self):
        with self.assertRaises(ValueError):
            extract_document("invoice.pdf", b"x" * (MAX_UPLOAD_BYTES + 1), Mock())

    def test_no_pages(self):
        pipeline = Mock()
        pipeline.predict.return_value = []
        with self.assertRaisesRegex(RuntimeError, "any pages"):
            extract_document("invoice.pdf", b"stub", pipeline)

    def test_document_properties(self):
        result = DocumentResult("invoice.pdf", [PageResult(1, "A", {}), PageResult(2, "B", {})])
        self.assertEqual(result.markdown, "A\n\n---\n\nB")
        self.assertEqual(result.json_data["pages"][0]["number"], 1)
