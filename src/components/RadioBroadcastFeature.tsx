"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { externalLinks } from "@/content";
import { radioShowDate, radioShowDuration, type RadioShowFeature } from "@/lib/radio-show-feature";
import { startSessionBoundPolling } from "@/lib/session-bound-polling";
import styles from "./RadioBroadcastFeature.module.css";

export function RadioBroadcastFeature() {
  const [feature, setFeature] = useState<RadioShowFeature | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/queue/stats?view=feature", { credentials: "omit" });
      if (!response.ok) throw new Error("Show details unavailable");
      const next = await response.json() as RadioShowFeature;
      if (next.schemaVersion !== "radio_show_feature_v2") throw new Error("Unrecognized show details");
      setFeature(next);
      setUnavailable(false);
      return next.mode === "live" || next.submissionsOpen;
    } catch {
      setFeature(null);
      setUnavailable(true);
      return false;
    }
  }, []);

  useEffect(() => startSessionBoundPolling({ intervalMs: 30_000, standbyIntervalMs: 60_000, poll: load }), [load]);

  return <RadioBroadcastFeatureView feature={feature} unavailable={unavailable} />;
}

export function RadioBroadcastFeatureView({ feature, unavailable = false }: {
  feature: RadioShowFeature | null;
  unavailable?: boolean;
}) {
  const live = feature?.mode === "live";
  const show = feature?.show;
  const title = live ? "The Broadcast Deck" : "The Broadcast Archive";
  const href = live ? "/radio/deck" : show?.href ?? "/radio/archive";
  return (
    <section className={styles.feature} data-mode={live ? "live" : "archive"} aria-labelledby="radio-feature-title">
      <div className={styles.topline}>
        <span className={styles.status}><span aria-hidden="true" />{live ? "On air now · BARCODE Radio" : "BARCODE Radio · After the show"}</span>
        <span className={styles.edition}>{live ? "Follow the night as it happens" : "The music. The artists. The night."}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.intro}>
          <p className={styles.kicker}>{live ? "Your seat at the show" : "Missed a track? Find it here."}</p>
          <h2 id="radio-feature-title">{title}</h2>
          <p className={styles.description}>{live
            ? "Follow Now Playing, see who’s next, and catch every turn of the Wheel. Keep the Deck open alongside TikTok Live."
            : "Find the songs you heard, discover the artists behind them, and follow the night’s Wheel moments. Every show leaves a story."}</p>
          <div className={styles.actions}>
            <Link href={href} className={styles.primary}>{live ? "Enter the live Deck" : show ? "Explore the latest show" : "Explore the Archive"}<span aria-hidden="true">↗</span></Link>
            {live
              ? <a href={externalLinks.tiktokLive} target="_blank" rel="noopener noreferrer" className={styles.secondary}>Watch on TikTok ↗</a>
              : <Link href="/radio/archive?view=artists" className={styles.secondary}>Discover the artists →</Link>}
          </div>
          <p className={styles.footnote}>{live ? "A live companion to the broadcast. Submit your music through the queue." : "Show histories, artist credits & available music links."}</p>
        </div>
        <div className={styles.show}>
          <div className={styles.signal} aria-hidden="true">{[18, 38, 24, 55, 70, 42, 84, 58, 94, 66, 44, 79, 52, 34, 64, 28, 48, 20].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
          <p className={styles.showLabel}>{live ? "Tonight’s transmission" : "Latest transmission"}</p>
          {show ? <>
            <p className={styles.date}>{radioShowDate(show.showDate)}</p>
            <h3>{show.title}</h3>
            <p className={styles.recordLabel}>{live ? "The show is in motion" : "The show is over. Keep discovering."}</p>
          </> : <>
            <p className={styles.date}>Keep the frequency.</p>
            <p className={styles.recordLabel}>{unavailable ? "Latest show details are temporarily unavailable. The Archive is still open." : feature ? "Explore the Archive as new broadcasts are added." : "Loading the latest show…"}</p>
          </>}
          <Link href={live ? "/radio/archive" : "/radio/archive?view=shows"} className={styles.allShows}>Browse all past shows <span aria-hidden="true">→</span></Link>
        </div>
      </div>
      {show && <>
        <dl className={styles.stats} aria-label={live ? "Current show statistics" : "Latest show statistics"}>
          {[["Show tracks", show.tracksInShow], ["Artist credits", show.artistCredits], ["Wheel spins", show.wheelSpins], [live ? "On air so far" : "Show duration", radioShowDuration(show.durationSeconds)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {show.hostFinishedExternalTracks > 0 && <p className={styles.countNote}>Includes {show.hostFinishedExternalTracks} external {show.hostFinishedExternalTracks === 1 ? "track" : "tracks"} marked finished by the host. Full-length playback is not confirmed for every track.</p>}
        {show.artists.length > 0 && <div className={styles.artists}><span>{live ? "In tonight’s show" : "From the show"}</span>{show.artists.map((artist) => <Link key={artist.href} href={artist.href}>{artist.name}<span aria-hidden="true"> ↗</span></Link>)}</div>}
      </>}
      {feature?.submissionsOpen && feature.queueHref && <div className={styles.intake}><span>Submissions are open. Bring your next track.</span><Link href={feature.queueHref}>Enter the queue →</Link></div>}
    </section>
  );
}
