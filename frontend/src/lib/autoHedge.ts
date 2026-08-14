import { isAddress, type Address } from "viem";
import type { FtsoXrpPrice } from "@/lib/ftso";
import {
  coston2,
  flare,
  getSupportedChain,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";

export type AutoHedgeStatus = "off" | "armed" | "triggered" | "error";
export type AutoHedgeTriggerType = "absolute" | "percent-drop";
export type AutoHedgeTriggerMode = "single" | "trailing" | "ladder";
export type AutoHedgeMarginMode = "cross" | "isolated";
export type HedgeExecutionStatus = "pending" | "success" | "failed";

// One step of a protection ladder: hedge `sizePercent`% of the position once
// the price drops `threshold`% below the reference price.
export type AutoHedgeTranche = {
  threshold: string;
  sizePercent: number;
};
export type HedgeVenue =
  | "flamix"
  | "hyperliquid"
  | "ripplefi-intent-log"
  | "sparkdex-eternal";

export type HedgeExecutionEvent = {
  adapter: string | null;
  adapterMode: "record" | "live" | null;
  completedAt: number | null;
  direction: "short" | "buy" | null;
  error: string | null;
  executionId: string | null;
  externalOrderId: string | null;
  market: string | null;
  message: string;
  network: string | null;
  orderType: string | null;
  requestedAt: number;
  size: string | null;
  status: HedgeExecutionStatus;
  venue: string | null;
};

export type AutoHedgeRule = {
  // Optional email that receives alert notifications (hedge opened/closed,
  // liquidation warning). Empty string = alerts off.
  alertEmail?: string;
  // Auto-close: buy the hedge back when XRP recovers to within
  // `autoClosePercent`% of the reference price (0 = off).
  autoClosePercent?: number;
  chainId: SupportedChainId;
  createdAt: number;
  enabled: boolean;
  error: string | null;
  // True once the protective short is open (set on successful execution,
  // cleared when the hedge is closed).
  hedgeOpen?: boolean;
  hedgeAmountFxrp: string;
  hedgeSizePercent: number;
  id: string;
  lastExecution: HedgeExecutionEvent | null;
  lastIntent: HedgeIntent | null;
  lastObservedPriceUsd: string;
  // Perpetual leverage applied on Hyperliquid before opening the short.
  leverage?: number;
  marginMode?: AutoHedgeMarginMode;
  // Index of the next ladder tranche to evaluate (starts at 0).
  nextTrancheIndex?: number;
  owner: Address;
  positionFxrp: string;
  // Re-arm the rule automatically after the hedge is closed.
  rearm?: boolean;
  referencePriceUsd: string;
  status: AutoHedgeStatus;
  threshold: string;
  // Highest XRP price observed since arming (trailing-stop reference).
  trailingHighUsd?: string | null;
  // Distance (percent) the price must fall from its high to trigger.
  trailingStopPercent?: number;
  tranches?: AutoHedgeTranche[];
  triggerMode?: AutoHedgeTriggerMode;
  triggerType: AutoHedgeTriggerType;
  triggeredAt: number | null;
  updatedAt: number;
  version: 1;
};

export type HedgeIntent = {
  asset: "FXRP";
  chain: {
    id: SupportedChainId;
    name: string;
  };
  direction: "short";
  execution: {
    instrument: "perpetual";
    market: string;
    maxSlippageBps: number;
    orderType: "market";
    preferredVenue: HedgeVenue;
    reduceOnly: false;
    side: "sell";
    timeInForce: "ioc";
  };
  hedgeSizePercent: number;
  id: string;
  // Perpetual leverage requested on the venue (1-50).
  leverage?: number;
  marginMode?: AutoHedgeMarginMode;
  positionFxrpAmount: string;
  priceSource: {
    feedId: string;
    ftsoAddress: Address;
    observedAt: number;
    source: "Flare FTSO v2";
  };
  protectedFxrpAmount: string;
  protectedXrpAmount: string;
  status: HedgeExecutionStatus;
  timestamp: number;
  // Which ladder tranche produced this intent (null for single/trailing).
  trancheIndex?: number | null;
  trigger: {
    observedPriceUsd: string;
    referencePriceUsd: string;
    threshold: string;
    triggerPriceUsd: string;
    triggerType: AutoHedgeTriggerType;
  };
  version: 2;
  wallet: Address;
};

function configuredExecutionTarget(chainId: SupportedChainId) {
  const mainnet = chainId === flare.id;
  const market = (
    mainnet
      ? process.env.NEXT_PUBLIC_AUTO_HEDGE_MAINNET_MARKET
      : process.env.NEXT_PUBLIC_AUTO_HEDGE_TESTNET_MARKET
  )
    ?.trim()
    .toUpperCase();
  const venue = (
    mainnet
      ? process.env.NEXT_PUBLIC_AUTO_HEDGE_MAINNET_VENUE
      : process.env.NEXT_PUBLIC_AUTO_HEDGE_TESTNET_VENUE
  )?.trim();
  const allowedVenues: HedgeVenue[] = [
    "flamix",
    "hyperliquid",
    "ripplefi-intent-log",
    "sparkdex-eternal",
  ];

  return {
    market: market || (chainId === coston2.id ? "BTC" : "XRP"),
    venue: allowedVenues.includes(venue as HedgeVenue)
      ? (venue as HedgeVenue)
      : "hyperliquid",
  };
}

export function getConfiguredExecutionTarget(chainId: SupportedChainId) {
  return configuredExecutionTarget(chainId);
}

// A rule with every optional field filled in with its default, so callers can
// read leverage/marginMode/triggerMode/etc. without null checks. Old stored
// rules (v1) lack these fields; the defaults keep them fully functional.
export type NormalizedAutoHedgeRule = AutoHedgeRule & {
  alertEmail: string;
  autoClosePercent: number;
  hedgeOpen: boolean;
  leverage: number;
  marginMode: AutoHedgeMarginMode;
  nextTrancheIndex: number;
  rearm: boolean;
  trailingHighUsd: string;
  trailingStopPercent: number;
  tranches: AutoHedgeTranche[];
  triggerMode: AutoHedgeTriggerMode;
};

export function normalizeAutoHedgeRule(
  rule: AutoHedgeRule,
): NormalizedAutoHedgeRule {
  return {
    ...rule,
    alertEmail: rule.alertEmail?.trim() ?? "",
    autoClosePercent: rule.autoClosePercent ?? 0,
    hedgeOpen: rule.hedgeOpen ?? false,
    leverage: rule.leverage ?? 1,
    marginMode: rule.marginMode ?? "cross",
    nextTrancheIndex: rule.nextTrancheIndex ?? 0,
    rearm: rule.rearm ?? false,
    trailingHighUsd: rule.trailingHighUsd ?? rule.referencePriceUsd,
    trailingStopPercent: rule.trailingStopPercent ?? 0,
    tranches: rule.tranches ?? [],
    triggerMode: rule.triggerMode ?? "single",
  };
}

export function isAutoHedgeRule(
  value: unknown,
  expectedOwner?: string,
  expectedChainId?: number,
): value is AutoHedgeRule {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rule = value as Partial<AutoHedgeRule>;
  const lastIntent = rule.lastIntent as Partial<HedgeIntent> | null | undefined;
  return (
    rule.version === 1 &&
    isSupportedChainId(rule.chainId) &&
    (expectedChainId === undefined || rule.chainId === expectedChainId) &&
    typeof rule.owner === "string" &&
    isAddress(rule.owner) &&
    (expectedOwner === undefined ||
      rule.owner.toLowerCase() === expectedOwner.toLowerCase()) &&
    typeof rule.id === "string" &&
    rule.id.length > 0 &&
    typeof rule.createdAt === "number" &&
    typeof rule.updatedAt === "number" &&
    typeof rule.enabled === "boolean" &&
    typeof rule.threshold === "string" &&
    typeof rule.referencePriceUsd === "string" &&
    typeof rule.lastObservedPriceUsd === "string" &&
    typeof rule.positionFxrp === "string" &&
    typeof rule.hedgeAmountFxrp === "string" &&
    typeof rule.hedgeSizePercent === "number" &&
    (rule.triggerType === "absolute" ||
      rule.triggerType === "percent-drop") &&
    (rule.status === "off" ||
      rule.status === "armed" ||
      rule.status === "triggered" ||
      rule.status === "error") &&
    (rule.lastExecution === null ||
      (typeof rule.lastExecution === "object" &&
        (rule.lastExecution.status === "pending" ||
          rule.lastExecution.status === "success" ||
          rule.lastExecution.status === "failed"))) &&
    (rule.lastIntent === null ||
      (lastIntent?.version === 2 &&
        typeof lastIntent.wallet === "string" &&
        isAddress(lastIntent.wallet) &&
        lastIntent.wallet.toLowerCase() === rule.owner.toLowerCase() &&
        typeof lastIntent.chain === "object" &&
        lastIntent.chain?.id === rule.chainId))
  );
}

function positiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function getTriggerPriceUsd(rule: Pick<
  AutoHedgeRule,
  "referencePriceUsd" | "threshold" | "triggerType"
>) {
  const threshold = positiveNumber(rule.threshold);
  if (threshold === null) {
    return null;
  }
  if (rule.triggerType === "absolute") {
    return threshold;
  }

  const referencePrice = positiveNumber(rule.referencePriceUsd);
  if (referencePrice === null || threshold >= 100) {
    return null;
  }
  return referencePrice * (1 - threshold / 100);
}

export function evaluateHedgeTrigger(
  rule: Pick<
    AutoHedgeRule,
    "lastObservedPriceUsd" | "referencePriceUsd" | "threshold" | "triggerType"
  >,
  currentPriceUsd: string,
) {
  const currentPrice = positiveNumber(currentPriceUsd);
  const previousPrice = positiveNumber(rule.lastObservedPriceUsd);
  const triggerPrice = getTriggerPriceUsd(rule);
  if (
    currentPrice === null ||
    previousPrice === null ||
    triggerPrice === null
  ) {
    return { crossed: false, triggerPriceUsd: triggerPrice };
  }

  return {
    crossed: previousPrice > triggerPrice && currentPrice <= triggerPrice,
    triggerPriceUsd: triggerPrice,
  };
}

export function getTrancheTriggerPriceUsd(
  rule: Pick<AutoHedgeRule, "referencePriceUsd">,
  tranche: AutoHedgeTranche,
) {
  const referencePrice = positiveNumber(rule.referencePriceUsd);
  const threshold = positiveNumber(tranche.threshold);
  if (referencePrice === null || threshold === null || threshold >= 100) {
    return null;
  }
  return referencePrice * (1 - threshold / 100);
}

// Trailing stop: trigger once the price falls `trailingStopPercent`% below the
// highest price observed since the rule armed. A new high resets the stop.
export function evaluateTrailingTrigger(
  rule: Pick<
    AutoHedgeRule,
    "referencePriceUsd" | "trailingHighUsd" | "trailingStopPercent"
  >,
  currentPriceUsd: string,
) {
  const currentPrice = positiveNumber(currentPriceUsd);
  const distancePercent = rule.trailingStopPercent ?? 0;
  if (currentPrice === null || distancePercent <= 0) {
    return { crossed: false, newHigh: null, triggerPriceUsd: null };
  }
  const previousHigh = positiveNumber(
    rule.trailingHighUsd ?? rule.referencePriceUsd,
  );
  if (previousHigh === null) {
    return { crossed: false, newHigh: currentPrice, triggerPriceUsd: null };
  }
  const newHigh = Math.max(previousHigh, currentPrice);
  const triggerPriceUsd = newHigh * (1 - distancePercent / 100);
  // A fresh high never triggers on the same observation; the stop rides up.
  if (newHigh > previousHigh) {
    return { crossed: false, newHigh, triggerPriceUsd };
  }
  return {
    crossed: currentPrice <= triggerPriceUsd,
    newHigh,
    triggerPriceUsd,
  };
}

// Ladder: return the index of the next un-executed tranche whose threshold is
// breached (thresholds ascend, so the shallowest un-executed breach wins).
export function evaluateLadderTrigger(
  rule: Pick<
    AutoHedgeRule,
    "nextTrancheIndex" | "referencePriceUsd" | "tranches"
  >,
  currentPriceUsd: string,
) {
  const currentPrice = positiveNumber(currentPriceUsd);
  const tranches = rule.tranches ?? [];
  const start = Math.min(
    Math.max(rule.nextTrancheIndex ?? 0, 0),
    tranches.length,
  );
  if (currentPrice === null || start >= tranches.length) {
    return { trancheIndex: -1, triggerPriceUsd: null };
  }
  for (let index = start; index < tranches.length; index += 1) {
    const triggerPriceUsd = getTrancheTriggerPriceUsd(rule, tranches[index]);
    if (
      triggerPriceUsd !== null &&
      currentPrice <= triggerPriceUsd
    ) {
      return { trancheIndex: index, triggerPriceUsd };
    }
  }
  return { trancheIndex: -1, triggerPriceUsd: null };
}

export function createHedgeIntent({
  hedgeAmountFxrp,
  price,
  rule,
  triggerPriceUsd,
  hedgeSizePercent = rule.hedgeSizePercent,
  leverage,
  marginMode,
  threshold = rule.threshold,
  trancheIndex = null,
}: {
  hedgeAmountFxrp: string;
  price: FtsoXrpPrice;
  rule: AutoHedgeRule;
  triggerPriceUsd: number;
  hedgeSizePercent?: number;
  leverage?: number;
  marginMode?: AutoHedgeMarginMode;
  threshold?: string;
  trancheIndex?: number | null;
}): HedgeIntent {
  const timestamp = Date.now();
  const chain = getSupportedChain(rule.chainId);
  const executionTarget = configuredExecutionTarget(rule.chainId);
  return {
    asset: "FXRP",
    chain: {
      id: rule.chainId,
      name: chain.name,
    },
    direction: "short",
    execution: {
      instrument: "perpetual",
      market: executionTarget.market,
      maxSlippageBps: 100,
      orderType: "market",
      preferredVenue: executionTarget.venue,
      reduceOnly: false,
      side: "sell",
      timeInForce: "ioc",
    },
    hedgeSizePercent,
    id: `${rule.id}:${timestamp}`,
    leverage,
    marginMode,
    positionFxrpAmount: rule.positionFxrp,
    priceSource: {
      feedId: price.feedId,
      ftsoAddress: price.ftsoAddress,
      observedAt: price.timestamp,
      source: price.source,
    },
    protectedFxrpAmount: hedgeAmountFxrp,
    protectedXrpAmount: hedgeAmountFxrp,
    status: "pending",
    timestamp,
    trancheIndex,
    trigger: {
      observedPriceUsd: price.priceUsd,
      referencePriceUsd: rule.referencePriceUsd,
      threshold,
      triggerPriceUsd: triggerPriceUsd.toString(),
      triggerType: rule.triggerType,
    },
    version: 2,
    wallet: rule.owner,
  };
}

export function createPendingExecution(
  intent: HedgeIntent,
): HedgeExecutionEvent {
  return {
    adapter: null,
    adapterMode: null,
    completedAt: null,
    direction: intent.direction,
    error: null,
    executionId: null,
    externalOrderId: null,
    market: intent.execution.market,
    message: "Execution request submitted.",
    network: null,
    orderType: intent.execution.orderType,
    requestedAt: intent.timestamp,
    size: intent.protectedXrpAmount,
    status: "pending",
    venue: intent.execution.preferredVenue,
  };
}
