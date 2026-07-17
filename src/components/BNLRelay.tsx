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
  forcePull: "Direct Liaison Request",
  unknown: "Unmarked Signal",
};

function publicModeLabel(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

function publicSourceLabel(source?: string): string {
  return SOURCE_LABELS[source ?? "unknown"] ?? "Unmarked Signal";
}

export function BNLNetworkRelayTicker() {
  const { data, error, lastSuccessfulRefresh } = useBNLStatus();
  const hasLiveSnapshot = Boolean(lastSuccessfulRefresh);
  const online = hasLiveSnapshot && data.status === "ONLINE";
  const lastSeenSentence = formatLastSeenSentence(data.lastSeen);
  const signalCondition = hasLiveSnapshot ? publicModeLabel(data.mode) : "SYNC PENDING";

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
                SIGNAL CONDITION <span className={bnlTone(online)}>{signalCondition}</span> :: {!hasLiveSnapshot && error ? "SYNC UNAVAILABLE — RETRYING" : `SURFACE READING ${data.message}${error ? " :: SYNC DEGRADED — RETRYING" : ""}`}
                {data.lastSeen ? ` :: ${lastSeenSentence}` : ""} ::
              </span>
              <span aria-hidden>
                SIGNAL CONDITION <span className={bnlTone(online)}>{signalCondition}</span> :: {!hasLiveSnapshot && error ? "SYNC UNAVAILABLE — RETRYING" : `SURFACE READING ${data.message}${error ? " :: SYNC DEGRADED — RETRYING" : ""}`}
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
  const { data, loading, error, synchronized, lastSuccessfulRefresh } = useBNLStatus();
  const hasLiveSnapshot = Boolean(lastSuccessfulRefresh);
  const online = hasLiveSnapshot && data.status === "ONLINE";
  const lastSeenSentence = hasLiveSnapshot ? formatLastSeenSentence(data.lastSeen) : "timestamp unavailable while retrying";

  return (
    <div className="border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.35em] text-muted">{title}</h2>
        <span className={`text-xs uppercase tracking-[0.2em] ${bnlTone(online)}`}>{hasLiveSnapshot ? (online ? "LINK ACTIVE" : "LINK QUIET") : "SYNC RETRY"}</span>
      </div>
      <div className="space-y-2 text-sm text-foreground/70">
        {hasLiveSnapshot ? (
          <>
            <p>&gt; SIGNAL CONDITION: {publicModeLabel(data.mode)}</p>
            <p>&gt; SURFACE READING: {data.message}</p>
            <p>&gt; NETWORK POSTURE: {data.currentDirective ?? "Monitoring Discord-side relay traffic."}</p>
            <p>&gt; SIGNAL ORIGIN: {publicSourceLabel(data.source)}</p>
            <p>&gt; {lastSeenSentence}</p>
          </>
        ) : (
          <>
            <p>&gt; SIGNAL CONDITION: SYNC PENDING</p>
            <p>&gt; RELAY STATE: unavailable while retrying synchronization.</p>
            <p>&gt; SIGNAL ORIGIN: pending</p>
            <p>&gt; {lastSeenSentence}</p>
          </>
        )}
        {loading ? <p className="text-muted">&gt; FETCHING RELAY...</p> : null}
        {hasLiveSnapshot && error ? <p className="text-muted">&gt; RELAY SYNC DEGRADED: showing last confirmed relay while retrying.</p> : null}
        {!synchronized && error ? <p className="text-danger">&gt; RELAY SYNC FAILURE: status unavailable; retrying.</p> : null}
      </div>
    </div>
  );
}
