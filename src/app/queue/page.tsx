"use client";

import { FormEvent, useEffect, useState } from "react";
import type { QueueRuntimeSummary } from "@/lib/queue-types";

const DEFAULT_DURATION_SECONDS = 240;

function formatRuntime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export default function QueuePage() {
  const [summary, setSummary] = useState<QueueRuntimeSummary | null>(null);
  const [form, setForm] = useState({
    artistName: "",
    songTitle: "",
    songUrl: "",
    submitterContact: "",
    note: "",
    fallbackDurationSeconds: DEFAULT_DURATION_SECONDS,
  });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function loadQueue() {
    const res = await fetch("/api/queue", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadQueue();
    });
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/queue/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      setStatus("success");
      setMessage("Track added to the bottom of the Regular Queue.");
      setForm({ artistName: "", songTitle: "", songUrl: "", submitterContact: "", note: "", fallbackDurationSeconds: DEFAULT_DURATION_SECONDS });
      await loadQueue();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Submission failed");
    }
  }

  const queueOpen = summary?.queueOpen ?? true;

  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">{"// BARCODE RADIO QUEUE v1"}</p>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight mb-4">
            Submit to <span className="text-accent text-glow">BARCODE Radio</span>
          </h1>
          <p className="text-muted max-w-2xl">
            Queue groundwork is live: submit a track link for admin review during the weekly BARCODE Radio workflow.
            Paid skips and automation are not active yet.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={submit} className="border border-border bg-surface p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-accent mb-2">Public Submission</p>
            <h2 className="text-2xl font-bold">Regular Queue Intake</h2>
          </div>

          <label className="block text-sm">
            <span className="text-muted uppercase tracking-widest text-xs">Artist Name</span>
            <input required value={form.artistName} onChange={(e) => setForm({ ...form, artistName: e.target.value })} className="mt-2 w-full bg-background border border-border px-3 py-2.5 text-foreground focus:border-accent focus:outline-none" />
          </label>

          <label className="block text-sm">
            <span className="text-muted uppercase tracking-widest text-xs">Song Title</span>
            <input required value={form.songTitle} onChange={(e) => setForm({ ...form, songTitle: e.target.value })} className="mt-2 w-full bg-background border border-border px-3 py-2.5 text-foreground focus:border-accent focus:outline-none" />
          </label>

          <label className="block text-sm">
            <span className="text-muted uppercase tracking-widest text-xs">Song Link</span>
            <input required type="url" value={form.songUrl} onChange={(e) => setForm({ ...form, songUrl: e.target.value })} placeholder="https://..." className="mt-2 w-full bg-background border border-border px-3 py-2.5 text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none" />
          </label>

          <label className="block text-sm">
            <span className="text-muted uppercase tracking-widest text-xs">Submitter Contact Optional</span>
            <input value={form.submitterContact} onChange={(e) => setForm({ ...form, submitterContact: e.target.value })} placeholder="email, Discord, or handle" className="mt-2 w-full bg-background border border-border px-3 py-2.5 text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none" />
          </label>

          <label className="block text-sm">
            <span className="text-muted uppercase tracking-widest text-xs">Fallback Duration Seconds</span>
            <input type="number" min="1" value={form.fallbackDurationSeconds} onChange={(e) => setForm({ ...form, fallbackDurationSeconds: Number(e.target.value) })} className="mt-2 w-full bg-background border border-border px-3 py-2.5 text-foreground focus:border-accent focus:outline-none" />
            <span className="mt-1 block text-xs text-muted">Used until a duration detector is connected. Unknown tracks clearly use this fallback runtime.</span>
          </label>

          <label className="block text-sm">
            <span className="text-muted uppercase tracking-widest text-xs">Note Optional</span>
            <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={4} className="mt-2 w-full bg-background border border-border px-3 py-2.5 text-foreground focus:border-accent focus:outline-none" />
          </label>

          <button disabled={!queueOpen || status === "submitting"} className="w-full border border-accent px-4 py-3 text-sm uppercase tracking-widest text-accent transition-all hover:bg-accent hover:text-background disabled:cursor-not-allowed disabled:border-muted disabled:text-muted disabled:hover:bg-transparent">
            {status === "submitting" ? "Submitting..." : queueOpen ? "Submit to Regular Queue" : "Queue Closed"}
          </button>
          {message && <p className={`text-sm ${status === "error" ? "text-danger" : "text-accent"}`}>{message}</p>}
        </form>

        <aside className="space-y-4">
          <div className="border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.35em] text-muted mb-3">Runtime Summary</p>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Queue State</dt><dd className={queueOpen ? "text-accent" : "text-danger"}>{queueOpen ? "Open" : "Closed"}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Active Tracks</dt><dd>{summary?.activeTrackCount ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Active Runtime</dt><dd>{formatRuntime(summary?.activeRuntimeSeconds ?? 0)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Completed</dt><dd>{summary?.completedCount ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Projected Session</dt><dd>{formatRuntime(summary?.projectedTotalSessionSeconds ?? 0)}</dd></div>
            </dl>
          </div>
          <div className="border border-border bg-background p-5 text-xs text-muted space-y-2">
            <p>New submissions enter the bottom of the Regular Queue.</p>
            <p>Priority Lane and Wheel Winners exist for admin organization, but paid skips and wheel automation are not implemented yet.</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
