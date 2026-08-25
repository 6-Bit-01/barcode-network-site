"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { deckProjectHref } from "@/lib/broadcast-deck";
import type { QueuePublicHistoryEvent } from "@/lib/queue-types";

type ActivityFilter = "all" | "track" | "wheel" | "show";
type ActivityOrder = "newest" | "oldest";

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "track", label: "Tracks" },
  { value: "wheel", label: "Wheel" },
  { value: "show", label: "Show" },
];

function eventCategory(event: QueuePublicHistoryEvent): Exclude<ActivityFilter, "all"> {
  if (event.eventType.startsWith("track_")) return "track";
  if (event.eventType.startsWith("wheel_")) return "wheel";
  return "show";
}

function eventCode(event: QueuePublicHistoryEvent): string {
  if (event.eventType === "track_play_started") return "PLAY";
  if (event.eventType === "track_finished") return "DONE";
  if (event.eventType === "track_removed") return "CUT";
  if (event.eventType === "track_skipped") return "SKIP";
  if (event.eventType === "track_playback_error" || event.eventType === "track_stalled") return "FAULT";
  if (event.eventType === "wheel_spin_unlocked") return "+SPIN";
  if (event.eventType === "wheel_confirmed") return "CHOSEN";
  if (event.eventType.startsWith("wheel_")) return "WHEEL";
  if (event.eventType.startsWith("sponsor_")) return "BREAK";
  if (event.eventType === "broadcast_started") return "LIVE";
  if (event.eventType === "session_archived") return "SEALED";
  return "ROUTE";
}

function eventTone(event: QueuePublicHistoryEvent): string {
  if (event.eventType.startsWith("wheel_")) return "border-cyan-200/45 text-cyan-200";
  if (event.eventType === "track_removed" || event.eventType === "track_skipped" || event.eventType === "track_playback_error") return "border-accent/50 text-accent";
  if (event.eventType === "track_play_started" || event.eventType === "track_finished" || event.eventType === "track_resumed") return "border-[#ffaa00]/50 text-[#ffaa00]";
  if (event.eventType.startsWith("track_")) return "border-foreground/25 text-foreground";
  return "border-violet-300/40 text-violet-200";
}

function displayEventTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(parsed);
}

