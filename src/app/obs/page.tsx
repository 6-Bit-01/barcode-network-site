import type { Metadata } from "next";
import { OBSOverlay } from "@/components/OBSOverlay";

export const metadata: Metadata = {
  title: "OBS Queue Overlay — BARCODE Network",
  description: "Browser source overlay for OBS. Shows live queue state.",
};

export default function OBSPage() {
  return <OBSOverlay />;
}