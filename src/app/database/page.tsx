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

const VALID_CATEGORIES = new Set(["Entity", "Personnel", "Sponsor", "Interface", "Production"] as const);
const VALID_STATUSES = new Set(["ACTIVE", "INACTIVE", "ARCHIVED", "PENDING", "UNKNOWN"] as const);
const VALID_CLEARANCE = new Set(["PUBLIC", "INTERNAL", "RESTRICTED"] as const);

function normalizeCategory(category: string): "Entity" | "Personnel" | "Sponsor" | "Interface" | "Production" {
  return VALID_CATEGORIES.has(category as never) ? (category as "Entity" | "Personnel" | "Sponsor" | "Interface" | "Production") : "Interface";
}

function normalizeStatus(status: string): "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING" | "UNKNOWN" {
  return VALID_STATUSES.has(status as never) ? (status as "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING" | "UNKNOWN") : "UNKNOWN";
}

function normalizeClearance(clearance: string | undefined): "PUBLIC" | "INTERNAL" | "RESTRICTED" {
  if (!clearance) return "PUBLIC";
  return VALID_CLEARANCE.has(clearance as never) ? (clearance as "PUBLIC" | "INTERNAL" | "RESTRICTED") : "PUBLIC";
}

const databaseEntries = databasePage.dossiers.map((entry) => ({
  id: (entry as { designation?: string }).designation || entry.slug.toUpperCase(),
  name: entry.title,
  image: entry.image,
  category: normalizeCategory(entry.category),
  status: normalizeStatus(entry.status),
  clearance: normalizeClearance((entry as { clearance?: string }).clearance),
  role: (entry as { role?: string }).role || entry.category || "N/A",
  origin: ((entry as { origin?: "KNOWN" | "UNKNOWN" | "UNVERIFIED" | "WITHHELD" }).origin || "UNVERIFIED") as const,
  summary: entry.summary,
  tags: entry.tags,
  notes: entry.notes,
}));

export default function DatabasePage() {
  return (
    <div className="pt-14">
      {/* Header */}
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <PageHero
            label={databasePage.hero.label}
            heading={`${databasePage.hero.heading1} ${databasePage.hero.heading2}`}
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
	              {(databasePage as { terminalQuery?: string[] }).terminalQuery?.map((line, i) => (
	                <p key={i}>&gt; {line}</p>
	              )) || null}
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
