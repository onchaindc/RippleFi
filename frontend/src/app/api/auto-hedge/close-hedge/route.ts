import { NextResponse } from "next/server";
import { sendAlertEmail } from "@/lib/alertEmail";
import type {
  AutoHedgeRule,
  HedgeExecutionEvent,
} from "@/lib/autoHedge";
import { getConfiguredExecutionTarget } from "@/lib/autoHedge";
import {
  readBearerToken,
  verifyAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import {
  compareAndSetSharedAutoHedgeRule,
  hasSharedAutoHedgeStore,
  loadHyperliquidLink,
  loadSharedAutoHedgeRule,
} from "@/lib/autoHedgeSharedStore";
import {
  closeHyperliquidPosition,
  getTestnetMarket,
} from "@/lib/hyperliquidExecution";
import { coston2 } from "@/lib/networks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idempotencyKey?: unknown };
    if (
      typeof body.idempotencyKey !== "string" ||
      body.idempotencyKey.length < 12
    ) {
      return NextResponse.json(
        { error: "The close request is malformed." },
        { status: 400 },
      );
    }
    if (!hasSharedAutoHedgeStore()) {
      return NextResponse.json(
        { error: "Auto-Hedge storage is not configured." },
        { status: 503 },
      );
    }

    let session;
    try {
      session = verifyAutoHedgeSession(readBearerToken(request));
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Auto-Hedge session is invalid.",
        },
        { status: 401 },
      );
    }

    const rule = await loadSharedAutoHedgeRule(
      session.wallet,
      session.chainId,
    );
    if (!rule) {
      return NextResponse.json(
        { error: "No protection rule is active for this wallet." },
        { status: 404 },
      );
    }
    const link = await loadHyperliquidLink(session.wallet, session.chainId);
    if (!link || link.status !== "authorized" || link.authorizedAt === null) {
      return NextResponse.json(
        {
          error:
            "Hyperliquid protection is awaiting approval. Open Auto-Hedge and approve protection in your wallet.",
        },
        { status: 403 },
      );
    }
    if (link.wallet.toLowerCase() !== session.wallet.toLowerCase()) {
      return NextResponse.json(
        {
          error:
            "This Hyperliquid approval belongs to a different wallet. Reconnect the wallet that approved protection.",
        },
        { status: 403 },
      );
    }

    const target = getConfiguredExecutionTarget(session.chainId);
    const market =
      session.chainId === coston2.id
        ? getTestnetMarket(target.market)
        : target.market;

    let result;
    try {
      result = await closeHyperliquidPosition({
        idempotencyKey: body.idempotencyKey,
        link,
        market,
      });
    } catch (error) {
      console.error("Auto-Hedge close request failed", {
        error,
        market,
        network: session.chainId,
        wallet: session.wallet,
      });
      const message =
        error instanceof Error ? error.message : "Close request failed.";
      const failedRule: AutoHedgeRule = {
        ...rule,
        error: message,
        updatedAt: Math.max(Date.now(), rule.updatedAt + 1),
      };
      await compareAndSetSharedAutoHedgeRule(
        failedRule,
        rule.updatedAt,
      );
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (result.status === "success") {
      const email = rule.alertEmail?.trim();
      if (email) {
        // Alerts are best-effort: never block the close response.
        void sendAlertEmail({
          subject: "RippleFI: hedge closed",
          text: [
            `Your Auto-Hedge short on ${result.market} was closed on Hyperliquid.`,
            result.message,
            "",
            "Open RippleFI to review the result or arm protection again.",
          ].join("\n"),
          to: email,
        });
      }
    }

    const now = Date.now();
    const closeEvent: HedgeExecutionEvent = {
      adapter: "hyperliquid-close-v1",
      adapterMode: "live",
      completedAt: result.status === "success" ? now : null,
      direction: "buy",
      error: null,
      executionId: crypto.randomUUID(),
      externalOrderId: result.externalOrderId,
      market: result.market,
      message: result.message,
      network: result.network,
      orderType: "market",
      requestedAt: now,
      size: result.filledSize ?? null,
      status: result.status,
      venue: "hyperliquid",
    };
    const nextRule: AutoHedgeRule = {
      ...rule,
      enabled: false,
      error: null,
      hedgeOpen: false,
      lastExecution: closeEvent,
      status: "off",
      updatedAt: Math.max(now, rule.updatedAt + 1),
    };
    const persisted = await compareAndSetSharedAutoHedgeRule(
      nextRule,
      rule.updatedAt,
    );
    return NextResponse.json({
      execution: closeEvent,
      rule: persisted.rule,
    });
  } catch (error) {
    console.error("Auto-Hedge close failed", error);
    return NextResponse.json(
      { error: "The hedge could not be closed right now." },
      { status: 500 },
    );
  }
}
