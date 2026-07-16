import { BNLStatus, FALLBACK_STATUS } from "@/components/bnl-status";

export type BNLStatusSnapshot = { data: BNLStatus; loading: boolean; refreshing: boolean; error: string | null; lastSuccessfulRefresh: string | null; synchronized: boolean };
type Listener = (snapshot: BNLStatusSnapshot) => void;

const statuses = new Set(["ONLINE", "OFFLINE"]);
const modes = new Set(["STANDBY", "OBSERVATION", "ACTIVE_LIAISON", "SIGNAL_DEGRADATION", "RESTRICTED"]);
const sources = new Set(["bot", "startup", "relay", "heartbeat", "showday", "showtest", "admin", "reset", "forcePull", "unknown"]);
const presenceSources = new Set(["heartbeat", "startup", "admin", "reset", "unknown"]);
const sourceClasses = new Set(["fresh_public_event", "recent_public_continuity", "scoped_broadcast_memory", "public_safe_memory", "approved_canon", "grounded_reflection"]);
const triggers = new Set(["scheduled", "force_pull", "manual"]);

function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }

export function normalizeBNLStatusPayload(payload: unknown): BNLStatus {
  const data = record(payload);
  if (!data) throw new Error("BNL status payload was malformed");
  const status = statuses.has(data.status as string) ? data.status as BNLStatus["status"] : null;
  const mode = modes.has(data.mode as string) ? data.mode as BNLStatus["mode"] : null;
  const relay = record(data.relay);
  const presence = record(data.presence);
  const normalizedRelay = relay && relay.contractVersion === 2 && typeof relay.relayId === "string" && typeof relay.publishedAt === "string" && sourceClasses.has(relay.sourceClass as string) && triggers.has(relay.trigger as string)
    ? { contractVersion: 2 as const, relayId: relay.relayId, message: text(relay.message), currentDirective: text(relay.currentDirective), sourceClass: relay.sourceClass as NonNullable<BNLStatus["relay"]>["sourceClass"], trigger: relay.trigger as NonNullable<BNLStatus["relay"]>["trigger"], publishedAt: relay.publishedAt }
    : null;
  const normalizedPresence = presence && presence.contractVersion === 2 && statuses.has(presence.status as string) && modes.has(presence.mode as string) && presenceSources.has(presence.source as string) && typeof presence.receivedAt === "string"
    ? { contractVersion: 2 as const, status: presence.status as BNLStatus["status"], mode: presence.mode as BNLStatus["mode"], source: presence.source as NonNullable<BNLStatus["presence"]>["source"], receivedAt: presence.receivedAt }
    : undefined;
  const message = normalizedRelay?.message || text(data.message);
  if (!status || !mode || !message) throw new Error("BNL status payload was incomplete");
  return {
    status,
    mode,
    message,
    currentDirective: normalizedRelay?.currentDirective || text(data.currentDirective, FALLBACK_STATUS.currentDirective),
    source: sources.has(data.source as string) ? data.source as BNLStatus["source"] : normalizedRelay ? (normalizedRelay.trigger === "force_pull" ? "forcePull" : "relay") : "unknown",
    lastSeen: typeof data.lastSeen === "string" ? data.lastSeen : normalizedRelay?.publishedAt ?? null,
    contractVersion: data.contractVersion === 2 ? 2 : undefined,
    presence: normalizedPresence,
    relay: normalizedRelay,
  };
}

export class BNLStatusController {
  private snapshot: BNLStatusSnapshot = { data: FALLBACK_STATUS, loading: true, refreshing: false, error: null, lastSuccessfulRefresh: null, synchronized: false };
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;
  private inFlight: Promise<void> | null = null;
  constructor(private fetcher: typeof fetch, private intervalMs = 20_000, private now = () => new Date().toISOString()) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: Listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private emit() { for (const l of this.listeners) l(this.snapshot); }
  private set(next: Partial<BNLStatusSnapshot>) { this.snapshot = { ...this.snapshot, ...next }; this.emit(); }
  start() { void this.refresh(); this.intervalId = setInterval(() => void this.refresh(), this.intervalMs); if (typeof window !== "undefined") window.addEventListener("focus", this.refreshOnEvent); if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.refreshOnVisible); }
  stop() { if (this.intervalId) clearInterval(this.intervalId); this.intervalId = null; if (typeof window !== "undefined") window.removeEventListener("focus", this.refreshOnEvent); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.refreshOnVisible); this.abort?.abort(); this.abort = null; this.inFlight = null; }
  refreshOnEvent = () => this.refresh();
  refreshOnVisible = () => (typeof document === "undefined" || document.visibilityState === "visible" ? this.refresh() : Promise.resolve());
  refresh = async () => {
    if (this.inFlight) return this.inFlight;
    this.abort = new AbortController();
    const first = this.snapshot.loading && !this.snapshot.lastSuccessfulRefresh;
    this.set({ refreshing: !first, error: null });
    this.inFlight = (async () => {
      try {
        const res = await this.fetcher("/api/bnl/status", { cache: "no-store", signal: this.abort?.signal });
        if (!res.ok) throw new Error(`BNL status request failed (${res.status})`);
        const payload = normalizeBNLStatusPayload(await res.json());
        this.set({ data: payload, loading: false, refreshing: false, error: null, lastSuccessfulRefresh: this.now(), synchronized: true });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.error("[bnl-status] refresh failed", error);
        const message = error instanceof Error && /BNL status request failed \(\d+\)/.test(error.message) ? error.message : "BNL status synchronization failed";
        this.set({ loading: false, refreshing: false, error: message, synchronized: Boolean(this.snapshot.lastSuccessfulRefresh) });
      } finally { this.inFlight = null; this.abort = null; }
    })();
    return this.inFlight;
  };
}
