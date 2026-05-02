"use client";

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

export function BNLNetworkRelayTicker() {
  const { data } = useBNLStatus();
  const online = data.status === "ONLINE";
  const lastSeenSentence = formatLastSeenSentence(data.lastSeen);
  const signalCondition = publicModeLabel(data.mode);

  return (
    <>
      <div aria-hidden className="h-8" />
      <div className="fixed left-0 right-0 top-14 z-40 border-b border-border/80 bg-black px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-hidden">
          <span className="shrink-0 text-white/85">&gt; NETWORK RELAY // BNL-01</span>
          <div className="bnl-relay-scroll min-w-0">
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
