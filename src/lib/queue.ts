// ============================================================
// BARCODE RADIO QUEUE OPERATIONS — session-based Redis + memory
// ============================================================

import { Redis } from "@upstash/redis";
import {
  INTERNAL_BUFFER_DURATION_SECONDS,
  RADIO_QUEUE_CAPACITY,
  detectQueueSourceType,
  formatRuntime,
  generateQueueId,
  getTrackRuntimeSeconds,
  normalizeTier,
} from "./queue-types";
import type {
  QueueDurationSource,
  QueueEntry,
  QueueLane,
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

type QueueAdminAction = "finish" | "remove" | "priority" | "spotlight" | "removeSpotlight" | "restoreRegular" | "restorePriority";

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

function defaultSession(date = todayDate()): QueueSession {
  const now = new Date().toISOString();
  return normalizeSession({
    sessionId: makeSessionId(),
    title: `BARCODE Radio — ${date}`,
    status: "prepared",
    showDate: date,
    createdAt: now,
    updatedAt: now,
    queueOpen: false,
    description: sessionDescriptionFor(date),
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
    publicStatus: { isOpen: false, activeCount: 0, estimatedRuntimeSeconds: 0, capacity: RADIO_QUEUE_CAPACITY, pressure: "low" },
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

function publicStatusForSession(session: Pick<QueueSession, "queue" | "queueOpen">): QueuePublicStatus {
  const active = session.queue.filter((entry) => entry.status === "queued" || entry.status === "playing");
  const estimatedRuntimeSeconds = active.reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0);
  const load = active.length / RADIO_QUEUE_CAPACITY;
  return {
    isOpen: session.queueOpen,
    activeCount: active.length,
    estimatedRuntimeSeconds,
    capacity: RADIO_QUEUE_CAPACITY,
    pressure: load >= 1 ? "max" : load >= 0.75 ? "high" : load >= 0.4 ? "medium" : "low",
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
    activeCount: publicStatus.activeCount,
    completedCount: session.completed.length,
    removedCount: session.removed.length,
    spotlightCount: session.spotlight.length,
    estimatedActiveRuntimeSeconds: publicStatus.estimatedRuntimeSeconds,
    completedRuntimeSeconds: session.completed.reduce((sum, entry) => sum + getTrackRuntimeSeconds(entry), 0),
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
    queueOpen: status === "open" ? true : false,
    queue: sortActive((raw.queue ?? []).map(normalizeEntry)),
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
  return { detectedArtistName: null, detectedSongTitle: null, providerTitle: null, detectedDurationSeconds: null, durationSource: source };
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
  return { detectedArtistName: channelTitle, detectedSongTitle: providerTitle, providerTitle, detectedDurationSeconds: duration, durationSource: duration ? "youtube" : "internal_estimate" };
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
  return { detectedArtistName: artist || null, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "spotify" : "internal_estimate" };
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
  return { detectedArtistName: artist, detectedSongTitle: title, providerTitle: title, detectedDurationSeconds: seconds, durationSource: seconds ? "soundcloud" : "internal_estimate" };
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

export async function createQueueTrack(input: {
  artist: string;
  title: string;
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
  const providerMetadata = sourceType === "upload" ? blankProvider() : await detectProviderMetadata(sourceType, input.link ?? "");
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
    submittedArtistName,
    submittedSongTitle,
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
  const track = await createQueueTrack(input);
  session.queue.push(track);
  await writeStore(replaceSession(store, session));
  return track;
}

function queueStateFromSession(session: QueueSession, store: QueueStore, viewedSessionId = session.sessionId): QueueState {
  const normalized = normalizeSession(session);
  return {
    nowPlaying: normalized.queue.find((entry) => entry.status === "playing") ?? null,
    queue: normalized.queue,
    history: normalized.completed,
    totalPlayed: normalized.completed.length,
    streamStatus: normalized.status === "open" && normalized.queueOpen ? "online" : "offline",
    removed: normalized.removed,
    spotlight: normalized.spotlight,
    publicStatus: normalized.publicStatus,
    session: summarizeSession(normalized),
    sessions: store.sessions.map(summarizeSession).sort((a, b) => b.showDate.localeCompare(a.showDate) || b.createdAt.localeCompare(a.createdAt)),
    viewedSessionId,
    readOnly: normalized.status === "archived" || normalized.sessionId !== store.activeSessionId,
  };
}

export async function getRadioQueueState(sessionId?: string): Promise<QueueState> {
  const store = await readStore();
  return queueStateFromSession(getSession(store, sessionId), store, sessionId ?? store.activeSessionId);
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
  };
}

export async function getPublicQueueSnapshot(sessionId?: string): Promise<QueuePublicSnapshot> {
  const store = await readStore();
  const session = getSession(store, sessionId);
  return { session: summarizeSession(session), status: session.publicStatus, queue: session.queue.map(toPublicQueueTrack), completed: session.completed.slice(0, 10).map(toPublicQueueTrack) };
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

export async function startNewQueueSession(): Promise<QueueState> {
  const store = await readStore();
  const preserved = store.sessions.map((session) => session.sessionId === store.activeSessionId && session.status !== "archived" ? normalizeSession({ ...session, status: "closed", queueOpen: false, updatedAt: new Date().toISOString() }) : session);
  const next = defaultSession();
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

  if (action === "spotlight") {
    const source = active ?? session.completed.find((entry) => entry.id === id) ?? session.removed.find((entry) => entry.id === id);
    if (source && !session.spotlight.some((entry) => entry.id === source.id)) session.spotlight.push({ ...source, spotlightedAt: new Date().toISOString() });
    await writeStore(replaceSession(store, session));
    return getRadioQueueState();
  }

  if (!active) return getRadioQueueState();
  if (action === "priority") {
    session.queue.splice(index, 1);
    session.queue.push({ ...active, lane: "priority", tier: "fastlane", status: "queued" });
  }
  if (action === "finish") {
    session.queue.splice(index, 1);
    session.completed.unshift({ ...active, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  }
  if (action === "remove") {
    session.queue.splice(index, 1);
    session.removed.unshift({ ...active, status: "removed", removedAt: new Date().toISOString() });
  }
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
  const queue = sortActive(session.queue);
  const next = queue[0] ?? null;
  if (!next) return null;
  session.queue = queue.slice(1);
  session.completed.unshift({ ...next, status: "played", playedAt: new Date().toISOString(), completedAt: new Date().toISOString() });
  await writeStore(replaceSession(store, session));
  return queue[1] ?? null;
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
