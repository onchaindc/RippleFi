$ErrorActionPreference = "Stop"

function ConvertFrom-SecureValue {
  param([Security.SecureString]$Value)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$serviceRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $serviceRoot ".env"

Write-Host "Configure the isolated RippleFI Hyperliquid testnet signer."
Write-Host "Use a replacement API-wallet key because any key pasted into chat is exposed."

$privateKeySecure = Read-Host "Replacement API-wallet private key" -AsSecureString
$authTokenSecure = Read-Host "Signer auth token (minimum 32 characters)" -AsSecureString
$privateKey = ConvertFrom-SecureValue $privateKeySecure
$authToken = ConvertFrom-SecureValue $authTokenSecure

try {
  if ($privateKey -notmatch "^0x[0-9a-fA-F]{64}$") {
    throw "The API-wallet private key must be a 0x-prefixed 32-byte hex value."
  }
  if ($authToken.Length -lt 32) {
    throw "The signer auth token must be at least 32 characters."
  }

  $envContent = @"
HYPERLIQUID_NETWORK=testnet
HYPERLIQUID_ACCOUNT_ADDRESS=0x8e242f088d9a59703d04671f456aef4222c6f2cc
HYPERLIQUID_API_WALLET_ADDRESS=0xccf7ffcb98ca71f5d9e04ff9a44c7b6d310f6585
HYPERLIQUID_API_WALLET_PRIVATE_KEY=$privateKey
HYPERLIQUID_SIGNER_AUTH_TOKEN=$authToken
HYPERLIQUID_MAX_ORDER_SIZE_XRP=1000
HYPERLIQUID_MAX_SLIPPAGE_BPS=100
HYPERLIQUID_ALLOW_MAINNET=false
HYPERLIQUID_ENABLE_TESTNET_PROOF=false
HYPERLIQUID_TESTNET_PROOF_MARKET=BTC
HYPERLIQUID_TESTNET_PROOF_SIZE=0.0002
HYPERLIQUID_TESTNET_PROOF_MAX_NOTIONAL_USD=20
SIGNER_DB_PATH=./data/signer.db
SIGNER_HOST=127.0.0.1
SIGNER_PORT=8787
"@
  [IO.File]::WriteAllText(
    $envPath,
    $envContent,
    (New-Object Text.UTF8Encoding($false))
  )

  if ($IsWindows -or $env:OS -eq "Windows_NT") {
    icacls $envPath /inheritance:r /grant:r "$($env:USERNAME):M" | Out-Null
  }

  Write-Host "Signer environment created at $envPath."
  Write-Host "The private key and auth token were not printed."
}
finally {
  $privateKey = $null
  $authToken = $null
  Remove-Variable privateKeySecure, authTokenSecure -ErrorAction SilentlyContinue
}
