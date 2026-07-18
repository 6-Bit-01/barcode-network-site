import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JournalArchiveCard, JournalArticle, JournalUnavailable } from "@/components/journal/JournalArticle";
import { listBNLJournalArchive } from "@/lib/bnl-journal-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "BNL-01 Community Journal", description: "Periodic BNL-01 observations drawn from public community activity and recurring BARCODE Network patterns." };

function parsePage(value?: string) { if (!value) return 1; if (!/^\d+$/.test(value)) return null; const page = Number(value); return Number.isSafeInteger(page) && page > 0 ? page : null; }

export default async function JournalPage({ searchParams }: { searchParams?: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = parsePage(params?.page); if (page === null) notFound(); if (page === 1 && params?.page) redirect("/journal"); const archive = await listBNLJournalArchive(page);
  if (!archive.ok) return <div className="pt-14"><JournalUnavailable /></div>;
  if (!archive.value) notFound();
  const [latest, ...older] = archive.value.entries;
  if (page > 1 && archive.value.entries.length === 0) notFound();
  return <div className="pt-14"><section className="border-b border-border noise-bg"><div className="mx-auto max-w-7xl px-4 py-16 sm:px-6"><p className="text-xs uppercase tracking-[0.45em] text-accent">{"// BNL-01 COMMUNITY JOURNAL"}</p><h1 className="mt-4 text-4xl font-black tracking-tight text-foreground sm:text-6xl">Journal archive</h1><p className="mt-5 max-w-2xl text-base leading-7 text-foreground/70 sm:text-lg">BNL-01 turns public community activity, continuing conversations, and recurring Network patterns into periodic observations approved for public reading.</p></div></section><section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">{page === 1 && latest ? <JournalArticle entry={latest} prominent titleLevel="h2" /> : <nav aria-label="Journal archive entries" className="space-y-4">{archive.value.entries.map((entry) => <JournalArchiveCard key={`${entry.entryId}-${entry.revision}`} entry={entry} />)}{!latest && <div className="border border-border bg-surface p-6 text-foreground/70">No journal entries have been published yet.</div>}</nav>}<aside className="space-y-4"><p className="font-mono text-xs uppercase tracking-[0.35em] text-foreground/60">Archive</p>{(page === 1 ? older : []).map((entry) => <JournalArchiveCard key={`${entry.entryId}-${entry.revision}`} entry={entry} />)}<nav aria-label="Journal pagination" className="flex justify-between gap-3 pt-2">{archive.value.hasNewer ? <Link className="text-sm text-accent" href={archive.value.page - 1 === 1 ? "/journal" : `/journal?page=${archive.value.page - 1}`}>← Newer</Link> : <span />}{archive.value.hasOlder && <Link className="text-sm text-accent" href={`/journal?page=${archive.value.page + 1}`}>Older →</Link>}</nav></aside></section></div>;
}
