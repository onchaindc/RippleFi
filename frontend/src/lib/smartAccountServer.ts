import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  http,
  isAddress,
  keccak256,
  parseEventLogs,
  toHex,
  type AbiParameter,
  type Address,
  type ContractFunctionArgs,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  assetManagerAbi,
  getNetworkContracts,
  masterAccountControllerAbi,
} from "@/lib/contracts";
import {
  coston2,
  flare,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";
import {
  iDirectMintingAbi,
  iFdcHubAbi,
  iFdcRequestFeeConfigurationsAbi,
  iFdcVerificationAbi,
  iFlareSystemsManagerAbi,
  iRelayAbi,
  ixrpPaymentVerificationAbi,
} from "@/lib/flarePeripheryAbis";
import { isLikelyClassicXrplAddress } from "@/lib/smartAccounts";

const FLARE_CONTRACT_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as Address;
const XRPL_FDC_CONFIRMATIONS = 3;

const flareContractRegistryAbi = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "contractAddress", type: "address" }],
  },
] as const;

export type SmartDepositJobClaims = {
  amountDrops: string;
  chainId: SupportedChainId;
  expiresAt: number;
  issuedAt: number;
  memoData: string;
  nonce: string;
  personalAccount: Address;
  userOperationHash: Hex;
  version: 1;
  xrplAddress: string;
};

type XrplTransaction = {
  Account?: string;
  Amount?: string | Record<string, unknown>;
  Destination?: string;
  DestinationTag?: number;
  Memos?: Array<{ Memo?: { MemoData?: string } }>;
  hash?: string;
  ledger_index?: number;
};

type XrplTransactionResult = {
  hash?: string;
  ledger_index?: number;
  meta?: { TransactionResult?: string } | string;
  tx_json?: XrplTransaction;
  validated?: boolean;
} & XrplTransaction;

type XrpPaymentProof = ContractFunctionArgs<
  typeof ixrpPaymentVerificationAbi,
  "view",
  "verifyXRPPayment"
>[0];

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getRpcUrl(chainId: SupportedChainId) {
  return chainId === flare.id
    ? process.env.FLARE_RPC_URL?.trim() ||
        "https://flare-api.flare.network/ext/C/rpc"
    : process.env.COSTON2_RPC_URL?.trim() ||
        "https://coston2-api.flare.network/ext/C/rpc";
}

function getServerChain(chainId: SupportedChainId) {
  return chainId === flare.id ? flare : coston2;
}

export function getFlarePublicClient(chainId: SupportedChainId) {
  return createPublicClient({
    chain: getServerChain(chainId),
    transport: http(getRpcUrl(chainId)),
  });
}

export function getExecutorContext(chainId: SupportedChainId) {
  const rawPrivateKey = requiredEnvironment(
    "SMART_ACCOUNT_EXECUTOR_PRIVATE_KEY",
  );
  const privateKey = (
    rawPrivateKey.startsWith("0x") ? rawPrivateKey : `0x${rawPrivateKey}`
  ) as Hex;

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("SMART_ACCOUNT_EXECUTOR_PRIVATE_KEY is invalid.");
  }

  const account = privateKeyToAccount(privateKey);
  const chain = getServerChain(chainId);
  const publicClient = getFlarePublicClient(chainId);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(getRpcUrl(chainId)),
  });

  return { account, publicClient, walletClient };
}

function getJobSecret() {
  return (
    process.env.SMART_ACCOUNT_JOB_SECRET?.trim() ||
    process.env.XAMAN_API_SECRET?.trim() ||
    ""
  );
}

