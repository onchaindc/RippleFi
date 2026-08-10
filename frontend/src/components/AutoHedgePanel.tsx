"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Link2,
  RadioTower,
  Shield,
  Unplug,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import type { VaultState } from "@/hooks/useVault";
import { useAutoHedge } from "@/components/AutoHedgeProvider";
import {
  getConfiguredExecutionTarget,
  getTriggerPriceUsd,
  type AutoHedgeStatus,
  type AutoHedgeTriggerType,
  type HedgeExecutionStatus,
} from "@/lib/autoHedge";
import { compactError, productErrorMessage } from "@/lib/feedback";

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

function displayTime(value: number | null | undefined) {
  if (!value) {
    return "--";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function readError(error: unknown) {
  return compactError(
    error,
    "Protection settings couldn't be updated. Please try again.",
  );
}

function displayVenue(value: string | null | undefined) {
  if (value === "sparkdex-eternal") return "SparkDEX Eternal";
  if (value === "flamix") return "Flamix";
  if (value === "hyperliquid") return "Hyperliquid";
  if (value === "ripplefi-intent-log") return "Intent record";
  return value || "";
}

export function AutoHedgePanel({
  additionalPositionRaw = 0n,
  vault,
}: {
  additionalPositionRaw?: bigint;
  vault: VaultState;
}) {
  const autoHedge = useAutoHedge();
  const [triggerType, setTriggerType] =
    useState<AutoHedgeTriggerType>("percent-drop");
  const [threshold, setThreshold] = useState("10");
  const [hedgeSizePercent, setHedgeSizePercent] = useState(50);
  const [message, setMessage] = useState("");
  const rule = autoHedge.rule;
  const status = rule?.status ?? "off";
  const execution = rule?.lastExecution;
  const executionPending = execution?.status === "pending";
  const controlsLocked =
    Boolean(rule?.enabled) || autoHedge.isExecuting || executionPending;
  const positionRaw =
    (vault.fxrpBalanceRaw ?? 0n) +
    (vault.vaultAssetsRaw ?? 0n) +
    additionalPositionRaw;
  const hedgeBips = BigInt(Math.round(hedgeSizePercent * 100));
  const hedgeAmountRaw = (positionRaw * hedgeBips) / 10_000n;
  const positionFxrp = formatUnits(positionRaw, vault.decimals);
  const hedgeAmountFxrp = formatUnits(hedgeAmountRaw, vault.decimals);
  const currentReference =
    rule?.referencePriceUsd || autoHedge.price.data?.priceUsd || "";
  const savedHedgeSizePercent = rule?.hedgeSizePercent;
  const savedRuleId = rule?.id;
  const savedThreshold = rule?.threshold;
  const savedTriggerType = rule?.triggerType;
  const triggerPrice = getTriggerPriceUsd({
    referencePriceUsd: currentReference,
    threshold: rule?.threshold ?? threshold,
    triggerType: rule?.triggerType ?? triggerType,
  });
  const triggeredIntent = rule?.lastIntent;
  const displayedTriggerPrice =
    triggeredIntent?.trigger.triggerPriceUsd ??
    (triggerPrice === null ? undefined : String(triggerPrice));
  const displayedProtectedSize =
    triggeredIntent?.protectedFxrpAmount ??
    rule?.hedgeAmountFxrp ??
    hedgeAmountFxrp;
  const executionLabel =
    execution?.status === "pending"
      ? "Execution pending"
      : execution?.status === "failed"
        ? "Execution failed"
        : execution?.status === "success" &&
            execution.adapterMode === "record"
          ? "Intent recorded"
          : execution?.status === "success"
            ? "Execution successful"
            : null;
  const executionDetail = [
    displayVenue(execution?.venue),
    execution?.network,
    execution?.market ? `${execution.market} perp` : null,
    execution?.direction,
    execution?.size
      ? `${displayPrice(execution.size)} ${execution.market || "units"}`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const hyperliquidReady =
    autoHedge.hyperliquidLink?.status === "authorized" &&
    Boolean(autoHedge.hyperliquidLink?.authorizedAt);
  const hyperliquidNeedsApproval =
    Boolean(autoHedge.hyperliquidLink) && !hyperliquidReady;
  // Arming a Hyperliquid rule before approval only surfaces later as a 403
  // from the execute route, so block it here with a reason the user can act on.
  const venueIsHyperliquid =
    getConfiguredExecutionTarget(autoHedge.chainId).venue === "hyperliquid";
  const approvalBlocksArming = venueIsHyperliquid && !hyperliquidReady;
  const hyperliquidStatus = hyperliquidReady
    ? "Ready"
    : hyperliquidNeedsApproval
      ? "Needs approval"
      : "Not connected";

  useEffect(() => {
    if (
      !savedRuleId ||
      savedHedgeSizePercent === undefined ||
      !savedThreshold ||
      !savedTriggerType
    ) {
      return;
    }
    queueMicrotask(() => {
      setTriggerType(savedTriggerType);
      setThreshold(savedThreshold);
      setHedgeSizePercent(savedHedgeSizePercent);
    });
  }, [
    savedHedgeSizePercent,
    savedRuleId,
    savedThreshold,
    savedTriggerType,
  ]);

  async function toggleAutoHedge() {
    setMessage("");
    if (!rule?.enabled && approvalBlocksArming) {
      setMessage(
        "Enable Hyperliquid protection first — protection can't arm until you approve it.",
      );
      return;
    }
    try {
      if (rule?.enabled) {
        await autoHedge.disarm();
        setMessage("Protection rule disabled.");
      } else {
        await autoHedge.arm({
          hedgeAmountFxrp,
          hedgeSizePercent,
          positionFxrp,
          threshold,
          triggerType,
        });
        setMessage("Protection rule armed.");
      }
    } catch (error) {
      setMessage(readError(error));
    }
  }

  async function enableHyperliquid() {
    setMessage("");
    try {
      await autoHedge.enableHyperliquid();
      setMessage("Hyperliquid protection is ready.");
    } catch (error) {
      setMessage(readError(error));
    }
  }

  async function disconnectHyperliquid() {
    setMessage("");
    try {
      await autoHedge.disconnectHyperliquid();
      setMessage("Hyperliquid protection turned off.");
    } catch (error) {
      setMessage(readError(error));
    }
  }

  return (
    <section
      aria-labelledby="auto-hedge-heading"
      className="glass-panel mt-6 overflow-hidden rounded-xl border border-[#71b9e6]/15"
    >
      <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#71b9e6]/20 bg-[#71b9e6]/[0.07] text-[#71b9e6]">
            <Shield aria-hidden="true" size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="auto-hedge-heading" className="text-base font-semibold">
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
            </div>
            <p className="mt-0.5 text-xs text-[#7d8790]">
              XRP downside protection
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-[10px] font-medium uppercase text-[#68737d]">
              <RadioTower
                aria-hidden="true"
                className="text-[#4de2ad]"
                size={12}
              />
              FTSO XRP/USD
            </p>
            <p className="mt-0.5 font-mono text-base font-semibold text-white">
              {autoHedge.price.isLoading
                ? "Loading"
                : `$${displayPrice(autoHedge.price.data?.priceUsd)}`}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(rule?.enabled)}
            aria-label={
              rule?.enabled ? "Disable Auto-Hedge" : "Enable Auto-Hedge"
            }
            onClick={toggleAutoHedge}
            disabled={
              autoHedge.isExecuting ||
              autoHedge.isSyncing ||
              executionPending ||
              !vault.address ||
              autoHedge.price.isLoading ||
              (!rule?.enabled && approvalBlocksArming)
            }
            className={`relative h-7 w-12 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${
              rule?.enabled
                ? "border-[#4de2ad]/50 bg-[#194937]"
                : "border-white/15 bg-white/[0.06]"
            }`}
          >
            <span
              className={`absolute top-1/2 size-5 -translate-y-1/2 rounded-full transition ${
                rule?.enabled
                  ? "left-[25px] bg-[#82e8c2]"
                  : "left-[3px] bg-[#89939e]"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.06] bg-white/[0.012] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link2 aria-hidden="true" size={14} className="text-[#71b9e6]" />
              <p className="text-xs font-semibold text-[#d7dcdf]">
                Hyperliquid protection
              </p>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  hyperliquidReady
                    ? executionStyles.success
                    : hyperliquidNeedsApproval
                      ? executionStyles.pending
                      : statusStyles.off
                }`}
              >
                {hyperliquidStatus}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[#68737d]">
              Allow protective shorts on your Hyperliquid account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hyperliquidReady ? null : (
              <button
                type="button"
                onClick={enableHyperliquid}
                disabled={autoHedge.isHyperliquidBusy || !vault.address}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#4de2ad]/35 bg-[#4de2ad]/[0.08] px-4 text-xs font-semibold text-[#82e8c2] transition hover:bg-[#4de2ad]/[0.13] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {autoHedge.isHyperliquidBusy ? (
                  <LoaderCircle
                    aria-hidden="true"
                    size={13}
                    className="animate-spin"
                  />
                ) : (
                  <Shield aria-hidden="true" size={13} />
                )}
                {autoHedge.isHyperliquidBusy
                  ? "Waiting for approval"
                  : hyperliquidNeedsApproval
                    ? "Approve protection"
                    : "Enable Hyperliquid protection"}
              </button>
            )}
            {autoHedge.hyperliquidLink ? (
              <button
                type="button"
                onClick={disconnectHyperliquid}
                disabled={autoHedge.isHyperliquidBusy}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-white/10 px-3 text-xs font-semibold text-[#89939e] transition hover:border-[#df6b6b]/30 hover:text-[#f0a3a3] disabled:opacity-50"
              >
                <Unplug aria-hidden="true" size={13} />
                Turn off
              </button>
            ) : null}
          </div>
        </div>

        {autoHedge.hyperliquidLink ? (
          <p className="mt-3 text-[11px] leading-4 text-[#68737d]">
            {hyperliquidReady
              ? "Protective shorts run on your own Hyperliquid account. You can turn this off at any time."
              : "Approve the request in your wallet to finish enabling protection."}
          </p>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="px-4 py-4 sm:px-5">
          <div>
            <span className="text-[10px] font-semibold uppercase text-[#68737d]">
              Trigger
            </span>
            <div className="mt-2 grid grid-cols-2 rounded-md border border-white/10 bg-[#080b0f]/70 p-1">
              <button
                type="button"
                onClick={() => setTriggerType("percent-drop")}
                disabled={controlsLocked}
                className={`h-9 rounded px-2 text-xs font-medium transition ${
                  triggerType === "percent-drop"
                    ? "bg-[#172331] text-[#9bd3f5]"
                    : "text-[#7d8790]"
                }`}
              >
                Percent drop
              </button>
              <button
                type="button"
                onClick={() => setTriggerType("absolute")}
                disabled={controlsLocked}
                className={`h-9 rounded px-2 text-xs font-medium transition ${
                  triggerType === "absolute"
                    ? "bg-[#172331] text-[#9bd3f5]"
                    : "text-[#7d8790]"
                }`}
              >
                Price threshold
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-[#89939e]">
                {triggerType === "percent-drop"
                  ? "Protect after drop"
                  : "Protect below price"}
              </span>
              <div className="mt-2 flex h-11 items-center rounded-md border border-white/10 bg-[#080b0f]/70 px-3 focus-within:border-[#71b9e6]/50">
                {triggerType === "absolute" ? (
                  <span className="mr-2 text-sm text-[#68737d]">$</span>
                ) : null}
                <input
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                  disabled={controlsLocked}
                  inputMode="decimal"
                  aria-label="Auto-Hedge threshold"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none disabled:opacity-60"
                />
                {triggerType === "percent-drop" ? (
                  <span className="ml-2 text-sm text-[#68737d]">%</span>
                ) : null}
              </div>
            </label>

            <div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-[#89939e]">Hedge size</span>
                <span className="font-mono text-[#cbd2d7]">
                  {hedgeSizePercent}%
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={hedgeSizePercent}
                onChange={(event) =>
                  setHedgeSizePercent(Number(event.target.value))
                }
                disabled={controlsLocked}
                aria-label="Hedge size percent"
                className="mt-3 h-2 w-full cursor-pointer accent-[#71b9e6] disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="mt-2 flex justify-between text-[10px] text-[#5f6972]">
                <span>10%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] bg-white/[0.015] px-4 py-4 sm:px-5 lg:border-l lg:border-t-0">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <HedgeMetric
              label="Trigger price"
              value={
                displayedTriggerPrice
                  ? `$${displayPrice(displayedTriggerPrice)}`
                  : "--"
              }
            />
            <HedgeMetric
              label="Protected size"
              value={`${displayPrice(displayedProtectedSize)} FXRP`}
            />
            <HedgeMetric
              label={status === "triggered" ? "Triggered at" : "Reference"}
              value={
                status === "triggered"
                  ? displayTime(rule?.triggeredAt)
                  : currentReference
                  ? `$${displayPrice(currentReference)}`
                  : "--"
              }
            />
            <HedgeMetric
              label={status === "triggered" ? "Execution" : "Position"}
              value={
                status === "triggered"
                  ? executionLabel ?? "Preparing"
                  : `${displayPrice(positionFxrp)} FXRP`
              }
            />
          </div>

          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <div className="flex items-start gap-2 text-xs leading-5">
              {autoHedge.isExecuting || executionPending ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 animate-spin text-[#f2b84b]"
                  size={14}
                />
              ) : execution?.status === "success" ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[#4de2ad]"
                  size={14}
                />
              ) : execution?.status === "failed" ||
                status === "error" ||
                autoHedge.price.error ? (
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[#df6b6b]"
                  size={14}
                />
              ) : (
                <Zap
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[#71b9e6]"
                  size={14}
                />
              )}
              <span className="text-[#89939e]">
                {autoHedge.isExecuting || executionPending
                  ? "Trigger confirmed. Opening protection."
                  : execution?.status === "success"
                    ? execution.message
                    : execution?.status === "failed"
                      ? productErrorMessage(
                          execution.error || execution.message,
                          "Protection couldn't be opened right now. Please try again.",
                        )
                      : rule?.error
                        ? productErrorMessage(
                            rule.error,
                            "Protection needs attention. Please try again.",
                          )
                        : autoHedge.syncError
                          ? productErrorMessage(
                              autoHedge.syncError,
                              "Protection settings couldn't be synced.",
                            )
                          : autoHedge.price.error
                            ? productErrorMessage(
                                autoHedge.price.error,
                                "Live XRP price is temporarily unavailable.",
                              )
                            : message ||
                              (status === "triggered"
                                ? "Protection intent recorded."
                                : status === "armed"
                                  ? `Watching ${vault.chain.name} for the threshold cross.`
                                  : vault.address
                                    ? "Set the rule, then enable protection."
                                    : "Connect a wallet to configure protection.")}
              </span>
            </div>
            {status === "triggered" && rule?.triggeredAt ? (
              <div className="mt-3 border-t border-white/[0.05] pt-3">
                <div className="space-y-2.5">
                  <ExecutionStep
                    detail={displayTime(triggeredIntent?.timestamp)}
                    label="Intent created"
                    state="complete"
                  />
                  <ExecutionStep
                    detail={displayTime(execution?.requestedAt)}
                    label="Execution pending"
                    state={
                      execution?.status === "pending" ? "active" : "complete"
                    }
                  />
                  <ExecutionStep
                    detail={
                      execution?.status === "failed"
                        ? productErrorMessage(
                            execution.error,
                            "Protection couldn't be opened right now.",
                          )
                        : execution?.status === "success"
                          ? displayTime(execution.completedAt)
                          : "Waiting for venue response"
                    }
                    label={
                      execution?.status === "failed"
                        ? "Execution failed"
                        : execution?.status === "success"
                          ? "Execution successful"
                          : "Venue result"
                    }
                    state={
                      execution?.status === "failed"
                        ? "failed"
                        : execution?.status === "success"
                          ? "complete"
                          : "waiting"
                    }
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.05] pt-3 text-[10px] text-[#68737d]">
                  <span className="flex items-center gap-1.5">
                    <Clock3 aria-hidden="true" size={12} />
                    Triggered {displayTime(rule.triggeredAt)}
                  </span>
                  {execution?.adapter ? (
                    <span>{displayVenue(execution.venue)}</span>
                  ) : null}
                  {executionDetail ? <span>{executionDetail}</span> : null}
                  {execution?.externalOrderId ? (
                    <span className="font-mono text-[#9ba6af]">
                      Ref {execution.externalOrderId}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExecutionStep({
  detail,
  label,
  state,
}: {
  detail: string;
  label: string;
  state: "active" | "complete" | "failed" | "waiting";
}) {
  const dotStyle =
    state === "failed"
      ? "border-[#df6b6b]/50 bg-[#df6b6b]"
      : state === "active"
        ? "animate-pulse border-[#f2b84b]/50 bg-[#f2b84b]"
        : state === "complete"
          ? "border-[#4de2ad]/50 bg-[#4de2ad]"
          : "border-white/15 bg-white/[0.04]";
  const labelStyle =
    state === "failed"
      ? "text-[#f0a3a3]"
      : state === "waiting"
        ? "text-[#68737d]"
        : "text-[#cbd2d7]";

  return (
    <div className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-1 size-2 rounded-full border ${dotStyle}`}
      />
      <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <span className={`text-xs font-medium ${labelStyle}`}>{label}</span>
        <span className="break-words text-[10px] text-[#68737d]">{detail}</span>
      </div>
    </div>
  );
}

function HedgeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase text-[#68737d]">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-xs font-semibold text-[#d7dcdf]">
        {value}
      </p>
    </div>
  );
}
