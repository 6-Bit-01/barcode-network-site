import type { Metadata } from "next";
import { RadioVisualsReceiver } from "@/components/RadioVisualsReceiver";

export const metadata: Metadata = {
  title: "Radio Visuals Receiver — BARCODE Radio",
  description: "Responsive queue- and player-reactive browser-source strip for BARCODE Radio live production.",
  robots: { index: false, follow: false },
};

export default function RadioVisualsPage() {
  return <RadioVisualsReceiver />;
}
