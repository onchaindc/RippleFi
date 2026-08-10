"use client";

import { ArrowUpRight, CircleDollarSign, LoaderCircle, Send } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { parseUnits, type Hash } from "viem";
import { FeedbackMessage, type FeedbackTone } from "@/components/FeedbackMessage";
import { useSpend } from "@/hooks/useSpend";
import { useVault } from "@/hooks/useVault";
import { compactError } from "@/lib/feedback";
import {
  decodePaymentRequest,
  type PaymentLinkRequest,
} from "@/lib/paymentLinks";

function shortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function PaymentLinkPage() {
  const params = useParams<{ id: string }>();
  const vault = useVault();
  const { isPaying, pay } = useSpend(vault);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<FeedbackTone>("info");
  const [hash, setHash] = useState<Hash | null>(null);
  let request: PaymentLinkRequest | null = null;
  let parseError = "";

  try {
    request = decodePaymentRequest(params.id);
  } catch (error) {
    parseError =
      error instanceof Error ? error.message : "This payment link is invalid.";
  }

  const requestedAmountRaw = (() => {
    if (!request) return 0n;
    try {
      return parseUnits(request.amount, vault.decimals);
    } catch {
      return 0n;
    }
  })();
  const hasEnoughBalance =
    requestedAmountRaw > 0n &&
    requestedAmountRaw <= (vault.fxrpBalanceRaw ?? 0n);
  const isRequestNetwork =
    request !== null && request.chainId === vault.chainId;
  const canPay =
    vault.isCorrectChain && isRequestNetwork && hasEnoughBalance && !isPaying;

  async function handlePay() {
    if (!request) return;
    setMessage("Confirm the FXRP transfer in your wallet.");
    setTone("loading");
    setHash(null);
    try {
      const nextHash = await pay({
        amount: request.amount,
        recipient: request.requester,
        source: "available",
      });
      setHash(nextHash);
      setMessage("Payment confirmed.");
      setTone("success");
    } catch (error) {
      setMessage(compactError(error, "Payment failed."));
      setTone("error");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 items-start px-4 py-8 sm:px-6 sm:py-12">
      <section className="glass-panel-strong w-full overflow-hidden rounded-xl border">
        <div className="border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#f2b84b]">
            <CircleDollarSign aria-hidden="true" size={16} />
            RippleFI payment request
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-white">
            Pay FXRP
          </h1>
        </div>

        {parseError ? (
          <div className="px-5 py-8">
            <FeedbackMessage tone="error">{parseError}</FeedbackMessage>
            <p className="mt-3 text-xs leading-5 text-[#68737d]">
              Ask the requester to generate a new RippleFI payment link.
            </p>
          </div>
        ) : !request ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-[#89939e]">
            <LoaderCircle className="animate-spin" size={17} />
            Loading payment request
          </div>
        ) : (
          <div className="p-5">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#68737d]">
                Requested amount
              </p>
              <p className="mt-2 font-mono text-3xl font-semibold text-white">
                {request.amount}
                <span className="ml-2 text-xs text-[#7d8790]">FXRP</span>
              </p>
              <p className="mt-1 text-xs text-[#68737d]">
                Requested on {request.chainId === 14 ? "Flare Mainnet" : "Coston2"}
              </p>
              <div className="mt-4 border-t border-white/[0.06] pt-3 text-xs">
                <p className="text-[#68737d]">Pay to</p>
                <p className="mt-1 font-mono text-[#cbd2d7]">
                  {shortAddress(request.requester)}
                </p>
                {request.note ? (
                  <>
                    <p className="mt-3 text-[#68737d]">Note</p>
                    <p className="mt-1 break-words text-[#cbd2d7]">
                      {request.note}
                    </p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-[#68737d]">
              <span>Available wallet FXRP</span>
              <span className="font-mono text-[#c5ccd1]">
                {vault.fxrpBalance} FXRP
              </span>
            </div>

            <button
              type="button"
              onClick={handlePay}
              disabled={!canPay}
              className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f2b84b] px-4 text-sm font-semibold text-[#171106] transition hover:bg-[#ffc965] disabled:cursor-not-allowed disabled:bg-[#342f24] disabled:text-[#777064]"
            >
              {isPaying ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Send aria-hidden="true" size={17} />
              )}
              {isPaying ? "Sending FXRP" : `Pay ${request.amount} FXRP`}
            </button>

            {!vault.isConnected ? (
              <p className="mt-2 text-center text-xs text-[#89939e]">
                Connect a wallet to pay this request.
              </p>
            ) : !isRequestNetwork ? (
              <p className="mt-2 text-center text-xs text-[#e9bd71]">
                Switch to {request.chainId === 14 ? "Flare Mainnet" : "Coston2"} to pay this request.
              </p>
            ) : vault.isCorrectChain && !hasEnoughBalance ? (
              <p className="mt-2 text-center text-xs text-[#e99191]">
                Your wallet does not have enough available FXRP.
              </p>
            ) : null}
            {message ? (
              <FeedbackMessage className="mt-3" tone={tone}>
                {message}
              </FeedbackMessage>
            ) : null}
            {hash ? (
              <a
                href={`${vault.chain.blockExplorers.default.url}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs text-[#71b9e6]"
              >
                View payment on {vault.chain.name}
                <ArrowUpRight aria-hidden="true" size={13} />
              </a>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
