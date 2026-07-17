import type { PriorityUpgradeStatus, QueueBroadcastPhase, QueuePublicSnapshot, QueuePublicTrack, QueueSessionStatus, QueueSourceType } from "./queue-types";

export type QueuePollFailureReason = "network" | "non_2xx" | "malformed_json" | "unexpected_payload" | "aborted" | "timeout";
export type QueuePollStatus = "loading" | "current" | "retrying" | "unavailable" | "stale";
export type QueuePollTrigger = "initial" | "interval" | "manual" | "focus" | "online" | "visible";
export type QueuePollState = { status: QueuePollStatus; snapshot: QueuePublicSnapshot | null; lastGoodAt: number | null; failureReason: QueuePollFailureReason | null; message: string | null; restoredAt: number | null; inFlight: boolean };

export class QueuePollError extends Error { reason: QueuePollFailureReason; statusCode?: number; constructor(reason: QueuePollFailureReason, message: string, statusCode?: number) { super(message); this.reason = reason; this.statusCode = statusCode; } }

const QUEUE_SOURCE_TYPES = { upload: true, link: true, youtube: true, soundcloud: true, spotify: true, tiktok: true, other: true } satisfies Record<QueueSourceType, true>;
const SESSION_STATUSES = { prepared: true, open: true, closed: true, archived: true } satisfies Record<QueueSessionStatus, true>;
const BROADCAST_PHASES = { warmup: true, submission_window: true, broadcast_active: true, ended: true } satisfies Record<QueueBroadcastPhase, true>;
const PRIORITY_STATUSES = { none: true, requested: true, manual: true, checkout_pending: true, paid: true, paid_needs_attention: true, failed: true, refunded: true } satisfies Record<PriorityUpgradeStatus, true>;
const PRESSURES = { low: true, medium: true, high: true, max: true } satisfies Record<QueuePublicSnapshot["status"]["pressure"], true>;
const LANES = { priority: true, wheel: true, regular: true } satisfies Record<QueuePublicTrack["lane"], true>;
const SOURCE_TYPES = new Set(Object.keys(QUEUE_SOURCE_TYPES));
const DURATION_SOURCES = new Set(["upload_metadata", "file_metadata", "youtube", "soundcloud", "spotify", "youtube_api", "spotify_api", "soundcloud_api", "direct_metadata", "provider_metadata", "internal_estimate", "estimated", "unknown"]);
const SPONSOR_BREAK_MODES = new Set(["mid_show"]);
const SPONSOR_BREAK_STATUSES = new Set(["not_due", "due", "running", "completed", "skipped"]);
const hasOwn = <T extends object>(record: T, key: unknown): key is keyof T => typeof key === "string" && Object.prototype.hasOwnProperty.call(record, key);

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function nonNegativeInt(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0; }
function positiveInt(value: unknown): value is number { return Number.isInteger(value) && (value as number) > 0; }
function cleanString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function validUrl(value: unknown): boolean { if (value == null) return true; if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
function isoOrNull(value: unknown): boolean { return value == null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value))); }
function showDate(value: unknown): boolean { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)); }
function stringOrNull(value: unknown): boolean { return value == null || typeof value === "string"; }
function boolOrNull(value: unknown): boolean { return value == null || typeof value === "boolean"; }
function validCurrency(value: unknown): boolean { return typeof value === "string" && /^[a-z]{3}$/i.test(value); }
function validTrack(value: unknown): value is QueuePublicTrack {
  const t = value as Partial<QueuePublicTrack> | null;
  return Boolean(t && typeof t === "object" && cleanString(t.id) && cleanString(t.submittedArtistName) && cleanString(t.submittedSongTitle) && typeof t.durationLabel === "string" && typeof t.durationIsEstimate === "boolean" && SOURCE_TYPES.has(String(t.sourceType)) && hasOwn(LANES, t.lane) && (t.priorityUpgradeStatus == null || hasOwn(PRIORITY_STATUSES, t.priorityUpgradeStatus)) && (t.detectedDurationSeconds == null || (finite(t.detectedDurationSeconds) && t.detectedDurationSeconds >= 0)) && (t.estimatedDurationSeconds == null || (finite(t.estimatedDurationSeconds) && t.estimatedDurationSeconds >= 0)) && (t.durationSource == null || DURATION_SOURCES.has(String(t.durationSource))) && boolOrNull(t.priorityUpgradeRequested) && (t.publicSourceUrl == null || validUrl(t.publicSourceUrl)) && (t.sourceArtworkUrl == null || validUrl(t.sourceArtworkUrl)) && (t.tiktokHandle == null || typeof t.tiktokHandle === "string") && (t.providerTitle == null || typeof t.providerTitle === "string") && stringOrNull(t.detectedArtistName) && stringOrNull(t.detectedSongTitle));
}
function validTrackOrNull(value: unknown): boolean { return value == null || validTrack(value); }

