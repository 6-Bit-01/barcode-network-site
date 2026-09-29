"use client";

import { useEffect, useState } from "react";
import {
  HELLCAT_LADDER_MAX_AGE_MS,
  HELLCAT_LADDER_REFRESH_MS,
  parseHellcatTracks,
  type HellcatLadderResult,
} from "@/lib/hellcat-ladder";
import { startSessionBoundPolling } from "@/lib/session-bound-polling";

export function HellcatLadder() {
  const [result, setResult] = useState<HellcatLadderResult | null>(null);

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

  return <HellcatLadderView result={result} />;
}

export function HellcatLadderView({ result }: { result: HellcatLadderResult | null }) {
  const snapshot = result?.snapshot;
  return (
    <section id="hellcat-ladder" aria-labelledby="hellcat-ladder-title" className="scroll-mt-24 border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">Community spotlight · HellcatNZ</p>
            <h2 id="hellcat-ladder-title" className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">Hellcat&apos;s contest ladder</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">Rankings supplied by HellcatNZ. Scores are his official ratings out of 100.</p>
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
                      {snapshot.tracks.map((track) => (
                        <tr key={track.rank} className="border-t border-border">
                          <th scope="row" className={`px-3 py-4 align-top font-mono sm:px-6 ${track.rank === 1 ? "text-accent" : "text-muted"}`}>{track.rank}</th>
                          <td className="break-words px-3 py-4 sm:px-6">
                            <p className="font-semibold text-foreground">{track.title?.trim() || "Untitled track"}</p>
                            <p className="mt-1 text-xs leading-relaxed text-muted">{track.artist?.trim() || "Unknown artist"}</p>
                          </td>
                          <td className="px-3 py-4 text-right align-top font-mono sm:px-6">
                            {track.score === null ? <span className="font-sans text-xs text-muted">Not scored</span> : <><span className="text-foreground">{track.score}</span><span className="sr-only"> out of 100</span></>}
                          </td>
                        </tr>
                      ))}
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
