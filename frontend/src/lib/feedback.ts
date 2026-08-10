function rawErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  return raw.split("\n")[0].trim().replace(/\s+/g, " ");
}

function minimumProtectionSize(message: string) {
  const match = message.match(
    /(?:minimum|at least)[^0-9]{0,48}([0-9]+(?:\.[0-9]+)?)\s*(?:xrp)?/i,
  );
  return match?.[1];
}

function executionMarket(message: string) {
  const match = message.match(
    /(?:market|logicalMarket|venueMarket)[^A-Z0-9]{0,12}([A-Z0-9:_-]+)/i,
  );
  return match?.[1]?.toUpperCase() || "selected";
}

function executionCause(message: string) {
  const match = message.match(
    /(?:HYPERLIQUID_EXECUTION_FAILED|order failed|rejected the order)\s*:\s*(.+)$/i,
  );
  return match?.[1]?.replace(/[{}[\]"]/g, "").trim();
}

export function productErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  const message = rawErrorMessage(error);
  const normalized = message.toLowerCase();
  const minimumSize = minimumProtectionSize(message);
  const market = executionMarket(message);
  const cause = executionCause(message);

  if (
    normalized.includes("invalid bearer") ||
    normalized.includes("missing bearer") ||
    normalized.includes("invalid auth") ||
    normalized.includes("unauthorized")
  ) {
    return "Hyperliquid signer authorization failed. Check the signer token.";
  }

  if (
    normalized.includes("insufficient margin") ||
    normalized.includes("insufficient balance") ||
    normalized.includes("not enough margin") ||
    normalized.includes("margin required")
  ) {
    return `Hyperliquid testnet margin is insufficient for the ${market} short.`;
  }

  if (
    normalized.includes("signer request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("timed out") ||
    normalized.includes("could not be reached")
  ) {
    return "The Hyperliquid signer could not be reached. Please try again.";
  }

  if (
    normalized.includes("hyperliquid_size_too_small") ||
    normalized.includes("invalid size") ||
    normalized.includes("size too small") ||
    normalized.includes("below minimum")
  ) {
    return minimumSize
      ? `The ${market} short is below the market minimum of ${minimumSize} units.`
      : `The ${market} short is below the Hyperliquid market minimum.`;
  }

  if (
    normalized.includes("invalid bearer") ||
    normalized.includes("missing bearer") ||
    normalized.includes("session token") ||
    normalized.includes("authorization failed") ||
    normalized.includes("auth token") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden")
  ) {
    return "This device needs authorization to sync protection settings.";
  }

  if (
    normalized === "'xrp'" ||
    normalized === '"xrp"' ||
    normalized.includes("unknown market") ||
    normalized.includes("market unavailable") ||
    normalized.includes("market is unavailable") ||
    normalized.includes("coin not found") ||
    normalized.includes("unsupported market") ||
    normalized.includes("does not support this market")
  ) {
    return "Market unavailable on this network.";
  }

  if (
    normalized.includes("execution_disabled") ||
    normalized.includes("executor_not_configured") ||
    normalized.includes("venue is not enabled")
  ) {
    return "This protection venue is not available yet.";
  }

  if (
    normalized.includes("sparkdex") ||
    normalized.includes("flamix") ||
    normalized.includes("venue executor")
  ) {
    return "Protection couldn't be opened at the selected venue.";
  }

  if (
    normalized.includes("hyperliquid_execution_failed") ||
    normalized.includes("hyperliquid order failed") ||
    normalized.includes("hedge execution failed") ||
    normalized.includes("signer returned") ||
    normalized.includes("signer request") ||
    normalized.includes("execution adapter")
  ) {
    return cause
      ? `Hyperliquid rejected the ${market} short: ${cause}.`
      : `Hyperliquid rejected the ${market} short. Please try again.`;
  }

  if (
    normalized.includes("ftso") &&
    (normalized.includes("failed") ||
      normalized.includes("invalid") ||
      normalized.includes("no xrp"))
  ) {
    return "Live XRP price is temporarily unavailable.";
  }

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("request rejected")
  ) {
    return "Request cancelled.";
  }
  if (normalized.includes("already pending")) {
    return "Wallet request already open.";
  }

  if (
    normalized.includes("wrong network") ||
    normalized.includes("unsupported network") ||
    normalized.includes("unsupported chain") ||
    normalized.includes("switch chain")
  ) {
    return "Switch to Flare Mainnet or Coston2 and try again.";
  }

  if (
    normalized.includes("insufficient funds") ||
    normalized.includes("insufficient balance") ||
    normalized.includes("exceeds the selected") ||
    normalized.includes("exceeds your")
  ) {
    return "This amount exceeds your available balance.";
  }

  if (
    normalized.includes("rpc client") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network request failed") ||
    normalized.includes("fetch failed") ||
    normalized.includes("http 5") ||
    normalized.includes("service unavailable") ||
    normalized.includes("timed out")
  ) {
    return "The network is taking longer than expected. Please try again.";
  }

  if (
    normalized.includes("smart account") &&
    (normalized.includes("failed") ||
      normalized.includes("invalid") ||
      normalized.includes("incomplete"))
  ) {
    return "Smart Account setup couldn't be completed. Please try again.";
  }

  if (
    normalized.includes("xaman") &&
    (normalized.includes("expired") || normalized.includes("cancelled"))
  ) {
    return "The Xaman request expired or was cancelled.";
  }

  if (!message) {
    return fallback;
  }

  const looksTechnical =
    /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(message) ||
    /(?:typeerror|referenceerror|syntaxerror|stack trace|at \w+\s*\(|status code|internal server error)/i.test(
      message,
    ) ||
    /^[{[]/.test(message);

  if (looksTechnical) {
    return fallback;
  }

  return message.length > 120 ? fallback : message;
}

export function compactError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  console.error("[RippleFI]", error);
  return productErrorMessage(error, fallback);
}
