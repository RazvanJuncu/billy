"""Synthetic unit tests for Billy's local-only evaluation utility."""
import json
import unittest

from scripts.evaluate_approvals import normalized, summarize


class EvaluationTests(unittest.TestCase):
    def test_normalization_ignores_only_whitespace_and_case(self):
        self.assertEqual(normalized("  Jet   Fuel  "), "jet fuel")
        self.assertNotEqual(normalized("100.00"), normalized("100,00"))

    def test_approved_corrections_aggregate_without_exposing_values(self):
        predicted = {"invoice_number": "AB-10", "grand_total": "99.00",
                     "supplier_name": "Sky Services", "notes": ["unverified"]}
        reviewed = {"invoice_number": "AB-10", "grand_total": "100.00",
                    "supplier_name": "SKY SERVICES", "notes": ["reviewed"]}
        report = summarize([("invoice", json.dumps(predicted), json.dumps(reviewed))])
        self.assertEqual(report["total_approved_documents"], 1)
        fields = report["by_document_type"]["invoice"]["fields"]
        self.assertEqual(fields["invoice_number"]["agreed"], 1)
        self.assertEqual(fields["supplier_name"]["agreed"], 1)
        self.assertEqual(fields["grand_total"]["agreed"], 0)
        self.assertNotIn("notes", fields)
        self.assertNotIn("Sky Services", json.dumps(report))


if __name__ == "__main__":
    unittest.main()
