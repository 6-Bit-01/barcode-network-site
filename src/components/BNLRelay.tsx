/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
  forcePull: "Direct Liaison Request",
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
  const [glitchingOut, setGlitchingOut] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/queue" || pathname.startsWith("/queue/")) return;
    if (window.localStorage.getItem("bnl-relay-explainer-never-show") === "true" || window.sessionStorage.getItem("bnl-relay-explainer-dismissed") === "true") {
      setDismissed(true);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), 10000);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  function dismiss(neverShow = false) {
    if (neverShow) window.localStorage.setItem("bnl-relay-explainer-never-show", "true");
    window.sessionStorage.setItem("bnl-relay-explainer-dismissed", "true");
    setGlitchingOut(true);
    setVisible(false);
    window.setTimeout(() => setDismissed(true), 520);
  }

  if (pathname === "/queue" || pathname.startsWith("/queue/") || dismissed) return null;

  return (
    <div
      className={`fixed inset-x-3 bottom-16 z-30 sm:top-24 sm:bottom-auto border border-accent/30 bg-black/95 p-3 font-mono text-white shadow-[0_0_35px_rgba(255,0,0,0.16)] transition-opacity duration-[2600ms] ease-out sm:inset-x-auto sm:right-6 sm:w-[calc(100vw-1.5rem)] sm:max-w-sm sm:p-4 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      } ${glitchingOut ? "animate-[bnl-relay-glitch-out_520ms_steps(2,end)_forwards]" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 animate-none bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.09)_49%,transparent_50%)] bg-[length:100%_6px]" aria-hidden="true" />
      <div className="absolute -top-3 right-8 h-3 w-px bg-accent/60" aria-hidden="true" />
      <div className="mb-1.5 flex items-start justify-between gap-3 sm:mb-2">
        <p className="text-[9px] uppercase tracking-[0.28em] text-accent sm:text-[10px] sm:tracking-[0.35em]">Relay Explained</p>
        <button
          type="button"
          onClick={() => dismiss()}
          className="-m-2 p-2 text-sm leading-none text-white/55 transition-colors hover:text-accent sm:text-xs"
          aria-label="Dismiss relay explanation"
        >
          ×
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-white/70 sm:text-xs">
        The black ticker is BNL-01&apos;s live relay. Public Discord activity can pass through BNL and echo across the site.
      </p>
      <div className="my-2 flex flex-wrap items-center gap-1 text-[8px] uppercase tracking-[0.12em] text-white/65 sm:my-3 sm:gap-1.5 sm:text-[9px] sm:tracking-[0.16em]">
        <span className="border border-white/15 px-1.5 py-0.5 sm:px-2 sm:py-1">Discord</span>
        <span className="text-accent/70">→</span>
        <span className="border border-white/15 px-1.5 py-0.5 sm:px-2 sm:py-1">BNL-01</span>
        <span className="text-accent/70">→</span>
        <span className="border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-accent sm:px-2 sm:py-1">Ticker</span>
      </div>
      <a
        href={externalLinks.discord}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center border border-accent/60 px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-background sm:py-2 sm:text-[10px] sm:tracking-[0.28em]"
      >
        Join Discord + Feed The Relay
      </a>
      <button type="button" onClick={() => dismiss(true)} className="mt-2 w-full text-center text-[9px] uppercase tracking-[0.18em] text-white/45 transition-colors hover:text-white/75">Don&apos;t show this again</button>
      <style jsx>{`
        @keyframes bnl-relay-glitch-out {
          0% {
            opacity: 1;
            filter: none;
            transform: translate(0, 0) skewX(0deg);
            clip-path: inset(0 0 0 0);
          }
          14% {
            opacity: 0.88;
            filter: blur(0.5px) contrast(1.5);
            transform: translate(-4px, 1px) skewX(-2deg);
            clip-path: inset(8% 0 6% 0);
          }
          28% {
            opacity: 1;
            filter: blur(0) contrast(1.2);
            transform: translate(5px, -1px) skewX(2deg);
            clip-path: inset(0 0 18% 0);
          }
          42% {
            opacity: 0.65;
            filter: blur(1px) contrast(1.8);
            transform: translate(-2px, 2px) skewX(-4deg);
            clip-path: inset(22% 0 0 0);
          }
          60% {
            opacity: 0.45;
            filter: blur(1.5px) contrast(2);
            transform: translate(7px, 0) skewX(5deg);
            clip-path: inset(0 0 42% 0);
          }
          78% {
            opacity: 0.2;
            filter: blur(2px) contrast(2.4);
            transform: translate(-8px, -1px) skewX(-6deg);
            clip-path: inset(48% 0 22% 0);
          }
          100% {
            opacity: 0;
            filter: blur(3px) contrast(2.8);
            transform: translate(10px, 0) skewX(8deg);
            clip-path: inset(50% 0 50% 0);
          }
        }
      `}</style>
    </div>
  );
}

export function BNLNetworkRelayTicker() {
  const { data, error, synchronized } = useBNLStatus();
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
                SIGNAL CONDITION <span className={bnlTone(online)}>{signalCondition}</span> :: {!synchronized && error ? "SYNC FAILURE" : `SURFACE READING ${data.message}`}
                {data.lastSeen ? ` :: ${lastSeenSentence}` : ""} ::
              </span>
              <span aria-hidden>
                SIGNAL CONDITION <span className={bnlTone(online)}>{signalCondition}</span> :: {!synchronized && error ? "SYNC FAILURE" : `SURFACE READING ${data.message}`}
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
  const { data, loading, error, synchronized } = useBNLStatus();
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
        {!synchronized && error ? <p className="text-danger">&gt; RELAY SYNC FAILURE: status unavailable; retrying.</p> : null}
      </div>
    </div>
  );
}
