import type { Metadata, Viewport } from "next";
import { ForegroundOverlayReceiver } from "@/components/ForegroundOverlayReceiver";

export const metadata: Metadata = {
  title: "Foreground Overlay Receiver — BARCODE Radio",
  description: "Square chroma-key foreground strip source for BARCODE Radio live production.",
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

export default function ForegroundOverlayPage() {
  return <ForegroundOverlayReceiver />;
}
