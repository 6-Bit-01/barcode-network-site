"use client";

import { useEffect, useState } from "react";
import { externalLinks } from "@/content";
import { useBNLStatus } from "@/components/useBNLStatus";

function bnlTone(online: boolean) {
  return online ? "text-foreground" : "text-foreground/70";
}

function formatLastSeenSentence(value: string | null): string {
  if (!value) return "UNKNOWN";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "UNKNOWN";
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
  const date = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
  return `LAST TRANSMISSION // ${time} // ${date}`;
}

const MODE_LABELS: Record<string, string> = {
  STANDBY: "Standby Layer",
  OBSERVATION: "Observation Layer Stable",
  ACTIVE_LIAISON: "Host Band Active",
  SIGNAL_DEGRADATION: "Signal Drift Detected",
  RESTRICTED: "Restricted Layer Engaged",
};

const SOURCE_LABELS: Record<string, string> = {
  bot: "Liaison Core",
  startup: "Wake Sequence",
  relay: "Outer Channel",
  heartbeat: "Carrier Trace",
  showday: "Broadcast Band",
  showtest: "Test Band",
  admin: "Operator Console",
  reset: "Cold Relay",
  unknown: "Unmarked Signal",
};

function publicModeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

function publicSourceLabel(source?: string): string {
  return SOURCE_LABELS[source ?? "unknown"] ?? "Unmarked Signal";
}

function BNLRelayExplainer() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem("bnl-relay-explainer-dismissed") === "true") {
      setDismissed(true);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    window.sessionStorage.setItem("bnl-relay-explainer-dismissed", "true");
    setVisible(false);
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      className={`fixed right-3 top-24 z-30 w-[calc(100vw-1.5rem)] max-w-sm border border-accent/30 bg-black/95 p-4 font-mono text-white shadow-[0_0_35px_rgba(255,0,0,0.16)] transition-opacity duration-[1800ms] ease-out sm:right-6 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="absolute -top-3 right-8 h-3 w-px bg-accent/60" aria-hidden="true" />
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.35em] text-accent">Relay Explained</p>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-white/45 transition-colors hover:text-accent"
          aria-label="Dismiss relay explanation"
        >
          ×
        </button>
      </div>
      <p className="text-xs leading-relaxed text-white/70">
        That black ticker above is BNL-01&apos;s live relay. Public Discord activity can pass through BNL, get filtered into a Network-safe signal, and echo across the site.
      </p>
      <div className="my-3 flex flex-wrap items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-white/65">
        <span className="border border-white/15 px-2 py-1">Discord</span>
        <span className="text-accent/70">→</span>
        <span className="border border-white/15 px-2 py-1">BNL-01</span>
        <span className="text-accent/70">→</span>
        <span className="border border-accent/40 bg-accent/10 px-2 py-1 text-accent">Ticker</span>
      </div>
      <a
        href={externalLinks.discord}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center border border-accent/60 px-3 py-2 text-[10px] uppercase tracking-[0.28em] text-accent transition-colors hover:bg-accent hover:text-background"
      >
        Join Discord + Feed The Relay
      </a>
    </div>
  );
}

export function BNLNetworkRelayTicker() {
  const { data } = useBNLStatus();
  const online = data.status === "ONLINE";
  const lastSeenSentence = formatLastSeenSentence(data.lastSeen);
  const signalCondition = publicModeLabel(data.mode);

  return (
    <>
      <div aria-hidden className="h-8" />
      <div className="fixed left-0 right-0 top-14 z-40 border-b border-border/80 bg-black px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white sm:px-4 sm:text-[11px] sm:tracking-[0.2em]">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-hidden sm:gap-3">
          <span className="hidden shrink-0 text-white/85 sm:inline">&gt; NETWORK RELAY // BNL-01</span>
          <span className="shrink-0 text-white/85 sm:hidden">&gt; BNL-01 //</span>
          <div className="bnl-relay-scroll min-w-0 flex-1">
            <div className="bnl-relay-scroll-track">
              <span>
                SIGNAL CONDITION <span className={bnlTone(online)}>{signalCondition}</span> :: SURFACE READING {data.message}
                {data.lastSeen ? ` :: ${lastSeenSentence}` : ""} ::
              </span>
              <span aria-hidden>
                SIGNAL CONDITION <span className={bnlTone(online)}>{signalCondition}</span> :: SURFACE READING {data.message}
                {data.lastSeen ? ` :: ${lastSeenSentence}` : ""} ::
              </span>
            </div>
          </div>
        </div>
      </div>
      <BNLRelayExplainer />
    </>
  );
}

export function BNLRelayModule({ title }: { title: string }) {
  const { data, loading } = useBNLStatus();
  const online = data.status === "ONLINE";
  const lastSeenSentence = formatLastSeenSentence(data.lastSeen);

  return (
    <div className="border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.35em] text-muted">{title}</h2>
        <span className={`text-xs uppercase tracking-[0.2em] ${bnlTone(online)}`}>{online ? "LINK ACTIVE" : "LINK QUIET"}</span>
      </div>
      <div className="space-y-2 text-sm text-foreground/70">
        <p>&gt; SIGNAL CONDITION: {publicModeLabel(data.mode)}</p>
        <p>&gt; SURFACE READING: {data.message}</p>
        <p>&gt; NETWORK POSTURE: {data.currentDirective ?? "Monitoring Discord-side relay traffic."}</p>
        <p>&gt; SIGNAL ORIGIN: {publicSourceLabel(data.source)}</p>
        <p>&gt; {lastSeenSentence}</p>
        {loading ? <p className="text-muted">&gt; FETCHING RELAY...</p> : null}
      </div>
    </div>
  );
}
