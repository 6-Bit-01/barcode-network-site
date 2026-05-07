// ============================================================
// BARCODE RADIO QUEUE OPERATIONS — session-based Redis + memory
// ============================================================

import { Redis } from "@upstash/redis";
import {
  INTERNAL_BUFFER_DURATION_SECONDS,
  detectQueueSourceType,
  formatRuntime,
  generateQueueId,
  getTrackRuntimeSeconds,
  getTrackArtworkUrl,
  normalizeTier,
} from "./queue-types";
import type {
  QueueDurationSource,
  QueueEntry,
  QueueLane,
  QueueNonPriorityLane,
  QueuePublicSnapshot,
  QueuePublicStatus,
  QueuePublicTrack,
  QueueSession,
  QueueSessionStatus,
  QueueSessionSummary,
  QueueSourceType,
  QueueState,
  QueueTier,
} from "./queue-types";

const STATE_KEY = "radioQueue:v2:sessions";
const LEGACY_STATE_KEY = "radioQueue:v1:state";
const DEFAULT_QUEUE_CAPACITY = 50;
const SUBMISSION_COOLDOWN_SECONDS = 5 * 60;

type QueueAdminAction = "pullNext" | "load" | "finish" | "remove" | "priority" | "regular" | "wheel" | "moveBack" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority";

interface QueueStore {
  activeSessionId: string;
  sessions: QueueSession[];
}

