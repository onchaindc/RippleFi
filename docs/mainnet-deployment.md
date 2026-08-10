# Flare Mainnet Deployment

RippleFIVault is prepared for Flare mainnet but is not deployed by this change.

## Fixed constructor inputs

- FXRP: `0xAd552A648C74D49E10027AB8a618A3ad4901c5bE`
- Upshift earnXRP vault: `0x373D7d201C8134D4a2f7b5c63560da217e3dEA28`
- Chain ID: `14`

## Preflight

Run these read-only checks before funding the deployer:

```powershell
cd contracts
pnpm compile
pnpm test
pnpm prepare:flare
```

The preflight validates the chain, FXRP metadata, Upshift asset, LP token,
withdrawal status, withdrawal limit, and instant-redemption preview. It does
not send a transaction.

## Deployment checklist

1. Use a dedicated hardware-backed or tightly controlled deployer.
2. Fund it with only the FLR required for deployment and verification.
3. Re-run `pnpm prepare:flare` immediately before deployment.
4. Confirm Upshift withdrawals are not paused and its asset is mainnet FXRP.
5. Record the deployer address, constructor inputs, gas estimate, and current
   Flare block.
6. Set `CONFIRM_MAINNET_DEPLOY=YES` only for the deployment shell.
7. Deploy and record the transaction hash, vault address, and deployment block.
8. Verify the contract with the exact constructor addresses.
9. Set the frontend variables and redeploy the frontend.
10. Make a small controlled deposit and withdrawal before broader use.

## Broadcast command

```powershell
$env:CONFIRM_MAINNET_DEPLOY="YES"
pnpm deploy:flare
```

The deploy script rejects Flare mainnet unless the confirmation variable is
exactly `YES`.

## Verification command

```powershell
pnpm hardhat verify --network flare <VAULT_ADDRESS> `
  0xAd552A648C74D49E10027AB8a618A3ad4901c5bE `
  0x373D7d201C8134D4a2f7b5c63560da217e3dEA28
```

## Frontend activation

Set these after deployment, then rebuild:

```text
NEXT_PUBLIC_FLARE_VAULT_ADDRESS=<VAULT_ADDRESS>
NEXT_PUBLIC_FLARE_VAULT_DEPLOYMENT_BLOCK=<DEPLOYMENT_BLOCK>
```

Until both values are present, Flare mainnet remains selectable but vault
actions and vault history are intentionally disabled.
