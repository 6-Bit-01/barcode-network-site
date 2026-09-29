"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { nextHellcatContest } from "@/lib/hellcat-schedule";

const subscribeToHydration = () => () => {};

export function HellcatSchedule() {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const next = hydrated ? nextHellcatContest(new Date(now)) : null;
  const localTime = next ? new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(next) : null;

  return (
    <div className="mt-5 border-l-2 border-accent/50 pl-3">
      <p className="font-mono text-sm font-bold text-accent">Saturdays at 2:45 PM NZST <span className="whitespace-nowrap">(UTC+12)</span></p>
      {next && <p className="mt-2 text-xs leading-relaxed text-foreground/75">Next in your time: <time dateTime={next.toISOString()}>{localTime}</time></p>}
    </div>
  );
}
