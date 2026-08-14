"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Link2,
  Lock,
  RadioTower,
  Send,
  Shield,
  Unplug,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { VaultState } from "@/hooks/useVault";
import { FtsoPriceChart } from "@/components/FtsoPriceChart";
import { useAutoHedge } from "@/components/AutoHedgeProvider";
import { useToast } from "@/components/ToastProvider";
import {
  getConfiguredExecutionTarget,
  getTrancheTriggerPriceUsd,
  getTriggerPriceUsd,
  normalizeAutoHedgeRule,
  type AutoHedgeMarginMode,
  type AutoHedgeStatus,
  type AutoHedgeTranche,
  type AutoHedgeTriggerMode,
  type AutoHedgeTriggerType,
  type HedgeExecutionStatus,
} from "@/lib/autoHedge";
import { compactError, productErrorMessage } from "@/lib/feedback";
import {
  useHyperliquidPosition,
  type HyperliquidPosition,
} from "@/hooks/useHyperliquidPosition";

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

// A pending execution receipt only locks the form while it is plausibly still
// in flight (a market order settles in seconds to a minute).
const PENDING_LOCK_MS = 2 * 60_000;

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
  const { toast } = useToast();
  const [triggerType, setTriggerType] =
    useState<AutoHedgeTriggerType>("percent-drop");
  const [threshold, setThreshold] = useState("10");
  const [hedgeSizePercent, setHedgeSizePercent] = useState(50);
  const [leverage, setLeverage] = useState(1);
  const [marginMode, setMarginMode] =
    useState<AutoHedgeMarginMode>("cross");
  const [triggerMode, setTriggerMode] =
    useState<AutoHedgeTriggerMode>("single");
  const [trailingStopPercent, setTrailingStopPercent] = useState(5);
  const [tranches, setTranches] = useState<AutoHedgeTranche[]>([
    { threshold: "10", sizePercent: 50 },
    { threshold: "20", sizePercent: 50 },
  ]);
  const [alertEmail, setAlertEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailNote, setTestEmailNote] = useState("");
  const [autoCloseEnabled, setAutoCloseEnabled] = useState(false);
  const [autoClosePercent, setAutoClosePercent] = useState(2);
  const [rearm, setRearm] = useState(false);
  const [liqWarning, setLiqWarning] = useState<string | null>(null);
  const liqNotifiedRef = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const rule = autoHedge.rule;
  const status = rule?.status ?? "off";
  const execution = rule?.lastExecution;
  // A pending receipt only locks the form while the execution is actually
  // in flight. If the venue never settles, a stale "pending" would otherwise
  // disable every control - including the power toggle - forever.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (execution?.status !== "pending") {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [execution]);
  const executionPending =
    execution?.status === "pending" &&
    (execution.requestedAt ?? 0) > now - PENDING_LOCK_MS;
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
  const normalizedRule = rule ? normalizeAutoHedgeRule(rule) : null;
  const triggerPrice = getTriggerPriceUsd({
    referencePriceUsd: currentReference,
    threshold: rule?.threshold ?? threshold,
    triggerType: rule?.triggerType ?? triggerType,
  });
  const executionTarget = getConfiguredExecutionTarget(autoHedge.chainId);
  const hedgeMarket = executionTarget.market;
  const {
    error: positionError,
    position,
  } = useHyperliquidPosition(autoHedge.hyperliquidLink, hedgeMarket);

  // Surface a warning (and one email per position, if alerts are set) when
  // the open hedge is close to its liquidation price. Updates are deferred so
  // they never run synchronously inside the effect.
  useEffect(() => {
    if (!position) {
      queueMicrotask(() => setLiqWarning(null));
      return;
    }
    const { liquidationPx, markPx } = position;
    const distance =
      liquidationPx === null || markPx <= 0
        ? null
        : Math.abs(liquidationPx - markPx) / markPx;
    if (distance === null || distance > 0.03) {
      queueMicrotask(() => setLiqWarning(null));
      return;
    }
    const pct = distance * 100;
    queueMicrotask(() =>
      setLiqWarning(
        `Liquidation is ~${pct.toFixed(1)}% away at $${displayPrice(
          String(liquidationPx),
        )}. Consider closing the hedge.`,
      ),
    );
    const key = `${position.coin}:${liquidationPx}`;
    if (liqNotifiedRef.current !== key && alertEmail.trim()) {
      liqNotifiedRef.current = key;
      void autoHedge.sessionToken().then((token) => {
        if (!token) {
          return;
        }
        return fetch("/api/auto-hedge/alert", {
          body: JSON.stringify({
            chainId: autoHedge.chainId,
            detail: `${position.coin} hedge is ${pct.toFixed(1)}% from liquidation (mark $${displayPrice(String(markPx))}, liq $${displayPrice(String(liquidationPx))}).`,
            kind: "liquidation-warning",
            to: alertEmail.trim(),
            wallet: vault.address,
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        }).catch((error) =>
          console.error("[RippleFI] Alert request failed", error),
        );
      });
    }
  }, [alertEmail, autoHedge, position, vault.address]);
  const triggeredIntent = rule?.lastIntent;
  const activeTriggerMode = rule?.triggerMode ?? triggerMode;
  const nextTrancheIndex = normalizedRule?.nextTrancheIndex ?? 0;
  const nextTranche =
    normalizedRule?.triggerMode === "ladder" &&
    normalizedRule.tranches.length > 0
      ? (normalizedRule.tranches[nextTrancheIndex] ??
        normalizedRule.tranches[normalizedRule.tranches.length - 1])
      : null;
  const nextTrancheTrigger =
    normalizedRule && nextTranche
      ? getTrancheTriggerPriceUsd(normalizedRule, nextTranche)
      : null;
  const displayedTriggerPrice =
    triggeredIntent?.trigger.triggerPriceUsd ??
    (activeTriggerMode === "trailing"
      ? undefined
      : activeTriggerMode === "ladder"
        ? nextTrancheTrigger === null
          ? undefined
          : String(nextTrancheTrigger)
        : triggerPrice === null
          ? undefined
          : String(triggerPrice));
  const hedgeAmountXrp = Number(hedgeAmountFxrp) || 0;
  const livePriceUsd = Number(autoHedge.price.data?.priceUsd) || 0;
  const hedgeNotionalUsd = hedgeAmountXrp * livePriceUsd;
  const marginRequiredUsd =
    leverage > 0 ? hedgeNotionalUsd / leverage : 0;
  const estLiquidationPrice =
    leverage > 0 && livePriceUsd > 0
      ? livePriceUsd * (1 + 1 / leverage)
      : null;
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

  // Sync the form to the saved rule only when the rule itself changes
  // (hydration, arm/disarm, wallet switch). Depending on a freshly normalized
  // object here would re-fire this effect on EVERY render and revert each
  // click instantly - the "stale buttons" symptom with a connected wallet.
  useEffect(() => {
    if (!rule) {
      return;
    }
    const saved = normalizeAutoHedgeRule(rule);
    queueMicrotask(() => {
      setTriggerType(saved.triggerType);
      setThreshold(saved.threshold);
      setHedgeSizePercent(saved.hedgeSizePercent);
      setLeverage(saved.leverage);
      setMarginMode(saved.marginMode);
      setTriggerMode(saved.triggerMode);
      setTrailingStopPercent(saved.trailingStopPercent);
      if (saved.tranches.length > 0) {
        setTranches(saved.tranches);
      }
      setAlertEmail(saved.alertEmail);
      setAutoCloseEnabled(saved.autoClosePercent > 0);
      setAutoClosePercent(
        saved.autoClosePercent > 0 ? saved.autoClosePercent : 2,
      );
      setRearm(saved.rearm);
    });
  }, [rule]);

  async function toggleAutoHedge() {
    setMessage("");
    if (!rule?.enabled && approvalBlocksArming) {
      const notice =
        "Enable Hyperliquid protection first — protection can't arm until you approve it.";
      setMessage(notice);
      toast(notice, "warning");
      return;
    }
    try {
      if (rule?.enabled) {
        await autoHedge.disarm();
        setMessage("Protection rule disabled.");
        toast("Protection disabled.", "info");
      } else {
        await autoHedge.arm({
          alertEmail,
          autoClosePercent: autoCloseEnabled ? autoClosePercent : 0,
          hedgeAmountFxrp,
          hedgeSizePercent,
          leverage,
          marginMode,
          positionFxrp,
          rearm,
          threshold:
            triggerMode === "ladder"
              ? tranches[0]?.threshold || threshold
              : threshold,
          trailingStopPercent,
          tranches: triggerMode === "ladder" ? tranches : [],
          triggerMode,
          triggerType,
        });
        setMessage("Protection rule armed.");
        toast("Protection armed.", "success");
      }
    } catch (error) {
      const detail = readError(error);
      setMessage(detail);
      toast(detail, "error");
    }
  }

  async function enableHyperliquid() {
    setMessage("");
    try {
      await autoHedge.enableHyperliquid();
      setMessage("Hyperliquid protection is ready.");
      toast("Hyperliquid protection is ready.", "success");
    } catch (error) {
      const detail = readError(error);
      setMessage(detail);
      toast(detail, "error");
    }
  }

  async function disconnectHyperliquid() {
    setMessage("");
    try {
      await autoHedge.disconnectHyperliquid();
      setMessage("Hyperliquid protection turned off.");
      toast("Hyperliquid protection turned off.", "info");
    } catch (error) {
      const detail = readError(error);
      setMessage(detail);
      toast(detail, "error");
    }
  }

  async function sendTestEmail() {
    const email = alertEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const notice = "Enter a valid email address first.";
      setTestEmailNote(notice);
      toast(notice, "warning");
      return;
    }
    setTestingEmail(true);
    setTestEmailNote("");
    try {
      const token = await autoHedge.authorizeDevice();
      if (!token) {
        throw new Error("Approve this device before sending alerts.");
      }
      const response = await fetch("/api/auto-hedge/alert/test", {
        body: JSON.stringify({
          chainId: autoHedge.chainId,
          to: email,
          wallet: vault.address,
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        from?: string;
        sandbox?: boolean;
        sent?: boolean;
      } | null;
      if (!response.ok || !body?.sent) {
        throw new Error(body?.error || "The test email could not be sent.");
      }
      if (body.sandbox) {
        const note =
          "Test email sent from Resend's sandbox sender — it only delivers to the email on your Resend account. Verify a domain in Resend and set ALERT_EMAIL_FROM to send to any address.";
        setTestEmailNote(note);
        toast(
          "Test email sent — check the inbox of your Resend account email",
          "warning",
        );
      } else {
        setTestEmailNote("Test email sent — check your inbox.");
        toast("Test email sent — check your inbox.", "success");
      }
    } catch (error) {
      const detail = readError(error);
      setTestEmailNote(detail);
      toast(detail, "error");
    } finally {
      setTestingEmail(false);
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
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusStyles[status]}`}
              >
                {statusLabels[status]}
              </span>
              {executionLabel && execution ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${executionStyles[execution.status]}`}
                >
                  {executionLabel}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-[#7d8790]">
              XRP downside protection
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 sm:justify-end">
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-xs font-medium uppercase text-[#68737d]">
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
            // Disarming must always work, and when arming is blocked the click
            // should still fire so the reason is shown - a disabled button that
            // swallows the tap is exactly the "stale" experience users hit when
            // Hyperliquid approval is pending or the price feed is warming up.
            disabled={
              !vault.address ||
              (rule?.enabled
                ? false
                : autoHedge.isExecuting ||
                  autoHedge.isSyncing ||
                  executionPending)
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
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
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
            <p className="mt-1 text-xs leading-4 text-[#68737d]">
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
                  ? "Approve in your wallet…"
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
          <p className="mt-3 text-xs leading-4 text-[#68737d]">
            {hyperliquidReady
              ? "Protective shorts run on your own Hyperliquid account. You can turn this off at any time."
              : "Approve the request in your wallet to finish enabling protection."}
          </p>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <div className="px-4 py-5 sm:px-5 sm:py-6">
          {controlsLocked ? (
            <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-md border border-[#f2b84b]/25 bg-[#f2b84b]/[0.06] px-3 py-2.5 text-xs leading-4 text-[#c8aa6c]">
              <Lock
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={13}
              />
              <span className="min-w-0 flex-1">
                {executionPending
                  ? "Execution is in progress — settings unlock when it settles."
                  : "Protection is live — settings are locked while it runs."}
              </span>
              {rule?.enabled ? (
                <button
                  type="button"
                  onClick={() => {
                    void toggleAutoHedge().catch(() => {});
                  }}
                  className="shrink-0 rounded-full border border-[#f2b84b]/40 bg-[#f2b84b]/[0.12] px-3 py-1 font-semibold text-[#f4cd7d] transition hover:bg-[#f2b84b]/[0.2]"
                >
                  Disable protection
                </button>
              ) : null}
            </div>
          ) : null}
          <div>
            <span className="text-sm font-semibold uppercase text-[#68737d] sm:text-sm">
              Trigger
            </span>
            {triggerMode === "single" ? (
              <div className="mt-2 grid grid-cols-2 rounded-md border border-white/10 bg-[#080b0f]/70 p-1">
                <button
                  type="button"
                  onClick={() => setTriggerType("percent-drop")}
                  disabled={controlsLocked}
                  className={`h-10 rounded px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 ${
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
                  className={`h-10 rounded px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 ${
                    triggerType === "absolute"
                      ? "bg-[#172331] text-[#9bd3f5]"
                      : "text-[#7d8790]"
                  }`}
                >
                  Price threshold
                </button>
              </div>
            ) : (
              <p className="mt-2 text-xs leading-4 text-[#68737d]">
                {triggerMode === "trailing"
                  ? "Triggered by the trailing distance below."
                  : "Triggered by the ladder tranches below."}
              </p>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {triggerMode === "single" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#89939e]">
                  {triggerType === "percent-drop"
                    ? "Protect after drop"
                    : "Protect below price"}
                </span>
                <div className="mt-2 flex h-11 items-center rounded-md border border-white/10 bg-[#080b0f]/70 px-3">
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
            ) : null}

            {triggerMode !== "ladder" ? (
              <div>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-[#89939e]">
                    Hedge size
                  </span>
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
                  className="mt-3 h-3 w-full cursor-pointer accent-[#71b9e6] disabled:cursor-not-allowed disabled:opacity-50 sm:h-2"
                />
                <div className="mt-2 flex justify-between text-xs text-[#5f6972] sm:text-xs">
                  <span>10%</span>
                  <span>100%</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <span className="text-sm font-semibold uppercase text-[#68737d] sm:text-sm">
              Trigger mode
            </span>
            <div className="mt-2 grid grid-cols-3 rounded-md border border-white/10 bg-[#080b0f]/70 p-1">
              {(["single", "trailing", "ladder"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setTriggerMode(mode);
                    // Trailing and ladder triggers are percentage-based; a
                    // leftover "absolute" selection is ignored by them.
                    if (mode !== "single") {
                      setTriggerType("percent-drop");
                    }
                  }}
                  disabled={controlsLocked}
                  className={`h-10 rounded px-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 ${
                    triggerMode === mode
                      ? "bg-[#172331] text-[#9bd3f5]"
                      : "text-[#7d8790]"
                  }`}
                >
                  {mode === "single"
                    ? "Single"
                    : mode === "trailing"
                      ? "Trailing"
                      : "Ladder"}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-4 text-[#5f6972] sm:text-xs">
              {triggerMode === "single"
                ? "One shot when the price crosses the threshold above."
                : triggerMode === "trailing"
                  ? "The stop rides up as XRP rallies, then triggers on a drop from the high."
                  : "Add protection in steps as the drop deepens."}
            </p>

            {triggerMode === "trailing" ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-[#89939e]">
                    Trailing distance
                  </span>
                  <div className="mt-2 flex h-11 items-center rounded-md border border-white/10 bg-[#080b0f]/70 px-3">
                    <input
                      value={trailingStopPercent}
                      onChange={(event) =>
                        setTrailingStopPercent(Number(event.target.value))
                      }
                      disabled={controlsLocked}
                      inputMode="decimal"
                      aria-label="Trailing stop distance percent"
                      className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none disabled:opacity-60"
                    />
                    <span className="ml-2 text-sm text-[#68737d]">%</span>
                  </div>
                </label>
                <p className="self-end pb-2 text-xs leading-4 text-[#68737d]">
                  Triggers when XRP falls {trailingStopPercent}% from its
                  recent high.
                </p>
              </div>
            ) : null}

            {triggerMode === "ladder" ? (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#89939e]">
                    Ladder tranches
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTranches((current) => [
                        ...current,
                        { threshold: "25", sizePercent: 25 },
                      ])
                    }
                    disabled={controlsLocked || tranches.length >= 4}
                    className="rounded-full border border-[#71b9e6]/30 px-2.5 py-1 text-xs font-semibold text-[#71b9e6] transition hover:bg-[#71b9e6]/10 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                  >
                    + Add tranche
                  </button>
                </div>
                {tranches.map((tranche, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 items-center gap-2 rounded-md border border-white/10 bg-[#080b0f]/70 p-2.5 sm:grid-cols-[1fr_1fr_auto]"
                >
                    <div className="flex h-9 items-center rounded border border-white/10 bg-transparent px-2">
                      <input
                        value={tranche.threshold}
                        onChange={(event) =>
                          setTranches((current) =>
                            current.map((t, i) =>
                              i === index
                                ? { ...t, threshold: event.target.value }
                                : t,
                            ),
                          )
                        }
                        disabled={controlsLocked}
                        inputMode="decimal"
                        aria-label={`Tranche ${index + 1} drop percent`}
                        className="w-full min-w-0 bg-transparent font-mono text-xs outline-none disabled:opacity-60"
                      />
                      <span className="ml-1 text-xs text-[#68737d]">
                        % drop
                      </span>
                    </div>
                    <div className="flex h-9 items-center rounded border border-white/10 bg-transparent px-2">
                      <input
                        type="range"
                        min="5"
                        max="100"
                        step="5"
                        value={tranche.sizePercent}
                        onChange={(event) =>
                          setTranches((current) =>
                            current.map((t, i) =>
                              i === index
                                ? {
                                    ...t,
                                    sizePercent: Number(event.target.value),
                                  }
                                : t,
                            ),
                          )
                        }
                        disabled={controlsLocked}
                        aria-label={`Tranche ${index + 1} size percent`}
                        className="h-3 w-full cursor-pointer accent-[#71b9e6] disabled:opacity-50 sm:h-2"
                      />
                      <span className="ml-2 w-9 text-right font-mono text-xs text-[#cbd2d7]">
                        {tranche.sizePercent}%
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setTranches((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                      disabled={controlsLocked || tranches.length <= 1}
                      aria-label={`Remove tranche ${index + 1}`}
                      className="flex size-8 items-center justify-center rounded-md border border-white/10 text-[#68737d] transition hover:border-[#df6b6b]/40 hover:text-[#f0a3a3] disabled:opacity-40"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[#89939e]">
                Leverage
              </span>
              <span className="font-mono text-[#cbd2d7]">{leverage}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={leverage}
              onChange={(event) => setLeverage(Number(event.target.value))}
              disabled={controlsLocked}
              aria-label="Leverage"
              className="mt-3 h-3 w-full cursor-pointer accent-[#71b9e6] disabled:cursor-not-allowed disabled:opacity-50 sm:h-2"
            />
            <div className="mt-2 flex justify-between text-xs text-[#5f6972] sm:text-xs">
              <span>1x</span>
              <span>50x</span>
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-md border border-white/10 bg-[#080b0f]/70 p-1">
              <button
                type="button"
                onClick={() => setMarginMode("cross")}
                disabled={controlsLocked}
                className={`h-10 rounded px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 ${
                  marginMode === "cross"
                    ? "bg-[#172331] text-[#9bd3f5]"
                    : "text-[#7d8790]"
                }`}
              >
                Cross
              </button>
              <button
                type="button"
                onClick={() => setMarginMode("isolated")}
                disabled={controlsLocked}
                className={`h-10 rounded px-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 ${
                  marginMode === "isolated"
                    ? "bg-[#172331] text-[#9bd3f5]"
                    : "text-[#7d8790]"
                }`}
              >
                Isolated
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs leading-4 text-[#68737d] sm:text-xs">
              <span>
                Margin ≈{" "}
                <span className="font-mono text-[#cbd2d7]">
                  ${displayPrice(String(marginRequiredUsd))}
                </span>
              </span>
              <span>
                {estLiquidationPrice !== null
                  ? `Est. liq ≈ ${displayPrice(String(estLiquidationPrice))}`
                  : "Est. liq —"}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-4 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#89939e]">
                  Auto-close after recovery
                </p>
                <p className="mt-0.5 text-xs leading-4 text-[#5f6972]">
                  Buy the hedge back automatically when XRP recovers.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoCloseEnabled}
                onClick={() => setAutoCloseEnabled((value) => !value)}
                disabled={controlsLocked}
                className={`relative h-6 w-10 shrink-0 rounded-full border transition disabled:opacity-40 ${
                  autoCloseEnabled
                    ? "border-[#4de2ad]/50 bg-[#194937]"
                    : "border-white/15 bg-white/[0.06]"
                }`}
              >
                <span
                  className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition ${
                    autoCloseEnabled
                      ? "left-[21px] bg-[#82e8c2]"
                      : "left-[3px] bg-[#89939e]"
                  }`}
                />
              </button>
            </div>
            {autoCloseEnabled ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#68737d]">
                  Recover within
                </span>
                <input
                  value={autoClosePercent}
                  onChange={(event) =>
                    setAutoClosePercent(Number(event.target.value))
                  }
                  disabled={controlsLocked}
                  inputMode="decimal"
                  aria-label="Auto-close recovery percent"
                  className="h-9 w-16 rounded-md border border-white/10 bg-[#080b0f]/70 px-2 text-center font-mono text-sm outline-none disabled:opacity-60"
                />
                <span className="text-xs text-[#68737d]">
                  % of the pre-drop price
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[#89939e]">Re-arm</p>
                <p className="mt-0.5 text-xs leading-4 text-[#5f6972]">
                  Watch the next drop automatically after the hedge closes.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={rearm}
                onClick={() => setRearm((value) => !value)}
                disabled={controlsLocked}
                className={`relative h-6 w-10 shrink-0 rounded-full border transition disabled:opacity-40 ${
                  rearm
                    ? "border-[#4de2ad]/50 bg-[#194937]"
                    : "border-white/15 bg-white/[0.06]"
                }`}
              >
                <span
                  className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition ${
                    rearm
                      ? "left-[21px] bg-[#82e8c2]"
                      : "left-[3px] bg-[#89939e]"
                  }`}
                />
              </button>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-[#89939e]">
                Email alerts
              </span>
              <span className="mt-0.5 block text-xs leading-4 text-[#5f6972]">
                Optional — get an email when the hedge opens or closes, or
                if liquidation gets close.
              </span>
              <div className="mt-2 flex h-11 items-center rounded-md border border-white/10 bg-[#080b0f]/70 px-3">
                <input
                  value={alertEmail}
                  onChange={(event) => {
                    setAlertEmail(event.target.value);
                    setTestEmailNote("");
                  }}
                  disabled={controlsLocked}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-label="Alert email address"
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[#5f6972] disabled:opacity-60"
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void sendTestEmail()}
                  disabled={testingEmail || controlsLocked}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[#71b9e6]/30 px-3 text-xs font-semibold text-[#9bd3f5] transition hover:bg-[#71b9e6]/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {testingEmail ? (
                    <LoaderCircle
                      aria-hidden="true"
                      size={12}
                      className="animate-spin"
                    />
                  ) : (
                    <Send aria-hidden="true" size={12} />
                  )}
                  {testingEmail ? "Sending…" : "Send test email"}
                </button>
                <span className="text-xs leading-4 text-[#5f6972]">
                  Verifies the alert pipeline instantly.
                </span>
              </div>
              {testEmailNote ? (
                <p className="mt-1.5 text-xs leading-4 text-[#8f9aa3]">
                  {testEmailNote}
                </p>
              ) : null}
            </label>
          </div>
        </div>

        <div className="border-t border-white/[0.06] bg-white/[0.015] px-4 py-5 sm:px-5 lg:border-l lg:border-t-0">
          <div className="mb-4">
            <FtsoPriceChart
              price={autoHedge.price.data}
              thresholdUsd={
                activeTriggerMode === "single" ? triggerPrice : null
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <HedgeMetric
              label={
                activeTriggerMode === "ladder"
                  ? "Next tranche"
                  : activeTriggerMode === "trailing"
                    ? "Trailing high"
                    : "Trigger price"
              }
              value={
                activeTriggerMode === "trailing"
                  ? normalizedRule?.trailingHighUsd
                    ? `$${displayPrice(normalizedRule.trailingHighUsd)}`
                    : "--"
                  : displayedTriggerPrice
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

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.05] pt-3 text-xs text-[#68737d]">
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
      {hyperliquidReady ? (
        <LiveHedgeCard
          isClosing={autoHedge.isClosing}
          liqWarning={liqWarning}
          market={hedgeMarket}
          onClose={() => {
            setMessage("");
            autoHedge
              .closeHedge()
              .then(() => {
                setMessage("Hedge closed.");
                toast("Hedge closed.", "success");
              })
              .catch((error) => {
                const detail = readError(error);
                setMessage(detail);
                toast(detail, "error");
              });
          }}
          position={position}
          positionError={positionError}
        />
      ) : null}
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
        <span className="break-words text-xs text-[#68737d]">{detail}</span>
      </div>
    </div>
  );
}

function HedgeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold uppercase text-[#68737d] sm:text-sm">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-semibold tabular-nums text-[#d7dcdf] sm:text-xs">
        {value}
      </p>
    </div>
  );
}

function LiveHedgeCard({
  isClosing,
  liqWarning,
  market,
  onClose,
  position,
  positionError,
}: {
  isClosing: boolean;
  liqWarning: string | null;
  market: string;
  onClose: () => void;
  position: HyperliquidPosition | null;
  positionError: string | null;
}) {
  const pnl = position?.unrealizedPnl ?? null;
  return (
    <div className="border-t border-white/[0.06] bg-white/[0.012] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity aria-hidden="true" size={14} className="text-[#71b9e6]" />
          <p className="text-xs font-semibold text-[#d7dcdf]">
            Live hedge — {market} perp
          </p>
          {position ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                pnl !== null && pnl < 0
                  ? executionStyles.failed
                  : executionStyles.success
              }`}
            >
              Short
            </span>
          ) : null}
        </div>
        {position ? (
          <button
            type="button"
            onClick={onClose}
            disabled={isClosing}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#f2b84b]/35 bg-[#f2b84b]/[0.08] px-4 text-xs font-semibold text-[#f4cd7d] transition hover:bg-[#f2b84b]/[0.13] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isClosing ? (
              <LoaderCircle
                aria-hidden="true"
                size={13}
                className="animate-spin"
              />
            ) : (
              <Unplug aria-hidden="true" size={13} />
            )}
            {isClosing ? "Closing" : "Close hedge"}
          </button>
        ) : null}
      </div>
      {liqWarning ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-[#df6b6b]/30 bg-[#df6b6b]/[0.07] px-3 py-2 text-xs leading-4 text-[#f0a3a3]">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0"
            size={13}
          />
          <span>{liqWarning}</span>
        </div>
      ) : null}
      {position ? (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <HedgeMetric
            label="Entry"
            value={`$${displayPrice(String(position.entryPx))}`}
          />
          <HedgeMetric
            label="Mark"
            value={`$${displayPrice(String(position.markPx))}`}
          />
          <HedgeMetric
            label="Size"
            value={`${displayPrice(String(position.size))} ${position.coin}`}
          />
          <HedgeMetric
            label="Unrealized PnL"
            value={`${
              pnl !== null && pnl < 0 ? "−" : "+"
            }$${displayPrice(String(Math.abs(pnl ?? 0)))}`}
          />
          <HedgeMetric
            label="Leverage"
            value={`${position.leverage}x ${position.marginMode}`}
          />
          <HedgeMetric
            label="Liquidation"
            value={
              position.liquidationPx !== null
                ? `$${displayPrice(String(position.liquidationPx))}`
                : "--"
            }
          />
          <HedgeMetric
            label="Notional"
            value={`$${displayPrice(String(position.notional))}`}
          />
          <HedgeMetric
            label="Status"
            value={position.size > 0 ? "Open" : "Flat"}
          />
        </div>
      ) : positionError ? (
        <p className="mt-3 text-xs text-[#df6b6b]">{positionError}</p>
      ) : (
        <p className="mt-3 text-xs leading-4 text-[#68737d]">
          No open {market} hedge right now.
        </p>
      )}
    </div>
  );
}
