"use client";

import { useState, useEffect, useCallback } from "react";
import type { QueueState } from "@/lib/queue-types";

const POLL_INTERVAL = 10_000; // 10 seconds

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
    } catch (err) {
      console.error("[useQueue]", err);
      setError("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchQueue();
    const interval = setInterval(fetchQueue, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  return { state, loading, error, refresh: fetchQueue };
}
