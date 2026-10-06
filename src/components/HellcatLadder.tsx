"use client";

import { useEffect, useState } from "react";
import {
  HELLCAT_LADDER_MAX_AGE_MS,
  HELLCAT_LADDER_REFRESH_MS,
  parseHellcatTracks,
  type HellcatLadderResult,
} from "@/lib/hellcat-ladder";
import { startSessionBoundPolling } from "@/lib/session-bound-polling";
import { useHellcatRadio } from "@/components/useHellcatRadio";
import { hellcatTrackIsLive, type HellcatPlayback, type HellcatRadioResult } from "@/lib/hellcat-now-playing";

export function HellcatLadder() {
  const [result, setResult] = useState<HellcatLadderResult | null>(null);
  const { audioRef, nowPlaying, playback, toggleListen } = useHellcatRadio(result?.snapshot?.tracks ?? null);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let staleTimer: number | undefined;
    let expiryTimer: number | undefined;
    const clearAgeTimers = () => {
      window.clearTimeout(staleTimer);
      window.clearTimeout(expiryTimer);
    };
    const stop = startSessionBoundPolling({
      intervalMs: HELLCAT_LADDER_REFRESH_MS,
      standbyIntervalMs: HELLCAT_LADDER_REFRESH_MS,
      poll: async () => {
        controller = new AbortController();
        const timeout = window.setTimeout(() => controller?.abort(), 12_000);
        try {
          const response = await fetch("/api/hellcat/ladder", {
            credentials: "omit", cache: "no-store", signal: controller.signal,
          });
          if (!response.ok) throw new Error("Standings unavailable");
          const body = await response.json();
          const tracks = parseHellcatTracks(body?.snapshot);
          if (!tracks || typeof body.snapshot.fetchedAt !== "string" || !Number.isFinite(Date.parse(body.snapshot.fetchedAt))
            || !Number.isFinite(body.ageMs) || body.ageMs < 0 || body.ageMs >= HELLCAT_LADDER_MAX_AGE_MS
            || (body.status !== "ready" && body.status !== "stale")) throw new Error("Invalid standings");
          if (active) {
            clearAgeTimers();
            const next: HellcatLadderResult = {
              status: body.ageMs >= HELLCAT_LADDER_REFRESH_MS ? "stale" : "ready",
              snapshot: { tracks, fetchedAt: body.snapshot.fetchedAt }, ageMs: body.ageMs,
            };
            setResult(next);
            // Use the server's age, not the visitor's wall clock. Even a tab
            // with a slow/offline next request must stop displaying old ranks.
            if (next.status === "ready") staleTimer = window.setTimeout(() => {
              if (active) setResult({ ...next, status: "stale" });
            }, HELLCAT_LADDER_REFRESH_MS - next.ageMs);
            expiryTimer = window.setTimeout(() => {
              if (active) setResult({ status: "unavailable", snapshot: null });
            }, HELLCAT_LADDER_MAX_AGE_MS - next.ageMs);
          }
        } catch {
          if (active) {
            clearAgeTimers();
            setResult({ status: "unavailable", snapshot: null });
          }
        } finally { window.clearTimeout(timeout); }
        return false;
      },
    });
    return () => { active = false; stop(); clearAgeTimers(); controller?.abort(); };
  }, []);

  return <>
    <audio ref={audioRef} id="hellcat-community-stream" preload="none" />
    <HellcatLadderView result={result} radio={{ nowPlaying, playback, toggleListen }} />
  </>;
}

type RadioControls = { nowPlaying: HellcatRadioResult | null; playback: HellcatPlayback; toggleListen: () => void };

