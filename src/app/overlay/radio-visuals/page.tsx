import type { Metadata, Viewport } from "next";
import { RadioVisualsReceiver } from "@/components/RadioVisualsReceiver";

export const metadata: Metadata = {
  title: "Radio Visuals Receiver — BARCODE Radio",
  description: "Chroma-keyed, queue- and player-reactive visual-effects source for BARCODE Radio live production.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 1080,
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RadioVisualsPage() {
  return <RadioVisualsReceiver />;
}
