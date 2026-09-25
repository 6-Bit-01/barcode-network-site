import type { PublicBallad } from "@/lib/bnl-ballads";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
import { balladGenres } from "@/lib/ballad-catalog";
import { balladDownloadHref } from "@/lib/ballad-download";
import { decodePlaylist, PLAYLIST_LIMIT, playlistReference } from "@/lib/site-audio-playlist";

export type SiteAudioTrack = {
  key: string; src: string; title: string; artist: string;
  artworkUrl: string; showHref: string; duration: number | null;
  showTitle?: string; showDate?: string; about?: string; genres?: string[]; credits?: string; downloadHref?: string;
  showId?: string; audioId?: string; availability?: "unchecked" | "available" | "unavailable";
};
export type SiteAudioSnapshot = {
  track: SiteAudioTrack | null;
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  currentTime: number; duration: number; canSeek: boolean;
  volume: number; muted: boolean; error: string | null;
  playlist: SiteAudioTrack[]; visible: boolean; playlistNotice: string | null;
};
export const EMPTY_AUDIO: SiteAudioSnapshot = {
  track: null, status: "idle", currentTime: 0, duration: 0, canSeek: false,
  volume: 1, muted: false, error: null,
  playlist: [], visible: false, playlistNotice: null,
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
    showId: ballad.show.sessionId, audioId: ballad.audioId, availability: "available",
    src: `/api/ballads/media?showId=${encodeURIComponent(ballad.show.sessionId)}&audioId=${encodeURIComponent(ballad.audioId)}&public=1`,
    title: ballad.version.title, artist: "BNL-01", artworkUrl: ballad.presentation.artworkUrl,
    showHref: `${broadcastArchiveShowHref(ballad.show.sessionId)}#broadcast-ballad`, duration: ballad.duration,
    showTitle: ballad.show.title, showDate: ballad.show.showDate,
    about: ballad.linerNotes?.about?.slice(0, 320), genres: balladGenres(ballad), credits: ballad.presentation.credits,
    downloadHref: balladDownloadHref(ballad.show.sessionId, ballad.audioId),
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
  private advanceOnEnd = false;
  private catalogRequest = 0;
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
      ended: () => {
        if (!audio.ended || !this.snapshot.track) return;
        const advance = this.advanceOnEnd && this.enabled;
        this.advanceOnEnd = false;
        this.update({ status: "ended", currentTime: audio.currentTime });
        const index = this.snapshot.playlist.findIndex(item => item.key === this.snapshot.track?.key);
        if (advance && index >= 0 && index + 1 < this.snapshot.playlist.length) this.play(this.snapshot.playlist[index + 1]);
      },
      timeupdate: () => this.update({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 }),
      durationchange: duration, loadedmetadata: duration,
      volumechange: () => this.update({ volume: audio.volume, muted: audio.muted }),
      error: () => { if (this.snapshot.track && audio.error) { this.pause(); this.update({ status: "error", error: "This recording could not be loaded. Try Play again or return to the show." }); } },
    };
    Object.entries(handlers).forEach(([event, handler]) => audio.addEventListener(event, handler));
    this.detachEvents = () => Object.entries(handlers).forEach(([event, handler]) => audio.removeEventListener(event, handler));
  };
  setEnabled = (enabled: boolean) => { this.enabled = enabled; if (!enabled) this.pause(); };
  restorePlaylist = (raw: string | null) => {
    const playlist = decodePlaylist(raw);
    this.update({ playlist, visible: playlist.length > 0 });
  };
  refreshPlaylist = (tracks: SiteAudioTrack[], keys = new Set(this.snapshot.playlist.map(track => track.key))) => {
    const publicTracks = new Map(tracks.map(track => [track.key, track]));
    const playlist = this.snapshot.playlist.map(track => !keys.has(track.key) ? track : publicTracks.get(track.key) ?? { ...track, availability: "unavailable" as const });
    this.update({ playlist, track: playlist.find(track => track.key === this.snapshot.track?.key) ?? this.snapshot.track, playlistNotice: null });
  };
  refreshCatalog = async () => {
    const request = ++this.catalogRequest;
    const keys = new Set(this.snapshot.playlist.map(track => track.key));
    this.setPlaylistNotice("Refreshing song availability…");
    try {
      const response = await fetch("/api/ballads/catalog", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Catalog unavailable");
      const value = await response.json();
      if (!Array.isArray(value.ballads)) throw new Error("Invalid catalog");
      const tracks: SiteAudioTrack[] = value.ballads.map(balladAudioTrack);
      if (request !== this.catalogRequest) return;
      this.refreshPlaylist(tracks, keys);
    } catch {
      if (request === this.catalogRequest) this.setPlaylistNotice("Song availability could not be refreshed. Try Refresh availability again.");
    }
  };
  setPlaylistNotice = (playlistNotice: string | null) => this.update({ playlistNotice });
  add = (track: SiteAudioTrack) => {
    if (!playlistReference(track)) return;
    if (this.snapshot.playlist.some(item => item.key === track.key)) { this.update({ visible: true }); return; }
    if (this.snapshot.playlist.length >= PLAYLIST_LIMIT) { this.update({ visible: true, playlistNotice: `Your playlist holds up to ${PLAYLIST_LIMIT} songs. Remove one to add another.` }); return; }
    this.update({ playlist: [...this.snapshot.playlist, track], visible: true, playlistNotice: null });
  };
  remove = (key: string) => {
    const playlist = this.snapshot.playlist.filter(track => track.key !== key);
    if (this.snapshot.track?.key === key) this.close();
    this.update({ playlist, visible: !!this.snapshot.track || playlist.length > 0, playlistNotice: null });
  };
  move = (key: string, direction: -1 | 1) => {
    const playlist = [...this.snapshot.playlist];
    const from = playlist.findIndex(track => track.key === key), to = from + direction;
    if (from < 0 || to < 0 || to >= playlist.length) return;
    [playlist[from], playlist[to]] = [playlist[to], playlist[from]];
    this.update({ playlist });
  };
  clearPlaylist = () => { this.close(); this.update({ playlist: [], playlistNotice: null }); };
  next = () => {
    const index = this.snapshot.playlist.findIndex(track => track.key === this.snapshot.track?.key);
    const track = this.snapshot.playlist[index + 1];
    if (track) this.play(track);
  };
  previous = () => {
    const index = this.snapshot.playlist.findIndex(track => track.key === this.snapshot.track?.key);
    if (index > 0) this.play(this.snapshot.playlist[index - 1]);
  };
  play = (track = this.snapshot.track ?? this.snapshot.playlist[0]) => {
    const audio = this.audio;
    if (!audio || !track || !this.enabled) return;
    if (track.availability === "unavailable") {
      this.pause();
      this.update({ track, visible: true, status: "error", currentTime: 0, canSeek: false, duration: track.duration ?? 0, error: "This recording is no longer in the public catalog. Refresh the playlist or choose another song." });
      audio.removeAttribute("src"); audio.load();
      return;
    }
    const changing = track.key !== this.snapshot.track?.key || !audio.getAttribute("src");
    if (changing) {
      this.pause();
      this.update({ track, visible: true, status: "loading", currentTime: 0, duration: track.duration ?? 0, canSeek: false, error: null });
      audio.src = track.src;
      audio.load();
    } else {
      if (audio.error) audio.load();
      if (audio.ended || this.snapshot.status === "ended") audio.currentTime = 0;
      this.update({ status: "loading", error: null });
    }
    const request = ++this.request;
    this.advanceOnEnd = true;
    // Invoke synchronously within the user's gesture (including mobile browsers).
    try {
      void audio.play().catch(() => {
        if (request === this.request) { this.advanceOnEnd = false; this.update({ status: "error", error: "Playback could not start. Press Play to try again." }); }
      });
    } catch {
      if (request === this.request) { this.advanceOnEnd = false; this.update({ status: "error", error: "Playback could not start. Press Play to try again." }); }
    }
  };
  pause = () => {
    this.advanceOnEnd = false;
    this.request += 1;
    this.audio?.pause();
    if (this.snapshot.track && ["playing", "loading"].includes(this.snapshot.status)) this.update({ status: "paused" });
  };
  close = () => {
    this.pause();
    this.audio?.removeAttribute("src");
    this.audio?.load();
    this.update({ ...EMPTY_AUDIO, playlist: this.snapshot.playlist, volume: this.snapshot.volume, muted: this.snapshot.muted });
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
