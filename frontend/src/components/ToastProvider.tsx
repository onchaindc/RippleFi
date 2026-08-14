"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "error" | "info" | "success" | "warning";

type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

const TOAST_DURATION_MS = 4_500;
const MAX_VISIBLE = 4;

const kindStyles: Record<
  ToastKind,
  { border: string; icon: string; Icon: typeof Info }
> = {
  error: {
    Icon: AlertTriangle,
    border: "border-[#df6b6b]/35",
    icon: "text-[#f0a3a3]",
  },
  info: {
    Icon: Info,
    border: "border-[#71b9e6]/30",
    icon: "text-[#9bd3f5]",
  },
  success: {
    Icon: CheckCircle2,
    border: "border-[#4de2ad]/30",
    icon: "text-[#82e8c2]",
  },
  warning: {
    Icon: AlertTriangle,
    border: "border-[#f2b84b]/35",
    icon: "text-[#f4cd7d]",
  },
};

const ToastContext = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [
      ...current.slice(-(MAX_VISIBLE - 1)),
      { id, kind, message },
    ]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-16 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toastItem) => {
          const styles = kindStyles[toastItem.kind];
          const Icon = styles.Icon;
          return (
            <div
              key={toastItem.id}
              role="status"
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-[#0d1a1c]/95 px-3.5 py-3 text-sm leading-5 text-[#d7dcdf] shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md ${styles.border}`}
            >
              <Icon aria-hidden="true" size={16} className={`mt-0.5 shrink-0 ${styles.icon}`} />
              <span className="min-w-0 flex-1">{toastItem.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toastItem.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-[#68737d] transition hover:text-[#d7dcdf]"
              >
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
