"use client";

import { useEffect, useState } from "react";
import type { FtsoXrpPrice } from "@/lib/ftso";
import type { SupportedChainId } from "@/lib/networks";

type PriceState = {
  chainId: SupportedChainId | null;
  data: FtsoXrpPrice | null;
  error: string;
  isLoading: boolean;
};

const POLL_INTERVAL_MS = 8_000;

export function useFtsoXrpPrice(chainId: SupportedChainId) {
  const [state, setState] = useState<PriceState>({
    chainId: null,
    data: null,
    error: "",
    isLoading: true,
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/ftso/xrp-price?chainId=${chainId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as FtsoXrpPrice & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(body.error || "FTSO price request failed.");
        }
        if (!cancelled) {
          setState({
            chainId,
            data: body,
            error: "",
            isLoading: false,
          });
        }
      } catch (error) {
        if (!cancelled && !controller.signal.aborted) {
          setState((current) => ({
            chainId,
            data: current.chainId === chainId ? current.data : null,
            error:
              error instanceof Error
                ? error.message
                : "FTSO price request failed.",
            isLoading: false,
          }));
        }
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [chainId]);

  return {
    data: state.chainId === chainId ? state.data : null,
    error: state.chainId === chainId ? state.error : "",
    isLoading: state.chainId !== chainId || state.isLoading,
  };
}