export function BroadcastActivityLog({
  events,
  archiveHref,
  live,
}: {
  events: QueuePublicHistoryEvent[];
  archiveHref: string;
  live: boolean;
}) {
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [order, setOrder] = useState<ActivityOrder>("newest");
  const [freshEventId, setFreshEventId] = useState<string | null>(null);
  const previousNewestId = useRef<string | null>(null);

  const newestEvent = useMemo(
    () => [...events].sort((left, right) => right.sequence - left.sequence)[0] ?? null,
    [events],
  );

  useEffect(() => {
    const nextId = newestEvent?.eventId ?? null;
    const previousId = previousNewestId.current;
    previousNewestId.current = nextId;
    if (!nextId || !previousId || nextId === previousId) return;
    setFreshEventId(nextId);
    const timeout = window.setTimeout(() => setFreshEventId(null), 2_200);
    return () => window.clearTimeout(timeout);
  }, [newestEvent]);

  const counts = useMemo(() => ({
    all: events.length,
    track: events.filter((event) => eventCategory(event) === "track").length,
    wheel: events.filter((event) => eventCategory(event) === "wheel").length,
    show: events.filter((event) => eventCategory(event) === "show").length,
  }), [events]);

  const visibleEvents = useMemo(() => events
    .filter((event) => filter === "all" || eventCategory(event) === filter)
    .sort((left, right) => order === "newest" ? right.sequence - left.sequence : left.sequence - right.sequence), [events, filter, order]);

  return (
    <section className="activity-log relative overflow-hidden" aria-label="Live show activity log">
      <div className="activity-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="activity-scan pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" />
      <div className="relative border-b-2 border-[#ffaa00]/45 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#ffaa00]">Live show activity</p>
              <span className={`${live ? "border-emerald-300/50 text-emerald-200" : "border-border text-muted"} inline-flex items-center gap-2 border px-2 py-1 text-[9px] font-black uppercase tracking-[0.2em]`}>
                <span className={`${live ? "activity-live-dot bg-emerald-300" : "bg-muted"} h-1.5 w-1.5 rounded-full`} aria-hidden="true" />
                {live ? "Following signal" : "Retained log"}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">Every retained public-safe show movement appears here. Filter the route without losing the full log.</p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{events.length} event{events.length === 1 ? "" : "s"} retained</p>
        </div>

        <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="Activity filters">
            {FILTERS.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={`${filter === item.value ? "border-[#ffaa00] bg-[#ffaa00] text-background" : "border-border bg-background/65 text-muted hover:border-[#ffaa00]/60 hover:text-[#ffaa00]"} border px-3 py-2 text-[10px] font-black uppercase tracking-widest`}>{item.label} · {counts[item.value]}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2" aria-label="Activity order">
            <button type="button" aria-pressed={order === "newest"} onClick={() => setOrder("newest")} className={`${order === "newest" ? "border-cyan-200 bg-cyan-200/15 text-cyan-100" : "border-border text-muted"} border px-3 py-2 text-[10px] font-black uppercase tracking-widest`}>Newest first</button>
            <button type="button" aria-pressed={order === "oldest"} onClick={() => setOrder("oldest")} className={`${order === "oldest" ? "border-cyan-200 bg-cyan-200/15 text-cyan-100" : "border-border text-muted"} border px-3 py-2 text-[10px] font-black uppercase tracking-widest`}>Oldest first</button>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">{freshEventId && newestEvent ? `${newestEvent.headline}. ${newestEvent.detail}` : ""}</p>

      {visibleEvents.length > 0 ? (
        <ol className="activity-route relative mt-5 max-h-[52rem] space-y-3 overflow-y-auto pr-1" data-order={order}>
          {visibleEvents.map((event, index) => {
            const category = eventCategory(event);
            const isFresh = event.eventId === freshEventId;
            return (
              <li key={event.eventId} data-category={category} data-fresh={isFresh ? "true" : undefined} className={`activity-event relative ml-3 grid gap-3 border bg-background/70 p-4 pl-6 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-start ${eventTone(event)}`} style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
                <span className="activity-node absolute -left-[0.93rem] top-5 h-3 w-3 rotate-45 border bg-background" aria-hidden="true" />
                <div>
                  <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em]">{eventCode(event)}</p>
                  <time className="mt-2 block font-mono text-[10px] text-muted" dateTime={event.occurredAt}>{displayEventTime(event.occurredAt)}</time>
                </div>
                <div>
                  <p className="text-sm font-black text-foreground sm:text-base">{event.headline}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{event.detail}</p>
                </div>
                {event.track ? <Link href={deckProjectHref(event.track.projectLabel, archiveHref)} className="w-fit border border-current/40 px-2 py-1 text-[9px] font-black uppercase tracking-widest hover:bg-current hover:text-background">Artist history</Link> : <span className="hidden text-[9px] uppercase tracking-widest text-muted sm:block">#{event.sequence}</span>}
              </li>
            );
          })}
        </ol>
      ) : <div className="mt-5 border border-dashed border-border bg-background/45 p-6 text-center"><p className="text-sm font-bold text-foreground">No {filter === "all" ? "show" : filter} events yet.</p><p className="mt-2 text-xs text-muted">The route will move when the next matching event reaches the Deck.</p></div>}

      <style jsx>{`
        .activity-grid{background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(to bottom,black,transparent 95%)}
        .activity-scan{background:linear-gradient(90deg,transparent,rgba(255,170,0,.8),rgba(103,232,249,.72),transparent);box-shadow:0 0 18px rgba(255,170,0,.35);animation:activity-scan 5.8s linear infinite}
        .activity-route::before{content:"";position:absolute;left:.45rem;top:.8rem;bottom:.8rem;width:1px;background:linear-gradient(to bottom,rgba(255,170,0,.8),rgba(103,232,249,.45),rgba(167,139,250,.24));box-shadow:0 0 16px rgba(255,170,0,.18)}
        .activity-event{animation:activity-arrive .42s both ease-out;transition:border-color .2s ease,background-color .2s ease,transform .2s ease}
        .activity-event:hover{transform:translateX(3px);background-color:rgba(255,255,255,.045)}
        .activity-event[data-fresh="true"]{animation:activity-fresh 2.2s ease-out}
        .activity-node{box-shadow:0 0 14px currentColor}
        .activity-live-dot{box-shadow:0 0 14px rgba(110,231,183,.9);animation:activity-live 1.6s ease-in-out infinite}
        @keyframes activity-scan{from{transform:translateY(0);opacity:0}8%{opacity:.8}92%{opacity:.3}to{transform:translateY(48rem);opacity:0}}
        @keyframes activity-arrive{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes activity-fresh{0%{background:rgba(255,170,0,.22);box-shadow:0 0 0 rgba(255,170,0,0)}35%{box-shadow:0 0 36px rgba(255,170,0,.22)}100%{background:rgba(0,0,0,.2);box-shadow:0 0 0 rgba(255,170,0,0)}}
        @keyframes activity-live{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
        @media (prefers-reduced-motion:reduce){.activity-scan,.activity-event,.activity-event[data-fresh="true"],.activity-live-dot{animation:none}.activity-event:hover{transform:none}}
      `}</style>
    </section>
  );
}
