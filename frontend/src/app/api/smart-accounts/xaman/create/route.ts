import { NextResponse } from "next/server";
import { isAddress, keccak256, type Address, type Hex } from "viem";
import {
  calculateDirectMintPayment,
  createSmartDepositJobToken,
  getDirectMintSettings,
} from "@/lib/smartAccountServer";
import { isLikelyClassicXrplAddress } from "@/lib/smartAccounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreatePayloadBody = {
  action?: "deposit" | "spend";
  chainId?: number;
  depositAmountRaw?: string;
  memoData?: string;
  nonce?: string;
  personalAccount?: string;
  userOperationData?: string;
  xrplAddress?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Xaman request failed.";
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.XAMAN_API_KEY?.trim();
    const apiSecret = process.env.XAMAN_API_SECRET?.trim();
    if (!apiKey || !apiSecret) {
      throw new Error("Xaman API credentials are not configured.");
    }

    const body = (await request.json()) as CreatePayloadBody;
    const xrplAddress = body.xrplAddress?.trim() || "";
    const memoData = body.memoData?.trim().toUpperCase() || "";
    const userOperationData = body.userOperationData?.trim() as Hex;
    const personalAccount = body.personalAccount?.trim() as Address;
    const nonce = body.nonce?.trim() || "";
    const depositAmountRaw = body.depositAmountRaw?.trim() || "";
    const action = body.action === "spend" ? "spend" : "deposit";
    const chainId = body.chainId;
    if (chainId !== 14 && chainId !== 114) {
      return NextResponse.json(
        { error: "Smart Account network is unsupported." },
        { status: 400 },
      );
    }

    if (!isLikelyClassicXrplAddress(xrplAddress)) {
      return NextResponse.json(
        { error: "Enter a valid XRPL classic address." },
        { status: 400 },
      );
    }
    if (!isAddress(personalAccount)) {
      return NextResponse.json(
        { error: "Personal Account address is invalid." },
        { status: 400 },
      );
    }
    if (!/^\d+$/.test(nonce) || !/^\d+$/.test(depositAmountRaw)) {
      return NextResponse.json(
        { error: "Deposit amount or nonce is invalid." },
        { status: 400 },
      );
    }
    if (
      !/^[0-9A-F]{84}$/.test(memoData) ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(userOperationData)
    ) {
      return NextResponse.json(
        { error: "Smart Account memo or UserOp is invalid." },
        { status: 400 },
      );
    }
    if (!/^0{16}$/.test(memoData.slice(4, 20))) {
      return NextResponse.json(
        {
          error:
            "RippleFI self-execution requires a zero memo executor fee.",
        },
        { status: 400 },
      );
    }

    const userOperationHash = keccak256(userOperationData);
    if (
      memoData.slice(20).toLowerCase() !==
      userOperationHash.slice(2).toLowerCase()
    ) {
      return NextResponse.json(
        { error: "UserOp does not match the XRPL memo commitment." },
        { status: 400 },
      );
    }

    const depositAmount = BigInt(depositAmountRaw);
    if (depositAmount <= 0n) {
      return NextResponse.json(
        { error: "Deposit amount must be greater than zero." },
        { status: 400 },
      );
    }

    const settings = await getDirectMintSettings(chainId);
    const quote = calculateDirectMintPayment(depositAmount, settings);
    const amountDrops = quote.paymentAmount.toString();
    const xamanResponse = await fetch(
      "https://xumm.app/api/v1/platform/payload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "x-api-secret": apiSecret,
        },
        body: JSON.stringify({
          custom_meta: {
            instruction:
              action === "spend"
                ? "RippleFI Smart Account payment authorization"
                : "RippleFI Smart Account vault deposit",
          },
          options: {
            expire: 10,
            submit: true,
          },
          txjson: {
            Account: xrplAddress,
            Amount: amountDrops,
            Destination: settings.paymentAddress,
            Memos: [{ Memo: { MemoData: memoData } }],
            TransactionType: "Payment",
          },
        }),
        cache: "no-store",
      },
    );
    const payload = (await xamanResponse.json()) as {
      error?: { reference?: string };
      next?: { always?: string };
      refs?: { qr_png?: string };
      uuid?: string;
    };
    if (!xamanResponse.ok || !payload.uuid) {
      return NextResponse.json(
        {
          error:
            payload.error?.reference || "Failed to create Xaman payload.",
        },
        { status: xamanResponse.status || 502 },
      );
    }

    const jobToken = createSmartDepositJobToken({
      amountDrops,
      chainId,
      memoData,
      nonce,
      personalAccount,
      userOperationHash,
      xrplAddress,
    });

    return NextResponse.json({
      deeplink:
        payload.next?.always || `https://xumm.app/sign/${payload.uuid}`,
      directMintingExecutorFee: settings.executorFee.toString(),
      jobToken,
      mintingFee: quote.mintingFee.toString(),
      paymentAmountDrops: amountDrops,
      qrPng: payload.refs?.qr_png || null,
      uuid: payload.uuid,
    });
  } catch (error) {
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 },
    );
  }
}
