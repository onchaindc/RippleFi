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
export type HedgeExecutionStatus = "pending" | "success" | "failed";
export type HedgeVenue =
  | "flamix"
  | "hyperliquid"
  | "ripplefi-intent-log"
  | "sparkdex-eternal";

export type HedgeExecutionEvent = {
  adapter: string | null;
  adapterMode: "record" | "live" | null;
  completedAt: number | null;
  direction: "short" | null;
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
  chainId: SupportedChainId;
  createdAt: number;
  enabled: boolean;
  error: string | null;
  hedgeAmountFxrp: string;
  hedgeSizePercent: number;
  id: string;
  lastExecution: HedgeExecutionEvent | null;
  lastIntent: HedgeIntent | null;
  lastObservedPriceUsd: string;
  owner: Address;
  positionFxrp: string;
  referencePriceUsd: string;
  status: AutoHedgeStatus;
  threshold: string;
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

export function createHedgeIntent({
  hedgeAmountFxrp,
  price,
  rule,
  triggerPriceUsd,
}: {
  hedgeAmountFxrp: string;
  price: FtsoXrpPrice;
  rule: AutoHedgeRule;
  triggerPriceUsd: number;
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
    hedgeSizePercent: rule.hedgeSizePercent,
    id: `${rule.id}:${timestamp}`,
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
    trigger: {
      observedPriceUsd: price.priceUsd,
      referencePriceUsd: rule.referencePriceUsd,
      threshold: rule.threshold,
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