export function createSmartDepositJobToken(
  claims: Omit<SmartDepositJobClaims, "expiresAt" | "issuedAt" | "version">,
) {
  const secret = getJobSecret();
  if (!secret) {
    throw new Error(
      "SMART_ACCOUNT_JOB_SECRET or XAMAN_API_SECRET is not configured.",
    );
  }

  const issuedAt = Date.now();
  const payload: SmartDepositJobClaims = {
    ...claims,
    expiresAt: issuedAt + 30 * 60 * 1000,
    issuedAt,
    version: 1,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySmartDepositJobToken(token: string) {
  const secret = getJobSecret();
  if (!secret) {
    throw new Error(
      "SMART_ACCOUNT_JOB_SECRET or XAMAN_API_SECRET is not configured.",
    );
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new Error("Smart Account job token is invalid.");
  }

  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Smart Account job token signature is invalid.");
  }

  const claims = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as SmartDepositJobClaims;

  if (
    claims.version !== 1 ||
    !isSupportedChainId(claims.chainId) ||
    claims.expiresAt <= Date.now() ||
    !isLikelyClassicXrplAddress(claims.xrplAddress) ||
    !isAddress(claims.personalAccount) ||
    !/^0x[0-9a-fA-F]{64}$/.test(claims.userOperationHash)
  ) {
    throw new Error("Smart Account job token has expired or is invalid.");
  }

  return claims;
}

export function assertJobMatchesUserOperation(
  claims: SmartDepositJobClaims,
  userOperationData: Hex,
) {
  if (
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(userOperationData) ||
    keccak256(userOperationData).toLowerCase() !==
      claims.userOperationHash.toLowerCase()
  ) {
    throw new Error("UserOp data does not match the XRPL memo commitment.");
  }
}

export async function getDirectMintSettings(chainId: SupportedChainId) {
  const publicClient = getFlarePublicClient(chainId);
  const contracts = getNetworkContracts(chainId);
  const [
    paymentAddress,
    executorFee,
    feeBips,
    minimumFee,
  ] = await Promise.all([
    publicClient.readContract({
      address: contracts.smartAccounts.assetManager,
      abi: assetManagerAbi,
      functionName: "directMintingPaymentAddress",
    }),
    publicClient.readContract({
      address: contracts.smartAccounts.assetManager,
      abi: assetManagerAbi,
      functionName: "getDirectMintingExecutorFeeUBA",
    }),
    publicClient.readContract({
      address: contracts.smartAccounts.assetManager,
      abi: assetManagerAbi,
      functionName: "getDirectMintingFeeBIPS",
    }),
    publicClient.readContract({
      address: contracts.smartAccounts.assetManager,
      abi: assetManagerAbi,
      functionName: "getDirectMintingMinimumFeeUBA",
    }),
  ]);

  return { executorFee, feeBips, minimumFee, paymentAddress };
}

export function calculateDirectMintPayment(
  depositAmount: bigint,
  settings: {
    executorFee: bigint;
    feeBips: bigint;
    minimumFee: bigint;
  },
) {
  const proportionalFee = (depositAmount * settings.feeBips) / 10_000n;
  const mintingFee =
    proportionalFee > settings.minimumFee
      ? proportionalFee
      : settings.minimumFee;
  return {
    mintingFee,
    paymentAmount: depositAmount + mintingFee + settings.executorFee,
  };
}

async function xrplRequest<T>(
  chainId: SupportedChainId,
  method: string,
  params: Record<string, unknown>,
) {
  const url =
    chainId === flare.id
      ? process.env.XRPL_MAINNET_RPC_URL?.trim() ||
        "https://xrplcluster.com"
      : process.env.XRPL_TESTNET_RPC_URL?.trim() ||
        "https://s.altnet.rippletest.net:51234";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("XRPL_TESTNET_RPC_URL must be an HTTP(S) endpoint.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ripplefi",
      jsonrpc: "2.0",
      method,
      params: [params],
    }),
    cache: "no-store",
  });
  const body = (await response.json()) as {
    error?: { message?: string };
    result?: T & { error?: string; error_message?: string };
  };
  if (
    !response.ok ||
    !body.result ||
    body.result.error
  ) {
    throw new Error(
      body.result?.error_message ||
        body.result?.error ||
        body.error?.message ||
        `XRPL ${method} request failed.`,
    );
  }
  return body.result;
}

