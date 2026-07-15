"use client";

import { usePathname } from "next/navigation";
import { useLiveStatus } from "./LiveStatusProvider";

export function LiveBanner() {
  const pathname = usePathname();
  const { siteShowMode, hasActiveQueueSession, queueHref, streamUrl } = useLiveStatus();

  if (pathname === "/queue" || pathname.startsWith("/queue/")) return null;
  if (siteShowMode === "offline") return null;

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  let text = "BARCODE RADIO IS LIVE";
  let mobileText = "RADIO LIVE";
  let cta = "WATCH LIVE";
  let mobileCta = "WATCH";
  let href = streamUrl;

  if (siteShowMode === "intake_open" && queueHref) {
    text = "BARCODE RADIO SUBMISSIONS ARE OPEN";
    mobileText = "SUBMISSIONS OPEN";
    cta = "SUBMIT A TRACK";
    mobileCta = "SUBMIT";
    href = queueHref;
  }

  if (siteShowMode === "broadcast_live") {
    text = "BARCODE RADIO IS LIVE";
    mobileText = "RADIO LIVE";
    if (hasActiveQueueSession && queueHref) {
      cta = "JOIN THE SHOW";
      mobileCta = "JOIN SHOW";
      href = queueHref;
    }
  }

  const external = href.startsWith("http");
  const topClass = isAdminRoute ? "top-14" : "top-[5.5rem]";

  return (
    <>
      <div aria-hidden className="h-12" />
      <div className={`fixed left-0 right-0 ${topClass} z-40 h-12 border-b border-danger/30 bg-danger/10 backdrop-blur-sm`}>
        <div className="mx-auto h-full max-w-7xl px-3 sm:px-6">
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="group flex h-full min-w-0 items-center justify-center gap-2 overflow-hidden sm:gap-3"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3">
              <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger sm:h-3 sm:w-3" />
            </span>
            <span className="min-w-0 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em] text-danger text-glow-red sm:text-sm sm:tracking-[0.3em]">
              <span className="sm:hidden">{mobileText}</span>
              <span className="hidden sm:inline">{text}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-[10px] uppercase tracking-[0.08em] text-danger/70 transition-colors group-hover:text-danger sm:text-sm sm:tracking-wider">
              <span className="sm:hidden">{mobileCta}</span>
              <span className="hidden sm:inline">{cta}</span>
            </span>
          </a>
        </div>
      </div>
    </>
  );
}
