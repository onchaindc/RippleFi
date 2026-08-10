import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDollarSign,
  Home,
  Network,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BackgroundLayer } from "@/components/BackgroundLayer";
import { GlassCard } from "@/components/GlassCard";
import {
  HeroScrollCue,
  LandingReveal,
  LandingRevealItem,
} from "@/components/LandingReveal";

export const metadata: Metadata = {
  title: "RippleFI | Earn on FXRP. Stay liquid.",
  description:
    "Choose how FXRP earns on Flare while keeping available liquidity clear.",
};

const steps: {
  description: string;
  icon: LucideIcon;
  number: string;
  title: string;
}[] = [
  {
    description: "Deposit FXRP through RippleFI or stake directly with Firelight.",
    icon: ArrowDownToLine,
    number: "01",
    title: "Deposit",
  },
  {
    description:
      "Choose an earning route and add optional FTSO-powered protection.",
    icon: Home,
    number: "02",
    title: "Earn / Protect",
  },
  {
    description:
      "Pay from available FXRP or withdraw spend-ready vault liquidity.",
    icon: CircleDollarSign,
    number: "03",
    title: "Spend",
  },
];

const features: {
  description: string;
  icon: LucideIcon;
  title: string;
}[] = [
  {
    description:
      "Choose Upshift for managed yield or Firelight for the stXRP path.",
    icon: Home,
    title: "Earn",
  },
  {
    description:
      "Withdraw or pay only from balances that are actually available.",
    icon: CircleDollarSign,
    title: "Stay liquid",
  },
  {
    description: "Authorize XRP deposits and payments through Xaman.",
    icon: Network,
    title: "Smart Accounts",
  },
  {
    description:
      "Set an FTSO price rule and route execution through a guarded adapter.",
    icon: ArrowUpFromLine,
    title: "Auto-Hedge",
  },
];

const primaryCta =
  "inline-flex h-11 items-center justify-center rounded-full border border-[rgba(16,185,129,0.5)] bg-[rgba(16,185,129,0.15)] px-5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(16,185,129,0.25)] backdrop-blur-md transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:border-[rgba(16,185,129,0.7)] hover:bg-[rgba(16,185,129,0.22)] hover:shadow-[0_0_26px_rgba(16,185,129,0.38)] focus-visible:outline-[#4de2ad] motion-reduce:transform-none";

const iconOrb =
  "landing-icon-orb flex size-10 items-center justify-center rounded-full text-[#d7dee2]";

