"use client";

import { Shield } from "lucide-react";
import { AutoHedgePanel } from "@/components/AutoHedgePanel";
import { useFirelight } from "@/hooks/useFirelight";
import { useVault } from "@/hooks/useVault";

export default function AutoHedgePage() {
  const vault = useVault();
  const firelight = useFirelight();

  return (
    <main className="mx-auto min-w-0 w-full max-w-7xl flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <section className="border-b border-white/[0.07] pb-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#4de2ad]">
              <Shield aria-hidden="true" size={16} />
              Protection
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">
              Hedge your XRP against a drop.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#8f9aa3]">
              Arm a protective short on Hyperliquid, size it with leverage and
              tranches, and let RippleFI open and close the hedge for you.
            </p>
          </div>
        </div>
      </section>

      <AutoHedgePanel
        additionalPositionRaw={firelight.assetsRaw}
        vault={vault}
      />
    </main>
  );
}