interface ProviderMetadata {
  detectedArtistName: string | null;
  detectedSongTitle: string | null;
  providerTitle: string | null;
  detectedDurationSeconds: number | null;
  durationSource: QueueDurationSource;
  artworkUrl?: string | null;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const SESSION_DESCRIPTIONS = [
  "Three transmissions per artist. At 10k taps, the skip game opens a fracture in the line. Priority access remains reserved for urgent signals unwilling to wait.",
  "Limit three tracks per signal source. The 10k tap event may pull a winner through the queue. Standard transmissions continue in order unless priority access intervenes.",
  "Each artist may load three tracks into the system. At 10k taps, the wheel selects a breach point. The Priority Lane remains separate from the standard crawl.",
  "Three tracks per artist maximum. When taps reach 10k, the skip game can reroute one signal. Priority access is reserved for future urgent transmissions.",
  "Queue discipline: three tracks per artist, regular crawl by order received, 10k taps triggers the skip game, and Priority Lane access stays separate.",
  "Every artist gets three standard transmissions. At 10k taps, the wheel may fracture the order. Priority access is the future route for signals that cannot wait.",
  "Load up to three tracks per artist. The queue crawls in order until the 10k tap event opens the wheel. Priority access remains a separate lane.",
  "Three submissions per artist source. 10k taps unlock the skip game. Standard tracks hold formation unless future priority access cuts through.",
  "The system accepts three tracks per artist. At 10k taps, the wheel chooses a breach point. Priority Lane remains reserved outside the regular line.",
  "Artist cap: three tracks. Queue movement stays standard until the 10k tap event. Future priority access exists for signals unwilling to wait for turn or wheel.",
];

function sessionDescriptionFor(date: string): string {
  const index = Math.abs([...date].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % SESSION_DESCRIPTIONS.length;
  return SESSION_DESCRIPTIONS[index];
}

function defaultSession(options: { title?: string; showDate?: string; description?: string; trackLimitPerArtist?: number; queueCapacity?: number; skipGameTapTarget?: number } = {}): QueueSession {
  const date = options.showDate ?? todayDate();
  const now = new Date().toISOString();
  return normalizeSession({
    sessionId: makeSessionId(),
    title: options.title?.trim() || `BARCODE Radio — ${date}`,
    status: "prepared",
    showDate: date,
    createdAt: now,
    updatedAt: now,
    queueOpen: false,
    description: options.description?.trim() || sessionDescriptionFor(date),
    trackLimitPerArtist: options.trackLimitPerArtist ?? 3,
    queueCapacity: options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: options.skipGameTapTarget ?? 10000,
    activeCount: 0,
    completedCount: 0,
    removedCount: 0,
    spotlightCount: 0,
    estimatedActiveRuntimeSeconds: 0,
    completedRuntimeSeconds: 0,
    queue: [],
    spotlight: [],
    completed: [],
    removed: [],
    publicStatus: { isOpen: false, activeCount: 0, estimatedRuntimeSeconds: 0, capacity: options.queueCapacity ?? DEFAULT_QUEUE_CAPACITY, pressure: "low" },
    nextNonPriorityLane: "wheel",
    nextInLineTrack: null,
    nextInLineTrackId: null,
    loadedTrack: null,
    loadedTrackId: null,
    nextInLineHoldTrackId: null,
    currentTrackPreviousLane: null,
    currentTrackPreviousIndex: null,
    loadedTrackPreviousLane: null,
    loadedTrackPreviousIndex: null,
    autoRoutingPaused: false,
  });
}

const mem: QueueStore = (() => {
  const session = defaultSession();
  return { activeSessionId: session.sessionId, sessions: [session] };
})();

function laneRank(lane: QueueLane | undefined): number {
  if (lane === "priority") return 0;
  if (lane === "wheel") return 1;
  return 2;
}

function sortActive(entries: QueueEntry[]): QueueEntry[] {
  return [...entries].sort((a, b) => laneRank(a.lane) - laneRank(b.lane) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function laneTop(session: Pick<QueueSession, "queue">, lane: QueueLane, excludeId?: string): QueueEntry | null {
  return sortActive(session.queue).find((entry) => entry.id !== excludeId && entry.status === "queued" && (entry.lane ?? "regular") === lane) ?? null;
}

function chooseNextWaitingEntry(session: Pick<QueueSession, "queue" | "nextNonPriorityLane" | "nextInLineHoldTrackId" | "loadedTrackId">, excludeId?: string): QueueEntry | null {
  const blockedId = excludeId ?? session.nextInLineHoldTrackId ?? session.loadedTrackId ?? undefined;
  const priority = laneTop(session, "priority", blockedId);
  if (priority) return priority;

  const preferredLane: QueueNonPriorityLane = session.nextNonPriorityLane === "regular" ? "regular" : "wheel";
  const fallbackLane: QueueNonPriorityLane = preferredLane === "wheel" ? "regular" : "wheel";
  return laneTop(session, preferredLane, blockedId) ?? laneTop(session, fallbackLane, blockedId);
}

function getNextInLine(session: Pick<QueueSession, "nextInLineTrack">): QueueEntry | null {
  return session.nextInLineTrack ?? null;
}

function getLoadedTrack(session: Pick<QueueSession, "loadedTrack">): QueueEntry | null {
  return session.loadedTrack ?? null;
}

function pullNextInLine(session: QueueSession, excludeId?: string, force = false): void {
  if (session.autoRoutingPaused && !force) return;
  if (session.nextInLineTrack) return;
  const next = chooseNextWaitingEntry(session, excludeId);
  if (!next) return;
  const sorted = sortActive(session.queue);
  const previousIndex = sorted.findIndex((entry) => entry.id === next.id);
  session.queue = sorted.filter((entry) => entry.id !== next.id);
  session.nextInLineTrack = normalizeEntry({ ...next, status: "next" });
  session.nextInLineTrackId = next.id;
  session.nextInLineHoldTrackId = null;
  session.currentTrackPreviousLane = next.lane ?? "regular";
  session.currentTrackPreviousIndex = previousIndex >= 0 ? previousIndex : null;
  if (next.lane !== "priority") session.nextNonPriorityLane = nextLaneAfterFinish(next.lane);
  session.autoRoutingPaused = false;
}

function clearNextInLine(session: QueueSession): QueueEntry | null {
  const current = session.nextInLineTrack ?? null;
  session.nextInLineTrack = null;
  session.nextInLineTrackId = null;
  session.currentTrackPreviousLane = null;
  session.currentTrackPreviousIndex = null;
  return current;
}

function clearLoadedTrack(session: QueueSession): QueueEntry | null {
  const current = session.loadedTrack ?? null;
  session.loadedTrack = null;
  session.loadedTrackId = null;
  session.loadedTrackPreviousLane = null;
  session.loadedTrackPreviousIndex = null;
  return current;
}

function setLoadedTrack(session: QueueSession, entry: QueueEntry, previousLane?: QueueLane | null, previousIndex?: number | null): QueueEntry {
  const loaded = normalizeEntry({ ...entry, status: "playing", playedAt: entry.playedAt ?? new Date().toISOString() });
  session.loadedTrack = loaded;
  session.loadedTrackId = loaded.id;
  session.loadedTrackPreviousLane = previousLane ?? entry.lane ?? "regular";
  session.loadedTrackPreviousIndex = typeof previousIndex === "number" ? previousIndex : null;
  session.queue = session.queue.filter((track) => track.id !== loaded.id);
  if (session.nextInLineTrack?.id === loaded.id) clearNextInLine(session);
  return loaded;
}

function moveNextInLineBackToQueue(session: QueueSession): QueueEntry | null {
  const current = session.nextInLineTrack ?? null;
  if (!current) return null;
  const lane = session.currentTrackPreviousLane ?? current.lane ?? "regular";
  const restored = normalizeEntry({ ...current, lane, tier: lane === "priority" ? "fastlane" : lane === "wheel" ? "frontrow" : "free", status: "queued" });
  const index = typeof session.currentTrackPreviousIndex === "number" ? Math.max(0, session.currentTrackPreviousIndex) : 0;
  const queue = sortActive(session.queue);
  queue.splice(Math.min(index, queue.length), 0, restored);
  session.queue = queue;
  clearNextInLine(session);
  return restored;
}

function insertRestoredTrack(session: QueueSession, entry: QueueEntry, lane: QueueLane, index: number | null): QueueEntry {
  const restored = normalizeEntry({ ...entry, lane, tier: lane === "priority" ? "fastlane" : lane === "wheel" ? "frontrow" : "free", status: "queued", playedAt: null });
  const queue = sortActive(session.queue.filter((track) => track.id !== restored.id));
  const safeIndex = typeof index === "number" ? Math.max(0, Math.min(index, queue.length)) : queue.length;
  queue.splice(safeIndex, 0, restored);
  session.queue = queue;
  return restored;
}

function moveLoadedTrackBackToQueue(session: QueueSession): QueueEntry | null {
  const current = session.loadedTrack ?? null;
  if (!current) return null;
  const lane = session.loadedTrackPreviousLane ?? current.lane ?? "regular";
  const index = typeof session.loadedTrackPreviousIndex === "number" ? session.loadedTrackPreviousIndex : null;
  const restored = insertRestoredTrack(session, current, lane, index);
  clearLoadedTrack(session);
  return restored;
}

function nextLaneAfterFinish(lane: QueueLane | undefined): QueueNonPriorityLane {
  if (lane === "wheel") return "regular";
  if (!lane || lane === "regular") return "wheel";
  return "wheel";
}

function publicStatusForSession(session: Pick<QueueSession, "queue" | "queueOpen" | "nextInLineTrack" | "loadedTrack" | "queueCapacity">): QueuePublicStatus {
  const active = session.queue.filter((entry) => entry.status === "queued" || entry.status === "playing");
  const next = session.nextInLineTrack ? [session.nextInLineTrack] : [];
  const loaded = session.loadedTrack ? [session.loadedTrack] : [];
  const estimatedRuntimeSeconds = [...loaded, ...next, ...active].reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0);
  const capacity = session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY;
  const load = (active.length + next.length + loaded.length) / capacity;
  return {
    isOpen: session.queueOpen,
    activeCount: active.length + next.length + loaded.length,
    estimatedRuntimeSeconds,
    capacity,
    pressure: load >= 1 ? "max" : load >= 0.75 ? "high" : load >= 0.4 ? "medium" : "low",
    isFull: active.length + next.length + loaded.length >= capacity,
  };
}

function summarizeSession(session: QueueSession): QueueSessionSummary {
  const publicStatus = publicStatusForSession(session);
  return {
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    showDate: session.showDate,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    queueOpen: session.queueOpen,
    description: session.description ?? sessionDescriptionFor(session.showDate),
    trackLimitPerArtist: session.trackLimitPerArtist ?? 3,
    queueCapacity: session.queueCapacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: session.skipGameTapTarget ?? 10000,
    activeCount: publicStatus.activeCount,
    nextInLineTrackId: session.nextInLineTrackId ?? session.nextInLineTrack?.id ?? null,
    nextInLineHoldTrackId: session.nextInLineHoldTrackId ?? null,
    loadedTrackId: session.loadedTrackId ?? session.loadedTrack?.id ?? null,
    completedCount: session.completed.length,
    removedCount: session.removed.length,
    spotlightCount: session.spotlight.length,
    estimatedActiveRuntimeSeconds: publicStatus.estimatedRuntimeSeconds,
    completedRuntimeSeconds: session.completed.reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0),
    nextNonPriorityLane: session.nextNonPriorityLane ?? "wheel",
  };
}

function normalizeEntry(entry: QueueEntry): QueueEntry {
  const submittedArtistName = entry.submittedArtistName ?? entry.artist;
  const submittedSongTitle = entry.submittedSongTitle ?? entry.title;
  const detectedDurationSeconds = entry.detectedDurationSeconds ?? null;
  const sourceType = entry.sourceType ?? detectQueueSourceType(entry.link);
  const durationSource = normalizeDurationSource(entry.durationSource, detectedDurationSeconds, sourceType);
  return {
    ...entry,
    artist: entry.artist ?? submittedArtistName,
    title: entry.title ?? submittedSongTitle,
    submittedArtistName,
    submittedSongTitle,
    detectedArtistName: entry.detectedArtistName ?? null,
    detectedSongTitle: entry.detectedSongTitle ?? null,
    providerTitle: entry.providerTitle ?? null,
    sourceType,
    estimatedDurationSeconds: entry.estimatedDurationSeconds ?? detectedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS,
    detectedDurationSeconds,
    durationIsEstimate: detectedDurationSeconds === null,
    durationSource,
    note: entry.note ?? null,
  };
}

function normalizeDurationSource(source: QueueDurationSource | string | undefined, detected: number | null, sourceType: QueueSourceType): QueueDurationSource {
  if (source === "browser-audio-metadata" || source === "upload_metadata") return "upload_metadata";
  if (source === "file-metadata" || source === "file_metadata") return "file_metadata";
  if (source === "provider-metadata" || source === "provider_metadata") return sourceType === "youtube" || sourceType === "soundcloud" || sourceType === "spotify" ? sourceType : "provider_metadata";
  if (source === "internal-estimate" || source === "internal_estimate") return "internal_estimate";
  if (source === "youtube" || source === "soundcloud" || source === "spotify" || source === "unknown") return source;
  if (detected && sourceType === "upload") return "upload_metadata";
  if (detected && (sourceType === "youtube" || sourceType === "soundcloud" || sourceType === "spotify")) return sourceType;
  return detected ? "provider_metadata" : "internal_estimate";
}

function normalizeSessionStatus(status: unknown, queueOpen: boolean): QueueSessionStatus {
  if (status === "open" || status === "prepared" || status === "closed" || status === "archived") return status;
  if (status === "active") return queueOpen ? "open" : "closed";
  return queueOpen ? "open" : "prepared";
}

function normalizeSession(raw: Partial<QueueSession> & { sessionId: string; title: string; status: QueueSessionStatus; showDate: string; createdAt: string; updatedAt: string; queueOpen: boolean }): QueueSession {
  const queueOpen = raw.status === "open" ? true : raw.queueOpen === true;
  const status = normalizeSessionStatus(raw.status, queueOpen);
  const session = {
    ...raw,
    status,
    description: raw.description ?? sessionDescriptionFor(raw.showDate),
    trackLimitPerArtist: raw.trackLimitPerArtist ?? 3,
    queueCapacity: raw.queueCapacity ?? raw.publicStatus?.capacity ?? DEFAULT_QUEUE_CAPACITY,
    skipGameTapTarget: raw.skipGameTapTarget ?? 10000,
    queueOpen: status === "open" ? true : false,
    nextNonPriorityLane: raw.nextNonPriorityLane === "regular" ? "regular" : "wheel",
    nextInLineTrack: raw.nextInLineTrack ? normalizeEntry(raw.nextInLineTrack) : null,
    nextInLineTrackId: raw.nextInLineTrack?.id ?? raw.nextInLineTrackId ?? null,
    loadedTrack: raw.loadedTrack ? normalizeEntry(raw.loadedTrack) : null,
    loadedTrackId: raw.loadedTrack?.id ?? raw.loadedTrackId ?? null,
    nextInLineHoldTrackId: raw.nextInLineHoldTrackId ?? null,
    loadedTrackPreviousLane: raw.loadedTrackPreviousLane ?? raw.loadedTrack?.lane ?? null,
    loadedTrackPreviousIndex: typeof raw.loadedTrackPreviousIndex === "number" ? raw.loadedTrackPreviousIndex : null,
    autoRoutingPaused: raw.autoRoutingPaused === true,
    currentTrackPreviousLane: raw.currentTrackPreviousLane ?? raw.nextInLineTrack?.lane ?? null,
    currentTrackPreviousIndex: typeof raw.currentTrackPreviousIndex === "number" ? raw.currentTrackPreviousIndex : null,
    queue: sortActive((raw.queue ?? []).map(normalizeEntry).filter((entry) => entry.id !== raw.nextInLineTrack?.id && entry.id !== raw.nextInLineTrackId && entry.id !== raw.loadedTrack?.id && entry.id !== raw.loadedTrackId)),
    completed: (raw.completed ?? []).map(normalizeEntry),
    removed: (raw.removed ?? []).map(normalizeEntry),
    spotlight: (raw.spotlight ?? []).map(normalizeEntry),
  } as QueueSession;
  const summary = summarizeSession(session);
  return { ...session, ...summary, publicStatus: publicStatusForSession(session) };
}

function normalizeStore(input: unknown): QueueStore {
  const maybe = input as Partial<QueueStore> | null;
  if (maybe && Array.isArray(maybe.sessions)) {
    const sessions = maybe.sessions.map((session) => normalizeSession(session));
    const activeSessionId = maybe.activeSessionId && sessions.some((session) => session.sessionId === maybe.activeSessionId)
      ? maybe.activeSessionId
      : sessions.find((session) => session.status !== "archived")?.sessionId ?? sessions[0]?.sessionId;
    if (activeSessionId) return { activeSessionId, sessions };
  }
  const legacy = input as { queue?: QueueEntry[]; completed?: QueueEntry[]; removed?: QueueEntry[]; spotlight?: QueueEntry[]; isOpen?: boolean } | null;
  if (legacy && (Array.isArray(legacy.queue) || Array.isArray(legacy.completed))) {
    const session = normalizeSession({
      ...defaultSession(),
      queue: legacy.queue ?? [],
      completed: legacy.completed ?? [],
      removed: legacy.removed ?? [],
      spotlight: legacy.spotlight ?? [],
      status: legacy.isOpen === false ? "closed" : "open",
      queueOpen: legacy.isOpen !== false,
      updatedAt: new Date().toISOString(),
    });
    return { activeSessionId: session.sessionId, sessions: [session] };
  }
  const session = defaultSession();
  return { activeSessionId: session.sessionId, sessions: [session] };
}

async function readStore(): Promise<QueueStore> {
  const redis = getRedis();
  if (!redis) return normalizeStore(mem);
  const raw = await redis.get<QueueStore | string>(STATE_KEY);
  if (raw) return normalizeStore(typeof raw === "string" ? JSON.parse(raw) : raw);
  const legacy = await redis.get<unknown>(LEGACY_STATE_KEY);
  return normalizeStore(typeof legacy === "string" ? JSON.parse(legacy) : legacy);
}

async function writeStore(store: QueueStore): Promise<void> {
  const normalized = normalizeStore(store);
  const redis = getRedis();
  if (!redis) {
    mem.activeSessionId = normalized.activeSessionId;
    mem.sessions = normalized.sessions;
    return;
  }
  await redis.set(STATE_KEY, JSON.stringify(normalized));
}

function getSession(store: QueueStore, sessionId?: string): QueueSession {
  const targetId = sessionId ?? store.activeSessionId;
  return store.sessions.find((session) => session.sessionId === targetId) ?? store.sessions.find((session) => session.sessionId === store.activeSessionId) ?? store.sessions[0];
}

function replaceSession(store: QueueStore, session: QueueSession): QueueStore {
  return { ...store, sessions: store.sessions.map((item) => item.sessionId === session.sessionId ? normalizeSession({ ...session, updatedAt: new Date().toISOString() }) : item) };
}

function parseFilenameMetadata(fileName?: string | null): { artist: string | null; title: string | null; providerTitle: string | null } {
  if (!fileName) return { artist: null, title: null, providerTitle: null };
  const base = fileName.replace(/\.(mp3|wav)$/i, "").replace(/[_]+/g, " ").trim();
  const parts = base.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { artist: parts[0], title: parts.slice(1).join(" - "), providerTitle: base || null };
  return { artist: null, title: null, providerTitle: base || null };
}

function blankProvider(source: QueueDurationSource = "internal_estimate"): ProviderMetadata {
  return { detectedArtistName: null, detectedSongTitle: null, providerTitle: null, detectedDurationSeconds: null, durationSource: source, artworkUrl: null };
}

export function parseYouTubeVideoId(link: string): string | null {
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host.includes("youtube.com")) return url.searchParams.get("v") || url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] || url.pathname.match(/\/embed\/([^/?#]+)/)?.[1] || null;
    return null;
  } catch {
    return null;
  }
}

export function parseYouTubeDuration(duration: string): number | null {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

async function lookupYouTubeMetadata(link: string): Promise<ProviderMetadata> {
  const key = process.env.YOUTUBE_API_KEY || process.env.YOUTUBE_DATA_API_KEY;
  const id = parseYouTubeVideoId(link);
  if (!key || !id) return blankProvider("internal_estimate");
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return blankProvider("internal_estimate");
  const payload = await res.json();
  const item = Array.isArray(payload.items) ? payload.items[0] : null;
  const duration = item?.contentDetails?.duration ? parseYouTubeDuration(item.contentDetails.duration) : null;
  const providerTitle = typeof item?.snippet?.title === "string" ? item.snippet.title : null;
  const channelTitle = typeof item?.snippet?.channelTitle === "string" ? item.snippet.channelTitle : null;
  return { detectedArtistName: channelTitle, detectedSongTitle: providerTitle, providerTitle, detectedDurationSeconds: duration, durationSource: duration ? "youtube" : "internal_estimate", artworkUrl: id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null };
}

async function lookupSpotifyMetadata(link: string): Promise<ProviderMetadata> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return blankProvider("internal_estimate");
  const match = link.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/) || link.match(/spotify:track:([a-zA-Z0-9]+)/);
  const trackId = match?.[1];
  if (!trackId) return blankProvider("internal_estimate");
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!tokenRes.ok) return blankProvider("internal_estimate");
  const token = await tokenRes.json();
  if (!token.access_token) return blankProvider("internal_estimate");
  const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
  if (!trackRes.ok) return blankProvider("internal_estimate");
  const track = await trackRes.json();
  const seconds = typeof track.duration_ms === "number" ? Math.round(track.duration_ms / 1000) : null;
  const artist = Array.isArray(track.artists) ? track.artists.map((item: { name?: string }) => item.name).filter(Boolean).join(", ") : null;
  const title = typeof track.name === "string" ? track.name : null;
  const artworkUrl = Array.isArray(track.album?.images) ? track.album.images.find((image: { url?: string }) => typeof image.url === "string")?.url ?? null : null;
  return { detectedArtistName: artist || null, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "spotify" : "internal_estimate", artworkUrl };
}

