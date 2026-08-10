import { isAddress } from "viem";
import { NextResponse } from "next/server";
import {
  isAutoHedgeRule,
  type AutoHedgeRule,
} from "@/lib/autoHedge";
import {
  readBearerToken,
  verifyAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import {
  compareAndSetSharedAutoHedgeRule,
  hasSharedAutoHedgeStore,
  loadSharedAutoHedgeRule,
} from "@/lib/autoHedgeSharedStore";
import { isSupportedChainId } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const wallet = url.searchParams.get("wallet");
    const chainId = Number(url.searchParams.get("chainId"));
    if (!wallet || !isAddress(wallet) || !isSupportedChainId(chainId)) {
      return NextResponse.json(
        { error: "Invalid wallet or chain." },
        { status: 400 },
      );
    }
    if (!hasSharedAutoHedgeStore()) {
      return NextResponse.json({ rule: null, shared: false });
    }
    const rule = await loadSharedAutoHedgeRule(wallet, chainId);
    return NextResponse.json({ rule, shared: true });
  } catch (error) {
    console.error("Auto-Hedge state read failed", error);
    return NextResponse.json(
      { error: "Shared Auto-Hedge state could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    if (!hasSharedAutoHedgeStore()) {
      return NextResponse.json(
        { error: "Shared Auto-Hedge storage is not configured." },
        { status: 503 },
      );
    }
    const session = verifyAutoHedgeSession(readBearerToken(request));
    const body = (await request.json()) as {
      expectedUpdatedAt?: number | null;
      rule?: AutoHedgeRule;
    };
    if (
      !isAutoHedgeRule(body.rule, session.wallet, session.chainId) ||
      (body.expectedUpdatedAt !== null &&
        body.expectedUpdatedAt !== undefined &&
        typeof body.expectedUpdatedAt !== "number")
    ) {
      return NextResponse.json(
        { error: "Invalid Auto-Hedge state update." },
        { status: 400 },
      );
    }
    const result = await compareAndSetSharedAutoHedgeRule(
      body.rule,
      body.expectedUpdatedAt ?? null,
    );
    return NextResponse.json(result, {
      status: result.applied ? 200 : 409,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto-Hedge update failed.";
    const status =
      message.includes("token") || message.includes("bearer") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
