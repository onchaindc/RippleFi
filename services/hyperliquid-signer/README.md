# RippleFI Hyperliquid Signer

Isolated execution service for RippleFI Auto-Hedge. It holds the approved
Hyperliquid API-wallet private key, signs with Hyperliquid's official Python
SDK, and runs as either a multi-market testnet signer or a separately
deployed, explicitly enabled mainnet XRP signer.

The private key never enters the Next.js application, Vercel browser bundle,
request body, response body, logs, or any `NEXT_PUBLIC_*` variable.

## Local setup

Python 3.10-3.12 is recommended.

```powershell
cd services\hyperliquid-signer
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Configure secrets through hidden prompts. Use a replacement API wallet because
a private key pasted into a chat should be considered exposed:

```powershell
.\scripts\configure.ps1
.\scripts\run.ps1
```

`configure.ps1` writes the ignored local `.env`, restricts its Windows file
permissions to the current user, and never prints either secret.

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/healthz
```

Opening `http://127.0.0.1:8787/` now returns a small service-status response.
The execution endpoint is not a browser page and remains bearer-authenticated.

Docker:

```powershell
docker build -t ripplefi-hyperliquid-signer .
docker run --rm --env-file .env -p 127.0.0.1:8787:8787 `
  -v "${PWD}\data:/app/data" ripplefi-hyperliquid-signer
