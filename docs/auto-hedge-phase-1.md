# Auto-Hedge Phase 1

## Architecture

Auto-Hedge is split into four replaceable layers:

1. `GET /api/ftso/xrp-price` resolves the network `FtsoV2` contract through
   Flare's contract registry and reads the canonical XRP/USD feed on-chain.
2. `autoHedge.ts` contains the pure threshold-crossing logic and structured
   hedge intent schema.
3. `AutoHedgeProvider` persists one rule per wallet and chain, polls the live
   feed while RippleFI is open, and submits an intent when the price crosses
   downward through the configured trigger.
4. `HedgeExecutionAdapter` isolates execution. Phase 1 uses
   `record-intent-v1`, which emits a structured server event and returns its
   execution receipt.

## First real execution target

The execution layer now supports a chain-specific venue matrix. Hyperliquid
mainnet keeps the guarded XRP short path. Coston2 can use the generalized
Hyperliquid testnet adapter with BTC by default, plus ETH, SOL, or another
operator-allowlisted market that is present in live venue metadata.

This preserves the user's FXRP vault position and Upshift yield while adding
offsetting XRP price exposure. The intent already carries the source wallet and
chain, protected XRP-equivalent amount, exact trigger observation, market side,
order semantics, slippage limit, idempotency key, and execution lifecycle.

The adapter registry keeps `record-intent-v1` as the fallback. Live
Hyperliquid adapters require a wallet-scoped linkage and a user-specific
signer session. RippleFI never routes normal users through an operator-owned
master account or API wallet.

Available adapters are `record-intent-v1`, `hyperliquid-multi-market-v1`,
`hyperliquid-xrp-perp-v1`, `sparkdex-eternal-v1`, and `flamix-v1`.
Configure chain-specific signer deployments before opting into a live adapter:

```text
AUTO_HEDGE_EXECUTION_ADAPTER=record-intent-v1
AUTO_HEDGE_TESTNET_EXECUTION_ADAPTER=record-intent-v1
AUTO_HEDGE_MAINNET_EXECUTION_ADAPTER=record-intent-v1
HYPERLIQUID_TESTNET_MARKET=BTC
HYPERLIQUID_ALLOW_MAINNET=false
NEXT_PUBLIC_AUTO_HEDGE_TESTNET_VENUE=hyperliquid
NEXT_PUBLIC_AUTO_HEDGE_TESTNET_MARKET=BTC
NEXT_PUBLIC_AUTO_HEDGE_MAINNET_VENUE=hyperliquid
NEXT_PUBLIC_AUTO_HEDGE_MAINNET_MARKET=XRP
AUTO_HEDGE_TESTNET_MARKETS=BTC,ETH,SOL
AUTO_HEDGE_TESTNET_ORDER_SIZE=0.0002
```

To enable only Flare mainnet Hyperliquid execution, set
`AUTO_HEDGE_MAINNET_EXECUTION_ADAPTER=hyperliquid-xrp-perp-v1` and
`HYPERLIQUID_ALLOW_MAINNET=true`. Keep
To enable Coston2 proof execution, select
`AUTO_HEDGE_TESTNET_EXECUTION_ADAPTER=hyperliquid-multi-market-v1`. The
testnet size is an explicit venue-market unit configured by
`AUTO_HEDGE_TESTNET_ORDER_SIZE`; RippleFI never interprets an XRP hedge amount
as BTC, ETH, or SOL units.

SparkDEX Eternal and Flamix are isolated remote-executor adapters. Each
requires an explicit enable flag, HTTPS executor URL, bearer token, and market
allowlist. This keeps venue-specific wallet signing and collateral logic out of
the browser while preserving the same idempotency key and normalized execution
receipt. If the integration host is absent or a market is not enabled, the
adapter reports an explicit unsupported state and does not claim execution.

## Multi-user Hyperliquid authorization

1. The user links a Hyperliquid master account and API-wallet address for the
   active RippleFI wallet and chain.
2. RippleFI validates the user's personal signer over HTTPS. The signer must
   report the exact master account, API wallet, and testnet/mainnet identity.
3. The Hyperliquid master wallet signs the one-time `approveAgent` action.
4. The shared store persists only wallet addresses, network, and authorization
   status. The signer URL/token remains on the user's device.
5. At trigger time, the execution API matches the transient signer session
   against the persisted linkage before the adapter can submit an order.

The API-wallet private key remains only in that user's isolated signer. A new
device can see the shared Connected/Authorized state but must be given the
user's signer session before it can execute. There is no operator-account
fallback for Hyperliquid live adapters.

### Migration from shared demo execution

Remove `HYPERLIQUID_ACCOUNT_ADDRESS`, `HYPERLIQUID_API_WALLET_ADDRESS`,
`HYPERLIQUID_SIGNER_URL`, `HYPERLIQUID_SIGNER_AUTH_TOKEN`, and their mainnet
variants from the RippleFI/Vercel project. Keep each user's account, private
key, and signer token in that user's separate signer deployment. Existing
shared demo signer deployments must not be used by normal users.

XRP mainnet sizes are normalized from live Hyperliquid metadata before order
submission. XRP currently has `szDecimals=0`, so shorts are rounded down to
whole XRP. The signer enforces at least $10 notional and returns
`HYPERLIQUID_SIZE_TOO_SMALL` with the live price, rounded size, increment, and
effective minimum instead of submitting an invalid order.

## Shared wallet-scoped state

Auto-Hedge state is stored under wallet address plus Flare chain ID in Upstash
Redis and mirrored to local storage only as a device cache. Clients load the
shared rule on wallet connection and refresh every five seconds and whenever
the tab regains focus. Atomic compare-and-set updates prevent two open devices
from claiming the same threshold crossing.

Writes require a wallet-signed, chain-bound session. The execution route checks
that session against the persisted trigger intent and writes the final venue
receipt back to the shared rule, so mobile and desktop show the same Armed,
Triggered, pending, success, or failed lifecycle.

Set these server-side variables in the RippleFI Vercel project:

```text
UPSTASH_REDIS_REST_URL=<Upstash Redis REST URL>
UPSTASH_REDIS_REST_TOKEN=<Upstash Redis REST token>
AUTO_HEDGE_SESSION_SECRET=<random secret, at least 32 characters>
```

The older `KV_REST_API_URL` and `KV_REST_API_TOKEN` names are accepted as
aliases. None of these variables should use the `NEXT_PUBLIC_` prefix.

Deploy the signer as a separate Vercel project with root directory
`services/hyperliquid-signer`. The root `app.py` is the Vercel FastAPI
entrypoint. Configure the private key and signer token only in that signer
project, then copy the public signer URL and matching token to the RippleFI
frontend project's server environment. The private key never belongs in the
frontend Vercel project.

## Production evolution

A production executor should store signed rules in durable storage and monitor
them from a continuously running worker. The worker should independently
validate the FTSO observation, enforce idempotency, authenticate the rule owner,
and call a venue-specific adapter.

Private thresholds fit at the storage and worker boundary: encrypt the rule for
a TEE-backed monitor, evaluate the trigger inside the enclave, and expose only
the resulting signed hedge intent to the execution adapter.