async function lookupSoundCloudMetadata(link: string): Promise<ProviderMetadata> {
  const clientId = process.env.SOUNDCLOUD_CLIENT_ID;
  if (!clientId) return blankProvider("internal_estimate");
  const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(link)}&client_id=${encodeURIComponent(clientId)}`;
  const res = await fetch(resolveUrl, { cache: "no-store" });
  if (!res.ok) return blankProvider("internal_estimate");
  const track = await res.json();
  const seconds = typeof track.duration === "number" ? Math.round(track.duration / 1000) : null;
  const title = typeof track.title === "string" ? track.title : null;
  const artist = typeof track.user?.username === "string" ? track.user.username : null;
  const artworkUrl = typeof track.artwork_url === "string" ? track.artwork_url.replace("-large.", "-t500x500.") : null;
  return { detectedArtistName: artist, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "soundcloud" : "internal_estimate", artworkUrl };
}

export async function detectProviderMetadata(sourceType: QueueSourceType, link: string): Promise<ProviderMetadata> {
  try {
    if (sourceType === "youtube") return lookupYouTubeMetadata(link);
    if (sourceType === "spotify") return lookupSpotifyMetadata(link);
    if (sourceType === "soundcloud") return lookupSoundCloudMetadata(link);
    return blankProvider("internal_estimate");
  } catch (error) {
    console.warn("[queue] provider metadata lookup failed", error);
    return blankProvider("internal_estimate");
  }
}

function normalizeIdentity(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@._-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTikTokHandle(value: string): string {
  let cleaned = value.trim().toLowerCase();
  try {
    const parsed = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    if (parsed.hostname.includes("tiktok.com")) cleaned = parsed.pathname.split("/").find((part) => part.startsWith("@")) ?? cleaned;
  } catch {}
  cleaned = cleaned.replace(/^@+/, "").split(/[/?#]/)[0] ?? cleaned;
  cleaned = cleaned.replace(/[^a-z0-9._-]/g, "");
  return cleaned ? `@${cleaned}` : "";
}

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeSourceKey(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    url.hash = "";
    if (["utm_source", "utm_medium", "utm_campaign", "fbclid", "si"].some((key) => url.searchParams.has(key))) {
      ["utm_source", "utm_medium", "utm_campaign", "fbclid", "si"].forEach((key) => url.searchParams.delete(key));
    }
    return `${url.hostname.replace(/^www\./, "").toLowerCase()}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
  } catch {
    return value.trim().toLowerCase() || null;
  }
}

