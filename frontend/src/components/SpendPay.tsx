"use client";

import {
  ArrowUpRight,
  LoaderCircle,
  Send,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
  type Hash,
} from "viem";
import { useSpend, type PaymentSource } from "@/hooks/useSpend";
import type { VaultState } from "@/hooks/useVault";
import { FeedbackMessage, type FeedbackTone } from "@/components/FeedbackMessage";
import { compactError } from "@/lib/feedback";

function readError(error: unknown) {
  return compactError(error, "Payment failed.");
}

function exactBalance(value: bigint | undefined, decimals: number) {
  return formatUnits(value ?? 0n, decimals);
}

export function SpendPay({ vault }: { vault: VaultState }) {
  const [source, setSource] = useState<PaymentSource>("available");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<FeedbackTone>("info");
  const [transactionHash, setTransactionHash] = useState<Hash | null>(null);
  const [gasEstimate, setGasEstimate] = useState("");
  const [isEstimating, setIsEstimating] = useState(false);
  const { estimatePayment, isPaying, pay } = useSpend(vault);

  const selectedBalanceRaw =
    source === "available"
      ? (vault.fxrpBalanceRaw ?? 0n)
      : (vault.withdrawableAssetsRaw ?? 0n);
  const selectedBalance =
    source === "available" ? vault.fxrpBalance : vault.withdrawableAssets;

  const amountRaw = (() => {
    try {
      return parseUnits(amount || "0", vault.decimals);
    } catch {
      return 0n;
    }
  })();

  const recipientIsValid =
    isAddress(recipient.trim()) &&
    recipient.trim().toLowerCase() !== zeroAddress;
  const amountIsValid =
    amountRaw > 0n && amountRaw <= selectedBalanceRaw;
  const canPay =
    vault.isCorrectChain &&
    recipientIsValid &&
    amountIsValid &&
    !isPaying;

  useEffect(() => {
    if (!canPay) {
      return;
    }

    let cancelled = false;

    const timeout = window.setTimeout(async () => {
      setGasEstimate("");
      setIsEstimating(true);
      try {
        const estimate = await estimatePayment({
          recipient,
          amount,
          source,
        });
        if (!cancelled) {
          setGasEstimate(estimate?.label ?? "");
        }
      } catch {
        if (!cancelled) {
          setGasEstimate("Estimate unavailable");
        }
      } finally {
        if (!cancelled) {
          setIsEstimating(false);
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [amount, canPay, estimatePayment, recipient, source]);

  function selectSource(nextSource: PaymentSource) {
    setSource(nextSource);
    setAmount("");
    setMessage("");
    setTransactionHash(null);
  }

  function setMaxAmount() {
    setAmount(exactBalance(selectedBalanceRaw, vault.decimals));
    setMessage("");
    setTransactionHash(null);
  }

  async function handlePay() {
    setMessage("Confirm payment in your wallet.");
    setMessageTone("loading");
    setTransactionHash(null);

    try {
      const hash = await pay({ recipient, amount, source });
      setTransactionHash(hash);
      setAmount("");
      setMessage("Payment confirmed.");
      setMessageTone("success");
    } catch (error) {
      setMessage(readError(error));
      setMessageTone("error");
    }
  }

  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-[#080b0f]/30 p-4">
      <div className="mb-4 flex items-center gap-3 border-b border-white/[0.06] pb-4">
        <span className="flex size-9 items-center justify-center rounded-full border border-[#f2b84b]/18 bg-[#f2b84b]/[0.06] text-[#f2b84b]">
          <Send aria-hidden="true" size={16} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-white">Make a payment</h2>
          <p className="mt-0.5 text-[11px] text-[#68737d]">
            Choose the balance, recipient, and amount.
          </p>
        </div>
      </div>
      <span className="block text-xs font-medium text-[#89939e]">
        Pay from
      </span>
      <div className="mt-2 grid max-w-md grid-cols-2 rounded-lg border border-white/10 bg-[#080b0f]/85 p-1">
        <button
          type="button"
          onClick={() => selectSource("available")}
          aria-pressed={source === "available"}
          className={`flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium transition ${
            source === "available"
              ? "bg-[#1a2422] text-[#4de2ad]"
              : "text-[#7d8790] hover:text-white"
          }`}
        >
          Available
        </button>
        <button
          type="button"
          onClick={() => selectSource("vault")}
          aria-pressed={source === "vault"}
          className={`flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium transition ${
            source === "vault"
              ? "bg-[#172331] text-[#71b9e6]"
              : "text-[#7d8790] hover:text-white"
          }`}
        >
          Vault
        </button>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(14rem,0.7fr)]">
        <div className="min-w-0">
          <label
            htmlFor="payment-recipient"
            className="block text-xs font-medium text-[#89939e]"
          >
            Recipient address
          </label>
          <div
            className={`mt-2 flex h-12 items-center rounded-lg border bg-[#080b0f]/85 px-3 ${
              recipient && !recipientIsValid
                ? "border-[#df6b6b]/60"
                : "border-white/10"
            }`}
          >
            <input
              id="payment-recipient"
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setMessage("");
                setTransactionHash(null);
              }}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x..."
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[#3f4851]"
            />
          </div>
          {recipient && !recipientIsValid ? (
            <p className="mt-2 text-xs text-[#e99191]">
              Enter a valid non-zero address.
            </p>
          ) : null}

          <label
            htmlFor="payment-amount"
            className="mt-3 block text-xs font-medium text-[#89939e]"
          >
            Amount
          </label>
          <div className="mt-2 flex h-12 items-center rounded-lg border border-white/10 bg-[#080b0f]/85 px-3">
            <input
              id="payment-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setMessage("");
                setTransactionHash(null);
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-[#3f4851]"
            />
            <button
              type="button"
              onClick={setMaxAmount}
              className="mr-3 text-xs font-semibold text-[#f2b84b] hover:text-[#ffd079]"
            >
              MAX
            </button>
            <span className="text-sm text-[#7d8790]">FXRP</span>
          </div>
          <div className="mt-2 flex justify-between gap-4 text-xs text-[#68737d]">
            <span>
              {source === "available" ? "Using available" : "Using vault"}
            </span>
            <span>{selectedBalance} FXRP</span>
          </div>
          {amountRaw > selectedBalanceRaw ? (
            <p className="mt-2 text-xs text-[#e99191]">
              Amount exceeds the selected balance.
            </p>
          ) : null}
        </div>

        <div className="border-t border-white/10 pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-[#89939e]">Estimated gas</span>
            <span className="text-right text-[#c6cdd3]">
              {!canPay
                ? "Enter payment"
                : isEstimating
                  ? "Estimating..."
                  : gasEstimate || "Estimate unavailable"}
            </span>
          </div>

          <div className="mt-3 border-t border-white/10 pt-3 text-xs leading-5 text-[#68737d]">
            {source === "vault"
              ? "FXRP is withdrawn from your vault directly to the recipient in one transaction."
              : "FXRP is transferred directly from your available wallet balance."}
          </div>

          <button
            type="button"
            onClick={handlePay}
            disabled={!canPay}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f2b84b] px-4 text-sm font-semibold text-[#171106] transition hover:bg-[#ffc965] disabled:cursor-not-allowed disabled:bg-[#342f24] disabled:text-[#777064]"
          >
            {isPaying ? (
              <LoaderCircle
                className="animate-spin"
                aria-hidden="true"
                size={18}
              />
            ) : (
              <Send aria-hidden="true" size={18} />
            )}
            {isPaying
              ? source === "vault"
                ? "Withdrawing and sending"
                : "Sending FXRP"
              : "Pay FXRP"}
          </button>

          <div className="mt-2 min-h-8 text-xs leading-5">
            {message ? (
              <FeedbackMessage tone={messageTone}>
                {message}
              </FeedbackMessage>
            ) : null}
            {transactionHash ? (
              <a
                href={`${vault.chain.blockExplorers.default.url}/tx/${transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[#71b9e6] hover:text-[#9bd3f5]"
              >
                View transaction
                <ArrowUpRight aria-hidden="true" size={14} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
