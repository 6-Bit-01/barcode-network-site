"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { audioTime } from "@/lib/site-audio-player";
import { useSiteAudio } from "@/components/SiteAudioProvider";
import styles from "./SiteAudioDock.module.css";
import { SiteAudioOutputControls } from "@/components/SiteAudioOutputControls";
import { balladDateLabel } from "@/lib/ballad-catalog";

export function SiteAudioDock() {
  const audio = useSiteAudio();
  const { controller, status } = audio;
  const track = audio.track ?? audio.playlist[0];
  const currentIndex = audio.playlist.findIndex(item => item.key === audio.track?.key);
  const nextTrack = audio.playlist[currentIndex + 1];
  const [expanded, setExpanded] = useState(false);
  const dock = useRef<HTMLElement>(null);
  const info = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const active = status === "playing" || status === "loading";
  useEffect(() => { info.current?.hidePopover?.(); }, [track?.key, pathname]);

  useEffect(() => {
    if (!audio.visible || !track || !dock.current) return;
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
  }, [track, audio.visible]);

  useEffect(() => {
    if (!audio.visible || !track || !("mediaSession" in navigator)) return;
    if (typeof MediaMetadata !== "undefined") navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: track.artist, album: "Broadcast Ballads",
      artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
    });
    const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
      play: () => controller.play(), pause: controller.pause, stop: controller.close,
      nexttrack: controller.next, previoustrack: controller.previous,
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
  }, [track, controller, audio.visible]);

  useEffect(() => {
    if (!audio.visible || !track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : "paused";
    if (audio.canSeek && audio.duration > 0) {
      try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 }); } catch { /* Optional browser support. */ }
    }
  }, [track, status, audio.canSeek, audio.currentTime, audio.duration, audio.visible]);

  if (!audio.visible || !track) return null;
  return <>
    <div aria-hidden="true" className={styles.spacer} />
    <section ref={dock} className={styles.dock} data-expanded={expanded} aria-label="BARCODE music player">
      <div className={styles.progress} aria-hidden="true"><span style={{ width: `${audio.duration > 0 ? Math.min(100, audio.currentTime / audio.duration * 100) : 0}%` }} /></div>
      <div className={styles.inner}>
        <div className={styles.identity}>
          {track.artworkUrl ? <img src={track.artworkUrl} alt="" className={styles.artwork} /> : <span className={styles.cover} aria-hidden="true"><span /></span>}
          <div className={styles.description}>
            <span className={styles.brand}>BARCODE <span>/ {audio.track ? "PLAYER" : "PLAYLIST"}</span></span>
            <Link href={track.showHref} className={styles.title} title={`${track.title} — return to show`}>{track.title}</Link>
            <span className={styles.artist}>{track.artist}{status === "loading" ? " · Loading…" : status === "paused" ? " · Paused" : status === "ended" ? " · Finished" : ""}</span>
          </div>
          <div className={styles.meter} data-playing={status === "playing"} aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <i key={i} style={{ animationDelay: `${i * -0.17}s` }} />)}</div>
        </div>
        <div className={styles.transport}>
          <button type="button" className={styles.smallButton} aria-label="Previous song" disabled={currentIndex <= 0} onClick={controller.previous}>|◀</button>
          <button type="button" className={styles.play} aria-label={active ? "Pause music" : "Play music"} onClick={() => active ? controller.pause() : controller.play()}><span aria-hidden="true">{active ? "Ⅱ" : "▶"}</span></button>
          <button type="button" className={styles.smallButton} aria-label="Next song" disabled={!nextTrack} onClick={controller.next}>▶|</button>
        </div>
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
        <div className={styles.links}>
          <Link href={track.showHref} className={styles.showLink}>Show · {track.showDate ? balladDateLabel(track.showDate) : "View broadcast"} ↗</Link>
          <button type="button" popoverTarget="barcode-playlist" className={styles.textButton}>Playlist ({audio.playlist.length})</button>
          <button type="button" popoverTarget="barcode-song-info" className={styles.textButton}>Song info</button>
          <SiteAudioOutputControls />
          {track.downloadHref && <a href={track.downloadHref} download className={styles.textButton} aria-label={`Download ${track.title} free`}>↓ Free download</a>}
        </div>
      </div>
      <div id="barcode-playlist" popover="auto" role="dialog" aria-label="Your playlist" className={`${styles.info} ${styles.playlist}`}>
        <div className={styles.infoHeading}><h2>Your playlist</h2><button type="button" popoverTarget="barcode-playlist" popoverTargetAction="hide" aria-label="Close playlist" className={styles.smallButton}>×</button></div>
        <p>Saved in this browser. Add published songs from <Link href="/bnl/music">BNL’s Discography</Link>.</p>
        {nextTrack && <p className={styles.upNext}>Up next: {nextTrack.title}</p>}
        {!audio.playlist.length ? <p>Your playlist is empty. Use + Playlist beside a song.</p> : <ol className={styles.playlistItems}>
          {audio.playlist.map((item, index) => <li key={item.key} data-current={item.key === audio.track?.key}>
            <button type="button" className={styles.playlistSong} aria-label={`Play ${item.title} from playlist`} aria-current={item.key === audio.track?.key ? "true" : undefined} onClick={() => controller.play(item)}>
              <span>{index + 1}. {item.title}</span>
              <small>{item.key === audio.track?.key ? `${status === "playing" ? "Playing" : status === "error" ? "Could not play" : "Selected"} · ` : ""}{item.availability === "unavailable" ? "Recording unavailable" : item.artist}</small>
            </button>
            <div className={styles.playlistActions}>
              <button type="button" className={styles.smallButton} disabled={index === 0} aria-label={`Move ${item.title} up`} onClick={() => controller.move(item.key, -1)}>↑</button>
              <button type="button" className={styles.smallButton} disabled={index === audio.playlist.length - 1} aria-label={`Move ${item.title} down`} onClick={() => controller.move(item.key, 1)}>↓</button>
              <button type="button" className={styles.smallButton} aria-label={`Remove ${item.title} from playlist`} onClick={() => controller.remove(item.key)}>×</button>
            </div>
          </li>)}
        </ol>}
        <div className={styles.playlistFooter}><button type="button" className={styles.textButton} onClick={() => void controller.refreshCatalog()}>Refresh availability</button><button type="button" disabled={!audio.playlist.length} className={styles.textButton} onClick={controller.clearPlaylist}>Clear playlist</button></div>
      </div>
      <div ref={info} id="barcode-song-info" popover="auto" role="dialog" aria-label="About this song" className={styles.info}>
        <div className={styles.infoHeading}><h2>{track.title}</h2><button type="button" popoverTarget="barcode-song-info" popoverTargetAction="hide" aria-label="Close song info" className={styles.smallButton}>×</button></div>
        {track.about && <p>{track.about}{track.about.length === 320 ? "…" : ""}</p>}
        {track.genres?.length ? <p className={styles.infoGenres}>{track.genres.join(" · ")}</p> : null}
        <Link href={track.showHref} onClick={() => info.current?.hidePopover?.()} className={styles.infoShow}>{track.showTitle || "View the broadcast"} →</Link>
        {track.credits && <p className={styles.infoCredits}>{track.credits}</p>}
        <p className={styles.infoCredits}>Free to download for listening. <Link href={track.showHref} onClick={() => info.current?.hidePopover?.()}>Full story & credits →</Link></p>
      </div>
      {audio.playlistNotice && <p className={styles.notice} role="status">{audio.playlistNotice}</p>}
      {audio.outputNotice && <p className={styles.notice} role="status">{audio.outputNotice}</p>}
      <p className={audio.error ? styles.error : styles.srOnly} role={audio.error ? "alert" : "status"}>{audio.error ?? (status === "loading" ? "Loading recording…" : status === "playing" ? `Playing ${track.title}` : status === "ended" ? "Song finished" : audio.track ? "Music paused" : "Playlist ready")}</p>
    </section>
  </>;
}
