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
const PRESSURES = new Set(["low", "medium", "high", "max"]);
const SOURCE_TYPES = new Set(Object.keys(QUEUE_SOURCE_TYPES));
const LANES = new Set(["priority", "wheel", "regular"]);

function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function cleanString(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function validUrl(value: unknown): boolean { if (value == null) return true; if (typeof value !== "string") return false; try { new URL(value); return true; } catch { return false; } }
function validTrack(value: unknown): value is QueuePublicTrack {
  const t = value as Partial<QueuePublicTrack> | null;
  return Boolean(t && typeof t === "object" && cleanString(t.id) && cleanString(t.submittedArtistName) && cleanString(t.submittedSongTitle) && typeof t.durationLabel === "string" && typeof t.durationIsEstimate === "boolean" && SOURCE_TYPES.has(String(t.sourceType)) && LANES.has(String(t.lane)) && (t.priorityUpgradeStatus == null || String(t.priorityUpgradeStatus) in PRIORITY_STATUSES) && (t.detectedDurationSeconds == null || finite(t.detectedDurationSeconds)) && (t.estimatedDurationSeconds == null || finite(t.estimatedDurationSeconds)) && (t.publicSourceUrl == null || validUrl(t.publicSourceUrl)) && (t.sourceArtworkUrl == null || validUrl(t.sourceArtworkUrl)) && (t.tiktokHandle == null || typeof t.tiktokHandle === "string") && (t.providerTitle == null || typeof t.providerTitle === "string"));
}
function validTrackOrNull(value: unknown): boolean { return value == null || validTrack(value); }

export function isQueuePublicSnapshot(value: unknown): value is QueuePublicSnapshot {
  const v = value as Partial<QueuePublicSnapshot> | null;
  const session = v?.session as Record<string, unknown> | undefined;
  const status = v?.status as Record<string, unknown> | undefined;
  if (!v || typeof v !== "object" || !session || !status) return false;
  if (!cleanString(session.sessionId) || !cleanString(session.title) || !cleanString(session.showDate) || typeof session.description !== "string" || !(String(session.status) in SESSION_STATUSES)) return false;
  if (session.broadcastPhase != null && !(String(session.broadcastPhase) in BROADCAST_PHASES)) return false;
  if (typeof session.queueOpen !== "boolean" || typeof session.showStarted !== "boolean" || !finite(session.completedCount) || !finite(session.completedRuntimeSeconds) || !finite(session.activeCount) || !finite(session.removedCount) || !finite(session.submissionCooldownSeconds)) return false;
  if (session.priorityUpgradesEnabled != null && typeof session.priorityUpgradesEnabled !== "boolean") return false;
  if (session.priorityUpgradePaymentsEnabled != null && typeof session.priorityUpgradePaymentsEnabled !== "boolean") return false;
  if (session.priorityUpgradePriceCents != null && !finite(session.priorityUpgradePriceCents)) return false;
  if (typeof status.isOpen !== "boolean" || !finite(status.activeCount) || !finite(status.estimatedRuntimeSeconds) || !finite(status.capacity) || !PRESSURES.has(String(status.pressure))) return false;
  if (status.isFull != null && typeof status.isFull !== "boolean") return false;
  if (!Array.isArray(v.queue) || !Array.isArray(v.completed) || !v.queue.every(validTrack) || !v.completed.every(validTrack)) return false;
  if (!validTrackOrNull(v.nowPlaying) || !validTrackOrNull(v.upNext)) return false;
  const submitter = v.submitterStatus as Record<string, unknown> | null | undefined;
  if (submitter && (!finite(submitter.used) || !finite(submitter.limit) || !finite(submitter.remaining) || !finite(submitter.cooldownRemainingSeconds) || !Array.isArray(submitter.submitted) || !submitter.submitted.every(validTrack))) return false;
  return true;
}

export function queueSnapshotIdentity(snapshot: QueuePublicSnapshot | null): string | null { return snapshot ? snapshot.session.sessionId : null; }
export function snapshotsAreCompatible(a: QueuePublicSnapshot | null, b: QueuePublicSnapshot | null): boolean { return Boolean(a && b && a.session.sessionId === b.session.sessionId); }
export function messageForQueuePollFailure(reason: QueuePollFailureReason): string { if (reason === "network") return "Queue signal unavailable. Check connection and retry."; if (reason === "non_2xx") return "Queue server returned an error. The queue state was not changed."; if (reason === "malformed_json") return "Queue response was unreadable. Retry to resync."; if (reason === "unexpected_payload") return "Queue response was incompatible. Retry to resync."; if (reason === "timeout") return "Queue request timed out. Retry to resync."; return "Queue request was cancelled during refresh."; }

export async function fetchQueueSnapshot(fetcher: typeof fetch, url: string, signal?: AbortSignal): Promise<QueuePublicSnapshot> { let response: Response; try { response = await fetcher(url, { cache: "no-store", signal }); } catch (error) { if ((error as { name?: string })?.name === "AbortError") throw new QueuePollError("aborted", messageForQueuePollFailure("aborted")); throw new QueuePollError("network", messageForQueuePollFailure("network")); } if (!response.ok) throw new QueuePollError("non_2xx", messageForQueuePollFailure("non_2xx"), response.status); let payload: unknown; try { payload = await response.json(); } catch { throw new QueuePollError("malformed_json", messageForQueuePollFailure("malformed_json")); } if (!isQueuePublicSnapshot(payload)) throw new QueuePollError("unexpected_payload", messageForQueuePollFailure("unexpected_payload")); return payload; }

export const initialQueuePollState: QueuePollState = { status: "loading", snapshot: null, lastGoodAt: null, failureReason: null, message: null, restoredAt: null, inFlight: false };
export function beginQueuePoll(previous: QueuePollState, trigger: QueuePollTrigger): QueuePollState { return { ...previous, status: previous.snapshot ? trigger === "manual" ? "retrying" : previous.status === "current" ? "current" : "retrying" : trigger === "initial" ? "loading" : "retrying", inFlight: true, restoredAt: null }; }
export function reduceQueuePollFailure(previous: QueuePollState, reason: QueuePollFailureReason): QueuePollState { const canKeepStale = Boolean(previous.snapshot && previous.status !== "loading"); return { ...previous, status: canKeepStale ? "stale" : "unavailable", inFlight: false, failureReason: reason, message: messageForQueuePollFailure(reason) }; }
export function reduceQueuePollSuccess(previous: QueuePollState, snapshot: QueuePublicSnapshot, now = Date.now(), requiredSessionId?: string): QueuePollState { if (requiredSessionId && snapshot.session.sessionId !== requiredSessionId) return reduceQueuePollFailure({ ...previous, snapshot: previous.snapshot?.session.sessionId === requiredSessionId ? previous.snapshot : null }, "unexpected_payload"); const wasRecovering = previous.status !== "current" || Boolean(previous.failureReason); return { status: "current", snapshot, lastGoodAt: now, failureReason: null, message: null, restoredAt: wasRecovering ? now : previous.restoredAt, inFlight: false }; }
export function queueHasCurrentAuthority(state: QueuePollState): boolean { return state.status === "current" && Boolean(state.snapshot); }
export function deriveQueueRecoveryView(state: QueuePollState): "loading" | "unavailable" | "retrying" | "stale" | "current" { if (state.status === "loading") return "loading"; if (state.status === "retrying") return "retrying"; if (state.status === "stale") return "stale"; if (state.status === "unavailable") return "unavailable"; return "current"; }

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
  return { start() { if (!disposed && (scheduled || intervalTimer || inFlight)) return; disposed = false; win.addEventListener("focus", focus); win.addEventListener("online", online); doc.addEventListener("visibilitychange", visible); schedule("initial"); queueInterval(); }, retry() { schedule("manual"); }, dispose() { disposed = true; generation++; clearSchedule(); clearIntervalTimer(); clearTimeoutTimer(); controller?.abort(); controller = null; win.removeEventListener("focus", focus); win.removeEventListener("online", online); doc.removeEventListener("visibilitychange", visible); } };
}
