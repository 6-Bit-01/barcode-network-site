import type { Metadata } from "next";
import { ForegroundOverlayReceiver } from "@/components/ForegroundOverlayReceiver";

export const metadata: Metadata = {
  title: "Foreground Overlay Receiver — BARCODE Radio",
  description: "1080 by 1920 chroma-key foreground strip for BARCODE Radio live production.",
  robots: { index: false, follow: false },
};

export default function ForegroundOverlayPage() {
  return <ForegroundOverlayReceiver />;
}
