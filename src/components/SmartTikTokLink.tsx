"use client";

import { useLiveStatus } from "./LiveStatusProvider";

interface SmartTikTokLinkProps {
  className?: string;
  offlineLabel: string;
  liveLabel: string;
}

export function SmartTikTokLink({ className, offlineLabel, liveLabel }: SmartTikTokLinkProps) {
  const { isLive, streamUrl } = useLiveStatus();

  return (
    <a
      href={streamUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      <span className="text-sm text-muted group-hover:text-accent transition-colors uppercase tracking-wider">{isLive ? liveLabel : offlineLabel}</span>
    </a>
  );
}
