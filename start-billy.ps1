# Billy — one-command local OCR launcher for Windows (CPU).
# All services are bound to 127.0.0.1. Do not expose this unauthenticated API to the internet.
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$ready = Join-Path $PSScriptRoot ".venv\.billy-ocr-ready"
$webProcess = $null

function Assert-OK([string]$description) {
    if ($LASTEXITCODE -ne 0) {
        throw "$description failed (exit code $LASTEXITCODE). Read the error above."
    }
}

try {
    Write-Host ""
    Write-Host "  billy. / LOCAL DOCUMENT ENGINE" -ForegroundColor Cyan
    Write-Host "  --------------------------------" -ForegroundColor DarkGray

    if (-not (Test-Path -LiteralPath $python)) {
        Write-Host "Creating a Python 3.11 environment..."
        & py -3.11 -m venv ".venv"
        Assert-OK "Python 3.11 environment creation"
    }

    if (-not (Test-Path -LiteralPath $ready)) {
        Write-Host "Installing Billy and PaddleOCR. First install downloads multiple packages."
        & $python -m pip install --upgrade pip
        Assert-OK "pip upgrade"

        # Official PaddlePaddle CPU package source, tested against PP-StructureV3 documentation.
        & $python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
        Assert-OK "PaddlePaddle installation"

        & $python -m pip install -r requirements-ocr.txt -r requirements-api.txt
        Assert-OK "Billy Python dependencies"

        & $python -c "import paddle; from paddleocr import PPStructureV3; print('PaddlePaddle', paddle.__version__, '| PP-StructureV3 import: OK')"
        Assert-OK "PaddleOCR import check"

        New-Item -ItemType File -Path $ready -Force | Out-Null
    }

    Write-Host "Starting Billy Web at http://127.0.0.1:5173" -ForegroundColor Green
    $webProcess = Start-Process -FilePath $python -ArgumentList @("-m", "http.server", "5173", "--bind", "127.0.0.1", "--directory", "site") -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 2
    if ($webProcess.HasExited) {
        throw "The local website failed to start. Is port 5173 already in use?"
    }

    Write-Host "Starting PaddleOCR API at http://127.0.0.1:8000" -ForegroundColor Green
    Write-Host "When Billy opens, the status should say 'OCR engine connected'." -ForegroundColor Gray
    Write-Host "Keep this window open while scanning. Press Ctrl+C to stop." -ForegroundColor Gray
    Write-Host "The OCR model is downloaded/loaded on the first real scan." -ForegroundColor Gray

    # Opening a browser is best-effort; it should not stop the API from starting.
    try { Start-Process "http://127.0.0.1:5173/" } catch {}
    & $python -m uvicorn api:app --host 127.0.0.1 --port 8000
    Assert-OK "Billy OCR API"
}
catch {
    Write-Host ""
    Write-Host ("Billy could not start: " + $_.Exception.Message) -ForegroundColor Red
    Write-Host "Ensure Python 3.11 (64-bit) is installed and accessible as 'py -3.11'." -ForegroundColor Yellow
    Write-Host "Use the README for troubleshooting. Never forward port 8000 to the internet." -ForegroundColor Yellow
    Read-Host "Press Enter to close"
    exit 1
}
finally {
    if ($webProcess -and -not $webProcess.HasExited) {
        Stop-Process -Id $webProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
