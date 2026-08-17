"use client";

import { useState, useEffect, useCallback } from "react";
import type { QueueState } from "@/lib/queue-types";
import { PUBLIC_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";
import { hasActiveQueueSession, startSessionBoundPolling } from "@/lib/session-bound-polling";

const POLL_INTERVAL = PUBLIC_QUEUE_POLL_INTERVAL_MS;

export function useQueue() {
  const [state, setState] = useState<QueueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch queue");
      const data: QueueState = await res.json();
      setState(data);
      setError(null);
      return hasActiveQueueSession(data);
    } catch (err) {
      console.error("[useQueue]", err);
      setError("Failed to load queue");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    return startSessionBoundPolling({ intervalMs: POLL_INTERVAL, poll: fetchQueue });
  }, [fetchQueue]);

  return { state, loading, error, refresh: fetchQueue };
}
