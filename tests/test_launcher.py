from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class TestWindowsLauncher(unittest.TestCase):
    def test_local_only_backend(self):
        content=(ROOT/"start-billy.ps1").read_text(encoding="utf-8")
        self.assertIn('"127.0.0.1"', content)
        self.assertIn('"8000"', content)
        self.assertIn('"5173"', content)
        self.assertNotIn('0.0.0.0', content)

    def test_launcher_installs_requisite_packages(self):
        content=(ROOT/"start-billy.ps1").read_text(encoding="utf-8")
        self.assertIn("paddlepaddle==3.2.0", content)
        self.assertIn("requirements-ocr.txt", content)
        self.assertIn("requirements-api.txt", content)
        self.assertIn("uvicorn api:app", content)
        self.assertIn("Read-Host",content)

    def test_cmd_entrypoint(self):
        self.assertIn("start-billy.ps1", (ROOT/"start-billy.cmd").read_text())
