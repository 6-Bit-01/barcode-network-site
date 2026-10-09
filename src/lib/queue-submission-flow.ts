import type { QueuePublicSnapshot, QueuePublicTrack, QueueSessionSummary } from "./queue-types";

export type QueueSubmissionReceipt = {
  artist: string;
  title: string;
  sessionTitle: string;
  sessionDate: string;
  trackCode: string;
  trackId: string;
  sessionId: string;
  remaining: number | null;
  limit: number | null;
  deckHref: string | null;
  checkoutPending: boolean;
};

export function publicQueueDeckHref(session: Pick<QueueSessionSummary, "sessionId" | "purpose"> | null | undefined, trackId?: string): string | null {
  if (session?.purpose !== "live_broadcast" || !session.sessionId) return null;
  const params = new URLSearchParams({ sessionId: session.sessionId });
  if (trackId) params.set("submitted", trackId);
  return `/radio/deck?${params}`;
}

type SavedCredits = Pick<QueuePublicTrack, "id" | "submittedArtistName" | "submittedSongTitle" | "collaboratorNames">;

function savedTrackCredits(snapshot: QueuePublicSnapshot, trackId: string): SavedCredits | null {
  const owned = snapshot.ownedTracks?.find((track) => track.id === trackId);
  if (owned) return { id: owned.id, submittedArtistName: owned.artist, submittedSongTitle: owned.title, collaboratorNames: owned.collaboratorNames };
  return [snapshot.nowPlaying, snapshot.upNext, ...snapshot.queue, ...snapshot.completed, ...(snapshot.submitterStatus?.submitted ?? [])].find((track) => track?.id === trackId) ?? null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function artistCredit(track: SavedCredits): string {
  const artist = track.submittedArtistName.trim();
  const collaborators = track.collaboratorNames?.trim();
  if (!collaborators || collaborators.toLocaleLowerCase() === artist.toLocaleLowerCase()) return artist;
  return `${artist} feat. ${collaborators}`;
}

export async function confirmQueueSubmission({ trackId, sessionId, checkoutPending, readSnapshot, wait }: {
  trackId: string;
  sessionId: string;
  checkoutPending: boolean;
  readSnapshot: () => Promise<QueuePublicSnapshot | null>;
  wait: (milliseconds: number) => Promise<unknown>;
}): Promise<{ snapshot: QueuePublicSnapshot; receipt: QueueSubmissionReceipt } | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await readSnapshot();
    const track = snapshot?.session?.sessionId === sessionId ? savedTrackCredits(snapshot, trackId) : null;
    if (snapshot?.session && track) {
      return { snapshot, receipt: {
        artist: artistCredit(track),
        title: track.submittedSongTitle,
        sessionTitle: snapshot.session.title,
        sessionDate: snapshot.session.showDate,
        trackCode: track.id.slice(0, 8).toUpperCase(),
        trackId: track.id,
        sessionId: snapshot.session.sessionId,
        remaining: finiteNumber(snapshot.submitterStatus?.remaining),
        limit: finiteNumber(snapshot.submitterStatus?.limit),
        deckHref: checkoutPending ? null : publicQueueDeckHref(snapshot.session, track.id),
        checkoutPending,
      } };
    }
    if (attempt < 4) await wait(500);
  }
  return null;
}

export type QueueIntakePhase = "artwork" | "metadata" | "routing" | "confirmed";

export async function completeFreeQueueSubmission(receipt: QueueSubmissionReceipt, { reducedMotion, wait, onPhase, onComplete, navigate, isActive = () => true }: {
  reducedMotion: boolean;
  wait: (milliseconds: number) => Promise<unknown>;
  onPhase?: (phase: QueueIntakePhase) => void;
  onComplete: () => void;
  navigate: (href: string) => void;
  isActive?: () => boolean;
}): Promise<boolean> {
  if (!isActive()) return false;
  if (reducedMotion) {
    onPhase?.("confirmed");
  } else {
    const phases: Array<[QueueIntakePhase, number]> = [["artwork", 1200], ["metadata", 1400], ["routing", 1500], ["confirmed", 900]];
    for (const [phase, milliseconds] of phases) {
      if (!isActive()) return false;
      onPhase?.(phase);
      await wait(milliseconds);
    }
  }
  if (!isActive()) return false;
  onComplete();
  if (!receipt.checkoutPending && receipt.remaining !== null && receipt.remaining <= 0 && receipt.deckHref) navigate(receipt.deckHref);
  return true;
}
