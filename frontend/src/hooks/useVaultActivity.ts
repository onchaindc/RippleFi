"use client";

import { useEffect, useState } from "react";
import { formatUnits, type Hash } from "viem";
import type { VaultState } from "@/hooks/useVault";

export type ActivityScope = "deposit" | "withdraw" | "spend";

export type VaultActivityItem = {
  amount: string;
  amountRaw?: bigint;
  detail: string;
  hash: Hash;
  kind?: ActivityScope;
  label: string;
  timestamp?: number;
};

type HistoryResponse = {
  depositedRaw: string;
  failedSources: string[];
  items: Array<Omit<VaultActivityItem, "amount" | "amountRaw"> & {
    amountRaw: string;
  }>;
  partial: boolean;
  withdrawnRaw: string;
};

const ACTIVITY_LIMIT = 5;

function formatAmount(value: bigint, decimals: number) {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : `${whole}.00`;
}

async function fetchHistory(
  address: string,
  chainId: number,
  signal: AbortSignal,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        `/api/history?address=${encodeURIComponent(address)}&chainId=${chainId}`,
        {
          cache: "no-store",
          signal,
        },
      );
      if (!response.ok) {
        throw new Error(`History request failed with ${response.status}`);
      }
      return (await response.json()) as HistoryResponse;
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      lastError = error;
      await new Promise((resolve) =>
        window.setTimeout(resolve, 300 * 2 ** attempt),
      );
    }
  }

  throw lastError;
}

function normalizeHistory(history: HistoryResponse, decimals: number) {
  return {
    depositedRaw: BigInt(history.depositedRaw),
    failedSources: history.failedSources,
    items: history.items.map((item) => {
      const amountRaw = BigInt(item.amountRaw);
      return {
        ...item,
        amount: formatAmount(amountRaw, decimals),
        amountRaw,
      };
    }),
    partial: history.partial,
    withdrawnRaw: BigInt(history.withdrawnRaw),
  };
}

function useHistoryRequest(vault: VaultState) {
  const [history, setHistory] = useState<ReturnType<
    typeof normalizeHistory
  > | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!vault.address || !vault.isVaultConfigured) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setIsLoading(true);
        setIsError(false);
      }
    });

    fetchHistory(vault.address, vault.chainId, controller.signal)
      .then((response) => {
        if (!cancelled) {
          setHistory(normalizeHistory(response, vault.decimals));
        }
      })
      .catch(() => {
        if (!cancelled && !controller.signal.aborted) {
          setHistory(null);
          setIsError(true);
        }
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    vault.activityVersion,
    vault.address,
    vault.chainId,
    vault.decimals,
    vault.isVaultConfigured,
  ]);

  if (!vault.address || !vault.isVaultConfigured) {
    return { history: null, isError: false, isLoading: false };
  }

  return { history, isError, isLoading };
}

export function useVaultActivity(scope: ActivityScope, vault: VaultState) {
  const request = useHistoryRequest(vault);
  const items =
    request.history?.items
      .filter((item) => item.kind === scope)
      .slice(0, ACTIVITY_LIMIT) ?? [];

  return {
    isError: request.isError,
    isLoading: request.isLoading,
    isPartial: request.history?.partial ?? false,
    items,
  };
}

export function useVaultHistory(vault: VaultState) {
  const request = useHistoryRequest(vault);
  const depositedRaw = request.history?.depositedRaw ?? 0n;
  const withdrawnRaw = request.history?.withdrawnRaw ?? 0n;
  const performanceComplete =
    request.history !== null &&
    !request.history.failedSources.some(
      (source) => source === "deposits" || source === "withdrawals",
    );
  const performanceRaw =
    performanceComplete && vault.vaultAssetsRaw !== undefined
      ? vault.vaultAssetsRaw + withdrawnRaw - depositedRaw
      : undefined;

  return {
    deposited: formatAmount(depositedRaw, vault.decimals),
    depositedRaw,
    failedSources: request.history?.failedSources ?? [],
    isError: request.isError,
    isLoading: request.isLoading,
    isPartial: request.history?.partial ?? false,
    items: request.history?.items ?? [],
    performance:
      performanceRaw === undefined
        ? null
        : `${performanceRaw >= 0n ? "+" : "-"}${formatAmount(
            performanceRaw >= 0n ? performanceRaw : -performanceRaw,
            vault.decimals,
          )}`,
    performanceComplete,
    performanceRaw,
    withdrawn: formatAmount(withdrawnRaw, vault.decimals),
    withdrawnRaw,
  };
}
