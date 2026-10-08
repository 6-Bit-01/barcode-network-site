import { databasePage } from "@/content";
import { PublicIcon } from "@/components/PublicIcon";
import { DatabaseTable } from "@/components/DatabaseTable";
import { getDatabaseAggregateStats } from "@/lib/database-stats";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Database — BARCODE Network",
  description:
    "A public dossier index of the people, entities, productions, interfaces — and anomalies connected to BARCODE Network.",
  openGraph: {
    title: "Database — BARCODE Network",
    description:
      "A public dossier index of the people, entities, productions, interfaces — and anomalies connected to BARCODE Network.",
  },
  alternates: { canonical: "/database" },
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
    <div className="public-page">
      {/* Header */}
      <section className="public-section">
        <div className="public-container">
          <p className="public-kicker"><PublicIcon name="archive" /> {databasePage.hero.label}</p>
          <h1 className="public-title">{databasePage.hero.heading}</h1>
          <p className="public-intro">{databasePage.hero.description}</p>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="public-section--muted border-y border-border">
        <div className="public-container py-5">
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
      <section className="public-section">
        <div className="public-container">
          <DatabaseTable entries={databaseEntries} />
        </div>
      </section>

      {/* Terminal Readout */}
      <section className="public-section">
        <div className="public-container">
          <details className="public-disclosure">
            <summary><PublicIcon name="terminal" /> Database query details</summary>
          <div className="public-disclosure-content font-mono">
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
          </details>
        </div>
      </section>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold text-accent">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  );
}
