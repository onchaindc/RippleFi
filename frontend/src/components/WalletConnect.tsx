"use client";

import {
  ChevronDown,
  ExternalLink,
  LogOut,
  RadioTower,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  type Connector,
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { walletConnectConfigured } from "@/lib/wagmi";
import { DEFAULT_CHAIN_ID, isSupportedChainId } from "@/lib/networks";
import { FeedbackMessage } from "@/components/FeedbackMessage";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readWalletError(error: unknown, isMobile: boolean) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("user rejected") ||
    normalized.includes("user denied") ||
    normalized.includes("request rejected")
  ) {
    return "The wallet request was cancelled.";
  }

  if (
    normalized.includes("already pending") ||
    normalized.includes("resource unavailable")
  ) {
    return "Wallet request already open. Finish it in your wallet.";
  }

  if (
    normalized.includes("provider not found") ||
    normalized.includes("connector not found") ||
    normalized.includes("no provider")
  ) {
    return isMobile
      ? "No browser wallet. Use WalletConnect or open the wallet browser."
      : "No browser wallet. Install one or use WalletConnect.";
  }

  if (normalized.includes("chain") || normalized.includes("network")) {
    return "Switch to Flare Mainnet or Coston2 and try again.";
  }

  return isMobile
    ? "Connection failed. Approve the request in your wallet."
    : "Connection failed. Try again.";
}

function subscribeToBrowserEnvironment() {
  return () => undefined;
}

export function WalletConnect() {
  const { address, chainId, isConnected } = useAccount();
  const {
    connectors,
    connectAsync,
    isPending,
    reset: resetConnection,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChainAsync,
    isPending: isSwitching,
  } = useSwitchChain();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const hasInjectedProvider = useSyncExternalStore(
    subscribeToBrowserEnvironment,
    () =>
      Boolean(
        (window as typeof window & { ethereum?: unknown }).ethereum,
      ),
    () => false,
  );
  const isMobile = useSyncExternalStore(
    subscribeToBrowserEnvironment,
    () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    () => false,
  );
  const [menuPosition, setMenuPosition] = useState({ right: 16, top: 56 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function positionMenu() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setMenuPosition({
        right: Math.max(16, window.innerWidth - rect.right),
        top: rect.bottom + 8,
      });
    }

    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [isMenuOpen]);

  const injectedConnector = connectors.find(
    (connector) => connector.id === "injected",
  );
  const walletConnectConnector = connectors.find(
    (connector) => connector.id === "walletConnect",
  );

  async function connectWallet(connector: Connector) {
    setMessage("");
    resetConnection();

    try {
      await connectAsync({
        connector,
        chainId: isSupportedChainId(chainId) ? chainId : DEFAULT_CHAIN_ID,
      });
      setIsMenuOpen(false);
    } catch (error) {
      setMessage(readWalletError(error, isMobile));
    }
  }

  async function switchToSupportedNetwork() {
    setMessage("");

    try {
      await switchChainAsync({ chainId: DEFAULT_CHAIN_ID });
    } catch (error) {
      setMessage(readWalletError(error, isMobile));
    }
  }

  if (isConnected && !isSupportedChainId(chainId)) {
    return (
      <div className="relative flex flex-col items-end">
        <button
          type="button"
          onClick={switchToSupportedNetwork}
          disabled={isSwitching}
          className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-[#f2b84b] px-3 text-sm font-semibold text-[#171106] transition hover:bg-[#ffc965] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RadioTower aria-hidden="true" size={17} />
          {isSwitching ? "Switching" : "Switch network"}
        </button>
        {message ? (
          <FeedbackMessage
            className="absolute right-0 top-12 z-50 w-72 max-w-[calc(100vw-2rem)]"
            tone="error"
          >
            {message}
          </FeedbackMessage>
        ) : null}
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex h-10 items-center rounded-lg border border-white/10 bg-white/[0.04]">
        <span className="flex items-center gap-2 px-2 text-xs text-[#d7dcdf] sm:px-3 sm:text-sm">
          <span className="hidden size-2 rounded-full bg-[#4de2ad] sm:block" />
          <span className="font-mono">{shortenAddress(address)}</span>
        </span>
        <button
          type="button"
          onClick={() => disconnect()}
          className="flex h-full w-9 items-center justify-center border-l border-white/10 text-[#89939e] transition hover:text-white sm:w-10"
          aria-label="Disconnect wallet"
          title="Disconnect wallet"
        >
          <LogOut aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setMessage("");
          setIsMenuOpen((isOpen) => !isOpen);
        }}
        disabled={isPending}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-[rgba(77,226,173,0.38)] bg-[rgba(25,72,56,0.38)] px-3 text-sm font-semibold text-[#9af0d0] backdrop-blur-[12px] transition hover:border-[rgba(77,226,173,0.58)] hover:bg-[rgba(34,92,70,0.46)] hover:text-[#c4fae6] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ WebkitBackdropFilter: "blur(12px)" }}
      >
        <Wallet aria-hidden="true" size={17} />
        <span className="sm:hidden">
          {isPending ? "Connecting" : "Connect"}
        </span>
        <span className="hidden sm:inline">
          {isPending ? "Connecting" : "Connect wallet"}
        </span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>

      {isMenuOpen
        ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-[1000] w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(15,15,20,0.55)] p-2 text-[#f5f7f8] backdrop-blur-[12px]"
          style={{
            right: menuPosition.right,
            top: menuPosition.top,
            WebkitBackdropFilter: "blur(12px)",
          }}
          role="menu"
        >
          <div className="flex items-start justify-between gap-3 px-2 pb-2 pt-1">
            <div>
              <p className="text-sm font-semibold text-white">Choose wallet</p>
              <p className="mt-1 text-xs leading-5 text-[#7d8790]">
                Connect directly or through WalletConnect.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="flex size-8 shrink-0 items-center justify-center text-[#7d8790] transition hover:text-white"
              aria-label="Close wallet menu"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              injectedConnector && connectWallet(injectedConnector)
            }
            disabled={!injectedConnector || !hasInjectedProvider || isPending}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <Smartphone
              aria-hidden="true"
              className="shrink-0 text-[#4de2ad]"
              size={20}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">
                Browser wallet
              </span>
              <span className="mt-0.5 block text-xs text-[#7d8790]">
                MetaMask mobile and injected wallets
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              walletConnectConnector &&
              connectWallet(walletConnectConnector)
            }
            disabled={!walletConnectConnector || isPending}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 text-left transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-45"
            role="menuitem"
          >
            <ExternalLink
              aria-hidden="true"
              className="shrink-0 text-[#71b9e6]"
              size={20}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white">
                WalletConnect
              </span>
              <span className="mt-0.5 block text-xs text-[#7d8790]">
                {walletConnectConfigured
                  ? "Open your wallet app on this device"
                  : "Project ID is not configured"}
              </span>
            </span>
          </button>

          {!hasInjectedProvider && isMobile ? (
            <p className="mx-2 mt-2 border-t border-white/10 pt-3 text-xs leading-5 text-[#89939e]">
              No injected wallet found. Use WalletConnect or open this site
              inside your wallet&apos;s built-in browser.
            </p>
          ) : null}

          {message ? (
            <FeedbackMessage className="mx-2 mt-2" tone="error">
              {message}
            </FeedbackMessage>
          ) : null}
        </div>,
          document.body,
        )
        : null}
    </div>
  );
}
