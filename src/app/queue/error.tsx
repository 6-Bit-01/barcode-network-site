"use client";

import Link from "next/link";

export default function QueueError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <section className="border border-[#ffaa00]/45 bg-[#ffaa00]/10 p-6" role="alert">
        <p className="text-xs uppercase tracking-[0.35em] text-[#ffaa00]">Queue signal unavailable</p>
        <h1 className="mt-3 text-3xl font-bold text-foreground">Queue view could not finish loading</h1>
        <p className="mt-3 text-sm text-muted">The server read failed or returned an unreadable response. This does not mean the queue is closed.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="border border-[#ffaa00]/60 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#ffaa00]">Retry</button>
          <Link href="/queue" className="border border-border px-4 py-2 text-xs font-bold uppercase tracking-widest text-muted">Back to queue gateway</Link>
        </div>
      </section>
    </main>
  );
}
