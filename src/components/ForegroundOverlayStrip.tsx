"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FOREGROUND_ARTIST_HOLD_MS, FOREGROUND_TRACK_HOLD_MS, foregroundIdentityPhaseAt } from "@/lib/foreground-overlay-resolver";
import type { ForegroundIdentityPhase, ForegroundOverlayActionTone } from "@/lib/foreground-overlay-resolver";

export { FOREGROUND_ARTIST_HOLD_MS, FOREGROUND_TRACK_HOLD_MS } from "@/lib/foreground-overlay-resolver";
export type { ForegroundIdentityPhase } from "@/lib/foreground-overlay-resolver";
export type ForegroundActionTone = ForegroundOverlayActionTone;

type ForegroundOverlayStripProps = {
  artistName: string;
  trackTitle: string;
  wheelSpinsOwed: number;
  submissionsOpen: boolean;
  actionId?: string;
  actionLabel: string;
  actionMessage: string;
  actionTone?: ForegroundActionTone;
  forcedPhase?: ForegroundIdentityPhase;
  identityCycleStartedAt?: string | null;
};

function SlowOverflowText({ text, phaseDurationMs }: { text: string; phaseDurationMs: number }) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [scroll, setScroll] = useState({ distance: 0, durationSeconds: 0 });

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = textRef.current;
    if (!viewport || !content) return;

    const measure = () => {
      const distance = Math.max(0, Math.ceil(content.scrollWidth - viewport.clientWidth));
      if (distance <= 2) {
        setScroll({ distance: 0, durationSeconds: 0 });
        return;
      }

      const availableSeconds = Math.max(3.5, (phaseDurationMs - 1_100) / 1_000);
      const naturalSeconds = Math.max(4.5, distance / 28 + 1.2);
      setScroll({ distance, durationSeconds: Math.min(availableSeconds, naturalSeconds) });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [phaseDurationMs, text]);

  const style = {
    "--fg-scroll-distance": `-${scroll.distance}px`,
    "--fg-scroll-duration": `${scroll.durationSeconds}s`,
  } as CSSProperties;

  return (
    <span ref={viewportRef} className="foreground-strip-overflow" data-overflowing={scroll.distance > 0 ? "true" : "false"}>
      <span ref={textRef} className="foreground-strip-overflow-text" data-text={text} style={style}>{text}</span>
    </span>
  );
}

export function ForegroundOverlayStrip({
  artistName,
  trackTitle,
  wheelSpinsOwed,
  submissionsOpen,
  actionId,
  actionLabel,
  actionMessage,
  actionTone = "neutral",
  forcedPhase,
  identityCycleStartedAt,
}: ForegroundOverlayStripProps) {
  const [phase, setPhase] = useState<ForegroundIdentityPhase>(forcedPhase ?? "artist");
  const [glitchActive, setGlitchActive] = useState(false);
  const [wheelPulsing, setWheelPulsing] = useState(false);
  const previousWheelCount = useRef(0);

  useEffect(() => {
    if (forcedPhase) {
      setPhase(forcedPhase);
      return;
    }

    const parsedAnchor = identityCycleStartedAt ? Date.parse(identityCycleStartedAt) : Number.NaN;
    const cycleAnchorMs = Number.isFinite(parsedAnchor) ? parsedAnchor : Date.now();
    let timeoutId = 0;
    const synchronizePhase = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      const next = foregroundIdentityPhaseAt(cycleAnchorMs, Date.now());
      setPhase(next.phase);
      timeoutId = window.setTimeout(synchronizePhase, next.remainingMs + 20);
    };
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === "visible") synchronizePhase();
    };

    synchronizePhase();
    document.addEventListener("visibilitychange", synchronizeWhenVisible);
    window.addEventListener("focus", synchronizePhase);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", synchronizeWhenVisible);
      window.removeEventListener("focus", synchronizePhase);
    };
  }, [artistName, forcedPhase, identityCycleStartedAt, trackTitle]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    let firstBurst = true;
    let delayId = 0;
    let clearId = 0;

    const scheduleBurst = () => {
      const delayMs = firstBurst ? 2_800 : 18_000 + Math.floor(Math.random() * 18_000);
      firstBurst = false;
      delayId = window.setTimeout(() => {
        if (stopped) return;
        setGlitchActive(true);
        clearId = window.setTimeout(() => {
          if (stopped) return;
          setGlitchActive(false);
          scheduleBurst();
        }, 420);
      }, delayMs);
    };

    scheduleBurst();
    return () => {
      stopped = true;
      window.clearTimeout(delayId);
      window.clearTimeout(clearId);
    };
  }, []);

  useEffect(() => {
    const nextCount = Math.max(0, Math.min(99, Math.trunc(wheelSpinsOwed)));
    const unlocked = wheelSpinsOwed > previousWheelCount.current;
    previousWheelCount.current = nextCount;
    if (!unlocked) return;
    setWheelPulsing(true);
    const timeoutId = window.setTimeout(() => setWheelPulsing(false), 1_450);
    return () => window.clearTimeout(timeoutId);
  }, [wheelSpinsOwed]);

  const identity = phase === "artist" ? artistName : trackTitle;
  const phaseDurationMs = phase === "artist" ? FOREGROUND_ARTIST_HOLD_MS : FOREGROUND_TRACK_HOLD_MS;
  const safeWheelCount = Math.max(0, Math.min(99, Math.trunc(wheelSpinsOwed)));

  return (
    <section
      className="foreground-strip"
      data-glitch-active={glitchActive ? "true" : "false"}
      data-identity-phase={phase}
      data-wheel-pulsing={wheelPulsing ? "true" : "false"}
      aria-label="BARCODE Radio foreground overlay"
    >
      <div className="foreground-strip-rail" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>

      <div className="foreground-strip-copy">
        <div className="foreground-strip-identity-row">
          <span className="foreground-strip-identity-label">{phase}</span>
          <SlowOverflowText key={`${phase}:${identity}`} text={identity} phaseDurationMs={phaseDurationMs} />
        </div>

        <div key={actionId ?? `${actionLabel}:${actionMessage}`} className={`foreground-strip-action-row foreground-strip-action-row--${actionTone}`}>
          <span className={`foreground-strip-intake foreground-strip-intake--${submissionsOpen ? "open" : "closed"}`}>
            {submissionsOpen ? "OPEN" : "CLOSED"}
          </span>
          <span className="foreground-strip-action-label" data-text={actionLabel}>{actionLabel}</span>
          <span className="foreground-strip-action-message" data-text={actionMessage} title={actionMessage}>{actionMessage}</span>
        </div>
      </div>

      <div className="foreground-strip-wheel-endcap" aria-label={`${safeWheelCount} Wheel spins owed`}>
        <span className="foreground-strip-wheel-pointer" aria-hidden="true" />
        <span className="foreground-strip-wheel" aria-hidden="true" />
        <span className="foreground-strip-wheel-count">{safeWheelCount}</span>
        <span className="foreground-strip-wheel-label">Spins</span>
      </div>
    </section>
  );
}
