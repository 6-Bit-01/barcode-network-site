import type { Metadata } from "next";
import Link from "next/link";
import { externalLinks } from "@/content";
import { notFound, redirect } from "next/navigation";
import {
  JournalArticle,
  JournalUnavailable,
} from "@/components/journal/JournalArticle";
import {
  journalArchiveHref,
  journalEntryHref,
  parseJournalArchiveFilter,
} from "@/lib/bnl-journal-navigation";
import {
  getBNLJournalEntry,
  getBNLJournalNeighbors,
} from "@/lib/bnl-journal-store";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ entryId: string }>;
  searchParams?: Promise<{ kind?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { entryId } = await params;
  const result = await getBNLJournalEntry(entryId);
  if (!result.ok || !result.value) return { title: "BNL-01 Journal" };
  return {
    title: `${result.value.title} | BNL-01 Journal`,
    description: result.value.excerpt,
    authors: [{ name: "BNL-01" }],
    openGraph: {
      title: result.value.title,
      description: result.value.excerpt,
      publishedTime: result.value.publishedAt,
    },
  };
}

export default async function JournalEntryPage({
  params,
  searchParams,
}: Props) {
  const [{ entryId }, query] = await Promise.all([params, searchParams]);
  const filter = parseJournalArchiveFilter(query?.kind);
  if (filter === null) notFound();

  const result = await getBNLJournalEntry(entryId);
  if (!result.ok)
    return (
      <div className="pt-14">
        <JournalUnavailable />
      </div>
    );
  if (!result.value) notFound();
  if (
    query?.kind === "all" ||
    (filter !== "all" && result.value.entryKind !== filter)
  )
    redirect(journalEntryHref(entryId));
  const neighbors = await getBNLJournalNeighbors(entryId, undefined, filter);

  return (
    <div className="pt-14">
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap gap-4"><Link
          href={journalArchiveHref(filter)}
          className="font-mono text-xs uppercase tracking-widest text-accent"
        >
          ← Back to Journal
        </Link><Link href="/bnl" className="font-mono text-xs uppercase tracking-widest text-accent">BNL-01 Hub</Link><a href={externalLinks.discord} target="_blank" rel="noreferrer" className="font-mono text-xs uppercase tracking-widest text-accent">Discord</a><Link href="/radio" className="font-mono text-xs uppercase tracking-widest text-accent">Radio</Link></div>
        <div className="mt-6">
          <JournalArticle entry={result.value} archiveFilter={filter} />
        </div>
        {neighbors.ok && (
          <nav
            aria-label="Journal entry navigation"
            className="mt-8 flex justify-between gap-4 border-t border-border pt-6 text-sm text-accent"
          >
            {neighbors.value.older ? (
              <Link
                href={journalEntryHref(
                  neighbors.value.older.entryId,
                  filter,
                )}
              >
                ← Older entry
              </Link>
            ) : (
              <span />
            )}
            {neighbors.value.newer && (
              <Link
                href={journalEntryHref(
                  neighbors.value.newer.entryId,
                  filter,
                )}
              >
                Newer entry →
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
