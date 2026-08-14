"use client";

import {
  ArrowUpRight,
  LoaderCircle,
  ScanSearch,
  Send,
  Smartphone,
} from "lucide-react";
import { useState } from "react";
import { FeedbackMessage, type FeedbackTone } from "@/components/FeedbackMessage";
import { useSmartAccountDepositFlow } from "@/hooks/useSmartAccountDepositFlow";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import type { VaultState } from "@/hooks/useVault";
import { compactError, productErrorMessage } from "@/lib/feedback";
import type { SmartSpendInstruction } from "@/lib/smartAccounts";

export function SmartAccountSpend({ vault }: { vault: VaultState }) {
  const smartAccount = useSmartAccount(vault);
  const [xrplAddress, setXrplAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState<"available" | "vault">("available");
  const [instruction, setInstruction] =
    useState<SmartSpendInstruction | null>(null);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<FeedbackTone>("info");
  const flow = useSmartAccountDepositFlow({
    onSuccess: async () => {
      await smartAccount.resolveAccount(xrplAddress);
    },
  });
  const details = smartAccount.details;

  async function resolve() {
    setMessage("Resolving Smart Account...");
    setTone("loading");
    setInstruction(null);
    flow.reset();
    try {
      await smartAccount.resolveAccount(xrplAddress);
      setMessage("Smart Account ready.");
      setTone("success");
    } catch (error) {
      setMessage(compactError(error, "Could not resolve Smart Account."));
      setTone("error");
    }
  }

  function prepare() {
    setMessage("");
    flow.reset();
    try {
      setInstruction(
        smartAccount.prepareSpend({ amount, recipient, source }),
      );
    } catch (error) {
      setInstruction(null);
      setMessage(compactError(error, "Could not prepare payment."));
      setTone("error");
    }
  }

  return (
    <section className="glass-panel-strong overflow-hidden rounded-xl border border-[#71b9e6]/15">
      <div className="border-b border-white/[0.06] px-4 py-4 sm:px-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#71b9e6]">
          Xaman authorized
        </p>
        <h2 className="mt-1 text-xl font-semibold text-white">
          Spend from Smart Account
        </h2>
        <p className="mt-1 text-xs leading-5 text-[#7d8790]">
          Authorize with Xaman, then pay from Smart FXRP or its vault position.
        </p>
      </div>

      <div className="p-4 sm:p-5">
        <label className="text-xs text-[#89939e]">
          XRPL classic address
          <div className="mt-1.5 flex h-12 items-center gap-2 rounded-lg border border-white/10 bg-[#080b0f]/85 px-3">
            <input
              value={xrplAddress}
              onChange={(event) => {
                setXrplAddress(event.target.value);
                setInstruction(null);
                setMessage("");
                flow.reset();
              }}
              placeholder="r..."
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[#3f4851]"
            />
            <button
              type="button"
              onClick={resolve}
              disabled={smartAccount.isLoading || flow.isActive}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#71b9e6]/25 px-2.5 text-[10px] font-semibold text-[#a7d9f5] disabled:opacity-50"
            >
              {smartAccount.isLoading ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <ScanSearch size={14} />
              )}
              Resolve
            </button>
          </div>
        </label>

        {details ? (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
            <div>
              <p className="text-[#68737d]">Available</p>
              <p className="mt-1 font-mono text-white">
                {smartAccount.formatBalance(details.fxrpBalance)} FXRP
              </p>
            </div>
            <div>
              <p className="text-[#68737d]">Vault withdrawable</p>
              <p className="mt-1 font-mono text-white">
                {smartAccount.formatBalance(details.vaultWithdrawable)} FXRP
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 rounded-lg border border-white/10 bg-[#080b0f]/85 p-1">
          {(["available", "vault"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setSource(option);
                setInstruction(null);
              }}
              className={`h-9 rounded-md text-xs font-medium transition ${
                source === option
                  ? option === "available"
                    ? "bg-[#1a2422] text-[#4de2ad]"
                    : "bg-[#172331] text-[#71b9e6]"
                  : "text-[#68737d]"
              }`}
            >
              {option === "available" ? "Smart FXRP" : "Vault position"}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_0.55fr]">
          <label className="text-xs text-[#89939e]">
            Recipient
            <input
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setInstruction(null);
              }}
              placeholder="0x..."
              className="mt-1.5 h-11 w-full rounded-lg border border-white/10 bg-[#080b0f]/85 px-3 font-mono text-xs outline-none"
            />
          </label>
          <label className="text-xs text-[#89939e]">
            Amount
            <div className="mt-1.5 flex h-11 items-center rounded-lg border border-white/10 bg-[#080b0f]/85 px-3">
              <input
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setInstruction(null);
                }}
                inputMode="decimal"
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent text-base outline-none"
              />
              <span className="text-[10px] text-[#68737d]">FXRP</span>
            </div>
          </label>
        </div>

        <button
          type="button"
          onClick={prepare}
          disabled={!details || !recipient || !amount || flow.isActive}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#71b9e6] text-sm font-semibold text-[#071117] transition hover:bg-[#94caf0] disabled:cursor-not-allowed disabled:bg-[#27333b] disabled:text-[#69757d]"
        >
          <Send aria-hidden="true" size={15} />
          Review Smart Account payment
        </button>

        {instruction ? (
          <div className="mt-3 rounded-lg border border-[#f2b84b]/18 bg-[#f2b84b]/[0.035] p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-[#8f8060]">XRP authorization</span>
              <span className="font-mono font-semibold text-[#f4cd7d]">
                {smartAccount.formatBalance(instruction.paymentAmountRaw)} XRP
              </span>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-[#746b58]">
              Includes a one-base-unit FXRP direct mint plus current protocol
              fees. The requested {instruction.amountRaw > 0n ? amount : "0"} FXRP
              comes from the selected Smart Account balance.
            </p>
            <button
              type="button"
              onClick={() =>
                flow.start({
                  instruction,
                  xrplAddress,
                })
              }
              disabled={flow.isActive}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#f2b84b] text-xs font-semibold text-[#171106] disabled:opacity-50"
            >
              {flow.isActive ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Smartphone size={15} />
              )}
              Sign payment with Xaman
            </button>
          </div>
        ) : null}

        {flow.state.phase !== "idle" ? (
          <div className="mt-3">
            <FeedbackMessage
              tone={
                flow.state.phase === "failed"
                  ? "error"
                  : flow.state.phase === "success"
                    ? "success"
                    : "loading"
              }
            >
              {flow.state.phase === "failed"
                ? productErrorMessage(
                    flow.state.message,
                    "Smart Account payment couldn't be completed. Please try again.",
                  )
                : flow.state.message}
            </FeedbackMessage>
            {flow.state.deeplink &&
            flow.state.phase === "waiting-signature" ? (
              <a
                href={flow.state.deeplink}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#f4cd7d]"
              >
                <Smartphone size={13} />
                Open Xaman
              </a>
            ) : null}
            {flow.state.flareTransactionHash ? (
              <a
                href={`${vault.chain.blockExplorers.default.url}/tx/${flow.state.flareTransactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 ml-3 inline-flex items-center gap-1 text-xs text-[#71b9e6]"
              >
                {vault.chain.name} execution
                <ArrowUpRight size={13} />
              </a>
            ) : null}
          </div>
        ) : message ? (
          <FeedbackMessage className="mt-3" tone={tone}>
            {message}
          </FeedbackMessage>
        ) : null}
      </div>
    </section>
  );
}
