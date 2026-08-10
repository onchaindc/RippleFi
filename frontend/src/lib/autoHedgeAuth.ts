export function buildAutoHedgeAuthMessage({
  chainId,
  issuedAt,
  wallet,
}: {
  chainId: number;
  issuedAt: number;
  wallet: string;
}) {
  return [
    "RippleFI Auto-Hedge Sync",
    "",
    "Authorize this device to update your wallet-scoped Auto-Hedge rule.",
    `Wallet: ${wallet.toLowerCase()}`,
    `Chain ID: ${chainId}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}
