import type { BNLJournalEntryKind } from "@/lib/bnl-journal-contract";

export type JournalArchiveFilter = "all" | Exclude<BNLJournalEntryKind, "manual">;

export const JOURNAL_ARCHIVE_FILTERS: ReadonlyArray<{
  value: JournalArchiveFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export function parseJournalArchiveFilter(
  value?: string,
): JournalArchiveFilter | null {
  if (value === undefined || value === "all") return "all";
  if (value === "daily" || value === "weekly") return value;
  return null;
}

export function journalArchiveHref(
  filter: JournalArchiveFilter,
  page = 1,
) {
  const query = new URLSearchParams();
  if (filter !== "all") query.set("kind", filter);
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return suffix ? `/journal?${suffix}` : "/journal";
}

export function journalEntryHref(
  entryId: string,
  filter: JournalArchiveFilter = "all",
) {
  const path = `/journal/${encodeURIComponent(entryId)}`;
  return filter === "all" ? path : `${path}?kind=${filter}`;
}
