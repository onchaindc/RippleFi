import { NextResponse } from "next/server";
import { type Hex } from "viem";
import {
  assertJobMatchesUserOperation,
  prepareXrpPaymentAttestation,
  verifySmartDepositJobToken,
  verifyXrplSmartDepositPayment,
} from "@/lib/smartAccountServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExecutorPrepareBody = {
  jobToken?: string;
  userOperationData?: string;
  xrplTransactionHash?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Executor request failed.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecutorPrepareBody;
    if (
      !body.jobToken ||
      !body.userOperationData ||
      !body.xrplTransactionHash
    ) {
      return NextResponse.json(
        { error: "Executor request is incomplete." },
        { status: 400 },
      );
    }

    const claims = verifySmartDepositJobToken(body.jobToken);
    const userOperationData = body.userOperationData as Hex;
    assertJobMatchesUserOperation(claims, userOperationData);

    const payment = await verifyXrplSmartDepositPayment({
      claims,
      xrplTransactionHash: body.xrplTransactionHash,
    });
    if (!payment.ready) {
      return NextResponse.json(
        {
          confirmations: payment.confirmations,
          requiredConfirmations: payment.requiredConfirmations,
          status: "waiting-xrpl-finality",
          validated: payment.validated,
        },
        { status: 202 },
      );
    }

    const transactionId = `0x${payment.hash}` as Hex;
    const attestation = await prepareXrpPaymentAttestation({
      chainId: claims.chainId,
      transactionId,
    });
    return NextResponse.json({
      abiEncodedRequest: attestation.abiEncodedRequest,
      fdcRequestTransactionHash: attestation.requestTxHash,
      roundId: attestation.roundId,
      status: "fdc-requested",
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}
