"use client";

import { useCallback, useMemo, useState } from "react";
import {
  formatUnits,
  parseUnits,
  zeroAddress,
  type Hash,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import {
  firelightVaultAbi,
  fxrpAbi,
  getNetworkContracts,
} from "@/lib/contracts";
import {
  DEFAULT_CHAIN_ID,
  flare,
  getSupportedChain,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";

type PendingAction = "approve" | "deposit" | null;

function displayAmount(value: bigint | undefined, decimals: number) {
  if (value === undefined) {
    return "0.00";
  }
  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : `${whole}.00`;
}

export function useFirelight() {
  const { address, chainId } = useAccount();
  const activeChainId: SupportedChainId = isSupportedChainId(chainId)
    ? chainId
    : DEFAULT_CHAIN_ID;
  const chain = getSupportedChain(activeChainId);
  const contracts = getNetworkContracts(activeChainId);
  const firelightAddress = contracts.strategies.firelight ?? zeroAddress;
  const account = address ?? zeroAddress;
  const isAvailable =
    activeChainId === flare.id && contracts.strategies.firelight !== null;
  const readsEnabled =
    Boolean(address) && isSupportedChainId(chainId) && isAvailable;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { writeContractAsync } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const decimalsQuery = useReadContract({
    address: firelightAddress,
    abi: firelightVaultAbi,
    functionName: "decimals",
    chainId: activeChainId,
    query: { enabled: isAvailable },
  });
  const decimals = Number(decimalsQuery.data ?? 6);
  const shareUnit = 10n ** BigInt(decimals);

  const sharesQuery = useReadContract({
    address: firelightAddress,
    abi: firelightVaultAbi,
    functionName: "balanceOf",
    args: [account],
    chainId: activeChainId,
    query: { enabled: readsEnabled },
  });
  const assetsQuery = useReadContract({
    address: firelightAddress,
    abi: firelightVaultAbi,
    functionName: "convertToAssets",
    args: [sharesQuery.data ?? 0n],
    chainId: activeChainId,
    query: { enabled: readsEnabled },
  });
  const sharePriceQuery = useReadContract({
    address: firelightAddress,
    abi: firelightVaultAbi,
    functionName: "convertToAssets",
    args: [shareUnit],
    chainId: activeChainId,
    query: { enabled: isAvailable },
  });
  const totalAssetsQuery = useReadContract({
    address: firelightAddress,
    abi: firelightVaultAbi,
    functionName: "totalAssets",
    chainId: activeChainId,
    query: { enabled: isAvailable },
  });
  const maxDepositQuery = useReadContract({
    address: firelightAddress,
    abi: firelightVaultAbi,
    functionName: "maxDeposit",
    args: [account],
    chainId: activeChainId,
    query: { enabled: readsEnabled },
  });
  const allowanceQuery = useReadContract({
    address: contracts.fxrp,
    abi: fxrpAbi,
    functionName: "allowance",
    args: [account, firelightAddress],
    chainId: activeChainId,
    query: { enabled: readsEnabled },
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      sharesQuery.refetch(),
      assetsQuery.refetch(),
      sharePriceQuery.refetch(),
      totalAssetsQuery.refetch(),
      maxDepositQuery.refetch(),
      allowanceQuery.refetch(),
    ]);
  }, [
    allowanceQuery,
    assetsQuery,
    maxDepositQuery,
    sharePriceQuery,
    sharesQuery,
    totalAssetsQuery,
  ]);

  const waitForReceipt = useCallback(
    async (hash: Hash) => {
      if (!publicClient) {
        throw new Error(`${chain.name} RPC client is unavailable.`);
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Transaction reverted on ${chain.name}.`);
      }
      await refresh();
    },
    [chain.name, publicClient, refresh],
  );

  const parseAmount = useCallback(
    (amount: string) => {
      const value = parseUnits(amount, decimals);
      if (value <= 0n) {
        throw new Error("Enter an amount greater than zero.");
      }
      if (
        maxDepositQuery.data !== undefined &&
        value > maxDepositQuery.data
      ) {
        throw new Error("Amount exceeds Firelight's current deposit capacity.");
      }
      return value;
    },
    [decimals, maxDepositQuery.data],
  );

  const requireAccount = useCallback(() => {
    if (!address || !isSupportedChainId(chainId) || !isAvailable) {
      throw new Error("Firelight staking is available on Flare mainnet.");
    }
    return address;
  }, [address, chainId, isAvailable]);

  const approveFxrp = useCallback(
    async (amount: string) => {
      requireAccount();
      setPendingAction("approve");
      try {
        const hash = await writeContractAsync({
          address: contracts.fxrp,
          abi: fxrpAbi,
          functionName: "approve",
          args: [firelightAddress, parseAmount(amount)],
          chainId: activeChainId,
        });
        await waitForReceipt(hash);
      } finally {
        setPendingAction(null);
      }
    },
    [
      activeChainId,
      contracts.fxrp,
      firelightAddress,
      parseAmount,
      requireAccount,
      waitForReceipt,
      writeContractAsync,
    ],
  );

  const depositFxrp = useCallback(
    async (amount: string) => {
      const receiver = requireAccount();
      setPendingAction("deposit");
      try {
        const hash = await writeContractAsync({
          address: firelightAddress,
          abi: firelightVaultAbi,
          functionName: "deposit",
          args: [parseAmount(amount), receiver],
          chainId: activeChainId,
        });
        await waitForReceipt(hash);
      } finally {
        setPendingAction(null);
      }
    },
    [
      activeChainId,
      firelightAddress,
      parseAmount,
      requireAccount,
      waitForReceipt,
      writeContractAsync,
    ],
  );

  return useMemo(
    () => ({
      address: contracts.strategies.firelight,
      allowanceRaw: allowanceQuery.data,
      approveFxrp,
      assets: displayAmount(assetsQuery.data, decimals),
      assetsRaw: assetsQuery.data,
      depositFxrp,
      isAvailable,
      isLoading:
        readsEnabled &&
        (sharesQuery.isLoading ||
          assetsQuery.isLoading ||
          allowanceQuery.isLoading),
      maxDeposit: displayAmount(maxDepositQuery.data, decimals),
      maxDepositRaw: maxDepositQuery.data,
      pendingAction,
      refresh,
      sharePrice:
        sharePriceQuery.data === undefined
          ? null
          : displayAmount(sharePriceQuery.data, decimals),
      shares: displayAmount(sharesQuery.data, decimals),
      sharesRaw: sharesQuery.data,
      totalAssets: displayAmount(totalAssetsQuery.data, decimals),
      totalAssetsRaw: totalAssetsQuery.data,
    }),
    [
      allowanceQuery.data,
      allowanceQuery.isLoading,
      approveFxrp,
      assetsQuery.data,
      assetsQuery.isLoading,
      contracts.strategies.firelight,
      decimals,
      depositFxrp,
      isAvailable,
      maxDepositQuery.data,
      pendingAction,
      readsEnabled,
      refresh,
      sharePriceQuery.data,
      sharesQuery.data,
      sharesQuery.isLoading,
      totalAssetsQuery.data,
    ],
  );
}

export type FirelightState = ReturnType<typeof useFirelight>;
