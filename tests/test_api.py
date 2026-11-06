import unittest
from unittest.mock import patch, Mock
from fastapi.testclient import TestClient
from billy.ocr import DocumentResult, PageResult
from api import app, get_pipeline
from billy.accounts import Principal, require_member

client = TestClient(app)


class TestAPI(unittest.TestCase):
    def setUp(self):
        app.dependency_overrides[require_member] = lambda: Principal(
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222","operator")
    def tearDown(self):
        app.dependency_overrides.pop(require_member,None)
        get_pipeline.cache_clear()

    def test_health_is_not_model_ready(self):
        get_pipeline.cache_clear()
        result = client.get("/api/health")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["status"], "online")
        self.assertFalse(result.json()["model_loaded"])

    def test_bad_extension(self):
        result = client.post("/api/parse", files={"file": ("invoice.exe", b"stuff")})
        self.assertEqual(result.status_code, 400)

    def test_valid_file_with_mocked_ocr(self):
        doc = DocumentResult("invoice.pdf", [PageResult(1, "sample", {"test": True})])
        with patch("api.get_pipeline", return_value=object()), patch("api.extract_document", return_value=doc):
            result = client.post("/api/parse", files={"file": ("invoice.pdf", b"fake")})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["pages"][0]["markdown"], "sample")

    def test_rejects_untrusted_origin_before_inference(self):
        result = client.post("/api/parse", files={"file": ("invoice.pdf", b"stub")}, headers={"Origin": "https://untrusted.example"})
        self.assertEqual(result.status_code, 403)

    def test_cors_allowed_host(self):
        r = client.options("/api/parse", headers={
            "Origin": "https://razvanjuncu.github.io",
            "Access-Control-Request-Method": "POST"
        })
        self.assertEqual(r.headers.get("access-control-allow-origin"), "https://razvanjuncu.github.io")
