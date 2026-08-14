"use client";

import {
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  RadioTower,
  Shield,
  Unplug,
} from "lucide-react";
import Link from "next/link";
import { useAutoHedge } from "@/components/AutoHedgeProvider";
import {
  getConfiguredExecutionTarget,
  getTriggerPriceUsd,
  normalizeAutoHedgeRule,
  type AutoHedgeStatus,
  type HedgeExecutionStatus,
} from "@/lib/autoHedge";
import { productErrorMessage } from "@/lib/feedback";
import { useHyperliquidPosition } from "@/hooks/useHyperliquidPosition";

const statusStyles: Record<AutoHedgeStatus, string> = {
  armed: "border-[#4de2ad]/25 bg-[#4de2ad]/[0.07] text-[#82e8c2]",
  error: "border-[#df6b6b]/25 bg-[#df6b6b]/[0.07] text-[#f0a3a3]",
  off: "border-white/10 bg-white/[0.03] text-[#89939e]",
  triggered: "border-[#f2b84b]/25 bg-[#f2b84b]/[0.08] text-[#f4cd7d]",
};

const statusLabels: Record<AutoHedgeStatus, string> = {
  armed: "Armed",
  error: "Error",
  off: "Off",
  triggered: "Triggered",
};

const executionStyles: Record<HedgeExecutionStatus, string> = {
  failed: "border-[#df6b6b]/25 bg-[#df6b6b]/[0.07] text-[#f0a3a3]",
  pending: "border-[#f2b84b]/25 bg-[#f2b84b]/[0.08] text-[#f4cd7d]",
  success: "border-[#4de2ad]/25 bg-[#4de2ad]/[0.07] text-[#82e8c2]",
};

function displayPrice(value: string | undefined) {
  const price = Number(value);
  if (!Number.isFinite(price)) {
    return "--";
  }
  return price.toLocaleString(undefined, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  });
}

function displayTrigger(rule: ReturnType<typeof normalizeAutoHedgeRule> | null) {
  if (!rule || rule.triggerMode !== "single") {
    return null;
  }
  const triggerPrice = getTriggerPriceUsd({
    referencePriceUsd: rule.referencePriceUsd,
    threshold: rule.threshold,
    triggerType: rule.triggerType,
  });
  if (rule.triggerType === "absolute") {
    return `Below $${displayPrice(rule.threshold)}`;
  }
  return triggerPrice === null
    ? `−${rule.threshold}% drop`
    : `−${rule.threshold}% ($${displayPrice(String(triggerPrice))})`;
}