export function HellcatLadderView({ result, radio }: { result: HellcatLadderResult | null; radio?: RadioControls }) {
  const snapshot = result?.snapshot;
  return (
    <section id="hellcat-ladder" aria-labelledby="hellcat-ladder-title" className="scroll-mt-24 border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Community spotlight · HellcatNZ</p>
            <h2 id="hellcat-ladder-title" className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">Hellcat&apos;s contest ladder</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Rankings supplied by HellcatNZ. Scores are his official ratings out of 100.</p>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">The green dot marks the song on HellcatNZ&apos;s community radio. Tap its speaker to listen.</p>
          </div>
          <p className="font-mono text-xs text-muted">KOTH standings</p>
        </div>

        <div className="border border-border bg-surface">
          {!snapshot ? (
            <p role="status" className="px-5 py-8 text-sm text-muted sm:px-6">
              {result ? "Hellcat’s standings are temporarily unavailable. Please check back soon." : "Loading Hellcat’s standings…"}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4 text-xs text-muted sm:px-6">
                <p role="status">{result?.status === "stale" ? "Refresh pending · Showing the last retrieved standings" : "Updates every few minutes"}</p>
                <p>Retrieved <time dateTime={snapshot.fetchedAt}>{new Date(snapshot.fetchedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })}</time></p>
              </div>
              {snapshot.tracks.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted sm:px-6">No tracks are listed on Hellcat’s ladder yet.</p>
              ) : (
                <div className="max-h-[34rem] overflow-auto" tabIndex={0} role="region" aria-label="Hellcat contest standings, scroll for all tracks">
                  <table className="w-full table-fixed text-left text-sm">
                    <caption className="sr-only">HellcatNZ contest standings in official rank order. Score is out of 100.</caption>
                    <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wider text-muted">
                      <tr>
                        <th scope="col" className="w-16 px-3 py-4 sm:w-20 sm:px-6">Rank</th>
                        <th scope="col" className="px-3 py-4 sm:px-6">Track / Artist</th>
                        <th scope="col" className="w-24 px-3 py-4 text-right sm:w-28 sm:px-6">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.tracks.map((track) => {
                        const live = hellcatTrackIsLive(track, radio?.nowPlaying ?? null);
                        const listening = radio?.playback === "playing" || radio?.playback === "connecting";
                        return (
                        <tr key={track.rank} data-radio-live={live || undefined} className={`border-t border-border ${live ? "bg-accent/10" : ""}`}>
                          <th scope="row" className={`px-3 py-4 align-top font-mono sm:px-6 ${track.rank === 1 ? "text-accent" : "text-muted"}`}>{track.rank}</th>
                          <td className="break-words px-3 py-4 sm:px-6">
                            <div className="flex items-center justify-between gap-2 sm:gap-4">
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">{track.title?.trim() || "Untitled track"}</p>
                                <p className="mt-1 text-xs leading-relaxed text-muted">{track.artist?.trim() || "Unknown artist"}</p>
                              </div>
                              {live && radio && <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                                <span role="img" aria-label="On air on HellcatNZ’s community radio" className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--color-accent)]" />
                                <button type="button" onClick={radio.toggleListen} aria-controls="hellcat-community-stream"
                                  aria-pressed={listening} aria-label={listening ? "Pause HellcatNZ radio" : "Listen to HellcatNZ radio"}
                                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 border border-accent/50 px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3">
                                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                                    {listening ? <><path d="M16 9v6M20 9v6" /></> : <><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>}
                                  </svg>
                                  <span className="sr-only sm:not-sr-only">{listening ? "Pause" : "Listen"}</span>
                                </button>
                              </div>}
                            </div>
                            {live && radio?.playback === "connecting" && <p role="status" className="mt-2 text-xs text-muted">Connecting to HellcatNZ radio…</p>}
                            {live && radio?.playback === "blocked" && <p role="status" className="mt-2 text-xs text-muted">Tap Listen to start the radio.</p>}
                            {live && radio?.playback === "error" && <p role="status" className="mt-2 text-xs text-muted">Stream unavailable. Tap Listen to try again.</p>}
                          </td>
                          <td className="px-3 py-4 text-right align-top font-mono sm:px-6">
                            {track.score === null ? <span className="font-sans text-xs text-muted">Not scored</span> : <><span className="text-foreground">{track.score}</span><span className="sr-only"> out of 100</span></>}
                          </td>
                        </tr>
                      );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
