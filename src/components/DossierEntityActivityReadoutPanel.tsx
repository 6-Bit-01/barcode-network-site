"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";

function ReadoutBadge({ children }: { children: React.ReactNode }) {
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

function ReadoutList({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    items.length === 1 ? (
      <p>{items[0]}</p>
    ) : (
      <ul className="list-disc pl-5 space-y-1">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  ) : (
    <p className="text-muted">{empty}</p>
  );
}

export function DossierEntityActivityReadoutPanel({
  readout,
  compact = false,
}: {
  readout: DossierEntityActivityReadout;
  compact?: boolean;
}) {
  return (
    <section className="border border-accent/70 bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-accent mb-2">
            BNL Entity Readout / Entity Activity Summary
          </p>
          <h2 className="text-2xl font-bold text-foreground">
            BNL Entity Readout
          </h2>
          <p className="mt-2 text-sm text-muted max-w-4xl">
            The website is presenting BNL&apos;s structured readout for admin review
            only. It is not public copy and does not autofill Proposed Dossier
            fields.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          <ReadoutBadge>
            Source: {readout.readoutSource === "structured" ? "Structured packet" : "Safe fallback"}
          </ReadoutBadge>
          <ReadoutBadge>Review-only</ReadoutBadge>
          <ReadoutBadge>No live BNL call</ReadoutBadge>
          {readout.confidence && <ReadoutBadge>Confidence: {readout.confidence}</ReadoutBadge>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm text-muted">
        <Section title="Current Read">
          <p>{readout.currentRead}</p>
        </Section>
        <Section title="Known Context">
          <ReadoutList
            items={readout.knownContext}
            empty="No public-safe facts confirmed yet."
          />
        </Section>
        <Section title="Useful Evidence">
          <ReadoutList
            items={readout.usefulEvidence}
            empty="No useful evidence has been attached to this entity readout yet."
          />
        </Section>
        <Section title="Activity / Channel Signals">
          <div className="space-y-2">
            <p>No reviewed channel/activity summary has been attached yet.</p>
            <p>Queue/submission history is not connected to BNL entity summaries yet.</p>
          </div>
        </Section>
        <Section title="Relationship Context — Review Only" tone="review">
          <ReadoutList
            items={readout.relationshipSignals}
            empty="No private relationship/context signals are recorded in the structured readout."
          />
        </Section>
        <Section title="Public-Safe Possibilities Pending Owner Review" tone="review">
          <ReadoutList
            items={readout.publicSafePossibilities}
            empty="Owner review needed before public wording."
          />
        </Section>
        <Section title="Private/Internal Notes — Review Only" tone="review">
          <ReadoutList
            items={readout.privateOnlyNotes}
            empty="No private/internal notes are recorded in the structured readout."
          />
        </Section>
        <Section title="Not Public Yet" tone="caution">
          <ReadoutList
            items={readout.notPublicYet}
            empty="Do not say more publicly until owner/admin review confirms it."
          />
        </Section>
        {!compact && (
          <Section title="Missing Info">
            <ReadoutList
              items={readout.missingInfo}
              empty="Needs more public-safe history, owner review, and confirmed context."
            />
          </Section>
        )}
        <Section title="Source Authority / Confidence">
          <ReadoutList
            items={readout.sourceAuthority}
            empty="Source authority has not been separated from confidence yet."
          />
          {readout.confidence && (
            <p className="mt-2 text-xs uppercase tracking-widest text-accent">
              Confidence: {readout.confidence}
            </p>
          )}
        </Section>
        <Section title="Recommended Next Action">
          <p>{readout.recommendedAction}</p>
        </Section>
      </div>
      <p className="text-xs text-muted">
        Raw provenance stays in Developer / Raw Source Audit only. This readout
        does not publish, merge entities, call BNL live, or create queue/payment
        behavior.
      </p>
    </section>
  );
}
