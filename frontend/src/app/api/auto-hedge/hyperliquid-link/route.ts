import { isAddress, type Address } from "viem";
import { NextResponse } from "next/server";
import {
  deleteHyperliquidLink,
  hasSharedAutoHedgeStore,
  loadHyperliquidLink,
  saveHyperliquidLink,
} from "@/lib/autoHedgeSharedStore";
import {
  readBearerToken,
  verifyAutoHedgeSession,
} from "@/lib/autoHedgeSessionServer";
import {
  hyperliquidNetworkForChain,
  type HyperliquidLink,
} from "@/lib/hyperliquidLink";
import {
  flare,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";

export const dynamic = "force-dynamic";

function readScope(url: string) {
  const params = new URL(url).searchParams;
  const wallet = params.get("wallet");
  const chainId = Number(params.get("chainId"));
  if (!wallet || !isAddress(wallet) || !isSupportedChainId(chainId)) {
    return null;
  }
  return { chainId, wallet };
}

function requireMatchingSession(
  request: Request,
  wallet: Address,
  chainId: SupportedChainId,
) {
  const session = verifyAutoHedgeSession(readBearerToken(request));
  if (
    session.wallet.toLowerCase() !== wallet.toLowerCase() ||
    session.chainId !== chainId
  ) {
    throw new Error("This authorization does not match the connected wallet.");
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Hyperliquid protection is not configured: ${name} is missing.`);
  }
  return value;
}

function signerConfig(chainId: SupportedChainId) {
  const mainnet = chainId === flare.id;
  const url = (
    mainnet
      ? requiredEnv("HYPERLIQUID_MAINNET_SIGNER_URL")
      : process.env.HYPERLIQUID_TESTNET_SIGNER_URL?.trim() ||
        requiredEnv("HYPERLIQUID_SIGNER_URL")
  ).replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) {
    throw new Error(
      "Hyperliquid protection is not configured: the signer URL must use HTTPS in production.",
    );
  }
  return {
    authToken: mainnet
      ? requiredEnv("HYPERLIQUID_MAINNET_SIGNER_AUTH_TOKEN")
      : process.env.HYPERLIQUID_TESTNET_SIGNER_AUTH_TOKEN?.trim() ||
        requiredEnv("HYPERLIQUID_SIGNER_AUTH_TOKEN"),
    url,
  };
}

export async function GET(request: Request) {
  const scope = readScope(request.url);
  if (!scope) {
    return NextResponse.json(
      { error: "A valid wallet and network are required." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json({
      link: await loadHyperliquidLink(scope.wallet, scope.chainId),
      shared: hasSharedAutoHedgeStore(),
    });
  } catch (error) {
    console.error("Hyperliquid linkage load failed", error);
    return NextResponse.json(
      { error: "Hyperliquid connection could not be loaded." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chainId?: unknown;
      wallet?: unknown;
    };
    if (
      typeof body.wallet !== "string" ||
      !isAddress(body.wallet) ||
      typeof body.chainId !== "number" ||
      !isSupportedChainId(body.chainId)
    ) {
      return NextResponse.json(
        { error: "Connect a supported wallet first." },
        { status: 400 },
      );
    }
    requireMatchingSession(request, body.wallet, body.chainId);
    const config = signerConfig(body.chainId);
    const network = hyperliquidNetworkForChain(body.chainId);
    const response = await fetch(`${config.url}/v1/agents/provision`, {
      body: JSON.stringify({
        masterAccount: body.wallet,
        network,
        ripplefiWallet: body.wallet,
      }),
      headers: {
        Authorization: `Bearer ${config.authToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
    const provisioned = (await response.json().catch(() => null)) as {
      apiWalletAddress?: string;
    } | null;
    if (
      !response.ok ||
      !provisioned?.apiWalletAddress ||
      !isAddress(provisioned.apiWalletAddress)
    ) {
      console.error("Hyperliquid agent provisioning failed", {
        body: provisioned,
        status: response.status,
      });
      return NextResponse.json(
        { error: "Hyperliquid protection could not be prepared." },
        { status: 502 },
      );
    }
    const previous = await loadHyperliquidLink(body.wallet, body.chainId);
    const link: HyperliquidLink = {
      apiWalletAddress: provisioned.apiWalletAddress,
      authorizedAt:
        previous?.apiWalletAddress.toLowerCase() ===
          provisioned.apiWalletAddress.toLowerCase()
          ? previous.authorizedAt
          : null,
      chainId: body.chainId,
      masterAccount: body.wallet,
      network,
      status:
        previous?.status === "authorized" &&
        previous.apiWalletAddress.toLowerCase() ===
          provisioned.apiWalletAddress.toLowerCase()
          ? "authorized"
          : "connected",
      updatedAt: Date.now(),
      version: 1,
      wallet: body.wallet,
    };
    await saveHyperliquidLink(link);
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Hyperliquid provisioning failed", error);
    const configIssue =
      error instanceof Error &&
      error.message.startsWith("Hyperliquid protection is not configured");
    return NextResponse.json(
      {
        error: configIssue
          ? error.message
          : "Hyperliquid protection could not be prepared.",
      },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      chainId?: unknown;
      wallet?: unknown;
    };
    if (
      typeof body.wallet !== "string" ||
      !isAddress(body.wallet) ||
      typeof body.chainId !== "number" ||
      !isSupportedChainId(body.chainId)
    ) {
      return NextResponse.json(
        { error: "Connect a supported wallet first." },
        { status: 400 },
      );
    }
    requireMatchingSession(request, body.wallet, body.chainId);
    const previous = await loadHyperliquidLink(body.wallet, body.chainId);
    if (!previous) {
      return NextResponse.json(
        { error: "Enable Hyperliquid protection first." },
        { status: 409 },
      );
    }
    const link: HyperliquidLink = {
      ...previous,
      authorizedAt: previous.authorizedAt ?? Date.now(),
      status: "authorized",
      updatedAt: Date.now(),
    };
    await saveHyperliquidLink(link);
    return NextResponse.json({ link });
  } catch (error) {
    console.error("Hyperliquid authorization update failed", error);
    return NextResponse.json(
      { error: "Hyperliquid approval could not be saved." },
      { status: 401 },
    );
  }
}

export async function DELETE(request: Request) {
  const scope = readScope(request.url);
  if (!scope) {
    return NextResponse.json(
      { error: "A valid wallet and network are required." },
      { status: 400 },
    );
  }
  try {
    requireMatchingSession(request, scope.wallet, scope.chainId);
    await deleteHyperliquidLink(scope.wallet, scope.chainId);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    console.error("Hyperliquid disconnect failed", error);
    return NextResponse.json(
      { error: "Hyperliquid connection could not be removed." },
      { status: 401 },
    );
  }
}
