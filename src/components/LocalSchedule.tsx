"use client";

import { useEffect, useState } from "react";
import { useLiveStatus } from "./LiveStatusProvider";

/**
 * Converts a PST time string (e.g. "6:30 PM") to the visitor's
 * local timezone. Falls back to showing the original PST time
 * if conversion fails or before hydration.
 */
function pstToLocal(pstTime: string): { local: string; zone: string } | null {
  try {
    // Parse the PST time string
    const match = pstTime.match(/^~?(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();

    if (ampm === "PM" && hours !== 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    // Create a date in PST (use a known Friday for context)
    // PST = UTC-8, but we use America/Los_Angeles to handle DST correctly
    const now = new Date();
    const pstDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0
    );

    // Convert: build the date as if in LA timezone, then read in local
    const laFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    // Get the UTC offset of LA right now
    const laOffset = getTimezoneOffset("America/Los_Angeles", now);
    const localOffset = now.getTimezoneOffset();

    // Adjust: pstDate is in LA time, convert to UTC then to local
    const utcMs =
      pstDate.getTime() + laOffset * 60000;
    const localDate = new Date(utcMs - localOffset * 60000);

    const localFormatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const zoneFormatter = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short",
    });

    const zoneParts = zoneFormatter.formatToParts(now);
    const zone =
      zoneParts.find((p) => p.type === "timeZoneName")?.value ?? "";

    const prefix = pstTime.startsWith("~") ? "~" : "";

    return {
      local: prefix + localFormatter.format(localDate),
      zone,
    };
  } catch {
    return null;
  }
}

/** Get timezone offset in minutes for a given IANA timezone */
function getTimezoneOffset(tz: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone: tz });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  return (utcDate.getTime() - tzDate.getTime()) / 60000;
}

/** Check if user is already in Pacific time */
function isPacificTime(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz === "America/Los_Angeles" || tz === "America/Vancouver" ||
           tz === "America/Tijuana" || tz === "US/Pacific";
  } catch {
    return false;
  }
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
  const [localTimes, setLocalTimes] = useState<{
    queue: string;
    show: string;
    first: string;
    zone: string;
    converted: boolean;
  } | null>(null);

  useEffect(() => {
    if (isPacificTime()) {
      // Already in Pacific — just show PST times
      setLocalTimes({
        queue: queueOpens,
        show: showBegins,
        first: firstTrack,
        zone: "PST",
        converted: false,
      });
      return;
    }

    const q = pstToLocal(queueOpens);
    const s = pstToLocal(showBegins);
    const f = pstToLocal(firstTrack);

    if (q && s && f) {
      setLocalTimes({
        queue: q.local,
        show: s.local,
        first: f.local,
        zone: q.zone,
        converted: true,
      });
    } else {
      setLocalTimes({
        queue: queueOpens,
        show: showBegins,
        first: firstTrack,
        zone: "PST",
        converted: false,
      });
    }
  }, [queueOpens, showBegins, firstTrack]);

  // Before hydration — show PST as fallback (no layout shift)
  const displayQueue = localTimes?.queue ?? queueOpens;
  const displayShow = localTimes?.show ?? showBegins;
  const displayFirst = localTimes?.first ?? firstTrack;
  const displayZone = localTimes?.zone ?? "PST";
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
        — Queue opens{" "}
        <span className="text-foreground">{displayQueue}</span>,{" "}
        show begins{" "}
        <span className="text-foreground">{displayShow}</span>,{" "}
        first track{" "}
        <span className="text-foreground">{displayFirst}</span>
      </p>
      {isConverted && (
        <p className="text-xs text-muted/50 mt-1">
          Times shown in your local timezone ({displayZone}).
          Original: {queueOpens} / {showBegins} / {firstTrack}.
        </p>
      )}
      <p className="text-xs text-muted mt-2">
        {notice}
      </p>
    </div>
  );
}