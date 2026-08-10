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
import { fxrpAbi, getNetworkContracts, vaultAbi } from "@/lib/contracts";
import {
  DEFAULT_CHAIN_ID,
  getSupportedChain,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";

type PendingAction = "approve" | "deposit" | "withdraw" | null;

function displayAmount(value: bigint | undefined, decimals: number) {
  if (value === undefined) {
    return "0.00";
  }

  const formatted = formatUnits(value, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, "");

  return trimmedFraction ? `${whole}.${trimmedFraction}` : `${whole}.00`;
}

export function useVault() {
  const { address, chainId, isConnected } = useAccount();
  const activeChainId: SupportedChainId = isSupportedChainId(chainId)
    ? chainId
    : DEFAULT_CHAIN_ID;
  const chain = getSupportedChain(activeChainId);
  const contracts = getNetworkContracts(activeChainId);
  const vaultAddress = contracts.vault ?? zeroAddress;
  const isVaultConfigured = contracts.vault !== null;
  const publicClient = usePublicClient({ chainId: activeChainId });
  const { writeContractAsync } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [activityVersion, setActivityVersion] = useState(0);

  const account = address ?? zeroAddress;
  const readsEnabled = Boolean(address) && isSupportedChainId(chainId);
  const vaultReadsEnabled = readsEnabled && isVaultConfigured;

  const decimalsQuery = useReadContract({
    address: contracts.fxrp,
    abi: fxrpAbi,
    functionName: "decimals",
    chainId: activeChainId,
  });

  const balanceQuery = useReadContract({
    address: contracts.fxrp,
    abi: fxrpAbi,
    functionName: "balanceOf",
    args: [account],
    chainId: activeChainId,
    query: { enabled: readsEnabled },
  });

  const allowanceQuery = useReadContract({
    address: contracts.fxrp,
    abi: fxrpAbi,
    functionName: "allowance",
    args: [account, vaultAddress],
    chainId: activeChainId,
    query: { enabled: vaultReadsEnabled },
  });

  const positionQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "getUserInfo",
    args: [account],
    chainId: activeChainId,
    query: { enabled: vaultReadsEnabled },
  });

  const totalAssetsQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "totalAssets",
    chainId: activeChainId,
    query: { enabled: isVaultConfigured },
  });

  const strategyGrossAssetsQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "strategyGrossAssets",
    chainId: activeChainId,
    query: {
      enabled: isVaultConfigured && contracts.yieldStrategyEnabled,
    },
  });

  const strategyNetAssetsQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "strategyNetAssets",
    chainId: activeChainId,
    query: {
      enabled: isVaultConfigured && contracts.yieldStrategyEnabled,
    },
  });

  const strategySharePriceQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "strategySharePrice",
    chainId: activeChainId,
    query: {
      enabled: isVaultConfigured && contracts.yieldStrategyEnabled,
    },
  });

  const availableLiquidityQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "availableLiquidity",
    chainId: activeChainId,
    query: {
      enabled: isVaultConfigured && contracts.yieldStrategyEnabled,
    },
  });

  const maxWithdrawQuery = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "maxWithdraw",
    args: [account],
    chainId: activeChainId,
    query: {
      enabled:
        vaultReadsEnabled && contracts.yieldStrategyEnabled,
    },
  });

  const decimals = Number(decimalsQuery.data ?? 6);
  const vaultAssetsRaw = positionQuery.data?.[0];
  const vaultSharesRaw = positionQuery.data?.[1];
  const withdrawableAssetsRaw =
    maxWithdrawQuery.data ?? vaultAssetsRaw;

  const refresh = useCallback(async () => {
    await Promise.all([
      balanceQuery.refetch(),
      allowanceQuery.refetch(),
      positionQuery.refetch(),
      totalAssetsQuery.refetch(),
      strategyGrossAssetsQuery.refetch(),
      strategyNetAssetsQuery.refetch(),
      strategySharePriceQuery.refetch(),
      availableLiquidityQuery.refetch(),
      maxWithdrawQuery.refetch(),
    ]);
    setActivityVersion((version) => version + 1);
  }, [
    allowanceQuery,
    availableLiquidityQuery,
    balanceQuery,
    maxWithdrawQuery,
    positionQuery,
    strategyGrossAssetsQuery,
    strategyNetAssetsQuery,
    strategySharePriceQuery,
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

  const requireAccount = useCallback(() => {
    if (!address || !isSupportedChainId(chainId)) {
      throw new Error("Connect a wallet on Flare or Coston2.");
    }
    if (!contracts.vault) {
      throw new Error(
        `${chain.name} vault is not configured yet.`,
      );
    }
    return address;
  }, [address, chain.name, chainId, contracts.vault]);

  const parseAmount = useCallback(
    (amount: string) => {
      const value = parseUnits(amount, decimals);
      if (value <= 0n) {
        throw new Error("Enter an amount greater than zero.");
      }
      return value;
    },
    [decimals],
  );

  const approveFxrp = useCallback(
    async (amount: string) => {
      requireAccount();
      setPendingAction("approve");
      try {
        const hash = await writeContractAsync({
          address: contracts.fxrp,
          abi: fxrpAbi,
          functionName: "approve",
          args: [contracts.vault!, parseAmount(amount)],
          chainId: activeChainId,
        });
        await waitForReceipt(hash);
      } finally {
        setPendingAction(null);
      }
    },
    [activeChainId, contracts, parseAmount, requireAccount, waitForReceipt, writeContractAsync],
  );

  const depositFxrp = useCallback(
    async (amount: string) => {
      const receiver = requireAccount();
      setPendingAction("deposit");
      try {
        const hash = await writeContractAsync({
          address: contracts.vault!,
          abi: vaultAbi,
          functionName: "deposit",
          args: [parseAmount(amount), receiver],
          chainId: activeChainId,
        });
        await waitForReceipt(hash);
      } finally {
        setPendingAction(null);
      }
    },
    [activeChainId, contracts.vault, parseAmount, requireAccount, waitForReceipt, writeContractAsync],
  );

  const withdrawFxrp = useCallback(
    async (amount: string) => {
      const owner = requireAccount();
      setPendingAction("withdraw");
      try {
        const hash = await writeContractAsync({
          address: contracts.vault!,
          abi: vaultAbi,
          functionName: "withdraw",
          args: [parseAmount(amount), owner, owner],
          chainId: activeChainId,
        });
        await waitForReceipt(hash);
      } finally {
        setPendingAction(null);
      }
    },
    [activeChainId, contracts.vault, parseAmount, requireAccount, waitForReceipt, writeContractAsync],
  );

  return useMemo(
    () => ({
      address,
      chain,
      chainId: activeChainId,
      contracts,
      decimals,
      isConnected,
      isCorrectChain:
        isConnected && isSupportedChainId(chainId) && isVaultConfigured,
      isSupportedChain: isSupportedChainId(chainId),
      isVaultConfigured,
      isLoading:
        readsEnabled &&
        (balanceQuery.isLoading ||
          allowanceQuery.isLoading ||
          positionQuery.isLoading ||
          totalAssetsQuery.isLoading),
      fxrpBalanceRaw: balanceQuery.data,
      allowanceRaw: allowanceQuery.data,
      vaultAssetsRaw,
      vaultSharesRaw,
      totalAssetsRaw: totalAssetsQuery.data,
      strategyGrossAssetsRaw: strategyGrossAssetsQuery.data,
      strategyNetAssetsRaw: strategyNetAssetsQuery.data,
      strategySharePriceRaw: strategySharePriceQuery.data,
      availableLiquidityRaw: availableLiquidityQuery.data,
      withdrawableAssetsRaw,
      fxrpBalance: displayAmount(balanceQuery.data, decimals),
      vaultAssets: displayAmount(vaultAssetsRaw, decimals),
      vaultShares: displayAmount(vaultSharesRaw, decimals),
      totalAssets: displayAmount(totalAssetsQuery.data, decimals),
      strategyGrossAssets: displayAmount(
        strategyGrossAssetsQuery.data,
        decimals,
      ),
      strategyNetAssets: displayAmount(
        strategyNetAssetsQuery.data,
        decimals,
      ),
      strategySharePrice:
        strategySharePriceQuery.data === undefined
          ? null
          : displayAmount(strategySharePriceQuery.data, decimals),
      availableLiquidity: displayAmount(
        availableLiquidityQuery.data,
        decimals,
      ),
      withdrawableAssets: displayAmount(withdrawableAssetsRaw, decimals),
      activityVersion,
      pendingAction,
      approveFxrp,
      depositFxrp,
      withdrawFxrp,
      refresh,
    }),
    [
      address,
      activeChainId,
      activityVersion,
      availableLiquidityQuery.data,
      allowanceQuery.data,
      allowanceQuery.isLoading,
      approveFxrp,
      balanceQuery.data,
      balanceQuery.isLoading,
      chainId,
      chain,
      contracts,
      decimals,
      depositFxrp,
      isConnected,
      isVaultConfigured,
      pendingAction,
      positionQuery.isLoading,
      readsEnabled,
      refresh,
      withdrawableAssetsRaw,
      strategyGrossAssetsQuery.data,
      strategyNetAssetsQuery.data,
      strategySharePriceQuery.data,
      totalAssetsQuery.data,
      totalAssetsQuery.isLoading,
      vaultAssetsRaw,
      vaultSharesRaw,
      withdrawFxrp,
    ],
  );
}

export type VaultState = ReturnType<typeof useVault>;
