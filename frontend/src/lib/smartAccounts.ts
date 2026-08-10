import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  maxUint64,
  isAddress,
  parseUnits,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { fxrpAbi, personalAccountAbi, vaultAbi } from "@/lib/contracts";

export const SMART_ACCOUNT_MEMO_OPCODE = {
  userOperationByHash: 0xfe,
} as const;

// The current official 0xFE direct-mint examples use walletId 0. The field is
// reserved for executor routing and is not consumed by the on-chain decoder.
export const COSTON2_SMART_ACCOUNT_WALLET_ID = 0;

export type SmartAccountCall = {
  target: Address;
  value: bigint;
  data: Hex;
};

export type SmartDepositInstruction = {
  action: "deposit";
  amountRaw: bigint;
  authorizationMintRaw: bigint;
  chainId: 14 | 114;
  calls: SmartAccountCall[];
  callData: Hex;
  directMintingExecutorFee: bigint;
  directMintingFee: bigint;
  memoData: Hex;
  memoDataForXrpl: string;
  memoExecutorFee: bigint;
  nonce: bigint;
  paymentAmountRaw: bigint;
  personalAccount: Address;
  userOperationData: Hex;
  userOperationHash: Hex;
  walletId: number;
};

export type SmartSpendInstruction = Omit<
  SmartDepositInstruction,
  "action"
> & {
  action: "spend";
  recipient: Address;
  source: "available" | "vault";
};

export type SmartAccountInstruction =
  | SmartDepositInstruction
  | SmartSpendInstruction;

const packedUserOperationParameters = [
  {
    type: "tuple",
    components: [
      { name: "sender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "initCode", type: "bytes" },
      { name: "callData", type: "bytes" },
      { name: "accountGasLimits", type: "bytes32" },
      { name: "preVerificationGas", type: "uint256" },
      { name: "gasFees", type: "bytes32" },
      { name: "paymasterAndData", type: "bytes" },
      { name: "signature", type: "bytes" },
    ],
  },
] as const;

export function isLikelyClassicXrplAddress(value: string) {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value.trim());
}

export function buildSmartDepositInstruction({
  amount,
  chainId,
  contracts,
  decimals,
  directMintingExecutorFee,
  directMintingFeeBips,
  directMintingMinimumFee,
  memoExecutorFee = 0n,
  nonce,
  personalAccount,
  walletId = COSTON2_SMART_ACCOUNT_WALLET_ID,
}: {
  amount: string;
  chainId: 14 | 114;
  contracts: { fxrp: Address; vault: Address };
  decimals: number;
  directMintingExecutorFee: bigint;
  directMintingFeeBips: bigint;
  directMintingMinimumFee: bigint;
  memoExecutorFee?: bigint;
  nonce: bigint;
  personalAccount: Address;
  walletId?: number;
}): SmartDepositInstruction {
  const amountRaw = parseUnits(amount, decimals);

  if (amountRaw <= 0n) {
    throw new Error("Enter an amount greater than zero.");
  }

  if (!Number.isInteger(walletId) || walletId < 0 || walletId > 255) {
    throw new Error("Wallet ID must be an unsigned 8-bit integer.");
  }

  if (memoExecutorFee < 0n || memoExecutorFee > maxUint64) {
    throw new Error("Executor fee must fit in an unsigned 64-bit integer.");
  }

  if (directMintingExecutorFee < 0n || directMintingFeeBips < 0n) {
    throw new Error("Direct-mint fee settings are invalid.");
  }

  const calls: SmartAccountCall[] = [
    {
      target: contracts.fxrp,
      value: 0n,
      data: encodeFunctionData({
        abi: fxrpAbi,
        functionName: "approve",
        args: [contracts.vault, amountRaw],
      }),
    },
    {
      target: contracts.vault,
      value: 0n,
      data: encodeFunctionData({
        abi: vaultAbi,
        functionName: "deposit",
        args: [amountRaw, personalAccount],
      }),
    },
  ];

  const callData = encodeFunctionData({
    abi: personalAccountAbi,
    functionName: "executeUserOp",
    args: [calls],
  });

  const userOperationData = encodeAbiParameters(
    packedUserOperationParameters,
    [
      {
        sender: personalAccount,
        nonce,
        initCode: "0x",
        callData,
        accountGasLimits: zeroHash,
        preVerificationGas: 0n,
        gasFees: zeroHash,
        paymasterAndData: "0x",
        signature: "0x",
      },
    ],
  );
  const userOperationHash = keccak256(userOperationData);
  const proportionalMintingFee =
    (amountRaw * directMintingFeeBips) / 10_000n;
  const directMintingFee =
    proportionalMintingFee > directMintingMinimumFee
      ? proportionalMintingFee
      : directMintingMinimumFee;
  const paymentAmountRaw =
    amountRaw + directMintingFee + directMintingExecutorFee;
  const memoData = concat([
    toHex(SMART_ACCOUNT_MEMO_OPCODE.userOperationByHash, { size: 1 }),
    toHex(walletId, { size: 1 }),
    toHex(memoExecutorFee, { size: 8 }),
    userOperationHash,
  ]);

  return {
    action: "deposit",
    amountRaw,
    authorizationMintRaw: amountRaw,
    chainId,
    calls,
    callData,
    directMintingExecutorFee,
    directMintingFee,
    memoData,
    memoDataForXrpl: memoData.slice(2).toUpperCase(),
    memoExecutorFee,
    nonce,
    paymentAmountRaw,
    personalAccount,
    userOperationData,
    userOperationHash,
    walletId,
  };
}

