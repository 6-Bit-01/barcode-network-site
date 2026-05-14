import { Redis } from "@upstash/redis";
import { getRadioQueueState, isWheelEligibleTrack, updateRadioTrack } from "./queue";
import { getTrackArtworkUrl, getTrackDurationLabel } from "./queue-types";
import { derangedWheelCandidateOrder, orderedWheelCandidateIds, resolveLiveOverlayScene, safeLiveOverlayUrl } from "./live-overlay-resolver";
import { parseYouTubeVideoId } from "./track-duration";
import type { QueueEntry, QueueSourceType } from "./queue-types";
import type { LiveOverlayPlaybackState, LiveOverlayStateInput, LiveOverlayYouTubeSync, OverlayMode, ResolvedLiveOverlayScene, ResolvedWheelCeremonyTrack, WheelCeremonyStatus, WheelOverlayStatus } from "./live-overlay-resolver";

export type { LiveOverlayPlaybackState, LiveOverlayYouTubeSync, OverlayMode, ResolvedLiveOverlayScene, ResolvedWheelCeremonyTrack, WheelCeremonyStatus, WheelOverlayStatus } from "./live-overlay-resolver";

export interface LiveOverlayState extends LiveOverlayStateInput {
  mode: OverlayMode;
  title?: string;
  subtitle?: string;
  message?: string;
  trackId?: string;
  artistName?: string;
  trackTitle?: string;
  artworkUrl?: string | null;
  sourceUrl?: string | null;
  sourceType?: QueueSourceType | "unknown";
  durationLabel?: string;
  sponsorLabel?: string;
  videoUrl?: string;
  systemMessageActive?: boolean;
  systemMessageTitle?: string;
  systemMessage?: string;
  videoPlaceholderActive?: boolean;
  wheelOverlayActive?: boolean;
  wheelOverlayLaunchedAt?: string;
  wheelOverlayStatus?: WheelOverlayStatus;
  wheelCeremonyStatus?: WheelCeremonyStatus;
  wheelCeremonyStartedAt?: string;
  wheelCeremonySpinStartedAt?: string;
  wheelCeremonyResultTrackId?: string;
  wheelCeremonyChosenTrackId?: string;
  wheelCeremonyResultSelectedAt?: string;
  wheelCeremonySeed?: string;
  wheelCeremonyPreviousSeed?: string;
  wheelCeremonyCandidateOrder?: string[];
  wheelCeremonyPreviousCandidateOrder?: string[];
  wheelCeremonyReencryptNonce?: string;
  wheelCeremonyReencryptCycleId?: string;
  wheelCeremonyJingleKey?: string;
  wheelCeremonySpinDurationMs?: number;
  wheelCeremonyAudioPath?: string;
  updatedAt: string;
}

export interface LiveOverlayPayload {
  action?: "launchWheel" | "spinWheel" | "reencryptWheel" | "confirmWheel" | "wheelWinnerNotHere" | "cancelWheel" | "clearWheel" | "setSystemMessage" | "clearSystemMessage" | "launchVideoPlaceholder" | "clearVideoPlaceholder" | "clearAllOverrides" | "updatePlayerSync" | "clearPlayerSync";
  selectedTrackId?: unknown;
  mode?: OverlayMode;
  title?: unknown;
  subtitle?: unknown;
  message?: unknown;
  artistName?: unknown;
  trackTitle?: unknown;
  artworkUrl?: unknown;
  sourceUrl?: unknown;
  sponsorLabel?: unknown;
  videoUrl?: unknown;
  sync?: unknown;
}

export interface LiveOverlayAdminSnapshot {
  overlayState: LiveOverlayState;
  scene: ResolvedLiveOverlayScene;
  playerSync: LiveOverlayYouTubeSync | null;
  wheelCandidates: ResolvedWheelCeremonyTrack[];
}

