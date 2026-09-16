import type { LiveOverlayTikTokSync, LiveOverlayYouTubeSync } from "./live-overlay-resolver";

export type VideoSync = LiveOverlayYouTubeSync | LiveOverlayTikTokSync;
export type VideoStartPhase = "idle" | "preparing" | "scheduled" | "released" | "playing" | "failed" | "disposed";
export const VIDEO_START_DELAY_MS = 3_000;
export const VIDEO_READY_TIMEOUT_MS = 15_000;
export const validVideoPrepareToken = (value: unknown): value is string => typeof value === "string" && /^prepare-[a-zA-Z0-9-]{16,80}$/.test(value);

type StartOptions = {
  hold: (seconds: number) => void;
  play: () => void;
  drain: () => Promise<unknown>;
  write: (state: "paused" | "playing", seconds: number, token?: string, delayMs?: number) => Promise<{ sync: VideoSync; delayMs: number }>;
  ready: (token: string) => Promise<boolean>;
  changed: (phase: VideoStartPhase, message: string) => void;
  now?: () => number;
  token?: () => string;
  schedule?: typeof setTimeout;
  clear?: typeof clearTimeout;
};

/** Owns only intentional starts/resumes. Normal playing heartbeats remain unchanged. */
export class CoordinatedVideoStart {
  phase: VideoStartPhase = "idle";
  position = 0;
  private options: StartOptions;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private now: () => number;
  private schedule: typeof setTimeout;
  private clear: typeof clearTimeout;

  constructor(options: StartOptions) {
    this.options = options;
    this.now = options.now ?? (() => performance.now());
    // Browser timers must retain their Window receiver.
    this.schedule = options.schedule ?? globalThis.setTimeout.bind(globalThis);
    this.clear = options.clear ?? globalThis.clearTimeout.bind(globalThis);
  }

  get pending() { return this.phase === "preparing" || this.phase === "scheduled" || this.phase === "released"; }
  get blocksPublish() { return this.pending || this.phase === "failed" || this.phase === "disposed"; }
  private change(phase: VideoStartPhase, message = "") { this.phase = phase; this.options.changed(phase, message); }
  private clearTimer() { if (this.timer !== null) this.clear(this.timer); this.timer = null; }
  private write(state: "paused" | "playing", token?: string, delayMs?: number) {
    const position = this.position;
    const next = this.serial.then(() => this.options.drain()).then(() => {
      if (this.phase === "disposed") throw new Error("Player was replaced");
      return this.options.write(state, position, token, delayMs);
    });
    this.serial = next.catch(() => undefined);
    return next;
  }

  /** Return true when the native play event is held, false for actual released playback. */
  onPlaying(seconds: number): boolean {
    if (this.phase === "disposed") return true;
    if (this.phase === "released") { this.clearTimer(); this.change("playing"); return false; }
    if (this.phase === "playing") return false;
    if (this.pending) { this.options.hold(this.position); return true; }
    this.position = Math.max(0, seconds);
    const generation = ++this.generation;
    this.change("preparing", "Preparing overlay — both players are held.");
    try { this.options.hold(this.position); } catch { this.fail(generation, "Could not pause the host. Retry Play."); return true; }
    const token = this.options.token?.() ?? `prepare-${crypto.randomUUID()}`;
    void this.prepare(generation, token);
    return true;
  }

  onPaused(): boolean {
    if (this.pending || this.phase === "failed" || this.phase === "disposed") return true;
    this.change("idle");
    return false;
  }

  private async prepare(generation: number, token: string) {
    try {
      await this.write("paused", token);
      if (generation !== this.generation) return;
      const expires = this.now() + VIDEO_READY_TIMEOUT_MS;
      const check = async () => {
        if (generation !== this.generation) return;
        try {
          const ready = await this.options.ready(token);
          if (generation !== this.generation) return;
          if (!ready) {
            if (this.now() >= expires) { this.fail(generation, "Overlay did not become ready. Check the Studio source, then retry Play."); return; }
            this.timer = this.schedule(() => { void check(); }, 1_000);
            return;
          }
          const result = await this.write("playing", token, VIDEO_START_DELAY_MS);
          if (generation !== this.generation) return;
          if (!result.sync.startToken || !result.sync.scheduledStartAt || result.delayMs < 500) throw new Error("Late or missing start acknowledgement");
          this.change("scheduled", "Overlay ready — starting together in about three seconds.");
          this.timer = this.schedule(() => {
            if (generation !== this.generation) return;
            this.change("released", "Starting both players…");
            try { this.options.play(); } catch { this.fail(generation, "Playback could not start. Retry Play."); return; }
            if (this.phase === "released") this.timer = this.schedule(() => this.fail(generation, "Host playback did not start. Retry Play."), 5_000);
          }, result.delayMs);
        } catch { this.fail(generation, "Could not confirm the shared start. Host paused; retry Play."); }
      };
      await check();
    } catch { this.fail(generation, "Could not prepare the overlay. Retry Play."); }
  }

