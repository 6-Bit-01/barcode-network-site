import Link from "next/link";
import type { PublicBNLJournalEntry } from "@/lib/bnl-journal-store";
import {
  journalEntryHref,
  type JournalArchiveFilter,
} from "@/lib/bnl-journal-navigation";
import { JournalRetryButton } from "@/components/journal/JournalRetryButton";
import { JournalDate } from "@/components/journal/JournalDate";
export function JournalUnavailable() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <div className="border border-danger/40 bg-surface p-6">
        <p className="text-xs uppercase tracking-[0.4em] text-danger">
          Journal signal unavailable
        </p>
        <p className="mt-3 text-muted">
          The Journal archive cannot be read right now.
        </p>
        <JournalRetryButton />
      </div>
    </section>
  );
}
export function journalEntryKindLabel(entry: PublicBNLJournalEntry) {
  if (entry.entryKind === "daily") return "Daily";
  if (entry.entryKind === "weekly") return "Weekly";
  return "Manual";
}
export function JournalKindBadge({ entry }: { entry: PublicBNLJournalEntry }) {
  const label = journalEntryKindLabel(entry);
  return (
    <span
      aria-label={`Journal entry type: ${label}`}
      className="border border-accent/40 bg-accent/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent"
    >
      {label}
    </span>
  );
}
export function JournalArticle({
  entry,
  prominent = false,
  titleLevel = "h1",
  archiveFilter = "all",
}: {
  entry: PublicBNLJournalEntry;
  prominent?: boolean;
  titleLevel?: "h1" | "h2";
  archiveFilter?: JournalArchiveFilter;
}) {
  const Title = titleLevel;
  const SectionTitle = titleLevel === "h1" ? "h2" : "h3";
  return (
    <article
      className={`border border-accent/30 bg-surface/80 p-5 sm:p-8 ${prominent ? "shadow-[0_0_40px_rgba(0,255,136,0.08)]" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">
          By BNL-01.
        </p>
        <JournalKindBadge entry={entry} />
      </div>
      <JournalDate
        className="mt-3 block font-mono text-xs uppercase tracking-widest text-muted"
        value={entry.publishedAt}
      />
      <div className="font-oxanium">
        <Title className="mt-5 text-3xl font-normal leading-tight text-foreground sm:text-5xl">
          {entry.title}
        </Title>
        <p className="mt-5 max-w-3xl text-xl leading-7 text-foreground/75">
          {entry.excerpt}
        </p>
        <div className="mt-8 space-y-8">
          {entry.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <SectionTitle className="text-lg font-normal uppercase text-accent sm:text-xl">
                {section.heading}
              </SectionTitle>
              <p className="max-w-3xl whitespace-pre-wrap text-lg leading-7 text-foreground/75 sm:text-xl sm:leading-8">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </div>
      {prominent && (
        <Link
          href={journalEntryHref(entry.entryId, archiveFilter)}
          className="mt-8 inline-flex font-mono text-xs uppercase tracking-widest text-accent hover:text-foreground"
        >
          Open this entry →
        </Link>
      )}
    </article>
  );
}
export function JournalArchiveCard({
  entry,
  archiveFilter = "all",
}: {
  entry: PublicBNLJournalEntry;
  archiveFilter?: JournalArchiveFilter;
}) {
  return (
    <Link
      href={journalEntryHref(entry.entryId, archiveFilter)}
      className="block border border-border bg-background/60 p-4 transition-colors hover:border-accent/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <JournalDate
          className="font-mono text-[11px] uppercase tracking-widest text-foreground/60"
          value={entry.publishedAt}
        />
        <JournalKindBadge entry={entry} />
      </div>
      <div className="font-oxanium">
        <h2 className="mt-2 text-lg font-normal leading-tight text-foreground">
          {entry.title}
        </h2>
        <p className="mt-2 line-clamp-3 text-base leading-6 text-foreground/70">
          {entry.excerpt}
        </p>
      </div>
    </Link>
  );
}
