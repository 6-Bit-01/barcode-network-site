import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { LiveStatusProvider } from "@/components/LiveStatusProvider";
import { BNLStatusProvider } from "@/components/BNLStatusProvider";
import { SiteChrome } from "@/components/SiteChrome";

const fontVariables = {
  "--font-geist-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
} as CSSProperties;

export const metadata: Metadata = {
  metadataBase: new URL("https://www.barcode-network.com"),
  title: {
    default: "BARCODE Network",
    template: "%s | BARCODE Network",
  },
  description: "BARCODE is a living hip-hop broadcast universe connecting music, BARCODE Radio, community, technology, and interdimensional story.",
  keywords: ["BARCODE Network", "6 Bit", "BARCODE Radio", "hip hop", "live broadcast", "music submissions"],
  openGraph: {
    title: "BARCODE Network",
    description: "BARCODE is a living hip-hop broadcast universe connecting music, BARCODE Radio, community, technology, and interdimensional story.",
    siteName: "BARCODE Network",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "BARCODE Network",
    description: "BARCODE is a living hip-hop broadcast universe connecting music, BARCODE Radio, community, technology, and interdimensional story.",
  },
  alternates: {
    types: {
      "application/rss+xml": "https://www.barcode-network.com/transmissions/feed",
    },
  },
  manifest: "/site.webmanifest",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="BARCODE Transmissions"
          href="/transmissions/feed"
        />
      </head>
      <body
        className="antialiased scanlines logo-watermark"
        style={fontVariables}
      >
        <LiveStatusProvider>
          <BNLStatusProvider>
            <SiteChrome>{children}</SiteChrome>
          </BNLStatusProvider>
        </LiveStatusProvider>
      </body>
    </html>
  );
}