function parseProviderId(sourceType: QueueSourceType, link: string): string | null {
  if (sourceType === "youtube") {
    const id = parseYouTubeVideoId(link);
    return id ? `youtube:${id}` : null;
  }
  if (sourceType === "spotify") {
    const id = link.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/)?.[1] ?? link.match(/spotify:track:([a-zA-Z0-9]+)/)?.[1];
    return id ? `spotify:${id}` : null;
  }
  if (sourceType === "soundcloud") {
    const key = normalizeSourceKey(link);
    return key ? `soundcloud:${key}` : null;
  }
  return null;
}

function countMatches(entries: QueueEntry[], predicate: (entry: QueueEntry) => boolean): number {
  return entries.filter(predicate).length;
}

function findSubmissionBlocks(session: QueueSession, track: QueueEntry): string[] {
  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const reasons: string[] = [];
  const tikTok = track.normalizedTikTokHandle;
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  const email = normalizeEmail(track.contactEmail);
  const token = track.submitterToken ?? "";
  if (tikTok && countMatches(entries, (entry) => entry.normalizedTikTokHandle === tikTok) >= session.trackLimitPerArtist) reasons.push("Limit matched by TikTok handle");
  if (submitter && countMatches(entries, (entry) => normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) === submitter) >= session.trackLimitPerArtist) reasons.push("Limit matched by submitter artist name");
  if (email && countMatches(entries, (entry) => normalizeEmail(entry.contactEmail) === email) >= session.trackLimitPerArtist) reasons.push("Limit matched by contact/email");
  if (token && countMatches(entries, (entry) => entry.submitterToken === token) >= session.trackLimitPerArtist) reasons.push("Limit matched by browser token");
  if (track.normalizedSourceKey && entries.some((entry) => entry.normalizedSourceKey === track.normalizedSourceKey)) reasons.push("Duplicate source");
  if (track.providerId && entries.some((entry) => entry.providerId === track.providerId)) reasons.push("Duplicate provider source");
  return reasons;
}

