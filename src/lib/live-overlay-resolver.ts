import type { QueueSourceType, SponsorBreakStatus } from "./queue-types";

export type OverlayMode = "standby" | "now_playing" | "artist_card" | "wheel_ready" | "wheel_reencrypting" | "wheel_spinning" | "wheel_result" | "wheel_confirmed" | "sponsor" | "video_placeholder" | "system_message" | "session_active";
export type WheelOverlayStatus = "ready" | "intro" | "active" | "complete";
export type WheelCeremonyStatus = "idle" | "ready" | "reencrypting" | "spinning" | "result_pending" | "confirmed" | "cancelled" | "signal_lost";

export const WHEEL_RIGHT_POINTER_ANGLE_DEGREES = 90;
export const YOUTUBE_SYNC_STALE_AFTER_MS = 12_000;

export type YouTubePresentation = "standard" | "short";

export interface WheelSegmentInput {
  id: string;
  label: string;
  weight?: number;
}

export interface WheelSegment {
  id: string;
  candidateId: string;
  displayLabel: string;
  startAngle: number;
  endAngle: number;
  centerAngle: number;
  angleSize: number;
  weight: number;
  index: number;
}

export function normalizeWheelAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return ((degrees % 360) + 360) % 360;
}

function normalizeWheelWeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

export function buildWheelSegments(entries: WheelSegmentInput[]): WheelSegment[] {
  const safeEntries = entries.length > 0 ? entries : [{ id: "empty", label: "NO CANDIDATES", weight: 1 }];
  const weights = safeEntries.map((entry) => normalizeWheelWeight(entry.weight));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let cursor = 0;

  return safeEntries.map((entry, index) => {
    const weight = weights[index] ?? 1;
    const startAngle = cursor;
    const angleSize = index === safeEntries.length - 1 ? 360 - startAngle : 360 * weight / totalWeight;
    const endAngle = index === safeEntries.length - 1 ? 360 : startAngle + angleSize;
    cursor = endAngle;
    return {
      id: `segment:${entry.id}`,
      candidateId: entry.id,
      displayLabel: entry.label,
      startAngle,
      endAngle,
      centerAngle: startAngle + angleSize / 2,
      angleSize,
      weight,
      index,
    };
  });
}

export function wheelPointerLocalAngle(finalRotationDegrees: number, pointerAngleDegrees = WHEEL_RIGHT_POINTER_ANGLE_DEGREES): number {
  return normalizeWheelAngle(pointerAngleDegrees - normalizeWheelAngle(finalRotationDegrees));
}

export function wheelSegmentAtPointer(segments: WheelSegment[], finalRotationDegrees: number, pointerAngleDegrees = WHEEL_RIGHT_POINTER_ANGLE_DEGREES): WheelSegment {
  const safeSegments = segments.length > 0 ? segments : buildWheelSegments([]);
  // Wheel labels are visual only. Winner selection is based exclusively on segment geometry under the right-side pointer.
  // Boundary rule: each segment owns [startAngle, endAngle), so an exact boundary belongs to the next clockwise segment.
  const pointerLocalAngle = wheelPointerLocalAngle(finalRotationDegrees, pointerAngleDegrees);
  return safeSegments.find((segment, index) => pointerLocalAngle >= segment.startAngle && (pointerLocalAngle < segment.endAngle || index === safeSegments.length - 1 && pointerLocalAngle < 360)) ?? safeSegments[0];
}

export function wheelSliceIndexAtPointer(entryCount: number, finalRotationDegrees: number, pointerAngleDegrees = WHEEL_RIGHT_POINTER_ANGLE_DEGREES): number {
  const count = Math.max(1, Math.floor(entryCount));
  const segments = buildWheelSegments(Array.from({ length: count }, (_, index) => ({ id: `slice-${index}`, label: `Slice ${index + 1}` })));
  return wheelSegmentAtPointer(segments, finalRotationDegrees, pointerAngleDegrees).index;
}

export function wheelSliceCenterAngle(entryCount: number, index: number): number {
  const count = Math.max(1, Math.floor(entryCount));
  const safeIndex = Math.max(0, Math.min(count - 1, Math.floor(index)));
  return buildWheelSegments(Array.from({ length: count }, (_, segmentIndex) => ({ id: `slice-${segmentIndex}`, label: `Slice ${segmentIndex + 1}` })))[safeIndex]?.centerAngle ?? 0;
}

