import { NextResponse } from "next/server";
import {
  alertEmailConfig,
  sendAlertEmail,
} from "@/lib/alertEmail";
import {
  readBearerToken,
  verifyAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import { isSupportedChainId } from "@/lib/networks";

export const dynamic = "force-dynamic";

// Lets the user verify the whole alert pipeline without waiting for a real
// hedge event: sends a confirmation email to the address on the panel.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chainId?: unknown;
      to?: unknown;
      wallet?: unknown;
    };
    if (
      typeof body.wallet !== "string" ||
      typeof body.chainId !== "number" ||
      !isSupportedChainId(body.chainId) ||
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

    const config = alertEmailConfig();
    if (!config.configured) {
      return NextResponse.json(
        {
          error:
            "Email alerts aren't configured yet — add RESEND_API_KEY to the environment and redeploy.",
          sent: false,
        },
        { status: 503 },
      );
    }

    const sent = await sendAlertEmail({
      subject: "RippleFI: your test alert arrived ✅",
      text: [
        "This is a test email from RippleFI's Auto-Hedge alerts.",
        "",
        "Your email is working. You'll get messages like this when a",
        "hedge opens, closes, or gets close to liquidation.",
        "",
        "You can turn this off by clearing the Email alerts field on the",
        "Auto-Hedge panel.",
      ].join("\n"),
      to: body.to,
    });

    if (!sent) {
      return NextResponse.json(
        { error: "Resend rejected the test email. Check the key and sender.", sent: false },
        { status: 502 },
      );
    }

    return NextResponse.json({ from: config.from, sandbox: config.sandbox, sent: true });
  } catch (error) {
    console.error("Auto-Hedge test alert failed", error);
    return NextResponse.json(
      { error: "The test email could not be sent." },
      { status: 500 },
    );
  }
}