function suspiciousFlagsFor(session: QueueSession, track: QueueEntry): string[] {
  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const flags = new Set<string>();
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  if (track.submitterToken && entries.some((entry) => entry.submitterToken === track.submitterToken && normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) !== submitter)) flags.add("Same browser token using different artist names");
  if (track.fileName && track.fileSize && entries.some((entry) => entry.fileName === track.fileName && entry.fileSize === track.fileSize && entry.detectedDurationSeconds === track.detectedDurationSeconds)) flags.add("Same file name, size, and duration");
  if (track.submittedSongTitle && entries.some((entry) => normalizeIdentity(entry.submittedSongTitle) === normalizeIdentity(track.submittedSongTitle) && normalizeIdentity(entry.submittedArtistName) !== normalizeIdentity(track.submittedArtistName))) flags.add("Same source/title with changed artist name");
  const recent = entries.filter((entry) => Date.now() - new Date(entry.createdAt).getTime() < 10 * 60 * 1000).length;
  if (recent >= 5) flags.add("Many attempts in a short time");
  return [...flags];
}

function findSubmissionCooldown(session: QueueSession, track: QueueEntry): number {
  const entries = [...session.queue, ...(session.nextInLineTrack ? [session.nextInLineTrack] : []), ...(session.loadedTrack ? [session.loadedTrack] : []), ...session.completed, ...session.removed];
  const submitter = normalizeIdentity(track.submitterArtistName ?? track.submittedArtistName);
  const email = normalizeEmail(track.contactEmail);
  const matching = entries.filter((entry) => {
    if (track.submitterToken && entry.submitterToken === track.submitterToken) return true;
    if (track.normalizedTikTokHandle && entry.normalizedTikTokHandle === track.normalizedTikTokHandle) return true;
    if (submitter && normalizeIdentity(entry.submitterArtistName ?? entry.submittedArtistName) === submitter) return true;
    if (email && normalizeEmail(entry.contactEmail) === email) return true;
    return false;
  });
  const lastSubmittedAt = matching.reduce((latest, entry) => Math.max(latest, new Date(entry.createdAt).getTime()), 0);
  if (!lastSubmittedAt) return 0;
  const elapsedSeconds = Math.floor((Date.now() - lastSubmittedAt) / 1000);
  return Math.max(0, SUBMISSION_COOLDOWN_SECONDS - elapsedSeconds);
}

class QueueSubmissionCooldownError extends Error {
  remainingSeconds: number;
  constructor(remainingSeconds: number) {
    super("Submission cooldown active.");
    this.remainingSeconds = remainingSeconds;
  }
}

class QueueSubmissionBlockedError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super("Submission limit reached for this session.");
    this.reasons = reasons;
  }
}

