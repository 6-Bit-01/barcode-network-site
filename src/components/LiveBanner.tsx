"use client";

import { useLiveStatus } from "./LiveStatusProvider";
import { liveBanner } from "@/content";

export function LiveBanner() {
  const { isLive, streamUrl } = useLiveStatus();

  if (!isLive) return null;

  return (
    <div className="bg-danger/10 border-b border-danger/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <a
          href={streamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 py-3 group"
        >
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-danger" />
          </span>
          <span className="text-sm uppercase tracking-[0.3em] text-danger font-bold text-glow-red">
            {liveBanner.text}
          </span>
          <span className="text-sm text-danger/60 uppercase tracking-wider group-hover:text-danger transition-colors">
            {liveBanner.watchText}
          </span>
        </a>
      </div>
    </div>
  );
}