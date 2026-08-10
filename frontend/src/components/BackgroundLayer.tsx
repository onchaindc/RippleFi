"use client";

import { useEffect, useRef } from "react";

export function BackgroundLayer({ drift = false }: { drift?: boolean }) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!drift) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      if (imageRef.current) {
        const offset = Math.min(window.scrollY * 0.035, 28);
        imageRef.current.style.transform =
          `translate3d(0, ${offset}px, 0) scale(1.035)`;
      }
    };
    const onScroll = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [drift]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <picture className="block h-full w-full">
        <source
          media="(max-width: 767px)"
          srcSet="/starfield-mobile.webp"
          type="image/webp"
        />
        {/* The source files are already optimized WebP assets. */}
        <img
          ref={imageRef}
          src="/starfield-desktop.webp"
          alt=""
          className={`h-full w-full object-cover object-center ${
            drift ? "will-change-transform" : ""
          }`}
        />
      </picture>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.14)_52%,rgba(0,0,0,0.35)_100%)]" />
    </div>
  );
}
