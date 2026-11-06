"""Billy Vision tests use synthetic invoices and a mocked Gemini HTTP response."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from billy.accounts import Principal, require_member
from billy.records import record_extraction
from billy.vision import FuelRelease, extract_document, validate_fuel_release
from api import app
from billy.vision import Invoice, extract_invoice, money, validate_financials, mime_for_document

client = TestClient(app)

def sample_invoice():
    return {
        "supplier_name": "EXAMPLE SRL", "supplier_tax_id": "RO100",
        "customer_name": "TEST COMPANY", "invoice_number": "TEST-001",
        "issue_date": "01.11.2026", "due_date": None, "currency": "RON",
        "subtotal": "100,00", "vat_total": "19,00", "grand_total": "119,00",
        "lines": [{
            "description": "Service", "quantity": "2", "unit_price": "50,00",
            "net_amount": "100,00", "vat_rate": "19%", "vat_amount": "19,00"
        }], "notes": []
    }

class VisionTests(unittest.TestCase):
    def setUp(self):
        self.principal = Principal(
            user_id="11111111-1111-4111-8111-111111111111",
            organization_id="22222222-2222-4222-8222-222222222222",role="operator")
        app.dependency_overrides[require_member] = lambda: self.principal

    def tearDown(self):
        app.dependency_overrides.pop(require_member,None)

    def test_money_parses_romania_and_floats_are_not_used(self):
        self.assertEqual(str(money("1.234,56 RON")), "1234.56")
        self.assertEqual(str(money("1,234.56")), "1234.56")
        self.assertIsNone(money(None))

    def test_arithmetic_and_missing_fields(self):
        invoice = Invoice.model_validate(sample_invoice())
        self.assertEqual(validate_financials(invoice), [])
        modified = sample_invoice()
        modified["grand_total"] = "129,00"
        self.assertTrue(any("Subtotal + VAT" in w for w in validate_financials(Invoice.model_validate(modified))))

    def test_pdf_validation_rejects_wrong_header(self):
        with self.assertRaises(ValueError):
            mime_for_document("invoice.pdf", b"not a pdf")

    def test_vision_health_without_key(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            response = client.get("/api/vision/health")
            self.assertEqual(response.status_code, 200)
            self.assertFalse(response.json()["configured"])
            self.assertFalse(response.json()["excel_write_enabled"])

    def test_requires_key_for_vision(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            response = client.post("/api/vision/extract",files={"file":("a.pdf",b"%PDF-1.7")})
        self.assertEqual(response.status_code, 503)

    def test_identity_service_is_required(self):
        app.dependency_overrides.pop(require_member,None)
        with patch.dict(os.environ,{"SUPABASE_URL":"","SUPABASE_PUBLISHABLE_KEY":""}):
            response = client.get("/api/vision/health")
        self.assertEqual(response.status_code,503)

    def test_untrusted_origin_rejected(self):
        app.dependency_overrides.pop(require_member,None)
        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake-not-real"}):
            response = client.post("/api/vision/extract",files={"file":("a.pdf",b"%PDF-1.7")},headers={"Origin":"https://evil.example"})
        self.assertEqual(response.status_code, 403)

    def test_invalid_document_is_rejected_before_provider_call(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake-not-real"}):
            response = client.post("/api/vision/extract",files={"file":("invoice.pdf",b"notpdf")})
        self.assertEqual(response.status_code, 400)

    def test_provider_request_and_structured_response(self):
        invoice = sample_invoice()
        seen = []
        def handler(request):
            payload = json.loads(request.content)
            seen.append((str(request.url),payload,request.headers.get("x-goog-api-key")))
            return httpx.Response(200,json={
                "candidates":[{"content":{"parts":[{"text":json.dumps(invoice)}]}}],
                "usageMetadata":{"promptTokenCount":1200,"candidatesTokenCount":400,"totalTokenCount":1600}
            })
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as session:
                with patch.dict(os.environ, {"GEMINI_API_KEY":"synthetic-test-key", "BILLY_VISION_MODEL":"gemini-3.8-flash"}):
                    return await extract_invoice("invoice.pdf",b"%PDF-1.7 fake test",client=session)
        result=asyncio.run(run())
        self.assertEqual(result["invoice"]["grand_total"],"119,00")
        self.assertFalse(result["validation_warnings"])
        self.assertEqual(result["confidence"],None)
        self.assertEqual(result["usage"]["total_tokens"],1600)
        self.assertTrue(seen[0][0].endswith("gemini-3.8-flash:generateContent"))
        self.assertEqual(seen[0][2],"synthetic-test-key")
        self.assertEqual(seen[0][1]["generationConfig"]["responseMimeType"],"application/json")
        self.assertFalse(seen[0][1]["store"])

    def test_fuel_release_handwriting(self):
        sample = {
          "release_number":"FR-001","supplier_name":"TEST FUEL",
          "operator_name":"TEST AIR","airport":"LROP",
          "aircraft_registration":"YR-XYZ","flight_number":None,
          "delivery_date":"06.11.2026","fuel_type":"Jet A-1",
          "requested_quantity":"1500","delivered_quantity":None,
          "quantity_unit":"L","truck_identifier":None,
          "fueler_name":None,"receiver_name":None,
          "handwritten_entries":[{"label":"Uplift","transcription":None,"legibility":"illegible"}],
          "notes":["Quantity unclear"]
        }
        doc = FuelRelease.model_validate(sample)
        self.assertTrue(validate_fuel_release(doc))
        calls=[]
        def handler(request):
            body=json.loads(request.content)
            calls.append(body["generationConfig"]["responseJsonSchema"]["required"])
            return httpx.Response(200,json={"candidates":[{"content":{"parts":[{"text":json.dumps(sample)}]}}],"usageMetadata":{}})
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
                with patch.dict(os.environ,{"GEMINI_API_KEY":"synthetic-test-key"}):
                    return await extract_document("fuel.jpg",b"\xff\xd8synthetic","fuel_release",client=http)
        result=asyncio.run(run())
        self.assertEqual(result["document_type"],"fuel_release")
        self.assertIsNone(result["fuel_release"]["delivered_quantity"])
        self.assertIn("handwritten_entries",calls[0])

    def test_approval_is_owned_by_extracting_user_and_team(self):
        prediction={"document_type":"invoice","invoice":sample_invoice(),"source_sha256":"c"*64}
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ,{"BILLY_APPROVAL_DB":str(Path(directory)/"pilot.sqlite")}):
                extraction=record_extraction(prediction,self.principal)
                approved=sample_invoice()
                approved["supplier_name"]="CORRECTED SRL"
                body={"extraction_id":extraction,"document_type":"invoice","document":approved,"confirmed":True}
                first=client.post("/api/vision/approve",json=body)
                self.assertEqual(first.status_code,200,first.text)
                self.assertEqual(first.json()["correction_count"],1)
                self.assertFalse(first.json()["posted_to_excel"])
                second=client.post("/api/vision/approve",json=body)
                self.assertEqual(second.status_code,409)
                other=Principal("33333333-3333-4333-8333-333333333333",
                    self.principal.organization_id,"operator")
                app.dependency_overrides[require_member]=lambda:other
                blocked=client.post("/api/vision/approve",json=body)
                self.assertEqual(blocked.status_code,404)
                body["confirmed"]=False
                self.assertEqual(client.post("/api/vision/approve",json=body).status_code,400)
