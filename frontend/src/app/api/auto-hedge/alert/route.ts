import { NextResponse } from "next/server";
import { sendAlertEmail } from "@/lib/alertEmail";
import {
  readBearerToken,
  verifyAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import { isSupportedChainId } from "@/lib/networks";

export const dynamic = "force-dynamic";

// Client-side alerts (liquidation warnings while the panel is open) are sent
// here. Alerts are best-effort: the request must come from a wallet with a
// valid Auto-Hedge session, and the email is only sent when RESEND_API_KEY is
// configured.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chainId?: unknown;
      detail?: unknown;
      kind?: unknown;
      to?: unknown;
      wallet?: unknown;
    };
    if (
      typeof body.wallet !== "string" ||
      typeof body.chainId !== "number" ||
      !isSupportedChainId(body.chainId) ||
      typeof body.kind !== "string" ||
      typeof body.detail !== "string" ||
      body.detail.length > 500 ||
      typeof body.to !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)
    ) {
      return NextResponse.json(
        { error: "The alert request is malformed." },
        { status: 400 },
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
    if (
      session.wallet.toLowerCase() !== body.wallet.toLowerCase() ||
      session.chainId !== body.chainId
    ) {
      return NextResponse.json(
        { error: "This authorization does not match the connected wallet." },
        { status: 401 },
      );
    }

    const subject =
      body.kind === "liquidation-warning"
        ? "RippleFI: your hedge is close to liquidation"
        : body.kind === "execution-failed"
          ? "RippleFI: your hedge could not be opened"
          : "RippleFI: Auto-Hedge alert";

    const sent = await sendAlertEmail({
      subject,
      text: [
        body.detail,
        "",
        "Open RippleFI to review your protection.",
      ].join("\n"),
      to: body.to,
    });

    return NextResponse.json({ sent });
  } catch (error) {
    console.error("Auto-Hedge alert request failed", error);
    return NextResponse.json(
      { error: "The alert could not be sent." },
      { status: 500 },
    );
  }
}
