"use client";

import {
  ArrowUpRight,
  Check,
  Layers3,
  LockKeyhole,
  Route,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatUnits } from "viem";
import type { FirelightState } from "@/hooks/useFirelight";
import type { VaultState } from "@/hooks/useVault";
import type { YieldStrategyId } from "@/hooks/useYieldStrategySelection";

function allocationPercent(position: bigint, total: bigint) {
  if (total === 0n) {
    return 0;
  }
  return Number((position * 10_000n) / total) / 100;
}

function displayCombinedAssets(value: bigint, decimals: number) {
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : `${whole}.00`;
}

export function YieldStrategyPanel({
  firelight,
  selectedStrategy,
  setStrategy,
  variant = "dashboard",
  vault,
}: {
  firelight: FirelightState;
  selectedStrategy: YieldStrategyId;
  setStrategy: (strategy: YieldStrategyId) => void;
  variant?: "dashboard" | "deposit";
  vault: VaultState;
}) {
  const upshiftAssets = vault.vaultAssetsRaw ?? 0n;
  const firelightAssets = firelight.assetsRaw ?? 0n;
  const earningAssets = upshiftAssets + firelightAssets;
  const upshiftAllocation = allocationPercent(upshiftAssets, earningAssets);
  const firelightAllocation = allocationPercent(
    firelightAssets,
    earningAssets,
  );
  const selectedIsFirelight =
    firelight.isAvailable && selectedStrategy === "firelight";

  return (
    <section
      aria-labelledby="yield-strategy-heading"
      className={`overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b1117]/75 ${
        variant === "dashboard" ? "mt-4" : "mb-4"
      }`}
    >
      <div className="flex flex-col gap-2 border-b border-white/[0.06] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 aria-hidden="true" className="text-[#4de2ad]" size={17} />
            <h2
              id="yield-strategy-heading"
              className="text-sm font-semibold text-white"
            >
              Yield strategy
            </h2>
          </div>
          <p className="mt-1 text-xs text-[#7d8790]">
            Choose where your next FXRP deposit earns.
          </p>
        </div>
        <span className="w-fit rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-[#aeb7be]">
          Next deposit: {selectedIsFirelight ? "Firelight" : "Upshift"}
        </span>
      </div>

      <div
        className={`grid gap-2 p-3 sm:p-4 ${
          firelight.isAvailable ? "md:grid-cols-2" : ""
        }`}
      >
        <StrategyOption
          active={!selectedIsFirelight}
          badge="Flexible"
          description="Managed yield strategy"
          icon={<Route aria-hidden="true" size={18} />}
          name="Upshift"
          onClick={() => setStrategy("upshift")}
          position={`${vault.vaultAssets} FXRP`}
          positionLabel="Spend-ready position"
          tone="green"
        />

        {firelight.isAvailable ? (
          <StrategyOption
            active={selectedIsFirelight}
            badge="stXRP"
            description="FXRP staking"
            icon={<Waves aria-hidden="true" size={18} />}
            name="Firelight"
            onClick={() => setStrategy("firelight")}
            position={`${firelight.assets} FXRP`}
            positionLabel={`${firelight.shares} stXRP`}
            tone="blue"
          />
        ) : null}
      </div>

      <div className="border-t border-white/[0.06] bg-white/[0.015] px-4 py-3 sm:px-5">
        {selectedIsFirelight ? (
          <div className="flex items-start gap-2.5">
            <LockKeyhole
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#71b9e6]"
              size={14}
            />
            <p className="text-[11px] leading-5 text-[#8b969f]">
              Firelight issues stXRP. Exits follow scheduled withdrawal periods,
              so this position cannot fund RippleFI payments directly.
            </p>
          </div>
        ) : (
          <p className="text-[11px] leading-5 text-[#8b969f]">
            Upshift deposits receive rFXRP and stay connected to RippleFI
            withdrawals and payments.
          </p>
        )}

        {variant === "dashboard" && earningAssets > 0n ? (
          <div className="mt-3 grid gap-3 border-t border-white/[0.05] pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className="bg-[#4de2ad]"
                  style={{ width: `${upshiftAllocation}%` }}
                />
                <span
                  className="bg-[#71b9e6]"
                  style={{ width: `${firelightAllocation}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#77828b]">
                <span>Upshift {upshiftAllocation.toFixed(1)}%</span>
                {firelight.isAvailable ? (
                  <span>Firelight {firelightAllocation.toFixed(1)}%</span>
                ) : null}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#65717a]">
                Earning across strategies
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-white">
                {displayCombinedAssets(earningAssets, vault.decimals)} FXRP
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[0.05] pt-3 text-[10px]">
          <a
            href={`${vault.chain.blockExplorers.default.url}/address/${
              selectedIsFirelight
                ? firelight.address
                : vault.contracts.strategies.upshift
            }`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#8f9ca5] transition hover:text-white"
          >
            View contract
            <ArrowUpRight aria-hidden="true" size={11} />
          </a>
          {selectedIsFirelight ? (
            <a
              href="https://docs.firelight.finance/for-stakers/deployments-and-withdrawals"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#8f9ca5] transition hover:text-white"
            >
              Withdrawal periods
              <ArrowUpRight aria-hidden="true" size={11} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StrategyOption({
  active,
  badge,
  description,
  icon,
  name,
  onClick,
  position,
  positionLabel,
  tone,
}: {
  active: boolean;
  badge: string;
  description: string;
  icon: ReactNode;
  name: string;
  onClick: () => void;
  position: string;
  positionLabel: string;
  tone: "blue" | "green";
}) {
  const accent = tone === "green" ? "#4de2ad" : "#71b9e6";

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group relative min-w-0 rounded-lg border p-3.5 text-left transition ${
        active
          ? "border-white/20 bg-white/[0.055]"
          : "border-white/[0.07] bg-[#080c10]/50 hover:border-white/15"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md border"
            style={{
              backgroundColor: `${accent}12`,
              borderColor: `${accent}35`,
              color: accent,
            }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{name}</span>
              <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] text-[#87929b]">
                {badge}
              </span>
            </div>
            <span className="mt-0.5 block text-[11px] text-[#77828b]">
              {description}
            </span>
          </div>
        </div>
        <span
          className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
            active
              ? "border-white/30 bg-white text-[#0a0e12]"
              : "border-white/10 text-transparent"
          }`}
        >
          <Check aria-hidden="true" size={12} />
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-white/[0.05] pt-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-[#dce1e4]">
            {position}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-[#626d76]">
            {positionLabel}
          </p>
        </div>
        {active ? (
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#aeb7be]">
            Selected
          </span>
        ) : null}
      </div>
    </button>
  );
}
