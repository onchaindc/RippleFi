# RippleFI — Demo Video Guide

A scene-by-scene script for recording the product walkthrough. Each scene
lists what to **show** on screen and what to **say**. Total runtime target:
**~5–6 minutes** (scenes 0–4, 7, 8). Scenes 5–6 are optional deep dives.

---

## Before you record

- [ ] Deploy the latest `main` (Vercel) and **hard-refresh** (Cmd/Ctrl+Shift+R)
      so no cached chunks leak into the video.
- [ ] Test wallet connected to **Coston2 Testnet** with:
  - FXRP in the wallet (mock mint / faucet),
  - a little C2FLR for gas,
  - a funded, active **Hyperliquid testnet** account — claim mock USDC at
    `app.hyperliquid-testnet.xyz/drip` (the wallet must have deposited on
    mainnet at least once), or the approval step will fail with
    "Must deposit before performing actions".
- [ ] Close wallet popups / notification noise. Record at ≥1080p, browser
      window maximized.
- [ ] Have a second address handy for the Spend scene.
- [ ] If you demo **email alerts**, set `RESEND_API_KEY` (and verify a
      sender domain) first — otherwise the field still shows but no email
      is sent (by design).

---

## Scene 0 — Intro on the landing page (0:00–0:10)

**Show:** The landing page hero — headline, tagline, starfield.

**Say:**
> "RippleFI is an earn-and-spend vault for FXRP on Flare — deposit, earn
> yield, spend it anywhere, and hedge your XRP against a drop — all from
> one clean interface."

**Show:** Click the primary CTA into the app.

---

## Scene 1 — Connect the wallet (0:10–0:30)

**Show:** The wallet connect button → pick your wallet → confirm the
signature. Point out the **Coston2 Testnet** pill in the header.

**Say:**
> "Everything runs on your own wallet — we never touch your keys. Right
> now we're on Coston2, Flare's testnet, where all assets are free."

---

## Scene 2 — Dashboard tour (0:30–1:00)

**Show:** Scan the page top to bottom:
- the three portfolio cards — *Available FXRP*, *Vault assets*, *Vault shares*;
- *Yield strategy* — the "Next deposit: Upshift" pill and the selected card;
- *What do you want to do?* — Earn / Redeem / Spend / Use XRPL;
- the compact **Auto-Hedge** summary card.

**Say:**
> "The dashboard is your cockpit: what you hold, where it earns, and what
> you can do with it — all at a glance."

---

## Scene 3 — Earn (1:00–1:40)

**Show:** Open **Earn**. Enter an amount, Approve, then Deposit. Show the
wallet confirmations, the in-form feedback, and the dashboard numbers
updating (Available FXRP ↓, Vault assets ↑).

**Say:**
> "Earning is two signatures: an allowance for the vault, then the deposit.
> FXRP goes in, and vault shares come back — those shares are your stake in
> the strategy's yield."

**Tip:** If toasts are wired to this flow, let one pop and don't click it
away — they read great on camera.

---

## Scene 4 — Redeem (1:40–2:10)

**Show:** Open **Redeem**, pick an amount, confirm. Show FXRP landing back
in *Available*.

**Say:**
> "Redeeming turns shares back into spend-ready FXRP at the current share
> price — fair for everyone, whether you deposited first or last."

---

## Scene 5 — Spend / Pay *(optional, 2:10–2:40)*

**Show:** Open **Spend / Pay**, pay FXRP to the second address (or create a
**payment link** and open it in another tab).

**Say:**
> "Payments work straight from your available FXRP — or, through Smart
> Accounts, straight from the vault."

---

## Scene 6 — Smart Accounts *(optional, 2:40–3:20)*

**Show:** Open **Smart Accounts** → connect **Xaman** → deposit or pay via
XRPL. Show the phased status: submitted → confirmed → executed (FDC).

**Say:**
> "Smart Accounts bridge RippleFI to the XRP Ledger. A payment you sign in
> Xaman is verified on-chain through Flare's FDC attestation, then executed
> — that's why the flow shows phases instead of one instant confirm."

---

## Scene 7 — Auto-Hedge deep dive (3:20–5:30) ★ the star

1. **Open Auto-Hedge.** Point out the header status pills and the **live
   FTSO XRP/USD price**.
2. **Hyperliquid protection.** Click **Approve protection** → wallet
   signature → show the status flip to **Ready**.
   > "Hedges run on your own Hyperliquid account through a dedicated API
   > wallet we provision — your main key never signs orders."
3. **The chart.** Tap the panel to show the XRP/USD sparkline and the
   trigger line.
   > "The chart plots live FTSO price against your trigger, so choosing a
   > level is a visual decision."
4. **Config.** Show the trigger tabs (Percent drop / Price threshold), the
   modes (Single / Trailing / Ladder — mention the ladder tranches), the
   **hedge size** and **leverage** sliders, cross/isolated, **auto-close**,
   **re-arm**, and the **email alerts** field.
5. **Arm it.** Toggle Auto-Hedge on → toast "Protection armed" → settings
   lock with the amber banner (tap **Disable protection** to prove the
   escape hatch).
   > "Once armed, settings lock so a live rule can't change mid-flight —
   > and one tap in the banner unlocks them."
6. **Trigger + live position.** Either wait for the trigger or (faster for
   the demo) lower the threshold so it fires: show the intent → execution
   timeline, then the **Live hedge card** — entry, mark, PnL, leverage,
   liquidation — and tap **Close hedge** → toast "Hedge closed".
7. **Alerts (if configured).** Mention: "if you added an email, you get a
   notification when the hedge opens, closes, or liquidation gets close."

---

## Scene 8 — Docs (5:30–5:45)

**Show:** The **Docs** button in the header → scroll the table of contents.

**Say:**
> "And the Docs page explains every part of the system — the vault, the
> strategies, Smart Accounts, and the full Auto-Hedge model — for anyone
> who wants the details."

---

## Scene 9 — Outro (5:45–6:00)

**Show:** Back to the dashboard.

**Say:**
> "Earn, redeem, spend, and hedge — one wallet, one clean surface.
> That's RippleFI."

---

## Recording tips

- Narrate before you click, so cuts feel deliberate.
- If a wallet popup hangs (antivirus blocking Hyperliquid's API), whitelist
  `api.hyperliquid-testnet.xyz` / `api.hyperliquid.xyz` and retry — or cut
  the retry out in editing.
- Never show wallet seed phrases, private keys, or export screens.
- A 6-minute take beats a 10-minute one: cut optional scenes if it drags.
