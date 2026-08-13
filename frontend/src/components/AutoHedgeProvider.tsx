"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  isAddress,
  parseSignature,
  toHex,
  type Address,
  type SignTypedDataParameters,
  type WalletClient,
} from "viem";
import {
  useAccount,
  useSignMessage,
  useWalletClient,
} from "wagmi";
import { useFtsoXrpPrice } from "@/hooks/useFtsoXrpPrice";
import {
  isAutoHedgeRule,
  createPendingExecution,
  createHedgeIntent,
  evaluateHedgeTrigger,
  type AutoHedgeRule,
  type AutoHedgeTriggerType,
  type HedgeExecutionEvent,
  type HedgeIntent,
} from "@/lib/autoHedge";
import { buildAutoHedgeAuthMessage } from "@/lib/autoHedgeAuth";
import {
  DEFAULT_CHAIN_ID,
  isSupportedChainId,
  type SupportedChainId,
} from "@/lib/networks";
import {
  isHyperliquidLink,
  type HyperliquidLink,
  type HyperliquidNetwork,
} from "@/lib/hyperliquidLink";

type ArmRuleInput = {
  hedgeAmountFxrp: string;
  hedgeSizePercent: number;
  positionFxrp: string;
  threshold: string;
  triggerType: AutoHedgeTriggerType;
};

// Wallet signatures are user-paced: a popup can stay unopened or unanswered for
// minutes. A hard timeout turns that silent stall into an explicit error the
// UI can show, instead of leaving the button stuck on "Waiting for approval".
const WALLET_SIGNATURE_TIMEOUT_MS = 120_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Hyperliquid gives each account a limited number of API-wallet (agent)
// slots. When the slot is already occupied - e.g. by a stale RippleFI agent
// left over from an earlier approve that Hyperliquid accepted but the app
// never confirmed - approving again fails with "Extra agent already used".
// The account's registered agents are readable through the info endpoint, and
// an agent is removed with an off-chain withdraw3 L1 action (amount 0,
// destination = the agent address) signed exactly like approveAgent.
const HL_AGENT_NAME = "RippleFI";

type HyperliquidAgentRecord = {
  address: Address;
  name: string;
};

function hyperliquidInfoUrl(network: HyperliquidNetwork) {
  return network === "mainnet"
    ? "https://api.hyperliquid.xyz/info"
    : "https://api.hyperliquid-testnet.xyz/info";
}

function hyperliquidExchangeUrl(network: HyperliquidNetwork) {
  return network === "mainnet"
    ? "https://api.hyperliquid.xyz/exchange"
    : "https://api.hyperliquid-testnet.xyz/exchange";
}

