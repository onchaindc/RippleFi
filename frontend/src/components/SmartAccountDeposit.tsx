"use client";

import {
  ArrowUpRight,
  Circle,
  CircleCheckBig,
  CircleDashed,
  Copy,
  LoaderCircle,
  RotateCcw,
  ScanSearch,
  Smartphone,
  Network,
} from "lucide-react";
import { useState } from "react";
import { FeedbackMessage, type FeedbackTone } from "@/components/FeedbackMessage";
import { useSmartAccountDepositFlow } from "@/hooks/useSmartAccountDepositFlow";
import type { VaultState } from "@/hooks/useVault";
import { compactError, productErrorMessage } from "@/lib/feedback";
import { useSmartAccount } from "@/hooks/useSmartAccount";
import type { SmartDepositInstruction } from "@/lib/smartAccounts";
import {
  getSystemsExplorerUrl,
  getXrplExplorerUrl,
} from "@/lib/networks";

function readError(error: unknown) {
  return compactError(error, "Smart Account request failed.");
}

function shorten(value: string, start = 8, end = 6) {
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function FlowSummary({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="font-mono text-[10px] text-[#8d7954]">{number}</span>
      <span className="text-[#88939c]">{text}</span>
    </div>
  );
}

const flowSteps = [
  {
    phases: ["creating-signature", "waiting-signature"],
    title: "Sign in Xaman",
  },
  {
    phases: ["xrpl-submitted", "waiting-xrpl-finality"],
    title: "Confirm on XRPL",
  },
  {
    phases: ["waiting-fdc", "waiting-executor"],
    title: "Executor mint + deposit",
  },
  {
    phases: ["success"],
    title: "Deposit complete",
  },
] as const;

export function SmartAccountDeposit({ vault }: { vault: VaultState }) {
  const smartAccount = useSmartAccount(vault);
  const [xrplAddress, setXrplAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<FeedbackTone>("info");
  const [instruction, setInstruction] =
    useState<SmartDepositInstruction | null>(null);
  const [copied, setCopied] = useState("");
  const depositFlow = useSmartAccountDepositFlow({
    onSuccess: async () => {
      await smartAccount.resolveAccount(xrplAddress);
    },
  });

  async function handleResolve() {
    setMessage("Resolving account...");
    setMessageTone("loading");
    setInstruction(null);
    depositFlow.reset();
    try {
      await smartAccount.resolveAccount(xrplAddress);
      setMessage("Account resolved.");
      setMessageTone("success");
    } catch (error) {
      setMessage(readError(error));
      setMessageTone("error");
    }
  }

  function handlePrepare() {
    setMessage("");
    setMessageTone("info");
    depositFlow.reset();
    try {
      const nextInstruction = smartAccount.prepareDeposit({ amount });
      setInstruction(nextInstruction);
    } catch (error) {
      setInstruction(null);
      setMessage(readError(error));
      setMessageTone("error");
    }
  }

  async function handleStartDeposit() {
    if (!instruction) return;
    await depositFlow.start({ instruction, xrplAddress });
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  const details = smartAccount.details;
  const currentStep = flowSteps.findIndex((step) =>
    (step.phases as readonly string[]).includes(depositFlow.state.phase),
  );

  return (
    <section
      aria-labelledby="smart-account-heading"
      className="glass-panel-strong mt-6 min-w-0 overflow-hidden rounded-2xl border border-[#f2b84b]/15"
    >
      <div className="grid w-full min-w-0 gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-8">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f2b84b]">
            <Network aria-hidden="true" size={15} />
            XRPL deposit
          </div>
          <h2
            id="smart-account-heading"
            className="mt-2 text-2xl font-semibold tracking-[-0.025em]"
          >
            Deposit with Xaman
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-[#8f9aa3]">
            Sign one XRP payment. RippleFI verifies it, mints FXRP, and deposits
            it into your Personal Account.
          </p>

          <div className="mt-6 space-y-3 border-t border-white/[0.06] pt-5">
            <FlowSummary number="01" text="Resolve your XRPL address" />
            <FlowSummary number="02" text="Review and sign in Xaman" />
            <FlowSummary number="03" text="Receive FXRP in RippleFI" />
          </div>
        </div>

        <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-white/[0.07] bg-black/10 p-4 sm:p-5">
          <label
            htmlFor="xrpl-owner"
            className="block text-xs font-medium text-[#89939e]"
          >
            XRPL classic address
          </label>
          <div className="mt-2 flex min-h-14 items-center gap-2 rounded-lg border border-white/10 bg-[#080b0f] px-3">
            <input
              id="xrpl-owner"
              value={xrplAddress}
              onChange={(event) => {
                setXrplAddress(event.target.value);
                setInstruction(null);
                setMessage("");
                depositFlow.reset();
              }}
              disabled={depositFlow.isActive}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="r..."
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[#3f4851]"
            />
            <button
              type="button"
              onClick={handleResolve}
              disabled={smartAccount.isLoading || depositFlow.isActive}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-[#f2b84b]/35 bg-[#2a2110] px-3 text-xs font-semibold text-[#f4cd7d] transition hover:border-[#f2b84b]/60 disabled:opacity-60"
            >
              {smartAccount.isLoading ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin"
                  size={16}
                />
              ) : (
                <ScanSearch aria-hidden="true" size={16} />
              )}
              Resolve
            </button>
          </div>

          {details ? (
            <div className="mt-4 grid min-w-0 gap-3 rounded-lg border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[#68737d]">Personal Account</p>
                <a
                  href={`${vault.chain.blockExplorers.default.url}/address/${details.personalAccount}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-[#71b9e6] hover:text-[#9bd3f5]"
                >
                  {shorten(details.personalAccount)}
                  <ArrowUpRight aria-hidden="true" size={13} />
                </a>
              </div>
              <div>
                <p className="text-xs text-[#68737d]">Account state</p>
                <p className="mt-1 text-xs text-[#c9d0d5]">
                  {details.deployed ? "Deployed" : "Predicted, not deployed"}
                  {" / "}Nonce {details.nonce.toString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#68737d]">Smart FXRP</p>
                <p className="mt-1 text-sm text-white">
                  {smartAccount.formatBalance(details.fxrpBalance)} FXRP
                </p>
              </div>
              <div>
                <p className="text-xs text-[#68737d]">RippleFI position</p>
                <p className="mt-1 text-sm text-white">
                  {smartAccount.formatBalance(details.vaultAssets)} FXRP
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-[#68737d]">Direct-mint route</p>
                <p className="mt-1 min-w-0 break-words font-mono text-xs text-[#c9d0d5] [overflow-wrap:anywhere]">
                  {details.directMintPaymentAddress ||
                    "Core Vault address unavailable"}
                </p>
                <p className="mt-1 text-xs text-[#68737d]">
                  Protocol executor fee:{" "}
                  {smartAccount.formatBalance(details.directMintExecutorFee)}{" "}
                  FXRP
                </p>
              </div>
            </div>
          ) : null}

          <label
            htmlFor="smart-deposit-amount"
            className="mt-5 block text-xs font-medium text-[#89939e]"
          >
            Deposit amount
          </label>
          <div className="mt-2 flex h-14 items-center rounded-lg border border-white/10 bg-[#080b0f] px-3">
            <input
              id="smart-deposit-amount"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setInstruction(null);
                setMessage("");
                depositFlow.reset();
              }}
              disabled={depositFlow.isActive}
              inputMode="decimal"
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent text-xl outline-none placeholder:text-[#3f4851]"
            />
            <span className="text-sm text-[#7d8790]">FXRP</span>
          </div>

          <button
            type="button"
            onClick={handlePrepare}
            disabled={!details || !amount || depositFlow.isActive}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#4de2ad] px-4 text-sm font-semibold text-[#07100d] transition hover:bg-[#6ceaba] disabled:cursor-not-allowed disabled:bg-[#26332f] disabled:text-[#6f817a]"
          >
            <Network aria-hidden="true" size={17} />
            Review smart deposit
          </button>

          {instruction ? (
            <div className="mt-4 grid min-w-0 max-w-full gap-2 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  copyValue("memo", instruction.memoDataForXrpl)
                }
                className="flex min-h-12 w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-white/10 bg-[#080b0f] px-3 text-left"
              >
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block text-xs text-[#68737d]">
                    XRPL MemoData (0xFE)
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[#d6dce0]">
                    {instruction.memoDataForXrpl}
                  </span>
                </span>
                <Copy
                  aria-hidden="true"
                  className="shrink-0 text-[#89939e]"
                  size={16}
                />
              </button>
              <button
                type="button"
                onClick={() =>
                  copyValue("userop", instruction.userOperationData)
                }
                className="flex min-h-12 w-full min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden rounded-lg border border-white/10 bg-[#080b0f] px-3 text-left"
              >
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block text-xs text-[#68737d]">
                    Executor UserOp payload
                  </span>
                  <span className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[#d6dce0]">
                    {instruction.userOperationData}
                  </span>
                </span>
                <Copy
                  aria-hidden="true"
                  className="shrink-0 text-[#89939e]"
                  size={16}
                />
              </button>
              <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#f2b84b]/20 bg-[#17130b] px-3 py-3">
                <p className="text-xs text-[#a79269]">
                  XRP payment required
                </p>
                <p className="mt-1 text-sm font-semibold text-[#f4cd7d]">
                  {smartAccount.formatBalance(instruction.paymentAmountRaw)} XRP
                </p>
                <div className="mt-2 grid gap-1 text-xs text-[#7d745f] sm:grid-cols-3">
                  <span>
                    Deposit {smartAccount.formatBalance(instruction.amountRaw)}
                  </span>
                  <span>
                    Mint fee{" "}
                    {smartAccount.formatBalance(
                      instruction.directMintingFee,
                    )}
                  </span>
                  <span>
                    Executor{" "}
                    {smartAccount.formatBalance(
                      instruction.directMintingExecutorFee,
                    )}
                  </span>
                </div>
              </div>
              {copied ? (
                <p className="text-xs text-[#82e8c2]">
                  Copied {copied === "memo" ? "memo data" : "UserOp payload"}.
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleStartDeposit}
                disabled={depositFlow.isActive}
                className="mt-2 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#f2b84b] px-4 text-sm font-semibold text-[#161005] transition hover:bg-[#f6c96e] disabled:cursor-wait disabled:bg-[#40351f] disabled:text-[#8f8060]"
              >
                {depositFlow.isActive ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                    size={17}
                  />
                ) : (
                  <Smartphone aria-hidden="true" size={17} />
                )}
                Sign and deposit with Xaman
              </button>
            </div>
          ) : null}

          {depositFlow.state.phase !== "idle" ? (
            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {flowSteps.map((step, index) => {
                  const complete =
                    depositFlow.state.phase === "success" ||
                    (currentStep >= 0 && index < currentStep);
                  const active = index === currentStep;
                  return (
                    <div key={step.title} className="flex items-center gap-2">
                      {complete ? (
                        <CircleCheckBig
                          aria-hidden="true"
                          className="shrink-0 text-[#4de2ad]"
                          size={17}
                        />
                      ) : active ? (
                        <CircleDashed
                          aria-hidden="true"
                          className="shrink-0 animate-spin text-[#f2b84b]"
                          size={17}
                        />
                      ) : (
                        <Circle
                          aria-hidden="true"
                          className="shrink-0 text-[#3f4851]"
                          size={17}
                        />
                      )}
                      <span
                        className={`text-xs ${
                          complete
                            ? "text-[#82e8c2]"
                            : active
                              ? "text-[#f4cd7d]"
                              : "text-[#68737d]"
                        }`}
                      >
                        {step.title}
                      </span>
                    </div>
                  );
                })}
              </div>

              <FeedbackMessage
                className="mt-4"
                tone={
                  depositFlow.state.phase === "failed"
                    ? "error"
                    : depositFlow.state.phase === "success"
                      ? "success"
                      : "loading"
                }
              >
                {depositFlow.state.phase === "failed"
                  ? productErrorMessage(
                      depositFlow.state.message,
                      "Smart Account action couldn't be completed. Please try again.",
                    )
                  : depositFlow.state.message}
                {depositFlow.state.confirmations !== undefined ? (
                  <span className="ml-1 text-[#d6dce0]">
                    {depositFlow.state.confirmations}/
                    {depositFlow.state.requiredConfirmations ?? 3}
                  </span>
                ) : null}
              </FeedbackMessage>

              {depositFlow.state.phase === "waiting-signature" ? (
                <div className="mt-4 grid items-center gap-4 sm:grid-cols-[112px_minmax(0,1fr)]">
                  {depositFlow.state.qrPng ? (
                    // Xaman returns a short-lived QR image for this exact payload.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={depositFlow.state.qrPng}
                      alt="Xaman signing QR code"
                      className="size-28 rounded-md bg-white p-1"
                    />
                  ) : null}
                  <div>
                    <p className="text-xs leading-5 text-[#89939e]">
                      Scan with Xaman on another device, or open the signing
                      request directly on this phone.
                    </p>
                    {depositFlow.state.deeplink ? (
                      <a
                        href={depositFlow.state.deeplink}
                        className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-[#f2b84b]/35 px-3 text-xs font-semibold text-[#f4cd7d]"
                      >
                        <Smartphone aria-hidden="true" size={15} />
                        Open Xaman
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3 text-xs">
                {depositFlow.state.xrplTransactionHash ? (
                  <a
                    href={`${getXrplExplorerUrl(vault.chainId)}/transactions/${depositFlow.state.xrplTransactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#71b9e6] hover:text-[#9bd3f5]"
                  >
                    XRPL transaction
                    <ArrowUpRight aria-hidden="true" size={13} />
                  </a>
                ) : null}
                {depositFlow.state.roundId !== undefined ? (
                  <a
                    href={`${getSystemsExplorerUrl(vault.chainId)}/voting-round/${depositFlow.state.roundId}?tab=fdc`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#71b9e6] hover:text-[#9bd3f5]"
                  >
                    FDC round {depositFlow.state.roundId}
                    <ArrowUpRight aria-hidden="true" size={13} />
                  </a>
                ) : null}
                {depositFlow.state.flareTransactionHash ? (
                  <a
                    href={`${vault.chain.blockExplorers.default.url}/tx/${depositFlow.state.flareTransactionHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[#71b9e6] hover:text-[#9bd3f5]"
                  >
                    {vault.chain.name} execution
                    <ArrowUpRight aria-hidden="true" size={13} />
                  </a>
                ) : null}
              </div>

              {["failed", "success"].includes(depositFlow.state.phase) ? (
                <button
                  type="button"
                  onClick={depositFlow.reset}
                  className="mt-4 inline-flex h-9 items-center gap-2 text-xs text-[#89939e] hover:text-white"
                >
                  <RotateCcw aria-hidden="true" size={14} />
                  Start another deposit
                </button>
              ) : null}
            </div>
          ) : null}

          {message && !instruction ? (
            <FeedbackMessage className="mt-3" tone={messageTone}>
              {message}
            </FeedbackMessage>
          ) : (
            <div className="mt-3 min-h-8" />
          )}
        </div>
      </div>
    </section>
  );
}
