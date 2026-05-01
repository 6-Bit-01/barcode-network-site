"use client";

import { useEffect, useState } from "react";
import { BNLStatus, FALLBACK_STATUS } from "@/components/bnl-status";

export function useBNLStatus() {
  const [data, setData] = useState<BNLStatus>(FALLBACK_STATUS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadStatus = async (isBackgroundRefresh = false) => {
      try {
        const res = await fetch("/api/bnl/status", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load BNL status");
        const payload = (await res.json()) as BNLStatus;
        if (mounted) setData(payload);
      } catch {
        if (mounted && !isBackgroundRefresh) setData(FALLBACK_STATUS);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadStatus();
    const interval = window.setInterval(() => loadStatus(true), 20_000);
    const onFocus = () => loadStatus(true);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return { data, loading };
}
