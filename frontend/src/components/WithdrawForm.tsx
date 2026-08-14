"use client";

import { ArrowUpFromLine, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { parseUnits } from "viem";
import { FeedbackMessage, type FeedbackTone } from "@/components/FeedbackMessage";
import { compactError } from "@/lib/feedback";
import type { VaultState } from "@/hooks/useVault";

function readError(error: unknown) {
  return compactError(error, "Transaction failed.");
}

export function WithdrawForm({ vault }: { vault: VaultState }) {
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<FeedbackTone>("info");

  const amountRaw = (() => {
    try {
      return parseUnits(amount || "0", vault.decimals);
    } catch {
      return 0n;
    }
  })();

  const busy = vault.pendingAction === "withdraw";

  async function handleWithdraw() {
    setMessage("Confirm withdrawal in your wallet.");
    setMessageTone("loading");
    try {
      await vault.withdrawFxrp(amount);
      setAmount("");
      setMessage("Withdrawal confirmed.");
      setMessageTone("success");
    } catch (error) {
      setMessage(readError(error));
      setMessageTone("error");
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-[#89939e]">
        Amount
      </label>
      <div className="mt-2 flex h-12 items-center rounded-lg border border-white/10 bg-[#080b0f]/85 px-3">
        <input
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setMessage("");
          }}
          inputMode="decimal"
          placeholder="0.00"
          className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-[#3f4851]"
        />
        <button
          type="button"
          onClick={() => setAmount(vault.withdrawableAssets)}
          className="mr-3 text-xs font-semibold text-[#71b9e6] hover:text-[#94caf0]"
        >
          MAX
        </button>
        <span className="text-sm text-[#7d8790]">FXRP</span>
      </div>

      <button
        type="button"
        onClick={handleWithdraw}
        disabled={!vault.isCorrectChain || amountRaw <= 0n || busy}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#71b9e6] px-4 text-sm font-semibold text-[#071117] transition hover:bg-[#94caf0] disabled:cursor-not-allowed disabled:bg-[#27333b] disabled:text-[#69757d]"
      >
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" size={18} />
        ) : (
          <ArrowUpFromLine aria-hidden="true" size={18} />
        )}
        {busy ? "Withdrawing" : "Withdraw FXRP"}
      </button>

      <div className="mt-2 min-h-8">
        {message ? (
          <FeedbackMessage tone={messageTone}>{message}</FeedbackMessage>
        ) : null}
      </div>
    </div>
  );
}
