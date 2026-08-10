# RippleFI Frontend

Next.js App Router dashboard for the RippleFI FXRP vault on Flare Testnet
Coston2.

## Features

- Injected-wallet connection with wagmi
- Coston2 network configuration
- FXRP wallet balance
- Vault asset and share balances
- FXRP approval and deposit flow
- FXRP withdrawal flow

## Environment

Copy `.env.example` to `.env.local` and set a WalletConnect/Reown project ID:

```text
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_APP_URL=https://ripple-fi.vercel.app
```

Add the same variables to the Vercel project before deploying. The production
domain must also be included in the Reown project allowlist.

## Contracts

| Contract | Coston2 address |
| --- | --- |
| RippleFIVault | `0x57ccb558022a09f895376fbb58a849b6b5fd825b` |
| FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7` |

## Development

```powershell
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000` and connect a wallet configured for Coston2.

## Checks

```powershell
corepack pnpm lint
corepack pnpm build
```
