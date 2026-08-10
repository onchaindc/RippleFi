import "server-only";

import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { Address } from "viem";
import type { SupportedChainId } from "@/lib/networks";

type SessionPayload = {
  chainId: SupportedChainId;
  expiresAt: number;
  version: 1;
  wallet: Address;
};

function getSessionSecret() {
  const secret =
    process.env.AUTO_HEDGE_SESSION_SECRET?.trim() ||
    process.env.SMART_ACCOUNT_JOB_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTO_HEDGE_SESSION_SECRET must be at least 32 characters.",
    );
  }
  return secret;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createAutoHedgeSession(
  wallet: Address,
  chainId: SupportedChainId,
) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const payload: SessionPayload = {
    chainId,
    expiresAt,
    version: 1,
    wallet,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  return {
    expiresAt,
    token: `${encodedPayload}.${signPayload(encodedPayload)}`,
  };
}

export function verifyAutoHedgeSession(token: string) {
  const [encodedPayload, suppliedSignature] = token.split(".");
  if (!encodedPayload || !suppliedSignature) {
    throw new Error("Invalid Auto-Hedge session token.");
  }
  const expectedSignature = signPayload(encodedPayload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new Error("Invalid Auto-Hedge session token.");
  }
  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString(),
  ) as SessionPayload;
  if (
    payload.version !== 1 ||
    typeof payload.wallet !== "string" ||
    typeof payload.chainId !== "number" ||
    payload.expiresAt <= Date.now()
  ) {
    throw new Error("Auto-Hedge session token expired or is malformed.");
  }
  return payload;
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("Missing Auto-Hedge bearer token.");
  }
  return authorization.slice("Bearer ".length).trim();
}
