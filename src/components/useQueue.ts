"use client";

import { useState, useEffect, useCallback } from "react";
import type { QueueState } from "@/lib/queue-types";
import { PUBLIC_QUEUE_POLL_INTERVAL_MS } from "@/lib/redis-polling-budget";

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
    } catch (err) {
      console.error("[useQueue]", err);
      setError("Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void fetchQueue(), 0);
    const interval = setInterval(fetchQueue, POLL_INTERVAL);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchQueue]);

  return { state, loading, error, refresh: fetchQueue };
}
