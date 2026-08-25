import { broadcastArchiveArtistHref, normalizeBroadcastArchiveProjectKey } from "./broadcast-archive";
import type { QueuePublicTrack } from "./queue-types";

type DeckTrackLink = Pick<QueuePublicTrack, "sourceType" | "publicSourceUrl">;

export function deckExternalTrackHref(track: DeckTrackLink | null | undefined): string | null {
  if (!track || track.sourceType === "upload" || !track.publicSourceUrl) return null;
  try {
    const parsed = new URL(track.publicSourceUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function deckProjectHref(artistName: string, archiveHref: string): string {
  if (archiveHref === "/radio/archive") return broadcastArchiveArtistHref(artistName);
  const url = new URL(archiveHref, "https://barcode.test");
  url.searchParams.set("view", "artists");
  url.searchParams.set("artist", normalizeBroadcastArchiveProjectKey(artistName));
  return `${url.pathname}${url.search}`;
}
