import type { Metadata, Viewport } from "next";
import { ForegroundOverlayReceiver } from "@/components/ForegroundOverlayReceiver";

export const metadata: Metadata = {
  title: "Foreground Overlay Receiver — BARCODE Radio",
  description: "1080 by 1920 chroma-key foreground strip for BARCODE Radio live production.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 1080,
  height: 1920,
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ForegroundOverlayPage() {
  return <ForegroundOverlayReceiver />;
}
