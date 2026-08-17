export const QUEUE_SESSION_CHANGED_EVENT = "barcode:queue-session-changed";

type QueueSessionResponse = {
  sessionActive?: boolean;
  isCurrentSession?: boolean;
  session?: { status?: string | null } | null;
};

export function hasActiveQueueSession(value: QueueSessionResponse | null | undefined): boolean {
  if (!value) return false;
  if (typeof value.sessionActive === "boolean") return value.sessionActive;
  if (value.isCurrentSession === false) return false;
  return Boolean(value.session && value.session.status !== "archived");
}

export function notifyQueueSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(QUEUE_SESSION_CHANGED_EVENT));
}

type SessionBoundPollingOptions = {
  intervalMs: number;
  poll: () => Promise<boolean | null>;
};

export function startSessionBoundPolling({ intervalMs, poll }: SessionBoundPollingOptions): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let stopped = false;
  let inFlight = false;
  let wakeRequested = false;
  let sessionActive = false;
  let timeoutId: number | null = null;

  const clearScheduledPoll = () => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = null;
  };

  const isVisible = () => document.visibilityState === "visible";

  const schedule = () => {
    clearScheduledPoll();
    if (stopped || !sessionActive || !isVisible()) return;
    timeoutId = window.setTimeout(() => { void run(); }, intervalMs);
  };

  const run = async () => {
    if (stopped || !isVisible()) return;
    if (inFlight) {
      wakeRequested = true;
      return;
    }

    clearScheduledPoll();
    inFlight = true;
    try {
      const nextActive = await poll();
      if (typeof nextActive === "boolean") sessionActive = nextActive;
    } catch {
      // Keep the last confirmed session state so a transient request failure
      // cannot silently stop an active-show poller.
    } finally {
      inFlight = false;
      if (stopped) return;
      if (wakeRequested) {
        wakeRequested = false;
        void run();
      } else {
        schedule();
      }
    }
  };

  const wake = () => {
    if (stopped || !isVisible()) return;
    void run();
  };
  const visibilityChanged = () => {
    if (!isVisible()) {
      clearScheduledPoll();
      return;
    }
    wake();
  };

  document.addEventListener("visibilitychange", visibilityChanged);
  window.addEventListener("focus", wake);
  window.addEventListener("pageshow", wake);
  window.addEventListener("online", wake);
  window.addEventListener(QUEUE_SESSION_CHANGED_EVENT, wake);
  wake();

  return () => {
    stopped = true;
    clearScheduledPoll();
    document.removeEventListener("visibilitychange", visibilityChanged);
    window.removeEventListener("focus", wake);
    window.removeEventListener("pageshow", wake);
    window.removeEventListener("online", wake);
    window.removeEventListener(QUEUE_SESSION_CHANGED_EVENT, wake);
  };
}
