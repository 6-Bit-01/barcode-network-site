import type { Metadata } from "next";
import { OBSOverlay } from "@/components/OBSOverlay";

export const metadata: Metadata = {
  title: "OBS Overlay",
  description: "Browser source overlay for OBS. Shows live queue state.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/obs" },
};

export default function OBSPage() {
  return <OBSOverlay />;
}