export default function LandingPage() {
  return (
    <div className="relative isolate min-h-screen min-w-0 overflow-x-hidden text-[#f5f7f8]">
      <BackgroundLayer drift />
      <header
        className="fixed inset-x-0 top-0 z-40 border-b border-white/[0.06] bg-[rgba(15,15,20,0.55)] backdrop-blur-[12px]"
        style={{ WebkitBackdropFilter: "blur(12px)" }}
      >
        <nav
          aria-label="Landing navigation"
          className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
        >
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/logo-mark.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-9 object-contain sm:size-10"
            />
            <span className="text-lg font-semibold text-white">RippleFI</span>
          </Link>
          <Link href="/dashboard" className={primaryCta}>
            Launch App
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative flex min-h-[100dvh] w-full items-center overflow-hidden px-4 pb-20 pt-24 sm:px-6 sm:pb-24 sm:pt-28">
          <div
            aria-hidden="true"
            className="hero-ambient-glow absolute left-1/2 top-1/2 -z-0 aspect-square w-[min(78vw,52rem)] -translate-x-1/2 -translate-y-1/2"
          />
          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-8 md:grid-cols-[minmax(0,1fr)_220px] md:gap-12 lg:gap-20">
            <div className="hero-logo-entrance relative order-first mx-auto size-[120px] md:order-last md:size-[210px]">
              <Image
                src="/brand/logo-mark.png"
                alt=""
                fill
                priority
                sizes="(max-width: 767px) 120px, 210px"
                className="relative z-10 object-contain"
              />
            </div>
            <div className="max-w-4xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#89939e]">
                Earn + Spend on Flare
              </p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
                Earn on FXRP. Stay liquid.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-[#9aa4ad] sm:text-lg">
                A clear way to put FXRP to work without losing sight of
                available liquidity.
              </p>
              <div className="mt-8">
                <Link href="/dashboard" className={primaryCta}>
                  Launch App
                </Link>
              </div>
            </div>
          </div>
          <HeroScrollCue />
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-it-works-heading"
          className="mx-auto w-full max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-20"
        >
          <LandingReveal>
            <LandingRevealItem>
              <SectionHeading
                eyebrow="How it works"
                title="One position. Three clear actions."
                id="how-it-works-heading"
              />
            </LandingRevealItem>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              {steps.map(
                ({ description, icon: Icon, number, title }, index) => (
                  <LandingRevealItem
                    key={title}
                    delay={(index + 1) * 100}
                    className="h-full"
                  >
                    <GlassCard
                      variant="landing"
                      className="h-full rounded-xl p-5 sm:p-6"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <span className={iconOrb}>
                          <Icon aria-hidden="true" size={20} />
                        </span>
                        <span className="font-mono text-xs text-[rgba(77,226,173,0.58)]">
                          {number}
                        </span>
                      </div>
                      <h3 className="mt-6 text-base font-semibold text-white">
                        {title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[#7d8790]">
                        {description}
                      </p>
                    </GlassCard>
                  </LandingRevealItem>
                ),
              )}
            </div>
          </LandingReveal>
        </section>

        <section
          aria-labelledby="features-heading"
          className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20"
        >
          <LandingReveal>
            <LandingRevealItem>
              <SectionHeading
                eyebrow="Core product"
                title="Everything the position needs."
                id="features-heading"
              />
            </LandingRevealItem>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(
                ({ description, icon: Icon, title }, index) => (
                  <LandingRevealItem
                    key={title}
                    delay={(index + 1) * 100}
                    className="h-full"
                  >
                    <GlassCard
                      variant="landing"
                      className="h-full rounded-xl p-5"
                    >
                      <span className={iconOrb}>
                        <Icon aria-hidden="true" size={18} />
                      </span>
                      <h3 className="mt-5 text-sm font-semibold text-white">
                        {title}
                      </h3>
                      <p className="mt-2 text-xs leading-5 text-[#7d8790]">
                        {description}
                      </p>
                    </GlassCard>
                  </LandingRevealItem>
                ),
              )}
            </div>
          </LandingReveal>
        </section>

        <section
          aria-labelledby="strategies-heading"
          className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20"
        >
          <LandingReveal>
            <LandingRevealItem>
              <SectionHeading
                eyebrow="Yield strategies"
                title="Choose the liquidity profile."
                id="strategies-heading"
              />
            </LandingRevealItem>
            <div className="mt-8 grid gap-3 lg:grid-cols-2">
              <LandingRevealItem delay={100} className="h-full">
                <GlassCard
                  variant="landing"
                  className="h-full rounded-xl p-5 sm:p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className={iconOrb}>
                      <Home aria-hidden="true" size={20} />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Upshift
                      </h3>
                      <p className="mt-0.5 text-xs text-[#7d8790]">
                        Managed yield strategy
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-[#89939e]">
                    The default RippleFI route. Deposits receive rFXRP and remain
                    connected to vault withdrawals and payments, subject to
                    available strategy liquidity.
                  </p>
                </GlassCard>
              </LandingRevealItem>

              <LandingRevealItem delay={200} className="h-full">
                <GlassCard
                  variant="landing"
                  className="h-full rounded-xl p-5 sm:p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className={iconOrb}>
                      <Network aria-hidden="true" size={20} />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-white">
                        Firelight
                      </h3>
                      <p className="mt-0.5 text-xs text-[#7d8790]">
                        FXRP staking / stXRP
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-[#89939e]">
                    Direct mainnet FXRP staking into stXRP. Firelight exits
                    follow scheduled withdrawal periods and are not used for
                    RippleFI payments.
                  </p>
                </GlassCard>
              </LandingRevealItem>
            </div>
          </LandingReveal>
        </section>

        <section className="mx-auto w-full max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-16">
          <LandingReveal>
            <LandingRevealItem>
              <h2 className="text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                Put FXRP to work.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#89939e]">
                Open RippleFI and choose the earning route that fits your
                liquidity needs.
              </p>
              <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/dashboard" className={primaryCta}>
                  Launch App
                </Link>
                <a
                  href="https://github.com/onchaindc/RippleFi"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] px-5 text-sm font-semibold text-[#c8ced3] transition hover:border-white/20 hover:text-white"
                >
                  GitHub
                </a>
              </div>
            </LandingRevealItem>
          </LandingReveal>
        </section>
      </main>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  id,
  title,
}: {
  eyebrow: string;
  id: string;
  title: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7d8790]">
        {eyebrow}
      </p>
      <h2
        id={id}
        className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl"
      >
        {title}
      </h2>
    </div>
  );
}
