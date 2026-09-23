"use client";

import { externalLinks } from "@/content";
import { useLiveStatus } from "@/components/LiveStatusProvider";

export function RadioTikTokLink({ className = "", liveClassName = "", offlineClassName = "" }: { className?: string; liveClassName?: string; offlineClassName?: string }) {
  const { tiktokBroadcastLive, streamUrl } = useLiveStatus();
  return <a
    href={tiktokBroadcastLive ? streamUrl || externalLinks.tiktokLive : externalLinks.tiktok}
    target="_blank"
    rel="noopener noreferrer"
    data-tiktok-live={tiktokBroadcastLive ? "true" : "false"}
    className={`inline-flex min-h-[44px] items-center justify-center gap-2 ${className} ${tiktokBroadcastLive ? liveClassName : offlineClassName}`}
  >
    <span aria-hidden="true">{tiktokBroadcastLive ? "●" : "↗"}</span>
    <span>{tiktokBroadcastLive ? "Watch LIVE on TikTok" : "Visit TikTok"}</span>
  </a>;
}
