import type { Metadata } from "next";
import { LiveOverlayReceiver } from "@/components/LiveOverlayReceiver";

export const metadata: Metadata = {
  title: "Live Overlay Receiver — BARCODE Radio",
  description: "Square browser-source receiver for BARCODE Radio live production.",
  robots: { index: false, follow: false },
};

export default async function LiveOverlayPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = (await searchParams) ?? {};

  // PR #369 briefly issued this URL as a separate permanent Studio source.
  // Keep saved copies transparent after the combined source is restored so
  // they cannot duplicate the video and track-card lane in production.
  if (query.studioSource === "v2") {
    return null;
  }

  return <LiveOverlayReceiver />;
}
