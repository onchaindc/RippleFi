"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SmartAccountInstruction } from "@/lib/smartAccounts";
import { compactError } from "@/lib/feedback";

export type SmartDepositPhase =
  | "idle"
  | "creating-signature"
  | "waiting-signature"
  | "xrpl-submitted"
  | "waiting-xrpl-finality"
  | "waiting-fdc"
  | "waiting-executor"
  | "success"
  | "failed";

export type SmartDepositFlowState = {
  confirmations?: number;
  deeplink?: string;
  error?: string;
  fdcRequestTransactionHash?: string;
  flareTransactionHash?: string | null;
  message: string;
  paymentAmountDrops?: string;
  phase: SmartDepositPhase;
  qrPng?: string | null;
  requiredConfirmations?: number;
  roundId?: number;
  xrplTransactionHash?: string;
};

type XamanCreateResponse = {
  deeplink: string;
  error?: string;
  jobToken: string;
  paymentAmountDrops: string;
  qrPng: string | null;
  uuid: string;
};

type XamanPayloadResponse = {
  error?: string;
  meta?: {
    cancelled?: boolean;
    expired?: boolean;
    signed?: boolean;
  };
  response?: {
    account?: string;
    txid?: string;
  };
};

const initialState: SmartDepositFlowState = {
  message: "",
  phase: "idle",
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown) {
  return compactError(error, "Smart Account action failed.");
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok && response.status !== 202) {
    throw new Error(body.error || "Smart Account request failed.");
  }
  return body;
}

function isMobileBrowser() {
  return (
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

export function useSmartAccountDepositFlow({
  onSuccess,
}: {
  onSuccess?: () => Promise<void> | void;
} = {}) {
  const [state, setState] = useState<SmartDepositFlowState>(initialState);
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState(initialState);
  }, []);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  const start = useCallback(
    async ({
      instruction,
      xrplAddress,
    }: {
      instruction: SmartAccountInstruction;
      xrplAddress: string;
    }) => {
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const isActive = () => runIdRef.current === runId;
      const actionLabel =
        instruction.action === "spend" ? "payment" : "deposit";

      setState({
        message: "Creating Xaman request...",
        phase: "creating-signature",
      });

      try {
        const createResponse = await fetch(
          "/api/smart-accounts/xaman/create",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: instruction.action,
              chainId: instruction.chainId,
              depositAmountRaw: instruction.authorizationMintRaw.toString(),
              memoData: instruction.memoDataForXrpl,
              nonce: instruction.nonce.toString(),
              personalAccount: instruction.personalAccount,
              userOperationData: instruction.userOperationData,
              xrplAddress,
            }),
          },
        );
        const payload = await readResponse<XamanCreateResponse>(
          createResponse,
        );
        if (!isActive()) return;

        setState({
          deeplink: payload.deeplink,
          message: "Approve in Xaman.",
          paymentAmountDrops: payload.paymentAmountDrops,
          phase: "waiting-signature",
          qrPng: payload.qrPng,
        });

        if (isMobileBrowser()) {
          window.location.assign(payload.deeplink);
        }

        let xrplTransactionHash = "";
        for (let attempt = 0; attempt < 200 && isActive(); attempt += 1) {
          const statusResponse = await fetch(
            `/api/smart-accounts/xaman/payload/${payload.uuid}`,
            { cache: "no-store" },
          );
          const xamanStatus =
            await readResponse<XamanPayloadResponse>(statusResponse);

          if (xamanStatus.meta?.signed && xamanStatus.response?.txid) {
            if (
              xamanStatus.response.account &&
              xamanStatus.response.account !== xrplAddress
            ) {
              throw new Error(
                "The Xaman signer did not match the resolved XRPL address.",
              );
            }
            xrplTransactionHash = xamanStatus.response.txid;
            setState((current) => ({
              ...current,
              message: "XRPL submitted. Waiting for validation.",
              phase: "xrpl-submitted",
              xrplTransactionHash,
            }));
            break;
          }
          if (xamanStatus.meta?.expired || xamanStatus.meta?.cancelled) {
            throw new Error("The Xaman signing request expired or was cancelled.");
          }
          await wait(3_000);
        }

        if (!xrplTransactionHash) {
          throw new Error("Timed out waiting for the Xaman signature.");
        }

        let abiEncodedRequest = "";
        let roundId = 0;
        for (let attempt = 0; attempt < 120 && isActive(); attempt += 1) {
          const prepareResponse = await fetch(
            "/api/smart-accounts/executor/prepare",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jobToken: payload.jobToken,
                userOperationData: instruction.userOperationData,
                xrplTransactionHash,
              }),
            },
          );
          const executorPrepare = await readResponse<{
            abiEncodedRequest?: string;
            confirmations?: number;
            error?: string;
            fdcRequestTransactionHash?: string;
            requiredConfirmations?: number;
            roundId?: number;
            status: string;
          }>(prepareResponse);

          if (executorPrepare.status === "fdc-requested") {
            if (
              !executorPrepare.abiEncodedRequest ||
              executorPrepare.roundId === undefined
            ) {
              throw new Error("Executor returned an incomplete FDC request.");
            }
            abiEncodedRequest = executorPrepare.abiEncodedRequest;
            roundId = executorPrepare.roundId;
            setState((current) => ({
              ...current,
              fdcRequestTransactionHash:
                executorPrepare.fdcRequestTransactionHash,
              message: "FDC request submitted.",
              phase: "waiting-fdc",
              roundId,
            }));
            break;
          }

          setState((current) => ({
            ...current,
            confirmations: executorPrepare.confirmations,
            message: "Waiting for XRPL confirmation.",
            phase: "waiting-xrpl-finality",
            requiredConfirmations: executorPrepare.requiredConfirmations,
          }));
          await wait(5_000);
        }

        if (!abiEncodedRequest) {
          throw new Error("Timed out waiting for XRPL finality.");
        }

        for (let attempt = 0; attempt < 120 && isActive(); attempt += 1) {
          const executorResponse = await fetch(
            "/api/smart-accounts/executor/status",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                abiEncodedRequest,
                jobToken: payload.jobToken,
                roundId,
                userOperationData: instruction.userOperationData,
                xrplTransactionHash,
              }),
            },
          );
          const executorStatus = await readResponse<{
            error?: string;
            flareTransactionHash?: string | null;
            status: string;
          }>(executorResponse);

          if (executorStatus.status === "success") {
            setState((current) => ({
              ...current,
              flareTransactionHash:
                executorStatus.flareTransactionHash || null,
              message:
                instruction.action === "spend"
                  ? "Smart Account payment complete."
                  : "Deposit complete.",
              phase: "success",
            }));
            await onSuccess?.();
            return;
          }

          setState((current) => ({
            ...current,
            message:
              executorStatus.status === "waiting-fdc-proof"
                ? `FDC proof ready. Executing ${actionLabel}.`
                : "Waiting for FDC finality.",
            phase:
              executorStatus.status === "waiting-fdc-proof"
                ? "waiting-executor"
                : "waiting-fdc",
          }));
          await wait(10_000);
        }

        throw new Error(
          `Timed out waiting for Smart Account ${actionLabel}.`,
        );
      } catch (error) {
        if (!isActive()) return;
        setState((current) => ({
          ...current,
          error: errorMessage(error),
          message: errorMessage(error),
          phase: "failed",
        }));
      }
    },
    [onSuccess],
  );

  return {
    isActive: !["idle", "success", "failed"].includes(state.phase),
    reset,
    start,
    state,
  };
}
