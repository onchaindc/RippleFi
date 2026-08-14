import "server-only";

// Server-side alert emails via Resend's REST API. Everything here must fail
// softly: alerts are a convenience, never a hard dependency of the hedge
// flow, and in local/preview environments RESEND_API_KEY is usually absent.
const RESEND_URL = "https://api.resend.com/v1/emails";

export function isAlertEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function fromAddress() {
  // Testing with onboarding@resend.dev only delivers to the account owner's
  // email; once a domain is verified, set ALERT_EMAIL_FROM to it.
  return (
    process.env.ALERT_EMAIL_FROM?.trim() ||
    "RippleFI <onboarding@resend.dev>"
  );
}

// Lets the UI explain delivery constraints: with the sandbox sender
// (onboarding@resend.dev) Resend only delivers to the account owner's
// address until a real domain is verified and ALERT_EMAIL_FROM is set.
export function alertEmailConfig() {
  const from = fromAddress();
  return {
    configured: isAlertEmailConfigured(),
    from,
    sandbox: from.includes("onboarding@resend.dev"),
  };
}

export async function sendAlertEmail({
  subject,
  text,
  to,
}: {
  subject: string;
  text: string;
  to: string;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[RippleFI] Alert email skipped: RESEND_API_KEY is not configured.",
    );
    return { ok: false, error: "RESEND_API_KEY is not set on the server." };
  }
  try {
    const response = await fetch(RESEND_URL, {
      body: JSON.stringify({
        from: fromAddress(),
        subject,
        text,
        to,
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      // Resend's error body is { name, message, statusCode }.
      let message = "";
      try {
        const parsed = JSON.parse(raw) as { message?: unknown };
        if (typeof parsed.message === "string") message = parsed.message;
      } catch {
        message = raw.slice(0, 300);
      }
      console.error(
        "[RippleFI] Alert email failed",
        { status: response.status, message, raw: raw.slice(0, 300) },
      );
      return { ok: false, error: message || `HTTP ${response.status}`, status: response.status };
    }
    return { ok: true };
  } catch (error) {
    console.error("[RippleFI] Alert email failed", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
