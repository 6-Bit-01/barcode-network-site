"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

export const FOREGROUND_ARTIST_HOLD_MS = 12_000;
export const FOREGROUND_TRACK_HOLD_MS = 6_000;

export type ForegroundIdentityPhase = "artist" | "track";
export type ForegroundActionTone = "neutral" | "skip" | "bnl" | "sponsor";

type ForegroundOverlayStripProps = {
  artistName: string;
  trackTitle: string;
  wheelSpinsOwed: number;
  submissionsOpen: boolean;
  actionLabel: string;
  actionMessage: string;
  actionTone?: ForegroundActionTone;
  forcedPhase?: ForegroundIdentityPhase;
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
      <span ref={textRef} className="foreground-strip-overflow-text" style={style}>{text}</span>
    </span>
  );
}

export function ForegroundOverlayStrip({
  artistName,
  trackTitle,
  wheelSpinsOwed,
  submissionsOpen,
  actionLabel,
  actionMessage,
  actionTone = "neutral",
  forcedPhase,
}: ForegroundOverlayStripProps) {
  const [phase, setPhase] = useState<ForegroundIdentityPhase>(forcedPhase ?? "artist");

  useEffect(() => {
    if (forcedPhase) {
      setPhase(forcedPhase);
      return;
    }

    setPhase("artist");
    let timeoutId: number;
    const showArtist = () => {
      setPhase("artist");
      timeoutId = window.setTimeout(showTrack, FOREGROUND_ARTIST_HOLD_MS);
    };
    const showTrack = () => {
      setPhase("track");
      timeoutId = window.setTimeout(showArtist, FOREGROUND_TRACK_HOLD_MS);
    };
    timeoutId = window.setTimeout(showTrack, FOREGROUND_ARTIST_HOLD_MS);
    return () => window.clearTimeout(timeoutId);
  }, [artistName, forcedPhase, trackTitle]);

  const identity = phase === "artist" ? artistName : trackTitle;
  const phaseDurationMs = phase === "artist" ? FOREGROUND_ARTIST_HOLD_MS : FOREGROUND_TRACK_HOLD_MS;
  const safeWheelCount = Math.max(0, Math.min(99, Math.trunc(wheelSpinsOwed)));

  return (
    <section className="foreground-strip" data-identity-phase={phase} aria-label="BARCODE Radio foreground overlay">
      <div className="foreground-strip-rail" aria-hidden="true">
        <span /><span /><span /><span /><span />
      </div>

      <div className="foreground-strip-copy">
        <div className="foreground-strip-identity-row">
          <span className="foreground-strip-identity-label">{phase}</span>
          <SlowOverflowText key={`${phase}:${identity}`} text={identity} phaseDurationMs={phaseDurationMs} />
        </div>

        <div className={`foreground-strip-action-row foreground-strip-action-row--${actionTone}`}>
          <span className={`foreground-strip-intake foreground-strip-intake--${submissionsOpen ? "open" : "closed"}`}>
            {submissionsOpen ? "OPEN" : "CLOSED"}
          </span>
          <span className="foreground-strip-action-label">{actionLabel}</span>
          <span className="foreground-strip-action-message">{actionMessage}</span>
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
