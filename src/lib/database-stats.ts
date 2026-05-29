import type { databasePage } from "@/content";

export type DatabaseEntry = (typeof databasePage.entries)[number];

function countBy<TEntry, TValue extends string>(
  entries: TEntry[],
  getValue: (entry: TEntry) => TValue,
): Partial<Record<TValue, number>> {
  return entries.reduce<Partial<Record<TValue, number>>>((counts, entry) => {
    const value = getValue(entry);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

export function getDatabaseAggregateStats(entries: DatabaseEntry[]) {
  return {
    totalCount: entries.length,
    activeCount: entries.filter((entry) => entry.status === "ACTIVE").length,
    pendingCount: entries.filter((entry) => entry.status === "PENDING").length,
    restrictedCount: entries.filter((entry) => entry.clearance === "RESTRICTED").length,
    publicCount: entries.filter((entry) => entry.clearance === "PUBLIC").length,
    categoryCount: new Set(entries.map((entry) => entry.category)).size,
    statusCounts: countBy(entries, (entry) => entry.status),
    clearanceCounts: countBy(entries, (entry) => entry.clearance),
    categoryCounts: countBy(entries, (entry) => entry.category),
  };
}