export async function verifyXrplSmartDepositPayment({
  claims,
  xrplTransactionHash,
}: {
  claims: SmartDepositJobClaims;
  xrplTransactionHash: string;
}) {
  const normalizedHash = xrplTransactionHash.replace(/^0x/, "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(normalizedHash)) {
    throw new Error("XRPL transaction hash is invalid.");
  }

  const result = await xrplRequest<XrplTransactionResult>(claims.chainId, "tx", {
    binary: false,
    transaction: normalizedHash,
  });
  const tx = result.tx_json || result;
  const transactionResult =
    typeof result.meta === "object" ? result.meta.TransactionResult : undefined;

  if (transactionResult && transactionResult !== "tesSUCCESS") {
    throw new Error(`XRPL payment failed with ${transactionResult}.`);
  }
  if (tx.Account !== claims.xrplAddress) {
    throw new Error("The Xaman signer does not match the resolved XRPL owner.");
  }
  if (tx.DestinationTag !== undefined) {
    throw new Error("Smart Account direct mints must not use a destination tag.");
  }

  const settings = await getDirectMintSettings(claims.chainId);
  if (tx.Destination !== settings.paymentAddress) {
    throw new Error("XRPL payment destination is not the selected network Core Vault.");
  }
  if (typeof tx.Amount !== "string" || tx.Amount !== claims.amountDrops) {
    throw new Error("XRPL payment amount does not match the signed Smart Account job.");
  }

  const memoMatches = tx.Memos?.some(
    (entry) =>
      entry.Memo?.MemoData?.toUpperCase() === claims.memoData.toUpperCase(),
  );
  if (!memoMatches) {
    throw new Error("XRPL payment memo does not match the prepared UserOp.");
  }

  const ledgerIndex = Number(result.ledger_index ?? tx.ledger_index ?? 0);
  let confirmations = 0;
  if (result.validated && ledgerIndex > 0) {
    const serverInfo = await xrplRequest<{
      info?: { validated_ledger?: { seq?: number } };
    }>(claims.chainId, "server_info", {});
    const validatedLedger = Number(
      serverInfo.info?.validated_ledger?.seq ?? ledgerIndex,
    );
    confirmations = Math.max(0, validatedLedger - ledgerIndex + 1);
  }

  return {
    confirmations,
    hash: normalizedHash,
    ledgerIndex,
    ready: Boolean(
      result.validated && confirmations >= XRPL_FDC_CONFIRMATIONS,
    ),
    requiredConfirmations: XRPL_FDC_CONFIRMATIONS,
    validated: Boolean(result.validated),
  };
}

async function getFlareContractAddress(
  name: string,
  chainId: SupportedChainId,
) {
  const publicClient = getFlarePublicClient(chainId);
  return publicClient.readContract({
    address: FLARE_CONTRACT_REGISTRY,
    abi: flareContractRegistryAbi,
    functionName: "getContractAddressByName",
    args: [name],
  });
}

