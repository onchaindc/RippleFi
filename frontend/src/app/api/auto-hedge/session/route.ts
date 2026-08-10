import { isAddress, isHex, verifyMessage } from "viem";
import { NextResponse } from "next/server";
import { buildAutoHedgeAuthMessage } from "@/lib/autoHedgeAuth";
import {
  createAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import { hasSharedAutoHedgeStore } from "@/lib/autoHedgeSharedStore";
import { isSupportedChainId } from "@/lib/networks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!hasSharedAutoHedgeStore()) {
      return NextResponse.json(
        { error: "Shared Auto-Hedge storage is not configured." },
        { status: 503 },
      );
    }
    const body = (await request.json()) as {
      chainId?: unknown;
      issuedAt?: unknown;
      signature?: unknown;
      wallet?: unknown;
    };
    if (
      typeof body.wallet !== "string" ||
      !isAddress(body.wallet) ||
      typeof body.chainId !== "number" ||
      !isSupportedChainId(body.chainId) ||
      typeof body.issuedAt !== "number" ||
      Math.abs(Date.now() - body.issuedAt) > 5 * 60 * 1000 ||
      typeof body.signature !== "string" ||
      !isHex(body.signature)
    ) {
      return NextResponse.json(
        { error: "Invalid Auto-Hedge session request." },
        { status: 400 },
      );
    }
    const valid = await verifyMessage({
      address: body.wallet,
      message: buildAutoHedgeAuthMessage({
        chainId: body.chainId,
        issuedAt: body.issuedAt,
        wallet: body.wallet,
      }),
      signature: body.signature,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "Auto-Hedge authorization signature is invalid." },
        { status: 401 },
      );
    }
    return NextResponse.json(
      createAutoHedgeSession(body.wallet, body.chainId),
    );
  } catch (error) {
    console.error("Auto-Hedge session creation failed", error);
    return NextResponse.json(
      { error: "Auto-Hedge authorization could not be created." },
      { status: 500 },
    );
  }
}