export function AutoHedgeSummary() {
  const autoHedge = useAutoHedge();
  const rule = autoHedge.rule;
  const status = rule?.status ?? "off";
  const execution = rule?.lastExecution;
  const normalized = rule ? normalizeAutoHedgeRule(rule) : null;
  const market = getConfiguredExecutionTarget(autoHedge.chainId).market;
  const { position } = useHyperliquidPosition(
    autoHedge.hyperliquidLink,
    market,
  );
  const hyperliquidReady =
    autoHedge.hyperliquidLink?.status === "authorized" &&
    Boolean(autoHedge.hyperliquidLink?.authorizedAt);
  const hedgeOpen =
    Boolean(normalized?.hedgeOpen) || Boolean(position);
  const executionLabel =
    execution?.status === "pending"
      ? "Execution pending"
      : execution?.status === "failed"
        ? "Execution failed"
        : execution?.status === "success"
          ? "Execution successful"
          : null;
  const pnl = position?.unrealizedPnl ?? null;
  const watchMessage =
    status === "armed"
      ? normalized?.triggerMode === "ladder"
        ? `Ladder of ${normalized.tranches.length} tranches watching XRP.`
        : normalized?.triggerMode === "trailing"
          ? `Watching for a ${normalized.trailingStopPercent}% drop from the high.`
          : `Watching for the threshold cross on ${market}.`
      : status === "triggered"
        ? "Protection opened. Close it from the Auto-Hedge page or let auto-close handle it."
        : rule?.error
          ? productErrorMessage(
              rule.error,
              "Protection needs attention. Open Auto-Hedge to review.",
            )
          : autoHedge.syncError
            ? productErrorMessage(
                autoHedge.syncError,
                "Protection settings couldn't be synced.",
              )
            : "XRP downside protection is off.";

  return (
    <section
      aria-labelledby="auto-hedge-summary-heading"
      className="glass-panel mt-7 overflow-hidden rounded-xl border border-[#71b9e6]/15"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#71b9e6]/20 bg-[#71b9e6]/[0.07] text-[#71b9e6]">
            <Shield aria-hidden="true" size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="auto-hedge-summary-heading"
                className="text-base font-semibold"
              >
                Auto-Hedge
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusStyles[status]}`}
              >
                {statusLabels[status]}
              </span>
              {executionLabel && execution ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${executionStyles[execution.status]}`}
                >
                  {executionLabel}
                </span>
              ) : null}
              {hedgeOpen ? (
                <span className="rounded-full border border-[#f2b84b]/30 bg-[#f2b84b]/[0.08] px-2 py-0.5 text-[10px] font-semibold text-[#f4cd7d]">
                  Hedge open
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-[#7d8790]">{watchMessage}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-[10px] font-medium uppercase text-[#68737d]">
              <RadioTower
                aria-hidden="true"
                className="text-[#4de2ad]"
                size={12}
              />
              FTSO XRP/USD
            </p>
            <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-white">
              {autoHedge.price.isLoading
                ? "Loading"
                : `$${displayPrice(autoHedge.price.data?.priceUsd)}`}
            </p>
          </div>
          <Link
            href="/auto-hedge"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3.5 text-xs font-semibold text-[#d7dcdf] transition hover:border-[#4de2ad]/40 hover:text-[#82e8c2]"
          >
            {hyperliquidReady ? "Manage" : "Set up"}
            <ArrowUpRight aria-hidden="true" size={13} />
          </Link>
        </div>
      </div>

      {normalized && status !== "off" ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] bg-white/[0.012] px-4 py-3 sm:grid-cols-4 sm:px-5">
          <SummaryMetric
            label={
              normalized.triggerMode === "ladder"
                ? "Trigger"
                : normalized.triggerMode === "trailing"
                  ? "Trailing"
                  : "Trigger"
            }
            value={
              normalized.triggerMode === "ladder"
                ? `${normalized.tranches.length} tranches`
                : normalized.triggerMode === "trailing"
                  ? `−${normalized.trailingStopPercent}% from high`
                  : displayTrigger(normalized) ?? "--"
            }
          />
          <SummaryMetric
            label="Hedge size"
            value={`${normalized.hedgeSizePercent}% (${displayPrice(
              normalized.hedgeAmountFxrp,
            )} FXRP)`}
          />
          <SummaryMetric
            label="Leverage"
            value={`${normalized.leverage}x ${normalized.marginMode}`}
          />
          <SummaryMetric
            label="Hyperliquid"
            value={
              autoHedge.hyperliquidLink
                ? hyperliquidReady
                  ? "Ready"
                  : "Needs approval"
                : "Not connected"
            }
            valueClassName={
              hyperliquidReady
                ? "text-[#82e8c2]"
                : autoHedge.hyperliquidLink
                  ? "text-[#f4cd7d]"
                  : undefined
            }
          />
        </div>
      ) : null}

      {hedgeOpen && position ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <SummaryMetric
              label="Entry"
              value={`$${displayPrice(String(position.entryPx))}`}
            />
            <SummaryMetric
              label="Mark"
              value={`$${displayPrice(String(position.markPx))}`}
            />
            <SummaryMetric
              label="Unrealized PnL"
              value={`${
                pnl !== null && pnl < 0 ? "−" : "+"
              }$${displayPrice(String(Math.abs(pnl ?? 0)))}`}
              valueClassName={
                pnl !== null && pnl < 0 ? "text-[#f0a3a3]" : "text-[#82e8c2]"
              }
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void autoHedge
                .closeHedge()
                .catch((error) =>
                  console.error("[RippleFI] Dashboard close failed", error),
                );
            }}
            disabled={autoHedge.isClosing || autoHedge.isExecuting}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#f2b84b]/35 bg-[#f2b84b]/[0.08] px-4 text-xs font-semibold text-[#f4cd7d] transition hover:bg-[#f2b84b]/[0.13] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {autoHedge.isClosing ? (
              <LoaderCircle
                aria-hidden="true"
                size={13}
                className="animate-spin"
              />
            ) : (
              <Unplug aria-hidden="true" size={13} />
            )}
            {autoHedge.isClosing ? "Closing" : "Close hedge"}
          </button>
        </div>
      ) : null}

      {status === "error" || (execution?.status === "failed" && position === null) ? (
        <div className="flex items-start gap-2 border-t border-white/[0.06] px-4 py-3 text-xs leading-5 text-[#89939e] sm:px-5">
          {execution?.status === "success" ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#4de2ad]"
              size={14}
            />
          ) : null}
          <span>
            {execution?.status === "success"
              ? execution.message
              : watchMessage}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase text-[#68737d]">
        {label}
      </p>
      <p
        className={`mt-1 truncate font-mono text-xs font-semibold tabular-nums text-[#d7dcdf] ${
          valueClassName ?? ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