export async function prepareXrpPaymentAttestation({
  chainId,
  transactionId,
}: {
  chainId: SupportedChainId;
  transactionId: Hex;
}) {
  const { account, publicClient, walletClient } = getExecutorContext(chainId);
  const verifierBaseUrl =
    (chainId === flare.id
      ? process.env.FDC_MAINNET_VERIFIER_URL
      : process.env.FDC_VERIFIER_URL
    )?.trim() ||
    (chainId === flare.id
      ? "https://fdc-verifiers-mainnet.flare.network"
      : "https://fdc-verifiers-testnet.flare.network");
  const verifierApiKey = requiredEnvironment("FDC_VERIFIER_API_KEY");
  const verifierUrl = `${verifierBaseUrl.replace(/\/$/, "")}/verifier/xrp/XRPPayment/prepareRequest`;

  const verifierResponse = await fetch(verifierUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": verifierApiKey,
    },
    body: JSON.stringify({
      attestationType: toHex("XRPPayment", { size: 32 }),
      sourceId: toHex(chainId === flare.id ? "XRP" : "testXRP", { size: 32 }),
      requestBody: {
        proofOwner: account.address,
        transactionId,
      },
    }),
    cache: "no-store",
  });
  const verifierBody = (await verifierResponse.json()) as {
    abiEncodedRequest?: Hex;
    errorMessage?: string;
    status?: string;
  };
  if (!verifierResponse.ok || !verifierBody.abiEncodedRequest) {
    throw new Error(
      verifierBody.errorMessage ||
        verifierBody.status ||
        "FDC verifier rejected the XRPL payment.",
    );
  }

  const abiEncodedRequest = verifierBody.abiEncodedRequest;
  const fdcHubAddress = await getFlareContractAddress("FdcHub", chainId);
  const feeConfigAddress = await publicClient.readContract({
    address: fdcHubAddress,
    abi: iFdcHubAbi,
    functionName: "fdcRequestFeeConfigurations",
  });
  const requestFee = await publicClient.readContract({
    address: feeConfigAddress,
    abi: iFdcRequestFeeConfigurationsAbi,
    functionName: "getRequestFee",
    args: [abiEncodedRequest],
  });
  const requestTxHash = await walletClient.writeContract({
    account,
    address: fdcHubAddress,
    abi: iFdcHubAbi,
    functionName: "requestAttestation",
    args: [abiEncodedRequest],
    value: requestFee,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: requestTxHash,
  });
  if (receipt.status !== "success") {
    throw new Error(`FDC attestation request reverted on ${getServerChain(chainId).name}.`);
  }

  const [block, systemsManagerAddress] = await Promise.all([
    publicClient.getBlock({ blockNumber: receipt.blockNumber }),
    getFlareContractAddress("FlareSystemsManager", chainId),
  ]);
  const [firstRoundStart, roundDuration] = await Promise.all([
    publicClient.readContract({
      address: systemsManagerAddress,
      abi: iFlareSystemsManagerAbi,
      functionName: "firstVotingRoundStartTs",
    }),
    publicClient.readContract({
      address: systemsManagerAddress,
      abi: iFlareSystemsManagerAbi,
      functionName: "votingEpochDurationSeconds",
    }),
  ]);
  const roundId = Number(
    (block.timestamp - firstRoundStart) / roundDuration,
  );

  return { abiEncodedRequest, requestTxHash, roundId };
}

export async function isFdcRoundFinalized(
  chainId: SupportedChainId,
  roundId: number,
) {
  const publicClient = getFlarePublicClient(chainId);
  const [relayAddress, verificationAddress] = await Promise.all([
    getFlareContractAddress("Relay", chainId),
    getFlareContractAddress("FdcVerification", chainId),
  ]);
  const protocolId = await publicClient.readContract({
    address: verificationAddress,
    abi: iFdcVerificationAbi,
    functionName: "fdcProtocolId",
  });
  return publicClient.readContract({
    address: relayAddress,
    abi: iRelayAbi,
    functionName: "isFinalized",
    args: [BigInt(protocolId), BigInt(roundId)],
  });
}

export async function retrieveXrpPaymentProof({
  abiEncodedRequest,
  chainId,
  roundId,
}: {
  abiEncodedRequest: Hex;
  chainId: SupportedChainId;
  roundId: number;
}) {
  const daLayerBase =
    (chainId === flare.id
      ? process.env.FLARE_DA_LAYER_URL
      : process.env.COSTON2_DA_LAYER_URL
    )?.trim() ||
    (chainId === flare.id
      ? "https://flr-data-availability.flare.network"
      : "https://ctn2-data-availability.flare.network");
  const response = await fetch(
    `${daLayerBase.replace(/\/$/, "")}/api/v1/fdc/proof-by-request-round-raw`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestBytes: abiEncodedRequest,
        votingRoundId: roundId,
      }),
      cache: "no-store",
    },
  );
  const body = (await response.json()) as {
    proof?: readonly Hex[];
    response_hex?: Hex;
  };
  if (!response.ok || !body.response_hex) {
    return null;
  }

  const responseParameter = (
    ixrpPaymentVerificationAbi.find(
      (entry) =>
        entry.type === "function" &&
        "name" in entry &&
        entry.name === "verifyXRPPayment",
    ) as
      | {
          inputs: readonly {
            components?: readonly AbiParameter[];
          }[];
        }
      | undefined
  )?.inputs?.[0]?.components?.[1];
  if (!responseParameter) {
    throw new Error("XRPPayment response ABI is unavailable.");
  }

  const [data] = decodeAbiParameters(
    [responseParameter],
    body.response_hex,
  );
  return {
    data,
    merkleProof: body.proof || [],
  } as XrpPaymentProof;
}