export function wheelFinalRotationForSegment(segment: WheelSegment, fullTurns = 4, pointerAngleDegrees = WHEEL_RIGHT_POINTER_ANGLE_DEGREES): number {
  return (Math.max(0, Math.floor(fullTurns)) * 360) + pointerAngleDegrees - segment.centerAngle;
}

export function wheelFinalRotationForSlice(entryCount: number, index: number, fullTurns = 4, pointerAngleDegrees = WHEEL_RIGHT_POINTER_ANGLE_DEGREES): number {
  const count = Math.max(1, Math.floor(entryCount));
  const safeIndex = Math.max(0, Math.min(count - 1, Math.floor(index)));
  const segment = buildWheelSegments(Array.from({ length: count }, (_, segmentIndex) => ({ id: `slice-${segmentIndex}`, label: `Slice ${segmentIndex + 1}` })))[safeIndex];
  return wheelFinalRotationForSegment(segment ?? buildWheelSegments([])[0], fullTurns, pointerAngleDegrees);
}

export function wheelUprightLabelRotationDegrees(angle: number): number {
  let rotation = normalizeWheelAngle(angle) - 90;
  if (rotation > 180) rotation -= 360;
  if (rotation > 90) rotation -= 180;
  if (rotation < -90) rotation += 180;
  return rotation;
}

export interface LiveOverlayTrackInput {
  id?: string;
  artist?: string;
  title?: string;
  submittedArtistName?: string;
  submittedSongTitle?: string;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  sourceType?: QueueSourceType | "unknown";
  sourceArtworkUrl?: string | null;
  link?: string | null;
  durationLabel?: string;
  youtubeVideoId?: string | null;
  tiktokPostId?: string | null;
}

export interface LiveOverlayWheelCandidateInput {
  id?: string;
  artistName?: string;
  trackTitle?: string;
  artist?: string;
  title?: string;
  submittedArtistName?: string;
  submittedSongTitle?: string;
  detectedArtistName?: string | null;
  detectedSongTitle?: string | null;
  trackIds?: string[];
  trackCount?: number;
  tracks?: ResolvedWheelCeremonyTrack[];
  weight?: number;
}

export interface LiveOverlayStateInput {
  mode?: OverlayMode;
  title?: string;
  subtitle?: string;
  message?: string;
  artistName?: string;
  trackTitle?: string;
  artworkUrl?: string | null;
  sourceUrl?: string | null;
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
  wheelCeremonyFinalRotationDeg?: number;
  wheelCeremonyLandingAngleDeg?: number;
  wheelCeremonyWinningSegmentId?: string;
  wheelCeremonyWinningSegmentIndex?: number;
  wheelCeremonyJingleKey?: string;
  wheelCeremonySpinDurationMs?: number;
  wheelCeremonyAudioPath?: string;
  updatedAt?: string;
}

export interface LiveOverlaySessionInput {
  sessionId?: string;
  title?: string;
  status?: string;
  queueOpen?: boolean;
  broadcastPhase?: string;
  wheelSpinsOwed?: number;
  sponsorBreakStatus?: SponsorBreakStatus;
}

export type LiveOverlayPlaybackState = "playing" | "paused" | "stopped";

export interface LiveOverlayYouTubeSync {
  provider: "youtube";
  videoId: string;
  trackId?: string;
  playbackState: LiveOverlayPlaybackState;
  currentTimeSeconds: number;
  updatedAt: string;
  muted: boolean;
  clientUpdatedAt?: string;
}

export interface LiveOverlayTikTokSync {
  provider: "tiktok";
  postId: string;
  trackId?: string;
  playbackState: LiveOverlayPlaybackState;
  currentTimeSeconds: number;
  durationSeconds?: number;
  updatedAt: string;
  muted: true;
  clientUpdatedAt?: string;
}

export type LiveOverlayPlayerSync = LiveOverlayYouTubeSync | LiveOverlayTikTokSync;

function cleanSyncTrackId(value: unknown): string | undefined {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() || undefined : undefined;
}