export function isQueuePublicSnapshot(value: unknown): value is QueuePublicSnapshot {
  const v = value as Partial<QueuePublicSnapshot> | null;
  const session = v?.session as Record<string, unknown> | undefined;
  const status = v?.status as Record<string, unknown> | undefined;
  if (!v || typeof v !== "object" || !session || !status) return false;
  if (!cleanString(session.sessionId) || !cleanString(session.title) || !showDate(session.showDate) || typeof session.description !== "string" || !hasOwn(SESSION_STATUSES, session.status)) return false;
  if (session.broadcastPhase != null && !hasOwn(BROADCAST_PHASES, session.broadcastPhase)) return false;
  if (typeof session.queueOpen !== "boolean" || typeof session.showStarted !== "boolean" || !nonNegativeInt(session.completedCount) || !nonNegativeInt(session.completedRuntimeSeconds) || !nonNegativeInt(session.activeCount) || !nonNegativeInt(session.removedCount) || !nonNegativeInt(session.submissionCooldownSeconds)) return false;
  if (typeof session.priorityUpgradesEnabled !== "boolean" || typeof session.priorityUpgradePaymentsEnabled !== "boolean") return false;
  if (!nonNegativeInt(session.priorityUpgradePriceCents) || !validCurrency(session.priorityUpgradeCurrency)) return false;
  if (typeof session.priorityUpgradeLabel !== "string" || typeof session.priorityUpgradeInstructions !== "string") return false;
  if (!isoOrNull(session.preShowEndsAt) || !isoOrNull(session.broadcastStartedAt) || !stringOrNull(session.nextInLineTrackId) || !stringOrNull(session.loadedTrackId)) return false;
  if (session.wheelSpinsOwed != null && !nonNegativeInt(session.wheelSpinsOwed)) return false;
  if (session.sponsorBreakSeconds != null && !nonNegativeInt(session.sponsorBreakSeconds)) return false;
  if (session.sponsorBreakMode != null && !SPONSOR_BREAK_MODES.has(String(session.sponsorBreakMode))) return false;
  if (session.sponsorBreakStatus != null && !SPONSOR_BREAK_STATUSES.has(String(session.sponsorBreakStatus))) return false;
  if (!isoOrNull(session.sponsorBreakStartedAt) || !isoOrNull(session.sponsorBreakCompletedAt) || !stringOrNull(session.sponsorBreakManualNote)) return false;
  if (session.sponsorBreakCompletedAfterPlayableCount != null && !nonNegativeInt(session.sponsorBreakCompletedAfterPlayableCount)) return false;
  if (typeof status.isOpen !== "boolean" || !nonNegativeInt(status.activeCount) || !nonNegativeInt(status.estimatedRuntimeSeconds) || !positiveInt(status.capacity) || !hasOwn(PRESSURES, status.pressure)) return false;
  if (status.isFull != null && typeof status.isFull !== "boolean") return false;
  if (!Array.isArray(v.queue) || !Array.isArray(v.completed) || !v.queue.every(validTrack) || !v.completed.every(validTrack)) return false;
  if (!validTrackOrNull(v.nowPlaying) || !validTrackOrNull(v.upNext)) return false;
  const submitter = v.submitterStatus as Record<string, unknown> | null | undefined;
  if (submitter != null && (typeof submitter !== "object" || !nonNegativeInt(submitter.used) || !nonNegativeInt(submitter.limit) || !nonNegativeInt(submitter.remaining) || !nonNegativeInt(submitter.cooldownRemainingSeconds) || !Array.isArray(submitter.submitted) || !submitter.submitted.every(validTrack))) return false;
  return true;
}

