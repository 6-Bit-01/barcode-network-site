"use client";

import { useEffect, useState } from "react";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue =
  | "STANDBY"
  | "OBSERVATION"
  | "ACTIVE_LIAISON"
  | "SIGNAL_DEGRADATION"
  | "RESTRICTED";

interface BNLStatus {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  lastSeen: string | null;
}

const FALLBACK_STATUS: BNLStatus = {
  status: "OFFLINE",
  mode: "STANDBY",
  message: "BNL-01 relay awaiting signal.",
  lastSeen: null,
};

export function BNLStatusCard() {
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

  return (
    <div className="bg-surface border border-border p-6 font-mono">
      <p className="text-xs text-muted mb-4">&gt; BNL-01 // STATUS RELAY</p>
      <div className="space-y-1 text-sm text-foreground/70">
        <p>
          &gt; STATUS: <span className={data.status === "ONLINE" ? "text-accent" : "text-muted"}>{data.status}</span>
        </p>
        <p>&gt; MODE: {data.mode}</p>
        <p>&gt; MESSAGE: {data.message}</p>
        <p>&gt; LAST_SEEN: {data.lastSeen ?? "NULL"}</p>
        {loading ? <p className="text-muted">&gt; FETCHING RELAY...</p> : null}
      </div>
    </div>
  );
}
