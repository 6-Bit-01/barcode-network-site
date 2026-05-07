/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes */
"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRuntime } from "@/lib/queue-types";
import type { QueuePublicStatus } from "@/lib/queue-types";

type Mode = "link" | "upload";
type ReadState = "idle" | "checking" | "reading" | "detected" | "pending";

function pressureLabel(status: QueuePublicStatus | null): string {
  if (!status) return "Syncing";
  return `${status.pressure.toUpperCase()} / ${status.activeCount}/${status.capacity}`;
}

function readAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration) : null;
      cleanup();
      resolve(duration);
    };
    audio.onerror = () => {
      cleanup();
      resolve(null);
    };
    audio.src = url;
  });
}

export function RadioQueueForm() {
  const [status, setStatus] = useState<QueuePublicStatus | null>(null);
  const [mode, setMode] = useState<Mode>("link");
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const [readState, setReadState] = useState<ReadState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setStatus(payload.status ?? null);
    }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (mode !== "link" || !link.trim()) {
      if (mode === "link") {
        setReadState("idle");
        setDetectedDuration(null);
      }
      return;
    }
    setReadState("checking");
    setDetectedDuration(null);
    const timer = window.setTimeout(() => {
      if (!cancelled) setReadState("pending");
    }, 650);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [link, mode]);

  async function onFileSelected(next: File | null) {
    setFile(next);
    setDetectedDuration(null);
    setReadState(next ? "reading" : "idle");
    if (!next) return;
    const duration = await readAudioDuration(next);
    setDetectedDuration(duration);
    setReadState(duration ? "detected" : "pending");
  }

  const checkCopy = useMemo(() => {
    if (readState === "checking") return "Checking track…";
    if (readState === "reading") return "Reading source…";
    if (readState === "detected" && detectedDuration) return `Duration detected: ${formatRuntime(detectedDuration)}`;
    if (readState === "pending") return "Duration pending — queue will buffer this track internally.";
    return "Paste a supported link or select an MP3/WAV to begin source checks.";
  }, [detectedDuration, readState]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("mode", mode);
      body.set("artist", artist.trim());
      body.set("title", title.trim());
      if (detectedDuration) body.set("detectedDurationSeconds", String(detectedDuration));
      if (mode === "upload" && file) body.set("file", file);
      if (mode === "link") body.set("link", link.trim());

      const res = await fetch("/api/queue", { method: "POST", body });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Submission failed");
      setArtist("");
      setTitle("");
      setLink("");
      setFile(null);
      setDetectedDuration(null);
      setReadState("idle");
      setSuccess("Track entered the Regular Queue.");
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <aside className="border border-border bg-surface p-5 space-y-4">
        <p className="text-xs uppercase tracking-[0.35em] text-muted">// Queue Signal</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue</p><p className={status?.isOpen ? "text-accent" : "text-danger"}>{status?.isOpen ? "Open" : "Closed"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Active transmissions</p><p>{status?.activeCount ?? "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Estimated active runtime</p><p>{status ? formatRuntime(status.estimatedRuntimeSeconds) : "—"}</p></div>
          <div className="border border-border p-3"><p className="text-xs text-muted">Queue pressure</p><p>{pressureLabel(status)}</p></div>
        </div>
        <p className="text-xs text-muted">Exact queue order is visible only to show control while v1 is being tuned.</p>
      </aside>

      <form onSubmit={submit} className="border border-border bg-surface p-5 space-y-5">
        {success && <div className="border border-accent/40 bg-accent/5 p-4"><p className="text-accent font-bold">✓ {success}</p><p className="text-xs text-muted mt-1">Upgrade to Priority placeholder reserved for a future flow. Stripe is not active in this v1 control pass.</p></div>}
        {error && <div className="border border-danger/40 bg-danger/5 p-4 text-danger text-sm">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setMode("link")} className={`border p-4 text-left ${mode === "link" ? "border-accent bg-accent/10" : "border-border"}`}><span className="text-xs uppercase tracking-widest text-muted">Submit a link</span><p className="text-sm mt-1">YouTube, SoundCloud, Spotify, or other URL.</p></button>
          <button type="button" onClick={() => setMode("upload")} className={`border p-4 text-left ${mode === "upload" ? "border-accent bg-accent/10" : "border-border"}`}><span className="text-xs uppercase tracking-widest text-muted">Upload MP3/WAV</span><p className="text-sm mt-1">Audio files up to 100MB.</p></button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Artist</span><input value={artist} onChange={(e) => setArtist(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
          <label className="space-y-2"><span className="text-xs uppercase tracking-widest text-muted">Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
        </div>

        {mode === "link" ? (
          <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">Track link</span><input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://soundcloud.com/..." className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
        ) : (
          <label className="space-y-2 block"><span className="text-xs uppercase tracking-widest text-muted">MP3/WAV file</span><input type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/wave,.mp3,.wav" onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" required /></label>
        )}

        <div className="border border-border bg-background/40 p-3 text-sm text-muted">{checkCopy}</div>
        <button disabled={submitting || status?.isOpen === false} className="w-full border border-accent px-4 py-3 text-sm uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">{submitting ? "Submitting…" : "Enter Regular Queue"}</button>
      </form>
    </div>
  );
}
