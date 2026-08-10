import type { Abi, Address, Hex } from "viem";
import type { SupportedChainId } from "@/lib/networks";

export const FLARE_CONTRACT_REGISTRY =
  "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019" as Address;

export const XRP_USD_FEED_ID =
  "0x015852502f55534400000000000000000000000000" as Hex;

export const flareContractRegistryAbi = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "_name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const satisfies Abi;

export const ftsoV2Abi = [
  {
    type: "function",
    name: "getFeedByIdInWei",
    stateMutability: "payable",
    inputs: [{ name: "_feedId", type: "bytes21" }],
    outputs: [
      { name: "_value", type: "uint256" },
      { name: "_timestamp", type: "uint64" },
    ],
  },
] as const satisfies Abi;

export type FtsoXrpPrice = {
  chainId: SupportedChainId;
  feed: "XRP/USD";
  feedId: Hex;
  fetchedAt: number;
  ftsoAddress: Address;
  priceUsd: string;
  priceWei: string;
  source: "Flare FTSO v2";
  timestamp: number;
};
