"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  CircleDollarSign,
  History,
  TrendingUp,
} from "lucide-react";
import type { VaultState } from "@/hooks/useVault";
import {
  useVaultHistory,
  type VaultActivityItem,
} from "@/hooks/useVaultActivity";

const activityStyles = {
  deposit: {
    icon: ArrowDownToLine,
    surface: "border-[#4de2ad]/20 bg-[#4de2ad]/[0.06] text-[#4de2ad]",
    amount: "text-[#7ce9c1]",
    sign: "+",
  },
  spend: {
    icon: CircleDollarSign,
    surface: "border-[#f2b84b]/20 bg-[#f2b84b]/[0.06] text-[#f2b84b]",
    amount: "text-[#f3c66d]",
    sign: "-",
  },
  withdraw: {
    icon: ArrowUpFromLine,
    surface: "border-[#71b9e6]/20 bg-[#71b9e6]/[0.06] text-[#71b9e6]",
    amount: "text-[#9ed3f1]",
    sign: "-",
  },
};

function activityTime(timestamp: number | undefined, networkName: string) {
  if (!timestamp) {
    return `Confirmed on ${networkName}`;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(timestamp * 1000);
}

export function TransactionHistory({ vault }: { vault: VaultState }) {
  const history = useVaultHistory(vault);
  const hasDeposits = history.depositedRaw > 0n;
  const performancePositive =
    history.performanceRaw !== undefined && history.performanceRaw >= 0n;

  return (
    <section
      aria-labelledby="transaction-history-heading"
      className="glass-panel mt-6 overflow-hidden rounded-xl border"
    >
      <div className="flex flex-col gap-4 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-[#aeb7be]">
            <History aria-hidden="true" size={18} />
          </span>
          <div>
            <h2
              id="transaction-history-heading"
              className="text-base font-semibold text-white"
            >
              Transaction history
            </h2>
            <p className="mt-0.5 text-[11px] text-[#6f7a83]">
              Deposits, withdrawals, and payments since this vault launched
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-white/[0.07] bg-black/10">
          <SummaryMetric label="Deposited" value={history.deposited} />
          <SummaryMetric label="Withdrawn / paid" value={history.withdrawn} />
          <SummaryMetric
            accent={
              hasDeposits
                ? performancePositive
                  ? "green"
                  : "muted"
                : "muted"
            }
            label={hasDeposits ? "Performance" : "Yield earned"}
            value={hasDeposits ? (history.performance ?? "Loading") : "N/A"}
          />
        </div>
      </div>

      {hasDeposits ? (
        <div className="flex items-start gap-2 border-b border-white/[0.06] bg-[#4de2ad]/[0.025] px-4 py-2.5 text-[10px] leading-4 text-[#77848d] sm:px-5">
          <TrendingUp
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[#4de2ad]"
            size={13}
          />
          Performance estimate = current vault value + vault withdrawals and
          payments - deposits. It is derived from on-chain events and includes
          strategy yield, exit fees, and rounding.
        </div>
      ) : null}

      {history.isPartial ? (
        <div className="border-b border-[#f2b84b]/15 bg-[#f2b84b]/[0.035] px-4 py-2.5 text-[10px] leading-4 text-[#a28d66] sm:px-5">
          Partial history loaded. Some {vault.chain.name} event sources are temporarily
          unavailable, so totals or performance may be incomplete.
        </div>
      ) : null}

      <div className="min-h-52">
        {history.isLoading ? (
          <div className="divide-y divide-white/[0.06]">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 px-4 py-3.5 sm:px-5"
              >
                <div className="size-9 animate-pulse rounded-lg bg-white/[0.05]" />
                <div className="flex-1">
                  <div className="h-3 w-28 animate-pulse rounded bg-white/[0.06]" />
                  <div className="mt-2 h-2.5 w-44 animate-pulse rounded bg-white/[0.035]" />
                </div>
              </div>
            ))}
          </div>
        ) : history.isError ? (
          <HistoryState
            title="History provider temporarily unavailable"
            description={`RippleFI retried the indexed ${vault.chain.name} event sources but none responded. Refresh shortly; balances and transaction flows are unaffected.`}
          />
        ) : !vault.isConnected ? (
          <HistoryState
            title="Connect to view transaction history"
            description="Your wallet-scoped deposits, withdrawals, payments, and performance will appear here."
          />
        ) : history.items.length === 0 ? (
          <HistoryState
            title="No transactions yet"
            description="Deposit FXRP to start earning. Your on-chain activity and performance will appear here."
          />
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {history.items.map((item) => (
              <HistoryRow
                item={item}
                vault={vault}
                key={`${item.hash}-${item.label}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HistoryRow({
  item,
  vault,
}: {
  item: VaultActivityItem;
  vault: VaultState;
}) {
  const kind = item.kind ?? "withdraw";
  const styles = activityStyles[kind];
  const Icon = styles.icon;

  return (
    <a
      href={`${vault.chain.blockExplorers.default.url}/tx/${item.hash}`}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.022] sm:px-5"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${styles.surface}`}
      >
        <Icon aria-hidden="true" size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#dce1e4]">
          {item.label}
        </span>
        <span className="mt-1 block truncate font-mono text-[10px] text-[#66717a]">
          {item.detail} / {activityTime(item.timestamp, vault.chain.name)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={`font-mono text-xs font-semibold ${styles.amount}`}>
          {styles.sign}
          {item.amount} FXRP
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="text-[#53606a] transition group-hover:text-white"
          size={14}
        />
      </span>
    </a>
  );
}

function SummaryMetric({
  accent = "default",
  label,
  value,
}: {
  accent?: "default" | "green" | "muted";
  label: string;
  value: string;
}) {
  const valueColor =
    accent === "green"
      ? "text-[#6fe4ba]"
      : accent === "muted"
        ? "text-[#9ca6ad]"
        : "text-white";

  return (
    <div className="min-w-0 border-r border-white/[0.06] px-3 py-2 last:border-r-0">
      <p className="truncate text-[8px] font-semibold uppercase tracking-[0.1em] text-[#616c75]">
        {label}
      </p>
      <p className={`mt-1 truncate font-mono text-[11px] font-semibold ${valueColor}`}>
        {value} {value !== "N/A" && value !== "Loading" ? "FXRP" : ""}
      </p>
    </div>
  );
}

function HistoryState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-5 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-[#66717a]">
        <History aria-hidden="true" size={18} />
      </span>
      <p className="mt-3 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1.5 max-w-sm text-xs leading-5 text-[#6f7a83]">
        {description}
      </p>
    </div>
  );
}
