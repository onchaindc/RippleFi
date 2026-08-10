"use client";

import { ArrowUpRight, Clock3 } from "lucide-react";
import type { FirelightState } from "@/hooks/useFirelight";

export function FirelightLiquidityNotice({
  firelight,
  context,
}: {
  firelight: FirelightState;
  context: "spend" | "withdraw";
}) {
  if (!firelight.isAvailable || !firelight.assetsRaw) {
    return null;
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[#71b9e6]/15 bg-[#71b9e6]/[0.04] px-3.5 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <Clock3
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[#71b9e6]"
          size={15}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#d7eaf7]">
            {firelight.assets} FXRP in Firelight
          </p>
          <p className="mt-1 text-[11px] leading-5 text-[#7f909b]">
            {context === "spend"
              ? "stXRP is not spend-ready. Exit through a Firelight withdrawal period first."
              : "This page withdraws rFXRP only. Firelight stXRP uses scheduled withdrawal periods."}
          </p>
        </div>
      </div>
      <a
        href="https://docs.firelight.finance/for-stakers/deployments-and-withdrawals"
        target="_blank"
        rel="noreferrer"
        aria-label="Read Firelight withdrawal documentation"
        className="mt-0.5 shrink-0 text-[#71b9e6] transition hover:text-[#a7d9f5]"
      >
        <ArrowUpRight aria-hidden="true" size={15} />
      </a>
    </div>
  );
}
