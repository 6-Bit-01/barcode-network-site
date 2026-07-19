"use client";

import { useSyncExternalStore } from "react";
import { useLiveStatus } from "./LiveStatusProvider";
import { BROADCAST_TZ } from "@/lib/broadcastSchedule";

/**
 * Converts a PT time string (e.g. "6:40 PM") to the visitor's
 * local timezone. Falls back to showing the original PT time
 * if conversion fails or before hydration.
 */
function pacificToLocal(pacificTime: string): { local: string; zone: string } | null {
  try {
    const match = pacificTime.match(/^~?(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const now = new Date();
    const pacificDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
    );

    const laOffset = getTimezoneOffset(BROADCAST_TZ, now);
    const localOffset = now.getTimezoneOffset();
    const utcMs = pacificDate.getTime() + laOffset * 60_000;
    const localDate = new Date(utcMs - localOffset * 60_000);

    const localFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const zoneFormatter = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    });
    const zoneParts = zoneFormatter.formatToParts(now);
    const zone = zoneParts.find((part) => part.type === "timeZoneName")?.value ?? "";
    const prefix = pacificTime.startsWith("~") ? "~" : "";

    return {
      local: prefix + localFormatter.format(localDate),
      zone,
    };
  } catch {
    return null;
  }
}

function getTimezoneOffset(timeZone: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const zonedDate = new Date(date.toLocaleString("en-US", { timeZone }));
  return (utcDate.getTime() - zonedDate.getTime()) / 60_000;
}

function isPacificTime(): boolean {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return ["America/Los_Angeles", "America/Vancouver", "America/Tijuana", "US/Pacific"].includes(timeZone);
  } catch {
    return false;
  }
}

const subscribeToHydration = () => () => {};

function resolveLocalTimes(queueOpens: string, showBegins: string, firstTrack: string) {
  if (isPacificTime()) {
    return {
      queue: queueOpens,
      show: showBegins,
      first: firstTrack,
      zone: "PT",
      converted: false,
    };
  }

  const queue = pacificToLocal(queueOpens);
  const show = pacificToLocal(showBegins);
  const first = pacificToLocal(firstTrack);
  if (queue && show && first) {
    return {
      queue: queue.local,
      show: show.local,
      first: first.local,
      zone: queue.zone,
      converted: true,
    };
  }

  return {
    queue: queueOpens,
    show: showBegins,
    first: firstTrack,
    zone: "PT",
    converted: false,
  };
}

export function LocalSchedule({
  day,
  queueOpens,
  showBegins,
  firstTrack,
  notice,
}: {
  day: string;
  queueOpens: string;
  showBegins: string;
  firstTrack: string;
  notice: string;
}) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const localTimes = hydrated ? resolveLocalTimes(queueOpens, showBegins, firstTrack) : null;
  const displayQueue = localTimes?.queue ?? queueOpens;
  const displayShow = localTimes?.show ?? showBegins;
  const displayFirst = localTimes?.first ?? firstTrack;
  const displayZone = localTimes?.zone ?? "PT";
  const isConverted = localTimes?.converted ?? false;
  const { isLive } = useLiveStatus();

  return (
    <div className={`border ${isLive ? "border-danger/50 bg-danger/5" : "border-accent/30 bg-accent/5"} px-5 py-4 max-w-xl mb-8 transition-colors duration-500`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-danger" : "bg-accent"} animate-status-blink`} />
          <span className={`text-xs uppercase tracking-[0.3em] ${isLive ? "text-danger" : "text-accent"} font-bold`}>
            Live Schedule
          </span>
        </div>
        {isLive ? (
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-danger opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-danger" />
            </span>
            <span className="text-xs uppercase tracking-[0.3em] text-danger font-bold text-glow-red">
              ACTIVE
            </span>
          </span>
        ) : (
          <span className="text-xs uppercase tracking-[0.3em] text-muted/50 font-bold">
            INACTIVE
          </span>
        )}
      </div>
      <p className="text-sm text-foreground/90 font-mono leading-relaxed">
        <span className="text-accent">{day}</span>{" "}
        — submissions open{" "}
        <span className="text-foreground">{displayQueue}</span>,{" "}
        show starts{" "}
        <span className="text-foreground">{displayShow}</span>,{" "}
        music starts{" "}
        <span className="text-foreground">{displayFirst}</span>
      </p>
      {isConverted && (
        <p className="text-xs text-muted/50 mt-1">
          Times shown in your local timezone ({displayZone}). Original: {queueOpens} / {showBegins} / {firstTrack}.
        </p>
      )}
      <p className="text-xs text-muted mt-2">{notice}</p>
    </div>
  );
}
