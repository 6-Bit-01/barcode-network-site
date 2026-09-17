import type { PublicBallad } from "@/lib/bnl-ballads";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";

export type SiteAudioTrack = {
  key: string; src: string; title: string; artist: string;
  artworkUrl: string; showHref: string; duration: number | null;
};
export type SiteAudioSnapshot = {
  track: SiteAudioTrack | null;
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  currentTime: number; duration: number; canSeek: boolean;
  volume: number; muted: boolean; error: string | null;
};
export const EMPTY_AUDIO: SiteAudioSnapshot = {
  track: null, status: "idle", currentTime: 0, duration: 0, canSeek: false,
  volume: 1, muted: false, error: null,
};
export const audioTime = (seconds: number) => {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
export function publicAudioAllowed(pathname: string) {
  return !["/admin", "/overlay", "/obs", "/world/playtest"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}
export function balladAudioTrack(ballad: PublicBallad): SiteAudioTrack {
  return {
    key: `${ballad.show.sessionId}:${ballad.audioId}`,
    src: `/api/ballads/media?showId=${encodeURIComponent(ballad.show.sessionId)}&audioId=${encodeURIComponent(ballad.audioId)}`,
    title: ballad.version.title, artist: "BNL-01", artworkUrl: ballad.presentation.artworkUrl,
    showHref: `${broadcastArchiveShowHref(ballad.show.sessionId)}#broadcast-ballad`, duration: ballad.duration,
  };
}

// One controller and media element live in the root layout, independently of pages.
export class SiteAudioController {
  private audio: HTMLAudioElement | null = null;
  private snapshot: SiteAudioSnapshot = EMPTY_AUDIO;
  private listeners = new Set<() => void>();
  private detachEvents: (() => void) | null = null;
  private request = 0;
  private enabled = true;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => EMPTY_AUDIO;
  private update(patch: Partial<SiteAudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  attach = (audio: HTMLAudioElement | null) => {
    if (audio === this.audio) return;
    this.pause();
    this.detachEvents?.();
    this.detachEvents = null;
    this.audio = audio;
    if (!audio) return;
    const duration = () => this.update({
      duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (this.snapshot.track?.duration ?? 0),
      canSeek: Number.isFinite(audio.duration) && audio.duration > 0,
    });
    const handlers: Record<string, () => void> = {
      play: () => this.update({ status: "loading", error: null }),
      playing: () => this.update({ status: "playing", error: null }),
      waiting: () => { if (!audio.paused) this.update({ status: "loading" }); },
      pause: () => { if (this.snapshot.track && this.snapshot.status !== "error") this.update({ status: audio.ended ? "ended" : "paused" }); },
      ended: () => this.update({ status: "ended", currentTime: audio.currentTime }),
      timeupdate: () => this.update({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 }),
      durationchange: duration, loadedmetadata: duration,
      volumechange: () => this.update({ volume: audio.volume, muted: audio.muted }),
      error: () => { if (this.snapshot.track && audio.error) { this.pause(); this.update({ status: "error", error: "This recording could not be loaded. Try Play again or return to the show." }); } },
    };
    Object.entries(handlers).forEach(([event, handler]) => audio.addEventListener(event, handler));
    this.detachEvents = () => Object.entries(handlers).forEach(([event, handler]) => audio.removeEventListener(event, handler));
  };
  setEnabled = (enabled: boolean) => { this.enabled = enabled; if (!enabled) this.pause(); };
  play = (track = this.snapshot.track) => {
    const audio = this.audio;
    if (!audio || !track || !this.enabled) return;
    const changing = track.key !== this.snapshot.track?.key || !audio.getAttribute("src");
    if (changing) {
      this.pause();
      this.update({ track, status: "loading", currentTime: 0, duration: track.duration ?? 0, canSeek: false, error: null });
      audio.src = track.src;
      audio.load();
    } else {
      if (audio.error) audio.load();
      if (audio.ended || this.snapshot.status === "ended") audio.currentTime = 0;
      this.update({ status: "loading", error: null });
    }
    const request = ++this.request;
    // Invoke synchronously within the user's gesture (including mobile browsers).
    try {
      void audio.play().catch(() => {
        if (request === this.request) this.update({ status: "error", error: "Playback could not start. Press Play to try again." });
      });
    } catch {
      if (request === this.request) this.update({ status: "error", error: "Playback could not start. Press Play to try again." });
    }
  };
  pause = () => {
    this.request += 1;
    this.audio?.pause();
    if (this.snapshot.track && ["playing", "loading"].includes(this.snapshot.status)) this.update({ status: "paused" });
  };
  close = () => {
    this.pause();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    this.update({ ...EMPTY_AUDIO, volume: this.snapshot.volume, muted: this.snapshot.muted });
  };
  seek = (seconds: number) => {
    if (!this.audio || !this.snapshot.canSeek || !Number.isFinite(seconds)) return;
    const currentTime = Math.max(0, Math.min(seconds, this.snapshot.duration));
    try { this.audio.currentTime = currentTime; this.update({ currentTime }); } catch { /* Wait for seekable metadata. */ }
  };
  setVolume = (volume: number) => {
    if (!this.audio || !Number.isFinite(volume)) return;
    this.audio.volume = Math.max(0, Math.min(volume, 1));
    if (volume > 0) this.audio.muted = false;
    this.update({ volume: this.audio.volume, muted: this.audio.muted });
  };
  toggleMute = () => {
    if (!this.audio) return;
    this.audio.muted = !this.audio.muted;
    if (!this.audio.muted && this.audio.volume === 0) this.audio.volume = 0.5;
    this.update({ volume: this.audio.volume, muted: this.audio.muted });
  };
}