export function queueSnapshotIdentity(snapshot: QueuePublicSnapshot | null): string | null { return snapshot ? snapshot.session.sessionId : null; }
export function snapshotsAreCompatible(a: QueuePublicSnapshot | null, b: QueuePublicSnapshot | null): boolean { return Boolean(a && b && a.session.sessionId === b.session.sessionId); }
export function messageForQueuePollFailure(reason: QueuePollFailureReason): string { if (reason === "network") return "Queue signal unavailable. Check connection and retry."; if (reason === "non_2xx") return "Queue server returned an error. The queue state was not changed."; if (reason === "malformed_json") return "Queue response was unreadable. Retry to resync."; if (reason === "unexpected_payload") return "Queue response was incompatible. Retry to resync."; if (reason === "timeout") return "Queue request timed out. Retry to resync."; return "Queue request was cancelled during refresh."; }

export async function fetchQueueSnapshot(fetcher: typeof fetch, url: string, signal?: AbortSignal): Promise<QueuePublicSnapshot> { let response: Response; try { response = await fetcher(url, { cache: "no-store", signal }); } catch (error) { if ((error as { name?: string })?.name === "AbortError") throw new QueuePollError("aborted", messageForQueuePollFailure("aborted")); throw new QueuePollError("network", messageForQueuePollFailure("network")); } if (!response.ok) throw new QueuePollError("non_2xx", messageForQueuePollFailure("non_2xx"), response.status); let payload: unknown; try { payload = await response.json(); } catch { throw new QueuePollError("malformed_json", messageForQueuePollFailure("malformed_json")); } if (!isQueuePublicSnapshot(payload)) throw new QueuePollError("unexpected_payload", messageForQueuePollFailure("unexpected_payload")); return payload; }

export const initialQueuePollState: QueuePollState = { status: "loading", snapshot: null, lastGoodAt: null, failureReason: null, message: null, restoredAt: null, inFlight: false };
export function beginQueuePoll(previous: QueuePollState, trigger: QueuePollTrigger): QueuePollState { return { ...previous, status: previous.snapshot ? trigger === "manual" ? "retrying" : previous.status === "current" ? "current" : "retrying" : trigger === "initial" ? "loading" : "retrying", inFlight: true, restoredAt: null }; }
export function reduceQueuePollFailure(previous: QueuePollState, reason: QueuePollFailureReason): QueuePollState { const canKeepStale = Boolean(previous.snapshot && previous.status !== "loading"); return { ...previous, status: canKeepStale ? "stale" : "unavailable", inFlight: false, failureReason: reason, message: messageForQueuePollFailure(reason) }; }
export function reduceQueuePollSuccess(previous: QueuePollState, snapshot: QueuePublicSnapshot, now = Date.now(), requiredSessionId?: string): QueuePollState { if (requiredSessionId && snapshot.session.sessionId !== requiredSessionId) return reduceQueuePollFailure({ ...previous, snapshot: previous.snapshot?.session.sessionId === requiredSessionId ? previous.snapshot : null }, "unexpected_payload"); const wasRecovering = previous.status === "stale" || previous.status === "retrying" || previous.status === "unavailable" || Boolean(previous.failureReason); return { status: "current", snapshot, lastGoodAt: now, failureReason: null, message: null, restoredAt: wasRecovering ? now : previous.restoredAt, inFlight: false }; }
export function queueHasCurrentAuthority(state: QueuePollState): boolean { return state.status === "current" && Boolean(state.snapshot); }
export function deriveQueueRecoveryView(state: QueuePollState): "loading" | "unavailable" | "retrying" | "stale" | "current" { if (state.status === "loading") return "loading"; if (state.status === "retrying") return "retrying"; if (state.status === "stale") return "stale"; if (state.status === "unavailable") return "unavailable"; return "current"; }

