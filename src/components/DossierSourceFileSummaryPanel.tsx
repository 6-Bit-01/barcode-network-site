"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";
import { containsDossierBackendJunk } from "@/lib/dossier-note-display";
import {
  formatDossierSummaryBadge,
  type DossierSourceFileSummary,
} from "@/lib/dossier-source-file-summary";
import { isRawSourceMemoryDebugText } from "@/lib/dossier-source-memory-meaning";

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="border border-border bg-background/40 px-2 py-1 text-muted">
      {children}
    </span>
  );
}

function Section({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "review" | "caution";
}) {
  const toneClass =
    tone === "caution"
      ? "border-accent/70 bg-accent/10"
      : tone === "review"
        ? "border-border bg-background/30"
        : "border-border/60 bg-background/20";
  return (
    <section className={`border p-3 text-sm text-muted ${toneClass}`}>
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

function safeReviewItems(items: Array<string | undefined | null>, limit = 6) {
  const output: string[] = [];
  const seenKeys = new Set<string>();
  for (const item of items) {
    const clean = item?.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (containsDossierBackendJunk(clean) || isRawSourceMemoryDebugText(clean)) {
      continue;
    }
    const key = duplicateMeaningKey(clean);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function duplicateMeaningKey(item: string) {
  const lower = item.toLowerCase();
  if (lower.includes("profile match") || lower.includes("local profile")) {
    return "profile-match";
  }
  if (
    lower.includes("relationship/context") ||
    lower.includes("relationship context") ||
    lower.includes("relationship signal") ||
    lower.includes("relationship trace") ||
    lower.includes("prior relationship")
  ) {
    return "relationship-context";
  }
  return lower.replace(/[^a-z0-9]+/g, " ").trim();
}

function fallbackItems(items: string[], empty: string) {
  return items.length ? items : [empty];
}

export function DossierSourceFileSummaryPanel({
  summary,
  entityReadout,
  title = "Source File Snapshot / BNL Readout",
}: {
  summary: DossierSourceFileSummary;
  entityReadout?: DossierEntityActivityReadout | null;
  title?: string;
}) {
  const knownContext = safeReviewItems([
    ...(entityReadout?.knownContext ?? []),
    ...summary.knownContext,
  ]);
  const entityCurrentReadDuplicatesKnown = knownContext.some(
    (known) =>
      duplicateMeaningKey(known) === duplicateMeaningKey(entityReadout?.currentRead ?? ""),
  );
  const currentRead =
    entityReadout?.currentRead && !entityCurrentReadDuplicatesKnown
      ? entityReadout.currentRead
      : summary.currentRead;
  const usefulEvidence = safeReviewItems(
    [...(entityReadout?.usefulEvidence ?? []), ...summary.usefulEvidence].filter(
      (item) =>
        !knownContext.some(
          (known) => duplicateMeaningKey(known) === duplicateMeaningKey(item ?? ""),
        ),
    ),
  );
  const relationshipContext = safeReviewItems([
    ...(entityReadout?.relationshipSignals ?? []),
    ...summary.privateRelationshipContext,
  ]);
  const publicSafePossibilities = safeReviewItems([
    ...(entityReadout?.publicSafePossibilities ?? []),
    ...summary.publicSafePossibilities,
  ]);
  const privateOnlyNotes = safeReviewItems([
    ...(entityReadout?.privateOnlyNotes ?? []),
    ...summary.privateOnlyNotes,
  ]);
  const notPublicYet = safeReviewItems([
    ...(entityReadout?.notPublicYet ?? []),
    ...summary.notPublicYet,
  ]);
  const missingInfo = safeReviewItems([
    ...(entityReadout?.missingInfo ?? []),
    ...summary.missingInfo,
  ]);
  const sourceAuthority = safeReviewItems([
    ...(entityReadout?.sourceAuthority ?? []),
    ...summary.sourceAuthority,
  ]);
  const displayClaimedNeedsReview = safeReviewItems(
    summary.claimedNeedsReview.filter(
      (item) =>
        ![...knownContext, ...relationshipContext].some(
          (displayedItem) =>
            duplicateMeaningKey(displayedItem) === duplicateMeaningKey(item),
        ),
    ),
  );
  const recommendedAction =
    entityReadout?.recommendedAction ?? summary.recommendedNextAction;

  return (
    <section className="border border-accent/70 bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-accent mb-2">
            BNL Source File Summary / Source Summary / Source File Snapshot
          </p>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted max-w-4xl">
            One admin review surface for the source snapshot, BNL entity readout,
            public-readiness warnings, and recommended next action. Review-only;
            it does not publish or autofill Proposed Dossier fields.
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
          {entityReadout?.confidence && (
            <StatusBadge>Confidence: {entityReadout.confidence}</StatusBadge>
          )}
          <StatusBadge>Review-only</StatusBadge>
          <StatusBadge>
            Source:{" "}
            {entityReadout?.readoutSource === "structured"
              ? "Structured packet"
              : "Safe fallback"}
          </StatusBadge>
          <StatusBadge>Queue/submission not connected</StatusBadge>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm text-muted">
        <Section title="Current Read / Why This File Exists">
          <p>{currentRead}</p>
        </Section>
        <Section title="Known Context — What BNL Actually Knows">
          <SummaryList
            items={fallbackItems(knownContext, "No public-safe facts confirmed yet.")}
          />
        </Section>
        <Section title="Useful Evidence">
          <SummaryList
            items={fallbackItems(
              usefulEvidence,
              "No useful evidence has been attached to this entity readout yet.",
            )}
          />
        </Section>
        <Section title="Pattern BNL Noticed / Patterns / Themes">
          <SummaryList items={summary.patterns} />
        </Section>
        <Section title="Confirmed / Strong">
          <SummaryList items={summary.confirmedStrong} />
        </Section>
        <Section title="Claimed / Needs Review">
          <SummaryList
            items={fallbackItems(
              displayClaimedNeedsReview,
              "No additional human-readable claims are awaiting review.",
            )}
          />
        </Section>
        <Section title="Relationship Context — Review Only" tone="review">
          <SummaryList
            items={fallbackItems(
              relationshipContext,
              "No private relationship/context signals are recorded in the structured readout.",
            )}
          />
        </Section>
        <Section title="Public-Safe Possibilities Pending Owner Review" tone="review">
          <SummaryList
            items={fallbackItems(
              publicSafePossibilities,
              "Owner review needed before public wording.",
            )}
          />
        </Section>
        <Section title="Private/Internal Notes" tone="review">
          <SummaryList
            items={fallbackItems(
              privateOnlyNotes,
              "No private/internal notes are recorded in the structured readout.",
            )}
          />
        </Section>
        <Section title="Not Public Yet" tone="caution">
          <SummaryList
            items={fallbackItems(
              notPublicYet,
              "Do not say more publicly until owner/admin review confirms it.",
            )}
          />
        </Section>
        <Section title="Missing Info / Open Questions">
          <SummaryList
            items={fallbackItems(
              missingInfo,
              "Needs more history, repeated appearances, public-safe facts, and owner/admin context.",
            )}
          />
        </Section>
        <Section title="Source Authority / Confidence">
          <SummaryList
            items={fallbackItems(
              sourceAuthority,
              "Source authority has not been separated from confidence yet.",
            )}
          />
          {entityReadout?.confidence && (
            <p className="mt-2 text-xs uppercase tracking-widest text-accent">
              Confidence: {entityReadout.confidence}
            </p>
          )}
        </Section>
        <Section title="Recommended Next Action">
          <p>{recommendedAction}</p>
        </Section>
      </div>
      <p className="text-xs text-muted">
        Meaning-first internal briefing. Raw provenance belongs only in Developer
        / Raw Source Audit — internal debugging only. This panel does not publish,
        merge entities, call BNL live, or create queue/payment behavior.
      </p>
    </section>
  );
}
