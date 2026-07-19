import type { BNLPublicRelayHistoryEntry } from "@/lib/bnl-presence-relay-contract";
import { BNLRelayTimestamp } from "@/components/BNLRelayTimestamp";

export function BNLRelayHistoryModule({
  entries,
  unavailable = false,
}: {
  entries: BNLPublicRelayHistoryEntry[];
  unavailable?: boolean;
}) {
  const headingId = "recent-bnl-relays-heading";

  return (
    <section className="border border-border bg-surface p-6 sm:p-8">
      <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-accent">
            {"// PUBLIC SIGNAL HISTORY"}
          </p>
          <h2
            id={headingId}
            className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl"
          >
            Recent BNL-01 relays
          </h2>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
          Newest first · up to 20
        </p>
      </div>

      {unavailable ? (
        <div role="status" className="border border-danger/40 bg-background/60 p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-danger">
            Relay history unavailable
          </p>
          <p className="mt-3 text-sm leading-6 text-foreground/70">
            The public relay archive cannot be read right now. It will retry on
            the next page load.
          </p>
        </div>
      ) : entries.length === 0 ? (
        <p className="border border-border bg-background/60 p-5 text-sm leading-6 text-foreground/70">
          No public BNL-01 relays have been published yet.
        </p>
      ) : (
        <ol
          aria-labelledby={headingId}
          tabIndex={0}
          className="max-h-[34rem] space-y-4 overflow-y-auto overscroll-contain pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          {entries.slice(0, 20).map((entry, index) => (
            <li
              key={`${entry.publishedAt}-${index}`}
              className="border border-border bg-background/60 p-5"
            >
              <dl className="space-y-4">
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
                    Surface reading
                  </dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">
                    {entry.message}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
                    Network posture
                  </dt>
                  <dd className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/80">
                    {entry.currentDirective}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
                    Transmission date / time
                  </dt>
                  <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-foreground/70">
                    <BNLRelayTimestamp value={entry.publishedAt} />
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
