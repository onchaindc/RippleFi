import { isAddress, zeroAddress, type Abi, type Address } from "viem";
import {
  coston2,
  flare,
  type SupportedChainId,
} from "@/lib/networks";

const configuredMainnetVault =
  process.env.NEXT_PUBLIC_FLARE_VAULT_ADDRESS?.trim();
const configuredMainnetDeploymentBlock =
  process.env.NEXT_PUBLIC_FLARE_VAULT_DEPLOYMENT_BLOCK?.trim();

function optionalAddress(value: string | undefined) {
  return value && isAddress(value) && value.toLowerCase() !== zeroAddress
    ? (value as Address)
    : null;
}

function optionalBlock(value: string | undefined) {
  return value && /^\d+$/.test(value) ? BigInt(value) : null;
}

export const NETWORK_CONTRACTS = {
  [flare.id]: {
    vault: optionalAddress(configuredMainnetVault),
    vaultDeploymentBlock: optionalBlock(configuredMainnetDeploymentBlock),
    fxrp: "0xAd552A648C74D49E10027AB8a618A3ad4901c5bE" as Address,
    yieldStrategyEnabled: true,
    strategies: {
      firelight:
        "0x4C18Ff3C89632c3Dd62E796c0aFA5c07c4c1B2b3" as Address,
      upshift: "0x373D7d201C8134D4a2f7b5c63560da217e3dEA28" as Address,
    },
    smartAccounts: {
      masterAccountController:
        "0x434936d47503353f06750Db1A444DBDC5F0AD37c" as Address,
      assetManager:
        "0x2a3Fe068cD92178554cabcf7c95ADf49B4B0B6A8" as Address,
    },
  },
  [coston2.id]: {
    vault: "0x57ccb558022a09f895376fbb58a849b6b5fd825b" as Address,
    vaultDeploymentBlock: 33_505_125n,
    fxrp: "0x0b6A3645c240605887a5532109323A3E12273dc7" as Address,
    yieldStrategyEnabled: true,
    strategies: {
      firelight: null,
      upshift: "0x24c1a47cD5e8473b64EAB2a94515a196E10C7C81" as Address,
    },
    smartAccounts: {
      masterAccountController:
        "0x434936d47503353f06750Db1A444DBDC5F0AD37c" as Address,
      personalAccountImplementation:
        "0xe900cf0C3f1320816700c669B002835aCc9A93A6" as Address,
      assetManager:
        "0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA" as Address,
    },
  },
} as const;

export function getNetworkContracts(chainId: SupportedChainId) {
  return NETWORK_CONTRACTS[chainId];
}

export const fxrpAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const satisfies Abi;

export const vaultAbi = [
  {
    type: "function",
    name: "getUserInfo",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "assets", type: "uint256" },
      { name: "shares", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "strategyGrossAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "strategyNetAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "strategySharePrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "availableLiquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxWithdraw",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdraw",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "receiver", type: "address", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "assets", type: "uint256", indexed: false },
      { name: "shares", type: "uint256", indexed: false },
    ],
  },
] as const satisfies Abi;

export const firelightVaultAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxDeposit",
    stateMutability: "view",
    inputs: [{ name: "receiver", type: "address" }],
    outputs: [{ name: "assets", type: "uint256" }],
  },
  {
    type: "function",
    name: "previewDeposit",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "assets", type: "uint256" }],
  },
] as const satisfies Abi;

export const masterAccountControllerAbi = [
  {
    type: "function",
    name: "getPersonalAccount",
    stateMutability: "view",
    inputs: [{ name: "xrplOwner", type: "string" }],
    outputs: [{ name: "personalAccount", type: "address" }],
  },
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [{ name: "personalAccount", type: "address" }],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
  {
    type: "function",
    name: "getExecutor",
    stateMutability: "view",
    inputs: [{ name: "personalAccount", type: "address" }],
    outputs: [{ name: "executor", type: "address" }],
  },
  {
    type: "function",
    name: "getXrplProviderWallets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "wallets", type: "string[]" }],
  },
  {
    type: "function",
    name: "isSmartAccount",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      { name: "isSmartAccount", type: "bool" },
      { name: "xrplOwner", type: "string" },
    ],
  },
  {
    type: "function",
    name: "isTransactionIdUsed",
    stateMutability: "view",
    inputs: [{ name: "transactionId", type: "bytes32" }],
    outputs: [{ name: "used", type: "bool" }],
  },
  {
    type: "event",
    name: "UserOperationExecuted",
    inputs: [
      { name: "personalAccount", type: "address", indexed: true },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DirectMintingExecuted",
    inputs: [
      { name: "personalAccount", type: "address", indexed: true },
      { name: "transactionId", type: "bytes32", indexed: true },
      { name: "sourceAddress", type: "string", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "executorFee", type: "uint256", indexed: false },
      { name: "executor", type: "address", indexed: false },
    ],
  },
] as const satisfies Abi;

export const personalAccountAbi = [
  {
    type: "function",
    name: "executeUserOp",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "xrplOwner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "owner", type: "string" }],
  },
  {
    type: "function",
    name: "controllerAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "controller", type: "address" }],
  },
  {
    type: "function",
    name: "implementation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "implementationAddress", type: "address" }],
  },
] as const satisfies Abi;

export const assetManagerAbi = [
  {
    type: "function",
    name: "fAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "token", type: "address" }],
  },
  {
    type: "function",
    name: "getDirectMintingExecutorFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "fee", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDirectMintingFeeBIPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "feeBips", type: "uint256" }],
  },
  {
    type: "function",
    name: "getDirectMintingMinimumFeeUBA",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "minimumFee", type: "uint256" }],
  },
  {
    type: "function",
    name: "directMintingPaymentAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "paymentAddress", type: "string" }],
  },
] as const satisfies Abi;