export type PublicQueueActionType = "submit" | "priority_request" | "priority_checkout_preflight" | "priority_checkout_completed" | "priority_resume";
export function derivePublicQueueActionEligibility(state: QueuePollState, input: { sessionId: string; action: PublicQueueActionType; trackId?: string; priorityDepth?: number; frontEdgeFreeTrackId?: string | null; }): { allowed: boolean; snapshot: QueuePublicSnapshot | null; track: QueuePublicTrack | null; reason?: string } {
  const snapshot = queueHasCurrentAuthority(state) ? state.snapshot : null;
  if (!snapshot) return { allowed: false, snapshot: null, track: null, reason: "not_current" };
  if (snapshot.session.sessionId !== input.sessionId) return { allowed: false, snapshot, track: null, reason: "wrong_session" };
  const ended = snapshot.session.status === "archived" || snapshot.session.broadcastPhase === "ended";
  const open = snapshot.status.isOpen === true && snapshot.session.queueOpen === true && snapshot.session.status === "open" && !ended;
  const full = Boolean(snapshot.status.isFull || snapshot.status.activeCount >= snapshot.status.capacity);
  const remaining = snapshot.submitterStatus?.remaining;
  const cooldownClear = (snapshot.submitterStatus?.cooldownRemainingSeconds ?? 0) <= 0;
  const canSubmit = open && !full && (remaining == null || remaining > 0) && cooldownClear;
  if (input.action === "submit") return { allowed: canSubmit, snapshot, track: null, reason: canSubmit ? undefined : "submit_closed" };
  if (!open) return { allowed: false, snapshot, track: null, reason: "closed" };
  if (full) return { allowed: false, snapshot, track: null, reason: "full" };
  const queueTrack = snapshot.queue.find((candidate) => candidate.id === input.trackId) ?? null;
  if (!queueTrack) return { allowed: false, snapshot, track: null, reason: "track_missing" };
  if (snapshot.nowPlaying?.id === queueTrack.id) return { allowed: false, snapshot, track: queueTrack, reason: "now_playing" };
  if (snapshot.upNext?.id === queueTrack.id) return { allowed: false, snapshot, track: queueTrack, reason: "up_next" };
  if (input.frontEdgeFreeTrackId && queueTrack.id === input.frontEdgeFreeTrackId) return { allowed: false, snapshot, track: queueTrack, reason: "front_edge" };
  const paymentsAvailable = snapshot.session.priorityUpgradesEnabled === true && snapshot.session.priorityUpgradePaymentsEnabled === true && snapshot.session.priorityUpgradePriceCents > 0;
  if (!paymentsAvailable) return { allowed: false, snapshot, track: queueTrack, reason: "payments_disabled" };
  const depthOk = snapshot.status.activeCount >= (input.priorityDepth ?? 0);
  const requestable = queueTrack.lane === "regular" && (queueTrack.priorityUpgradeStatus == null || queueTrack.priorityUpgradeStatus === "none" || queueTrack.priorityUpgradeStatus === "failed" || queueTrack.priorityUpgradeStatus === "refunded");
  if (input.action === "priority_resume") return { allowed: queueTrack.priorityUpgradeStatus === "checkout_pending", snapshot, track: queueTrack, reason: queueTrack.priorityUpgradeStatus === "checkout_pending" ? undefined : "not_pending" };
  if (input.action === "priority_checkout_completed") return { allowed: queueTrack.priorityUpgradeStatus === "checkout_pending" || requestable, snapshot, track: queueTrack, reason: queueTrack.priorityUpgradeStatus === "checkout_pending" || requestable ? undefined : "checkout_not_pending" };
  const allowed = depthOk && requestable;
  return { allowed, snapshot, track: queueTrack, reason: allowed ? undefined : "priority_unavailable" };
}

