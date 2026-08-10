# RippleFI Contracts

This module is based on the official [Flare Hardhat Starter](https://github.com/flare-foundation/flare-hardhat-starter)
and is focused on the Flare Coston2 testnet (`chainId: 114`).

## Setup

```powershell
Copy-Item .env.example .env
corepack pnpm install
corepack pnpm compile
```

Add a dedicated Coston2 testnet private key to `.env` only when deployment is needed. The `.env` file is ignored by
Git.

## Layout

- `contracts/RippleFIVault.sol`: user-facing FXRP ERC-4626 vault backed by the
  official Coston2 Upshift strategy vault.
- `scripts/`: deployment and operational scripts.
- `test/`: contract tests.

The configuration uses Flare's public Coston2 RPC by default. Set `FLARE_RPC_API_KEY` or `COSTON2_RPC_URL` to use a
private RPC endpoint.

`deploy:coston2` requires `FXRP_ADDRESS`. It defaults to the official Coston2
Upshift vault at `0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81`; set
`UPSHIFT_VAULT_ADDRESS` only when intentionally targeting another deployment.
