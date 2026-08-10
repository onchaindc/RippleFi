"use client";

import { ChevronDown, RadioTower } from "lucide-react";
import { useAccount, useSwitchChain } from "wagmi";
import {
  coston2,
  DEFAULT_CHAIN_ID,
  flare,
  getSupportedChain,
  isSupportedChainId,
} from "@/lib/networks";

export function NetworkSwitcher({ mobile = false }: { mobile?: boolean }) {
  const { chainId, isConnected } = useAccount();
  const { isPending, switchChain } = useSwitchChain();
  const activeChain = getSupportedChain(
    isSupportedChainId(chainId) ? chainId : DEFAULT_CHAIN_ID,
  );
  const mobileLabel = !isSupportedChainId(chainId)
    ? "Network"
    : chainId === flare.id
      ? "Flare"
      : "Coston2";

  if (!isConnected) {
    return (
      <div
        className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-[#aab2ba]"
      >
        <span className="size-2 rounded-full bg-[#4de2ad]" />
        {mobile ? "Coston2" : activeChain.name}
      </div>
    );
  }

  if (mobile) {
    return (
      <label
        className={`relative inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-[#cbd2d7] ${
          isPending ? "opacity-50" : ""
        }`}
      >
        <span className="size-2 rounded-full bg-[#4de2ad]" />
        <span>{mobileLabel}</span>
        <ChevronDown aria-hidden="true" size={13} className="text-[#68737d]" />
        <select
          aria-label="Select Flare network"
          value={isSupportedChainId(chainId) ? chainId : ""}
          onChange={(event) =>
            switchChain({ chainId: Number(event.target.value) as 14 | 114 })
          }
          disabled={isPending}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {!isSupportedChainId(chainId) ? (
            <option value="">Unsupported network</option>
          ) : null}
          <option value={flare.id}>Flare Mainnet</option>
          <option value={coston2.id}>Coston2 Testnet</option>
        </select>
      </label>
    );
  }

  return (
    <label className="relative block">
      <span className="sr-only">Select Flare network</span>
      <RadioTower
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#4de2ad]"
        size={mobile ? 16 : 14}
      />
      <select
        aria-label="Select Flare network"
        value={isSupportedChainId(chainId) ? chainId : ""}
        onChange={(event) =>
          switchChain({ chainId: Number(event.target.value) as 14 | 114 })
        }
        disabled={isPending}
        className="h-10 appearance-none rounded-lg border border-white/10 bg-[#11151a] pl-9 pr-9 text-xs text-[#cbd2d7] outline-none focus:border-[#4de2ad]/50 disabled:opacity-50"
      >
        {!isSupportedChainId(chainId) ? (
          <option value="">Unsupported network</option>
        ) : null}
        <option value={flare.id}>Flare Mainnet</option>
        <option value={coston2.id}>Coston2 Testnet</option>
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#68737d]"
        size={14}
      />
      <span className="sr-only">{activeChain.name}</span>
    </label>
  );
}
