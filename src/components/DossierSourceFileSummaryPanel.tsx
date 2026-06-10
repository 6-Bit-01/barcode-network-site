"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";
import type {
  DossierRecommendation,
  DossierSourceFileArchiveMetadata,
  DossierSourceFileCaseReportV1,
  DossierSourceFileNote,
} from "@/lib/dossier-workflow";
import {
  formatDossierSummaryBadge,
  type DossierSourceFileSummary,
} from "@/lib/dossier-source-file-summary";

type UnknownRecord = Record<string, unknown>;

type ReportSection = {
  title: string;
  value: unknown;
  optional?: boolean;
};

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
  helper,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "review" | "caution";
  helper?: string;
}) {
  const toneClass =
    tone === "caution"
      ? "border-accent/70 bg-accent/10"
      : tone === "review"
        ? "border-border bg-background/30"
        : "border-border/60 bg-background/20";
  return (
    <section className={`border p-3 text-sm text-muted ${toneClass}`}>
      <h3 className="font-bold text-foreground mb-1">{title}</h3>
      {helper && <p className="mb-2 text-xs text-muted/80">{helper}</p>}
      {children}
    </section>
  );
}

function SnapshotItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="border border-border/60 bg-background/30 p-3">
      <dt className="text-[0.65rem] uppercase tracking-widest text-accent">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function stringItems(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    return [];
  });
}

function hasReportShape(value: unknown): value is DossierSourceFileCaseReportV1 {
  const report = asRecord(value);
  if (!report) return false;
  return [
    "caseSummary",
    "dossierUse",
    "publicSafeClaims",
    "evidenceSummary",
    "reviewBlockers",
    "recommendedNextSteps",
    "confidenceNotes",
    "memoryCoverage",
  ].some((key) => report[key] !== undefined);
}

function normalizeCaseReport(
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata,
): DossierSourceFileCaseReportV1 | undefined {
  const archive = asRecord(latestSourceFileArchive);
  if (!archive) return undefined;
  const sourcePackage = asRecord(archive.sourcePackage);
  const brief = asRecord(archive.sourceFileBriefV2);
  const candidates = [
    archive.sourceFileCaseReportV1,
    sourcePackage?.sourceFileCaseReportV1,
    brief?.sourceFileCaseReportV1,
    brief?.caseFileReport,
  ];
  return candidates.find(hasReportShape);
}

function normalizeInterimBrief(latestSourceFileArchive?: DossierSourceFileArchiveMetadata) {
  const archive = asRecord(latestSourceFileArchive);
  if (!archive) return undefined;
  return asRecord(archive.sourceFileBriefV2) ?? asRecord(asRecord(archive.sourcePackage)?.sourceFileBriefV2);
}

