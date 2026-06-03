"use client";

import type React from "react";
import {
  formatDossierSummaryBadge,
  type DossierSourceFileSummary,
} from "@/lib/dossier-source-file-summary";

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border bg-background/40 px-2 py-1 text-muted">
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border/60 bg-background/20 p-3 text-sm text-muted">
      <h3 className="font-bold text-foreground mb-2">{title}</h3>
      {children}
    </section>
  );
}

function SummaryList({ items }: { items: string[] }) {
  return items.length === 1 ? (
    <p>{items[0]}</p>
  ) : (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function DossierSourceFileSummaryPanel({
  summary,
  title = "Current Read",
}: {
  summary: DossierSourceFileSummary;
  title?: string;
}) {
  return (
    <section className="border border-accent/70 bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-accent mb-2">
            BNL Source File Summary / Source Summary / Source File Snapshot
          </p>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted max-w-4xl">
            {summary.currentRead}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          <StatusBadge>
            Substance: {formatDossierSummaryBadge(summary.substanceLevel)}
          </StatusBadge>
          <StatusBadge>
            Public readiness: {formatDossierSummaryBadge(summary.publicReadiness)}
          </StatusBadge>
          <StatusBadge>
            Existing public dossier: {formatDossierSummaryBadge(summary.existingPublicDossier)}
          </StatusBadge>
          <StatusBadge>
            Next action: {formatDossierSummaryBadge(summary.nextAction)}
          </StatusBadge>
          <StatusBadge>
            Summary source: {formatDossierSummaryBadge(summary.summarySource)}
          </StatusBadge>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm text-muted">
        <Section title="Current Read / Why This File Exists">
          <p>{summary.currentRead}</p>
        </Section>
        <Section title="Known Context — What BNL Actually Knows">
          <SummaryList items={summary.knownContext} />
        </Section>
        <Section title="Useful Evidence">
          <SummaryList items={summary.usefulEvidence} />
        </Section>
        <Section title="Pattern BNL Noticed / Patterns / Themes">
          <SummaryList items={summary.patterns} />
        </Section>
        <Section title="Confirmed / Strong">
          <SummaryList items={summary.confirmedStrong} />
        </Section>
        <Section title="Claimed / Needs Review">
          <SummaryList items={summary.claimedNeedsReview} />
        </Section>
        <Section title="Missing Info / Open Questions">
          <SummaryList items={summary.missingInfo} />
        </Section>
        <Section title="Not Public Yet">
          <SummaryList items={summary.notPublicYet} />
        </Section>
        <Section title="Recommended Next Step">
          <p>{summary.recommendedNextAction}</p>
        </Section>
      </div>
      <p className="text-xs text-muted">
        Meaning-first internal briefing. Raw provenance belongs only in collapsed
        developer/audit areas and does not publish or change public dossier copy.
      </p>
    </section>
  );
}
