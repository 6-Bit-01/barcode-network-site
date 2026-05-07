/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRuntime, getTrackRuntimeSeconds } from "@/lib/queue-types";
import type { QueueEntry, QueueState } from "@/lib/queue-types";

type Tab = "active" | "completed" | "removed";

function sourceLabel(entry: QueueEntry): string {
  return (entry.sourceType ?? "other").toUpperCase();
}

function openUrl(entry: QueueEntry): string {
  return entry.fileUrl || entry.link;
}

function embedUrl(entry: QueueEntry): string | null {
  const url = openUrl(entry);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (entry.sourceType === "youtube") {
      const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (entry.sourceType === "spotify") {
      return `https://open.spotify.com/embed${parsed.pathname}`;
    }
    if (entry.sourceType === "soundcloud") {
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return null;
  }
  return null;
}

function durationLabel(entry: QueueEntry): string {
  const duration = formatRuntime(getTrackRuntimeSeconds(entry));
  return entry.durationIsEstimate ? `${duration} estimated / pending` : `${duration} detected`;
}

export function AdminRadioQueueControl() {
  const [state, setState] = useState<QueueState | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [player, setPlayer] = useState<QueueEntry | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/queue", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Admin authentication required. Log in at /admin first." : "Queue control unavailable.");
      return;
    }
    setError(null);
    setState(await res.json());
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function action(id: string, next: "finish" | "remove" | "priority" | "spotlight") {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: next }) });
    if (res.ok) setState(await res.json());
  }

  async function toggleOpen(isOpen: boolean) {
    const res = await fetch("/api/admin/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setOpen", isOpen }) });
    if (res.ok) await load();
  }

  async function copy(entry: QueueEntry) {
    await navigator.clipboard.writeText(openUrl(entry));
  }

  const lanes = useMemo(() => {
    const active = state?.queue ?? [];
    return {
      priority: active.filter((entry) => entry.lane === "priority"),
      wheel: active.filter((entry) => entry.lane === "wheel"),
      regular: active.filter((entry) => !entry.lane || entry.lane === "regular"),
      spotlight: state?.spotlight ?? [],
    };
  }, [state]);

  const runtime = state?.publicStatus?.estimatedRuntimeSeconds ?? 0;

  if (error) return <div className="border border-danger/40 bg-danger/5 p-6 text-danger">{error}</div>;

  return (
    <div className="pb-40 space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="border border-border bg-surface p-4"><p className="text-xs text-muted">Queue</p><p className={state?.publicStatus?.isOpen ? "text-accent" : "text-danger"}>{state?.publicStatus?.isOpen ? "Open" : "Closed"}</p></div>
        <div className="border border-border bg-surface p-4"><p className="text-xs text-muted">Active count</p><p>{state?.publicStatus?.activeCount ?? "—"}</p></div>
        <div className="border border-border bg-surface p-4"><p className="text-xs text-muted">Runtime</p><p>{formatRuntime(runtime)}</p></div>
        <div className="border border-border bg-surface p-4"><p className="text-xs text-muted">Pressure</p><p>{state?.publicStatus?.pressure ?? "syncing"}</p></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => toggleOpen(true)} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Queue</button>
        <button onClick={() => toggleOpen(false)} className="border border-danger/50 px-4 py-2 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background">Close Queue</button>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(["active", "completed", "removed"] as Tab[]).map((key) => <button key={key} onClick={() => setTab(key)} className={`px-4 py-3 text-xs uppercase tracking-widest ${tab === key ? "text-accent border-b border-accent" : "text-muted"}`}>{key === "active" ? "Active Queue" : key === "completed" ? "Completed Tracks" : "Removed"}</button>)}
      </div>

      {tab === "active" && <div className="grid gap-5 xl:grid-cols-2">
        <Lane title="Priority Lane" tracks={lanes.priority} onAction={action} onPlayer={setPlayer} onCopy={copy} />
        <Lane title="Wheel Winners" tracks={lanes.wheel} onAction={action} onPlayer={setPlayer} onCopy={copy} />
        <Lane title="Regular Queue" tracks={lanes.regular} onAction={action} onPlayer={setPlayer} onCopy={copy} />
        <Lane title="Spotlight List" tracks={lanes.spotlight} onAction={action} onPlayer={setPlayer} onCopy={copy} spotlightOnly />
      </div>}

      {tab === "completed" && <Lane title="Completed Tracks" tracks={state?.history ?? []} onAction={action} onPlayer={setPlayer} onCopy={copy} historyOnly />}
      {tab === "removed" && <Lane title="Removed" tracks={state?.removed ?? []} onAction={action} onPlayer={setPlayer} onCopy={copy} historyOnly />}

      {player && <div className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/40 bg-background/95 backdrop-blur p-4 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs uppercase tracking-[0.35em] text-accent">Loaded Player</p><h3 className="text-lg font-bold">{player.artist} — {player.title}</h3><p className="text-xs text-muted">{sourceLabel(player)} · {durationLabel(player)}</p></div>
            <div className="flex gap-2"><button onClick={() => setMinimized(!minimized)} className="border border-border px-3 py-2 text-xs text-muted">{minimized ? "Expand" : "Minimize"}</button><button onClick={() => setPlayer(null)} className="border border-danger/40 px-3 py-2 text-xs text-danger">Close</button></div>
          </div>
          {!minimized && <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] items-end">
            <div className="min-h-20">
              {player.sourceType === "upload" && player.fileUrl && <audio src={player.fileUrl} controls className="w-full" />}
              {player.sourceType !== "upload" && embedUrl(player) && <iframe title="Queue preview" src={embedUrl(player) ?? undefined} className="w-full h-48 border border-border" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" />}
              {player.sourceType !== "upload" && !embedUrl(player) && <div className="border border-border p-6 text-sm text-muted">No embeddable preview available for this source. Use Open Link or Copy Link.</div>}
            </div>
            <div className="flex flex-wrap gap-2"><a href={openUrl(player)} target="_blank" rel="noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent">Open Link</a><button onClick={() => copy(player)} className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted">Copy Link</button></div>
          </div>}
        </div>
      </div>}
    </div>
  );
}

