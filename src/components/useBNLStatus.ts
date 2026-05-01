"use client";

import { useEffect, useState } from "react";
import { BNLStatus, FALLBACK_STATUS } from "@/components/bnl-status";

export function useBNLStatus() {
  const [data, setData] = useState<BNLStatus>(FALLBACK_STATUS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadStatus = async () => {
      try {
        const res = await fetch("/api/bnl/status", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load BNL status");
        const payload = (await res.json()) as BNLStatus;
        if (mounted) setData(payload);
      } catch {
        if (mounted) setData(FALLBACK_STATUS);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading };
}
