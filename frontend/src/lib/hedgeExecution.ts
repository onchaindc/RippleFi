import "server-only";
import type {
  HedgeExecutionEvent,
  HedgeIntent,
} from "@/lib/autoHedge";
import {
  HyperliquidMultiMarketAdapter,
  HyperliquidXrpPerpAdapter,
} from "@/lib/hyperliquidExecution";
import {
  FlamixExecutionAdapter,
  SparkdexEternalExecutionAdapter,
} from "@/lib/venueExecution";
import { coston2, flare } from "@/lib/networks";
import type { HyperliquidLink } from "@/lib/hyperliquidLink";

export interface HedgeExecutionAdapter {
  readonly id: string;
  readonly mode: "record" | "live";
  readonly venue: string;
  createOrder(
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionOrder>;
  execute(
    order: HedgeExecutionOrder,
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionEvent>;
  supports(intent: HedgeIntent): boolean;
}

export type HedgeExecutionContext = {
  hyperliquidLink?: HyperliquidLink;
  idempotencyKey: string;
  requestedAt: number;
};

export type HedgeExecutionOrder = {
  direction: "short";
  idempotencyKey: string;
  isCross?: boolean;
  leverage?: number;
  market: string;
  network: string;
  orderType: "market";
  semantics: {
    maxSlippageBps: number;
    reduceOnly: false;
    timeInForce: "ioc";
    venueOrderType: "aggressive-limit";
  };
  size: string;
  venue: string;
  venueMarket: string | null;
};

export type HedgeExecutionAdapterDescriptor = Pick<
  HedgeExecutionAdapter,
  "id" | "mode" | "venue"
>;

const adapterFactories: Record<string, () => HedgeExecutionAdapter> = {
  "record-intent-v1": () => new RecordHedgeIntentAdapter(),
  "hyperliquid-multi-market-v1": () => new HyperliquidMultiMarketAdapter(),
  "hyperliquid-xrp-perp-v1": () => new HyperliquidXrpPerpAdapter(),
  "sparkdex-eternal-v1": () => new SparkdexEternalExecutionAdapter(),
  "flamix-v1": () => new FlamixExecutionAdapter(),
};

export function createFailedExecution(
  adapter: HedgeExecutionAdapterDescriptor,
  context: HedgeExecutionContext,
  error: unknown,
  order?: HedgeExecutionOrder,
  intent?: HedgeIntent,
): HedgeExecutionEvent {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("Auto-Hedge execution adapter failed", {
    adapter: adapter.id,
    error: errorMessage,
    market: order?.market ?? intent?.execution.market ?? null,
    network: order?.network ?? null,
    size: order?.size ?? intent?.protectedXrpAmount ?? null,
    venue: adapter.venue,
  });
  return {
    adapter: adapter.id,
    adapterMode: adapter.mode,
    completedAt: Date.now(),
    direction: order?.direction ?? intent?.direction ?? null,
    error: errorMessage,
    executionId: null,
    externalOrderId: null,
    market: order?.market ?? intent?.execution.market ?? null,
    message: "Execution adapter failed.",
    network: order?.network ?? null,
    orderType: order?.orderType ?? intent?.execution.orderType ?? null,
    requestedAt: context.requestedAt,
    size: order?.size ?? intent?.protectedXrpAmount ?? null,
    status: "failed",
    venue: adapter.venue,
  };
}

class RecordHedgeIntentAdapter implements HedgeExecutionAdapter {
  readonly id = "record-intent-v1";
  readonly mode = "record" as const;
  readonly venue = "ripplefi-intent-log";

  supports(intent: HedgeIntent) {
    return (
      intent.version === 2 &&
      intent.asset === "FXRP" &&
      intent.direction === "short"
    );
  }

  async createOrder(
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionOrder> {
    return {
      direction: intent.direction,
      idempotencyKey: context.idempotencyKey,
      market: intent.execution.market,
      network: intent.chain.name,
      orderType: intent.execution.orderType,
      semantics: {
        maxSlippageBps: intent.execution.maxSlippageBps,
        reduceOnly: intent.execution.reduceOnly,
        timeInForce: intent.execution.timeInForce,
        venueOrderType: "aggressive-limit",
      },
      size: intent.protectedXrpAmount,
      venue: this.venue,
      venueMarket: null,
    };
  }

  async execute(
    order: HedgeExecutionOrder,
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionEvent> {
    const event: HedgeExecutionEvent = {
      adapter: this.id,
      adapterMode: this.mode,
      completedAt: Date.now(),
      direction: order.direction,
      error: null,
      executionId: crypto.randomUUID(),
      externalOrderId: null,
      market: order.market,
      message: "Hedge intent recorded for execution.",
      network: order.network,
      orderType: order.orderType,
      requestedAt: context.requestedAt,
      size: order.size,
      status: "success",
      venue: this.venue,
    };

    console.info(
      JSON.stringify({
        event: "ripplefi.auto-hedge.intent-recorded",
        execution: event,
        intent,
      }),
    );

    return event;
  }
}

export function getHedgeExecutionAdapter(
  intent?: HedgeIntent,
): HedgeExecutionAdapter {
  const chainAdapterId =
    intent?.chain.id === flare.id
      ? process.env.AUTO_HEDGE_MAINNET_EXECUTION_ADAPTER?.trim()
      : intent?.chain.id === coston2.id
        ? process.env.AUTO_HEDGE_TESTNET_EXECUTION_ADAPTER?.trim()
        : undefined;
  const adapterId =
    chainAdapterId ||
    process.env.AUTO_HEDGE_EXECUTION_ADAPTER?.trim() ||
    "record-intent-v1";
  const factory = adapterFactories[adapterId];
  if (!factory) {
    throw new Error(`Unsupported Auto-Hedge execution adapter: ${adapterId}`);
  }
  return factory();
}
