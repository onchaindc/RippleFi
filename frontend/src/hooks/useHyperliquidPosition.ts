"use client";

import { useEffect, useRef, useState } from "react";
import type { HyperliquidLink } from "@/lib/hyperliquidLink";

export type HyperliquidPosition = {
  coin: string;
  entryPx: number;
  leverage: number;
  liquidationPx: number | null;
  marginMode: "cross" | "isolated";
  markPx: number;
  notional: number;
  size: number;
  unrealizedPnl: number;
};

function infoUrl(network: HyperliquidLink["network"]) {
  return network === "mainnet"
    ? "https://api.hyperliquid.xyz/info"
    : "https://api.hyperliquid-testnet.xyz/info";
}

async function fetchPosition(
  link: HyperliquidLink,
  coin: string,
): Promise<HyperliquidPosition | null> {
  const url = infoUrl(link.network);
  const headers = { "Content-Type": "application/json" };
  const [stateResponse, ctxResponse] = await Promise.all([
    fetch(url, {
      body: JSON.stringify({
        type: "clearinghouseState",
        user: link.masterAccount,
      }),
      headers,
      method: "POST",
    }),
    fetch(url, {
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      headers,
      method: "POST",
    }),
  ]);
  if (!stateResponse.ok || !ctxResponse.ok) {
    throw new Error("Hyperliquid position feed is temporarily unavailable.");
  }
  const state = (await stateResponse.json()) as {
    assetPositions?: Array<{ position?: Record<string, unknown> }>;
  };
  const ctx = (await ctxResponse.json()) as Array<Record<string, unknown>>;
  const markPxMap = (ctx?.[1]?.markPx ?? {}) as Record<string, string>;
  const markPx = Number(markPxMap[coin]);

  for (const entry of state?.assetPositions ?? []) {
    const pos = entry?.position;
    if (!pos || pos.coin !== coin) {
      continue;
    }
    const size = Math.abs(Number(pos.szi));
    if (!Number.isFinite(size) || size <= 0) {
      continue;
    }
    const positionValue = Number(pos.positionValue);
    return {
      coin: pos.coin as string,
      entryPx: Number(pos.entryPx),
      leverage: Number(
        (pos.leverage as { value?: string | number } | undefined)?.value ?? 1,
      ),
      liquidationPx: Number.isFinite(Number(pos.liquidationPx))
        ? Number(pos.liquidationPx)
        : null,
      marginMode:
        (pos.leverage as { type?: string } | undefined)?.type === "isolated"
          ? "isolated"
          : "cross",
      markPx:
        Number.isFinite(markPx) && markPx > 0
          ? markPx
          : Number.isFinite(positionValue) && positionValue > 0
            ? positionValue / size
            : Number(pos.entryPx),
      notional: Number(pos.notional),
      size,
      unrealizedPnl: Number(pos.unrealizedPnl),
    };
  }
  return null;
}

type PositionSnapshot = {
  error: string | null;
  key: string | null;
  loading: boolean;
  position: HyperliquidPosition | null;
};

export function useHyperliquidPosition(
  link: HyperliquidLink | null,
  coin: string | null,
  pollMs = 10_000,
) {
  const key =
    link && coin
      ? `${link.network}:${link.masterAccount}:${coin}`
      : null;
  const [snapshot, setSnapshot] = useState<PositionSnapshot>({
    error: null,
    key: null,
    loading: false,
    position: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derive a "fresh" snapshot for the current account/market so a changed key
  // reads as loading instead of showing a stale position for another account.
  const current =
    snapshot.key === key
      ? snapshot
      : { error: null, key, loading: true, position: null };

  useEffect(() => {
    if (!link || !coin) {
      return;
    }
    const accountKey = `${link.network}:${link.masterAccount}:${coin}`;
    const run = async () => {
      try {
        const result = await fetchPosition(link, coin);
        setSnapshot({
          error: null,
          key: accountKey,
          loading: false,
          position: result,
        });
      } catch (error) {
        setSnapshot({
          error:
            error instanceof Error
              ? error.message
              : "Position feed failed.",
          key: accountKey,
          loading: false,
          position: null,
        });
      }
    };
    void run();
    timerRef.current = setInterval(() => void run(), pollMs);
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [coin, key, link, pollMs]);

  return {
    error: current.error,
    loading: current.loading,
    position: current.position,
  };
}
