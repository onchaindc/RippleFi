"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  CircleDollarSign,
  Network,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { AutoHedgeSummary } from "@/components/AutoHedgeSummary";
import { BalanceCard } from "@/components/BalanceCard";
import { TransactionHistory } from "@/components/TransactionHistory";
import { YieldStrategyPanel } from "@/components/YieldStrategyPanel";
import { useFirelight } from "@/hooks/useFirelight";
import { useVault } from "@/hooks/useVault";
import { useYieldStrategySelection } from "@/hooks/useYieldStrategySelection";

export default function Home() {
  const vault = useVault();
  const firelight = useFirelight();
  const strategy = useYieldStrategySelection();
  const hasEarningPosition =
    Boolean(vault.vaultAssetsRaw && vault.vaultAssetsRaw > 0n) ||
    Boolean(firelight.assetsRaw && firelight.assetsRaw > 0n);

  return (
    <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <section className="border-b border-white/[0.07] pb-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#4de2ad]">
              <WalletCards aria-hidden="true" size={16} />
              Portfolio
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              {hasEarningPosition
                ? "Your XRP position is earning."
                : "Put your XRP position to work."}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#8f9aa3]">
              See what you hold, where it earns, and what is ready to use.
            </p>
          </div>

          {vault.contracts.vault ? (
            <a
              className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-[#aeb7be] transition hover:border-white/20 hover:text-white"
              href={`${vault.chain.blockExplorers.default.url}/address/${vault.contracts.vault}`}
              target="_blank"
              rel="noreferrer"
            >
              View vault
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          ) : (
            <span className="inline-flex h-10 w-fit items-center rounded-lg border border-[#f2b84b]/20 bg-[#f2b84b]/[0.04] px-3 text-xs text-[#c8aa6c]">
              Vault unavailable on this network
            </span>
          )}
        </div>
      </section>

      <section
        aria-label="Portfolio balances"
        className="mt-5 grid gap-3 md:grid-cols-3"
      >
        <BalanceCard
          title="Available FXRP"
          value={vault.fxrpBalance}
          suffix="FXRP"
          description="Ready to deposit or spend"
          loading={vault.isLoading}
        />
        <BalanceCard
          title={firelight.isAvailable ? "Upshift position" : "Vault assets"}
          value={vault.vaultAssets}
          suffix="FXRP"
          description={
            firelight.isAvailable
              ? "Withdraw and spend ready"
              : "Current underlying value"
          }
          loading={vault.isLoading}
        />
        <BalanceCard
          title={firelight.isAvailable ? "Firelight position" : "Vault shares"}
          value={firelight.isAvailable ? firelight.assets : vault.vaultShares}
          suffix={firelight.isAvailable ? "FXRP value" : "rFXRP"}
          description={
            firelight.isAvailable
              ? `${firelight.shares} stXRP / scheduled exit`
              : "Your ownership position"
          }
          loading={firelight.isAvailable ? firelight.isLoading : vault.isLoading}
        />
      </section>

      <YieldStrategyPanel
        firelight={firelight}
        selectedStrategy={strategy.selectedStrategy}
        setStrategy={strategy.setStrategy}
        vault={vault}
      />

      <AutoHedgeSummary />

      <section className="mt-7" aria-labelledby="quick-actions-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="quick-actions-heading" className="text-lg font-semibold">
              What do you want to do?
            </h2>
            <p className="mt-1 text-xs text-[#747f89]">
              Move, use, or add to your FXRP position.
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/deposit"
            className="glass-panel group rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#4de2ad]/35 hover:bg-[#101815]/80"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-[#4de2ad]/18 bg-[#4de2ad]/[0.06] text-[#4de2ad]">
              <ArrowDownToLine aria-hidden="true" size={18} />
            </span>
            <span className="mt-4 block text-sm font-semibold">
              Earn
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#747f89]">
              Deposit into Upshift or Firelight.
            </span>
          </Link>

          <Link
            href="/withdraw"
            className="glass-panel group rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#71b9e6]/35 hover:bg-[#101720]/80"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-[#71b9e6]/18 bg-[#71b9e6]/[0.06] text-[#71b9e6]">
              <ArrowUpFromLine aria-hidden="true" size={18} />
            </span>
            <span className="mt-4 block text-sm font-semibold">
              Redeem
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#747f89]">
              Return spend-ready vault assets.
            </span>
          </Link>

          <Link
            href="/spend"
            className="glass-panel group rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#f2b84b]/35 hover:bg-[#17130b]/80"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-[#f2b84b]/18 bg-[#f2b84b]/[0.06] text-[#f2b84b]">
              <CircleDollarSign aria-hidden="true" size={18} />
            </span>
            <span className="mt-4 block text-sm font-semibold">
              Spend / Pay
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#747f89]">
              Pay from available or vault FXRP.
            </span>
          </Link>

          <Link
            href="/smart-accounts"
            className="glass-panel group rounded-xl border p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/[0.045]"
          >
            <span className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[#c3cbd1]">
              <Network aria-hidden="true" size={18} />
            </span>
            <span className="mt-4 block text-sm font-semibold">
              Use XRPL
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#747f89]">
              Deposit and pay through Xaman.
            </span>
          </Link>
        </div>
      </section>

      <TransactionHistory vault={vault} />
    </main>
  );
}
