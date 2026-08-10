# RippleFI Smart Accounts Architecture

## Coston2 contracts

| Contract | Address | Purpose |
| --- | --- | --- |
| MasterAccountController | `0x434936d47503353f06750Db1A444DBDC5F0AD37c` | Resolves Personal Accounts, stores memo nonces, and dispatches XRPL-authorized instructions |
| PersonalAccount implementation | `0xe900cf0C3f1320816700c669B002835aCc9A93A6` | Beacon implementation used by each XRPL user's Personal Account |
| FXRP AssetManager | `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA` | Coston2 FAssets manager; its `fAsset()` is RippleFI's FXRP token |
| EIP-2470 Singleton Factory | `0xce0042B868300000d44A59004Da54A005ffdcf9f` | Deterministic Personal Account proxy deployment |
| FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7` | Asset held by Personal Accounts and accepted by RippleFI |
| RippleFIVault | `0x57ccb558022a09f895376fbb58a849b6b5fd825b` | Upshift-backed RippleFI ERC-4626 vault |

The Flare Smart Accounts deployment currently has its own governed vault
registry. RippleFIVault is not registered there, so RippleFI does not use the
controller's built-in registered-vault instruction yet. Instead, a memo UserOp
executes the standard ERC-20 and ERC-4626 calls directly from the Personal
Account.

## Deposit flow

1. The user enters an XRPL classic address.
2. RippleFI calls `MasterAccountController.getPersonalAccount(xrplOwner)` to
   obtain the deterministic Coston2 account, even before it is deployed.
3. RippleFI reads the account's current memo nonce.
4. RippleFI creates two atomic calls:
   - `FXRP.approve(RippleFIVault, amount)`
   - `RippleFIVault.deposit(amount, personalAccount)`
5. Those calls are wrapped in
   `PersonalAccount.executeUserOp(Call[])`, then encoded as a
   `PackedUserOperation`.
6. The XRPL direct-mint memo uses opcode `0xFE` and commits to
   `keccak256(abi.encode(PackedUserOperation))`. The full encoded UserOp stays
   in RippleFI's signed executor job and never needs to fit in the XRPL memo.
7. RippleFI creates a Xaman payload for a Payment to the live Coston2 Core
   Vault address. The payment amount includes:
   - the requested net FXRP deposit,
   - the larger of the proportional or minimum direct-minting fee, and
   - the AssetManager direct-minting executor fee.
8. After Xaman submits the Payment, RippleFI verifies the signer, destination,
   amount, memo, transaction result, and three-ledger XRPL finality.
9. The server-side executor requests an `XRPPayment` proof from FDC, waits for
   the voting round and DA-layer proof, then calls
   `AssetManagerFXRP.executeDirectMintingWithData(proof, userOpData)`.
10. Direct minting transfers the net FXRP to the Personal Account and the
    controller executes approval plus deposit in the same Coston2 transaction.

The `0xFE` path is preferred because XRPL `MemoData` is too small for most
non-trivial inline UserOps.

The XRPL payment must include both AssetManager fees. The memo-level executor
fee is zero because RippleFI operates the submitting executor itself; setting
that field to the AssetManager executor fee would charge the user twice and
leave the Personal Account short for the atomic vault deposit.

The frontend reads `directMintingPaymentAddress()`,
`getDirectMintingExecutorFeeUBA()`, `getDirectMintingFeeBIPS()`, and
`getDirectMintingMinimumFeeUBA()` from the live Coston2 AssetManager. The
current official TypeScript `0xFE` flow uses wallet ID `0`; the on-chain memo
decoder does not consume this routing byte.

## Runtime services

Xaman credentials, the FDC verifier key, and the Coston2 executor private key
are server-only environment variables. The browser receives a short-lived
HMAC-signed job token that binds the XRPL owner, Personal Account, amount,
nonce, memo, and UserOp hash. The executor routes re-read and validate the
submitted XRPL transaction before spending C2FLR on an FDC request.

The executor is split across short requests for serverless reliability:

1. `executor/prepare` waits for XRPL finality and submits the FDC request.
2. `executor/status` checks the FDC round and DA layer.
3. Once the proof is available, `executor/status` submits
   `executeDirectMintingWithData` and verifies `UserOperationExecuted`.

The executor account must be funded with C2FLR. Its private key and all API
secrets must never use a `NEXT_PUBLIC_` prefix.

## Spend flow

For a payment from the Personal Account's available FXRP, the UserOp contains:

`FXRP.transfer(recipient, amount)`

For a payment from the RippleFI vault, the UserOp contains:

`RippleFIVault.withdraw(amount, recipient, personalAccount)`

The second flow sends redeemed FXRP directly to the recipient in one call. No
intermediate transfer is required.

The focused MVP reuses the deployed `0xFE` direct-mint authorization route.
Xaman signs an XRPL payment that mints one base unit of FXRP plus the required
protocol fees while committing to the spend UserOp hash. The requested payment
amount comes from the Personal Account's existing available or vault balance;
the one-base-unit mint remains in the Personal Account. This avoids introducing
a second authorization service while preserving the controller's nonce and
XRPL ownership checks.

## Payment links

Payment requests are stateless, versioned URL payloads containing the requester
address, FXRP amount, and an optional short note. The `/pay/[id]` page validates
the payload and uses the existing EVM FXRP transfer flow. No payment request is
stored server-side, and request links do not grant spending authority.

## Trust boundaries

- XRPL ownership authorizes Smart Account actions through Flare's direct-mint
  memo path and FAssets execution pipeline.
- The MasterAccountController is the only caller allowed to execute Personal
  Account operations.
- RippleFI never asks an EVM wallet to impersonate or directly control a
  Personal Account.
- Existing wagmi wallet deposit, withdraw, and spend flows remain independent.
- A production hardening phase should add persistent job storage, rate
  limiting, executor balance alerts, and UI-assisted `0xE0`/`0xE2` recovery
  for rare stuck direct-mint transactions.
