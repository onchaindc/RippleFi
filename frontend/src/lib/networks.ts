import { defineChain } from "viem";

export const flare = defineChain({
  id: 14,
  name: "Flare Mainnet",
  nativeCurrency: {
    name: "Flare",
    symbol: "FLR",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://flare-api.flare.network/ext/C/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Flare Explorer",
      url: "https://flare-explorer.flare.network",
    },
  },
});

export const coston2 = defineChain({
  id: 114,
  name: "Coston2",
  nativeCurrency: {
    name: "Coston2 Flare",
    symbol: "C2FLR",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://coston2-api.flare.network/ext/C/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
});

export const supportedChains = [flare, coston2] as const;
export type SupportedChainId = (typeof supportedChains)[number]["id"];
export const DEFAULT_CHAIN_ID: SupportedChainId = coston2.id;

export function isSupportedChainId(
  chainId: number | undefined,
): chainId is SupportedChainId {
  return chainId === flare.id || chainId === coston2.id;
}

export function getSupportedChain(chainId: number | undefined) {
  return chainId === flare.id ? flare : coston2;
}

export function getXrplExplorerUrl(chainId: SupportedChainId) {
  return chainId === flare.id
    ? "https://livenet.xrpl.org"
    : "https://testnet.xrpl.org";
}

export function getSystemsExplorerUrl(chainId: SupportedChainId) {
  return chainId === flare.id
    ? "https://flare-systems-explorer.flare.network"
    : "https://coston2-systems-explorer.flare.network";
}
