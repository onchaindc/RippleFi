"use client";

import { BookOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const toc = [
  { href: "#overview", label: "Overview" },
  { href: "#fxrp-vault", label: "FXRP & the vault" },
  { href: "#earn-redeem", label: "Earn & Redeem" },
  { href: "#strategies", label: "Yield strategies" },
  { href: "#spend", label: "Spend / Pay" },
  { href: "#smart-accounts", label: "Smart Accounts" },
  { href: "#auto-hedge", label: "Auto-Hedge" },
  { href: "#networks", label: "Networks & testnet" },
  { href: "#safety", label: "How your keys work" },
  { href: "#faq", label: "FAQ" },
];

function Section({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Subheading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-[#cbd2d7]">{children}</h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-6 text-[#8f9aa3]">{children}</p>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[12px] text-[#9bd3f5]">
      {children}
    </code>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[#71b9e6]/20 bg-[#71b9e6]/[0.05] px-4 py-3 text-sm leading-6 text-[#a8c7dc]">
      {children}
    </div>
  );
}

function Qa({ a, q }: { a: ReactNode; q: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
      <p className="text-sm font-semibold text-[#d7dcdf]">{q}</p>
      <div className="mt-1.5 text-sm leading-6 text-[#8f9aa3]">{a}</div>
    </div>
  );
}

function LoopStep({
  index,
  title,
  description,
}: {
  description: string;
  index: number;
  title: string;
}) {
  return (
    <div className="relative flex-1 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <span className="font-mono text-[11px] font-semibold text-[#4de2ad]">
        0{index}
      </span>
      <p className="mt-1 text-sm font-semibold text-[#d7dcdf]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#68737d]">{description}</p>
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <section className="border-b border-white/[0.07] pb-6">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#4de2ad]">
          <BookOpen aria-hidden="true" size={16} />
          Docs
        </div>
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
          How RippleFI works.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8f9aa3]">
          RippleFI is an earn-and-spend vault for FXRP on Flare: deposit
          FXRP, earn yield, and pay it out — with an optional downside
          hedge on Hyperliquid. This page walks through every part of the
          app, end to end.
        </p>
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Table of contents"
          className="hidden lg:block"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5f6972]">
            On this page
          </p>
          <ul className="mt-3 space-y-1 border-l border-white/[0.08]">
            {toc.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="-ml-px block border-l border-transparent py-1 pl-3 text-[13px] text-[#89939e] transition hover:border-[#4de2ad]/60 hover:text-[#d7dcdf]"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-12">
          <Section id="overview" title="Overview">
            <P>
              Everything in RippleFI orbits one asset —{" "}
              <strong className="font-semibold text-[#d7dcdf]">FXRP</strong>,
              an XRP-backed token on the Flare network (Coston2 testnet in
              the demo). You move the same FXRP through three stages:
            </P>
            <div className="flex flex-col gap-3 sm:flex-row">
              <LoopStep
                index={1}
                title="Earn"
                description="Deposit FXRP into a yield strategy and receive vault shares."
              />
              <LoopStep
                index={2}
                title="Redeem"
                description="Turn shares back into spend-ready FXRP at the current share price."
              />
              <LoopStep
                index={3}
                title="Spend"
                description="Pay from your available FXRP, or from the vault via Smart Accounts."
              />
            </div>
            <P>
              On top of that loop sits{" "}
              <Link
                href="/auto-hedge"
                className="font-medium text-[#71b9e6] hover:text-[#9bd3f5]"
              >
                Auto-Hedge
              </Link>
              , which protects your XRP position against price drops by
              opening a short on Hyperliquid when the market crosses your
              threshold.
            </P>
          </Section>

          <Section id="fxrp-vault" title="FXRP & the vault">
            <Subheading>Shares, not balances</Subheading>
            <P>
              When you <strong className="font-semibold text-[#d7dcdf]">Earn</strong>,
              your FXRP goes into an ERC-4626 vault and you receive{" "}
              <strong className="font-semibold text-[#d7dcdf]">shares</strong>{" "}
              (rFXRP or upFXRP, depending on the strategy). The dashboard
              shows three numbers that make this concrete:
            </P>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#8f9aa3]">
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Available FXRP</strong>{" "}
                — your spend-ready balance, outside the vault.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Vault assets</strong>{" "}
                — the current USD/FXRP value of your shares.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Vault shares</strong>{" "}
                — your ownership position; the share price grows as the
                strategy earns.
              </li>
            </ul>
            <P>
              The share price (assets ÷ supply) is what makes{" "}
              <Code>Redeem</Code> fair: everyone withdraws the same value per
              share, whether they deposited first or last.
            </P>
          </Section>

          <Section id="earn-redeem" title="Earn & Redeem">
            <Subheading>Earn — put FXRP to work</Subheading>
            <P>
              Pick a strategy on the dashboard (your choice applies to the{" "}
              <em className="text-[#cbd2d7]">next</em> deposit), enter an
              amount, and approve the deposit. Your wallet signs two
              transactions: an allowance for the vault, then the deposit
              itself. You receive shares immediately.
            </P>
            <Subheading>Redeem — get spend-ready FXRP back</Subheading>
            <P>
              Redeem converts your shares back to FXRP at the current share
              price, minus any strategy withdrawal fee. The FXRP lands in
              your available balance, ready to spend.
            </P>
            <Callout>
              Deposits and redemptions are on-chain transactions on
              Coston2 (testnet) or Flare (mainnet) — they need a connected
              wallet and a small amount of the network gas token.
            </Callout>
          </Section>

          <Section id="strategies" title="Yield strategies">
            <Subheading>Upshift — flexible</Subheading>
            <P>
              A managed, flexible strategy. Upshift deposits receive{" "}
              <strong className="font-semibold text-[#d7dcdf]">rFXRP</strong>{" "}
              shares and stay connected to RippleFI withdrawals and
              payments — ideal for money you may want to move quickly.
            </P>
            <Subheading>Firelight — staking</Subheading>
            <P>
              A staking-oriented strategy with a separate share token.
              Firelight deposits are not spend-ready; choose it for yield
              you plan to hold.
            </P>
            <P>
              The <strong className="font-semibold text-[#d7dcdf]">Next
              deposit</strong> pill on the dashboard always shows which
              strategy your next deposit will use.
            </P>
          </Section>

          <Section id="spend" title="Spend / Pay">
            <P>
              The <Link href="/spend" className="font-medium text-[#71b9e6] hover:text-[#9bd3f5]">
                Spend / Pay
              </Link>{" "}
              flow pays FXRP from your available balance — or directly from
              the vault if you prefer — to any address. It is the              same “pay” primitive that Smart Accounts use, minus the
              XRPL bridge.
            </P>
          </Section>

          <Section id="smart-accounts" title="Smart Accounts">
            <P>
              Smart Accounts connect RippleFI to the XRP Ledger through
              Flare&apos;s smart-account infrastructure and the{" "}
              <strong className="font-semibold text-[#d7dcdf]">Xaman</strong>{" "}
              wallet. This is how you move funds between XRPL and the
              vault:
            </P>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6 text-[#8f9aa3]">
              <li>
                Sign in with Xaman and link your XRPL account to a personal
                smart account on Flare.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Deposit</strong> —
                an XRPL payment you authorize in Xaman is matched on-chain,
                confirmed through Flare&apos;s FDC attestation, and credited
                to the vault.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Pay</strong> — the
                executor runs your signed user operation once FDC proof is
                ready, settling the payment on XRPL.
              </li>
            </ol>
            <Callout>
              XRPL deposits and payments are async: they pass through
              XRPL validation and Flare FDC finality, so the flow shows
              phases (submitted → confirmed → executed) instead of a
              single confirmation.
            </Callout>
          </Section>

          <Section id="auto-hedge" title="Auto-Hedge">
            <P>
              Auto-Hedge is XRP downside protection. It watches the live{" "}
              <strong className="font-semibold text-[#d7dcdf]">FTSO
              XRP/USD</strong> price and, when your condition is met, opens
              a protective short on your Hyperliquid account automatically.
            </P>

            <Subheading>The trigger</Subheading>
            <P>
              Two trigger types:
            </P>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#8f9aa3]">
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Percent drop</strong>{" "}
                — hedge when the price falls X% below the reference price
                you armed at.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Price threshold</strong>{" "}
                — hedge when the price crosses a fixed dollar level.
              </li>
            </ul>

            <Subheading>Three modes</Subheading>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#8f9aa3]">
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Single</strong> —
                one short when the threshold is crossed.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Trailing</strong> —
                the stop rides up as XRP rallies and triggers on a drop
                from the recent high.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Ladder</strong> —
                add protection in tranches as the drop deepens (e.g. 50% at
                −10%, 50% more at −20%).
              </li>
            </ul>

            <Subheading>Sizing & margin</Subheading>
            <P>
              Choose what share of your FXRP position to hedge, the{" "}
              <strong className="font-semibold text-[#d7dcdf]">leverage</strong>{" "}
              (1–50x), and cross or isolated margin. The panel shows live
              estimates: margin required and approximate liquidation
              price before you arm.
            </P>

            <Subheading>After the trigger</Subheading>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#8f9aa3]">
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Live hedge card</strong> —
                your open position (entry, mark, size, PnL, leverage,
                liquidation) polls from Hyperliquid every few seconds.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Close hedge</strong> —
                one tap closes the short with a reduce-only market order.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Auto-close</strong> —
                buy the hedge back automatically once XRP recovers to
                within X% of the reference price.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Re-arm</strong> —
                after the hedge closes, watch the next drop automatically
                from the current price.
              </li>
            </ul>

            <Subheading>Hyperliquid protection</Subheading>
            <P>
              Hedges run on <em className="text-[#cbd2d7]">your own</em>{" "}
              Hyperliquid account, through a per-user API wallet the app
              provisions. Before the first use you approve that API wallet
              (“agent”) with one wallet signature — the{" "}
              <strong className="font-semibold text-[#d7dcdf]">Approve
              protection</strong> step. Once approved, RippleFI signs
              orders with your agent, never your main key.
            </P>
            <Callout>
              Hyperliquid requires an account to have received at least one
              deposit before it can perform any action. On testnet, claim
              mock USDC at{" "}
              <a
                href="https://app.hyperliquid-testnet.xyz/drip"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#9bd3f5] underline decoration-[#71b9e6]/40 underline-offset-2 hover:text-white"
              >
                app.hyperliquid-testnet.xyz/drip
              </a>{" "}
              (the wallet must have deposited on mainnet at least once).
            </Callout>
          </Section>

          <Section id="networks" title="Networks & testnet">
            <P>
              The network switcher in the header moves the app between{" "}
              <strong className="font-semibold text-[#d7dcdf]">Coston2
              testnet</strong> (current default) and{" "}
              <strong className="font-semibold text-[#d7dcdf]">Flare
              mainnet</strong>. Everything — vault, shares, spend, and the
              Hyperliquid hedge — is scoped to the active network, and
              rules, approvals, and positions are stored per wallet per
              network.
            </P>
            <Callout>
              Testnet FXRP is free: mint mock FXRP and request Coston2 gas
              from the Flare faucet, then claim Hyperliquid testnet USDC
              with the drip link above. Mainnet requires real assets and a
              funded Hyperliquid account.
            </Callout>
          </Section>

          <Section id="safety" title="How your keys work">
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-[#8f9aa3]">
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Your wallet stays in charge.</strong>{" "}
                Every deposit, redeem, approval, and signed hedge action
                comes from your own wallet — RippleFI never holds your
                private keys.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Per-user Hyperliquid agents.</strong>{" "}
                Hedge orders are signed by a dedicated API wallet provisioned
                for your account, and the signer service uses that
                agent&apos;s key — never a shared operator key.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">Approvals are explicit.</strong>{" "}
                Authorizing a device for Auto-Hedge and approving the
                Hyperliquid agent each require their own wallet signatures,
                and either can be revoked at any time.
              </li>
              <li>
                <strong className="font-semibold text-[#d7dcdf]">On-chain, auditable.</strong>{" "}
                Vault deposits/redemptions are plain on-chain transactions;
                the transaction history is derived from actual chain events.
              </li>
            </ul>
          </Section>

          <Section id="faq" title="FAQ">
            <div className="space-y-3">
              <Qa
                q="Why does 'Approve protection' fail with 'Must deposit before performing actions'?"
                a={
                  <>
                    Hyperliquid only lets accounts act after their first
                    deposit. Fund the account first — on testnet, claim
                    mock USDC at{" "}
                    <a
                      href="https://app.hyperliquid-testnet.xyz/drip"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#9bd3f5] underline decoration-[#71b9e6]/40 underline-offset-2 hover:text-white"
                    >
                      the testnet drip
                    </a>
                    , then retry.
                  </>
                }
              />
              <Qa
                q="Why are the Auto-Hedge settings greyed out?"
                a={
                  <>
                    Settings lock while a protection rule is armed so a
                    live rule can&apos;t be changed mid-flight. Turn
                    Auto-Hedge off (or use{" "}
                    <strong className="font-semibold text-[#d7dcdf]">Disable
                    protection</strong> in the banner) to edit, then
                    re-arm.
                  </>
                }
              />
              <Qa
                q="What happens when a hedge triggers?"
                a={
                  <>
                    RippleFI posts a market short on your Hyperliquid
                    account at the configured size and leverage, marks the
                    rule <Code>triggered</Code>, and shows the live
                    position in the panel. The hedge stays open until you
                    close it, auto-close fires, or the rule is re-armed.
                  </>
                }
              />
              <Qa
                q="Does 'Redeem' cost anything?"
                a={
                  <>
                    Strategies may apply a small withdrawal fee and you pay
                    the network gas for the transaction — the estimated
                    proceeds are shown before you confirm.
                  </>
                }
              />
              <Qa
                q="Can I use RippleFI on mainnet?"
                a={
                  <>
                    Yes — switch networks in the header. Testnet and
                    mainnet state (vault, rules, approvals) are kept
                    separate per wallet, so testing on Coston2 never
                    touches mainnet.
                  </>
                }
              />
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
