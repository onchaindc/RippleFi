"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  CircleDollarSign,
  Home,
  Network,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BackgroundLayer } from "@/components/BackgroundLayer";
import { WalletConnect } from "@/components/WalletConnect";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { useAccount } from "wagmi";
import {
  DEFAULT_CHAIN_ID,
  getSupportedChain,
  isSupportedChainId,
} from "@/lib/networks";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/deposit", label: "Earn", icon: ArrowDownToLine },
  { href: "/withdraw", label: "Redeem", icon: ArrowUpFromLine },
  { href: "/spend", label: "Spend / Pay", icon: CircleDollarSign },
  { href: "/auto-hedge", label: "Auto-Hedge", icon: ShieldCheck },
  { href: "/smart-accounts", label: "Smart Accounts", icon: Network },
];

// The mobile bottom bar fits six items on one row; Docs lives in the footer
// there so the bar never wraps or covers content.
const mobileNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/deposit", label: "Earn", icon: ArrowDownToLine },
  { href: "/withdraw", label: "Redeem", icon: ArrowUpFromLine },
  { href: "/spend", label: "Spend / Pay", icon: CircleDollarSign },
  { href: "/auto-hedge", label: "Auto-Hedge", icon: ShieldCheck },
  { href: "/smart-accounts", label: "Smart Accounts", icon: Network },
];

function Navigation({ tablet = false }: { tablet?: boolean }) {
  const pathname = usePathname();

  // The scroll container is the safety net: when links + right-side controls
  // can't fit the viewport, the nav scrolls internally (scrollbars hidden)
  // instead of ever colliding with the network/wallet pills.
  return (
    <nav
      aria-label="Primary navigation"
      className={
        tablet
          ? "hidden min-w-0 items-center overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex lg:hidden"
          : "hidden min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex"
      }
    >
      <div className="mx-auto flex w-max items-center gap-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition ${
                active
                  ? "bg-[#17231f] text-[#82e8c2]"
                  : "text-[#89939e] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <Icon aria-hidden="true" size={15} />
              <span className={tablet ? "inline" : "hidden xl:inline"}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MobileBottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0f13]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid w-full max-w-lg grid-cols-6">
        {mobileNavItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1.5 text-[10px] font-medium transition ${
                active ? "text-[#4de2ad]" : "text-[#7d8790]"
              }`}
            >
              <span
                className={`flex h-7 min-w-9 items-center justify-center rounded-full px-2.5 ${
                  active ? "bg-[#173329]" : ""
                }`}
              >
                <Icon aria-hidden="true" size={19} />
              </span>
              {label === "Dashboard"
                ? "Home"
                : label === "Earn"
                  ? "Earn"
                  : label === "Redeem"
                    ? "Redeem"
                    : label === "Spend / Pay"
                      ? "Pay"
                      : label === "Auto-Hedge"
                        ? "Hedge"
                        : label === "Smart Accounts"
                          ? "Smart"
                          : label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { chainId } = useAccount();
  const chain = getSupportedChain(
    isSupportedChainId(chainId) ? chainId : DEFAULT_CHAIN_ID,
  );

  return (
    <div className="relative isolate flex min-h-screen min-w-0 flex-col overflow-x-clip pb-[calc(4rem+env(safe-area-inset-bottom))] text-[#f5f7f8] md:pb-0">
      <BackgroundLayer />
      <header
        className="sticky top-0 z-40 border-b border-white/[0.06] bg-[rgba(15,15,20,0.55)] backdrop-blur-[12px]"
        style={{ WebkitBackdropFilter: "blur(12px)" }}
      >
        <div className="mx-auto w-full max-w-7xl px-3 sm:px-6">
          <div className="flex min-h-16 items-center justify-between gap-2 sm:gap-3">
            <Link
              href="/dashboard"
              className="flex min-w-0 shrink-0 items-center gap-3"
            >
              <Image
                src="/brand/logo-mark.png"
                alt=""
                width={40}
                height={40}
                priority
                className="size-9 shrink-0 object-contain md:size-10"
              />
              <span className="hidden min-w-0 2xl:block">
                <span className="block text-lg font-semibold">RippleFI</span>
                <span className="block truncate text-xs text-[#89939e]">
                  XRP earn and spend vault
                </span>
              </span>
            </Link>

            <Navigation />

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden md:block">
                <NetworkSwitcher />
              </div>
              <div className="md:hidden">
                <NetworkSwitcher mobile />
              </div>
              <WalletConnect />
              <Link
                href="/docs"
                aria-label="Docs"
                title="Docs"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#aeb7be] transition hover:border-[#4de2ad]/30 hover:bg-[#4de2ad]/[0.08] hover:text-[#82e8c2]"
              >
                <BookOpen aria-hidden="true" size={16} />
              </Link>
            </div>
          </div>
          <Navigation tablet />
        </div>
      </header>

      {children}
      <MobileBottomNavigation />

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-[#707b85] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>Earn, withdraw, and pay with FXRP</span>
        <span className="flex items-center gap-3">
          <Link
            href="/docs"
            className="transition hover:text-[#cbd2d7]"
          >
            Docs
          </Link>
          <span>{chain.name}</span>
        </span>
      </footer>
    </div>
  );
}