export interface QueuePollControllerOptions { fetcher: typeof fetch; getUrl: () => string; onState: (updater: (state: QueuePollState) => QueuePollState) => void; getState: () => QueuePollState; requiredSessionId?: () => string | undefined; intervalMs?: number; timeoutMs?: number; coalesceMs?: number; windowRef?: Pick<Window, "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout">; documentRef?: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">; now?: () => number; }

export function createQueuePollController(options: QueuePollControllerOptions) {
  const intervalMs = options.intervalMs ?? 5_000, timeoutMs = options.timeoutMs ?? 8_000, coalesceMs = options.coalesceMs ?? 80;
  const win = options.windowRef ?? window, doc = options.documentRef ?? document, now = options.now ?? Date.now;
  let disposed = false, inFlight = false, pending = false, timedOut = false, generation = 0, scheduled: number | null = null, intervalTimer: number | null = null, timeoutTimer: number | null = null, controller: AbortController | null = null;
  const set = (fn: (s: QueuePollState) => QueuePollState) => options.onState(fn);
  const clearSchedule = () => { if (scheduled) win.clearTimeout(scheduled); scheduled = null; };
  const clearIntervalTimer = () => { if (intervalTimer) win.clearTimeout(intervalTimer); intervalTimer = null; };
  const clearTimeoutTimer = () => { if (timeoutTimer) win.clearTimeout(timeoutTimer); timeoutTimer = null; };
  const queueInterval = () => { clearIntervalTimer(); if (!disposed) intervalTimer = win.setTimeout(() => schedule("interval"), intervalMs) as unknown as number; };
  async function run(trigger: QueuePollTrigger) { if (disposed) return; if (inFlight) { pending = true; return; } clearSchedule(); inFlight = true; timedOut = false; const id = ++generation; controller = new AbortController(); set((s) => beginQueuePoll(s, trigger)); try { const snapshot = await Promise.race([fetchQueueSnapshot(options.fetcher, options.getUrl(), controller.signal), new Promise<never>((_, reject) => { timeoutTimer = win.setTimeout(() => { timedOut = true; controller?.abort(); reject(new QueuePollError("timeout", messageForQueuePollFailure("timeout"))); }, timeoutMs) as unknown as number; })]); if (disposed || id !== generation) return; set((s) => reduceQueuePollSuccess(s, snapshot, now(), options.requiredSessionId?.())); } catch (error) { if (disposed || id !== generation) return; const reason = error instanceof QueuePollError ? (error.reason === "aborted" && timedOut ? "timeout" : error.reason) : "network"; set((s) => reason === "aborted" ? reduceQueuePollFailure(s, "timeout") : reduceQueuePollFailure(s, reason)); } finally { if (id === generation) { inFlight = false; controller = null; clearTimeoutTimer(); queueInterval(); if (pending) { pending = false; schedule("interval"); } } } }
  function schedule(trigger: QueuePollTrigger) { if (disposed) return; if (inFlight) { pending = true; return; } if (scheduled) return; scheduled = win.setTimeout(() => { scheduled = null; void run(trigger); }, trigger === "manual" || trigger === "initial" ? 0 : coalesceMs) as unknown as number; }
  const focus = () => schedule("focus"), online = () => schedule("online"), visible = () => { if (doc.visibilityState === "visible") schedule("visible"); };
  return { start() { if (!disposed && (scheduled || intervalTimer || inFlight)) return; disposed = false; win.addEventListener("focus", focus); win.addEventListener("online", online); doc.addEventListener("visibilitychange", visible); schedule("initial"); queueInterval(); }, retry() { schedule("manual"); }, dispose() { disposed = true; generation++; inFlight = false; pending = false; timedOut = false; clearSchedule(); clearIntervalTimer(); clearTimeoutTimer(); controller?.abort(); controller = null; win.removeEventListener("focus", focus); win.removeEventListener("online", online); doc.removeEventListener("visibilitychange", visible); } };
}
