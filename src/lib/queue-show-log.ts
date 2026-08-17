import type {
  QueueShowLogEvent,
  QueueShowLogEventType,
  QueueShowLogTrack,
  QueueSourceType,
} from "./queue-types";

export const QUEUE_SHOW_LOG_SCHEMA_VERSION = "barcode_queue_show_log_v1" as const;
export const MAX_QUEUE_SHOW_LOG_EVENTS = 2_048;

const EVENT_TYPES = new Set<QueueShowLogEventType>([
  "session_created",
  "submissions_opened",
  "submissions_closed",
  "broadcast_started",
  "track_submitted",
  "track_loaded",
  "track_play_started",
  "track_finished",
  "track_skipped",
  "track_removed",
  "track_returned",
  "track_restored",
  "session_archived",
]);

const SOURCE_TYPES = new Set<QueueSourceType>([
  "upload",
  "link",
  "youtube",
  "soundcloud",
  "spotify",
  "tiktok",
  "other",
]);

export type QueueShowLogEventInput = Omit<QueueShowLogEvent, "sequence">;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? Array.from(cleaned).slice(0, maxLength).join("") : null;
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function positiveInteger(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  return Math.floor(numeric);
}

function optionalOrder(value: unknown): number | null {
  return value === null || value === undefined ? null : positiveInteger(value);
}

function normalizedTikTokHandle(value: unknown): string {
  const cleaned = cleanText(value, 64)?.toLowerCase().replace(/^@+/, "") ?? "";
  const handle = cleaned.replace(/[^a-z0-9._-]/g, "");
  return handle ? `@${handle}` : "";
}

function publicSourceUrl(value: unknown, sourceType: QueueSourceType): string | null {
  if (sourceType === "upload" || typeof value !== "string") return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function normalizeTrack(value: unknown): QueueShowLogTrack | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<QueueShowLogTrack>;
  const trackId = cleanText(raw.trackId, 160);
  const artist = cleanText(raw.artist, 240);
  const title = cleanText(raw.title, 240);
  const tiktokHandle = normalizedTikTokHandle(raw.tiktokHandle);
  const sourceType = SOURCE_TYPES.has(raw.sourceType as QueueSourceType)
    ? raw.sourceType as QueueSourceType
    : "other";
  if (!trackId || !artist || !title) return null;
  return {
    trackId,
    artist,
    title,
    tiktokHandle,
    sourceType,
    publicSourceUrl: publicSourceUrl(raw.publicSourceUrl, sourceType),
    submissionOrder: optionalOrder(raw.submissionOrder),
    playedOrder: optionalOrder(raw.playedOrder),
  };
}

function normalizeEvent(value: unknown): QueueShowLogEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<QueueShowLogEvent>;
  const sequence = positiveInteger(raw.sequence);
  const occurredAt = isoTimestamp(raw.occurredAt);
  const eventType = EVENT_TYPES.has(raw.eventType as QueueShowLogEventType)
    ? raw.eventType as QueueShowLogEventType
    : null;
  if (!sequence || !occurredAt || !eventType) return null;
  const track = raw.track === null || raw.track === undefined ? null : normalizeTrack(raw.track);
  if (raw.track && !track) return null;
  if (eventType.startsWith("track_") && !track) return null;
  if (!eventType.startsWith("track_") && track) return null;
  return { sequence, eventType, occurredAt, track };
}

export function normalizeQueueShowLog(value: unknown): QueueShowLogEvent[] {
  if (!Array.isArray(value)) return [];
  const events = value
    .map(normalizeEvent)
    .filter((event): event is QueueShowLogEvent => Boolean(event))
    .sort((left, right) => left.sequence - right.sequence);
  const unique: QueueShowLogEvent[] = [];
  for (const event of events) {
    if (unique.at(-1)?.sequence === event.sequence) continue;
    unique.push(event);
  }
  return unique.slice(-MAX_QUEUE_SHOW_LOG_EVENTS);
}

export function appendQueueShowLogEvents(
  existing: unknown,
  inputs: QueueShowLogEventInput[],
): QueueShowLogEvent[] {
  const events = normalizeQueueShowLog(existing);
  let nextSequence = (events.at(-1)?.sequence ?? 0) + 1;
  for (const input of inputs) {
    const event = normalizeEvent({ ...input, sequence: nextSequence });
    if (!event) continue;
    events.push(event);
    nextSequence += 1;
  }
  return events.slice(-MAX_QUEUE_SHOW_LOG_EVENTS);
}