function Lane({ title, tracks, onAction, onPlayer, onCopy, spotlightOnly = false, historyOnly = false }: { title: string; tracks: QueueEntry[]; onAction: (id: string, action: "finish" | "remove" | "priority" | "spotlight") => void; onPlayer: (entry: QueueEntry) => void; onCopy: (entry: QueueEntry) => void; spotlightOnly?: boolean; historyOnly?: boolean }) {
  return <section className="border border-border bg-surface p-4"><div className="flex items-center justify-between mb-4"><h2 className="text-sm uppercase tracking-[0.25em] text-foreground">{title}</h2><span className="text-xs text-muted">{tracks.length}</span></div><div className="space-y-3">{tracks.length === 0 ? <p className="text-sm text-muted border border-border/60 p-4">No tracks in this lane.</p> : tracks.map((entry) => <article key={`${title}-${entry.id}`} className="border border-border bg-background/40 p-4 space-y-3"><div><p className="font-bold">{entry.artist} — {entry.title}</p><p className="text-xs text-muted">{sourceLabel(entry)} · {durationLabel(entry)} · {entry.fileName || entry.link}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => onPlayer(entry)} className="border border-accent px-3 py-1.5 text-xs text-accent">Load in Player</button><a href={openUrl(entry)} target="_blank" rel="noreferrer" className="border border-border px-3 py-1.5 text-xs text-muted">Open Link</a><button onClick={() => onCopy(entry)} className="border border-border px-3 py-1.5 text-xs text-muted">Copy Link</button>{!historyOnly && !spotlightOnly && <><button onClick={() => onAction(entry.id, "finish")} className="border border-accent/50 px-3 py-1.5 text-xs text-accent">Finish</button><button onClick={() => onAction(entry.id, "remove")} className="border border-danger/40 px-3 py-1.5 text-xs text-danger">Remove</button><button onClick={() => onAction(entry.id, "priority")} className="border border-[#ffaa00]/50 px-3 py-1.5 text-xs text-[#ffaa00]">Move to Priority Lane</button><button onClick={() => onAction(entry.id, "spotlight")} className="border border-foreground/40 px-3 py-1.5 text-xs text-foreground">Spotlight</button></>}</div></article>)}</div></section>;
}
