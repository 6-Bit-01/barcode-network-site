/** One pending host start. Timers and acknowledgements cannot outlive cancellation. */
export class VideoStartGate {
  private requestId = 0;
  private phase: "idle" | "waiting" | "armed" | "released" = "idle";
  private timer: ReturnType<typeof setTimeout> | null = null;

  private schedule: typeof setTimeout;
  private unschedule: typeof clearTimeout;
  constructor(schedule = setTimeout, unschedule = clearTimeout) { this.schedule = schedule; this.unschedule = unschedule; }

  get holding(): boolean { return this.phase !== "idle"; }
  get preparing(): boolean { return this.phase === "waiting" || this.phase === "armed"; }
  isCurrent(id: number): boolean { return id === this.requestId && this.phase === "waiting"; }

  begin(): number {
    this.cancel();
    this.phase = "waiting";
    return this.requestId;
  }

  arm(id: number, delayMs: number, play: () => void): boolean {
    if (!this.isCurrent(id) || !Number.isFinite(delayMs)) return false;
    this.phase = "armed";
    this.timer = this.schedule(() => {
      if (id !== this.requestId || this.phase !== "armed") return;
      this.timer = null;
      this.phase = "released";
      play();
    }, Math.max(0, delayMs));
    return true;
  }

  consumeRelease(): boolean {
    if (this.phase !== "released") return false;
    this.phase = "idle";
    return true;
  }

  cancel(): void {
    if (this.timer !== null) this.unschedule(this.timer);
    this.timer = null;
    this.phase = "idle";
    this.requestId += 1;
  }
}

export const VIDEO_SYNCHRONIZED_START_DELAY_MS = 3_000;

export function scheduledVideoStartDelayMs(scheduledStartAt: string | undefined, serverNowMs: number): number | null {
  const startAt = typeof scheduledStartAt === "string" ? Date.parse(scheduledStartAt) : Number.NaN;
  return Number.isFinite(startAt) && Number.isFinite(serverNowMs) ? Math.max(0, startAt - serverNowMs) : null;
}

/** Polls of one server start packet prepare and release a receiver only once. */
export class VideoReceiverStartGate {
  private token: string | undefined;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiting = false;
  private schedule: typeof setTimeout;
  private unschedule: typeof clearTimeout;
  constructor(schedule = setTimeout, unschedule = clearTimeout) { this.schedule = schedule; this.unschedule = unschedule; }

  apply(token: string | undefined, delayMs: number | null, playing: boolean, prepare: () => void, play: () => void): boolean {
    if (!playing || !token) { this.cancel(); return false; }
    if (this.token === token) return this.waiting;
    this.cancel();
    if (delayMs === null) return true; // Wait for the server clock anchor.
    this.token = token;
    if (delayMs <= 0) return false; // A late receiver catches up from the current projection.
    this.waiting = true;
    prepare();
    this.timer = this.schedule(() => {
      if (this.token !== token || !this.waiting) return;
      this.timer = null;
      this.waiting = false;
      play();
    }, delayMs);
    return true;
  }

  cancel(): void {
    if (this.timer !== null) this.unschedule(this.timer);
    this.timer = null;
    this.token = undefined;
    this.waiting = false;
  }
}
