"use client";

import { useBNLStatus } from "@/components/useBNLStatus";

function bnlTone(online: boolean) {
  return online ? "text-foreground" : "text-foreground/70";
}

export function BNLNetworkRelayTicker() {
  const { data } = useBNLStatus();
  const online = data.status === "ONLINE";

  return (
    <>
      <div aria-hidden className="h-8" />
      <div className="fixed left-0 right-0 top-14 z-40 border-b border-border/80 bg-black px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-hidden">
          <span className="shrink-0 text-white/85">&gt; NETWORK RELAY // BNL-01</span>
          <div className="bnl-relay-scroll min-w-0">
            <div className="bnl-relay-scroll-track">
              <span>
                STATUS <span className={bnlTone(online)}>{data.status}</span> :: MODE {data.mode} :: MESSAGE {data.message}
                {data.lastSeen ? ` :: LAST SEEN ${data.lastSeen}` : ""} ::
              </span>
              <span aria-hidden>
                STATUS <span className={bnlTone(online)}>{data.status}</span> :: MODE {data.mode} :: MESSAGE {data.message}
                {data.lastSeen ? ` :: LAST SEEN ${data.lastSeen}` : ""} ::
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
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
