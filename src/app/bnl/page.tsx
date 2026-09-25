import Link from "next/link";
import { BNLOwnArtGallery } from "@/components/BNLOwnArt";
import { Suspense } from "react";
import { externalLinks } from "@/content";
import { BNLRelayHistoryModule } from "@/components/BNLRelayHistory";
import {
  JournalArchiveCard,
  JournalArticle,
} from "@/components/journal/JournalArticle";
import { listBNLJournalArchive } from "@/lib/bnl-journal-store";
import { listBNLPublicRelayHistory } from "@/lib/bnl-status-store";
import { BNLFeaturedBallad, BNLFeaturedBalladView } from "@/components/BNLFeaturedBallad";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "BNL-01 Hub",
  description:
    "BNL-01's public Hub for the current signal, recent relays, Journal entries, discography, Discord, BARCODE Radio, Terminal, and dossier paths.",
  alternates: { canonical: "/bnl" },
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
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.45em] text-accent">
              {"// BNL-01 HUB // PUBLIC SIGNAL"}
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-6xl">
              BNL-01 Hub
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-foreground/70 sm:text-lg">
              BNL-01 watches the public movement around BARCODE—what the community is discussing, what keeps returning, and what changes around the show—then turns what matters into relays, Journal entries and original Broadcast Ballads.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={externalLinks.discord} target="_blank" rel="noreferrer" className="inline-flex items-center border border-accent px-5 py-3 font-mono text-xs uppercase tracking-widest text-accent transition-colors hover:bg-accent hover:text-background">Talk with BNL in Discord →</a>
              <Link href="/radio" className="inline-flex items-center border border-border-light px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground hover:text-foreground">BARCODE Radio →</Link>
              <Link href="/terminal" className="inline-flex items-center border border-border-light px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground hover:text-foreground">Open Terminal →</Link>
              <Link href="/journal" className="inline-flex items-center border border-border-light px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground hover:text-foreground">Full Journal →</Link>
              <Link href="/bnl/music" className="inline-flex items-center border border-border-light px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground hover:text-foreground">Discography →</Link>
              <Link href="/database/bnl-01" className="inline-flex items-center border border-border-light px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground hover:text-foreground">BNL dossier →</Link>
            </div>
          </div>
          <Suspense fallback={<BNLFeaturedBalladView releases={[]} loading />}>
            <BNLFeaturedBallad />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={null}><BNLOwnArtGallery /></Suspense>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12" aria-label="Latest from BNL">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="min-w-0">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-accent">Latest Journal</p>
            <p className="mb-5 text-sm leading-6 text-muted">BNL’s longer reflections on the community and the memories that stay with him.</p>
            {!archive.ok ? (
              <div role="status" className="border border-danger/40 bg-surface p-6">
                <p className="font-bold text-danger">Journal signal unavailable</p>
                <p className="mt-3 text-sm leading-6 text-muted">{relayHistory.ok
                  ? "The public Journal archive cannot be read right now. The recent BNL-01 relay history remains available. Reload to try the Journal again."
                  : "The public Journal archive and relay history cannot be read right now. Reload to try again."}</p>
              </div>
            ) : latest ? <JournalArticle entry={latest} titleLevel="h2" preview /> : (
              <p className="border border-border bg-surface p-6 text-muted">No public Journal entries have been published yet.</p>
            )}
          </div>
          <div className="min-w-0">
            <BNLRelayHistoryModule entries={relayHistory.value} unavailable={!relayHistory.ok} />
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-7">
          <h2 className="text-xl font-black text-foreground">More from the Journal</h2>
          <Link href="/journal" className="inline-flex min-h-11 items-center text-sm font-bold text-accent hover:underline">Browse every public entry →</Link>
        </div>
        {archive.ok && recent.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recent.slice(0, 4).map(entry => <JournalArchiveCard key={`${entry.entryId}-${entry.revision}`} entry={entry} />)}
        </div>}
      </section>
    </div>
  );
}
