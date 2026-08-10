import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  http,
  type Address,
} from "viem";
import { NextResponse } from "next/server";
import {
  FLARE_CONTRACT_REGISTRY,
  flareContractRegistryAbi,
  ftsoV2Abi,
  XRP_USD_FEED_ID,
  type FtsoXrpPrice,
} from "@/lib/ftso";
import {
  coston2,
  flare,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";

export const dynamic = "force-dynamic";

function getRpcUrl(chainId: SupportedChainId) {
  return chainId === flare.id
    ? process.env.FLARE_RPC_URL?.trim() ||
        "https://flare-api.flare.network/ext/C/rpc"
    : process.env.COSTON2_RPC_URL?.trim() ||
        "https://coston2-api.flare.network/ext/C/rpc";
}

function getChain(chainId: SupportedChainId) {
  return chainId === flare.id ? flare : coston2;
}

export async function GET(request: Request) {
  const chainId = Number(new URL(request.url).searchParams.get("chainId"));
  if (!isSupportedChainId(chainId)) {
    return NextResponse.json(
      { error: "A supported chain ID is required." },
      { status: 400 },
    );
  }

  try {
    const client = createPublicClient({
      chain: getChain(chainId),
      transport: http(getRpcUrl(chainId)),
    });
    const ftsoAddress = await client.readContract({
      address: FLARE_CONTRACT_REGISTRY,
      abi: flareContractRegistryAbi,
      functionName: "getContractAddressByName",
      args: ["FtsoV2"],
    });
    const call = await client.call({
      data: encodeFunctionData({
        abi: ftsoV2Abi,
        functionName: "getFeedByIdInWei",
        args: [XRP_USD_FEED_ID],
      }),
      to: ftsoAddress as Address,
    });
    if (!call.data) {
      throw new Error("FTSO returned no XRP/USD data.");
    }
    const [priceWei, timestamp] = decodeFunctionResult({
      abi: ftsoV2Abi,
      functionName: "getFeedByIdInWei",
      data: call.data,
    });

    if (priceWei <= 0n || timestamp <= 0n) {
      throw new Error("FTSO returned an invalid XRP/USD observation.");
    }

    const response: FtsoXrpPrice = {
      chainId,
      feed: "XRP/USD",
      feedId: XRP_USD_FEED_ID,
      fetchedAt: Date.now(),
      ftsoAddress: ftsoAddress as Address,
      priceUsd: formatUnits(priceWei, 18),
      priceWei: priceWei.toString(),
      source: "Flare FTSO v2",
      timestamp: Number(timestamp) * 1_000,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("FTSO XRP/USD read failed", {
      chainId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "The live XRP/USD FTSO feed is temporarily unavailable." },
      { status: 503 },
    );
  }
}
