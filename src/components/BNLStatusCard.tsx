"use client";

import { useBNLStatus } from "@/components/useBNLStatus";

export function BNLStatusCard() {
  const { data, loading } = useBNLStatus();

  return (
    <div className="bg-surface border border-border p-6 font-mono">
      <p className="text-xs text-muted mb-4">&gt; BNL-01 // STATUS RELAY</p>
      <div className="space-y-1 text-sm text-foreground/70">
        <p>
          &gt; STATUS: <span className={data.status === "ONLINE" ? "text-accent" : "text-muted"}>{data.status}</span>
        </p>
        <p>&gt; MODE: {data.mode}</p>
        <p>&gt; CURRENT_DIRECTIVE: {data.currentDirective}</p>
        <p>&gt; MESSAGE: {data.message}</p>
        <p>&gt; LAST_SEEN: {data.lastSeen ?? "NULL"}</p>
        {loading ? <p className="text-muted">&gt; FETCHING RELAY...</p> : null}
      </div>
    </div>
  );
}
