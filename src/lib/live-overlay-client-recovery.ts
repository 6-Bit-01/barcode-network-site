import type { ResolvedLiveOverlayScene } from "./live-overlay";

export type OverlayReceiveFailure = "network" | "non_2xx" | "timeout" | "malformed_json" | "unexpected_scene" | "aborted";
export type OverlayTransportState = { scene: ResolvedLiveOverlayScene; connected: boolean; held: boolean; failureReason: OverlayReceiveFailure | null; generation: number };

const MODES = new Set(["standby", "now_playing", "artist_card", "wheel_ready", "wheel_reencrypting", "wheel_spinning", "wheel_result", "wheel_confirmed", "sponsor", "video_placeholder", "system_message", "session_active"]);
function str(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function trackOk(track: unknown): boolean { const t = track as Record<string, unknown> | null; return Boolean(t && str(t.artistName) && str(t.trackTitle)); }
export function isResolvedLiveOverlayScene(value: unknown): value is ResolvedLiveOverlayScene { const s = value as Partial<ResolvedLiveOverlayScene> | null; if (!s || typeof s !== "object") return false; if (!MODES.has(String(s.mode)) || !MODES.has(String(s.resolvedMode)) || !str(s.reason) || typeof s.automatic !== "boolean" || typeof s.overrideActive !== "boolean" || typeof s.wheelOverlayActive !== "boolean" || typeof s.wheelSpinsOwed !== "number" || !str(s.updatedAt)) return false; if ((s.mode === "now_playing" || s.mode === "artist_card") && s.track != null && !trackOk(s.track)) return false; return true; }
export function extractOverlayScene(payload: unknown): ResolvedLiveOverlayScene { const scene = (payload as { scene?: unknown } | null)?.scene ?? payload; if (!isResolvedLiveOverlayScene(scene)) throw new Error("unexpected_scene"); return scene; }
export function reduceOverlaySuccess(previous: OverlayTransportState, scene: ResolvedLiveOverlayScene, generation: number): OverlayTransportState { return generation < previous.generation ? previous : { scene, connected: true, held: false, failureReason: null, generation }; }
export function reduceOverlayFailure(previous: OverlayTransportState, reason: OverlayReceiveFailure, generation: number): OverlayTransportState { return generation < previous.generation ? previous : { ...previous, connected: false, held: true, failureReason: reason, generation }; }

export type ProviderLifecycleState = { failedId: string | null; initCount: number; status: "idle" | "failed" | "ready" };
export function providerShouldInitialize(state: ProviderLifecycleState, mediaId: string): boolean { return state.failedId !== mediaId; }
export function providerMarkFailed(state: ProviderLifecycleState, mediaId: string): ProviderLifecycleState { return { ...state, failedId: mediaId, status: "failed" }; }
export function providerBeginMedia(state: ProviderLifecycleState, mediaId: string): ProviderLifecycleState { if (state.failedId === mediaId) return state; return { failedId: null, initCount: state.initCount + 1, status: "ready" }; }
export function providerSwitchMedia(state: ProviderLifecycleState, mediaId: string): ProviderLifecycleState { void mediaId; return { failedId: null, initCount: state.initCount + 1, status: "ready" }; }

export type WheelAudioAttemptResult = { notice: string | null; attempts: string[]; played: boolean; blocked: boolean };
export async function playWheelSpinWithFallback(paths: string[], play: (path: string, generation: number) => Promise<void>, generation: number, isCurrent: (generation: number) => boolean): Promise<WheelAudioAttemptResult> { const attempts = paths.slice(0, 2); for (const path of attempts) { if (!isCurrent(generation)) return { notice: null, attempts, played: false, blocked: false }; try { await play(path, generation); if (!isCurrent(generation)) return { notice: null, attempts, played: false, blocked: false }; return { notice: null, attempts, played: true, blocked: false }; } catch (error) { const blocked = error instanceof DOMException && error.name === "NotAllowedError"; if (blocked) return { notice: "WHEEL AUDIO BLOCKED — CLICK ENABLE AUDIO", attempts: [path], played: false, blocked: true }; } } return { notice: "WHEEL SPIN AUDIO UNAVAILABLE — CEREMONY CONTINUES SILENTLY", attempts, played: false, blocked: false }; }