function firstCompleteSentence(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  const sentence = clean.match(/^.{1,260}?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence ?? clean;
}

function ReportItem({ item }: { item: string }) {
  const preview = firstCompleteSentence(item);
  if (preview.length >= item.length) return <li>{item}</li>;
  return (
    <li>
      <span>{preview}</span>
      <details className="mt-2 border border-border/50 bg-background/30 p-2 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-foreground">
          Show full BNL-authored item
        </summary>
        <p className="mt-2 whitespace-pre-wrap">{item}</p>
      </details>
    </li>
  );
}

function ReportSectionView({ title, value }: { title: string; value: unknown }) {
  const items = stringItems(value).slice(0, 12);
  if (!items.length) return null;
  return (
    <section className="border border-border/50 bg-background/20 p-3">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">
        {title}
      </h4>
      {items.length === 1 ? (
        <div className="whitespace-pre-wrap text-foreground">
          <ReportItem item={items[0]} />
        </div>
      ) : (
        <ul className="list-disc space-y-2 pl-5 text-foreground">
          {items.map((item, index) => (
            <ReportItem key={`${title}-${index}-${item.slice(0, 30)}`} item={item} />
          ))}
        </ul>
      )}
      {stringItems(value).length > items.length && (
        <details className="mt-3 border border-border/50 bg-background/30 p-2 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-foreground">
            Show remaining BNL-authored items
          </summary>
          <ul className="mt-2 list-disc space-y-2 pl-4">
            {stringItems(value)
              .slice(items.length)
              .map((item, index) => (
                <li key={`${title}-remaining-${index}`}>{item}</li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CaseReportView({ report }: { report?: DossierSourceFileCaseReportV1 }) {
  if (!report) {
    return (
      <Section title="BNL Case File Report" tone="review">
        <div className="space-y-2 text-foreground">
          <p>
            BNL has not generated a dossier-ready Case File Report for this Source File yet. The raw archive is preserved below, but it has not been translated into a conversational case report.
          </p>
          <p>Refresh this Source File after the bot report generator is deployed.</p>
        </div>
      </Section>
    );
  }

  const confidenceAndCoverage = [
    ...stringItems(report.confidenceNotes),
    ...stringItems(report.memoryCoverage),
  ];
  const sections: ReportSection[] = [
    { title: "Case Summary", value: report.caseSummary },
    { title: "Dossier Use", value: report.dossierUse },
    { title: "Public-Safe Claims", value: report.publicSafeClaims },
    { title: "Evidence Summary", value: report.evidenceSummary },
    { title: "Community Context", value: report.communityContext },
    { title: "Creative / Music Context", value: report.creativeMusicContext, optional: true },
    { title: "Relationship Context", value: report.relationshipContext, optional: true },
    { title: "Queue / Submission Context", value: report.queueSubmissionContext, optional: true },
    { title: "Identity Context", value: report.identityContext, optional: true },
    { title: "Review Blockers", value: report.reviewBlockers },
    { title: "Internal-Only / Do Not Say", value: report.internalOnlyNotes },
    { title: "Recommended Next Steps", value: report.recommendedNextSteps },
    { title: "Confidence / Memory Coverage", value: confidenceAndCoverage },
  ];

  return (
    <Section title="BNL Case File Report" tone="review">
      <div className="mb-3 flex flex-wrap gap-2 text-xs uppercase tracking-widest">
        {report.reportStatus && <StatusBadge>Status: {report.reportStatus}</StatusBadge>}
        {report.generatedAt && <StatusBadge>Generated: {formatSnapshotDate(report.generatedAt)}</StatusBadge>}
        {report.version && <StatusBadge>Version: {report.version}</StatusBadge>}
      </div>
      <div className="space-y-3">
        {sections.map((section) => (
          <ReportSectionView key={section.title} title={section.title} value={section.value} />
        ))}
      </div>
    </Section>
  );
}

function InterimBriefView({ brief, hasReport }: { brief?: UnknownRecord; hasReport: boolean }) {
  if (!brief || hasReport) return null;
  const items = [
    ["One-line summary", textValue(brief.oneLineSummary)],
    ["Admin summary", textValue(brief.adminSummary)],
    ["Recommended next action", textValue(brief.recommendedNextAction)],
  ].filter(([, value]) => value);
  if (!items.length) return null;
  return (
    <Section title="Interim BNL Brief" helper="Limited brief only. This is not expanded into a Case File Report.">
      <dl className="space-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="border border-border/50 bg-background/20 p-2">
            <dt className="text-xs uppercase tracking-widest text-accent">{label}</dt>
            <dd className="mt-1 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export function DossierSourceFileArchiveRawData({ latestSourceFileArchive }: { latestSourceFileArchive?: DossierSourceFileArchiveMetadata }) {
  if (!latestSourceFileArchive) return null;
  const rawGroups = [
    ["compactSummary", stringItems(latestSourceFileArchive.compactSummary)],
    ["sourceFileBriefV2", [textValue(asRecord(latestSourceFileArchive.sourceFileBriefV2)?.oneLineSummary), textValue(asRecord(latestSourceFileArchive.sourceFileBriefV2)?.adminSummary), textValue(asRecord(latestSourceFileArchive.sourceFileBriefV2)?.recommendedNextAction)].filter(Boolean) as string[]],
    ["evidenceReceiptSummary", stringItems(latestSourceFileArchive.evidenceReceiptSummary)],
    ["missingInfo raw values", stringItems(latestSourceFileArchive.missingInfo)],
    ["publicSafetyNotes raw values", stringItems(latestSourceFileArchive.publicSafetyNotes)],
    ["doNotSay raw values", stringItems(latestSourceFileArchive.doNotSay)],
  ].filter(([, items]) => (items as string[]).length > 0) as Array<[string, string[]]>;

  return (
    <details className="border border-border/70 bg-background/20 p-3 text-sm text-muted">
      <summary className="cursor-pointer font-semibold text-foreground">
        Archive / Raw Source File Data
      </summary>
      <p className="mt-3 text-xs uppercase tracking-widest text-accent">
        Raw BNL archive material is preserved here for audit/debugging. It is not dossier copy.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SnapshotItem label="Archive id" value={latestSourceFileArchive.id} />
        <SnapshotItem label="Digest" value={latestSourceFileArchive.sourceDigest.slice(0, 16)} />
        <SnapshotItem label="Size" value={`${latestSourceFileArchive.archiveSize} bytes`} />
        <SnapshotItem label="Chunks" value={String(latestSourceFileArchive.chunkCount)} />
        <SnapshotItem label="Updated" value={formatSnapshotDate(latestSourceFileArchive.updatedAt)} />
        <SnapshotItem label="Review-only" value={latestSourceFileArchive.reviewOnly ? "Yes" : "No"} />
      </dl>
      {rawGroups.length > 0 && (
        <div className="mt-3 space-y-3">
          {rawGroups.map(([label, items]) => (
            <section key={label} className="border border-border/50 bg-background/30 p-2">
              <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">{label}</h4>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {items.slice(0, 8).map((item, index) => (
                  <li key={`${label}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </details>
  );
}

function formatSnapshotDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function humanStatus(value?: string) {
  return value ? value.replace(/_/g, " ") : "—";
}

function evidenceDepthLabel(value: DossierSourceFileSummary["substanceLevel"]) {
  return { thin: "Thin", partial: "Partial", useful: "Useful", strong: "Strong" }[value];
}

function readinessLabel(value: DossierSourceFileSummary["publicReadiness"]) {
  return {
    not_ready: "Not Ready",
    needs_review: "Needs Review",
    draftable: "Draftable",
    owner_approved: "Owner Approved",
  }[value];
}

function identityCertaintyLabel(summary: DossierSourceFileSummary) {
  if (summary.existingPublicDossier === "linked_update_target") return "Confirmed";
  if (summary.existingPublicDossier === "yes") return "Needs Review";
  return "Unconfirmed";
}

function noteText(note: Pick<DossierSourceFileNote, "text"> | string | null | undefined) {
  return typeof note === "string" ? note : note?.text;
}

export function DossierSourceFileSummaryPanel({
  summary,
  entityReadout,
  subjectName,
  recommendations = [],
  sourceFileNotes = [],
  title = "Source File",
  currentLane,
  latestRecommendationTimestamp,
  sourceFileTargetStatus,
  latestSourceFileArchive,
}: {
  summary: DossierSourceFileSummary;
  entityReadout?: DossierEntityActivityReadout | null;
  subjectName?: string;
  recommendations?: Array<Partial<DossierRecommendation>>;
  sourceFileNotes?: Array<Pick<DossierSourceFileNote, "text"> | string | null | undefined>;
  title?: string;
  currentLane?: string;
  latestRecommendationTimestamp?: string;
  sourceFileTargetStatus?: string;
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata;
}) {
  const report = normalizeCaseReport(latestSourceFileArchive);
  const interimBrief = normalizeInterimBrief(latestSourceFileArchive);
  const latestArchiveMissingReport = Boolean(latestSourceFileArchive && !report);
  const snapshotItems = [
    ["Subject", subjectName ?? latestSourceFileArchive?.subjectName ?? "Unknown subject"],
    ["Current state", humanStatus(currentLane ?? summary.nextAction)],
    ["Refresh status", latestArchiveMissingReport ? "Case report missing" : formatSnapshotDate(summary.lastUpdatedAt)],
    ["Latest BNL refresh", latestArchiveMissingReport ? "Report backfill required" : formatSnapshotDate(latestRecommendationTimestamp)],
    ["Source file target", humanStatus(sourceFileTargetStatus ?? summary.nextAction)],
    ["Evidence depth", evidenceDepthLabel(summary.substanceLevel)],
    ["Public readiness", readinessLabel(summary.publicReadiness)],
    ["Identity certainty", identityCertaintyLabel(summary)],
    ["BNL report", report ? "Generated" : "Not generated yet"],
    ["Source File notes", String(sourceFileNotes.map(noteText).filter(Boolean).length)],
    ["BNL recommendation cards", String(recommendations.length)],
  ];

  return (
    <section className="border border-accent/70 bg-surface p-5 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-accent mb-2">
            BNL Source File Display Layer
          </p>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted max-w-4xl">
            Source File header / refresh status → BNL Case File Report → Dossier Workbench / Proposed Dossier Status → Source Notes / Admin Addendums → Archive / Raw Source File Data → Advanced Tools → Diagnostics. BNL thinks; the site displays; admins decide.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          <StatusBadge>Review-only</StatusBadge>
          <StatusBadge>Display-only</StatusBadge>
          <StatusBadge>
            Source: {entityReadout?.readoutSource === "structured" ? "Structured packet" : "Safe fallback"}
          </StatusBadge>
        </div>
      </div>

      <Section title="Source File header / refresh status" helper="Status only. This section does not create dossier copy.">
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {snapshotItems.map(([label, value]) => (
            <SnapshotItem key={label} label={label} value={value} />
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Summary badge: {formatDossierSummaryBadge(summary.summarySource)}.
        </p>
      </Section>

      <CaseReportView report={report} />
      <InterimBriefView brief={interimBrief} hasReport={Boolean(report)} />
    </section>
  );
}
