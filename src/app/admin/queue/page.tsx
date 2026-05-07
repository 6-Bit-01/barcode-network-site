"use client";

import { useEffect, useState } from "react";
import type { QueueAdminAction, QueueState, QueueTrack, RadioQueueLane } from "@/lib/queue-types";

type AdminTab = "active" | "completed" | "removed";

const LANE_LABELS: Record<RadioQueueLane, string> = {
  priority: "Priority Lane",
  wheel: "Wheel Winners",
  regular: "Regular Queue",
};

function formatRuntime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${mins}m ${String(secs).padStart(2, "0")}s`;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function trackRuntime(track: QueueTrack): string {
  const seconds = track.detectedDurationSeconds ?? track.fallbackDurationSeconds;
  const source = track.detectedDurationSeconds ? track.durationSource : "fallback/unknown";
  return `${formatRuntime(seconds)} · ${source}`;
}

export default function AdminQueuePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [passInput, setPassInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [state, setState] = useState<QueueState | null>(null);
  const [tab, setTab] = useState<AdminTab>("active");
  const [actionError, setActionError] = useState("");

  async function verify() {
    try {
      const res = await fetch("/api/admin/verify", { cache: "no-store" });
      setAuthenticated(res.ok);
      if (res.ok) await loadQueue();
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadQueue() {
    const res = await fetch("/api/admin/queue", { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }

  useEffect(() => {
    queueMicrotask(() => {
      void verify();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin() {
    setAuthError("");
    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: passInput }),
    });
    if (res.ok) {
      setAuthenticated(true);
      setPassInput("");
      await loadQueue();
    } else {
      setAuthError("ACCESS DENIED");
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthenticated(false);
  }

  async function queueAction(action: QueueAdminAction, id?: string, queueOpen?: boolean) {
    setActionError("");
    const res = await fetch("/api/admin/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, queueOpen }),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionError(data.error || "Queue action failed");
      return;
    }
    setState(data);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setActionError("Clipboard unavailable. Open the link and copy it manually.");
    }
  }

  if (authLoading) return <div className="pt-14 min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.5em] text-muted animate-pulse">{"// AUTHENTICATING..."}</p></div>;
  if (!authenticated) return <div className="pt-14 min-h-screen flex items-center justify-center"><div className="border border-border bg-surface p-8 max-w-sm w-full"><p className="text-xs uppercase tracking-[0.5em] text-muted mb-6">{"// ADMIN ACCESS REQUIRED"}</p><div className="space-y-4"><input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} placeholder="Enter access code" className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none" /><button onClick={handleLogin} className="w-full px-4 py-2.5 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all">Authenticate</button>{authError && <p className="text-xs text-danger">{authError}</p>}</div></div></div>;

  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">{"// ADMIN: BARCODE RADIO QUEUE"}</p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2"><span className="text-accent text-glow">Queue</span> Control</h1>
            <p className="text-sm text-muted">Skeleton controls only. Stripe, BNL automation, and Discord routing are intentionally not connected.</p>
          </div>
          <button onClick={handleLogout} className="px-4 py-2 text-xs uppercase tracking-widest border border-danger/40 text-danger hover:bg-danger hover:text-background transition-all">Logout</button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {state && <RuntimePanel state={state} onToggle={(open) => queueAction("setOpen", undefined, open)} />}
        {actionError && <p className="border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{actionError}</p>}

        <div className="flex flex-wrap gap-2">
          {(["active", "completed", "removed"] as AdminTab[]).map((name) => (
            <button key={name} onClick={() => setTab(name)} className={`border px-4 py-2 text-xs uppercase tracking-widest transition-all ${tab === name ? "border-accent text-accent" : "border-border text-muted hover:border-accent hover:text-accent"}`}>
              {name === "active" ? "Active Queue" : name === "completed" ? "Completed Tracks" : "Removed"}
            </button>
          ))}
        </div>

        {!state ? <p className="text-muted">Loading queue...</p> : (
          <div className="space-y-6">
            {tab === "active" && <ActiveQueue state={state} onAction={queueAction} onCopy={copyLink} />}
            {tab === "completed" && <TrackList title="Completed Tracks" tracks={state.completed} empty="No completed tracks yet." onAction={queueAction} onCopy={copyLink} readonly />}
            {tab === "removed" && <TrackList title="Removed" tracks={state.removed} empty="No removed tracks yet." onAction={queueAction} onCopy={copyLink} readonly />}
          </div>
        )}
      </section>
    </main>
  );
}

function RuntimePanel({ state, onToggle }: { state: QueueState; onToggle: (open: boolean) => void }) {
  const items = [
    ["Active track count", String(state.summary.activeTrackCount)],
    ["Active runtime", formatRuntime(state.summary.activeRuntimeSeconds)],
    ["Completed count", String(state.summary.completedCount)],
    ["Completed runtime", formatRuntime(state.summary.completedRuntimeSeconds)],
    ["Projected total session", formatRuntime(state.summary.projectedTotalSessionSeconds)],
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto] border border-border bg-surface p-5">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(([label, value]) => <div key={label}><dt className="text-[10px] uppercase tracking-widest text-muted">{label}</dt><dd className="text-lg text-foreground">{value}</dd></div>)}
      </dl>
      <button onClick={() => onToggle(!state.summary.queueOpen)} className={`border px-4 py-2 text-xs uppercase tracking-widest ${state.summary.queueOpen ? "border-accent text-accent" : "border-danger text-danger"}`}>
        Queue {state.summary.queueOpen ? "Open" : "Closed"}
      </button>
    </div>
  );
}

function ActiveQueue({ state, onAction, onCopy }: { state: QueueState; onAction: (action: QueueAdminAction, id?: string) => void; onCopy: (url: string) => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        {(["priority", "wheel", "regular"] as RadioQueueLane[]).map((lane) => (
          <TrackList key={lane} title={LANE_LABELS[lane]} tracks={state.active[lane]} empty={`No tracks in ${LANE_LABELS[lane]}.`} onAction={onAction} onCopy={onCopy} />
        ))}
      </div>
      <TrackList title="Spotlight list" tracks={state.spotlight} empty="No spotlight tracks yet." onAction={onAction} onCopy={onCopy} readonly />
    </div>
  );
}

function TrackList({ title, tracks, empty, onAction, onCopy, readonly = false }: { title: string; tracks: QueueTrack[]; empty: string; onAction: (action: QueueAdminAction, id?: string) => void; onCopy: (url: string) => void; readonly?: boolean }) {
  return (
    <section className="border border-border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm uppercase tracking-[0.3em] text-accent">{title}</h2>
        <span className="text-xs text-muted">{tracks.length} tracks</span>
      </div>
      {tracks.length === 0 ? <p className="border border-border bg-background p-4 text-sm text-muted">{empty}</p> : <div className="space-y-3">{tracks.map((track) => <TrackCard key={`${title}-${track.id}`} track={track} readonly={readonly} onAction={onAction} onCopy={onCopy} />)}</div>}
    </section>
  );
}

function TrackCard({ track, readonly, onAction, onCopy }: { track: QueueTrack; readonly: boolean; onAction: (action: QueueAdminAction, id?: string) => void; onCopy: (url: string) => void }) {
  return (
    <article className="border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground">{track.artistName} — {track.songTitle}</p>
          <p className="break-all text-xs text-muted">{track.songUrl}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wider text-muted">
            <span>{track.lane}</span><span>·</span><span>{track.status}</span><span>·</span><span>{trackRuntime(track)}</span>
          </div>
          {(track.submitterContact || track.note) && <p className="mt-2 text-xs text-muted">{track.submitterContact && `Contact: ${track.submitterContact}. `}{track.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <a href={track.songUrl} target="_blank" rel="noreferrer" className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Open Link</a>
          <button onClick={() => onCopy(track.songUrl)} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Copy Link</button>
          {!readonly && <>
            {track.lane !== "priority" && <button onClick={() => onAction("moveToPriority", track.id)} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Move to Priority Lane</button>}
            <button onClick={() => onAction("spotlight", track.id)} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Spotlight</button>
            <button onClick={() => onAction("finish", track.id)} className="border border-accent/60 px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Finish</button>
            <button onClick={() => onAction("remove", track.id)} className="border border-danger/60 px-3 py-1.5 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Remove</button>
          </>}
        </div>
      </div>
    </article>
  );
}
