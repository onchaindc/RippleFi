"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { AutoHedgeProvider } from "@/components/AutoHedgeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 10_000,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AutoHedgeProvider>{children}</AutoHedgeProvider>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
