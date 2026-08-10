import "server-only";

import type { Address } from "viem";
import {
  isAutoHedgeRule,
  type AutoHedgeRule,
} from "@/lib/autoHedge";
import type { SupportedChainId } from "@/lib/networks";
import {
  isHyperliquidLink,
  type HyperliquidLink,
} from "@/lib/hyperliquidLink";

type RedisResponse<T> = {
  error?: string;
  result?: T;
};

function getRedisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();
  return url && token ? { token, url: url.replace(/\/+$/, "") } : null;
}

export function hasSharedAutoHedgeStore() {
  return getRedisConfig() !== null;
}

function storageKey(wallet: Address, chainId: SupportedChainId) {
  return `ripplefi:auto-hedge:v1:${chainId}:${wallet.toLowerCase()}`;
}

function hyperliquidLinkKey(
  wallet: Address,
  chainId: SupportedChainId,
) {
  return `ripplefi:auto-hedge:hyperliquid:v1:${chainId}:${wallet.toLowerCase()}`;
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  const config = getRedisConfig();
  if (!config) {
    throw new Error("Shared Auto-Hedge storage is not configured.");
  }
  const response = await fetch(config.url, {
    body: JSON.stringify(command),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as
    | RedisResponse<T>
    | null;
  if (!response.ok || !body || body.error) {
    throw new Error(
      body?.error ||
        `Shared Auto-Hedge storage failed with status ${response.status}.`,
    );
  }
  return body.result as T;
}

export async function loadHyperliquidLink(
  wallet: Address,
  chainId: SupportedChainId,
) {
  if (!hasSharedAutoHedgeStore()) {
    return null;
  }
  const stored = await redisCommand<string | null>([
    "GET",
    hyperliquidLinkKey(wallet, chainId),
  ]);
  if (!stored) {
    return null;
  }
  const parsed = JSON.parse(stored) as unknown;
  if (!isHyperliquidLink(parsed, wallet, chainId)) {
    throw new Error("Hyperliquid account linkage is malformed.");
  }
  return parsed;
}

export async function saveHyperliquidLink(link: HyperliquidLink) {
  await redisCommand<string>([
    "SET",
    hyperliquidLinkKey(link.wallet, link.chainId),
    JSON.stringify(link),
  ]);
  return link;
}

export async function deleteHyperliquidLink(
  wallet: Address,
  chainId: SupportedChainId,
) {
  await redisCommand<number>([
    "DEL",
    hyperliquidLinkKey(wallet, chainId),
  ]);
}

export async function loadSharedAutoHedgeRule(
  wallet: Address,
  chainId: SupportedChainId,
) {
  if (!hasSharedAutoHedgeStore()) {
    return null;
  }
  const stored = await redisCommand<string | null>([
    "GET",
    storageKey(wallet, chainId),
  ]);
  if (!stored) {
    return null;
  }
  const parsed = JSON.parse(stored) as unknown;
  if (!isAutoHedgeRule(parsed, wallet, chainId)) {
    throw new Error("Shared Auto-Hedge state is malformed.");
  }
  return parsed;
}

const COMPARE_AND_SET_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current then
  local decoded = cjson.decode(current)
  if tostring(decoded.updatedAt) ~= ARGV[1] then
    return current
  end
elseif ARGV[1] ~= "" then
  return "__AUTO_HEDGE_MISSING__"
end
redis.call("SET", KEYS[1], ARGV[2])
return ARGV[2]
`;

export async function compareAndSetSharedAutoHedgeRule(
  rule: AutoHedgeRule,
  expectedUpdatedAt: number | null,
) {
  const result = await redisCommand<string>([
    "EVAL",
    COMPARE_AND_SET_SCRIPT,
    "1",
    storageKey(rule.owner, rule.chainId),
    expectedUpdatedAt === null ? "" : String(expectedUpdatedAt),
    JSON.stringify(rule),
  ]);
  if (result === "__AUTO_HEDGE_MISSING__") {
    return { applied: false, rule: null };
  }
  const parsed = JSON.parse(result) as unknown;
  if (!isAutoHedgeRule(parsed, rule.owner, rule.chainId)) {
    throw new Error("Shared Auto-Hedge state returned malformed data.");
  }
  return {
    applied:
      parsed.id === rule.id && parsed.updatedAt === rule.updatedAt,
    rule: parsed,
  };
}
