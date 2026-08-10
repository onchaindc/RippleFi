import { NextResponse } from "next/server";
import { type Hex } from "viem";
import {
  assertJobMatchesUserOperation,
  executeSmartDeposit,
  isFdcRoundFinalized,
  retrieveXrpPaymentProof,
  verifySmartDepositJobToken,
  verifyXrplSmartDepositPayment,
} from "@/lib/smartAccountServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExecutorStatusBody = {
  abiEncodedRequest?: string;
  jobToken?: string;
  roundId?: number;
  userOperationData?: string;
  xrplTransactionHash?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Executor status failed.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExecutorStatusBody;
    if (
      !body.abiEncodedRequest ||
      !body.jobToken ||
      !Number.isInteger(body.roundId) ||
      !body.userOperationData ||
      !body.xrplTransactionHash
    ) {
      return NextResponse.json(
        { error: "Executor status request is incomplete." },
        { status: 400 },
      );
    }

    const claims = verifySmartDepositJobToken(body.jobToken);
    const userOperationData = body.userOperationData as Hex;
    const abiEncodedRequest = body.abiEncodedRequest as Hex;
    assertJobMatchesUserOperation(claims, userOperationData);
    await verifyXrplSmartDepositPayment({
      claims,
      xrplTransactionHash: body.xrplTransactionHash,
    });

    const roundId = body.roundId as number;
    const finalized = await isFdcRoundFinalized(claims.chainId, roundId);
    if (!finalized) {
      return NextResponse.json(
        { roundId, status: "waiting-fdc-round" },
        { status: 202 },
      );
    }

    const proof = await retrieveXrpPaymentProof({
      abiEncodedRequest,
      chainId: claims.chainId,
      roundId,
    });
    if (!proof) {
      return NextResponse.json(
        { roundId, status: "waiting-fdc-proof" },
        { status: 202 },
      );
    }

    const transactionId =
      `0x${body.xrplTransactionHash.replace(/^0x/, "")}` as Hex;
    const result = await executeSmartDeposit({
      claims,
      proof,
      transactionId,
      userOperationData,
    });
    return NextResponse.json({
      alreadyExecuted: result.alreadyExecuted,
      flareTransactionHash: result.flareTransactionHash,
      status: "success",
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}
