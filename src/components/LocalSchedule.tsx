"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BROADCAST_TZ, broadcastCountdown, nextBroadcastSchedule } from "@/lib/broadcastSchedule";

const subscribeToHydration = () => () => {};

export function LocalSchedule({ day, queueOpens, showBegins, firstTrack, notice, embedded = false }: {
  day: string;
  queueOpens: string;
  showBegins: string;
  firstTrack: string;
  notice: string;
  embedded?: boolean;
}) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Local minute clock, without another status/network poll.
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const next = hydrated ? nextBroadcastSchedule(new Date(now), { queueOpens, showBegins, firstTrack }) : null;
  const date = next ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: BROADCAST_TZ }).format(next.show) : day;
  const formatLocal = (value: Date) => new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(value);

  return (
    <div className={embedded ? "mt-5 border-t border-accent/25 pt-5" : "mb-8 border border-accent/30 bg-accent/5 p-5"}>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Next scheduled broadcast</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-bold text-foreground">{date}</p>
        {next && <p className="font-mono text-sm text-accent">In {broadcastCountdown(next.show.getTime() - now)}</p>}
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        {[[ "Submissions", queueOpens, next?.queue ], [ "Show starts", showBegins, next?.show ], [ "Music starts", firstTrack, next?.first ]].map(([label, pacific, instant]) => (
          <div key={String(label)}><dt className="text-xs text-muted">{String(label)}</dt><dd className="mt-1 font-bold text-foreground">{String(pacific)}</dd>{instant instanceof Date && <dd className="mt-1 text-[11px] text-muted">{formatLocal(instant)} · your time</dd>}</div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted">Weekly schedule in Pacific Time. Submissions open when the host opens the queue.</p>
      {!embedded && <p className="mt-2 text-xs text-muted">{notice}</p>}
    </div>
  );
}
