"use client";

import { Check, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { FeedbackMessage } from "@/components/FeedbackMessage";
import type { VaultState } from "@/hooks/useVault";
import { compactError } from "@/lib/feedback";
import { encodePaymentRequest } from "@/lib/paymentLinks";

export function PaymentRequestCreator({ vault }: { vault: VaultState }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function createLink() {
    setError("");
    if (!vault.address) {
      setError("Connect your wallet to create a payment request.");
      return;
    }
    try {
      const amountRaw = parseUnits(amount, vault.decimals);
      if (amountRaw <= 0n) {
        throw new Error("Enter an amount greater than zero.");
      }
      const id = encodePaymentRequest({
        amount: formatUnits(amountRaw, vault.decimals),
        chainId: vault.chainId,
        note: note.trim(),
        requester: vault.address,
      });
      setLink(`${window.location.origin}/pay/${id}`);
    } catch (cause) {
      setLink("");
      setError(compactError(cause, "Enter a valid FXRP amount."));
    }
  }

  async function shareLink() {
    if (!link) return;
    if (navigator.share) {
      await navigator.share({
        text: note.trim() || `Pay ${amount} FXRP with RippleFI`,
        title: "RippleFI payment request",
        url: link,
      });
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="mt-4 rounded-xl border border-white/[0.06] bg-[#080b0f]/30 p-4">
      <div className="flex items-center gap-2">
        <Link2 aria-hidden="true" className="text-[#71b9e6]" size={16} />
        <div>
          <h2 className="text-sm font-semibold text-white">Request money</h2>
          <p className="mt-0.5 text-[10px] text-[#68737d]">
            Create a shareable FXRP payment link. No account or storage needed.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[0.55fr_1fr]">
        <label className="min-w-0 text-xs text-[#89939e]">
          Amount
          <div className="mt-1.5 flex h-11 items-center rounded-lg border border-white/10 bg-[#080b0f]/85 px-3">
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setLink("");
                setError("");
              }}
              inputMode="decimal"
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[#3f4851]"
            />
            <span className="text-[11px] text-[#68737d]">FXRP</span>
          </div>
        </label>
        <label className="min-w-0 text-xs text-[#89939e]">
          Note <span className="text-[#59636c]">(optional)</span>
          <div className="mt-1.5 flex h-11 items-center rounded-lg border border-white/10 bg-[#080b0f]/85 px-3">
            <input
              value={note}
              onChange={(event) => {
                setNote(event.target.value.slice(0, 120));
                setLink("");
              }}
              placeholder="Dinner, invoice, contribution..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#3f4851]"
            />
          </div>
        </label>
      </div>

      <button
        type="button"
        onClick={createLink}
        className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[#71b9e6]/30 bg-[#71b9e6]/[0.06] px-3 text-xs font-semibold text-[#a7d9f5] transition hover:border-[#71b9e6]/55"
      >
        <Link2 aria-hidden="true" size={14} />
        Generate payment link
      </button>

      {link ? (
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-[#4de2ad]/20 bg-[#4de2ad]/[0.035] p-2">
          <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-[#9bb4aa]">
            {link}
          </p>
          <button
            type="button"
            onClick={shareLink}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#4de2ad]/25 px-2.5 text-[10px] font-semibold text-[#82e8c2]"
          >
            {copied ? (
              <Check aria-hidden="true" size={13} />
            ) : (
              <Share2 aria-hidden="true" size={13} />
            )}
            {copied ? "Copied" : "Share"}
          </button>
        </div>
      ) : null}
      {error ? (
        <FeedbackMessage className="mt-3" tone="error">
          {error}
        </FeedbackMessage>
      ) : null}
    </section>
  );
}
