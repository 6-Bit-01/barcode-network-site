import type { Metadata, Viewport } from "next";
import { LiveOverlayReceiver } from "@/components/LiveOverlayReceiver";

export const metadata: Metadata = {
  title: "Wheel Browser Source — BARCODE Radio",
  description: "Permanent chroma-key browser source for the BARCODE Radio wheel ceremony.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 1080,
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function WheelOverlayPage() {
  return <LiveOverlayReceiver wheelOnly />;
}
