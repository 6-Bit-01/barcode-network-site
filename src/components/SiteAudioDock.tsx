"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { audioTime } from "@/lib/site-audio-player";
import { useSiteAudio } from "@/components/SiteAudioProvider";
import styles from "./SiteAudioDock.module.css";

export function SiteAudioDock() {
  const audio = useSiteAudio();
  const { track, controller, status } = audio;
  const [expanded, setExpanded] = useState(false);
  const dock = useRef<HTMLElement>(null);
  const active = status === "playing" || status === "loading";

  useEffect(() => {
    if (!track || !dock.current) return;
    const root = document.documentElement;
    const oldPadding = root.style.scrollPaddingBottom;
    const measure = () => {
      const height = Math.ceil(dock.current?.getBoundingClientRect().height ?? 0);
      root.style.setProperty("--barcode-player-space", `${height + 16}px`);
      root.style.scrollPaddingBottom = `${height + 16}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(dock.current);
    return () => { observer.disconnect(); root.style.removeProperty("--barcode-player-space"); root.style.scrollPaddingBottom = oldPadding; };
  }, [track]);

  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    if (typeof MediaMetadata !== "undefined") navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: track.artist, album: "Broadcast Ballads",
      artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
    });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => controller.play(), pause: controller.pause, stop: controller.close,
      seekto: details => { if (details.seekTime !== undefined) controller.seek(details.seekTime); },
      seekbackward: details => controller.seek(controller.getSnapshot().currentTime - (details.seekOffset ?? 10)),
      seekforward: details => controller.seek(controller.getSnapshot().currentTime + (details.seekOffset ?? 10)),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler); } catch { /* Browser-specific media controls. */ }
    }
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      for (const action of Object.keys(handlers)) {
        try { navigator.mediaSession.setActionHandler(action as MediaSessionAction, null); } catch { /* Unsupported action. */ }
      }
    };
  }, [track, controller]);

  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : "paused";
    if (audio.canSeek && audio.duration > 0) {
      try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 }); } catch { /* Optional browser support. */ }
    }
  }, [track, status, audio.canSeek, audio.currentTime, audio.duration]);

  if (!track) return null;
  return <>
    <div aria-hidden="true" className={styles.spacer} />
    <section ref={dock} className={styles.dock} data-expanded={expanded} aria-label="BARCODE music player">
      <div className={styles.progress} aria-hidden="true"><span style={{ width: `${audio.duration > 0 ? Math.min(100, audio.currentTime / audio.duration * 100) : 0}%` }} /></div>
      <div className={styles.inner}>
        <div className={styles.identity}>
          {track.artworkUrl ? <img src={track.artworkUrl} alt="" className={styles.artwork} /> : <span className={styles.cover} aria-hidden="true"><span /></span>}
          <div className={styles.description}>
            <span className={styles.brand}>BARCODE <span>/ PLAYER</span></span>
            <Link href={track.showHref} className={styles.title} title={`${track.title} — return to show`}>{track.title}</Link>
            <span className={styles.artist}>{track.artist}{status === "loading" ? " · Loading…" : status === "paused" ? " · Paused" : status === "ended" ? " · Finished" : ""}</span>
          </div>
          <div className={styles.meter} data-playing={status === "playing"} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * -0.17}s` }} />)}</div>
        </div>
        <button type="button" className={styles.play} aria-label={active ? "Pause music" : "Play music"} onClick={() => active ? controller.pause() : controller.play()}><span aria-hidden="true">{active ? "Ⅱ" : "▶"}</span></button>
        <div id="barcode-player-controls" className={styles.tools} data-expanded={expanded}>
          <div className={styles.seek}>
            <label className={styles.srOnly} htmlFor="barcode-player-seek">Song position</label>
            <input id="barcode-player-seek" type="range" min="0" max={audio.duration || 1} step="0.1" value={Math.min(audio.currentTime, audio.duration || 0)} disabled={!audio.canSeek} aria-valuetext={`${audioTime(audio.currentTime)} of ${audioTime(audio.duration)}`} onChange={e => controller.seek(Number(e.target.value))} />
            <div className={styles.times}><span>{audioTime(audio.currentTime)}</span><span>{audioTime(audio.duration)}</span></div>
          </div>
          <div className={styles.volume}>
            <button type="button" className={styles.smallButton} aria-label={audio.muted || audio.volume === 0 ? "Unmute music" : "Mute music"} onClick={controller.toggleMute}>{audio.muted || audio.volume === 0 ? "Muted" : "Vol"}</button>
            <label className={styles.srOnly} htmlFor="barcode-player-volume">Music volume</label>
            <input id="barcode-player-volume" type="range" min="0" max="1" step="0.05" value={audio.muted ? 0 : audio.volume} aria-valuetext={`${Math.round((audio.muted ? 0 : audio.volume) * 100)} percent`} onChange={e => controller.setVolume(Number(e.target.value))} />
          </div>
        </div>
        <button type="button" className={`${styles.smallButton} ${styles.expand}`} aria-label={expanded ? "Collapse player controls" : "Expand player controls"} aria-expanded={expanded} aria-controls="barcode-player-controls" onClick={() => setExpanded(value => !value)}><span aria-hidden="true">{expanded ? "⌄" : "⌃"}</span></button>
        <button type="button" className={styles.smallButton} aria-label="Close player and stop music" onClick={controller.close}><span aria-hidden="true">×</span></button>
      </div>
      <p className={audio.error ? styles.error : styles.srOnly} role={audio.error ? "alert" : "status"}>{audio.error ?? (status === "loading" ? "Loading recording…" : status === "playing" ? `Playing ${track.title}` : status === "ended" ? "Song finished" : "Music paused")}</p>
    </section>
  </>;
}
