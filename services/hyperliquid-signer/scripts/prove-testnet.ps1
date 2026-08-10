param(
  [string]$SignerUrl = $env:HYPERLIQUID_SIGNER_URL,
  [string]$AuthToken = $env:HYPERLIQUID_SIGNER_AUTH_TOKEN
)

$ErrorActionPreference = "Stop"

$serviceRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $serviceRoot ".env"

if ((-not $AuthToken) -and (Test-Path -LiteralPath $envPath)) {
  Get-Content -LiteralPath $envPath | ForEach-Object {
    if ($_ -match "^\s*([^#][^=]*)=(.*)$") {
      [Environment]::SetEnvironmentVariable(
        $matches[1].Trim(),
        $matches[2].Trim(),
        "Process"
      )
    }
  }
  $AuthToken = $env:HYPERLIQUID_SIGNER_AUTH_TOKEN
}

if (-not $SignerUrl) {
  $SignerUrl = "http://127.0.0.1:8787"
}
if (-not $AuthToken) {
  throw "HYPERLIQUID_SIGNER_AUTH_TOKEN is required."
}

$endpoint = "$($SignerUrl.TrimEnd('/'))/v1/orders/testnet-proof"
$idempotencyKey = "proof-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
$body = @{ idempotencyKey = $idempotencyKey } | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri $endpoint `
  -Method Post `
  -Headers @{ Authorization = "Bearer $AuthToken" } `
  -ContentType "application/json" `
  -Body $body `
  -TimeoutSec 60

$response | Select-Object `
  status,
  network,
  market,
  filledSize,
  averagePrice,
  externalOrderId,
  message | Format-List
