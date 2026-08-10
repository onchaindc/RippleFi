import "server-only";

import { isAddress } from "viem";
import type { HedgeExecutionEvent, HedgeIntent } from "@/lib/autoHedge";
import { coston2, flare } from "@/lib/networks";
import type {
  HedgeExecutionAdapter,
  HedgeExecutionContext,
  HedgeExecutionOrder,
} from "@/lib/hedgeExecution";
import type { HyperliquidLink } from "@/lib/hyperliquidLink";

type HyperliquidNetwork = "mainnet" | "testnet";

type HyperliquidConfig = {
  accountAddress: string;
  apiWalletAddress: string;
  network: HyperliquidNetwork;
  ripplefiWallet: string;
  signerAuthToken: string;
  signerUrl: string;
};

type HyperliquidSignerResponse = {
  averagePrice: string | null;
  cached: boolean;
  externalOrderId: string | null;
  filledSize: string | null;
  idempotencyKey: string;
  market: string;
  message: string;
  network: HyperliquidNetwork;
  status: "pending" | "success";
};

type SignerErrorBody = {
  code?: string;
  detail?: string | SignerErrorBody;
  error?: string;
  message?: string;
  venueError?: SignerErrorBody;
};

function getTestnetMarkets() {
  const markets = new Set(
    (process.env.AUTO_HEDGE_TESTNET_MARKETS || "BTC,ETH,SOL")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
  const configuredMarket = process.env.HYPERLIQUID_TESTNET_MARKET
    ?.trim()
    .toUpperCase();
  if (configuredMarket) {
    markets.add(configuredMarket);
  }
  return markets;
}

function getTestnetMarket(intentMarket: string) {
  return (
    process.env.HYPERLIQUID_TESTNET_MARKET?.trim().toUpperCase() ||
    intentMarket.toUpperCase() ||
    "BTC"
  );
}

function supportsHyperliquidTarget(intent: HedgeIntent) {
  if (intent.execution.preferredVenue !== "hyperliquid") {
    return false;
  }
  if (intent.chain.id === flare.id) {
    return intent.execution.market.toUpperCase() === "XRP";
  }
  if (intent.chain.id === coston2.id) {
    return getTestnetMarkets().has(
      getTestnetMarket(intent.execution.market),
    );
  }
  return false;
}

function requiredServiceEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      "Hyperliquid execution infrastructure is temporarily unavailable.",
    );
  }
  return value;
}

function getHyperliquidConfig(
  network: HyperliquidNetwork,
  link: HyperliquidLink | undefined,
): HyperliquidConfig {
  if (
    network === "mainnet" &&
    process.env.HYPERLIQUID_ALLOW_MAINNET !== "true"
  ) {
    throw new Error(
      "Hyperliquid mainnet execution is locked. Use testnet, or explicitly set HYPERLIQUID_ALLOW_MAINNET=true after production review.",
    );
  }

  if (!link || link.status !== "authorized") {
    throw new Error(
      "Connect and authorize your Hyperliquid account before enabling live protection.",
    );
  }
  if (link.network !== network) {
    throw new Error(
      "The connected Hyperliquid account belongs to a different network.",
    );
  }
  const signerUrl = (
    network === "mainnet"
      ? requiredServiceEnv("HYPERLIQUID_MAINNET_SIGNER_URL")
      : process.env.HYPERLIQUID_TESTNET_SIGNER_URL?.trim() ||
        requiredServiceEnv("HYPERLIQUID_SIGNER_URL")
  ).replace(/\/+$/, "");
  if (
    process.env.NODE_ENV === "production" &&
    !signerUrl.startsWith("https://")
  ) {
    throw new Error("HYPERLIQUID_SIGNER_URL must use HTTPS in production.");
  }

  const accountAddress = link.masterAccount;
  const apiWalletAddress = link.apiWalletAddress;
  if (!isAddress(accountAddress) || !isAddress(apiWalletAddress)) {
    throw new Error(
      "The linked Hyperliquid account details are invalid.",
    );
  }

  return {
    accountAddress,
    apiWalletAddress,
    network,
    ripplefiWallet: link.wallet,
    signerAuthToken:
      network === "mainnet"
        ? requiredServiceEnv("HYPERLIQUID_MAINNET_SIGNER_AUTH_TOKEN")
        : process.env.HYPERLIQUID_TESTNET_SIGNER_AUTH_TOKEN?.trim() ||
          requiredServiceEnv("HYPERLIQUID_SIGNER_AUTH_TOKEN"),
    signerUrl,
  };
}

