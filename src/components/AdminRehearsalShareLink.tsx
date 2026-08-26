"use client";

import { useEffect, useState } from "react";

export function AdminRehearsalShareLink({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  const [href, setHref] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHref(null);
    setMessage(null);
    void fetch(`/api/admin/queue/rehearsal-access?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || typeof payload.href !== "string") throw new Error("Rehearsal link unavailable.");
        if (!cancelled) setHref(payload.href);
      })
      .catch(() => {
        if (!cancelled) setMessage("Rehearsal link unavailable. Refresh and try again.");
      });
    return () => { cancelled = true; };
  }, [sessionId]);

  async function copyLink() {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      setMessage("Rehearsal link copied.");
    } catch {
      setMessage("Copy failed. Open the rehearsal link and copy it from the address bar.");
    }
  }

  if (compact) {
    return <>
      <button type="button" onClick={copyLink} disabled={!href} className="inline-flex min-h-10 items-center border-2 border-violet-300 bg-violet-300/15 px-3 py-2 font-black uppercase tracking-widest text-violet-100 hover:bg-violet-300 hover:text-background disabled:cursor-wait disabled:opacity-50 sm:px-4">{href ? "Copy Rehearsal Link" : "Preparing Rehearsal Link…"}</button>
      {message && <span className="text-xs text-violet-100">{message}</span>}
    </>;
  }

  return (
    <section className="border border-violet-300/45 bg-violet-300/10 p-4">
      <p className="text-xs font-black uppercase tracking-[0.3em] text-violet-100">Private Rehearsal Queue</p>
      <p className="mt-2 text-sm text-muted">This session stays unlisted. Anyone you send this private link to can enter the real rehearsal queue; Open/Closed submissions still remain under your control.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copyLink} disabled={!href} className="border border-violet-300 px-4 py-2 text-xs uppercase tracking-widest text-violet-100 hover:bg-violet-300 hover:text-background disabled:cursor-wait disabled:opacity-50">{href ? "Copy Rehearsal Queue Link" : "Preparing Link…"}</button>
        {href && <a href={href} target="_blank" rel="noreferrer" className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-violet-300 hover:text-violet-100">Open Rehearsal Queue</a>}
      </div>
      {message && <p role="status" className="mt-2 text-xs text-violet-100">{message}</p>}
    </section>
  );
}
