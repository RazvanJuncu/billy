"""Synthetic local-baseline tests: no Gemini calls or model downloads."""
from __future__ import annotations

import contextlib
import io
import os
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from billy.handwriting_inference import (
    DEFAULT_PRETRAINED,
    chosen_model,
    inference_status,
    pretrained_checkpoint,
    second_opinion,
)


ORG = "22222222-2222-4222-8222-222222222222"


class FakeTensor:
    def to(self, device):
        return self


class FakeProcessor:
    def __call__(self, **kwargs):
        return types.SimpleNamespace(pixel_values=FakeTensor())

    def batch_decode(self, values, skip_special_tokens=True):
        return ["AB-1"]


class FakeModel:
    def generate(self, pixels, **kwargs):
        return [[1, 2, 3]]


class PretrainedTrOCRTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        settings = patch.dict(os.environ, {
            "BILLY_HANDWRITING_MODEL_DIR": str(self.root),
            "BILLY_HANDWRITING_INFERENCE_ENABLED": "1",
            "BILLY_TROCR_PRETRAINED_MODEL": DEFAULT_PRETRAINED,
        })
        settings.start()
        self.addCleanup(settings.stop)

    def test_pretrained_small_is_available_before_any_training(self):
        model, display, local_only = chosen_model(ORG)
        self.assertEqual(model, "microsoft/trocr-small-handwritten")
        self.assertEqual(display, model)
        self.assertFalse(local_only)
        status = inference_status(ORG)
        self.assertEqual(status["source"], "pretrained")
        self.assertTrue(status["enabled"])

    def test_model_name_cannot_be_supplied_by_untrusted_input(self):
        with patch.dict(os.environ, {
            "BILLY_TROCR_PRETRAINED_MODEL": "somewhere/arbitrary-code"
        }):
            with self.assertRaises(ValueError):
                pretrained_checkpoint()

    def test_clear_and_printed_regions_do_not_load_trocr(self):
        doc = [
            {"field_path": "invoice_number", "script_type": "printed",
             "visual_clarity": "ambiguous"},
            {"field_path": "grand_total", "script_type": "handwritten",
             "visual_clarity": "clear"},
        ]
        with patch("billy.handwriting_inference._model") as load:
            result = second_opinion(b"unused", "sample.png", doc, ORG)
        self.assertEqual(result["status"], "no_eligible_regions")
        self.assertEqual(result["comparisons"], 0)
        load.assert_not_called()

    def test_pretrained_trocr_reports_a_disagreement_without_changing_structured_fields(self):
        image = Image.new("RGB", (300, 100), "white")
        stream = io.BytesIO()
        image.save(stream, format="PNG")
        content = stream.getvalue()
        region = {
            "field_path": "invoice_number",
            "page": 1,
            "box_2d": [100, 100, 240, 800],
            "script_type": "handwritten",
            "visual_clarity": "ambiguous",
            "transcription": "AB-7",
            "alternate_readings": [],
        }
        fake_torch = types.SimpleNamespace(inference_mode=contextlib.nullcontext)
        with (
            patch("billy.handwriting_inference._model",
                  return_value=(FakeProcessor(), FakeModel(), "cpu")) as loader,
            patch("billy.handwriting_inference._render_page", return_value=image),
            patch("billy.handwriting_inference._crop", return_value=image),
            patch.dict("sys.modules", {"torch": fake_torch}),
        ):
            result = second_opinion(content, "test.png", [region], ORG)
        self.assertEqual(result["status"], "processed")
        self.assertEqual(result["source"], "pretrained")
        self.assertEqual(result["device"], "cpu")
        self.assertEqual(result["comparisons"], 1)
        self.assertEqual(result["disagreements"], 1)
        self.assertEqual(region["transcription"], "AB-7")
        self.assertEqual(region["trocr_reading"], "AB-1")
        self.assertTrue(region["handwriting_disagreement"])
        self.assertIn("AB-1", region["alternate_readings"])
        loader.assert_called_once_with(DEFAULT_PRETRAINED, False)

    def test_trocr_only_runs_when_explicitly_enabled(self):
        with patch.dict(os.environ, {"BILLY_HANDWRITING_INFERENCE_ENABLED": "0"}):
            self.assertFalse(inference_status(ORG)["enabled"])
            result = second_opinion(b"unused", "sample.png", [], ORG)
            self.assertEqual(result["status"], "disabled")


if __name__ == "__main__":
    unittest.main()
