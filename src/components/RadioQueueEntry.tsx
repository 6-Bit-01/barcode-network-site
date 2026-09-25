"use client";

import Link from "next/link";
import { useLiveStatus } from "@/components/LiveStatusProvider";
import type { RadioQueueEntryState } from "@/lib/live-status-public";

const COPY: Record<RadioQueueEntryState["status"], { label: string; title: string; detail: string; action: string }> = {
  loading: { label: "Checking the queue", title: "Find your place in the show.", detail: "Reading the current submission status…", action: "" },
  unavailable: { label: "Status unavailable", title: "The queue could not be checked.", detail: "Try the status check again before entering the current queue.", action: "" },
  closed: { label: "Queue closed", title: "Catch up before the next show.", detail: "There is no active public queue right now. Explore past shows, find a song you heard, and discover the artists in the Broadcast Archive.", action: "" },
  standby: { label: "Submissions closed", title: "The queue is on standby.", detail: "You can view the current queue. Submissions begin when the host opens intake.", action: "View current queue" },
  open: { label: "Submissions open", title: "Your music. The next transmission.", detail: "Enter the current queue and submit your original track for free. Follow your song from the same page.", action: "Enter current queue" },
  live_open: { label: "On air · Submissions open", title: "The show is live. Bring your music.", detail: "Submit your original track for free, then follow Now Playing and Next In Line while you watch.", action: "Enter current queue" },
  live_closed: { label: "On air · Submissions closed", title: "The music is still moving.", detail: "Intake is closed. Follow accepted tracks, Now Playing, and Next In Line in the current queue.", action: "View current queue" },
  full: { label: "Queue full · Submissions closed", title: "Tonight’s slots are filled.", detail: "New tracks cannot enter right now. Accepted songs and the current running order remain in the queue.", action: "View current queue" },
};

export function RadioQueueEntry() {
  const { radioQueueEntry, refreshQueueStatus } = useLiveStatus();
  const copy = COPY[radioQueueEntry.status];
  const open = radioQueueEntry.status === "open" || radioQueueEntry.status === "live_open";
  return (
    <section id="queue-status" aria-labelledby="radio-queue-heading" aria-busy={radioQueueEntry.status === "loading"} className="relative scroll-mt-24 overflow-hidden border border-accent/40 bg-surface p-5 sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 flex w-1/3 items-end gap-2 overflow-hidden opacity-[0.07]">
        {[38, 78, 48, 94, 62, 100, 42, 82, 54, 90, 36].map((height, index) => <span key={index} className="w-4 bg-accent" style={{ height: `${height}%` }} />)}
      </div>
      <div className="relative">
        <p role="status" className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${open ? "bg-accent motion-safe:animate-pulse" : "bg-muted"}`} />
          {copy.label}
        </p>
        <h2 id="radio-queue-heading" className="mt-3 text-2xl font-bold leading-tight text-foreground sm:text-3xl">{copy.title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{copy.detail}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {radioQueueEntry.href ? <Link href={radioQueueEntry.href} prefetch={false} className="inline-flex min-h-12 w-full items-center justify-center gap-3 bg-accent px-5 py-3 text-center text-sm font-bold uppercase tracking-widest text-background transition hover:bg-accent-dim focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:w-auto">{copy.action}<span aria-hidden="true">→</span></Link>
            : radioQueueEntry.status === "closed" ? <Link href="/radio/archive" className="inline-flex min-h-12 w-full items-center justify-center gap-3 bg-accent px-5 py-3 text-center text-sm font-bold uppercase tracking-widest text-background transition hover:bg-accent-dim focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:w-auto">Open Broadcast Archive<span aria-hidden="true">→</span></Link> : null}
          {!radioQueueEntry.href && radioQueueEntry.status !== "loading" && <button type="button" onClick={refreshQueueStatus} className="inline-flex min-h-12 items-center border border-border-light px-4 py-3 text-sm font-bold text-foreground transition hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Check queue status</button>}
        </div>
        {open && <p className="mt-3 text-xs leading-relaxed text-muted">Free submissions. Optional Priority Signal activates only after payment clears.</p>}
      </div>
    </section>
  );
}
