import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  const apiKey = process.env.XAMAN_API_KEY?.trim();
  const apiSecret = process.env.XAMAN_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Xaman API credentials are not configured." },
      { status: 500 },
    );
  }

  const { uuid } = await context.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) {
    return NextResponse.json(
      { error: "Xaman payload ID is invalid." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(
      `https://xumm.app/api/v1/platform/payload/${uuid}`,
      {
        headers: {
          "x-api-key": apiKey,
          "x-api-secret": apiSecret,
        },
        cache: "no-store",
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to read Xaman payload status." },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Unable to reach Xaman." },
      { status: 502 },
    );
  }
}
