import type { ComponentProps } from "react";

export function GlassCard({
  className = "",
  variant = "default",
  ...props
}: ComponentProps<"div"> & { variant?: "default" | "landing" }) {
  const material =
    variant === "landing" ? "landing-glass-card" : "glass-panel border";

  return <div className={`${material} ${className}`} {...props} />;
}
