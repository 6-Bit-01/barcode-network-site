"use client";

import { useBNLStatus } from "@/components/useBNLStatus";

function bnlTone(online: boolean) {
  return online ? "text-accent" : "text-muted";
}

export function BNLNetworkRelayTicker() {
  const { data } = useBNLStatus();
  const online = data.status === "ONLINE";

  return (
    <div className="border-b border-border bg-surface/95 px-4 py-2 text-xs uppercase tracking-[0.18em] text-foreground/80">
      <div className="mx-auto flex max-w-7xl items-center gap-4 overflow-hidden">
        <span className="shrink-0 border border-border-light px-2 py-1 text-[10px] tracking-[0.25em] text-muted">
          BNL-01 RELAY
        </span>
        <div className="bnl-relay-scroll min-w-0">
          <div className="bnl-relay-scroll-track">
            <span>
              STATUS: <span className={bnlTone(online)}>{data.status}</span> · MODE: {data.mode} · MESSAGE: {data.message}
              {data.lastSeen ? ` · LAST SEEN: ${data.lastSeen}` : ""} ·
            </span>
            <span aria-hidden>
              STATUS: <span className={bnlTone(online)}>{data.status}</span> · MODE: {data.mode} · MESSAGE: {data.message}
              {data.lastSeen ? ` · LAST SEEN: ${data.lastSeen}` : ""} ·
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BNLRelayModule({ title }: { title: string }) {
  const { data, loading } = useBNLStatus();
  const online = data.status === "ONLINE";

  return (
    <div className="border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xs uppercase tracking-[0.35em] text-muted">{title}</h2>
        <span className={`text-xs uppercase tracking-[0.2em] ${bnlTone(online)}`}>{data.status}</span>
      </div>
      <div className="space-y-2 text-sm text-foreground/70">
        <p>&gt; MODE: {data.mode}</p>
        <p>&gt; MESSAGE: {data.message}</p>
        <p>&gt; LAST_SEEN: {data.lastSeen ?? "NULL"}</p>
        {loading ? <p className="text-muted">&gt; FETCHING RELAY...</p> : null}
      </div>
    </div>
  );
}