export function buildSmartSpendInstruction({
  amount,
  availableBalance,
  chainId,
  contracts,
  decimals,
  directMintingExecutorFee,
  directMintingFeeBips,
  directMintingMinimumFee,
  nonce,
  personalAccount,
  recipient,
  source,
  vaultBalance,
  walletId = COSTON2_SMART_ACCOUNT_WALLET_ID,
}: {
  amount: string;
  availableBalance: bigint;
  chainId: 14 | 114;
  contracts: { fxrp: Address; vault: Address };
  decimals: number;
  directMintingExecutorFee: bigint;
  directMintingFeeBips: bigint;
  directMintingMinimumFee: bigint;
  nonce: bigint;
  personalAccount: Address;
  recipient: string;
  source: "available" | "vault";
  vaultBalance: bigint;
  walletId?: number;
}): SmartSpendInstruction {
  const amountRaw = parseUnits(amount, decimals);
  const destination = recipient.trim();
  if (
    amountRaw <= 0n ||
    !isAddress(destination) ||
    destination.toLowerCase() === zeroAddress
  ) {
    throw new Error("Enter a valid amount and recipient address.");
  }
  const balance = source === "available" ? availableBalance : vaultBalance;
  if (amountRaw > balance) {
    throw new Error("Amount exceeds the selected Smart Account balance.");
  }
  if (!Number.isInteger(walletId) || walletId < 0 || walletId > 255) {
    throw new Error("Wallet ID must be an unsigned 8-bit integer.");
  }

  const calls: SmartAccountCall[] = [
    source === "available"
      ? {
          target: contracts.fxrp,
          value: 0n,
          data: encodeFunctionData({
            abi: fxrpAbi,
            functionName: "transfer",
            args: [destination, amountRaw],
          }),
        }
      : {
          target: contracts.vault,
          value: 0n,
          data: encodeFunctionData({
            abi: vaultAbi,
            functionName: "withdraw",
            args: [amountRaw, destination, personalAccount],
          }),
        },
  ];
  const callData = encodeFunctionData({
    abi: personalAccountAbi,
    functionName: "executeUserOp",
    args: [calls],
  });
  const userOperationData = encodeAbiParameters(
    packedUserOperationParameters,
    [
      {
        sender: personalAccount,
        nonce,
        initCode: "0x",
        callData,
        accountGasLimits: zeroHash,
        preVerificationGas: 0n,
        gasFees: zeroHash,
        paymasterAndData: "0x",
        signature: "0x",
      },
    ],
  );
  const userOperationHash = keccak256(userOperationData);
  const authorizationMintRaw = 1n;
  const proportionalMintingFee =
    (authorizationMintRaw * directMintingFeeBips) / 10_000n;
  const directMintingFee =
    proportionalMintingFee > directMintingMinimumFee
      ? proportionalMintingFee
      : directMintingMinimumFee;
  const paymentAmountRaw =
    authorizationMintRaw + directMintingFee + directMintingExecutorFee;
  const memoExecutorFee = 0n;
  const memoData = concat([
    toHex(SMART_ACCOUNT_MEMO_OPCODE.userOperationByHash, { size: 1 }),
    toHex(walletId, { size: 1 }),
    toHex(memoExecutorFee, { size: 8 }),
    userOperationHash,
  ]);

  return {
    action: "spend",
    amountRaw,
    authorizationMintRaw,
    chainId,
    calls,
    callData,
    directMintingExecutorFee,
    directMintingFee,
    memoData,
    memoDataForXrpl: memoData.slice(2).toUpperCase(),
    memoExecutorFee,
    nonce,
    paymentAmountRaw,
    personalAccount,
    recipient: destination,
    source,
    userOperationData,
    userOperationHash,
    walletId,
  };
}
