"use client";

import { ArrowDownToLine, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { parseUnits } from "viem";
import { FeedbackMessage, type FeedbackTone } from "@/components/FeedbackMessage";
import { compactError } from "@/lib/feedback";
import type { FirelightState } from "@/hooks/useFirelight";
import type { VaultState } from "@/hooks/useVault";
import type { YieldStrategyId } from "@/hooks/useYieldStrategySelection";

function readError(error: unknown) {
  return compactError(error, "Transaction failed.");
}

export function DepositForm({
  firelight,
  strategy,
  vault,
}: {
  firelight: FirelightState;
  strategy: YieldStrategyId;
  vault: VaultState;
}) {
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

  const isFirelight = strategy === "firelight" && firelight.isAvailable;
  const allowanceRaw = isFirelight
    ? firelight.allowanceRaw
    : vault.allowanceRaw;
  const requiresApproval =
    amountRaw > 0n && amountRaw > (allowanceRaw ?? 0n);
  const busy =
    vault.pendingAction === "approve" ||
    vault.pendingAction === "deposit" ||
    firelight.pendingAction === "approve" ||
    firelight.pendingAction === "deposit";

  async function handleApprove() {
    setMessage("Confirm approval in your wallet.");
    setMessageTone("loading");
    try {
      if (isFirelight) {
        await firelight.approveFxrp(amount);
      } else {
        await vault.approveFxrp(amount);
      }
      setMessage("Approval confirmed.");
      setMessageTone("success");
    } catch (error) {
      setMessage(readError(error));
      setMessageTone("error");
    }
  }

  async function handleDeposit() {
    setMessage(
      isFirelight
        ? "Confirm Firelight staking in your wallet."
        : "Confirm deposit in your wallet.",
    );
    setMessageTone("loading");
    try {
      if (isFirelight) {
        await firelight.depositFxrp(amount);
        await vault.refresh();
      } else {
        await vault.depositFxrp(amount);
      }
      setAmount("");
      setMessage(
        isFirelight
          ? "FXRP deposited. Your stXRP position has been updated."
          : "Deposit confirmed.",
      );
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
      <div className="mt-2 flex h-12 items-center rounded-lg border border-white/10 bg-[#080b0f]/85 px-3 focus-within:border-[#4de2ad]/60">
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
          onClick={() => setAmount(vault.fxrpBalance)}
          className="mr-3 text-xs font-semibold text-[#4de2ad] hover:text-[#79edc3]"
        >
          MAX
        </button>
        <span className="text-sm text-[#7d8790]">FXRP</span>
      </div>

      <button
        type="button"
        onClick={requiresApproval ? handleApprove : handleDeposit}
        disabled={!vault.isCorrectChain || amountRaw <= 0n || busy}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#4de2ad] px-4 text-sm font-semibold text-[#07100d] transition hover:bg-[#6ceaba] disabled:cursor-not-allowed disabled:bg-[#26332f] disabled:text-[#6f817a]"
      >
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" size={18} />
        ) : requiresApproval ? (
          <Check aria-hidden="true" size={18} />
        ) : (
          <ArrowDownToLine aria-hidden="true" size={18} />
        )}
        {vault.pendingAction === "approve" ||
        firelight.pendingAction === "approve"
          ? "Approving"
          : vault.pendingAction === "deposit" ||
              firelight.pendingAction === "deposit"
            ? isFirelight
              ? "Staking"
              : "Depositing"
            : requiresApproval
              ? "Approve FXRP"
              : isFirelight
                ? "Stake with Firelight"
                : "Deposit to Upshift"}
      </button>

      <div className="mt-2 min-h-8">
        {message ? (
          <FeedbackMessage tone={messageTone}>{message}</FeedbackMessage>
        ) : null}
      </div>
    </div>
  );
}
