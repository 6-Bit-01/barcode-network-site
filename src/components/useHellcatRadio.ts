"use client";

import { useEffect, useRef, useState } from "react";
import type { HellcatTrack } from "@/lib/hellcat-ladder";
import { HELLCAT_RADIO_POLL_MS, HELLCAT_RADIO_STALE_MS, hellcatTrackIsLive,
  parseHellcatRadioResult, type HellcatPlayback, type HellcatRadioResult } from "@/lib/hellcat-now-playing";
import { createHellcatRadioPlayer } from "@/lib/hellcat-radio-player";

export function useHellcatRadio(tracks: HellcatTrack[] | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const player = useRef<ReturnType<typeof createHellcatRadioPlayer> | null>(null);
  const rows = useRef(tracks);
  const current = useRef<HellcatRadioResult | null>(null);
  const wake = useRef<() => void>(() => {});
  const [nowPlaying, setNowPlaying] = useState<HellcatRadioResult | null>(null);
  const [playback, setPlayback] = useState<HellcatPlayback>("paused");

  useEffect(() => {
    rows.current = tracks;
    const radio = current.current;
    // If the displayed ladder goes away, retain intent but leave no hidden,
    // uncontrollable stream playing behind an unavailable table.
    player.current?.update(tracks?.some((track) => hellcatTrackIsLive(track, radio)) ? radio : null);
  }, [tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const receiver = createHellcatRadioPlayer(audio, setPlayback);
    player.current = receiver;
    let active = true, inFlight = false, requested = false;
    let controller: AbortController | null = null;
    let pollTimer: number | undefined, expiryTimer: number | undefined;
    const shouldPoll = () => document.visibilityState === "visible" || receiver.isListening();
    const apply = (radio: HellcatRadioResult | null) => {
      current.current = radio;
      setNowPlaying(radio);
      receiver.update(rows.current?.some((track) => hellcatTrackIsLive(track, radio)) ? radio : null);
    };
    const schedule = () => {
      window.clearTimeout(pollTimer);
      if (active && shouldPoll()) pollTimer = window.setTimeout(() => { void poll(); }, HELLCAT_RADIO_POLL_MS);
    };
    const poll = async () => {
      if (!active || !shouldPoll()) return;
      if (inFlight) { requested = true; return; }
      inFlight = true;
      window.clearTimeout(pollTimer);
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 5000);
      const started = performance.now();
      try {
        const response = await fetch("/api/now-playing", { credentials: "omit", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Radio unavailable");
        const radio = parseHellcatRadioResult(await response.json());
        if (active) {
          window.clearTimeout(expiryTimer);
          // Conservatively include round-trip time so a slow request cannot
          // extend the 90-second receive window. Never use started_at here.
          const remaining = radio.live ? HELLCAT_RADIO_STALE_MS - radio.ageMs - (performance.now() - started) : 0;
          apply(remaining > 0 ? radio : null);
          if (remaining > 0) expiryTimer = window.setTimeout(() => { if (active) apply(null); }, remaining);
        }
      } catch {
        if (active) { window.clearTimeout(expiryTimer); apply(null); }
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (active) {
          if (requested) { requested = false; void poll(); }
          else schedule();
        }
      }
    };
    const refresh = () => { if (shouldPoll()) void poll(); else window.clearTimeout(pollTimer); };
    wake.current = refresh;
    document.addEventListener("visibilitychange", refresh);
    for (const event of ["focus", "pageshow", "online"]) window.addEventListener(event, refresh);
    void poll();
    return () => {
      active = false; controller?.abort();
      window.clearTimeout(pollTimer); window.clearTimeout(expiryTimer);
      document.removeEventListener("visibilitychange", refresh);
      for (const event of ["focus", "pageshow", "online"]) window.removeEventListener(event, refresh);
      wake.current = () => {};
      player.current = null;
      receiver.dispose();
    };
  }, []);

  return { audioRef, nowPlaying, playback, toggleListen: () => { player.current?.toggle(); wake.current(); } };
}
