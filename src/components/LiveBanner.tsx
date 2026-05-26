"use client";

import { usePathname } from "next/navigation";
import { useLiveStatus } from "./LiveStatusProvider";

export function LiveBanner() {
  const pathname = usePathname();
  const { siteShowMode, hasActiveQueueSession, queueHref, streamUrl } = useLiveStatus();

  if (pathname === "/queue" || pathname.startsWith("/queue/")) return null;
  if (siteShowMode === "offline") return null;

  let text = "BARCODE RADIO IS LIVE";
  let cta = "WATCH LIVE";
  let href = streamUrl;

  if (siteShowMode === "intake_open" && queueHref) {
    text = "BARCODE RADIO SUBMISSIONS ARE OPEN";
    cta = "SUBMIT A TRACK";
    href = queueHref;
  }

  if (siteShowMode === "broadcast_live") {
    text = "BARCODE RADIO IS LIVE";
    if (hasActiveQueueSession && queueHref) {
      cta = "JOIN THE SHOW";
      href = queueHref;
    }
  }

  const external = href.startsWith("http");

  return (
    <div className="bg-danger/10 border-b border-danger/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="flex items-center justify-center gap-3 py-3 group"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-danger" />
          </span>
          <span className="text-sm uppercase tracking-[0.3em] text-danger font-bold text-glow-red">{text}</span>
          <span className="text-sm text-danger/60 uppercase tracking-wider group-hover:text-danger transition-colors">{cta}</span>
        </a>
      </div>
    </div>
  );
}