async function executeWithSigner(
  order: HedgeExecutionOrder,
  config: HyperliquidConfig,
) {
  const endpoint = config.signerUrl.endsWith("/v1/orders/short")
    ? config.signerUrl
    : `${config.signerUrl}/v1/orders/short`;
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      accountAddress: config.accountAddress,
      apiWalletAddress: config.apiWalletAddress,
      direction: order.direction,
      idempotencyKey: order.idempotencyKey,
      market: order.market,
      network: config.network,
      ripplefiWallet: config.ripplefiWallet,
      orderType: order.orderType,
      semantics: order.semantics,
      size: order.size,
      venue: order.venue,
      venueMarket: order.venueMarket,
    }),
    headers: {
      Authorization: `Bearer ${config.signerAuthToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: AbortSignal.timeout(50_000),
  });
  const rawBody = await response.text();
  const body = (() => {
    try {
      return JSON.parse(rawBody) as HyperliquidSignerResponse | SignerErrorBody;
    } catch {
      return null;
    }
  })();
  if (!response.ok) {
    console.error("Hyperliquid signer rejected order request", {
      body,
      market: order.market,
      network: config.network,
      status: response.status,
      venue: order.venue,
    });
    throw new Error(formatSignerError(body, rawBody, response.status));
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("status" in body) ||
    (body.status !== "pending" && body.status !== "success") ||
    !("idempotencyKey" in body) ||
    body.idempotencyKey !== order.idempotencyKey ||
    !("market" in body) ||
    body.market !== order.venueMarket ||
    !("network" in body) ||
    body.network !== config.network
  ) {
    console.error("Hyperliquid signer returned invalid receipt", {
      body,
      expectedIdempotencyKey: order.idempotencyKey,
      expectedMarket: order.venueMarket,
      expectedNetwork: config.network,
    });
    throw new Error("The Hyperliquid signer returned an invalid receipt.");
  }
  return body;
}

function formatSignerError(
  body: HyperliquidSignerResponse | SignerErrorBody | null,
  rawBody: string,
  status: number,
) {
  const errorBody = body as SignerErrorBody | null;
  const detail =
    errorBody && typeof errorBody.detail === "object"
      ? errorBody.detail
      : errorBody;
  const venueError =
    detail && typeof detail.venueError === "object"
      ? detail.venueError
      : null;
  const message =
    venueError?.message ||
    detail?.message ||
    (typeof errorBody?.detail === "string" ? errorBody.detail : null) ||
    errorBody?.error;
  const code = detail?.code || venueError?.code;

  if (message) {
    return code ? `${code}: ${message}` : message;
  }
  if (rawBody.trim()) {
    return `Signer request failed (${status}): ${rawBody.trim()}`;
  }
  return `Signer request failed with status ${status}.`;
}

function normalizeSignerReceipt(
  response: HyperliquidSignerResponse,
  order: HedgeExecutionOrder,
  requestedAt: number,
  adapter: string,
): HedgeExecutionEvent {
  return {
    adapter,
    adapterMode: "live",
    completedAt: response.status === "success" ? Date.now() : null,
    direction: order.direction,
    error: null,
    executionId: crypto.randomUUID(),
    externalOrderId: response.externalOrderId,
    market: order.market,
    message: response.cached
      ? `${response.message} Cached idempotent receipt.`
      : response.message,
    network: order.network,
    orderType: order.orderType,
    requestedAt,
    size: response.filledSize || order.size,
    status: response.status,
    venue: order.venue,
  };
}

abstract class HyperliquidAdapter implements HedgeExecutionAdapter {
  abstract readonly id: string;
  readonly mode = "live" as const;
  readonly venue = "hyperliquid";

  protected abstract supportsTarget(intent: HedgeIntent): boolean;

  supports(intent: HedgeIntent) {
    return (
      intent.version === 2 &&
      intent.asset === "FXRP" &&
      intent.direction === "short" &&
      intent.execution.instrument === "perpetual" &&
      intent.execution.side === "sell" &&
      intent.execution.timeInForce === "ioc" &&
      this.supportsTarget(intent)
    );
  }

  async createOrder(
    intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionOrder> {
    const expectedNetwork =
      intent.chain.id === flare.id
        ? "mainnet"
        : intent.chain.id === coston2.id
          ? "testnet"
          : null;
    if (!expectedNetwork) {
      throw new Error(
        `Hyperliquid cannot execute a hedge for ${intent.chain.name}.`,
      );
    }
    const market =
      expectedNetwork === "testnet"
        ? getTestnetMarket(intent.execution.market)
        : intent.execution.market.toUpperCase();
    const testnetMarkets = getTestnetMarkets();
    if (expectedNetwork === "mainnet" && market !== "XRP") {
      throw new Error(
        `HYPERLIQUID_MARKET_UNAVAILABLE: ${market} is not enabled on the mainnet XRP signer.`,
      );
    }
    if (expectedNetwork === "testnet" && !testnetMarkets.has(market)) {
      throw new Error(
        `HYPERLIQUID_MARKET_UNAVAILABLE: ${market} is not allowed on the testnet signer.`,
      );
    }
    const size =
      expectedNetwork === "testnet"
        ? process.env.AUTO_HEDGE_TESTNET_ORDER_SIZE?.trim() ||
          ""
        : intent.protectedXrpAmount;
    if (expectedNetwork === "testnet" && !size) {
      throw new Error("The testnet protection size is not configured.");
    }
    return {
      direction: intent.direction,
      idempotencyKey: context.idempotencyKey,
      market,
      network: expectedNetwork,
      orderType: intent.execution.orderType,
      semantics: {
        maxSlippageBps: intent.execution.maxSlippageBps,
        reduceOnly: intent.execution.reduceOnly,
        timeInForce: intent.execution.timeInForce,
        venueOrderType: "aggressive-limit",
      },
      size,
      venue: "hyperliquid",
      venueMarket: market,
    };
  }

  async execute(
    order: HedgeExecutionOrder,
    _intent: HedgeIntent,
    context: HedgeExecutionContext,
  ): Promise<HedgeExecutionEvent> {
    if (order.network !== "mainnet" && order.network !== "testnet") {
      throw new Error(`Unsupported Hyperliquid network: ${order.network}`);
    }
    const config = getHyperliquidConfig(
      order.network,
      context.hyperliquidLink,
    );
    const response = await executeWithSigner(order, config);
    return normalizeSignerReceipt(
      response,
      order,
      context.requestedAt,
      this.id,
    );
  }
}

export class HyperliquidXrpPerpAdapter extends HyperliquidAdapter {
  readonly id = "hyperliquid-xrp-perp-v1";

  protected supportsTarget(intent: HedgeIntent) {
    return supportsHyperliquidTarget(intent);
  }
}

export class HyperliquidMultiMarketAdapter extends HyperliquidAdapter {
  readonly id = "hyperliquid-multi-market-v1";

  protected supportsTarget(intent: HedgeIntent) {
    return supportsHyperliquidTarget(intent);
  }
}
