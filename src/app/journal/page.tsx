import Link from "next/link";
import { JournalArchiveCard, JournalArticle, JournalUnavailable } from "@/components/journal/JournalArticle";
import { listBNLJournalArchive } from "@/lib/bnl-journal-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "BNL-01 Community Journal | BARCODE Network", description: "Periodic BNL-01 observations drawn from public community activity and recurring BARCODE Network patterns." };

export default async function JournalPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = Number(params?.page ?? "1") || 1; const archive = await listBNLJournalArchive(page);
  if (!archive.ok) return <JournalUnavailable />;
  const [latest, ...older] = archive.value.entries;
  return <main className="pt-14"><section className="border-b border-border noise-bg"><div className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><p className="text-xs uppercase tracking-[0.45em] text-accent">{"// BNL-01 COMMUNITY JOURNAL"}</p><h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-6xl">Journal archive</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted sm:text-lg">BNL-01 turns public community activity, continuing conversations, and recurring Network patterns into periodic observations approved for public reading.</p></div></section><section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">{latest ? <JournalArticle entry={latest} prominent /> : <div className="border border-border bg-surface p-6 text-muted">No journal entries have been published yet.</div>}<aside className="space-y-4"><p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">Archive</p>{older.map((entry) => <JournalArchiveCard key={`${entry.entryId}-${entry.revision}`} entry={entry} />)}<div className="flex justify-between gap-3 pt-2">{archive.value.hasNewer ? <Link className="text-sm text-accent" href={`/journal?page=${archive.value.page - 1}`}>← Newer</Link> : <span />}{archive.value.hasOlder && <Link className="text-sm text-accent" href={`/journal?page=${archive.value.page + 1}`}>Older →</Link>}</div></aside></section></main>;
}
