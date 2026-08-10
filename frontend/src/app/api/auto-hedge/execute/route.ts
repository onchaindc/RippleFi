import { isAddress } from "viem";
import { NextResponse } from "next/server";
import type {
  AutoHedgeRule,
  HedgeExecutionEvent,
  HedgeIntent,
} from "@/lib/autoHedge";
import {
  readBearerToken,
  verifyAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import {
  compareAndSetSharedAutoHedgeRule,
  hasSharedAutoHedgeStore,
  loadSharedAutoHedgeRule,
  loadHyperliquidLink,
} from "@/lib/autoHedgeSharedStore";
import {
  createFailedExecution,
  getHedgeExecutionAdapter,
} from "@/lib/hedgeExecution";
import { isSupportedChainId } from "@/lib/networks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isPositiveDecimal(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function isHedgeIntent(value: unknown): value is HedgeIntent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const intent = value as Partial<HedgeIntent>;
  return (
    intent.version === 2 &&
    intent.asset === "FXRP" &&
    intent.direction === "short" &&
    intent.status === "pending" &&
    Boolean(intent.chain) &&
    isSupportedChainId(intent.chain?.id) &&
    typeof intent.chain?.name === "string" &&
    typeof intent.id === "string" &&
    intent.id.length >= 12 &&
    typeof intent.wallet === "string" &&
    isAddress(intent.wallet) &&
    typeof intent.hedgeSizePercent === "number" &&
    intent.hedgeSizePercent > 0 &&
    intent.hedgeSizePercent <= 100 &&
    isPositiveDecimal(intent.positionFxrpAmount) &&
    isPositiveDecimal(intent.protectedFxrpAmount) &&
    isPositiveDecimal(intent.protectedXrpAmount) &&
    typeof intent.timestamp === "number" &&
    intent.timestamp > 0 &&
    Boolean(intent.priceSource) &&
    intent.priceSource?.source === "Flare FTSO v2" &&
    Boolean(intent.trigger) &&
    isPositiveDecimal(intent.trigger?.observedPriceUsd) &&
    isPositiveDecimal(intent.trigger?.triggerPriceUsd) &&
    (intent.trigger?.triggerType === "absolute" ||
      intent.trigger?.triggerType === "percent-drop") &&
    Boolean(intent.execution) &&
    typeof intent.execution?.preferredVenue === "string" &&
    intent.execution.preferredVenue.length > 0 &&
    intent.execution?.instrument === "perpetual" &&
    typeof intent.execution?.market === "string" &&
    /^[A-Z0-9:_-]{2,32}$/.test(intent.execution.market) &&
    intent.execution?.side === "sell"
  );
}

async function loadAuthorizedRule(request: Request, intent: HedgeIntent) {
  if (!hasSharedAutoHedgeStore()) {
    return null;
  }
  const session = verifyAutoHedgeSession(readBearerToken(request));
  if (
    session.chainId !== intent.chain.id ||
    session.wallet.toLowerCase() !== intent.wallet.toLowerCase()
  ) {
    throw new Error("Auto-Hedge session does not match this intent.");
  }
  const rule = await loadSharedAutoHedgeRule(
    intent.wallet,
    intent.chain.id,
  );
  if (
    !rule ||
    rule.status !== "triggered" ||
    rule.lastIntent?.id !== intent.id
  ) {
    throw new Error(
      "The shared Auto-Hedge trigger claim is missing or stale.",
    );
  }
  return rule;
}

async function persistExecution(
  current: AutoHedgeRule | null,
  execution: HedgeExecutionEvent,
  intent: HedgeIntent,
) {
  if (!current) {
    return null;
  }
  const nextRule: AutoHedgeRule = {
    ...current,
    error: execution.error,
    lastExecution: execution,
    lastIntent: intent,
    updatedAt: Math.max(Date.now(), current.updatedAt + 1),
  };
  const result = await compareAndSetSharedAutoHedgeRule(
    nextRule,
    current.updatedAt,
  );
  return result.rule;
}

async function persistExecutionSafely(
  current: AutoHedgeRule | null,
  execution: HedgeExecutionEvent,
  intent: HedgeIntent,
) {
  try {
    return await persistExecution(current, execution, intent);
  } catch (error) {
    console.error("Auto-Hedge execution receipt persistence failed", error);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { intent?: unknown };
    if (!isHedgeIntent(body.intent)) {
      return NextResponse.json(
        { error: "The hedge intent is malformed." },
        { status: 400 },
      );
    }

    let sharedRule: AutoHedgeRule | null;
    try {
      sharedRule = await loadAuthorizedRule(request, body.intent);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Auto-Hedge execution authorization failed.",
        },
        { status: 401 },
      );
    }

    const adapter = getHedgeExecutionAdapter(body.intent);
    if (!adapter.supports(body.intent)) {
      console.error("Auto-Hedge adapter rejected intent", {
        adapter: adapter.id,
        chainId: body.intent.chain.id,
        direction: body.intent.direction,
        market: body.intent.execution.market,
        venue: body.intent.execution.preferredVenue,
      });
      return NextResponse.json(
        {
          error:
            "The selected protection venue does not support this market on the current network.",
        },
        { status: 422 },
      );
    }
    let hyperliquidLink;
    if (adapter.venue === "hyperliquid") {
      const link = await loadHyperliquidLink(
        body.intent.wallet,
        body.intent.chain.id,
      );
      if (!link) {
        return NextResponse.json(
          {
            error:
              "Enable Hyperliquid protection before arming live protection.",
          },
          { status: 403 },
        );
      }
      if (link.status !== "authorized" || link.authorizedAt === null) {
        return NextResponse.json(
          {
            error:
              "Hyperliquid protection is awaiting approval. Open Auto-Hedge and approve protection in your wallet.",
          },
          { status: 403 },
        );
      }
      if (link.wallet.toLowerCase() !== body.intent.wallet.toLowerCase()) {
        return NextResponse.json(
          {
            error:
              "This Hyperliquid approval belongs to a different wallet. Reconnect the wallet that approved protection.",
          },
          { status: 403 },
        );
      }
      hyperliquidLink = link;
    }
    const context = {
      hyperliquidLink,
      idempotencyKey: body.intent.id,
      requestedAt: Date.now(),
    };

    let order;
    let execution: HedgeExecutionEvent;
    let intent: HedgeIntent;
    let responseStatus = 200;
    try {
      order = await adapter.createOrder(body.intent, context);
      execution = await adapter.execute(order, body.intent, context);
      intent = { ...body.intent, status: execution.status };
    } catch (error) {
      console.error("Auto-Hedge execution request failed", {
        adapter: adapter.id,
        error,
        market: body.intent.execution.market,
        network: body.intent.chain.id,
      });
      execution = createFailedExecution(
        adapter,
        context,
        error,
        order,
        body.intent,
      );
      intent = { ...body.intent, status: "failed" };
      responseStatus = 502;
    }
    const rule = await persistExecutionSafely(
      sharedRule,
      execution,
      intent,
    );
    return NextResponse.json(
      {
        ...(execution.error ? { error: execution.error } : {}),
        execution,
        intent,
        rule,
      },
      { status: responseStatus },
    );
  } catch (error) {
    console.error("Auto-Hedge execution failed", error);
    return NextResponse.json(
      { error: "The hedge intent could not be submitted." },
      { status: 500 },
    );
  }
}
