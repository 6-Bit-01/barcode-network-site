import { hashRadioVisualToken } from "./radio-visuals-events";

export const RADIO_VISUAL_MUSIC_FAMILY_COUNT = 10;

type PlaybackOccurrenceEvent = {
  sequence?: number;
  trackId?: string;
  eventType?: string;
  observedAt?: string;
};

type TrackOccurrenceEntry = {
  id?: string | null;
  playedAt?: string | null;
};

type TrackOccurrenceState = {
  nowPlaying?: TrackOccurrenceEntry | null;
  loadedTrack?: TrackOccurrenceEntry | null;
  history?: TrackOccurrenceEntry[] | null;
  playbackDiagnostics?: { events?: PlaybackOccurrenceEvent[] | null } | null;
  session?: { completedCount?: number | null } | null;
};

interface RadioVisualLoadedOccurrence {
  trackId: string;
  occurredAt: string | null;
}

export interface RadioVisualTrackOccurrence extends RadioVisualLoadedOccurrence {
  ordinal: number;
}

function validTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventOrder(left: PlaybackOccurrenceEvent, right: PlaybackOccurrenceEvent): number {
  const leftSequence = typeof left.sequence === "number" && Number.isFinite(left.sequence) ? left.sequence : null;
  const rightSequence = typeof right.sequence === "number" && Number.isFinite(right.sequence) ? right.sequence : null;
  if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence;
  return (validTime(left.observedAt) ?? 0) - (validTime(right.observedAt) ?? 0);
}

function loadedEventsForState(state: TrackOccurrenceState): PlaybackOccurrenceEvent[] {
  return [...(state.playbackDiagnostics?.events ?? [])]
    .filter((event) => event.eventType === "loaded" && typeof event.trackId === "string" && validTime(event.observedAt) !== null)
    .sort(eventOrder);
}

function completedCountForState(state: TrackOccurrenceState): number {
  return typeof state.session?.completedCount === "number" && Number.isFinite(state.session.completedCount)
    ? Math.max(0, Math.floor(state.session.completedCount))
    : 0;
}

/**
 * Locate the active load occurrence without depending on which queue response
 * arrived first. The persisted completed count keeps the deck position stable
 * if old playback diagnostics have already fallen out of their bounded window;
 * retained load events additionally distinguish undo/remove/reload occurrences.
 */
export function radioVisualTrackOccurrence(state: TrackOccurrenceState): RadioVisualTrackOccurrence | null {
  const trackId = state.nowPlaying?.id ?? state.loadedTrack?.id ?? null;
  if (!trackId) return null;
  const activeEntry = state.nowPlaying?.id === trackId ? state.nowPlaying : state.loadedTrack;
  const loadedEvents = loadedEventsForState(state);
  let matchingIndex = -1;
  for (let index = loadedEvents.length - 1; index >= 0; index -= 1) {
    if (loadedEvents[index]?.trackId === trackId) {
      matchingIndex = index;
      break;
    }
  }
  const completedCount = completedCountForState(state);
  const matching = matchingIndex >= 0 ? loadedEvents[matchingIndex] : null;
  return {
    trackId,
    occurredAt: matching?.observedAt ?? (validTime(activeEntry?.playedAt) !== null ? activeEntry?.playedAt ?? null : null),
    ordinal: Math.max(completedCount, matchingIndex),
  };
}

function shuffledFamilyDeck(sessionToken: string, deckIndex: number, previousLast: number | null): number[] {
  const deck = Array.from({ length: RADIO_VISUAL_MUSIC_FAMILY_COUNT }, (_, index) => index);
  let state = hashRadioVisualToken(`music-family-deck:${sessionToken}:${deckIndex}`);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  if (previousLast !== null && deck[0] === previousLast) {
    const swapIndex = 1 + hashRadioVisualToken(`music-family-boundary:${sessionToken}:${deckIndex}`) % (deck.length - 1);
    [deck[0], deck[swapIndex]] = [deck[swapIndex], deck[0]];
  }
  return deck;
}

/** One deterministic permutation per ten occurrences, without a deck-boundary repeat. */
export function radioVisualMusicFamilyIndexForOccurrence(sessionToken: string, occurrenceOrdinal: number): number {
  const safeSessionToken = sessionToken || "radio-session";
  const safeOrdinal = Math.max(0, Math.min(100_000, Math.floor(Number.isFinite(occurrenceOrdinal) ? occurrenceOrdinal : 0)));
  const targetDeckIndex = Math.floor(safeOrdinal / RADIO_VISUAL_MUSIC_FAMILY_COUNT);
  let previousLast: number | null = null;
  let deck: number[] = [];
  for (let deckIndex = 0; deckIndex <= targetDeckIndex; deckIndex += 1) {
    deck = shuffledFamilyDeck(safeSessionToken, deckIndex, previousLast);
    previousLast = deck[deck.length - 1] ?? null;
  }
  return deck[safeOrdinal % RADIO_VISUAL_MUSIC_FAMILY_COUNT] ?? 0;
}

/** Mirrors the engine's public seed-to-family selector without importing its renderer module. */
export function radioVisualMusicFamilyIndexForSeed(seed: number): number {
  const safeSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return hashRadioVisualToken(`music-scene:${safeSeed}`) % RADIO_VISUAL_MUSIC_FAMILY_COUNT;
}

/**
 * Preserve a unique track/occurrence layout seed while constraining only its
 * family bucket to the current shuffled-deck position.
 */
export function radioVisualSeedForMusicFamily(trackOccurrenceToken: string, familyIndex: number): number {
  const targetFamily = Math.max(0, Math.min(
    RADIO_VISUAL_MUSIC_FAMILY_COUNT - 1,
    Math.floor(Number.isFinite(familyIndex) ? familyIndex : 0),
  ));
  const baseSeed = hashRadioVisualToken(trackOccurrenceToken);
  if (radioVisualMusicFamilyIndexForSeed(baseSeed) === targetFamily) return baseSeed;
  for (let nonce = 1; nonce <= 4_096; nonce += 1) {
    const candidate = hashRadioVisualToken(`${trackOccurrenceToken}:family:${targetFamily}:${nonce}`);
    if (radioVisualMusicFamilyIndexForSeed(candidate) === targetFamily) return candidate;
  }
  // Ten evenly distributed buckets make this unreachable in practice, while
  // retaining a deterministic non-throwing fallback for a live receiver.
  return baseSeed;
}
