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

    const result = await sendAlertEmail({
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

    if (!result.ok) {
      const reason = result.error || `HTTP ${result.status ?? "error"}`;
      let hint: string | null = null;
      const lower = reason.toLowerCase();
      if (/401|unauthorized|invalid api key/i.test(lower)) {
        hint =
          "Your RESEND_API_KEY was rejected — copy the full key from your Resend dashboard (API Keys) into the Vercel env and redeploy.";
      } else if (/restricted/i.test(lower)) {
        hint =
          "That key was created with restricted (Sending access) permissions. Create a new key with Full access in your Resend dashboard, or verify a domain and set ALERT_EMAIL_FROM to it — restricted keys can't use the sandbox sender.";
      } else if (/403|testing emails|own account email/i.test(lower)) {
        hint =
          "Resend's sandbox sender (onboarding@resend.dev) only delivers to your Resend account's own email. Verify a domain in Resend, then set ALERT_EMAIL_FROM to it and redeploy to send to any address.";
      } else if (/domain|verified|dns/i.test(lower)) {
        hint =
          "The sender domain isn't verified in Resend yet — add the DNS records Resend shows you, then redeploy.";
      }
      return NextResponse.json(
        {
          error: hint ? `${reason} — ${hint}` : `Resend rejected the email: ${reason}`,
          sent: false,
        },
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
