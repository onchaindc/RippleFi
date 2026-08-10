"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  DEFAULT_CHAIN_ID,
  flare,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";

export type YieldStrategyId = "firelight" | "upshift";

function preferenceKey(
  chainId: SupportedChainId,
  address: string | undefined,
) {
  return address
    ? `ripplefi:yield-strategy:v1:${chainId}:${address.toLowerCase()}`
    : `ripplefi:yield-strategy:v1:${chainId}:guest`;
}

export function useYieldStrategySelection() {
  const { address, chainId } = useAccount();
  const activeChainId = isSupportedChainId(chainId)
    ? chainId
    : DEFAULT_CHAIN_ID;
  const key = preferenceKey(activeChainId, address);
  const [stored, setStored] = useState<{
    key: string;
    strategy: YieldStrategyId;
  }>({ key: "", strategy: "upshift" });

  useEffect(() => {
    const saved = localStorage.getItem(key);
    const strategy =
      activeChainId === flare.id && saved === "firelight"
        ? "firelight"
        : "upshift";
    queueMicrotask(() => setStored({ key, strategy }));
  }, [activeChainId, key]);

  const setStrategy = useCallback(
    (strategy: YieldStrategyId) => {
      const supported =
        strategy === "firelight" && activeChainId !== flare.id
          ? "upshift"
          : strategy;
      localStorage.setItem(key, supported);
      setStored({ key, strategy: supported });
    },
    [activeChainId, key],
  );

  return {
    isFirelightAvailable: activeChainId === flare.id,
    selectedStrategy:
      stored.key === key ? stored.strategy : ("upshift" as const),
    setStrategy,
  };
}
