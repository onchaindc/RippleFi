"use client";

import { ChevronDown } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

export function LandingReveal({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (reducedMotion.matches) {
      queueMicrotask(() => setIsVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="landing-reveal"
      data-visible={isVisible}
    >
      {children}
    </div>
  );
}

export function HeroScrollCue() {
  return (
    <button
      type="button"
      aria-label="Scroll to how RippleFI works"
      className="hero-scroll-cue absolute bottom-6 left-1/2 z-10 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[#aab4bb] backdrop-blur-md transition-colors duration-200 hover:border-[rgba(16,185,129,0.35)] hover:text-white sm:bottom-8"
      onClick={() => {
        document
          .getElementById("how-it-works")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <ChevronDown aria-hidden="true" size={19} />
    </button>
  );
}

export function LandingRevealItem({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`landing-reveal-item ${className}`}
      style={{ "--landing-reveal-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
