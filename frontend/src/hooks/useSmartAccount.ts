"use client";

import { useState } from "react";
import { formatUnits, zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";
import {
  assetManagerAbi,
  fxrpAbi,
  masterAccountControllerAbi,
  vaultAbi,
} from "@/lib/contracts";
import {
  buildSmartDepositInstruction,
  buildSmartSpendInstruction,
  COSTON2_SMART_ACCOUNT_WALLET_ID,
  isLikelyClassicXrplAddress,
  type SmartDepositInstruction,
  type SmartSpendInstruction,
} from "@/lib/smartAccounts";
import type { VaultState } from "@/hooks/useVault";

export type SmartAccountDetails = {
  deployed: boolean;
  directMintExecutorFee: bigint;
  directMintFeeBips: bigint;
  directMintMinimumFee: bigint;
  directMintPaymentAddress: string;
  executor: Address;
  fxrpBalance: bigint;
  nonce: bigint;
  personalAccount: Address;
  providerWallets: readonly string[];
  vaultAssets: bigint;
  vaultShares: bigint;
  vaultWithdrawable: bigint;
  xrplOwner: string;
};

export function useSmartAccount(vault: VaultState) {
  const { chain, chainId, contracts, decimals } = vault;
  const publicClient = usePublicClient({ chainId });
  const [details, setDetails] = useState<SmartAccountDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function resolveAccount(xrplOwner: string) {
    const owner = xrplOwner.trim();

    if (!isLikelyClassicXrplAddress(owner)) {
      throw new Error("Enter a valid XRPL classic address beginning with r.");
    }

    if (!publicClient) {
      throw new Error(`${chain.name} RPC client is unavailable.`);
    }
    if (!contracts.vault) {
      throw new Error(`${chain.name} vault is not configured yet.`);
    }

    setIsLoading(true);
    try {
      const personalAccount = await publicClient.readContract({
        address: contracts.smartAccounts.masterAccountController,
        abi: masterAccountControllerAbi,
        functionName: "getPersonalAccount",
        args: [owner],
      });

      const [
        code,
        nonce,
        executor,
        providerWallets,
        directMintExecutorFee,
        directMintFeeBips,
        directMintMinimumFee,
        directMintPaymentAddress,
        fxrpBalance,
        position,
        vaultWithdrawable,
      ] =
        await Promise.all([
          publicClient.getCode({ address: personalAccount }),
          publicClient.readContract({
            address: contracts.smartAccounts.masterAccountController,
            abi: masterAccountControllerAbi,
            functionName: "getNonce",
            args: [personalAccount],
          }),
          publicClient.readContract({
            address: contracts.smartAccounts.masterAccountController,
            abi: masterAccountControllerAbi,
            functionName: "getExecutor",
            args: [personalAccount],
          }),
          publicClient.readContract({
            address: contracts.smartAccounts.masterAccountController,
            abi: masterAccountControllerAbi,
            functionName: "getXrplProviderWallets",
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
          publicClient.readContract({
            address: contracts.smartAccounts.assetManager,
            abi: assetManagerAbi,
            functionName: "directMintingPaymentAddress",
          }),
          publicClient.readContract({
            address: contracts.fxrp,
            abi: fxrpAbi,
            functionName: "balanceOf",
            args: [personalAccount],
          }),
          publicClient.readContract({
            address: contracts.vault,
            abi: vaultAbi,
            functionName: "getUserInfo",
            args: [personalAccount],
          }),
          publicClient.readContract({
            address: contracts.vault,
            abi: vaultAbi,
            functionName: "maxWithdraw",
            args: [personalAccount],
          }),
        ]);

      const nextDetails: SmartAccountDetails = {
        deployed: Boolean(code && code !== "0x"),
        directMintExecutorFee,
        directMintFeeBips,
        directMintMinimumFee,
        directMintPaymentAddress,
        executor,
        fxrpBalance,
        nonce,
        personalAccount,
        providerWallets,
        vaultAssets: position[0],
        vaultShares: position[1],
        vaultWithdrawable,
        xrplOwner: owner,
      };

      setDetails(nextDetails);
      return nextDetails;
    } finally {
      setIsLoading(false);
    }
  }

  function prepareDeposit({
    amount,
    walletId = COSTON2_SMART_ACCOUNT_WALLET_ID,
  }: {
    amount: string;
    walletId?: number;
  }): SmartDepositInstruction {
    if (!details) {
      throw new Error("Resolve an XRPL Smart Account first.");
    }
    if (!contracts.vault) {
      throw new Error(`${chain.name} vault is not configured yet.`);
    }

    return buildSmartDepositInstruction({
      amount,
      chainId,
      contracts: {
        fxrp: contracts.fxrp,
        vault: contracts.vault,
      },
      decimals,
      directMintingExecutorFee: details.directMintExecutorFee,
      directMintingFeeBips: details.directMintFeeBips,
      directMintingMinimumFee: details.directMintMinimumFee,
      memoExecutorFee: 0n,
      nonce: details.nonce,
      personalAccount: details.personalAccount,
      walletId,
    });
  }

  function prepareSpend({
    amount,
    recipient,
    source,
  }: {
    amount: string;
    recipient: string;
    source: "available" | "vault";
  }): SmartSpendInstruction {
    if (!details) {
      throw new Error("Resolve an XRPL Smart Account first.");
    }
    if (!contracts.vault) {
      throw new Error(`${chain.name} vault is not configured yet.`);
    }
    return buildSmartSpendInstruction({
      amount,
      availableBalance: details.fxrpBalance,
      chainId,
      contracts: {
        fxrp: contracts.fxrp,
        vault: contracts.vault,
      },
      decimals,
      directMintingExecutorFee: details.directMintExecutorFee,
      directMintingFeeBips: details.directMintFeeBips,
      directMintingMinimumFee: details.directMintMinimumFee,
      nonce: details.nonce,
      personalAccount: details.personalAccount,
      recipient,
      source,
      vaultBalance: details.vaultWithdrawable,
    });
  }

  return {
    details,
    isLoading,
    prepareDeposit,
    prepareSpend,
    resolveAccount,
    formatBalance(value: bigint) {
      return formatUnits(value, decimals);
    },
    hasPinnedExecutor:
      Boolean(details) && details?.executor !== zeroAddress,
  };
}