```

## Required signer environment

```text
HYPERLIQUID_NETWORK=testnet
HYPERLIQUID_SIGNER_AUTH_TOKEN=<long random secret>
HYPERLIQUID_CREDENTIAL_ENCRYPTION_KEY=<Fernet key>
UPSTASH_REDIS_REST_URL=<rest url>
UPSTASH_REDIS_REST_TOKEN=<rest token>
```

Redis stores each user's encrypted agent key, so it must be durable. Vercel KV
aliases `KV_REST_API_URL` and `KV_REST_API_TOKEN` are also accepted.

Generate the credential encryption key:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

The legacy single-account variables (`HYPERLIQUID_ACCOUNT_ADDRESS`,
`HYPERLIQUID_API_WALLET_ADDRESS`, `HYPERLIQUID_API_WALLET_PRIVATE_KEY`) are
optional and used only by the operator-only testnet proof path. Leave them
blank for normal per-user execution.

Optional policy/state variables have safe defaults:

```text
HYPERLIQUID_MAX_ORDER_SIZE_XRP=1000
HYPERLIQUID_MAX_SLIPPAGE_BPS=100
HYPERLIQUID_MIN_ORDER_NOTIONAL_USD=10
HYPERLIQUID_MIN_HEDGE_SIZE_XRP=0
HYPERLIQUID_ALLOW_MAINNET=false
HYPERLIQUID_TESTNET_MARKETS=BTC,ETH,SOL
HYPERLIQUID_TESTNET_MAX_ORDER_SIZES=BTC:0.001,ETH:0.02,SOL:0.5
HYPERLIQUID_ENABLE_TESTNET_PROOF=false
SIGNER_DB_PATH=./data/signer.db
```

Generate an auth token locally:

```powershell
$bytes = New-Object byte[] 32
$rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
$rng.GetBytes($bytes)
([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
$rng.Dispose()
```

## Deploy as a Separate Vercel Project

Deploy this folder as its own Vercel project, separate from the RippleFI
frontend. Vercel provides the public HTTPS URL while the private key stays in
the signer project's server-only environment.

1. In Vercel, choose **Add New > Project** and import `onchaindc/RippleFi`.
2. Set the project name to `ripplefi-hyperliquid-signer`.
3. Set **Root Directory** to `services/hyperliquid-signer`.
4. Leave framework/build settings on automatic detection. The root `app.py`,
   `requirements.txt`, `.python-version`, and `vercel.json` are included.
5. Add these environment variables to the signer project:

The Blueprint sets these signer-host variables:

```text
HYPERLIQUID_NETWORK=testnet
HYPERLIQUID_ACCOUNT_ADDRESS=0x8e242f088d9a59703d04671f456aef4222c6f2cc
HYPERLIQUID_API_WALLET_ADDRESS=0xccf7ffcb98ca71f5d9e04ff9a44c7b6d310f6585
HYPERLIQUID_API_WALLET_PRIVATE_KEY=<the API-wallet private key>
HYPERLIQUID_SIGNER_AUTH_TOKEN=<long random shared secret>
HYPERLIQUID_MAX_ORDER_SIZE_XRP=1000
HYPERLIQUID_MAX_SLIPPAGE_BPS=100
```

6. Deploy the signer project.
7. Open `https://<signer-project>.vercel.app/healthz`. It must return
   `"status": "ok"` and `"network": "testnet"`.
8. Keep the auth token; it must be copied exactly into the separate RippleFI
   frontend project.

No CORS configuration is needed because the caller is the server-side Vercel
route, not browser JavaScript. On Vercel, the service always uses
`/tmp/ripplefi-signer.db`; a custom non-`/tmp` path is ignored. If temporary
SQLite is unavailable, the function falls back to an in-memory receipt cache.
Deterministic Hyperliquid client order IDs remain the venue-level retry guard.
Do not treat either serverless cache as a long-term audit database.

The app imports without loading secrets, opening SQLite, or contacting
Hyperliquid. `/` therefore remains available for boot diagnostics. `/healthz`
validates the required configuration and returns a structured `503 not_ready`
response naming the missing or invalid variable instead of crashing the
serverless function.

`XRP` remains locked as the mainnet product market. Testnet execution defaults
to `BTC`; ETH, SOL, and additional operator-allowlisted markets are accepted
only when they also exist in live Hyperliquid metadata. The signer preflights
venue metadata before reserving or submitting an order.

Hyperliquid mainnet reports `szDecimals=0` for XRP, so the order size increment
is `1 XRP`. The signer rounds a requested short down to whole XRP to avoid
over-hedging, then enforces the venue's $10 minimum notional. The dynamic
minimum is `ceil(10 / current XRP mid price)` in whole XRP. At the verified
August 4, 2026 mid price of `$1.07695`, the effective minimum is `10 XRP`.
`HYPERLIQUID_MIN_HEDGE_SIZE_XRP` may raise that minimum. The $10 venue floor
cannot be lowered by configuration.

Healthy response:

```json
{
  "configuration": "ready",
  "network": "testnet",
  "service": "ripplefi-hyperliquid-signer",
  "stateBackend": "lazy",
  "status": "ok",
  "venueClient": "lazy"
}
```

## Testnet proof mode

Proof mode is a separate authenticated endpoint and is never selected by the
Auto-Hedge trigger. BTC is used because it is an active, liquid default
testnet perpetual and supports a small valid proof size.

Set these only on the testnet signer:

```text
HYPERLIQUID_NETWORK=testnet
HYPERLIQUID_ALLOW_MAINNET=false
HYPERLIQUID_ENABLE_TESTNET_PROOF=true
HYPERLIQUID_TESTNET_PROOF_MARKET=BTC
HYPERLIQUID_TESTNET_PROOF_SIZE=0.0002
HYPERLIQUID_TESTNET_PROOF_MAX_NOTIONAL_USD=20
HYPERLIQUID_MAX_SLIPPAGE_BPS=100
```

The master account must be eligible to trade on Hyperliquid testnet and may
need testnet USDC margin. Run one explicitly authorized proof order:

```powershell
.\scripts\prove-testnet.ps1 `
  -SignerUrl https://<testnet-signer>.vercel.app `
  -AuthToken <testnet-signer-token>
```

The endpoint is `POST /v1/orders/testnet-proof` and accepts only an
`idempotencyKey`. Market, direction, size, slippage, and notional cap are fixed
by signer-host configuration. A successful receipt includes `market`,
`network`, `filledSize`, `averagePrice`, and `externalOrderId`.

Disable `HYPERLIQUID_ENABLE_TESTNET_PROOF` and redeploy after the proof.

Live verification on August 4, 2026:

```text
BTC short size: 0.0002
Fill price: 64139.0
External order ID: 57419949618
Close price: 64211.0
Close external order ID: 57420011576
Remaining BTC position: 0
```

## Guarded mainnet XRP mode

Deploy mainnet as a separate signer project. It is disabled unless both the
network and explicit enable flag are set, and it will not boot without an
operator-defined XRP size cap:

```text
HYPERLIQUID_NETWORK=mainnet
HYPERLIQUID_ALLOW_MAINNET=true
HYPERLIQUID_MAINNET_MAX_ORDER_SIZE_XRP=25
HYPERLIQUID_MAX_SLIPPAGE_BPS=100
HYPERLIQUID_MIN_ORDER_NOTIONAL_USD=10
HYPERLIQUID_MIN_HEDGE_SIZE_XRP=0
HYPERLIQUID_ENABLE_TESTNET_PROOF=false
```

`HYPERLIQUID_MAINNET_MAX_ORDER_SIZE_XRP` is required and cannot exceed the
hard-coded 1000 XRP ceiling. Mainnet remains disabled when
`HYPERLIQUID_ALLOW_MAINNET` is absent or false.

## RippleFI account linking

Users never see or enter a signer URL, a bearer token, or an API wallet address.
Auto-Hedge shows one button, `Enable Hyperliquid protection`, and a status chip.

The flow, per user:

1. The user approves the Auto-Hedge device session with a wallet signature.
2. RippleFI's server calls `POST /v1/agents/provision` on this signer, scoped to
   that verified session, and gets back a fresh API (agent) wallet address. The
   agent's private key is generated here, encrypted at rest with
   `HYPERLIQUID_CREDENTIAL_ENCRYPTION_KEY`, and never leaves the signer.
3. The user signs one Hyperliquid `approveAgent` typed-data message from their
   own wallet, authorizing that agent address on their own HL account.
4. RippleFI stores only the linkage and authorization status.

Each user therefore trades from their own Hyperliquid account through their own
approved agent wallet. A shared operator account is never used to trade for
users. The signer refuses to act for a master account whose agent has not been
approved by that account.

The signer URL and token are RippleFI infrastructure config, held once in the
RippleFI server environment (`HYPERLIQUID_SIGNER_URL`,
`HYPERLIQUID_SIGNER_AUTH_TOKEN`) and never exposed to the browser.

The shared RippleFI environment needs adapter selection and safety policy:

```text
AUTO_HEDGE_EXECUTION_ADAPTER=record-intent-v1
AUTO_HEDGE_TESTNET_EXECUTION_ADAPTER=record-intent-v1
AUTO_HEDGE_MAINNET_EXECUTION_ADAPTER=record-intent-v1
HYPERLIQUID_ALLOW_MAINNET=false
```

To permit Flare mainnet hedges, deliberately change the frontend project to:

```text
AUTO_HEDGE_MAINNET_EXECUTION_ADAPTER=hyperliquid-xrp-perp-v1
HYPERLIQUID_ALLOW_MAINNET=true
```

Flare chain 14 routes only to the mainnet signer. Coston2 chain 114 should
remain on `record-intent-v1` because testnet does not list XRP. Chain-specific
adapter variables override the backward-compatible global
`AUTO_HEDGE_EXECUTION_ADAPTER`.

Never add `HYPERLIQUID_API_WALLET_PRIVATE_KEY` or per-user agent keys to the
shared RippleFI Vercel project. Agent keys are generated and held only by this
signer, encrypted at rest. The RippleFI project holds the signer URL and bearer
token as server-only infrastructure config.

## Example request

```http
POST /v1/orders/short HTTP/1.1
Authorization: Bearer <HYPERLIQUID_SIGNER_AUTH_TOKEN>
Content-Type: application/json

{
  "accountAddress": "0x8e242f088d9a59703d04671f456aef4222c6f2cc",
  "apiWalletAddress": "0xccf7ffcb98ca71f5d9e04ff9a44c7b6d310f6585",
  "direction": "short",
  "idempotencyKey": "rule-123:1722700000000",
  "market": "XRP",
  "network": "mainnet",
  "orderType": "market",
  "semantics": {
    "maxSlippageBps": 100,
    "reduceOnly": false,
    "timeInForce": "ioc",
    "venueOrderType": "aggressive-limit"
  },
  "size": "25",
  "venue": "hyperliquid",
  "venueMarket": "XRP"
}
```

Successful fill:

```json
{
  "averagePrice": "0.6123",
  "cached": false,
  "externalOrderId": "123456789",
  "filledSize": "25.0",
  "idempotencyKey": "rule-123:1722700000000",
  "market": "XRP",
  "message": "XRP short filled at $0.6123.",
  "network": "mainnet",
  "status": "success"
}
```

## Security notes

- Deploy this service separately from the Next.js/Vercel application.
- Use a secret manager and a dedicated, limited API wallet.
- Use a random signer auth token of at least 32 characters and rotate it if it
  is ever exposed.
- Keep the service private where possible; otherwise require TLS and restrict
  inbound traffic to the RippleFI server deployment.
- Disable access/body logging. Never log request authorization headers.
- Each signer deployment is fixed to one network. Mainnet requires an explicit
  enable flag and XRP size cap. Testnet proof mode is separately disabled by
  default and restricted to an allowlisted market and notional ceiling.
- SQLite and deterministic client order IDs protect routine retries. For
  horizontally scaled production deployments, replace SQLite with a shared
  transactional database.
- A timeout after submission is marked unknown and is not automatically
  retried, because the venue may already have accepted the order.