export function serverStampYouTubeSync(input: unknown, receivedAt: Date = new Date()): LiveOverlayYouTubeSync | null {
  const raw = input as Partial<LiveOverlayYouTubeSync> | null;
  if (!raw || typeof raw !== "object" || raw.provider !== "youtube") return null;
  const videoId = typeof raw.videoId === "string" ? raw.videoId : "";
  if (!/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return null;
  const currentTimeSeconds = typeof raw.currentTimeSeconds === "number" && Number.isFinite(raw.currentTimeSeconds) ? Math.max(0, raw.currentTimeSeconds) : 0;
  return {
    provider: "youtube",
    videoId,
    trackId: cleanSyncTrackId(raw.trackId),
    playbackState: raw.playbackState === "playing" || raw.playbackState === "paused" || raw.playbackState === "stopped" ? raw.playbackState : "stopped",
    currentTimeSeconds,
    updatedAt: receivedAt.toISOString(),
    muted: true,
  };
}

export function serverStampTikTokSync(input: unknown, receivedAt: Date = new Date()): LiveOverlayTikTokSync | null {
  const raw = input as Partial<LiveOverlayTikTokSync> | null;
  if (!raw || typeof raw !== "object" || raw.provider !== "tiktok") return null;
  const postId = typeof raw.postId === "string" && /^\d{8,32}$/.test(raw.postId) ? raw.postId : null;
  if (!postId) return null;
  if (raw.playbackState !== "playing" && raw.playbackState !== "paused" && raw.playbackState !== "stopped") return null;
  if (typeof raw.currentTimeSeconds !== "number" || !Number.isFinite(raw.currentTimeSeconds) || raw.currentTimeSeconds < 0) return null;
  const durationSeconds = typeof raw.durationSeconds === "number" && Number.isFinite(raw.durationSeconds) && raw.durationSeconds > 0 ? raw.durationSeconds : undefined;
  return {
    provider: "tiktok",
    postId,
    trackId: cleanSyncTrackId(raw.trackId),
    playbackState: raw.playbackState,
    currentTimeSeconds: raw.currentTimeSeconds,
    durationSeconds,
    updatedAt: receivedAt.toISOString(),
    muted: true,
  };
}

export function serverStampLiveOverlayPlayerSync(input: unknown, receivedAt: Date = new Date()): LiveOverlayPlayerSync | null {
  const provider = (input as { provider?: unknown } | null)?.provider;
  if (provider === "youtube") return serverStampYouTubeSync(input, receivedAt);
  if (provider === "tiktok") return serverStampTikTokSync(input, receivedAt);
  return null;
}

export interface ResolveLiveOverlaySceneInput {
  overlayState?: LiveOverlayStateInput | null;
  currentSession?: LiveOverlaySessionInput | null;
  nowPlaying?: LiveOverlayTrackInput | null;
  upNext?: LiveOverlayTrackInput | null;
  playerSync?: LiveOverlayPlayerSync | null;
  wheelCandidates?: LiveOverlayWheelCandidateInput[];
  wheelSpinsOwed?: number;
  sponsorBreakStatus?: SponsorBreakStatus;
  broadcastPhase?: string;
  queueOpen?: boolean;
  now?: Date;
}

export interface ResolvedLiveOverlayTrack {
  id?: string;
  artistName: string;
  trackTitle: string;
  sourceType: QueueSourceType | "unknown";
  durationLabel?: string;
  youtubePresentation?: YouTubePresentation;
}

export interface ResolvedWheelCeremonyTrack {
  id: string;
  artistName: string;
  trackTitle: string;
  trackIds?: string[];
  trackCount?: number;
  tracks?: ResolvedWheelCeremonyTrack[];
  weight?: number;
}

export interface ResolvedWheelCeremonyScene {
  status: WheelCeremonyStatus;
  storedStatus: WheelCeremonyStatus;
  candidateCount: number;
  displayCandidates: ResolvedWheelCeremonyTrack[];
  hiddenCandidateCount: number;
  resultTrack?: ResolvedWheelCeremonyTrack | null;
  resultTrackId?: string;
  chosenTrackId?: string;
  startedAt?: string;
  spinStartedAt?: string;
  resultSelectedAt?: string;
  seed?: string;
  previousSeed?: string;
  candidateOrder?: string[];
  previousCandidateOrder?: string[];
  reencryptNonce?: string;
  reencryptCycleId?: string;
  finalRotationDeg?: number;
  landingAngleDeg?: number;
  winningSegmentId?: string;
  winningSegmentIndex?: number;
  jingleKey?: string;
  spinDurationMs: number;
  audioPath?: string;
}

export interface ResolvedLiveOverlayScene {
  mode: OverlayMode;
  resolvedMode: OverlayMode;
  reason: string;
  title: string;
  subtitle?: string;
  message?: string;
  track?: ResolvedLiveOverlayTrack | null;
  artworkUrl?: string | null;
  sourceUrl?: string | null;
  videoUrl?: string;
  youtube?: LiveOverlayYouTubeSync;
  tiktok?: LiveOverlayTikTokSync;
  wheelCeremony?: ResolvedWheelCeremonyScene;
  priority: number;
  automatic: boolean;
  overrideActive: boolean;
  wheelOverlayActive: boolean;
  wheelSpinsOwed: number;
  updatedAt: string;
}

const MAX_URL_LENGTH = 600;
const BLOCKED_HOSTS = ["drive.google.com", "dropbox.com", "wetransfer.com", "bit.ly", "tinyurl.com", "t.co", "goo.gl", "private.blob.vercel-storage.com"];
const DEFAULT_WHEEL_SPIN_DURATION_MS = 24000;
const MIN_WHEEL_SPIN_DURATION_MS = 16000;
const MAX_WHEEL_SPIN_DURATION_MS = 32000;
const WHEEL_REENCRYPTING_MS = 2200;
const WHEEL_REENCRYPT_REMAP_MS = 750;
const WHEEL_CONFIRMED_RETURN_MS = 2200;
const WHEEL_SIGNAL_LOST_MS = 3500;
const MAX_WHEEL_DISPLAY_CANDIDATES = 32;

export function safeLiveOverlayUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, MAX_URL_LENGTH);
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}


function tiktokPostIdFromCanonicalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host !== "www.tiktok.com" && host !== "tiktok.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 3 && /^@[A-Za-z0-9._-]{1,64}$/.test(parts[0]) && parts[1] === "video" && /^\d{8,32}$/.test(parts[2])) return parts[2];
    if (parts.length === 3 && parts[0] === "player" && parts[1] === "v1" && /^\d{8,32}$/.test(parts[2])) return parts[2];
  } catch {
    return null;
  }
  return null;
}

function isSafeYouTubeVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{6,}$/.test(value);
}

export function youtubePresentationFromUrl(value: string | null | undefined): YouTubePresentation | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+/g, "/");
    const segments = pathname.split("/").filter(Boolean);

    if ((hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com") && segments[0] === "shorts" && isSafeYouTubeVideoId(segments[1])) {
      return "short";
    }

    if ((hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com" || hostname === "music.youtube.com") && pathname === "/watch" && isSafeYouTubeVideoId(parsed.searchParams.get("v"))) {
      return "standard";
    }

    if (hostname === "youtu.be" && isSafeYouTubeVideoId(segments[0])) {
      return "standard";
    }

    if ((hostname === "youtube.com" || hostname === "www.youtube.com" || hostname === "m.youtube.com") && segments[0] === "embed" && isSafeYouTubeVideoId(segments[1])) {
      return "standard";
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function cleanDisplay(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function displayArtist(track: LiveOverlayTrackInput | LiveOverlayWheelCandidateInput): string {
  return cleanDisplay(track.detectedArtistName) || cleanDisplay(track.submittedArtistName) || cleanDisplay("artistName" in track ? track.artistName : undefined) || cleanDisplay(track.artist) || "Unknown artist";
}

function displayTitle(track: LiveOverlayTrackInput | LiveOverlayWheelCandidateInput): string {
  return cleanDisplay(track.detectedSongTitle) || cleanDisplay(track.submittedSongTitle) || cleanDisplay("trackTitle" in track ? track.trackTitle : undefined) || cleanDisplay(track.title) || "Untitled transmission";
}

function youtubeSyncForTrack(track: LiveOverlayTrackInput, playerSync?: LiveOverlayPlayerSync | null, now: Date = new Date()): LiveOverlayYouTubeSync | undefined {
  if (track.sourceType !== "youtube") return undefined;
  const safeLink = safeLiveOverlayUrl(track.link);
  if (!safeLink || !track.youtubeVideoId || playerSync?.provider !== "youtube") return undefined;
  const videoId = track.youtubeVideoId;
  const syncTrackMatches = !playerSync.trackId || !track.id || playerSync.trackId === track.id;
  const syncAgeMs = now.getTime() - new Date(playerSync.updatedAt).getTime();
  const syncIsFresh = Number.isFinite(syncAgeMs) && syncAgeMs >= 0 && syncAgeMs <= YOUTUBE_SYNC_STALE_AFTER_MS;
  // YouTube host sync heartbeats every 2.5s while playing; 12s tolerates brief polling/network delays
  // but prevents old or mismatched player state from restarting a new overlay video at 0s.
  if (playerSync.videoId !== videoId || !syncTrackMatches || !syncIsFresh) return undefined;
  return { ...playerSync, muted: true };
}

export function tiktokSyncForTrack(track: LiveOverlayTrackInput, playerSync?: LiveOverlayPlayerSync | null, now: Date = new Date()): LiveOverlayTikTokSync | undefined {
  if (track.sourceType !== "tiktok") return undefined;
  const postId = track.tiktokPostId ?? tiktokPostIdFromCanonicalUrl(track.link);
  if (!postId || !/^\d{8,32}$/.test(postId) || playerSync?.provider !== "tiktok") return undefined;
  const syncTrackMatches = !playerSync.trackId || !track.id || playerSync.trackId === track.id;
  const syncAgeMs = now.getTime() - new Date(playerSync.updatedAt).getTime();
  const syncIsFresh = Number.isFinite(syncAgeMs) && syncAgeMs >= 0 && syncAgeMs <= YOUTUBE_SYNC_STALE_AFTER_MS;
  if (playerSync.postId !== postId || !syncTrackMatches || !syncIsFresh) return undefined;
  return { ...playerSync, muted: true };
}

function safeTrack(track: LiveOverlayTrackInput): { track: ResolvedLiveOverlayTrack; artworkUrl: string | null; sourceUrl: string | null } {
  const sourceType = track.sourceType ?? "unknown";
  const isUpload = sourceType === "upload";
  const sourceUrl = isUpload ? null : safeLiveOverlayUrl(track.link) ?? null;
  return {
    track: {
      id: track.id,
      artistName: displayArtist(track),
      trackTitle: displayTitle(track),
      sourceType,
      durationLabel: cleanDisplay(track.durationLabel),
      youtubePresentation: sourceType === "youtube" ? youtubePresentationFromUrl(sourceUrl) : undefined,
    },
    artworkUrl: safeLiveOverlayUrl(track.sourceArtworkUrl) ?? null,
    sourceUrl,
  };
}

function safeWheelCandidate(candidate: LiveOverlayWheelCandidateInput): ResolvedWheelCeremonyTrack | null {
  const id = cleanDisplay(candidate.id);
  if (!id) return null;
  const tracks = Array.isArray(candidate.tracks)
    ? candidate.tracks.map((track) => ({ id: cleanDisplay(track.id) ?? "", artistName: cleanDisplay(track.artistName) || displayArtist(candidate), trackTitle: cleanDisplay(track.trackTitle) || "Untitled transmission" })).filter((track) => Boolean(track.id))
    : undefined;
  const trackIds = Array.isArray(candidate.trackIds) ? candidate.trackIds.map(cleanDisplay).filter((trackId): trackId is string => Boolean(trackId)) : tracks?.map((track) => track.id);
  const trackCount = Math.max(1, Math.floor(candidate.trackCount ?? trackIds?.length ?? tracks?.length ?? 1));
  return {
    id,
    artistName: displayArtist(candidate),
    trackTitle: trackCount > 1 ? `${trackCount} eligible tracks` : displayTitle(candidate),
    trackIds,
    trackCount,
    tracks,
    weight: normalizeWheelWeight(candidate.weight),
  };
}

function normalizeWheelCeremonyStatus(value: unknown): WheelCeremonyStatus {
  return value === "ready" || value === "reencrypting" || value === "spinning" || value === "result_pending" || value === "confirmed" || value === "cancelled" || value === "signal_lost" || value === "idle" ? value : "idle";
}

function timeMs(value?: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWheelSpinDurationMs(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_WHEEL_SPIN_DURATION_MS;
  return Math.max(MIN_WHEEL_SPIN_DURATION_MS, Math.min(MAX_WHEEL_SPIN_DURATION_MS, Math.round(value)));
}

function seededHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffledWheelCandidates(candidates: ResolvedWheelCeremonyTrack[], seed?: string): ResolvedWheelCeremonyTrack[] {
  const shuffled = [...candidates];
  let state = seededHash(seed || "barcode-wheel");
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function cleanStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value.map(cleanDisplay).filter((entry): entry is string => Boolean(entry));
  return cleaned.length > 0 ? [...new Set(cleaned)] : undefined;
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function cleanInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.floor(value);
}

export function orderedWheelCandidateIds(candidates: Pick<ResolvedWheelCeremonyTrack, "id">[], order?: string[], seed?: string): string[] {
  const candidateIds = candidates.map((candidate) => candidate.id).filter(Boolean);
  const candidateIdSet = new Set(candidateIds);
  const ordered = (order ?? []).filter((candidateId) => candidateIdSet.has(candidateId));
  const missing = candidateIds.filter((candidateId) => !ordered.includes(candidateId));
  if (ordered.length > 0) return [...ordered, ...missing];
  return shuffledWheelCandidates(candidates as ResolvedWheelCeremonyTrack[], seed).map((candidate) => candidate.id);
}

function orderWheelCandidates(candidates: ResolvedWheelCeremonyTrack[], order?: string[], seed?: string): ResolvedWheelCeremonyTrack[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return orderedWheelCandidateIds(candidates, order, seed).map((candidateId) => byId.get(candidateId)).filter((candidate): candidate is ResolvedWheelCeremonyTrack => Boolean(candidate));
}

function rotateWheelOrder(order: string[], amount: number): string[] {
  if (order.length === 0) return order;
  const safeAmount = ((amount % order.length) + order.length) % order.length;
  return [...order.slice(safeAmount), ...order.slice(0, safeAmount)];
}

export function derangedWheelCandidateOrder(candidates: Pick<ResolvedWheelCeremonyTrack, "id">[], previousOrder?: string[], seed?: string): string[] {
  const baseline = orderedWheelCandidateIds(candidates, previousOrder, seed);
  if (baseline.length <= 1) return baseline;
  if (baseline.length === 2) return [baseline[1], baseline[0]];

  const shuffled = [...baseline];
  let state = seededHash(seed || `barcode-wheel-derange:${baseline.join("|")}`);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  for (let rotation = 0; rotation < shuffled.length; rotation += 1) {
    const rotated = rotateWheelOrder(shuffled, rotation);
    if (rotated.every((candidateId, index) => candidateId !== baseline[index])) return rotated;
  }

  const fallbackShift = (seededHash(`${seed ?? "fallback"}:${baseline.join("|")}`) % (baseline.length - 1)) + 1;
  return rotateWheelOrder(baseline, fallbackShift);
}

function resolveWheelCeremony(input: ResolveLiveOverlaySceneInput, now: Date): ResolvedWheelCeremonyScene | null {
  const overlayState = input.overlayState ?? null;
  const storedStatus = normalizeWheelCeremonyStatus(overlayState?.wheelCeremonyStatus ?? (overlayState?.wheelOverlayActive ? "ready" : "idle"));
  if (storedStatus === "idle" || storedStatus === "cancelled") return null;
  const candidates = (input.wheelCandidates ?? []).map(safeWheelCandidate).filter((candidate): candidate is ResolvedWheelCeremonyTrack => Boolean(candidate));
  const resultTrackId = cleanDisplay(overlayState?.wheelCeremonyResultTrackId);
  const chosenTrackId = cleanDisplay(overlayState?.wheelCeremonyChosenTrackId);
  const rawResultTrack = candidates.find((candidate) => candidate.id === resultTrackId) ?? (resultTrackId ? { id: resultTrackId, artistName: cleanDisplay(overlayState?.artistName) || "Selected artist", trackTitle: cleanDisplay(overlayState?.trackTitle) || "Selected transmission" } : null);
  const chosenTrackTitle = chosenTrackId ? rawResultTrack?.tracks?.find((track) => track.id === chosenTrackId)?.trackTitle ?? cleanDisplay(overlayState?.trackTitle) : undefined;
  const resultTrack = rawResultTrack && chosenTrackTitle ? { ...rawResultTrack, trackTitle: chosenTrackTitle } : rawResultTrack;
  let status = storedStatus;
  const spinDurationMs = normalizeWheelSpinDurationMs(overlayState?.wheelCeremonySpinDurationMs);
  let reencryptElapsedMs = 0;
  if (storedStatus === "reencrypting" || storedStatus === "spinning") {
    const spinStartedMs = timeMs(overlayState?.wheelCeremonySpinStartedAt) ?? now.getTime();
    const elapsedMs = now.getTime() - spinStartedMs;
    if (storedStatus === "reencrypting") {
      reencryptElapsedMs = elapsedMs;
      status = elapsedMs < WHEEL_REENCRYPTING_MS ? "reencrypting" : "ready";
    } else status = elapsedMs < spinDurationMs ? "spinning" : "result_pending";
  }
  if (storedStatus === "signal_lost") {
    const signalLostAtMs = timeMs(overlayState?.wheelCeremonyResultSelectedAt) ?? timeMs(overlayState?.updatedAt) ?? now.getTime();
    status = now.getTime() - signalLostAtMs < WHEEL_SIGNAL_LOST_MS ? "signal_lost" : "ready";
  }
  if (storedStatus === "confirmed") {
    const confirmedAtMs = timeMs(overlayState?.wheelCeremonyResultSelectedAt) ?? timeMs(overlayState?.updatedAt) ?? now.getTime();
    if (now.getTime() - confirmedAtMs > WHEEL_CONFIRMED_RETURN_MS) return null;
  }
  const currentSeed = cleanDisplay(overlayState?.wheelCeremonySeed);
  const previousSeed = cleanDisplay(overlayState?.wheelCeremonyPreviousSeed);
  const currentOrder = cleanStringList(overlayState?.wheelCeremonyCandidateOrder);
  const previousOrder = cleanStringList(overlayState?.wheelCeremonyPreviousCandidateOrder);
  const usePreviousMapping = storedStatus === "reencrypting" && status === "reencrypting" && reencryptElapsedMs < WHEEL_REENCRYPT_REMAP_MS;
  const displaySeed = usePreviousMapping ? previousSeed ?? currentSeed : currentSeed;
  const displayOrder = usePreviousMapping ? previousOrder ?? currentOrder : currentOrder;
  return {
    status,
    storedStatus,
    candidateCount: candidates.length,
    displayCandidates: orderWheelCandidates(candidates, displayOrder, displaySeed).slice(0, MAX_WHEEL_DISPLAY_CANDIDATES),
    hiddenCandidateCount: Math.max(0, candidates.length - MAX_WHEEL_DISPLAY_CANDIDATES),
    resultTrack,
    resultTrackId,
    chosenTrackId,
    startedAt: overlayState?.wheelCeremonyStartedAt ?? overlayState?.wheelOverlayLaunchedAt,
    spinStartedAt: overlayState?.wheelCeremonySpinStartedAt,
    resultSelectedAt: overlayState?.wheelCeremonyResultSelectedAt,
    seed: currentSeed,
    previousSeed,
    candidateOrder: currentOrder,
    previousCandidateOrder: previousOrder,
    reencryptNonce: cleanDisplay(overlayState?.wheelCeremonyReencryptNonce) ?? cleanDisplay(overlayState?.wheelCeremonyReencryptCycleId),
    reencryptCycleId: cleanDisplay(overlayState?.wheelCeremonyReencryptCycleId),
    finalRotationDeg: cleanNumber(overlayState?.wheelCeremonyFinalRotationDeg),
    landingAngleDeg: cleanNumber(overlayState?.wheelCeremonyLandingAngleDeg),
    winningSegmentId: cleanDisplay(overlayState?.wheelCeremonyWinningSegmentId),
    winningSegmentIndex: cleanInteger(overlayState?.wheelCeremonyWinningSegmentIndex),
    jingleKey: cleanDisplay(overlayState?.wheelCeremonyJingleKey) || "silent",
    spinDurationMs,
    audioPath: cleanDisplay(overlayState?.wheelCeremonyAudioPath),
  };
}

function scene(input: Omit<ResolvedLiveOverlayScene, "resolvedMode" | "updatedAt" | "wheelSpinsOwed" | "wheelOverlayActive">, overlayState: LiveOverlayStateInput | null | undefined, wheelSpinsOwed: number, wheelOverlayActive?: boolean): ResolvedLiveOverlayScene {
  return {
    ...input,
    resolvedMode: input.mode,
    updatedAt: overlayState?.updatedAt ?? new Date().toISOString(),
    wheelSpinsOwed,
    wheelOverlayActive: wheelOverlayActive ?? overlayState?.wheelOverlayActive === true,
  };
}

export function resolveLiveOverlayScene(input: ResolveLiveOverlaySceneInput): ResolvedLiveOverlayScene {
  const overlayState = input.overlayState ?? null;
  const currentSession = input.currentSession ?? null;
  const now = input.now ?? new Date();
  const wheelSpinsOwed = Math.max(0, Math.floor(input.wheelSpinsOwed ?? currentSession?.wheelSpinsOwed ?? 0));
  const sponsorBreakStatus = input.sponsorBreakStatus ?? currentSession?.sponsorBreakStatus;
  const queueOpen = input.queueOpen ?? currentSession?.queueOpen ?? false;
  const broadcastPhase = input.broadcastPhase ?? currentSession?.broadcastPhase;
  const wheelCeremony = resolveWheelCeremony(input, now);

  if (wheelCeremony) {
    const result = wheelCeremony.resultTrack;
    const mode: OverlayMode = wheelCeremony.status === "reencrypting" ? "wheel_reencrypting" : wheelCeremony.status === "spinning" ? "wheel_spinning" : wheelCeremony.status === "result_pending" ? "wheel_result" : wheelCeremony.status === "confirmed" ? "wheel_confirmed" : "wheel_ready";
    return scene({
      mode,
      reason: wheelCeremony.status === "ready" ? "Wheel ceremony was launched by the host." : wheelCeremony.status === "reencrypting" ? "Wheel candidates are being re-encrypted before the spin." : wheelCeremony.status === "signal_lost" ? "Wheel winner was removed because the signal was not present." : wheelCeremony.status === "spinning" ? "Wheel spin is running under host control." : wheelCeremony.status === "confirmed" ? "Wheel result was confirmed through the queue admin path." : "Wheel result is waiting for host confirmation.",
      title: wheelCeremony.status === "confirmed" ? "WHEEL CHOSEN" : "10K TAP WHEEL",
      subtitle: wheelCeremony.status === "ready" ? "READY" : wheelCeremony.status === "reencrypting" ? "RE-ENCRYPTING SIGNAL" : wheelCeremony.status === "signal_lost" ? "SIGNAL LOST" : wheelCeremony.status === "spinning" ? "SPINNING" : wheelCeremony.status === "confirmed" ? "LOCKED IN" : "RESULT PENDING",
      message: wheelCeremony.status === "ready" ? `Candidates: ${wheelCeremony.candidateCount}. Awaiting host spin.` : wheelCeremony.status === "reencrypting" ? "Signal scramble in progress." : wheelCeremony.status === "signal_lost" ? "WINNER NOT PRESENT — WHEEL STILL OWED" : wheelCeremony.status === "spinning" ? "Result incoming." : result ? `${result.artistName} — ${result.trackTitle}` : "Awaiting host confirmation.",
      wheelCeremony,
      priority: 100,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed, true);
  }

  if (sponsorBreakStatus === "running") {
    return scene({
      mode: "sponsor",
      reason: "Sponsor break is currently running.",
      title: overlayState?.sponsorLabel || "SPONSOR BREAK",
      subtitle: "BARCODE RADIO",
      message: overlayState?.message || "Transmission will resume shortly.",
      priority: 90,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (overlayState?.systemMessageActive) {
    return scene({
      mode: "system_message",
      reason: "Temporary system message is active.",
      title: overlayState.systemMessageTitle || overlayState.title || "BARCODE SYSTEM MESSAGE",
      subtitle: "TEMPORARY OVERRIDE",
      message: overlayState.systemMessage || overlayState.message || "Stand by.",
      priority: 80,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (overlayState?.videoPlaceholderActive) {
    return scene({
      mode: "video_placeholder",
      reason: "Video placeholder was explicitly launched; playback is disabled.",
      title: overlayState.title || "VIDEO RECEIVER READY",
      subtitle: "PLACEHOLDER ONLY",
      message: overlayState.message || "Video link pending. Playback is not enabled in this foundation scene.",
      videoUrl: safeLiveOverlayUrl(overlayState.videoUrl),
      priority: 70,
      automatic: false,
      overrideActive: true,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (input.nowPlaying) {
    const safe = safeTrack(input.nowPlaying);
    const youtube = youtubeSyncForTrack(input.nowPlaying, input.playerSync, now);
    const tiktok = youtube ? undefined : tiktokSyncForTrack(input.nowPlaying, input.playerSync, now);
    return scene({
      mode: "now_playing",
      reason: youtube ? "Current YouTube track is loaded." : tiktok ? "Current TikTok track is loaded." : "Current track is loaded.",
      title: "NOW PLAYING",
      subtitle: youtube ? "YOUTUBE SIGNAL" : tiktok ? "TIKTOK SIGNAL" : "BARCODE RADIO LIVE",
      track: safe.track,
      artworkUrl: safe.artworkUrl,
      sourceUrl: safe.sourceUrl,
      youtube,
      tiktok,
      priority: youtube || tiktok ? 60 : 50,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed, false);
  }

  if (currentSession && currentSession.status !== "archived") {
    return scene({
      mode: "session_active",
      reason: queueOpen ? "Broadcast session is active and submissions are open." : "Broadcast session is active with no track loaded.",
      title: "BARCODE RADIO",
      subtitle: queueOpen ? "SUBMISSIONS OPEN" : "SESSION STANDBY",
      message: queueOpen ? "Intake corridor active." : broadcastPhase === "ended" ? "Transmission is ending." : "Awaiting the next transmission.",
      priority: 20,
      automatic: true,
      overrideActive: false,
    }, overlayState, wheelSpinsOwed, false);
  }

  return scene({
    mode: "standby",
    reason: "No active broadcast session is available.",
    title: "BARCODE RADIO",
    subtitle: "RECEIVER STANDBY",
    message: "Standing by for the next transmission.",
    priority: 0,
    automatic: true,
    overrideActive: false,
  }, overlayState, wheelSpinsOwed, false);
}
