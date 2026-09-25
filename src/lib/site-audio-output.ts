import type { SiteAudioTrack } from "./site-audio-player";

export type AudioOutputState = {
  connected: boolean; contentId: string | null;
  status: "loading" | "playing" | "paused" | "ended" | "error";
  currentTime: number; duration: number; canSeek: boolean;
  volume: number; muted: boolean;
};
export interface SiteAudioOutput {
  label: string;
  subscribe(listener: () => void): () => void;
  getState(): AudioOutputState;
  load(track: SiteAudioTrack, position: number): Promise<void>;
  play(): void; pause(): void; seek(position: number): void;
  setVolume(volume: number): void; setMuted(muted: boolean): void;
  disconnect(): void;
}

// The receiving device gets only the existing anonymous public-media URL.
// Never forward a cookie, admin preview URL, Blob URL or arbitrary stored URL.
export function castMediaUrl(track: SiteAudioTrack, origin: string): string {
  if (!track.showId || !track.audioId || track.availability === "unavailable") throw new Error("Public recording unavailable");
  const url = new URL("/api/ballads/media", origin);
  url.searchParams.set("showId", track.showId);
  url.searchParams.set("audioId", track.audioId);
  url.searchParams.set("public", "1");
  return url.href;
}