async function fetchHyperliquidAgents(
  link: HyperliquidLink,
): Promise<HyperliquidAgentRecord[] | null> {
  try {
    const response = await fetch(hyperliquidInfoUrl(link.network), {
      body: JSON.stringify({
        type: "extraAgents",
        user: link.masterAccount,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      return null;
    }
    const agents: HyperliquidAgentRecord[] = [];
    for (const entry of body) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.address !== "string" || !isAddress(record.address)) {
        continue;
      }
      agents.push({
        address: record.address.toLowerCase() as Address,
        name: typeof record.name === "string" ? record.name : "",
      });
    }
    return agents;
  } catch (error) {
    console.warn("[RippleFI] Hyperliquid extraAgents query failed", error);
    return null;
  }
}

async function postHyperliquidAction(
  link: HyperliquidLink,
  action: Record<string, unknown>,
  signature: { r: string; s: string; v: number },
  nonce: number,
) {
  const response = await fetch(hyperliquidExchangeUrl(link.network), {
    body: JSON.stringify({ action, nonce, signature }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body: {
    response?: unknown;
    status?: string;
    error?: unknown;
  } | null = null;
  try {
    body = JSON.parse(raw) as {
      response?: unknown;
      status?: string;
      error?: unknown;
    };
  } catch {
    // Non-JSON error bodies (rate limits, proxies, ...) are surfaced raw.
  }
  return { body, raw, status: response.status };
}

// Hyperliquid reports rejections as {status:"err", response:"<reason>"} or
// HTTP 400 {error:"<reason>"}; anything else falls back to the raw body so
// the exact reason always reaches the UI.
function hyperliquidRejection(
  body: { response?: unknown; status?: string; error?: unknown } | null,
  raw: string,
) {
  if (typeof body?.response === "string" && body.response.length > 0) {
    return body.response;
  }
  if (typeof body?.error === "string" && body.error.length > 0) {
    return body.error;
  }
  if (body?.status === "err") {
    return "Hyperliquid rejected the request.";
  }
  const trimmed = raw.trim();
  if (trimmed && trimmed !== "null") {
    return trimmed.slice(0, 300);
  }
  return null;
}

// Hyperliquid blocks every action (including agent approval) until the
// account has received its first deposit. Give the user the exact fix.
function depositHint(rejection: string, network: HyperliquidNetwork) {
  return /must deposit/i.test(rejection)
    ? network === "mainnet"
      ? " Deposit USDC into your Hyperliquid account first (app.hyperliquid.xyz → Deposit)."
      : " The account must first hold USDC on Hyperliquid testnet - claim 1,000 mock USDC at https://app.hyperliquid-testnet.xyz/drip after depositing on mainnet from the same wallet."
    : "";
}

// Sign any Hyperliquid off-chain L1 action (approveAgent, withdraw3, ...) with
// the wallet's LIVE chain. See approveHyperliquidAgent for why the tracked
// wagmi chain is never used here.
async function signHyperliquidAction(
  walletClient: WalletClient,
  address: Address,
  expectedChainId: number,
  request: {
    message: Record<string, unknown>;
    primaryType: string;
    types: Record<string, readonly { name: string; type: string }[]>;
  },
) {
  let walletChainId: number;
  try {
    walletChainId = await walletClient.getChainId();
  } catch (error) {
    console.error("[RippleFI] Hyperliquid wallet chain read failed", error);
    throw new Error(
      "Your wallet's network could not be detected. Reconnect and try again.",
    );
  }
  const signatureChainId = toHex(walletChainId);
  if (walletChainId !== expectedChainId) {
    console.warn(
      "[RippleFI] Hyperliquid wallet chain differs from app chain",
      { appChainId: expectedChainId, walletChainId },
    );
  }
  console.info("[RippleFI] Hyperliquid signature requested", {
    domainChainId: walletChainId,
    signatureChainId,
    walletChainId,
  });
  const signature = await withTimeout(
    walletClient.signTypedData({
      account: address,
      domain: {
        chainId: walletChainId,
        name: "HyperliquidSignTransaction",
        verifyingContract: "0x0000000000000000000000000000000000000000",
        version: "1",
      },
      message: request.message,
      primaryType: request.primaryType,
      types: request.types,
      // The typed-data shapes are fixed Hyperliquid literals provided by the
      // callers; viem's strict per-type inference cannot follow the dynamic
      // request object, so cast to its parameter type.
    } as unknown as SignTypedDataParameters),
    WALLET_SIGNATURE_TIMEOUT_MS,
    "The wallet request didn't open or wasn't answered in time. Open your wallet and try again.",
  );
  console.info("[RippleFI] Hyperliquid signature received", {
    walletChainId,
  });
  const parsed = parseSignature(signature);
  return {
    r: parsed.r,
    s: parsed.s,
    v:
      parsed.v !== undefined
        ? Number(parsed.v)
        : (parsed.yParity ?? 0) + 27,
    signatureChainId,
  };
}

type AutoHedgeContextValue = {
  arm: (input: ArmRuleInput) => Promise<void>;
  chainId: SupportedChainId;
  disarm: () => Promise<void>;
  disconnectHyperliquid: () => Promise<void>;
  enableHyperliquid: () => Promise<void>;
  hyperliquidLink: HyperliquidLink | null;
  isHyperliquidBusy: boolean;
  isExecuting: boolean;
  isHydrated: boolean;
  isSyncing: boolean;
  price: ReturnType<typeof useFtsoXrpPrice>;
  rule: AutoHedgeRule | null;
  shared: boolean;
  syncError: string | null;
};

const AutoHedgeContext = createContext<AutoHedgeContextValue | null>(null);

function storageKey(chainId: SupportedChainId, owner: Address | undefined) {
  return owner
    ? `ripplefi:auto-hedge:v1:${chainId}:${owner.toLowerCase()}`
    : null;
}

function sessionStorageKey(
  chainId: SupportedChainId,
  owner: Address | undefined,
) {
  return owner
    ? `ripplefi:auto-hedge-session:v1:${chainId}:${owner.toLowerCase()}`
    : null;
}

function readStoredSession(key: string) {
  const token = localStorage.getItem(key);
  if (!token) {
    return null;
  }
  try {
    const [encodedPayload] = token.split(".");
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(paddedBase64)) as {
      expiresAt?: number;
    };
    if (typeof payload.expiresAt === "number" && payload.expiresAt > Date.now()) {
      return token;
    }
  } catch {
    // Invalid or expired sessions are replaced after the next wallet signature.
  }
  localStorage.removeItem(key);
  return null;
}

async function fetchSharedRule(
  owner: Address,
  chainId: SupportedChainId,
) {
  const response = await fetch(
    `/api/auto-hedge/state?wallet=${owner}&chainId=${chainId}`,
    { cache: "no-store" },
  );
  const body = (await response.json()) as {
    error?: string;
    rule?: unknown;
    shared?: boolean;
  };
  if (!response.ok) {
    throw new Error(body.error || "Auto-Hedge state could not be loaded.");
  }
  return {
    rule: isAutoHedgeRule(body.rule, owner, chainId) ? body.rule : null,
    shared: body.shared === true,
  };
}

async function fetchHyperliquidLink(
  owner: Address,
  chainId: SupportedChainId,
) {
  const response = await fetch(
    `/api/auto-hedge/hyperliquid-link?wallet=${owner}&chainId=${chainId}`,
    { cache: "no-store" },
  );
  const body = (await response.json()) as {
    error?: string;
    link?: unknown;
  };
  if (!response.ok) {
    throw new Error(
      body.error || "Hyperliquid connection could not be loaded.",
    );
  }
  return isHyperliquidLink(body.link, owner, chainId)
    ? body.link
    : null;
}

function readStoredRule(
  key: string,
  chainId: SupportedChainId,
  owner: Address,
) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null") as
      | (Omit<AutoHedgeRule, "lastExecution" | "lastIntent"> & {
          lastExecution?: {
            adapter?: string | null;
            adapterMode?: "record" | "live" | null;
            completedAt?: number | null;
            direction?: "short" | null;
            error?: string | null;
            executionId?: string | null;
            externalOrderId?: string | null;
            market?: string | null;
            message?: string;
            network?: string | null;
            orderType?: string | null;
            recordedAt?: number;
            requestedAt?: number;
            size?: string | null;
            status?: string;
            venue?: string | null;
          } | null;
          lastIntent?: HedgeIntent | null;
        })
      | null;
    if (
      parsed?.version === 1 &&
      parsed.chainId === chainId &&
      typeof parsed.owner === "string" &&
      parsed.owner.toLowerCase() === owner.toLowerCase() &&
      isAddress(parsed.owner) &&
      typeof parsed.id === "string" &&
      typeof parsed.enabled === "boolean" &&
      typeof parsed.threshold === "string" &&
      typeof parsed.referencePriceUsd === "string" &&
      typeof parsed.lastObservedPriceUsd === "string" &&
      typeof parsed.positionFxrp === "string" &&
      typeof parsed.hedgeAmountFxrp === "string" &&
      typeof parsed.hedgeSizePercent === "number" &&
      (parsed.triggerType === "absolute" ||
        parsed.triggerType === "percent-drop") &&
      (parsed.status === "off" ||
        parsed.status === "armed" ||
        parsed.status === "triggered" ||
        parsed.status === "error")
    ) {
      const legacyExecution = parsed.lastExecution;
      const lastExecution: HedgeExecutionEvent | null =
        legacyExecution?.status === "recorded"
          ? {
              adapter: legacyExecution.adapter ?? "record-intent-v1",
              adapterMode: "record" as const,
              completedAt: legacyExecution.recordedAt ?? parsed.updatedAt,
              direction: "short" as const,
              error: null,
              executionId: legacyExecution.executionId ?? null,
              externalOrderId: null,
              market: "XRP",
              message: "Hedge intent recorded for execution.",
              network: null,
              orderType: "market",
              requestedAt: parsed.triggeredAt ?? parsed.updatedAt,
              size: parsed.hedgeAmountFxrp,
              status: "success" as const,
              venue: "ripplefi-intent-log",
            }
          : legacyExecution?.status === "pending" ||
              legacyExecution?.status === "success" ||
              legacyExecution?.status === "failed"
            ? {
                adapter: legacyExecution.adapter ?? null,
                adapterMode: legacyExecution.adapterMode ?? null,
                completedAt: legacyExecution.completedAt ?? null,
                direction: legacyExecution.direction ?? "short",
                error: legacyExecution.error ?? null,
                executionId: legacyExecution.executionId ?? null,
                externalOrderId: legacyExecution.externalOrderId ?? null,
                market: legacyExecution.market ?? "XRP",
                message:
                  legacyExecution.message ?? "Execution status restored.",
                network: legacyExecution.network ?? null,
                orderType: legacyExecution.orderType ?? "market",
                requestedAt:
                  legacyExecution.requestedAt ??
                  parsed.triggeredAt ??
                  parsed.updatedAt,
                size: legacyExecution.size ?? parsed.hedgeAmountFxrp,
                status: legacyExecution.status,
                venue: legacyExecution.venue ?? null,
              }
            : null;
      return {
        ...parsed,
        lastExecution,
        lastIntent:
          parsed.lastIntent?.version === 2 ? parsed.lastIntent : null,
      } satisfies AutoHedgeRule;
    }
  } catch {
    return null;
  }
  return null;
}

function executionError(value: unknown) {
  return value instanceof Error ? value.message : "Hedge execution failed.";
}

export function AutoHedgeProvider({ children }: { children: ReactNode }) {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: walletClient } = useWalletClient();
  const activeChainId = isSupportedChainId(chainId)
    ? chainId
    : DEFAULT_CHAIN_ID;
  const key = storageKey(activeChainId, address);
  const sessionKey = sessionStorageKey(activeChainId, address);
  const price = useFtsoXrpPrice(activeChainId);
  const [stored, setStored] = useState<{
    key: string | null;
    rule: AutoHedgeRule | null;
  }>({ key: null, rule: null });
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isHyperliquidBusy, setIsHyperliquidBusy] = useState(false);
  const [hyperliquidLink, setHyperliquidLink] =
    useState<HyperliquidLink | null>(null);
  const [syncState, setSyncState] = useState({
    error: null as string | null,
    isSyncing: false,
    shared: false,
  });
  const executingRuleId = useRef<string | null>(null);
  const rule = stored.key === key ? stored.rule : null;
  const ruleRef = useRef<AutoHedgeRule | null>(null);

  useEffect(() => {
    ruleRef.current = rule;
  }, [rule]);

  useEffect(() => {
    let cancelled = false;
    if (!key || !address) {
      setStored({ key, rule: null });
      setHydratedKey(key);
      return;
    }
    const localRule = readStoredRule(key, activeChainId, address);
    setStored({ key, rule: localRule });
    setHydratedKey(null);
    void fetchSharedRule(address, activeChainId)
      .then((remote) => {
        if (cancelled) {
          return;
        }
        const nextRule = remote.shared ? remote.rule : localRule;
        setStored({ key, rule: nextRule });
        setSyncState({
          error: null,
          isSyncing: false,
          shared: remote.shared,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          setSyncState({
            error: executionError(error),
            isSyncing: false,
            shared: false,
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHydratedKey(key);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeChainId, address, key]);

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setHyperliquidLink(null);
      return;
    }
    void fetchHyperliquidLink(address, activeChainId)
      .then((link) => {
        if (!cancelled) {
          setHyperliquidLink(link);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Hyperliquid linkage hydration failed", error);
          setHyperliquidLink(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeChainId, address]);

  useEffect(() => {
    if (key && stored.key === key && stored.rule) {
      localStorage.setItem(key, JSON.stringify(stored.rule));
    }
  }, [key, stored]);

  const ensureSession = useCallback(
    async (allowPrompt: boolean) => {
      if (!address || !sessionKey) {
        return null;
      }
      const existing = readStoredSession(sessionKey);
      if (existing) {
        return existing;
      }
      if (!allowPrompt) {
        return null;
      }
      const issuedAt = Date.now();
      const signature = await signMessageAsync({
        message: buildAutoHedgeAuthMessage({
          chainId: activeChainId,
          issuedAt,
          wallet: address,
        }),
      });
      const response = await fetch("/api/auto-hedge/session", {
        body: JSON.stringify({
          chainId: activeChainId,
          issuedAt,
          signature,
          wallet: address,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as {
        error?: string;
        token?: string;
      };
      if (!response.ok || !body.token) {
        throw new Error(body.error || "Auto-Hedge sync authorization failed.");
      }
      localStorage.setItem(sessionKey, body.token);
      return body.token;
    },
    [activeChainId, address, sessionKey, signMessageAsync],
  );

  const requestHyperliquidLink = useCallback(
    async (method: "POST" | "PUT") => {
      if (!address) {
        throw new Error("Connect a wallet before enabling protection.");
      }
      const token = await ensureSession(true);
      if (!token) {
        throw new Error("Approve this device before enabling protection.");
      }
      const response = await fetch("/api/auto-hedge/hyperliquid-link", {
        body: JSON.stringify({ chainId: activeChainId, wallet: address }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        method,
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        link?: unknown;
      } | null;
      const link = body?.link;
      if (!response.ok || !isHyperliquidLink(link, address, activeChainId)) {
        throw new Error(
          body?.error || "Hyperliquid protection could not be prepared.",
        );
      }
      setHyperliquidLink(link);
      if (method === "PUT") {
        const persisted =
          link.status === "authorized" && link.authorizedAt !== null;
        console.info("[RippleFI] Hyperliquid authorizedAt persisted", {
          authorizedAt: link.authorizedAt,
          persisted,
          status: link.status,
        });
      }
      return link;
    },
    [activeChainId, address, ensureSession],
  );

  const approveAgentAction = useCallback(
    async (
      link: HyperliquidLink,
      hyperliquidChain: "Mainnet" | "Testnet",
      agentName: string,
    ) => {
      if (!address || !walletClient) {
        throw new Error("Connect your wallet to approve protection.");
      }
      const nonce = Date.now();
      const signed = await signHyperliquidAction(
        walletClient,
        address,
        activeChainId,
        {
          message: {
            agentAddress: link.apiWalletAddress,
            agentName,
            hyperliquidChain,
            nonce: BigInt(nonce),
          },
          primaryType: "HyperliquidTransaction:ApproveAgent",
          types: {
            "HyperliquidTransaction:ApproveAgent": [
              { name: "hyperliquidChain", type: "string" },
              { name: "agentAddress", type: "address" },
              { name: "agentName", type: "string" },
              { name: "nonce", type: "uint64" },
            ],
          },
        },
      );
      const action = {
        agentAddress: link.apiWalletAddress,
        agentName,
        hyperliquidChain,
        // Hyperliquid requires nonce inside the action (must match the outer
        // nonce); omitting it fails deserialization with HTTP 422.
        nonce,
        signatureChainId: signed.signatureChainId,
        type: "approveAgent",
      };
      console.info("[RippleFI] Hyperliquid approval request", {
        action,
        masterAccount: link.masterAccount,
        network: link.network,
        nonce,
        signature: { r: signed.r, s: signed.s, v: signed.v },
      });
      const { body, raw, status } = await postHyperliquidAction(
        link,
        action,
        { r: signed.r, s: signed.s, v: signed.v },
        nonce,
      );
      console.info("[RippleFI] Hyperliquid approval response", {
        body,
        network: link.network,
        signatureChainId: signed.signatureChainId,
        status,
      });
      const rejection = hyperliquidRejection(body, raw);
      if (rejection || body?.status !== "ok") {
        throw new Error(
          rejection
            ? `Hyperliquid rejected the approval: ${rejection}${depositHint(rejection, link.network)}`
            : `Hyperliquid did not accept the protection approval (HTTP ${status})${raw.trim() ? `: ${raw.trim().slice(0, 300)}` : ""}.`,
        );
      }
    },
    [activeChainId, address, walletClient],
  );

  // Hyperliquid removes an agent when a withdraw3 L1 action is sent with
  // amount 0 and the agent's address as destination. The master account signs
  // it just like approveAgent - off-chain, nothing is broadcast on our chain.
  const removeHyperliquidAgent = useCallback(
    async (link: HyperliquidLink, agentAddress: Address) => {
      if (!address || !walletClient) {
        throw new Error("Connect your wallet to update protection.");
      }
      const hyperliquidChain =
        link.network === "mainnet" ? "Mainnet" : "Testnet";
      const nonce = Date.now();
      console.info("[RippleFI] Hyperliquid agent removal clicked", {
        agentAddress,
        network: link.network,
      });
      const signed = await signHyperliquidAction(
        walletClient,
        address,
        activeChainId,
        {
          message: {
            amount: "0",
            destination: agentAddress,
            hyperliquidChain,
            time: BigInt(nonce),
          },
          primaryType: "HyperliquidTransaction:Withdraw",
          types: {
            "HyperliquidTransaction:Withdraw": [
              { name: "hyperliquidChain", type: "string" },
              { name: "destination", type: "string" },
              { name: "amount", type: "string" },
              { name: "time", type: "uint64" },
            ],
          },
        },
      );
      const { body, raw, status } = await postHyperliquidAction(
        link,
        {
          amount: "0",
          destination: agentAddress,
          hyperliquidChain,
          signatureChainId: signed.signatureChainId,
          time: nonce,
          type: "withdraw3",
        },
        { r: signed.r, s: signed.s, v: signed.v },
        nonce,
      );
      console.info("[RippleFI] Hyperliquid agent removal response", {
        agentAddress,
        body,
        signatureChainId: signed.signatureChainId,
        status,
      });
      const rejection = hyperliquidRejection(body, raw);
      if (rejection || body?.status !== "ok") {
        throw new Error(
          rejection
            ? `Hyperliquid could not remove the existing agent ${agentAddress}: ${rejection}${depositHint(rejection, link.network)}`
            : `Hyperliquid could not remove the existing agent ${agentAddress} (HTTP ${status})${raw.trim() ? `: ${raw.trim().slice(0, 300)}` : ""}.`,
        );
      }
    },
    [activeChainId, address, walletClient],
  );

  const approveHyperliquidAgent = useCallback(
    async (link: HyperliquidLink) => {
      if (!address || !walletClient) {
        throw new Error("Connect your wallet to approve protection.");
      }
      if (link.masterAccount.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          "Connect the wallet that owns this Hyperliquid account.",
        );
      }
      console.info("[RippleFI] Hyperliquid approve clicked", {
        appChainId: activeChainId,
        link: {
          apiWalletAddress: link.apiWalletAddress,
          network: link.network,
        },
        wallet: address,
      });

      const hyperliquidChain =
        link.network === "mainnet" ? "Mainnet" : "Testnet";

      // approveAgent is an off-chain Hyperliquid L1 action, not an EVM
      // transaction: nothing is broadcast to the chain we sign on. The EIP-712
      // domain must carry the chain the wallet is *actually on at sign time*,
      // or the wallet rejects the request with
      //   InvalidParamsRpcError: chainId should be same as current chainId
      // and Hyperliquid rebuilds the domain from the signatureChainId we send
      // in the action, so the two must agree exactly.
      //
      // wagmi's tracked chain (useAccount().chainId / walletClient.chain) can
      // be stale or defaulted - e.g. after the user switches networks inside
      // the wallet itself, or a cold hydration race - so it must never be
      // trusted here. eth_chainId reads the live provider state, which is the
      // only value the wallet will accept in the domain.

      // Hyperliquid caps the agents per account, and an earlier approve that
      // Hyperliquid accepted but the app never confirmed leaves a stale agent
      // registered - approving again then fails with "Extra agent already
      // used" (exactly what the production console showed). Read the account's
      // current agents so we can (a) skip signing entirely when our agent is
      // already approved, and (b) remove a stale agent before approving.
      const existingAgents = await fetchHyperliquidAgents(link);
      console.info("[RippleFI] Hyperliquid existing agents", {
        agents: existingAgents,
        masterAccount: link.masterAccount,
        network: link.network,
      });

      if (
        existingAgents?.some(
          (agent) =>
            agent.address === link.apiWalletAddress.toLowerCase(),
        )
      ) {
        console.info(
          "[RippleFI] Hyperliquid agent already approved; skipping signature",
          { apiWalletAddress: link.apiWalletAddress },
        );
        return;
      }

      // A stale RippleFI-named agent blocks same-name replacement on some
      // networks, so remove it before approving.
      const staleAgent = existingAgents?.find(
        (agent) =>
          agent.name === HL_AGENT_NAME &&
          agent.address !== link.apiWalletAddress.toLowerCase(),
      );
      if (staleAgent) {
        await removeHyperliquidAgent(link, staleAgent.address);
      }

      try {
        await approveAgentAction(link, hyperliquidChain, HL_AGENT_NAME);
      } catch (error) {
        // The account's extra-agent slot is occupied by an agent we could not
        // see or replace up front - clear it and retry the approval once.
        const message = error instanceof Error ? error.message : "";
        if (message.includes("Extra agent already used")) {
          const agents =
            existingAgents ?? (await fetchHyperliquidAgents(link));
          const conflict = agents?.find(
            (agent) =>
              agent.address !== link.apiWalletAddress.toLowerCase(),
          );
          if (conflict) {
            console.warn(
              "[RippleFI] Hyperliquid approve rejected; removing conflicting agent and retrying",
              { agentAddress: conflict.address, message },
            );
            await removeHyperliquidAgent(link, conflict.address);
            await approveAgentAction(link, hyperliquidChain, HL_AGENT_NAME);
            return;
          }
        }
        throw error;
      }
    },
    [
      activeChainId,
      address,
      approveAgentAction,
      removeHyperliquidAgent,
      walletClient,
    ],
  );

  const enableHyperliquid = useCallback(async () => {
    setIsHyperliquidBusy(true);
    try {
      const link = await requestHyperliquidLink("POST");
      if (link.status === "authorized") {
        return;
      }
      await approveHyperliquidAgent(link);
      const approved = await requestHyperliquidLink("PUT");
      if (approved.status !== "authorized" || approved.authorizedAt === null) {
        throw new Error(
          "Hyperliquid accepted the approval, but it could not be saved. Try again.",
        );
      }
    } finally {
      setIsHyperliquidBusy(false);
    }
  }, [approveHyperliquidAgent, requestHyperliquidLink]);

  const disconnectHyperliquid = useCallback(async () => {
    if (!address) {
      return;
    }
    setIsHyperliquidBusy(true);
    try {
      const token = await ensureSession(true);
      if (!token) {
        throw new Error("Authorize this device before disconnecting.");
      }
      const response = await fetch(
        `/api/auto-hedge/hyperliquid-link?wallet=${address}&chainId=${activeChainId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error || "Hyperliquid could not be disconnected.",
        );
      }
      setHyperliquidLink(null);
    } finally {
      setIsHyperliquidBusy(false);
    }
  }, [
    activeChainId,
    address,
    ensureSession,
  ]);

  const persistRule = useCallback(
    async (
      nextRule: AutoHedgeRule,
      expectedUpdatedAt: number | null,
      allowPrompt: boolean,
    ) => {
      if (!key) {
        return { applied: true, rule: nextRule, shared: false };
      }
      const previousRule = ruleRef.current;
      setStored({ key, rule: nextRule });
      ruleRef.current = nextRule;
      setSyncState((current) => ({ ...current, isSyncing: true }));
      try {
        const token = await ensureSession(allowPrompt);
        if (!token) {
          if (syncState.shared) {
            throw new Error(
              "Authorize Auto-Hedge sync on this device before changing or executing the rule.",
            );
          }
          return { applied: true, rule: nextRule, shared: false };
        }
        const response = await fetch("/api/auto-hedge/state", {
          body: JSON.stringify({ expectedUpdatedAt, rule: nextRule }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          method: "PUT",
        });
        const body = (await response.json()) as {
          applied?: boolean;
          error?: string;
          rule?: unknown;
        };
        const savedRule = isAutoHedgeRule(
          body.rule,
          address,
          activeChainId,
        )
          ? body.rule
          : null;
        if (!savedRule || (response.status !== 409 && !response.ok)) {
          if (response.status === 401 && sessionKey) {
            localStorage.removeItem(sessionKey);
          }
          throw new Error(body.error || "Auto-Hedge state could not be saved.");
        }
        setStored({ key, rule: savedRule });
        ruleRef.current = savedRule;
        setSyncState({ error: null, isSyncing: false, shared: true });
        return {
          applied: body.applied === true,
          rule: savedRule,
          shared: true,
        };
      } catch (error) {
        const canUseLocalFallback = !syncState.shared;
        if (!canUseLocalFallback) {
          setStored({ key, rule: previousRule });
          ruleRef.current = previousRule;
        }
        setSyncState({
          error: executionError(error),
          isSyncing: false,
          shared: syncState.shared,
        });
        return {
          applied: canUseLocalFallback,
          rule: canUseLocalFallback ? nextRule : previousRule,
          shared: syncState.shared,
        };
      } finally {
        setSyncState((current) => ({ ...current, isSyncing: false }));
      }
    },
    [
      activeChainId,
      address,
      ensureSession,
      key,
      sessionKey,
      syncState.shared,
    ],
  );

  const arm = useCallback(
    async (input: ArmRuleInput) => {
      if (!address || !key) {
        throw new Error("Connect a wallet before enabling Auto-Hedge.");
      }
      if (!price.data || price.error) {
        throw new Error("Wait for the live FTSO XRP price.");
      }
      const threshold = Number(input.threshold);
      if (!Number.isFinite(threshold) || threshold <= 0) {
        throw new Error("Enter a valid protection threshold.");
      }
      if (input.triggerType === "percent-drop" && threshold >= 100) {
        throw new Error("Percent drop must be below 100%.");
      }
      if (
        input.triggerType === "absolute" &&
        threshold >= Number(price.data.priceUsd)
      ) {
        throw new Error("Absolute threshold must be below the live XRP price.");
      }
      if (
        !Number.isFinite(input.hedgeSizePercent) ||
        input.hedgeSizePercent <= 0 ||
        input.hedgeSizePercent > 100
      ) {
        throw new Error("Hedge size must be between 1% and 100%.");
      }
      if (Number(input.positionFxrp) <= 0 || Number(input.hedgeAmountFxrp) <= 0) {
        throw new Error("An FXRP position is required to arm Auto-Hedge.");
      }

      const now = Date.now();
      const nextRule: AutoHedgeRule = {
        chainId: activeChainId,
        createdAt: now,
        enabled: true,
        error: null,
        hedgeAmountFxrp: input.hedgeAmountFxrp,
        hedgeSizePercent: input.hedgeSizePercent,
        id: crypto.randomUUID(),
        lastExecution: null,
        lastIntent: null,
        lastObservedPriceUsd: price.data.priceUsd,
        owner: address,
        positionFxrp: input.positionFxrp,
        referencePriceUsd: price.data.priceUsd,
        status: "armed",
        threshold: input.threshold,
        triggeredAt: null,
        triggerType: input.triggerType,
        updatedAt: now,
        version: 1,
      };
      const result = await persistRule(
        nextRule,
        ruleRef.current?.updatedAt ?? null,
        true,
      );
      if (!result.applied) {
        throw new Error(
          "A newer Auto-Hedge update was found. The latest shared state has been loaded.",
        );
      }
    },
    [activeChainId, address, key, persistRule, price.data, price.error],
  );

  const disarm = useCallback(async () => {
    const current = ruleRef.current;
    if (!current) {
      return;
    }
    const nextRule: AutoHedgeRule = {
      ...current,
      enabled: false,
      error: null,
      status: "off",
      updatedAt: Date.now(),
    };
    const result = await persistRule(
      nextRule,
      current.updatedAt,
      true,
    );
    if (!result.applied) {
      throw new Error(
        "A newer Auto-Hedge update was found. The latest shared state has been loaded.",
      );
    }
  }, [persistRule]);

  useEffect(() => {
    if (!address || !key || hydratedKey !== key) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const remote = await fetchSharedRule(address, activeChainId);
        if (cancelled) {
          return;
        }
        const current = ruleRef.current;
        if (
          remote.rule &&
          (!current || remote.rule.updatedAt > current.updatedAt)
        ) {
          setStored({ key, rule: remote.rule });
          ruleRef.current = remote.rule;
        }
        setSyncState({
          error: null,
          isSyncing: false,
          shared: remote.shared,
        });
      } catch (error) {
        if (!cancelled) {
          setSyncState((current) => ({
            ...current,
            error: executionError(error),
            isSyncing: false,
          }));
        }
      }
    };
    const onFocus = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    const interval = window.setInterval(() => void refresh(), 5_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeChainId, address, hydratedKey, key]);

  useEffect(() => {
    if (
      !rule?.enabled ||
      rule.status !== "armed" ||
      !price.data ||
      price.data.chainId !== rule.chainId ||
      executingRuleId.current === rule.id
    ) {
      return;
    }

    const evaluation = evaluateHedgeTrigger(rule, price.data.priceUsd);
    if (!evaluation.crossed || evaluation.triggerPriceUsd === null) {
      if (rule.lastObservedPriceUsd !== price.data.priceUsd) {
        const observedRule: AutoHedgeRule = {
          ...rule,
          lastObservedPriceUsd: price.data.priceUsd,
          updatedAt: Date.now(),
        };
        queueMicrotask(() => {
          void persistRule(observedRule, rule.updatedAt, false);
        });
      }
      return;
    }

    executingRuleId.current = rule.id;
    const intent = createHedgeIntent({
      hedgeAmountFxrp: rule.hedgeAmountFxrp,
      price: price.data,
      rule,
      triggerPriceUsd: evaluation.triggerPriceUsd,
    });
    const pendingExecution = createPendingExecution(intent);

    void Promise.resolve().then(async () => {
      setIsExecuting(true);
      const pendingRule: AutoHedgeRule = {
        ...rule,
        enabled: false,
        error: null,
        lastObservedPriceUsd: price.data!.priceUsd,
        lastExecution: pendingExecution,
        lastIntent: intent,
        status: "triggered",
        triggeredAt: intent.timestamp,
        updatedAt: Date.now(),
      };

      try {
        const claim = await persistRule(
          pendingRule,
          rule.updatedAt,
          false,
        );
        if (
          !claim.applied ||
          claim.rule?.lastIntent?.id !== intent.id
        ) {
          return;
        }
        const token = await ensureSession(false);
        if (claim.shared && !token) {
          throw new Error(
            "Auto-Hedge execution authorization is missing on this device.",
          );
        }
        const response = await fetch("/api/auto-hedge/execute", {
          body: JSON.stringify({ intent }),
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        const body = (await response.json()) as {
          error?: string;
          execution?: HedgeExecutionEvent;
          intent?: HedgeIntent;
          rule?: unknown;
        };
        if (!body.execution || !body.intent) {
          throw new Error(body.error || "Hedge execution failed.");
        }
        const serverRule = isAutoHedgeRule(
          body.rule,
          address,
          activeChainId,
        )
          ? body.rule
          : null;
        if (serverRule) {
          setStored({ key, rule: serverRule });
          ruleRef.current = serverRule;
          return;
        }
        const current = ruleRef.current ?? pendingRule;
        const finalRule: AutoHedgeRule = {
          ...current,
          error: body.execution!.error,
          lastExecution: body.execution!,
          lastIntent: body.intent!,
          updatedAt: Date.now(),
        };
        await persistRule(finalRule, current.updatedAt, false);
      } catch (error) {
        const failedAt = Date.now();
        const failedExecution: HedgeExecutionEvent = {
          adapter: null,
          adapterMode: null,
          completedAt: failedAt,
          direction: intent.direction,
          error: executionError(error),
          executionId: null,
          externalOrderId: null,
          market: intent.execution.market,
          message: "Execution request failed before adapter confirmation.",
          network: null,
          orderType: intent.execution.orderType,
          requestedAt: intent.timestamp,
          size: intent.protectedXrpAmount,
          status: "failed",
          venue: intent.execution.preferredVenue,
        };
        const current = ruleRef.current ?? pendingRule;
        const failedRule: AutoHedgeRule = {
          ...current,
          error: failedExecution.error,
          lastExecution: failedExecution,
          lastIntent: { ...intent, status: "failed" },
          status: "triggered",
          updatedAt: failedAt,
        };
        await persistRule(failedRule, current.updatedAt, false);
      } finally {
        executingRuleId.current = null;
        setIsExecuting(false);
      }
    });
  }, [
    activeChainId,
    address,
    ensureSession,
    key,
    persistRule,
    price.data,
    rule,
  ]);

  const value = useMemo<AutoHedgeContextValue>(
    () => ({
      arm,
      chainId: activeChainId,
      disarm,
      disconnectHyperliquid,
      enableHyperliquid,
      hyperliquidLink,
      isHyperliquidBusy,
      isExecuting,
      isHydrated: hydratedKey === key,
      isSyncing: syncState.isSyncing,
      price,
      rule,
      shared: syncState.shared,
      syncError: syncState.error,
    }),
    [
      activeChainId,
      arm,
      disarm,
      disconnectHyperliquid,
      enableHyperliquid,
      hyperliquidLink,
      isHyperliquidBusy,
      isExecuting,
      hydratedKey,
      key,
      price,
      rule,
      syncState,
    ],
  );

  return (
    <AutoHedgeContext.Provider value={value}>
      {children}
    </AutoHedgeContext.Provider>
  );
}

export function useAutoHedge() {
  const context = useContext(AutoHedgeContext);
  if (!context) {
    throw new Error("useAutoHedge must be used inside AutoHedgeProvider.");
  }
  return context;
}
