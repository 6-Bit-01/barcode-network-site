import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { LiveStatusProvider } from "@/components/LiveStatusProvider";
import { DataStream } from "@/components/DataStream";
import { SystemTicker } from "@/components/SystemTicker";

export const metadata: Metadata = {
  metadataBase: new URL("https://barcode-network.com"),
  title: {
    default: "BARCODE Network",
    template: "%s | BARCODE Network",
  },
  description: "An interdimensional broadcast station. Programs: 6 Bit • BARCODE Radio • Database • Releases • Transmissions.",
  keywords: ["BARCODE Network", "6 Bit", "BARCODE Radio", "hip hop", "live broadcast", "music submissions"],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "BARCODE Network",
    description: "An interdimensional broadcast station. Signal over noise.",
    siteName: "BARCODE Network",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "BARCODE Network",
    description: "An interdimensional broadcast station. Signal over noise.",
  },
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
      >
        <LiveStatusProvider>
          <DataStream />
          <Header />
          <main className="min-h-screen animate-interference overflow-x-hidden">
            {children}
          </main>
          <Footer />
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/90 backdrop-blur-sm px-4 py-1.5">
            <SystemTicker className="text-xs" />
          </div>
        </LiveStatusProvider>
      </body>
    </html>
  );
}
