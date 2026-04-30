import { databasePage } from "@/content";
import { PageHero } from "@/components/LiveEffects";
import { DatabaseTable } from "@/components/DatabaseTable";
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

const activeCount = databaseEntries.filter((e) => e.status === "ACTIVE").length;
const pendingCount = databaseEntries.filter((e) => e.status === "PENDING").length;
const restrictedCount = databaseEntries.filter((e) => e.clearance === "RESTRICTED").length;
const categoryCount = new Set(databaseEntries.map((e) => e.category)).size;
const databaseTerminalQuery = [
  `INDEXED ${databaseEntries.length} TOTAL DOSSIERS`,
  `STATUS FILTER: ${activeCount} ACTIVE / ${pendingCount} PENDING`,
  `CLEARANCE WATCH: ${restrictedCount} RESTRICTED RECORDS`,
  `CATEGORY GROUPS ONLINE: ${categoryCount}`,
];

export default function DatabasePage() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
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
            <StatItem label="Total Dossiers" value={databaseEntries.length.toString()} />
            <StatItem
              label="Active"
              value={databaseEntries.filter((e) => e.status === "ACTIVE").length.toString()}
            />
            <StatItem
              label="Pending"
              value={databaseEntries.filter((e) => e.status === "PENDING").length.toString()}
            />
            <StatItem
              label="Categories"
              value={[...new Set(databaseEntries.map((e) => e.category))].length.toString()}
            />
            <StatItem
              label="Restricted"
              value={databaseEntries.filter((e) => e.clearance === "RESTRICTED").length.toString()}
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
                &gt; {databaseEntries.filter((e) => e.status === "ACTIVE").length} RECORDS FOUND
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