  private fail(generation: number, message: string) {
    if (generation !== this.generation || this.phase === "disposed") return;
    ++this.generation;
    this.clearTimer();
    this.change("failed", message);
    try { this.options.hold(this.position); } catch { /* Error stays visible; never report playback. */ }
    void this.write("paused").catch(() => undefined);
  }

  cancel(dispose = false) {
    const pending = this.pending || this.phase === "failed";
    ++this.generation;
    this.clearTimer();
    this.change(dispose ? "disposed" : "idle", dispose ? "" : "Start cancelled.");
    if (pending) {
      try { this.options.hold(this.position); } catch { /* Cleanup must still invalidate the start. */ }
      // Serialize after any outstanding prepare/start write, including a late response.
      if (!dispose) void this.write("paused").catch(() => undefined);
    }
  }
}

/** One bounded receiver timer per server-issued start; never re-arm a released packet. */
export class VideoStartDeadline {
  private token: string | null = null;
  private released = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private schedule = globalThis.setTimeout.bind(globalThis);
  private clear = globalThis.clearTimeout.bind(globalThis);

  constructor(timers?: { schedule: typeof setTimeout; clear: typeof clearTimeout }) {
    if (timers) { this.schedule = timers.schedule; this.clear = timers.clear; }
  }

  hold(sync: VideoSync, serverNowMs: number, release: () => void): boolean {
    if (sync.playbackState !== "playing" || !sync.startToken || !sync.scheduledStartAt) { this.cancel(); return false; }
    if (this.token === sync.startToken) return !this.released;
    this.cancel();
    this.token = sync.startToken;
    const delay = Date.parse(sync.scheduledStartAt) - serverNowMs;
    if (!Number.isFinite(delay) || delay <= 0) { this.released = true; return false; }
    const token = this.token;
    this.timer = this.schedule(() => {
      if (this.token !== token) return;
      this.timer = null;
      this.released = true;
      release();
    }, delay);
    return true;
  }

  cancel() { if (this.timer !== null) this.clear(this.timer); this.timer = null; this.token = null; this.released = false; }
}

/** Readiness means the provider actually played muted and then confirmed pause. */
export class VideoReceiverPreparation {
  token: string | null = null;
  position = 0;
  private phase: "warming" | "pausing" | "held" | "ready" | null = null;
  private attempts = 0;
  private inFlight = false;

  apply(sync: VideoSync, warm: (seconds: number) => void, acknowledge: (token: string) => Promise<boolean>): boolean {
    if (!sync.prepareToken || sync.playbackState !== "paused" || sync.scheduledStartAt) { this.cancel(); return false; }
    if (this.token !== sync.prepareToken) {
      this.token = sync.prepareToken;
      this.position = sync.currentTimeSeconds;
      this.phase = "warming";
      this.attempts = 0;
      this.inFlight = false;
      warm(this.position);
    }
    if (this.phase === "held" && !this.inFlight && this.attempts < 2) {
      const token = this.token;
      this.inFlight = true;
      this.attempts++;
      void acknowledge(token).then((ready) => { if (ready && this.token === token) this.phase = "ready"; }).catch(() => undefined).finally(() => { if (this.token === token) this.inFlight = false; });
    }
    return true;
  }

  onState(state: number, hold: (seconds: number) => void) {
    if (this.phase === "warming" && state === 1) { this.phase = "pausing"; hold(this.position); }
    else if (this.phase === "pausing" && state === 2) this.phase = "held";
  }

  cancel() { this.token = null; this.phase = null; this.inFlight = false; }
}
