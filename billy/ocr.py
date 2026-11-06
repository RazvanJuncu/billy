"""PaddleOCR PP-StructureV3 document extraction, with no eager Paddle imports."""
from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SUPPORTED_SUFFIXES = frozenset({".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"})
LATIN_MODEL = "latin_PP-OCRv5_mobile_rec"


@dataclass(frozen=True)
class PageResult:
    number: int
    markdown: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class DocumentResult:
    filename: str
    pages: list[PageResult]

    @property
    def markdown(self) -> str:
        return "\n\n---\n\n".join(page.markdown for page in self.pages)

    @property
    def json_data(self) -> dict[str, Any]:
        return {
            "schema_version": "0.1",
            "engine": "PaddleOCR PP-StructureV3",
            "filename": self.filename,
            "page_count": len(self.pages),
            "markdown": self.markdown,
            "pages": [
                {"number": p.number, "markdown": p.markdown, "ocr": p.raw}
                for p in self.pages
            ],
        }


def make_pipeline():
    """Download and initialize the pretrained model on first actual OCR request."""
    from paddleocr import PPStructureV3
    return PPStructureV3(
        use_doc_orientation_classify=True,
        use_doc_unwarping=False,
        use_textline_orientation=True,
        text_recognition_model_name=LATIN_MODEL,
    )


def extract_document(filename: str, content: bytes, pipeline: Any) -> DocumentResult:
    """Extract text, layout and table data from user content in a temporary directory."""
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_SUFFIXES:
        raise ValueError("Unsupported file format: PDF, PNG, JPG, TIFF or BMP only.")
    if not content:
        raise ValueError("The file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("The file exceeds the 20 MiB limit.")

    with tempfile.TemporaryDirectory(prefix="billy_ocr_") as directory:
        root = Path(directory)
        source = root / ("invoice" + extension)
        source.write_bytes(content)
        pages: list[PageResult] = []
        for number, prediction in enumerate(pipeline.predict(input=str(source)), start=1):
            output = root / ("page_" + str(number).zfill(4))
            output.mkdir()
            prediction.save_to_json(save_path=str(output))
            prediction.save_to_markdown(save_path=str(output))
            md_files = sorted(output.rglob("*.md"))
            json_files = sorted(output.rglob("*.json"))
            if not md_files or not json_files:
                raise RuntimeError("PaddleOCR did not produce Markdown and JSON outputs.")
            markdown = "\n\n".join(p.read_text(encoding="utf-8") for p in md_files)
            raw = {p.name: json.loads(p.read_text(encoding="utf-8")) for p in json_files}
            pages.append(PageResult(number, markdown, raw))
        if not pages:
            raise RuntimeError("PaddleOCR did not return any pages.")
        return DocumentResult(Path(filename).name, pages)
