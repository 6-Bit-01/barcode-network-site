import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JournalArticle, JournalUnavailable } from "@/components/journal/JournalArticle";
import { getBNLJournalEntry, getBNLJournalNeighbors } from "@/lib/bnl-journal-store";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ entryId: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const { entryId } = await params; const result = await getBNLJournalEntry(entryId); if (!result.ok || !result.value) return { title: "BNL-01 Journal" }; return { title: `${result.value.title} | BNL-01 Journal`, description: result.value.excerpt, authors: [{ name: "BNL-01" }], openGraph: { title: result.value.title, description: result.value.excerpt, publishedTime: result.value.publishedAt } }; }
export default async function JournalEntryPage({ params }: Props) { const { entryId } = await params; const result = await getBNLJournalEntry(entryId); if (!result.ok) return <main className="pt-14"><JournalUnavailable /></main>; if (!result.value) notFound(); const neighbors = await getBNLJournalNeighbors(entryId); return <main className="pt-14"><section className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><Link href="/journal" className="font-mono text-xs uppercase tracking-widest text-accent">← Back to Journal</Link><div className="mt-6"><JournalArticle entry={result.value} /></div>{neighbors.ok && <nav aria-label="Journal entry navigation" className="mt-8 flex justify-between gap-4 border-t border-border pt-6 text-sm text-accent">{neighbors.value.older ? <Link href={`/journal/${neighbors.value.older.entryId}`}>← Older entry</Link> : <span />}{neighbors.value.newer && <Link href={`/journal/${neighbors.value.newer.entryId}`}>Newer entry →</Link>}</nav>}</section></main>; }
