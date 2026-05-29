import { databasePage } from "@/content";
import { PageHero } from "@/components/LiveEffects";
import { DatabaseTable } from "@/components/DatabaseTable";
import { getDatabaseAggregateStats } from "@/lib/database-stats";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Database — BARCODE Network",
  description:
    "Internal dossier system. Personnel, productions, entities, interfaces — and anomalies connected to BARCODE Network.",
  openGraph: {
    title: "Database — BARCODE Network",
    description:
      "Internal dossier system. Personnel, productions, entities, interfaces — and anomalies connected to BARCODE Network.",
  },
};

const databaseEntries = databasePage.entries;

const databaseStats = getDatabaseAggregateStats(databaseEntries);
const databaseTerminalQuery = [
  `INDEXED ${databaseStats.totalCount} TOTAL DOSSIERS`,
  `STATUS FILTER: ${databaseStats.activeCount} ACTIVE / ${databaseStats.pendingCount} PENDING`,
  `CLEARANCE WATCH: ${databaseStats.restrictedCount} RESTRICTED RECORDS`,
  `CATEGORY GROUPS ONLINE: ${databaseStats.categoryCount}`,
];

export default function DatabasePage() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 sm:pb-16 sm:pt-14">
          <PageHero
            label={databasePage.hero.label}
            heading={databasePage.hero.heading}
            description={databasePage.hero.description}
          />
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
          <div className="flex flex-wrap gap-6">
            <StatItem label="Total Dossiers" value={databaseStats.totalCount.toString()} />
            <StatItem
              label="Active"
              value={databaseStats.activeCount.toString()}
            />
            <StatItem
              label="Pending"
              value={databaseStats.pendingCount.toString()}
            />
            <StatItem
              label="Categories"
              value={databaseStats.categoryCount.toString()}
            />
            <StatItem
              label="Restricted"
              value={databaseStats.restrictedCount.toString()}
            />
          </div>
        </div>
      </section>

      {/* Database Table — interactive with search + filters */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <DatabaseTable entries={databaseEntries} />
        </div>
      </section>

      {/* Terminal Readout */}
      <section>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="bg-surface border border-border p-6 font-mono">
            <p className="text-xs text-muted mb-4">
              &gt; BARCODE_NETWORK // DATABASE QUERY
            </p>
            <div className="space-y-1 text-sm text-foreground/60">
              {databaseTerminalQuery.map((line, i) => (
                <p key={i}>&gt; {line}</p>
              ))}
              <p className="text-accent mt-3">
                &gt; {databaseStats.activeCount} RECORDS FOUND
                <span className="cursor-blink">_</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-accent">{value}</span>
      <span className="text-xs text-muted uppercase tracking-wider">{label}</span>
    </div>
  );
}