const OVERLAY_STATE_KEY = "barcode:live-overlay:state";
const PLAYER_SYNC_KEY = "barcode:live-overlay:player-sync";
const MAX_TEXT_LENGTH = 180;
const WHEEL_AUDIO_FILES = [
  "/audio/wheel/142.mp3",
  "/audio/wheel/77.mp3",
  "/audio/wheel/150.mp3",
  "/audio/wheel/49.mp3",
  "/audio/wheel/103.mp3",
  "/audio/wheel/56.mp3",
  "/audio/wheel/58.mp3",
  "/audio/wheel/84.mp3",
  "/audio/wheel/147.mp3",
  "/audio/wheel/102.mp3",
  "/audio/wheel/92.mp3",
  "/audio/wheel/76.mp3",
  "/audio/wheel/111.mp3",
  "/audio/wheel/74.mp3",
  "/audio/wheel/139.mp3",
  "/audio/wheel/110.mp3",
  "/audio/wheel/126.mp3",
  "/audio/wheel/148.mp3",
  "/audio/wheel/162.mp3",
  "/audio/wheel/104.mp3",
  "/audio/wheel/32%20(1).mp3",
  "/audio/wheel/140.mp3",
  "/audio/wheel/81.mp3",
  "/audio/wheel/75.mp3",
  "/audio/wheel/129.mp3",
  "/audio/wheel/78.mp3",
  "/audio/wheel/36.mp3",
  "/audio/wheel/154.mp3",
  "/audio/wheel/24.mp3",
  "/audio/wheel/41.mp3",
  "/audio/wheel/130.mp3",
  "/audio/wheel/70.mp3",
];

let memoryOverlayState: LiveOverlayState = defaultLiveOverlayState();
let memoryPlayerSync: LiveOverlayYouTubeSync | null = null;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export function defaultLiveOverlayState(): LiveOverlayState {
  return {
    mode: "standby",
    title: "BARCODE RADIO",
    subtitle: "RECEIVER STANDBY",
    message: "Standing by for the next transmission.",
    artworkUrl: null,
    sourceUrl: null,
    systemMessageActive: false,
    videoPlaceholderActive: false,
    wheelOverlayActive: false,
    wheelOverlayStatus: "ready",
    wheelCeremonyStatus: "idle",
    wheelCeremonyJingleKey: "silent",
    updatedAt: new Date().toISOString(),
  };
}

function cleanText(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  return cleaned || fallback;
}

function safeArtworkUrl(value: unknown): string | null {
  return safeLiveOverlayUrl(value) ?? null;
}

function displayArtist(entry: QueueEntry): string {
  return entry.detectedArtistName?.trim() || entry.submittedArtistName?.trim() || entry.artist;
}

function displayTitle(entry: QueueEntry): string {
  return entry.detectedSongTitle?.trim() || entry.submittedSongTitle?.trim() || entry.title;
}

function overlayTrackInput(entry: QueueEntry) {
  return {
    id: entry.id,
    artist: displayArtist(entry),
    title: displayTitle(entry),
    submittedArtistName: entry.submittedArtistName,
    submittedSongTitle: entry.submittedSongTitle,
    detectedArtistName: entry.detectedArtistName,
    detectedSongTitle: entry.detectedSongTitle,
    sourceType: (entry.sourceType ?? "unknown") as QueueSourceType | "unknown",
    sourceArtworkUrl: getTrackArtworkUrl(entry),
    link: entry.link,
    durationLabel: getTrackDurationLabel(entry),
    youtubeVideoId: entry.sourceType === "youtube" ? parseYouTubeVideoId(entry.link) : null,
  };
}


function wheelCandidateFromEntry(entry: QueueEntry): ResolvedWheelCeremonyTrack {
  return { id: entry.id, artistName: displayArtist(entry), trackTitle: displayTitle(entry), trackIds: [entry.id], trackCount: 1 };
}

function normalizePersonIdentity(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function hashWheelIdentity(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function submitterIdentityKeys(entry: QueueEntry): string[] {
  const identityEntry = entry as QueueEntry & { submitterId?: string | null; accountId?: string | null };
  const normalizedHandle = (entry.normalizedTikTokHandle ?? entry.tiktokHandle)?.trim().toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_.]+/g, "");
  const normalizedEmail = entry.contactEmail?.trim().toLowerCase();
  const normalizedName = normalizePersonIdentity(entry.submitterArtistName ?? entry.submittedArtistName ?? entry.artist);
  const keys = [
    entry.submitterToken ? `token:${entry.submitterToken.trim()}` : null,
    identityEntry.submitterId ? `submitter:${identityEntry.submitterId.trim()}` : null,
    identityEntry.accountId ? `account:${identityEntry.accountId.trim()}` : null,
    normalizedHandle ? `handle:${normalizedHandle}` : null,
    normalizedEmail ? `email:${normalizedEmail}` : null,
    normalizedName ? `artist:${normalizedName}` : null,
  ].filter((key): key is string => Boolean(key));
  return keys.length > 0 ? keys : [`track:${entry.id}`];
}

