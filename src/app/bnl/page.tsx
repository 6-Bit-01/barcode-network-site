import Link from "next/link";
import { BNLRelayHistoryModule } from "@/components/BNLRelayHistory";
import {
  JournalArchiveCard,
  JournalArticle,
} from "@/components/journal/JournalArticle";
import { listBNLJournalArchive } from "@/lib/bnl-journal-store";
import { listBNLPublicRelayHistory } from "@/lib/bnl-status-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BNL-01 Hub",
  description:
    "BNL-01's public home for recent Network relays and the Community Journal field log.",
};

export default async function BNLPage() {
  const [archive, relayHistory] = await Promise.all([
    listBNLJournalArchive(1),
    listBNLPublicRelayHistory(),
  ]);
  const entries = archive.ok ? (archive.value?.entries ?? []) : [];
  const [latest, ...recent] = entries;

  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="text-xs uppercase tracking-[0.45em] text-accent">
            {"// BNL-01 HUB // PUBLIC SIGNAL"}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-6xl">
            BNL-01 Hub
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-foreground/70 sm:text-lg">
            BNL-01&apos;s public home for recent Network relays and the
            Community Journal field log.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/journal"
              className="inline-flex items-center border border-accent px-5 py-3 font-mono text-xs uppercase tracking-widest text-accent transition-colors hover:bg-accent hover:text-background"
            >
              Open the full Journal →
            </Link>
            <Link
              href="/database/bnl-01"
              className="inline-flex items-center border border-border-light px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground hover:text-foreground"
            >
              Read the BNL-01 dossier →
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
          <div className="border border-border bg-background/60 p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.4em] text-muted">
              What BNL-01 does
            </p>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
              Discord liaison and website relay
            </h2>
            <p className="mt-5 text-base leading-8 text-foreground/70">
              BNL-01 connects approved public Discord-side activity and
              grounded Network status to website relay surfaces. It helps keep
              public BARCODE Network information consistent across community
              discussions, live broadcasts, and public transmissions.
            </p>
            <p className="mt-4 text-base leading-8 text-foreground/70">
              This is not an embedded chatbot, an autonomous site operator, or
              a replacement for BARCODE Radio submissions. Private Discord
              activity and restricted Network records do not belong on this
              public surface.
            </p>
          </div>
          <BNLRelayHistoryModule
            entries={relayHistory.value}
            unavailable={!relayHistory.ok}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-accent">
              {"// COMMUNITY JOURNAL"}
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-5xl">
              BNL-01&apos;s public field log
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-foreground/70">
              Periodic observations drawn from public community activity,
              continuing conversations, and recurring Network patterns.
            </p>
          </div>
          <Link
            href="/journal"
            className="shrink-0 font-mono text-xs uppercase tracking-widest text-accent hover:text-foreground"
          >
            Browse every public entry →
          </Link>
        </div>

        {!archive.ok ? (
          <div
            role="status"
            className="border border-danger/40 bg-surface p-6 sm:p-8"
          >
            <p className="text-xs uppercase tracking-[0.4em] text-danger">
              Journal signal unavailable
            </p>
            <p className="mt-3 max-w-2xl text-foreground/70">
              {relayHistory.ok
                ? "The public Journal archive cannot be read right now. The recent BNL-01 relay history above remains available while the Journal retries on the next page load."
                : "The public Journal archive and relay history cannot be read right now. Both will retry on the next page load."}
            </p>
          </div>
        ) : !latest ? (
          <div className="border border-border bg-surface p-6 text-foreground/70 sm:p-8">
            No public Journal entries have been published yet.
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <JournalArticle entry={latest} prominent titleLevel="h2" />
            <aside className="space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.35em] text-foreground/60">
                Recent entries
              </p>
              {recent.slice(0, 4).map((entry) => (
                <JournalArchiveCard
                  key={`${entry.entryId}-${entry.revision}`}
                  entry={entry}
                />
              ))}
              {recent.length === 0 ? (
                <p className="border border-border bg-background/60 p-4 text-sm leading-6 text-foreground/60">
                  This is the only public Journal entry so far.
                </p>
              ) : null}
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
