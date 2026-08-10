import {
  decodeEventLog,
  encodeEventTopics,
  formatUnits,
  isAddress,
  parseAbiItem,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { NextResponse } from "next/server";
import { getNetworkContracts } from "@/lib/contracts";
import {
  flare,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";
const HISTORY_LIMIT = 10;

const depositEvent = parseAbiItem(
  "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
);
const withdrawEvent = parseAbiItem(
  "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
);
const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

type ExplorerLog = {
  address: Address;
  blockNumber: string;
  data: `0x${string}`;
  logIndex: string;
  timeStamp?: string;
  topics: Array<Hex | null>;
  transactionHash: Hash;
};

type HistorySource = "deposits" | "transfers" | "withdrawals";

type PendingItem = {
  amountRaw: bigint;
  blockNumber: bigint;
  detail: string;
  hash: Hash;
  kind: "deposit" | "spend" | "withdraw";
  label: string;
  logIndex: bigint;
  timestamp?: number;
};

function parseNumber(value: string | undefined) {
  if (!value) {
    return 0n;
  }
  return BigInt(value);
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function cleanTopics(topics: Array<Hex | null>) {
  return topics.filter((topic): topic is Hex => topic !== null) as [
    signature: Hex,
    ...args: Hex[],
  ];
}

async function fetchExplorerLogs(
  chainId: SupportedChainId,
  source: HistorySource,
  fromBlock: bigint,
  params: Record<string, string>,
) {
  const explorerApi =
    chainId === flare.id
      ? "https://flare-explorer.flare.network/api"
      : "https://coston2-explorer.flare.network/api";
  const query = new URLSearchParams({
    action: "getLogs",
    fromBlock: fromBlock.toString(),
    module: "logs",
    toBlock: "latest",
    ...params,
  });
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${explorerApi}?${query}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        throw new Error(`${source} returned HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        message: string;
        result: ExplorerLog[] | string;
        status: string;
      };
      if (payload.status === "0") {
        if (
          /no (records|logs) found/i.test(payload.message) ||
          (Array.isArray(payload.result) && payload.result.length === 0) ||
          (typeof payload.result === "string" &&
            /no (records|logs) found/i.test(payload.result))
        ) {
          return [];
        }
        throw new Error(
          typeof payload.result === "string"
            ? payload.result
            : `${source} log query failed`,
        );
      }
      return Array.isArray(payload.result) ? payload.result : [];
    } catch (error) {
      lastError = error;
      await new Promise((resolve) =>
        setTimeout(resolve, 250 * 2 ** attempt),
      );
    }
  }

  throw lastError;
}

function topicParams(
  contracts: ReturnType<typeof getNetworkContracts>,
  event: typeof depositEvent | typeof withdrawEvent | typeof transferEvent,
  indexedPosition: 1 | 2 | 3,
  address: Address,
) {
  const topics = encodeEventTopics({
    abi: [event],
    args:
      indexedPosition === 1
        ? { from: address }
        : indexedPosition === 2
          ? { owner: address }
          : { owner: address },
    eventName: event.name,
  });
  const topic0 = topics[0];
  const indexedTopic = topics[indexedPosition];
  if (typeof topic0 !== "string" || typeof indexedTopic !== "string") {
    throw new Error(`Could not encode ${event.name} history topics.`);
  }
  return {
    address:
      event.name === "Transfer" ? contracts.fxrp : contracts.vault!,
    topic0,
    [`topic${indexedPosition}`]: indexedTopic,
    [`topic0_${indexedPosition}_opr`]: "and",
  };
}

export async function GET(request: Request) {
  const addressValue = new URL(request.url).searchParams.get("address");
  const chainIdValue = Number(
    new URL(request.url).searchParams.get("chainId"),
  );
  if (!addressValue || !isAddress(addressValue)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }
  if (!isSupportedChainId(chainIdValue)) {
    return NextResponse.json(
      { error: "A supported chain ID is required." },
      { status: 400 },
    );
  }
  const contracts = getNetworkContracts(chainIdValue);
  if (!contracts.vault || contracts.vaultDeploymentBlock === null) {
    return NextResponse.json(
      { error: "Vault history is not configured for this network yet." },
      { status: 409 },
    );
  }
  const address = addressValue as Address;

  const results = await Promise.allSettled([
    fetchExplorerLogs(
      chainIdValue,
      "deposits",
      contracts.vaultDeploymentBlock,
      topicParams(contracts, depositEvent, 2, address),
    ),
    fetchExplorerLogs(
      chainIdValue,
      "withdrawals",
      contracts.vaultDeploymentBlock,
      topicParams(contracts, withdrawEvent, 3, address),
    ),
    fetchExplorerLogs(
      chainIdValue,
      "transfers",
      contracts.vaultDeploymentBlock,
      topicParams(contracts, transferEvent, 1, address),
    ),
  ]);
  const sources: HistorySource[] = [
    "deposits",
    "withdrawals",
    "transfers",
  ];
  const failedSources = results.flatMap((result, index) =>
    result.status === "rejected" ? [sources[index]] : [],
  );
  if (failedSources.length === sources.length) {
    return NextResponse.json(
      {
        error: `${chainIdValue === flare.id ? "Flare" : "Coston2"} history providers are temporarily unavailable.`,
      },
      { status: 503 },
    );
  }

  const [depositLogs, withdrawalLogs, transferLogs] = results.map(
    (result) => (result.status === "fulfilled" ? result.value : []),
  );
  let depositedRaw = 0n;
  let withdrawnRaw = 0n;
  const items: PendingItem[] = [];

  for (const log of depositLogs) {
    const decoded = decodeEventLog({
      abi: [depositEvent],
      data: log.data,
      topics: cleanTopics(log.topics),
    });
    const assets = decoded.args.assets;
    depositedRaw += assets;
    items.push({
      amountRaw: assets,
      blockNumber: parseNumber(log.blockNumber),
      detail: `${formatUnits(decoded.args.shares, 6)} rFXRP received`,
      hash: log.transactionHash,
      kind: "deposit",
      label: "Deposited",
      logIndex: parseNumber(log.logIndex),
      timestamp: Number(parseNumber(log.timeStamp)),
    });
  }

  for (const log of withdrawalLogs) {
    const decoded = decodeEventLog({
      abi: [withdrawEvent],
      data: log.data,
      topics: cleanTopics(log.topics),
    });
    const { assets, receiver, shares } = decoded.args;
    withdrawnRaw += assets;
    const isWithdrawal = sameAddress(receiver, address);
    items.push({
      amountRaw: assets,
      blockNumber: parseNumber(log.blockNumber),
      detail: isWithdrawal
        ? `${formatUnits(shares, 6)} rFXRP redeemed`
        : `To ${shortAddress(receiver)} from vault`,
      hash: log.transactionHash,
      kind: isWithdrawal ? "withdraw" : "spend",
      label: isWithdrawal ? "Withdrew" : "Paid from vault",
      logIndex: parseNumber(log.logIndex),
      timestamp: Number(parseNumber(log.timeStamp)),
    });
  }

  for (const log of transferLogs) {
    const decoded = decodeEventLog({
      abi: [transferEvent],
      data: log.data,
      topics: cleanTopics(log.topics),
    });
    const { to, value } = decoded.args;
    if (sameAddress(to, contracts.vault)) {
      continue;
    }
    items.push({
      amountRaw: value,
      blockNumber: parseNumber(log.blockNumber),
      detail: `To ${shortAddress(to)} from balance`,
      hash: log.transactionHash,
      kind: "spend",
      label: "Paid from balance",
      logIndex: parseNumber(log.logIndex),
      timestamp: Number(parseNumber(log.timeStamp)),
    });
  }

  const recentItems = items
    .sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber > right.blockNumber ? -1 : 1;
      }
      return left.logIndex > right.logIndex ? -1 : 1;
    })
    .slice(0, HISTORY_LIMIT)
    .map((item) => ({
      amountRaw: item.amountRaw.toString(),
      detail: item.detail,
      hash: item.hash,
      kind: item.kind,
      label: item.label,
      timestamp: item.timestamp,
    }));

  return NextResponse.json({
    depositedRaw: depositedRaw.toString(),
    failedSources,
    items: recentItems,
    partial: failedSources.length > 0,
    withdrawnRaw: withdrawnRaw.toString(),
  });
}
