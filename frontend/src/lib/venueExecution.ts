import "server-only";

import type { HedgeExecutionEvent, HedgeIntent } from "@/lib/autoHedge";
import type {
  HedgeExecutionAdapter,
  HedgeExecutionContext,
  HedgeExecutionOrder,
} from "@/lib/hedgeExecution";
import { flare } from "@/lib/networks";

type RemoteVenue = "flamix" | "sparkdex-eternal";

type RemoteReceipt = {
  externalOrderId: string | null;
  filledSize: string | null;
  idempotencyKey: string;
  market: string;
  message: string;
  status: "pending" | "success";
  venue: RemoteVenue;
};

type VenueConfig = {
  authToken: string;
  enabled: boolean;
  markets: Set<string>;
  url: string;
};

function envPrefix(venue: RemoteVenue) {
  return venue === "sparkdex-eternal" ? "SPARKDEX_ETERNAL" : "FLAMIX";
}

function getConfig(venue: RemoteVenue): VenueConfig {
  const prefix = envPrefix(venue);
  const enabled = process.env[`${prefix}_EXECUTION_ENABLED`] === "true";
  const url = process.env[`${prefix}_EXECUTOR_URL`]?.trim().replace(/\/+$/, "") || "";
  const authToken = process.env[`${prefix}_EXECUTOR_AUTH_TOKEN`]?.trim() || "";
  const markets = new Set(
    (process.env[`${prefix}_MARKETS`] || "XRP")
      .split(",")
      .map((market) => market.trim().toUpperCase())
      .filter(Boolean),
  );
  if (!enabled) {
    throw new Error(`${prefix}_EXECUTION_DISABLED: This venue is not enabled.`);
  }
  if (!url || !authToken) {
    throw new Error(
      `${prefix}_EXECUTOR_NOT_CONFIGURED: The isolated venue executor is not configured.`,
    );
  }
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) {
    throw new Error(`${prefix}_EXECUTOR_URL must use HTTPS in production.`);
  }
  return { authToken, enabled, markets, url };
}

function formatRemoteError(rawBody: string, status: number) {
  try {
    const body = JSON.parse(rawBody) as {
      detail?: string | { message?: string; code?: string };
      error?: string;
      message?: string;
    };
    const detail = typeof body.detail === "object" ? body.detail : null;
    return (
      detail?.message ||
      (typeof body.detail === "string" ? body.detail : null) ||
      body.message ||
      body.error ||
      `Venue executor request failed with status ${status}.`
    );
  } catch {
    return `Venue executor request failed with status ${status}.`;
  }
}

abstract class RemoteVenueAdapter implements HedgeExecutionAdapter {
  abstract readonly id: string;
  readonly mode = "live" as const;
  abstract readonly venue: RemoteVenue;

  supports(intent: HedgeIntent) {
    return (
      intent.version === 2 &&
      intent.chain.id === flare.id &&
      intent.asset === "FXRP" &&
      intent.direction === "short" &&
      intent.execution.instrument === "perpetual" &&
      intent.execution.side === "sell"
    );
  }

  async createOrder(
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionOrder> {
    const config = getConfig(this.venue);
    const market = intent.execution.market.toUpperCase();
    if (!config.markets.has(market)) {
      throw new Error(
        `MARKET_UNAVAILABLE: ${market} is not enabled for ${this.venue}.`,
      );
    }
    return {
      direction: "short",
      idempotencyKey: context.idempotencyKey,
      market,
      network: "mainnet",
      orderType: "market",
      semantics: {
        maxSlippageBps: intent.execution.maxSlippageBps,
        reduceOnly: false,
        timeInForce: "ioc",
        venueOrderType: "aggressive-limit",
      },
      size: intent.protectedXrpAmount,
      venue: this.venue,
      venueMarket: market,
    };
  }

  async execute(
    order: HedgeExecutionOrder,
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionEvent> {
    const config = getConfig(this.venue);
    const response = await fetch(`${config.url}/v1/orders/short`, {
      body: JSON.stringify({
        chainId: intent.chain.id,
        direction: order.direction,
        idempotencyKey: order.idempotencyKey,
        market: order.market,
        orderType: order.orderType,
        semantics: order.semantics,
        size: order.size,
        venue: order.venue,
        wallet: intent.wallet,
      }),
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(50_000),
    });
    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(formatRemoteError(rawBody, response.status));
    }
    const receipt = JSON.parse(rawBody) as RemoteReceipt;
    if (
      receipt.idempotencyKey !== order.idempotencyKey ||
      receipt.market !== order.market ||
      receipt.venue !== this.venue ||
      (receipt.status !== "pending" && receipt.status !== "success")
    ) {
      throw new Error("The venue executor returned an invalid receipt.");
    }
    return {
      adapter: this.id,
      adapterMode: "live",
      completedAt: receipt.status === "success" ? Date.now() : null,
      direction: order.direction,
      error: null,
      executionId: crypto.randomUUID(),
      externalOrderId: receipt.externalOrderId,
      market: order.market,
      message: receipt.message,
      network: order.network,
      orderType: order.orderType,
      requestedAt: context.requestedAt,
      size: receipt.filledSize || order.size,
      status: receipt.status,
      venue: this.venue,
    };
  }
}

export class SparkdexEternalExecutionAdapter extends RemoteVenueAdapter {
  readonly id = "sparkdex-eternal-v1";
  readonly venue = "sparkdex-eternal" as const;
}

export class FlamixExecutionAdapter extends RemoteVenueAdapter {
  readonly id = "flamix-v1";
  readonly venue = "flamix" as const;
}