async function findRecentExecutionReceipt(
  chainId: SupportedChainId,
  transactionId: Hex,
) {
  const publicClient = getFlarePublicClient(chainId);
  const contracts = getNetworkContracts(chainId);
  const latest = await publicClient.getBlockNumber();
  const event = masterAccountControllerAbi.find(
    (entry) =>
      entry.type === "event" && entry.name === "DirectMintingExecuted",
  );
  if (!event) return null;

  for (let offset = 0n; offset < 12_000n; offset += 2_000n) {
    const toBlock = latest > offset ? latest - offset : 0n;
    const fromBlock = toBlock > 1_999n ? toBlock - 1_999n : 0n;
    const logs = await publicClient.getLogs({
      address: contracts.smartAccounts.masterAccountController,
      event,
      args: { transactionId },
      fromBlock,
      toBlock,
    });
    if (logs[0]?.transactionHash) {
      return publicClient.getTransactionReceipt({
        hash: logs[0].transactionHash,
      });
    }
    if (fromBlock === 0n) break;
  }
  return null;
}

export async function executeSmartDeposit({
  claims,
  proof,
  transactionId,
  userOperationData,
}: {
  claims: SmartDepositJobClaims;
  proof: XrpPaymentProof;
  transactionId: Hex;
  userOperationData: Hex;
}) {
  const { account, publicClient, walletClient } = getExecutorContext(
    claims.chainId,
  );
  const contracts = getNetworkContracts(claims.chainId);
  const alreadyUsed = await publicClient.readContract({
    address: contracts.smartAccounts.masterAccountController,
    abi: masterAccountControllerAbi,
    functionName: "isTransactionIdUsed",
    args: [transactionId],
  });

  let receipt: TransactionReceipt | null = null;
  if (alreadyUsed) {
    receipt = await findRecentExecutionReceipt(claims.chainId, transactionId);
    if (!receipt) {
      return {
        alreadyExecuted: true,
        flareTransactionHash: null,
      };
    }
  } else {
    const flareTransactionHash = await walletClient.writeContract({
      account,
      address: contracts.smartAccounts.assetManager,
      abi: iDirectMintingAbi,
      functionName: "executeDirectMintingWithData",
      args: [proof, userOperationData],
      value: 0n,
    });
    receipt = await publicClient.waitForTransactionReceipt({
      hash: flareTransactionHash,
    });
    if (receipt.status !== "success") {
      throw new Error("Smart Account executor transaction reverted.");
    }
  }

  const userOperationLogs = parseEventLogs({
    abi: masterAccountControllerAbi,
    eventName: "UserOperationExecuted",
    logs: receipt.logs,
  });
  const completed = userOperationLogs.some(
    (log) =>
      log.args.personalAccount.toLowerCase() ===
        claims.personalAccount.toLowerCase() &&
      log.args.nonce === BigInt(claims.nonce),
  );
  if (!completed) {
    throw new Error(
      "Direct mint finalized, but the RippleFI UserOp was not executed.",
    );
  }

  return {
    alreadyExecuted: Boolean(alreadyUsed),
    flareTransactionHash: receipt.transactionHash,
  };
}
