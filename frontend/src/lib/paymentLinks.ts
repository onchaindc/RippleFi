import { isAddress, zeroAddress, type Address } from "viem";
import { coston2, isSupportedChainId, type SupportedChainId } from "@/lib/networks";

export type PaymentLinkRequest = {
  amount: string;
  chainId: SupportedChainId;
  note: string;
  requester: Address;
  version: 2;
};

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

export function encodePaymentRequest(
  request: Omit<PaymentLinkRequest, "version">,
) {
  return toBase64Url(JSON.stringify({ ...request, version: 2 }));
}

export function decodePaymentRequest(id: string): PaymentLinkRequest {
  if (!/^[A-Za-z0-9_-]{8,600}$/.test(id)) {
    throw new Error("This payment link is invalid.");
  }
  const request = JSON.parse(fromBase64Url(id)) as {
    amount?: string;
    chainId?: number;
    note?: string;
    requester?: string;
    version?: 1 | 2;
  };
  const chainId = request.version === 1 ? coston2.id : request.chainId;
  if (
    (request.version !== 1 && request.version !== 2) ||
    !isSupportedChainId(chainId) ||
    !request.requester ||
    !isAddress(request.requester) ||
    request.requester.toLowerCase() === zeroAddress ||
    typeof request.amount !== "string" ||
    !/^\d+(?:\.\d{1,6})?$/.test(request.amount) ||
    Number(request.amount) <= 0 ||
    typeof request.note !== "string" ||
    request.note.length > 120
  ) {
    throw new Error("This payment request is malformed.");
  }
  return {
    amount: request.amount,
    chainId,
    note: request.note,
    requester: request.requester,
    version: 2,
  } as PaymentLinkRequest;
}