export async function createQueueTrack(input: {
  artist: string;
  title: string;
  submitterArtistName?: string;
  tiktokHandle: string;
  collaboratorNames?: string | null;
  contactEmail?: string | null;
  submitterToken?: string | null;
  link?: string;
  note?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  sourceType?: QueueSourceType;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  providerTitle?: string | null;
  detectedDurationSeconds?: number | null;
  durationSource?: QueueDurationSource;
}): Promise<QueueEntry> {
  const sourceType = input.sourceType ?? (input.fileUrl ? "upload" : detectQueueSourceType(input.link ?? ""));
  const submittedArtistName = input.artist.trim();
  const submittedSongTitle = input.title.trim();
  const submitterArtistName = (input.submitterArtistName?.trim() || submittedArtistName).trim();
  const normalizedTikTokHandle = normalizeTikTokHandle(input.tiktokHandle);
  if (!normalizedTikTokHandle) throw new Error("TikTok handle is required.");
  const providerMetadata = sourceType === "upload" ? blankProvider() : await detectProviderMetadata(sourceType, input.link ?? "");
  const providerId = parseProviderId(sourceType, input.link ?? input.fileUrl ?? "");
  const normalizedSourceKey = normalizeSourceKey(input.fileUrl || input.link || "");
  const fileMetadata = sourceType === "upload" ? parseFilenameMetadata(input.fileName) : { artist: null, title: null, providerTitle: null };
  const detectedDurationSeconds = typeof input.detectedDurationSeconds === "number" && Number.isFinite(input.detectedDurationSeconds)
    ? Math.max(1, Math.round(input.detectedDurationSeconds))
    : providerMetadata.detectedDurationSeconds;
  const durationSource = detectedDurationSeconds
    ? input.durationSource ?? providerMetadata.durationSource ?? (sourceType === "upload" ? "upload_metadata" : "provider_metadata")
    : "internal_estimate";

  return normalizeEntry({
    id: generateQueueId(),
    artist: submittedArtistName,
    title: submittedSongTitle,
    link: input.fileUrl || input.link || "",
    tier: "free",
    lane: "regular",
    amount: 0,
    stripeSessionId: null,
    status: "queued",
    createdAt: new Date().toISOString(),
    playedAt: null,
    completedAt: null,
    removedAt: null,
    restoredAt: null,
    spotlightedAt: null,
    note: input.note?.trim() || null,
    submitterArtistName,
    submittedArtistName,
    submittedSongTitle,
    collaboratorNames: input.collaboratorNames?.trim() || null,
    tiktokHandle: normalizedTikTokHandle,
    normalizedTikTokHandle,
    contactEmail: input.contactEmail?.trim() || null,
    submitterToken: input.submitterToken?.trim() || null,
    normalizedSourceKey,
    providerId,
    sourceArtworkUrl: sourceType === "youtube" && providerId?.startsWith("youtube:") ? `https://img.youtube.com/vi/${providerId.slice("youtube:".length)}/hqdefault.jpg` : providerMetadata.artworkUrl ?? null,
    detectedArtistName: input.detectedArtistName ?? providerMetadata.detectedArtistName ?? fileMetadata.artist,
    detectedSongTitle: input.detectedSongTitle ?? providerMetadata.detectedSongTitle ?? fileMetadata.title,
    providerTitle: input.providerTitle ?? providerMetadata.providerTitle ?? fileMetadata.providerTitle,
    fileUrl: input.fileUrl ?? null,
    fileName: input.fileName ?? null,
    fileSize: input.fileSize ?? null,
    mimeType: input.mimeType ?? null,
    sourceType,
    detectedDurationSeconds,
    estimatedDurationSeconds: detectedDurationSeconds ?? INTERNAL_BUFFER_DURATION_SECONDS,
    durationIsEstimate: detectedDurationSeconds === null,
    durationSource,
  });
}

export async function submitRadioTrack(input: Parameters<typeof createQueueTrack>[0]): Promise<QueueEntry> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status !== "open" || !session.queueOpen) throw new Error("Queue is closed");
  if (publicStatusForSession(session).isFull) throw new Error("Queue is full for new transmissions.");
  const track = await createQueueTrack(input);
  const blockReasons = findSubmissionBlocks(session, track);
  if (blockReasons.length > 0) throw new QueueSubmissionBlockedError(blockReasons);
  const cooldownRemainingSeconds = findSubmissionCooldown(session, track);
  if (cooldownRemainingSeconds > 0) throw new QueueSubmissionCooldownError(cooldownRemainingSeconds);
  track.suspiciousFlags = suspiciousFlagsFor(session, track);
  session.queue.push(track);
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return track;
}

function queueStateFromSession(session: QueueSession, store: QueueStore, viewedSessionId = session.sessionId): QueueState {
  const normalized = normalizeSession(session);
  return {
    nowPlaying: getLoadedTrack(normalized),
    queue: normalized.queue,
    history: normalized.completed,
    totalPlayed: normalized.completed.length,
    streamStatus: normalized.status === "open" && normalized.queueOpen ? "online" : "offline",
    removed: normalized.removed,
    spotlight: normalized.spotlight,
    publicStatus: normalized.publicStatus,
    session: summarizeSession(normalized),
    nextInLine: getNextInLine(normalized),
    loadedTrack: getLoadedTrack(normalized),
    autoRoutingPaused: normalized.autoRoutingPaused === true,
    nextNonPriorityLane: normalized.nextNonPriorityLane,
    sessions: store.sessions.map(summarizeSession).sort((a, b) => b.showDate.localeCompare(a.showDate) || b.createdAt.localeCompare(a.createdAt)),
    viewedSessionId,
    readOnly: normalized.status === "archived" || normalized.sessionId !== store.activeSessionId,
  };
}

export async function getRadioQueueState(sessionId?: string): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store, sessionId);
  if (session.status !== "archived") {
    pullNextInLine(session);
    await writeStore(replaceSession(store, session));
    return queueStateFromSession(session, replaceSession(store, session), sessionId ?? store.activeSessionId);
  }
  return queueStateFromSession(session, store, sessionId ?? store.activeSessionId);
}

export function toPublicQueueTrack(entry: QueueEntry): QueuePublicTrack {
  const normalized = normalizeEntry(entry);
  return {
    id: normalized.id,
    submittedArtistName: normalized.submittedArtistName ?? normalized.artist,
    submittedSongTitle: normalized.submittedSongTitle ?? normalized.title,
    detectedArtistName: normalized.detectedArtistName ?? null,
    detectedSongTitle: normalized.detectedSongTitle ?? null,
    providerTitle: normalized.providerTitle ?? null,
    sourceType: normalized.sourceType ?? "other",
    lane: normalized.lane ?? "regular",
    durationLabel: normalized.durationIsEstimate ? "estimated/pending" : formatRuntime(getTrackRuntimeSeconds(normalized)),
    durationIsEstimate: normalized.durationIsEstimate ?? true,
    sourceArtworkUrl: getTrackArtworkUrl(normalized),
    tiktokHandle: normalized.tiktokHandle ?? null,
  };
}

export async function getPublicQueueSnapshot(sessionId?: string): Promise<QueuePublicSnapshot> {
  const store = await readStore();
  const session = getSession(store, sessionId);
  if (session.status !== "archived") {
    pullNextInLine(session);
    await writeStore(replaceSession(store, session));
  }
  const normalized = normalizeSession(session);
  return { session: summarizeSession(normalized), status: normalized.publicStatus, queue: normalized.queue.map(toPublicQueueTrack), completed: normalized.completed.slice(0, 10).map(toPublicQueueTrack), nowPlaying: normalized.loadedTrack ? toPublicQueueTrack(normalized.loadedTrack) : null, upNext: normalized.nextInLineTrack ? toPublicQueueTrack(normalized.nextInLineTrack) : null };
}

export interface QueueSessionSubmitterRow {
  sessionId: string;
  sessionTitle: string;
  showDate: string;
  submitterArtistName: string;
  submittedArtistName: string;
  submittedSongTitle: string;
  tiktokHandle: string;
  contactEmail: string;
  sourceLink: string;
  sourceType: string;
  submittedAt: string;
  status: string;
  lane: string;
  spotlight: boolean;
}

