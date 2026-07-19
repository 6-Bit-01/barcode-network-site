import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  JournalArchiveCard,
  JournalArticle,
  JournalUnavailable,
} from "@/components/journal/JournalArticle";
import {
  JOURNAL_ARCHIVE_FILTERS,
  journalArchiveHref,
  parseJournalArchiveFilter,
} from "@/lib/bnl-journal-navigation";
import { listBNLJournalArchive } from "@/lib/bnl-journal-store";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "BNL-01 Community Journal",
  description:
    "Periodic BNL-01 observations drawn from public community activity and recurring BARCODE Network patterns.",
  alternates: { canonical: "/journal" },
};

function parsePage(value?: string) {
  if (!value) return 1;
  if (!/^\d+$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : null;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params?.page);
  const filter = parseJournalArchiveFilter(params?.kind);
  if (page === null || filter === null) notFound();
  if ((page === 1 && params?.page) || params?.kind === "all")
    redirect(journalArchiveHref(filter, page));

  const archive = await listBNLJournalArchive(page, undefined, filter);
  if (!archive.ok)
    return (
      <div className="pt-14">
        <JournalUnavailable />
      </div>
    );
  if (!archive.value) notFound();
  const [latest, ...older] = archive.value.entries;
  if (page > 1 && archive.value.entries.length === 0) notFound();

  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <p className="text-xs uppercase tracking-[0.45em] text-accent">
            {"// BNL-01 COMMUNITY JOURNAL"}
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-6xl">
            Journal archive
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/70 sm:text-lg">
            BNL-01 turns public community activity, continuing conversations,
            and recurring Network patterns into periodic observations approved
            for public reading.
          </p>
          <nav
            aria-label="Filter journal archive"
            className="mt-8 flex flex-wrap gap-2"
          >
            {JOURNAL_ARCHIVE_FILTERS.map((candidate) => (
              <Link
                key={candidate.value}
                href={journalArchiveHref(candidate.value)}
                aria-current={candidate.value === filter ? "page" : undefined}
                className={`border px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] transition-colors ${
                  candidate.value === filter
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-foreground/60 hover:border-accent/50 hover:text-foreground"
                }`}
              >
                {candidate.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 flex flex-wrap gap-4 font-mono text-xs uppercase tracking-widest"><Link href="/bnl" className="text-accent hover:text-foreground">BNL-01 Hub →</Link><a href="https://discord.gg/barcode" target="_blank" rel="noreferrer" className="text-accent hover:text-foreground">Talk in Discord →</a><Link href="/radio" className="text-accent hover:text-foreground">BARCODE Radio →</Link></div>
        </div>
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {page === 1 && latest ? (
          <JournalArticle
            entry={latest}
            prominent
            titleLevel="h2"
            archiveFilter={filter}
          />
        ) : (
          <nav aria-label="Journal archive entries" className="space-y-4">
            {archive.value.entries.map((entry) => (
              <JournalArchiveCard
                key={`${entry.entryId}-${entry.revision}`}
                entry={entry}
                archiveFilter={filter}
              />
            ))}
            {!latest && (
              <div className="border border-border bg-surface p-6 text-foreground/70">
                No journal entries have been published in this view yet.
              </div>
            )}
          </nav>
        )}
        <aside className="space-y-4">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-foreground/60">
            Archive
          </p>
          {(page === 1 ? older : []).map((entry) => (
            <JournalArchiveCard
              key={`${entry.entryId}-${entry.revision}`}
              entry={entry}
              archiveFilter={filter}
            />
          ))}
          <nav
            aria-label="Journal pagination"
            className="flex justify-between gap-3 pt-2"
          >
            {archive.value.hasNewer ? (
              <Link
                className="text-sm text-accent"
                href={journalArchiveHref(filter, archive.value.page - 1)}
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            {archive.value.hasOlder && (
              <Link
                className="text-sm text-accent"
                href={journalArchiveHref(filter, archive.value.page + 1)}
              >
                Older →
              </Link>
            )}
          </nav>
        </aside>
      </section>
    </div>
  );
}
