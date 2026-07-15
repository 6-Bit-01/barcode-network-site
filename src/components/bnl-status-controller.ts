import { BNLStatus, FALLBACK_STATUS } from "@/components/bnl-status";

export type BNLStatusSnapshot = { data: BNLStatus; loading: boolean; refreshing: boolean; error: string | null; lastSuccessfulRefresh: string | null };
type Listener = (snapshot: BNLStatusSnapshot) => void;

export class BNLStatusController {
  private snapshot: BNLStatusSnapshot = { data: FALLBACK_STATUS, loading: true, refreshing: false, error: null, lastSuccessfulRefresh: null };
  private listeners = new Set<Listener>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private abort: AbortController | null = null;
  private inFlight: Promise<void> | null = null;
  constructor(private fetcher: typeof fetch, private intervalMs = 20_000, private now = () => new Date().toISOString()) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: Listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private emit() { for (const l of this.listeners) l(this.snapshot); }
  private set(next: Partial<BNLStatusSnapshot>) { this.snapshot = { ...this.snapshot, ...next }; this.emit(); }
  start() {
    void this.refresh();
    this.intervalId = setInterval(() => void this.refresh(), this.intervalMs);
    if (typeof window !== "undefined") window.addEventListener("focus", this.refreshOnEvent);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.refreshOnVisible);
  }
  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    if (typeof window !== "undefined") window.removeEventListener("focus", this.refreshOnEvent);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.refreshOnVisible);
    this.abort?.abort();
    this.abort = null;
    this.inFlight = null;
  }
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
        const payload = (await res.json()) as BNLStatus;
        this.set({ data: payload, loading: false, refreshing: false, error: null, lastSuccessfulRefresh: this.now() });
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        this.set({ loading: false, refreshing: false, error: error instanceof Error ? error.message : "Failed to load BNL status" });
      } finally { this.inFlight = null; this.abort = null; }
    })();
    return this.inFlight;
  };
}