function sessionEntriesForExport(session: QueueSession): QueueEntry[] {
  return [
    ...(session.loadedTrack ? [session.loadedTrack] : []),
    ...(session.nextInLineTrack ? [session.nextInLineTrack] : []),
    ...session.queue,
    ...session.completed,
    ...session.removed,
  ];
}

function exportRowsForSession(session: QueueSession): QueueSessionSubmitterRow[] {
  const spotlightIds = new Set(session.spotlight.map((entry) => entry.id));
  return sessionEntriesForExport(session).map((entry) => ({
    sessionId: session.sessionId,
    sessionTitle: session.title,
    showDate: session.showDate,
    submitterArtistName: entry.submitterArtistName ?? entry.submittedArtistName ?? entry.artist,
    submittedArtistName: entry.submittedArtistName ?? entry.artist,
    submittedSongTitle: entry.submittedSongTitle ?? entry.title,
    tiktokHandle: entry.tiktokHandle ?? entry.normalizedTikTokHandle ?? "",
    contactEmail: entry.contactEmail ?? "",
    sourceLink: entry.link,
    sourceType: entry.sourceType ?? "other",
    submittedAt: entry.createdAt,
    status: entry.status,
    lane: entry.lane ?? "regular",
    spotlight: spotlightIds.has(entry.id),
  }));
}

function csvEscape(value: string | number | boolean): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function getQueueSessionSubmitterList(sessionId?: string): Promise<{ session: QueueSessionSummary; rows: QueueSessionSubmitterRow[] }> {
  const store = await readStore();
  const session = normalizeSession(getSession(store, sessionId));
  return { session: summarizeSession(session), rows: exportRowsForSession(session) };
}

export async function getQueueSessionSubmissionsCsv(sessionId?: string): Promise<{ filename: string; csv: string }> {
  const { session, rows } = await getQueueSessionSubmitterList(sessionId);
  const headers = ["sessionId", "session title", "show date", "submitted artist / submitter artist", "public/display artist credit", "song title", "TikTok handle", "email/contact", "source link", "source type", "submitted timestamp", "current status", "current lane", "spotlight"];
  const body = rows.map((row) => [row.sessionId, row.sessionTitle, row.showDate, row.submitterArtistName, row.submittedArtistName, row.submittedSongTitle, row.tiktokHandle, row.contactEmail, row.sourceLink, row.sourceType, row.submittedAt, row.status, row.lane, row.spotlight].map(csvEscape).join(","));
  const safeDate = session.showDate || new Date().toISOString().slice(0, 10);
  return { filename: `barcode-radio-session-${safeDate}-submissions.csv`, csv: [headers.map(csvEscape).join(","), ...body].join("\n") };
}

export async function setQueueOpen(isOpen: boolean): Promise<QueuePublicStatus> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return session.publicStatus;

  const sessions = store.sessions.map((item) => {
    if (item.sessionId === session.sessionId) {
      return normalizeSession({ ...item, queueOpen: isOpen, status: isOpen ? "open" : "closed", updatedAt: new Date().toISOString() });
    }
    if (isOpen && item.status === "open") {
      return normalizeSession({ ...item, queueOpen: false, status: "closed", updatedAt: new Date().toISOString() });
    }
    return item;
  });
  const nextStore = { ...store, sessions };
  await writeStore(nextStore);
  return publicStatusForSession(getSession(nextStore));
}

export async function startNewQueueSession(options: { title?: string; showDate?: string; description?: string; trackLimitPerArtist?: number; queueCapacity?: number; skipGameTapTarget?: number } = {}): Promise<QueueState> {
  const store = await readStore();
  const current = getSession(store);
  if (current.status === "open" || current.queueOpen) return queueStateFromSession(current, store);
  const preserved = store.sessions.map((session) => session.sessionId === store.activeSessionId && session.status !== "archived" ? normalizeSession({ ...session, status: "closed", queueOpen: false, updatedAt: new Date().toISOString() }) : session);
  const next = defaultSession(options);
  const nextStore = { activeSessionId: next.sessionId, sessions: [next, ...preserved] };
  await writeStore(nextStore);
  return queueStateFromSession(next, nextStore);
}

export async function archiveCurrentQueueSession(): Promise<QueueState> {
  const store = await readStore();
  const session = normalizeSession({ ...getSession(store), status: "archived", queueOpen: false, updatedAt: new Date().toISOString() });
  const archivedStore = replaceSession(store, session);
  const active = archivedStore.sessions.find((item) => item.status !== "archived") ?? session;
  archivedStore.activeSessionId = active.sessionId;
  await writeStore(archivedStore);
  return queueStateFromSession(session, archivedStore, session.sessionId);
}

export async function activateQueueSession(sessionId: string): Promise<QueueState> {
  const store = await readStore();
  const sessions = store.sessions.map((session) => normalizeSession({ ...session, status: session.sessionId === sessionId ? "prepared" : session.status === "archived" ? "archived" : "closed", queueOpen: false, updatedAt: new Date().toISOString() }));
  const active = sessions.find((session) => session.sessionId === sessionId) ?? sessions[0];
  const nextStore = { activeSessionId: active.sessionId, sessions };
  await writeStore(nextStore);
  return queueStateFromSession(active, nextStore);
}

function restoreEntry(entry: QueueEntry, lane: QueueLane): QueueEntry {
  return normalizeEntry({ ...entry, lane, tier: lane === "priority" ? "fastlane" : "free", status: "queued", createdAt: new Date().toISOString(), playedAt: null, completedAt: null, removedAt: null, restoredAt: new Date().toISOString() });
}

