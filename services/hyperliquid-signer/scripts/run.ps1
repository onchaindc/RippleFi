$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $serviceRoot ".env"
$pythonPath = Join-Path $serviceRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing .env. Run .\scripts\configure.ps1 first."
}
if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Missing .venv. Create it and install requirements first."
}

Get-Content -LiteralPath $envPath | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]*)=(.*)$") {
    [Environment]::SetEnvironmentVariable(
      $matches[1].Trim(),
      $matches[2].Trim(),
      "Process"
    )
  }
}

Set-Location $serviceRoot
& $pythonPath -m uvicorn app:app `
  --host $env:SIGNER_HOST `
  --port $env:SIGNER_PORT `
  --no-access-log
