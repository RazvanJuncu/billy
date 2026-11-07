"""Synthetic aggregate benchmark: no private documents or model download."""
import json
import unittest

from scripts.evaluate_trocr_baseline import summarize


class TrOCRBaselineEvaluationTests(unittest.TestCase):
    def test_benchmark_compares_same_approved_line(self):
        row = (
            "invoice",
            json.dumps([{
                "field_path":"invoice_number",
                "script_type":"handwritten",
                "transcription":"AB-7",
                "trocr_reading":"AB-1",
            }, {
                "field_path":"currency",
                "script_type":"printed",
                "transcription":"RON",
                "trocr_reading":"RON",
            }]),
            json.dumps({"invoice_number":"AB-1", "currency":"RON"}),
        )
        report = summarize([row])
        self.assertEqual(report["compared_regions"],1)
        stats = report["fields"]["invoice.invoice_number"]
        self.assertEqual(stats["gemini_reviewer_agreement_percent"],0.0)
        self.assertEqual(stats["trocr_reviewer_agreement_percent"],100.0)
        self.assertEqual(stats["model_disagreement_percent"],100.0)
        self.assertGreater(stats["gemini_character_error_rate"],0)
        self.assertEqual(stats["trocr_character_error_rate"],0)
        self.assertNotIn("AB-1",json.dumps(report))
        self.assertNotIn("AB-7",json.dumps(report))

    def test_missing_trocr_or_verified_value_does_not_count(self):
        row=("fuel_release",json.dumps([
            {"field_path":"delivered_quantity","script_type":"handwritten",
             "transcription":"170","trocr_reading":None},
        ]),json.dumps({"delivered_quantity":"170"}))
        self.assertEqual(summarize([row])["compared_regions"],0)


if __name__=="__main__":
    unittest.main()