export function getWheelCandidatesFromQueue(queue: QueueEntry[]): ResolvedWheelCeremonyTrack[] {
  const groups: ResolvedWheelCeremonyTrack[] = [];
  const groupByKey = new Map<string, ResolvedWheelCeremonyTrack>();

  for (const entry of queue.filter(isWheelEligibleTrack)) {
    const track = wheelCandidateFromEntry(entry);
    const keys = submitterIdentityKeys(entry);
    const existing = keys.map((key) => groupByKey.get(key)).find((group): group is ResolvedWheelCeremonyTrack => Boolean(group));
    if (existing) {
      existing.tracks = [...(existing.tracks ?? []), track];
      existing.trackIds = [...(existing.trackIds ?? []), entry.id];
      existing.trackCount = existing.trackIds.length;
      existing.trackTitle = `${existing.trackCount} eligible tracks`;
      keys.forEach((key) => groupByKey.set(key, existing));
      continue;
    }

    const group: ResolvedWheelCeremonyTrack = {
      id: `person:${hashWheelIdentity(keys.join("|"))}`,
      artistName: displayArtist(entry),
      trackTitle: displayTitle(entry),
      trackIds: [entry.id],
      trackCount: 1,
      tracks: [track],
    };
    groups.push(group);
    keys.forEach((key) => groupByKey.set(key, group));
  }

  return groups.map((group) => ({ ...group, trackTitle: (group.trackCount ?? 1) > 1 ? `${group.trackCount} eligible tracks` : group.trackTitle }));
}

