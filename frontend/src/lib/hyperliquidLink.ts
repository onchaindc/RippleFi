import { isAddress, type Address } from "viem";
import { flare, isSupportedChainId, type SupportedChainId } from "@/lib/networks";

export type HyperliquidNetwork = "mainnet" | "testnet";
export type HyperliquidAuthorizationStatus =
  | "connected"
  | "authorized";

export type HyperliquidLink = {
  apiWalletAddress: Address;
  authorizedAt: number | null;
  chainId: SupportedChainId;
  masterAccount: Address;
  network: HyperliquidNetwork;
  status: HyperliquidAuthorizationStatus;
  updatedAt: number;
  version: 1;
  wallet: Address;
};

export function hyperliquidNetworkForChain(
  chainId: SupportedChainId,
): HyperliquidNetwork {
  return chainId === flare.id ? "mainnet" : "testnet";
}

export function isHyperliquidLink(
  value: unknown,
  expectedWallet?: string,
  expectedChainId?: number,
): value is HyperliquidLink {
  if (!value || typeof value !== "object") {
    return false;
  }
  const link = value as Partial<HyperliquidLink>;
  return (
    link.version === 1 &&
    typeof link.wallet === "string" &&
    isAddress(link.wallet) &&
    (expectedWallet === undefined ||
      link.wallet.toLowerCase() === expectedWallet.toLowerCase()) &&
    isSupportedChainId(link.chainId) &&
    (expectedChainId === undefined || link.chainId === expectedChainId) &&
    link.network === hyperliquidNetworkForChain(link.chainId) &&
    typeof link.masterAccount === "string" &&
    isAddress(link.masterAccount) &&
    typeof link.apiWalletAddress === "string" &&
    isAddress(link.apiWalletAddress) &&
    (link.status === "connected" || link.status === "authorized") &&
    (link.authorizedAt === null || typeof link.authorizedAt === "number") &&
    typeof link.updatedAt === "number"
  );
}
