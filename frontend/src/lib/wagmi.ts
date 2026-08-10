import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { coston2, flare } from "@/lib/networks";

export { coston2, flare } from "@/lib/networks";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const appUrl =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://ripple-fi.vercel.app";

export const walletConnectConfigured = Boolean(walletConnectProjectId);

const connectors = [
  injected({
    shimDisconnect: true,
  }),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          metadata: {
            name: "RippleFI",
            description: "Earn and stay liquid with FXRP on Flare.",
            url: appUrl,
            icons: [`${appUrl}/brand/icon-512x512.png`],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [flare, coston2],
  connectors,
  multiInjectedProviderDiscovery: true,
  transports: {
    [coston2.id]: http(),
    [flare.id]: http(),
  },
  ssr: true,
});
