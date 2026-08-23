import type { Metadata, Viewport } from "next";
import { LiveOverlayReceiver } from "@/components/LiveOverlayReceiver";

export const metadata: Metadata = {
  title: "Live Video + Track Lane — BARCODE Radio",
  description: "Permanent square browser-source lane for BARCODE Radio video and track scenes.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 1080,
  height: 1080,
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LiveOverlayPage() {
  return <LiveOverlayReceiver />;
}
