"use client";

import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { VaultState } from "@/hooks/useVault";
import {
  useVaultActivity,
  type ActivityScope,
} from "@/hooks/useVaultActivity";

type ActivityMetric = {
  label: string;
  suffix?: string;
  value: string;
};

const accentStyles = {
  blue: {
    eyebrow: "text-[#71b9e6]",
    metric: "border-[#71b9e6]/16 bg-[#71b9e6]/[0.025]",
  },
  gold: {
    eyebrow: "text-[#f2b84b]",
    metric: "border-[#f2b84b]/16 bg-[#f2b84b]/[0.025]",
  },
  green: {
    eyebrow: "text-[#4de2ad]",
    metric: "border-[#4de2ad]/16 bg-[#4de2ad]/[0.025]",
  },
};

const activityCopy = {
  deposit: {
    title: "Recent deposits",
    empty: "No deposits yet",
    description: "Your vault deposits will appear here.",
  },
  spend: {
    title: "Recent payments",
    empty: "No payments yet",
    description: "Your FXRP payments will appear here.",
  },
  withdraw: {
    title: "Recent withdrawals",
    empty: "No withdrawals yet",
    description: "Your vault withdrawals will appear here.",
  },
};

function activityTime(timestamp?: number) {
  if (!timestamp) {
    return "Confirmed";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(timestamp * 1000);
}

export function ActivityPageLayout({
  accent,
  activityScope,
  children,
  description,
  eyebrow,
  metrics,
  title,
  vault,
}: {
  accent: keyof typeof accentStyles;
  activityScope: ActivityScope;
  children: ReactNode;
  description: string;
  eyebrow: string;
  metrics: ActivityMetric[];
  title: string;
  vault: VaultState;
}) {
  const colors = accentStyles[accent];
  const activity = useVaultActivity(activityScope, vault);
  const copy = activityCopy[activityScope];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
      <header className="grid gap-5 border-b border-white/[0.07] pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)] lg:items-end">
        <div className="min-w-0">
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${colors.eyebrow}`}
          >
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#8f9aa3]">
            {description}
          </p>
        </div>

        <div
          className={`grid gap-2 ${
            metrics.length > 1 ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className={`min-w-0 rounded-xl border px-4 py-3.5 ${colors.metric}`}
            >
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-[#747f89]">
                {metric.label}
              </p>
              <p
                className="mt-2 truncate font-mono text-xl font-semibold tracking-[-0.025em] text-white sm:text-2xl"
                title={`${metric.value}${metric.suffix ? ` ${metric.suffix}` : ""}`}
              >
                {metric.value}
                {metric.suffix ? (
                  <span className="ml-1.5 text-[10px] font-semibold tracking-normal text-[#747f89]">
                    {metric.suffix}
                  </span>
                ) : null}
              </p>
            </article>
          ))}
        </div>
      </header>

      <div className="mt-6 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <section className="glass-panel-strong min-w-0 rounded-2xl border p-4 sm:p-5">
          {children}
        </section>

        <aside className="flex min-w-0 flex-col gap-3">
          <section
            aria-label="Vault context"
            className="glass-panel min-w-0 overflow-hidden rounded-xl border"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <p className="text-xs font-semibold text-white">
                Position context
              </p>
              {vault.contracts.vault ? (
                <a
                  href={`${vault.chain.blockExplorers.default.url}/address/${vault.contracts.vault}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-[#78848d] transition hover:text-white"
                >
                  View vault
                  <ArrowUpRight aria-hidden="true" size={11} />
                </a>
              ) : null}
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
              <div className="min-w-0 px-3 py-3.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#747f89]">
                  Strategy PPS
                </p>
                <p className="mt-2 truncate font-mono text-base font-semibold text-white">
                  {vault.strategySharePrice ?? "N/A"}
                </p>
                <p className="mt-1 truncate text-[10px] text-[#68737d]">
                  Share value
                </p>
              </div>
              <div className="min-w-0 px-3 py-3.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#747f89]">
                  TVL
                </p>
                <p
                  className="mt-2 truncate font-mono text-base font-semibold text-white"
                  title={`${vault.totalAssets} FXRP`}
                >
                  {vault.totalAssets}
                </p>
                <p className="mt-1 text-[10px] text-[#68737d]">FXRP</p>
              </div>
              <div className="min-w-0 px-3 py-3.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#747f89]">
                  Your position
                </p>
                <p
                  className="mt-2 truncate font-mono text-base font-semibold text-white"
                  title={`${vault.vaultAssets} FXRP`}
                >
                  {vault.vaultAssets}
                </p>
                <p className="mt-1 text-[10px] text-[#68737d]">FXRP</p>
              </div>
            </div>
          </section>

          <section className="glass-panel flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
              <div>
                <h2 className="text-xs font-semibold text-white">
                  {copy.title}
                </h2>
                <p className="mt-1 text-[10px] text-[#68737d]">
                  Connected wallet / {vault.chain.name}
                </p>
              </div>
              <span className="font-mono text-[10px] text-[#5f6972]">
                {activity.isPartial ? "Partial / latest 5" : "Latest 5"}
              </span>
            </div>

            <div className="min-h-48 flex-1">
              {activity.isLoading ? (
                <div className="grid gap-0 divide-y divide-white/[0.06]">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="px-4 py-4">
                      <div className="h-3 w-24 animate-pulse rounded bg-white/[0.06]" />
                      <div className="mt-2 h-3 w-40 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                  ))}
                </div>
              ) : activity.isError ? (
                <div className="flex min-h-48 flex-col justify-center px-4 py-5">
                  <p className="text-sm font-medium text-white">
                    Activity unavailable
                  </p>
                  <p className="mt-2 max-w-xs text-xs leading-5 text-[#747f89]">
                    {vault.chain.name} history could not be loaded. Your balances and
                    actions are unaffected.
                  </p>
                </div>
              ) : !vault.isConnected ? (
                <div className="flex min-h-48 flex-col justify-center px-4 py-5">
                  <p className="text-sm font-medium text-white">
                    Connect to view activity
                  </p>
                  <p className="mt-2 max-w-xs text-xs leading-5 text-[#747f89]">
                    Wallet-scoped {activityScope} history will appear here.
                  </p>
                </div>
              ) : activity.items.length === 0 ? (
                <div className="flex min-h-48 flex-col justify-center px-4 py-5">
                  <p className="text-sm font-medium text-white">{copy.empty}</p>
                  <p className="mt-2 max-w-xs text-xs leading-5 text-[#747f89]">
                    {copy.description}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {activity.items.map((item) => (
                    <a
                      key={`${item.hash}-${item.label}`}
                      href={`${vault.chain.blockExplorers.default.url}/tx/${item.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-white/[0.025]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-[#d9dee2]">
                          {item.label}
                        </span>
                        <span className="mt-1 block truncate font-mono text-[10px] text-[#68737d]">
                          {item.detail} / {activityTime(item.timestamp)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-white">
                          {item.amount}
                        </span>
                        <span className="text-[10px] text-[#68737d]">FXRP</span>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="text-[#5f6972] transition group-hover:text-white"
                          size={13}
                        />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4 text-[10px] text-[#626d76]">
        <span>
          {vault.chain.name} / Chain {vault.chainId}
        </span>
        <span>Upshift withdrawals use available strategy liquidity.</span>
      </div>
    </main>
  );
}
