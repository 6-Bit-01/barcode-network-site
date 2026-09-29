// Public data only. Credentials and upstream requests belong in hellcat-ladder.server.ts.
export const HELLCAT_LADDER_REFRESH_MS = 3 * 60 * 1000;
export const HELLCAT_LADDER_MAX_AGE_MS = 10 * 60 * 1000;

export type HellcatTrack = {
  rank: number;
  title: string | null;
  artist: string | null;
  score: number | null;
};

export type HellcatLadderSnapshot = { tracks: HellcatTrack[]; fetchedAt: string };
export type HellcatLadderResult =
  | { status: "ready" | "stale"; snapshot: HellcatLadderSnapshot; ageMs: number }
  | { status: "unavailable"; snapshot: null };

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const label = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && value.length <= 1000);

// Reject the whole response rather than silently dropping or renumbering songs.
// The supplied order is authoritative; scores are not a sorting instruction.
export function parseHellcatTracks(value: unknown): HellcatTrack[] | null {
  if (!record(value) || "error" in value || !Array.isArray(value.tracks) || value.tracks.length > 1000) return null;
  const tracks: HellcatTrack[] = [];
  let previousRank = 0;
  for (const entry of value.tracks) {
    if (!record(entry)) return null;
    const { rank, title, artist, score } = entry;
    if (typeof rank !== "number" || !Number.isSafeInteger(rank) || rank <= previousRank
      || (previousRank === 0 && rank !== 1) || !label(title) || !label(artist)
      || !(score === null || (typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100))) return null;
    tracks.push({ rank, title, artist, score });
    previousRank = rank;
  }
  return tracks;
}

export function hellcatLadderResult(snapshot: HellcatLadderSnapshot | null, now = Date.now()): HellcatLadderResult {
  const age = snapshot ? now - Date.parse(snapshot.fetchedAt) : NaN;
  if (!snapshot || !Number.isFinite(age) || age < 0 || age >= HELLCAT_LADDER_MAX_AGE_MS) {
    return { status: "unavailable", snapshot: null };
  }
  return { status: age >= HELLCAT_LADDER_REFRESH_MS ? "stale" : "ready", snapshot, ageMs: age };
}
