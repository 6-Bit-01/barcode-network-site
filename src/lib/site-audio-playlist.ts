import type { SiteAudioTrack } from "./site-audio-player";
import { broadcastArchiveShowHref } from "@/lib/broadcast-archive";
import { validId } from "@/lib/bnl-ballads";

export const PLAYLIST_STORAGE_KEY = "barcode:music-playlist:v1";
export const PLAYLIST_LIMIT = 100;
type Reference = { showId: string; audioId: string; title: string };

// Local storage is untrusted. Persist references, never media URLs or authority.
export function playlistReference(track: SiteAudioTrack): Reference | null {
  return validId(track.showId) && validId(track.audioId)
    ? { showId: track.showId, audioId: track.audioId, title: track.title.slice(0, 200) } : null;
}
export function encodePlaylist(tracks: SiteAudioTrack[]) {
  return JSON.stringify({ version: 1, tracks: tracks.map(playlistReference).filter(Boolean).slice(0, PLAYLIST_LIMIT) });
}
export function decodePlaylist(raw: string | null): SiteAudioTrack[] {
  if (!raw || raw.length > 100_000) return [];
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.tracks)) return [];
    const result: SiteAudioTrack[] = [];
    const keys = new Set<string>();
    for (const item of value.tracks.slice(0, PLAYLIST_LIMIT)) {
      if (!item || !validId(item.showId) || !validId(item.audioId)) continue;
      const key = `${item.showId}:${item.audioId}`;
      if (keys.has(key)) continue;
      keys.add(key);
      result.push({ key, showId: item.showId, audioId: item.audioId,
        src: `/api/ballads/media?showId=${encodeURIComponent(item.showId)}&audioId=${encodeURIComponent(item.audioId)}&public=1`,
        title: typeof item.title === "string" && item.title.trim() ? item.title.slice(0, 200) : "Saved song",
        artist: "BNL-01", artworkUrl: "", duration: null,
        showHref: `${broadcastArchiveShowHref(item.showId)}#broadcast-ballad`, availability: "unchecked",
      });
    }
    return result;
  } catch { return []; }
}
