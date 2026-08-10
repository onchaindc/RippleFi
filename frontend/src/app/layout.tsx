import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "RippleFI",
  title: "RippleFI | Earn and spend with XRP",
  description:
    "Deposit FXRP into RippleFI on Flare and keep your position visible, liquid, and ready to use.",
  icons: {
    icon: [
      {
        url: "/brand/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/brand/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: "/brand/favicon-32x32.png",
    apple: [
      {
        url: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