export async function updateRadioTrack(id: string, action: QueueAdminAction): Promise<QueueState> {
  const store = await readStore();
  const session = getSession(store);
  if (session.status === "archived") return queueStateFromSession(session, store);

  if (action === "pullNext") {
    session.autoRoutingPaused = false;
    pullNextInLine(session, undefined, true);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (action === "removeSpotlight") {
    session.spotlight = session.spotlight.filter((entry) => entry.id !== id);
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  if (action === "restoreRegular" || action === "restorePriority") {
    const lane: QueueLane = action === "restorePriority" ? "priority" : "regular";
    const completedIndex = session.completed.findIndex((entry) => entry.id === id);
    const removedIndex = session.removed.findIndex((entry) => entry.id === id);
    const source = completedIndex >= 0 ? session.completed.splice(completedIndex, 1)[0] : removedIndex >= 0 ? session.removed.splice(removedIndex, 1)[0] : null;
    if (source) session.queue.push(restoreEntry(source, lane));
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  const index = session.queue.findIndex((entry) => entry.id === id);
  const active = index >= 0 ? session.queue[index] : null;
  const nextInLine = session.nextInLineTrack?.id === id ? session.nextInLineTrack : null;
  const loaded = session.loadedTrack?.id === id ? session.loadedTrack : null;

  if (action === "spotlight") {
    const source = loaded ?? nextInLine ?? active ?? session.completed.find((entry) => entry.id === id) ?? session.removed.find((entry) => entry.id === id);
    if (source && !session.spotlight.some((entry) => entry.id === source.id)) session.spotlight.push({ ...source, spotlightedAt: new Date().toISOString() });
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  if (loaded) {
    if (action === "moveBack") {
      const restored = moveLoadedTrackBackToQueue(session);
      session.nextInLineHoldTrackId = restored?.id ?? null;
      const staged = session.nextInLineTrack;
      if (staged) moveNextInLineBackToQueue(session);
      session.autoRoutingPaused = true;
    }
    if (action === "finish") {
      const current = clearLoadedTrack(session);
      if (current) {
        session.completed.unshift({ ...current, status: "played", playedAt: current.playedAt ?? new Date().toISOString(), completedAt: new Date().toISOString() });
        session.nextNonPriorityLane = nextLaneAfterFinish(current.lane);
      }
    }
    if (action === "remove") {
      const current = clearLoadedTrack(session);
      if (current) {
        session.removed.unshift({ ...current, status: "removed", removedAt: new Date().toISOString() });
        session.nextNonPriorityLane = nextLaneAfterFinish(current.lane);
      }
    }
    if (action !== "moveBack") pullNextInLine(session);
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (nextInLine) {
    if (action === "load") {
      if (session.loadedTrack && session.loadedTrack.id !== nextInLine.id) moveLoadedTrackBackToQueue(session);
      const previousLane = session.currentTrackPreviousLane;
      const previousIndex = session.currentTrackPreviousIndex;
      const current = clearNextInLine(session);
      if (current) setLoadedTrack(session, current, previousLane, previousIndex);
      pullNextInLine(session);
    }
    if (action === "moveBack") {
      const restored = moveNextInLineBackToQueue(session);
      session.nextInLineHoldTrackId = restored?.id ?? null;
      session.autoRoutingPaused = true;
    }
    if (action === "finish") {
      const current = clearNextInLine(session);
      if (current) {
        session.completed.unshift({ ...current, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
        session.nextNonPriorityLane = nextLaneAfterFinish(current.lane);
      }
      pullNextInLine(session);
    }
    if (action === "remove") {
      const current = clearNextInLine(session);
      if (current) {
        session.removed.unshift({ ...current, status: "removed", removedAt: new Date().toISOString() });
        session.nextNonPriorityLane = nextLaneAfterFinish(current.lane);
      }
      pullNextInLine(session);
    }
    const nextStore = replaceSession(store, session);
    await writeStore(nextStore);
    return queueStateFromSession(session, nextStore);
  }

  if (!active) return getRadioQueueState();
  if (action === "load") {
    if (session.loadedTrack && session.loadedTrack.id !== active.id) moveLoadedTrackBackToQueue(session);
    setLoadedTrack(session, active, active.lane ?? "regular", index);
  }
  if (action === "priority") {
    session.queue.splice(index, 1);
    session.queue.push({ ...active, lane: "priority", tier: "fastlane", status: "queued" });
  }
  if (action === "regular") {
    session.queue.splice(index, 1);
    session.queue.push({ ...active, lane: "regular", tier: "free", status: "queued" });
  }
  if (action === "wheel" && (!active.lane || active.lane === "regular")) {
    session.queue.splice(index, 1);
    session.queue.push({ ...active, lane: "wheel", tier: "frontrow", status: "queued" });
  }
  if (action === "finish") {
    session.queue.splice(index, 1);
    session.completed.unshift({ ...active, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
    session.nextNonPriorityLane = nextLaneAfterFinish(active.lane);
  }
  if (action === "remove") {
    session.queue.splice(index, 1);
    session.removed.unshift({ ...active, status: "removed", removedAt: new Date().toISOString() });
  }
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return getRadioQueueState();
}

// Legacy-compatible helpers used by archived/OBS components.
export async function addToQueue(entry: Omit<QueueEntry, "id" | "status" | "playedAt">): Promise<QueueEntry> {
  const track = normalizeEntry({ ...entry, id: generateQueueId(), status: "queued", playedAt: null, lane: entry.lane ?? (normalizeTier(entry.tier) === "fastlane" ? "priority" : "regular"), sourceType: entry.sourceType ?? detectQueueSourceType(entry.link) });
  const store = await readStore();
  const session = getSession(store);
  session.queue.push(track);
  await writeStore(replaceSession(store, session));
  return track;
}

export async function getQueueState(): Promise<QueueState> { return getRadioQueueState(); }

export async function advanceQueue(): Promise<QueueEntry | null> {
  const store = await readStore();
  const session = getSession(store);
  pullNextInLine(session);
  const next = clearNextInLine(session);
  if (!next) return null;
  session.completed.unshift({ ...next, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  session.nextNonPriorityLane = nextLaneAfterFinish(next.lane);
  pullNextInLine(session);
  await writeStore(replaceSession(store, session));
  return getNextInLine(session);
}

export async function resetQueue(): Promise<{ cleared: number; preserved: number }> {
  const store = await readStore();
  const session = getSession(store);
  const cleared = session.queue.length;
  session.queue = [];
  await writeStore(replaceSession(store, session));
  return { cleared, preserved: 0 };
}

export async function getEntry(id: string): Promise<QueueEntry | null> {
  const state = await getRadioQueueState();
  return [...state.queue, ...state.history, ...(state.removed ?? [])].find((entry) => entry.id === id) ?? null;
}

export async function upgradeEntryTier(id: string, newTier: QueueTier, additionalAmount: number): Promise<QueueEntry | null> {
  const store = await readStore();
  const session = getSession(store);
  const index = session.queue.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const updated = { ...session.queue[index], tier: newTier, amount: session.queue[index].amount + additionalAmount, lane: newTier === "fastlane" ? "priority" as QueueLane : session.queue[index].lane };
  session.queue[index] = updated;
  await writeStore(replaceSession(store, session));
  return updated;
}

const stripeSessions = new Map<string, string>();
export async function storeStripeSession(sessionId: string, entryId: string): Promise<void> { stripeSessions.set(sessionId, entryId); }
export async function getStripeSessionEntry(sessionId: string): Promise<string | null> { return stripeSessions.get(sessionId) ?? null; }
