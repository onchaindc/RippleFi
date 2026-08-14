"use client";

import { Network } from "lucide-react";
import { SmartAccountDeposit } from "@/components/SmartAccountDeposit";
import { SmartAccountSpend } from "@/components/SmartAccountSpend";
import { useVault } from "@/hooks/useVault";

export default function SmartAccountsPage() {
  const vault = useVault();

  return (
    <main className="mx-auto min-w-0 w-full max-w-7xl flex-1 overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8">
      <header className="max-w-3xl border-b border-white/[0.07] pb-6">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#f2b84b]">
          <Network aria-hidden="true" size={16} />
          Smart Accounts
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Use RippleFI from XRPL.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8f9aa3]">
          Connect an XRPL address through Xaman to deposit XRP or pay from your
          Personal Account on Flare.
        </p>
      </header>

      <SmartAccountDeposit vault={vault} />
      <section className="mt-4">
        <SmartAccountSpend vault={vault} />
      </section>
    </main>
  );
}
