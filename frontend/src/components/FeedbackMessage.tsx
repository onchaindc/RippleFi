import {
  AlertCircle,
  CheckCircle2,
  Info,
  LoaderCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { productErrorMessage } from "@/lib/feedback";

export type FeedbackTone = "error" | "info" | "loading" | "success";

const toneStyles: Record<FeedbackTone, string> = {
  error: "border-[#df6b6b]/25 bg-[#251111] text-[#f0a3a3]",
  info: "border-white/10 bg-white/[0.03] text-[#aab2ba]",
  loading: "border-[#f2b84b]/25 bg-[#17130b] text-[#f4cd7d]",
  success: "border-[#4de2ad]/25 bg-[#0d1d18] text-[#82e8c2]",
};

export function FeedbackMessage({
  children,
  className = "",
  tone,
}: {
  children?: ReactNode;
  className?: string;
  tone: FeedbackTone;
}) {
  const content =
    tone === "error" && typeof children === "string"
      ? productErrorMessage(children)
      : children;
  const Icon =
    tone === "error"
      ? AlertCircle
      : tone === "success"
        ? CheckCircle2
        : tone === "loading"
          ? LoaderCircle
          : Info;

  return (
    <div
      className={`flex min-w-0 max-w-full items-start gap-2 rounded-md border px-2.5 py-2 text-xs leading-4 ${toneStyles[tone]} ${className}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 shrink-0 ${tone === "loading" ? "animate-spin" : ""}`}
        size={14}
      />
      <span className="min-w-0 overflow-hidden break-words [overflow-wrap:anywhere]">
        {content}
      </span>
    </div>
  );
}
