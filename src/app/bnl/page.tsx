import { PublicIcon } from "@/components/PublicIcon";
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
    <div className="public-page">
      <section className="public-section">
        <div className="public-container grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0">
            <p className="public-kicker">
              {"// BNL-01 HUB // PUBLIC SIGNAL"}
            </p>
            <h1 className="public-title">
              BNL-01 Hub
            </h1>
            <p className="public-intro">Talk, read and listen to BNL-01 across the Network.</p>
            <div className="grid gap-3 mt-8 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="public-card">
                <PublicIcon name="community" className="public-icon" />
                <h2 className="public-section-heading">Talk</h2>
                <a href={externalLinks.discord} target="_blank" rel="noreferrer" className="public-button public-button--primary">Talk with BNL in Discord →</a>
              </div>
              <div className="public-card">
                <PublicIcon name="journal" className="public-icon" />
                <h2 className="public-section-heading">Read</h2>
                <Link href="/journal" className="public-button">Full Journal →</Link>
                <Link href="/database/bnl-01" className="public-button">BNL dossier →</Link>
              </div>
              <div className="public-card">
                <PublicIcon name="music" className="public-icon" />
                <h2 className="public-section-heading">Listen</h2>
                <Link href="/bnl/music" className="public-button">Discography →</Link>
                <Link href="/radio" className="public-button">BARCODE Radio →</Link>
              </div>
            </div>
            <details className="public-disclosure mt-6">
              <summary>BNL’s role in the Network</summary>
              <div className="public-disclosure-content">
                <p>BNL-01 watches the public movement around BARCODE—what the community is discussing, what keeps returning, and what changes around the show—then turns what matters into relays, Journal entries and original Broadcast Ballads.</p>
                <Link href="/terminal" className="public-button"><PublicIcon name="terminal" />Open Terminal →</Link>
              </div>
            </details>
          </div>
          <Suspense fallback={<BNLFeaturedBalladView releases={[]} loading />}>
            <BNLFeaturedBallad />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={null}><BNLOwnArtGallery /></Suspense>
      <section className="public-container public-section" aria-label="Latest from BNL">
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