function randomSeed(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function randomSpinDurationMs(): number {
  return 16_000 + Math.floor(Math.random() * 16_001);
}

function randomWheelAudioPath(): string {
  return WHEEL_AUDIO_FILES[Math.floor(Math.random() * WHEEL_AUDIO_FILES.length)] ?? WHEEL_AUDIO_FILES[0];
}

function normalizeSpinDurationMs(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(16_000, Math.min(32_000, Math.round(value)));
}

function pickRandomCandidate(candidates: ResolvedWheelCeremonyTrack[], excludeId?: string): ResolvedWheelCeremonyTrack | null {
  const pool = excludeId && candidates.length > 1 ? candidates.filter((candidate) => candidate.id !== excludeId) : candidates;
  if (pool.length === 0) return null;
  const index = Math.floor(Math.random() * pool.length);
  return pool[Math.max(0, Math.min(pool.length - 1, index))] ?? null;
}

function effectiveWheelCeremonyStatus(state: LiveOverlayState, nowMs: number): WheelCeremonyStatus {
  const status = normalizeWheelCeremonyStatus(state.wheelCeremonyStatus);
  if (status !== "reencrypting" && status !== "spinning") return status;
  const startedMs = typeof state.wheelCeremonySpinStartedAt === "string" ? new Date(state.wheelCeremonySpinStartedAt).getTime() : nowMs;
  if (!Number.isFinite(startedMs)) return status;
  const elapsedMs = nowMs - startedMs;
  if (status === "reencrypting") return elapsedMs >= 2200 ? "ready" : "reencrypting";
  return elapsedMs >= (normalizeSpinDurationMs(state.wheelCeremonySpinDurationMs) ?? 24_000) ? "result_pending" : "spinning";
}

function findTrackInWinnerGroup(group: ResolvedWheelCeremonyTrack, selectedTrackId?: string): ResolvedWheelCeremonyTrack | null {
  const tracks = group.tracks ?? [];
  if (selectedTrackId) return tracks.find((track) => track.id === selectedTrackId) ?? null;
  return tracks.length === 1 ? tracks[0] ?? null : null;
}


function normalizeMode(value: unknown): OverlayMode {
  const modes: OverlayMode[] = ["standby", "now_playing", "artist_card", "wheel_ready", "wheel_reencrypting", "wheel_spinning", "wheel_result", "wheel_confirmed", "sponsor", "video_placeholder", "system_message", "session_active"];
  return modes.includes(value as OverlayMode) ? value as OverlayMode : "standby";
}

function normalizeSourceType(value: unknown): LiveOverlayState["sourceType"] {
  const sources: LiveOverlayState["sourceType"][] = ["upload", "link", "youtube", "soundcloud", "spotify", "other", "unknown"];
  return sources.includes(value as LiveOverlayState["sourceType"]) ? value as LiveOverlayState["sourceType"] : "unknown";
}

function normalizeWheelStatus(value: unknown): WheelOverlayStatus {
  return value === "intro" || value === "active" || value === "complete" || value === "ready" ? value : "ready";
}

function normalizeWheelCeremonyStatus(value: unknown): WheelCeremonyStatus {
  return value === "ready" || value === "reencrypting" || value === "spinning" || value === "result_pending" || value === "confirmed" || value === "cancelled" || value === "signal_lost" || value === "idle" ? value : "idle";
}


function normalizePlaybackState(value: unknown): LiveOverlayPlaybackState {
  return value === "paused" || value === "stopped" || value === "playing" ? value : "stopped";
}

function normalizePlayerSync(input: unknown): LiveOverlayYouTubeSync | null {
  const raw = input as Partial<LiveOverlayYouTubeSync> | null;
  if (!raw || typeof raw !== "object" || raw.provider !== "youtube") return null;
  const videoId = typeof raw.videoId === "string" && parseYouTubeVideoId(`https://www.youtube.com/watch?v=${raw.videoId}`) ? raw.videoId : null;
  if (!videoId) return null;
  const currentTimeSeconds = typeof raw.currentTimeSeconds === "number" && Number.isFinite(raw.currentTimeSeconds) ? Math.max(0, raw.currentTimeSeconds) : 0;
  return {
    provider: "youtube",
    videoId,
    trackId: cleanText(raw.trackId),
    playbackState: normalizePlaybackState(raw.playbackState),
    currentTimeSeconds,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    muted: true,
  };
}

export function youtubeSyncFromTrack(entry: QueueEntry, playbackState: LiveOverlayPlaybackState = "playing", currentTimeSeconds = 0): LiveOverlayYouTubeSync | null {
  if (entry.sourceType !== "youtube") return null;
  const safeLink = safeLiveOverlayUrl(entry.link);
  const videoId = safeLink ? parseYouTubeVideoId(safeLink) : null;
  if (!videoId) return null;
  return { provider: "youtube", videoId, trackId: entry.id, playbackState, currentTimeSeconds: Math.max(0, currentTimeSeconds), updatedAt: new Date().toISOString(), muted: true };
}

function normalizeState(input: unknown): LiveOverlayState {
  const raw = input as Partial<LiveOverlayState> | null;
  if (!raw || typeof raw !== "object") return defaultLiveOverlayState();
  return {
    mode: normalizeMode(raw.mode),
    title: cleanText(raw.title),
    subtitle: cleanText(raw.subtitle),
    message: cleanText(raw.message),
    trackId: cleanText(raw.trackId),
    artistName: cleanText(raw.artistName),
    trackTitle: cleanText(raw.trackTitle),
    artworkUrl: safeArtworkUrl(raw.artworkUrl),
    sourceUrl: safeLiveOverlayUrl(raw.sourceUrl) ?? null,
    sourceType: normalizeSourceType(raw.sourceType),
    durationLabel: cleanText(raw.durationLabel),
    sponsorLabel: cleanText(raw.sponsorLabel),
    videoUrl: safeLiveOverlayUrl(raw.videoUrl),
    systemMessageActive: raw.systemMessageActive === true,
    systemMessageTitle: cleanText(raw.systemMessageTitle),
    systemMessage: cleanText(raw.systemMessage),
    videoPlaceholderActive: raw.videoPlaceholderActive === true,
    wheelOverlayActive: raw.wheelOverlayActive === true || raw.mode === "wheel_ready" || raw.mode === "wheel_reencrypting" || raw.mode === "wheel_spinning" || raw.mode === "wheel_result" || raw.mode === "wheel_confirmed",
    wheelOverlayLaunchedAt: typeof raw.wheelOverlayLaunchedAt === "string" ? raw.wheelOverlayLaunchedAt : undefined,
    wheelOverlayStatus: normalizeWheelStatus(raw.wheelOverlayStatus),
    wheelCeremonyStatus: normalizeWheelCeremonyStatus(raw.wheelCeremonyStatus ?? (raw.wheelOverlayActive ? "ready" : "idle")),
    wheelCeremonyStartedAt: typeof raw.wheelCeremonyStartedAt === "string" ? raw.wheelCeremonyStartedAt : undefined,
    wheelCeremonySpinStartedAt: typeof raw.wheelCeremonySpinStartedAt === "string" ? raw.wheelCeremonySpinStartedAt : undefined,
    wheelCeremonyResultTrackId: cleanText(raw.wheelCeremonyResultTrackId),
    wheelCeremonyChosenTrackId: cleanText(raw.wheelCeremonyChosenTrackId),
    wheelCeremonyResultSelectedAt: typeof raw.wheelCeremonyResultSelectedAt === "string" ? raw.wheelCeremonyResultSelectedAt : undefined,
    wheelCeremonySeed: cleanText(raw.wheelCeremonySeed),
    wheelCeremonyPreviousSeed: cleanText(raw.wheelCeremonyPreviousSeed),
    wheelCeremonyCandidateOrder: Array.isArray(raw.wheelCeremonyCandidateOrder) ? raw.wheelCeremonyCandidateOrder.map((entry) => cleanText(entry)).filter((entry): entry is string => Boolean(entry)) : undefined,
    wheelCeremonyPreviousCandidateOrder: Array.isArray(raw.wheelCeremonyPreviousCandidateOrder) ? raw.wheelCeremonyPreviousCandidateOrder.map((entry) => cleanText(entry)).filter((entry): entry is string => Boolean(entry)) : undefined,
    wheelCeremonyReencryptNonce: cleanText(raw.wheelCeremonyReencryptNonce),
    wheelCeremonyReencryptCycleId: cleanText(raw.wheelCeremonyReencryptCycleId),
    wheelCeremonyJingleKey: cleanText(raw.wheelCeremonyJingleKey, "silent"),
    wheelCeremonySpinDurationMs: normalizeSpinDurationMs(raw.wheelCeremonySpinDurationMs),
    wheelCeremonyAudioPath: cleanText(raw.wheelCeremonyAudioPath),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

async function writeLiveOverlayState(state: LiveOverlayState): Promise<LiveOverlayState> {
  const normalized = normalizeState(state);
  const redis = getRedis();
  if (redis) await redis.set(OVERLAY_STATE_KEY, JSON.stringify(normalized));
  memoryOverlayState = normalized;
  return normalized;
}

export async function getLiveOverlayPlayerSync(): Promise<LiveOverlayYouTubeSync | null> {
  const redis = getRedis();
  if (!redis) return normalizePlayerSync(memoryPlayerSync);
  const raw = await redis.get<LiveOverlayYouTubeSync | string>(PLAYER_SYNC_KEY);
  if (!raw) return null;
  try {
    return normalizePlayerSync(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

export async function setLiveOverlayPlayerSync(sync: LiveOverlayYouTubeSync | null): Promise<LiveOverlayYouTubeSync | null> {
  const normalized = normalizePlayerSync(sync);
  const redis = getRedis();
  if (redis) {
    if (normalized) await redis.set(PLAYER_SYNC_KEY, JSON.stringify(normalized));
    else await redis.del(PLAYER_SYNC_KEY);
  }
  memoryPlayerSync = normalized;
  return normalized;
}

export async function getStoredLiveOverlayState(): Promise<LiveOverlayState> {
  const redis = getRedis();
  if (!redis) return normalizeState(memoryOverlayState);
  const raw = await redis.get<LiveOverlayState | string>(OVERLAY_STATE_KEY);
  if (!raw) return defaultLiveOverlayState();
  try {
    return normalizeState(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return defaultLiveOverlayState();
  }
}

export async function getResolvedLiveOverlayScene(): Promise<ResolvedLiveOverlayScene> {
  const [overlayState, queueState, playerSync] = await Promise.all([getStoredLiveOverlayState(), getRadioQueueState(), getLiveOverlayPlayerSync()]);
  const wheelCandidates = getWheelCandidatesFromQueue(queueState.queue);
  const session = queueState.session ?? null;
  return resolveLiveOverlayScene({
    overlayState,
    currentSession: session ? {
      sessionId: session.sessionId,
      title: session.title,
      status: session.status,
      queueOpen: session.queueOpen,
      broadcastPhase: session.broadcastPhase,
      wheelSpinsOwed: session.wheelSpinsOwed ?? 0,
      sponsorBreakStatus: session.sponsorBreakStatus,
    } : null,
    nowPlaying: queueState.nowPlaying ? overlayTrackInput(queueState.nowPlaying) : null,
    upNext: queueState.nextInLine ? overlayTrackInput(queueState.nextInLine) : null,
    playerSync,
    wheelCandidates,
    wheelSpinsOwed: session?.wheelSpinsOwed ?? 0,
    sponsorBreakStatus: session?.sponsorBreakStatus,
    broadcastPhase: session?.broadcastPhase,
    queueOpen: session?.queueOpen,
  });
}

export async function getLiveOverlayAdminSnapshot(): Promise<LiveOverlayAdminSnapshot> {
  const [overlayState, scene, playerSync, queueState] = await Promise.all([getStoredLiveOverlayState(), getResolvedLiveOverlayScene(), getLiveOverlayPlayerSync(), getRadioQueueState()]);
  return { overlayState, scene, playerSync, wheelCandidates: getWheelCandidatesFromQueue(queueState.queue) };
}

export async function setLiveOverlayState(payload: LiveOverlayPayload): Promise<LiveOverlayAdminSnapshot> {
  const current = await getStoredLiveOverlayState();
  const now = new Date().toISOString();
  let next: LiveOverlayState = { ...current, updatedAt: now };

  if (payload.action === "launchWheel") {
    const queueState = await getRadioQueueState();
    const wheelSpinsOwed = queueState.session?.wheelSpinsOwed ?? 0;
    const candidates = getWheelCandidatesFromQueue(queueState.queue);
    const launchSeed = randomSeed();
    if (wheelSpinsOwed <= 0) throw new Error("No wheel spins are owed.");
    next = {
      ...current,
      mode: "wheel_ready",
      wheelOverlayActive: true,
      wheelOverlayLaunchedAt: now,
      wheelOverlayStatus: "ready",
      wheelCeremonyStatus: "ready",
      wheelCeremonyStartedAt: now,
      wheelCeremonySpinStartedAt: undefined,
      wheelCeremonyResultTrackId: undefined,
      wheelCeremonyChosenTrackId: undefined,
      wheelCeremonyResultSelectedAt: undefined,
      wheelCeremonySeed: launchSeed,
      wheelCeremonyPreviousSeed: undefined,
      wheelCeremonyCandidateOrder: orderedWheelCandidateIds(candidates, undefined, launchSeed),
      wheelCeremonyPreviousCandidateOrder: undefined,
      wheelCeremonyReencryptNonce: undefined,
      wheelCeremonyReencryptCycleId: undefined,
      wheelCeremonyJingleKey: "silent",
      wheelCeremonySpinDurationMs: undefined,
      wheelCeremonyAudioPath: undefined,
      updatedAt: now,
    };
  } else if (payload.action === "spinWheel" || payload.action === "reencryptWheel") {
    const currentStatus = effectiveWheelCeremonyStatus(current, new Date(now).getTime());
    if (payload.action === "spinWheel" && currentStatus !== "ready" && currentStatus !== "signal_lost") throw new Error("Launch the wheel before spinning.");
    if (payload.action === "reencryptWheel" && ((currentStatus !== "ready" && currentStatus !== "reencrypting") || current.wheelCeremonyResultTrackId)) throw new Error("Re-encryption is only available before the wheel spin.");
    const queueState = await getRadioQueueState();
    if ((queueState.session?.wheelSpinsOwed ?? 0) <= 0) throw new Error("No wheel spins are owed.");
    const candidates = getWheelCandidatesFromQueue(queueState.queue);
    if (candidates.length === 0) throw new Error("No eligible Wheel Chosen candidates are available.");
    const reencrypting = payload.action === "reencryptWheel";
    const nonce = reencrypting ? randomSeed() : undefined;
    const previousOrder = orderedWheelCandidateIds(candidates, current.wheelCeremonyCandidateOrder, current.wheelCeremonySeed);
    const candidateOrder = reencrypting ? derangedWheelCandidateOrder(candidates, previousOrder, nonce) : previousOrder;
    const selected = reencrypting ? null : pickRandomCandidate(candidates);
    if (!reencrypting && !selected) throw new Error("No eligible Wheel Chosen candidates are available.");
    next = {
      ...current,
      mode: reencrypting ? "wheel_reencrypting" : "wheel_spinning",
      wheelOverlayActive: true,
      wheelOverlayStatus: "active",
      wheelCeremonyStatus: reencrypting ? "reencrypting" : "spinning",
      wheelCeremonySpinStartedAt: now,
      wheelCeremonyResultTrackId: selected?.id,
      wheelCeremonyChosenTrackId: undefined,
      wheelCeremonyResultSelectedAt: selected ? now : undefined,
      wheelCeremonySeed: randomSeed(),
      wheelCeremonyPreviousSeed: reencrypting ? current.wheelCeremonySeed : undefined,
      wheelCeremonyCandidateOrder: candidateOrder,
      wheelCeremonyPreviousCandidateOrder: reencrypting ? previousOrder : undefined,
      wheelCeremonyReencryptNonce: nonce,
      wheelCeremonyReencryptCycleId: nonce,
      wheelCeremonyJingleKey: "silent",
      wheelCeremonySpinDurationMs: reencrypting ? undefined : randomSpinDurationMs(),
      wheelCeremonyAudioPath: reencrypting ? undefined : randomWheelAudioPath(),
      artistName: selected?.artistName,
      trackTitle: selected?.trackTitle,
      updatedAt: now,
    };
  } else if (payload.action === "wheelWinnerNotHere") {
    const resultTrackId = cleanText(current.wheelCeremonyResultTrackId);
    if (!resultTrackId) throw new Error("No wheel result is ready to remove.");
    const currentStatus = effectiveWheelCeremonyStatus(current, new Date(now).getTime());
    if (currentStatus !== "result_pending") throw new Error("Winner Not Here is only available for a pending wheel result.");
    const queueState = await getRadioQueueState();
    const selected = getWheelCandidatesFromQueue(queueState.queue).find((candidate) => candidate.id === resultTrackId);
    if (!selected) throw new Error("The selected wheel result is no longer removable from the active queue.");
    const trackIdsToRemove = selected.trackIds?.length ? selected.trackIds : [resultTrackId];
    for (const trackId of trackIdsToRemove) await updateRadioTrack(trackId, "remove");
    next = {
      ...current,
      mode: "wheel_ready",
      wheelOverlayActive: true,
      wheelOverlayStatus: "ready",
      wheelCeremonyStatus: "ready",
      wheelCeremonySpinStartedAt: undefined,
      wheelCeremonyResultTrackId: undefined,
      wheelCeremonyChosenTrackId: undefined,
      wheelCeremonyResultSelectedAt: now,
      wheelCeremonySeed: randomSeed(),
      wheelCeremonyPreviousSeed: undefined,
      wheelCeremonyCandidateOrder: undefined,
      wheelCeremonyPreviousCandidateOrder: undefined,
      wheelCeremonyReencryptNonce: undefined,
      wheelCeremonyReencryptCycleId: undefined,
      wheelCeremonyJingleKey: "silent",
      wheelCeremonySpinDurationMs: undefined,
      wheelCeremonyAudioPath: undefined,
      artistName: undefined,
      trackTitle: undefined,
      updatedAt: now,
    };
  } else if (payload.action === "confirmWheel") {
    const currentStatus = effectiveWheelCeremonyStatus(current, new Date(now).getTime());
    if (currentStatus !== "result_pending") throw new Error("Wheel result is not ready to confirm yet.");
    const resultTrackId = cleanText(current.wheelCeremonyResultTrackId);
    if (!resultTrackId) throw new Error("No wheel result is ready to confirm.");
    const queueState = await getRadioQueueState();
    const candidates = getWheelCandidatesFromQueue(queueState.queue);
    const winnerGroup = candidates.find((candidate) => candidate.id === resultTrackId);
    if (!winnerGroup) throw new Error("The selected wheel result is no longer eligible. Reroll or cancel the ceremony.");
    const selectedTrackId = cleanText(payload.selectedTrackId) ?? cleanText(current.wheelCeremonyChosenTrackId);
    const selected = findTrackInWinnerGroup(winnerGroup, selectedTrackId);
    if (!selected) throw new Error("Choose one eligible track from the winning artist before confirming Wheel Chosen.");
    await updateRadioTrack(selected.id, "wheel");
    next = {
      ...current,
      mode: "wheel_confirmed",
      wheelOverlayActive: true,
      wheelOverlayStatus: "complete",
      wheelCeremonyStatus: "confirmed",
      wheelCeremonyChosenTrackId: selected.id,
      wheelCeremonyResultSelectedAt: now,
      artistName: winnerGroup.artistName,
      trackTitle: selected.trackTitle,
      updatedAt: now,
    };
  } else if (payload.action === "cancelWheel" || payload.action === "clearWheel") {
    next = {
      ...current,
      mode: "standby",
      wheelOverlayActive: false,
      wheelOverlayLaunchedAt: undefined,
      wheelOverlayStatus: "ready",
      wheelCeremonyStatus: payload.action === "cancelWheel" ? "cancelled" : "idle",
      wheelCeremonyStartedAt: undefined,
      wheelCeremonySpinStartedAt: undefined,
      wheelCeremonyResultTrackId: undefined,
      wheelCeremonyChosenTrackId: undefined,
      wheelCeremonyResultSelectedAt: undefined,
      wheelCeremonySeed: undefined,
      wheelCeremonyPreviousSeed: undefined,
      wheelCeremonyCandidateOrder: undefined,
      wheelCeremonyPreviousCandidateOrder: undefined,
      wheelCeremonyReencryptNonce: undefined,
      wheelCeremonyReencryptCycleId: undefined,
      wheelCeremonyJingleKey: "silent",
      wheelCeremonySpinDurationMs: undefined,
      wheelCeremonyAudioPath: undefined,
      artistName: undefined,
      trackTitle: undefined,
      updatedAt: now,
    };
  } else if (payload.action === "setSystemMessage") {
    next = { ...current, mode: "system_message", systemMessageActive: true, systemMessageTitle: cleanText(payload.title, "BARCODE SYSTEM MESSAGE"), systemMessage: cleanText(payload.message, "Stand by."), updatedAt: now };
  } else if (payload.action === "clearSystemMessage") {
    next = { ...current, mode: "standby", systemMessageActive: false, systemMessageTitle: undefined, systemMessage: undefined, updatedAt: now };
  } else if (payload.action === "launchVideoPlaceholder") {
    next = { ...current, mode: "video_placeholder", videoPlaceholderActive: true, title: cleanText(payload.title, "VIDEO RECEIVER READY"), message: cleanText(payload.message, "Video link pending. Playback is not enabled in this foundation scene."), videoUrl: safeLiveOverlayUrl(payload.videoUrl), updatedAt: now };
  } else if (payload.action === "clearVideoPlaceholder") {
    next = { ...current, mode: "standby", videoPlaceholderActive: false, videoUrl: undefined, updatedAt: now };
  } else if (payload.action === "clearAllOverrides") {
    next = { ...defaultLiveOverlayState(), updatedAt: now };
  } else if (payload.action === "updatePlayerSync") {
    await setLiveOverlayPlayerSync(normalizePlayerSync(payload.sync));
    return getLiveOverlayAdminSnapshot();
  } else if (payload.action === "clearPlayerSync") {
    await setLiveOverlayPlayerSync(null);
    return getLiveOverlayAdminSnapshot();
  }

  await writeLiveOverlayState(next);
  return getLiveOverlayAdminSnapshot();
}
