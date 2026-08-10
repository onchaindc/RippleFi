"use client";

import { useCallback, useState } from "react";
import {
  formatEther,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import type { VaultState } from "@/hooks/useVault";
import { fxrpAbi, vaultAbi } from "@/lib/contracts";
import { isSupportedChainId } from "@/lib/networks";

export type PaymentSource = "available" | "vault";

type PaymentRequest = {
  recipient: string;
  amount: string;
  source: PaymentSource;
};

function validateRecipient(recipient: string) {
  const normalized = recipient.trim();

  if (!isAddress(normalized)) {
    throw new Error("Enter a valid recipient address.");
  }

  if (normalized.toLowerCase() === zeroAddress) {
    throw new Error("Payments to the zero address are blocked.");
  }

  return normalized as Address;
}

function formatGasCost(value: bigint) {
  const formatted = formatEther(value);
  const [whole, fraction = ""] = formatted.split(".");
  const decimals = fraction.slice(0, 6).replace(/0+$/, "");

  return decimals ? `${whole}.${decimals}` : whole;
}

export function useSpend(vault: VaultState) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: vault.chainId });
  const { writeContractAsync } = useWriteContract();
  const [isPaying, setIsPaying] = useState(false);
  const {
    decimals,
    fxrpBalanceRaw,
    refresh,
    withdrawableAssetsRaw,
  } = vault;

  const preparePayment = useCallback(
    ({ recipient, amount, source }: PaymentRequest) => {
      if (!address || !isSupportedChainId(chainId)) {
        throw new Error("Connect a wallet on Flare or Coston2.");
      }
      if (!vault.contracts.vault) {
        throw new Error(`${vault.chain.name} vault is not configured yet.`);
      }

      const destination = validateRecipient(recipient);
      let amountRaw: bigint;

      try {
        amountRaw = parseUnits(amount, decimals);
      } catch {
        throw new Error("Enter a valid FXRP amount.");
      }

      if (amountRaw <= 0n) {
        throw new Error("Enter an amount greater than zero.");
      }

      const balance =
        source === "available"
          ? (fxrpBalanceRaw ?? 0n)
          : (withdrawableAssetsRaw ?? 0n);

      if (amountRaw > balance) {
        throw new Error(
          source === "available"
            ? "Amount exceeds your available FXRP balance."
            : "Amount exceeds your vault balance.",
        );
      }

      return { amountRaw, destination, owner: address };
    },
    [
      address,
      chainId,
      decimals,
      fxrpBalanceRaw,
      vault.chain.name,
      vault.contracts.vault,
      withdrawableAssetsRaw,
    ],
  );

  const estimatePayment = useCallback(
    async (request: PaymentRequest) => {
      if (!publicClient) {
        return null;
      }

      const { amountRaw, destination, owner } = preparePayment(request);
      const gas =
        request.source === "available"
          ? await publicClient.estimateContractGas({
              account: owner,
              address: vault.contracts.fxrp,
              abi: fxrpAbi,
              functionName: "transfer",
              args: [destination, amountRaw],
            })
          : await publicClient.estimateContractGas({
              account: owner,
              address: vault.contracts.vault!,
              abi: vaultAbi,
              functionName: "withdraw",
              args: [amountRaw, destination, owner],
            });

      const gasPrice = await publicClient.getGasPrice();

      return {
        gas,
        cost: gas * gasPrice,
        label: `${gas.toLocaleString()} gas (~${formatGasCost(
          gas * gasPrice,
        )} ${vault.chain.nativeCurrency.symbol})`,
      };
    },
    [
      preparePayment,
      publicClient,
      vault.chain.nativeCurrency.symbol,
      vault.contracts.fxrp,
      vault.contracts.vault,
    ],
  );

  const pay = useCallback(
    async (request: PaymentRequest) => {
      if (!publicClient) {
        throw new Error(`${vault.chain.name} RPC client is unavailable.`);
      }

      const { amountRaw, destination, owner } = preparePayment(request);
      setIsPaying(true);

      try {
        let hash: Hash;

        if (request.source === "available") {
          hash = await writeContractAsync({
            address: vault.contracts.fxrp,
            abi: fxrpAbi,
            functionName: "transfer",
            args: [destination, amountRaw],
            chainId: vault.chainId,
          });
        } else {
          hash = await writeContractAsync({
            address: vault.contracts.vault!,
            abi: vaultAbi,
            functionName: "withdraw",
            args: [amountRaw, destination, owner],
            chainId: vault.chainId,
          });
        }

        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error(`Payment reverted on ${vault.chain.name}.`);
        }

        await refresh();
        return hash;
      } finally {
        setIsPaying(false);
      }
    },
    [
      preparePayment,
      publicClient,
      refresh,
      vault.chain.name,
      vault.chainId,
      vault.contracts,
      writeContractAsync,
    ],
  );

  return {
    estimatePayment,
    isPaying,
    pay,
  };
}
