import type { Metadata } from "next";
import { LiveOverlayReceiver } from "@/components/LiveOverlayReceiver";

export const metadata: Metadata = {
  title: "Live Overlay Receiver — BARCODE Radio",
  description: "Square browser-source receiver for BARCODE Radio live production.",
  robots: { index: false, follow: false },
};

export default function LiveOverlayPage() {
  return <LiveOverlayReceiver />;
}
