import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LiveStatusProvider } from "@/components/LiveStatusProvider";
import { DataStream } from "@/components/DataStream";
import { BNLNetworkRelayShell } from "@/components/BNLNetworkRelayShell";
import { BNLStatusProvider } from "@/components/BNLStatusProvider";

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
    url: "https://www.barcode-network.com",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "BARCODE Network",
    description: "BARCODE is a living hip-hop broadcast universe connecting music, BARCODE Radio, community, technology, and interdimensional story.",
  },
  alternates: {
    canonical: "/",
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
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <DataStream />
          <Header />
          <BNLNetworkRelayShell />
          <main id="main-content" className="min-h-screen animate-interference overflow-x-hidden" tabIndex={-1}>
            {children}
          </main>
          <Footer />
          </BNLStatusProvider>
        </LiveStatusProvider>
      </body>
    </html>
  );
}
