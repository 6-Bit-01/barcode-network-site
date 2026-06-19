"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";
import { createDossierSourceFileDraftReadinessReadModel } from "@/lib/dossier-workflow";
import type {
  DossierRecommendation,
  DossierSourceFileClaimReview,
  DossierSourceFileClaimReviewDecision,
  DossierSourceFileClaimType,
  DossierSourceFileArchiveMetadata,
  DossierSourceFileCaseReportV1,
  DossierSourceFileNote,
  DossierSubjectAnalystReadV1,
  DossierSourceFileConfirmationTarget,
  DossierSourceFileVerificationPacketAudience,
  DossierCandidate,
  DossierSourceFilePagePlanV1,
  DossierSourceFilePagePlanSuggestedControl,
} from "@/lib/dossier-workflow";
import type { DossierDraftBlueprint } from "@/lib/dossier-classification";
import { buildDossierStylePacket, DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS } from "@/lib/dossier-style-packet";
import { resolveBnlDossierQuestionFromExistingTruth, type DossierResolvedQuestionReadModel } from "@/lib/dossier-workflow-store";
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


function dedupeStrings(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function humanizeClassificationTag(tag: string) {
  const normalized = tag.trim().toLowerCase().replace(/[_ ]+/g, "-");
  const labels: Record<string, string> = {
    "source-blind": "source-blind internal context",
    queue: "queue/submission context",
    "lore-entity": "lore/entity context",
    "community-member": "possible community context",
    platform: "platform/context marker",
    discord: "Discord-only context",
  };
  return labels[normalized] ?? tag.trim().replace(/[_-]+/g, " ");
}

function DossierReadoutList({ value, empty }: { value: unknown; empty: string }) {
  const items = dedupeStrings(stringItems(value).map((item) => safeHumanText(item) ?? item));
  if (!items.length) return <p className="text-muted">{empty}</p>;
  return <ul className="list-disc space-y-2 pl-5 text-foreground">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function normalizeDossierCompletionReadV1(latestSourceFileArchive?: DossierSourceFileArchiveMetadata) {
  for (const candidate of archivePayloadCandidates(latestSourceFileArchive)) {
    const brief = asRecord(candidate.sourceFileBriefV2);
    const report = asRecord(candidate.sourceFileCaseReportV1);
    const nestedReport = asRecord(brief?.sourceFileCaseReportV1);
    const read = [
      candidate.dossierCompletionReadV1,
      brief?.dossierCompletionReadV1,
      report?.dossierCompletionReadV1,
      nestedReport?.dossierCompletionReadV1,
    ].map(asRecord).find(Boolean);
    if (read) return read;
  }
  return undefined;
}

function DossierCompletionReadout({
  completionRead,
  analystRead,
  report,
  interimBrief,
}: {
  completionRead?: UnknownRecord;
  analystRead?: DossierSubjectAnalystReadV1;
  report?: DossierSourceFileCaseReportV1;
  interimBrief?: UnknownRecord;
}) {
  const analyst = analystRead as UnknownRecord | undefined;
  const read = completionRead;
  const hasSubjectIntelligence = Boolean(asRecord(report?.subjectIntelligenceBriefV1));
  const angle = valueByKeys(read, ["likelyDossierAngle", "dossierAngle", "angle"]) ?? valueByKeys(analyst, ["likelyDossierAngle", "dossierAngle", "currentRead", "internalRead"]) ?? (hasSubjectIntelligence ? undefined : report?.caseSummary) ?? interimBrief?.adminSummary;
  const pattern = valueByKeys(read, ["nearestPublicDossierPattern", "publicDossierPattern"]) ?? valueByKeys(analyst, ["nearestPublicDossierPattern", "publicDraftPosture", "publicDossierPattern"]);
  const worthiness = valueByKeys(read, ["dossierWorthiness", "worthiness"]) ?? analystRead?.dossierWorthiness;
  const readiness = valueByKeys(read, ["readiness", "draftReadiness", "readyForDraft"]) ?? readinessStatusLine(analystRead);
  const assessment = valueByKeys(read, ["bnlAssessment", "assessment", "summary", "shortAssessment"]) ?? valueByKeys(analyst, ["dossierReadinessSummary", "currentRead", "internalRead"]) ?? (hasSubjectIntelligence ? undefined : report?.dossierUse);
  const whatBnlHas = valueByKeys(read, ["whatBnlHas", "whatBNLHas", "availableMaterial"]) ?? valueByKeys(analyst, ["draftIngredients", "sourceFileIngredients", "strongestSignals"]) ?? report?.evidenceSummary;
  const publicSafe = valueByKeys(read, ["publicSafeMaterial", "publicSafeClaims", "usablePublicClaims", "draftIngredients"]) ?? analystRead?.publicReadyClaims ?? (hasSubjectIntelligence ? undefined : report?.publicSafeClaims);
  const internal = valueByKeys(read, ["keepInternal", "internalOnly", "omittedMaterial", "omitFromPublic"]) ?? valueByKeys(analyst, ["privateOrInternalExclusions", "doNotSayPublicly", "sourceBlindInsights"]) ?? report?.internalOnlyNotes;
  const required = valueByKeys(read, ["requiredMissing", "trueBlockers", "neededToFinish"]) ?? valueByKeys(analyst, ["missingConfirmations", "dossierBlockedBy"]);
  const optional = valueByKeys(read, ["optionalMissing", "helpfulButOptional"]) ?? analystRead?.recommendedAdminActions;
  const plan = valueByKeys(read, ["draftCompositionPlan", "compositionPlan"]) ?? valueByKeys(analyst, ["draftCompositionPlan", "draftReadinessReason"]);
  const next = valueByKeys(read, ["recommendedNextAction", "nextAction"]) ?? valueByKeys(analyst, ["recommendedNextAction", "recommendedAdminActions"]) ?? report?.recommendedNextSteps ?? interimBrief?.recommendedNextAction;
  return (
    <div className="space-y-4">
      <Section title="BNL Dossier Assessment" tone="caution" helper="Main Source File readout. Uses dossierCompletionReadV1 first when present, then BNL analyst/case-report fallbacks.">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotItem label="Dossier angle" value={scalarLabel(angle)} />
          <SnapshotItem label="Dossier worthiness" value={scalarLabel(worthiness)} />
          <SnapshotItem label="Readiness" value={scalarLabel(readiness)} />
          <SnapshotItem label="Nearest public pattern" value={scalarLabel(pattern)} />
        </dl>
        <div className="mt-3 border border-border/50 bg-background/30 p-3"><BriefParagraphs value={assessment} /></div>
      </Section>
      <Section title="What BNL Has"><DossierReadoutList value={whatBnlHas} empty="No dossier ingredients recorded yet." /></Section>
      <Section title="Public-Safe Dossier Material" helper="Public-safe claims and usable draft ingredients, not raw public-safe tag buckets."><DossierReadoutList value={publicSafe} empty="No public labels approved yet. Public-safe claims may still be available below." /></Section>
      <Section title="Keep Internal / Omit" helper="Internal/source-blind, queue, lore, Discord-only, unapproved role/link/collaboration context stays out of public copy."><DossierReadoutList value={internal} empty="No internal omit guidance recorded." /></Section>
      <Section title="Needed To Finish"><div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Required</h4><DossierReadoutList value={required} empty="No required dossier-completion needs recorded." /></div><div><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Optional</h4><DossierReadoutList value={optional} empty="No optional improvements recorded." /></div></div></Section>
      <Section title="Draft / Next Action"><div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Draft composition plan</h4><DossierReadoutList value={plan} empty="No draft composition plan recorded." /></div><div><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Recommended next action</h4><DossierReadoutList value={next} empty="No next action recorded." /></div></div></Section>
    </div>
  );
}

function hasReportShape(value: unknown): value is DossierSourceFileCaseReportV1 {
  const report = asRecord(value);
  if (!report) return false;
  return [
    "subjectIntelligenceBriefV1",
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

function archivePayloadCandidates(latestSourceFileArchive?: DossierSourceFileArchiveMetadata) {
  const archive = asRecord(latestSourceFileArchive);
  if (!archive) return [];
  const candidates: UnknownRecord[] = [];
  const seen = new Set<UnknownRecord>();
  const add = (value: unknown) => {
    const object = asRecord(value);
    if (!object || seen.has(object)) return;
    seen.add(object);
    candidates.push(object);
  };
  add(archive);
  for (const key of ["sourcePackage", "archivePayload", "archive", "payload", "sourceFileArchive"] as const) {
    const wrapped = archive[key];
    add(wrapped);
    add(asRecord(wrapped)?.sourcePackage);
  }
  return candidates;
}

function normalizeCaseReport(
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata,
): DossierSourceFileCaseReportV1 | undefined {
  for (const candidate of archivePayloadCandidates(latestSourceFileArchive)) {
    const brief = asRecord(candidate.sourceFileBriefV2);
    const report = [
      candidate.sourceFileCaseReportV1,
      brief?.sourceFileCaseReportV1,
      brief?.caseFileReport,
      candidate.caseFileReport,
    ].find(hasReportShape);
    if (report) return report;
  }
  return undefined;
}

function hasAnalystReadShape(value: unknown): value is DossierSubjectAnalystReadV1 {
  const read = asRecord(value);
  if (!read) return false;
  return [
    "dossierReadinessQuestions",
    "dossierClarificationNeeds",
    "readyForDraft",
    "dossierBlockedBy",
    "draftReadinessReason",
    "subjectName",
    "internalRead",
    "likelySubjectType",
    "confidence",
    "publicDraftPosture",
    "strongestSignals",
    "publicReadyClaims",
    "sourceFileReviewClaims",
    "reviewNeededClaims",
    "reviewableClaims",
    "missingConfirmations",
    "withheldEvidenceAudit",
    "sourceBlindInsights",
    "privateOrInternalExclusions",
    "doNotSayPublicly",
    "missingInfoQuestions",
    "recommendedAdminActions",
    "draftIngredients",
    "sourceFileIngredients",
    "provenanceSummary",
  ].some((key) => read[key] !== undefined);
}

export function normalizeSubjectAnalystReadV1(
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata,
): DossierSubjectAnalystReadV1 | undefined {
  for (const candidate of archivePayloadCandidates(latestSourceFileArchive)) {
    const brief = asRecord(candidate.sourceFileBriefV2);
    const report = asRecord(candidate.sourceFileCaseReportV1);
    const nestedReport = asRecord(brief?.sourceFileCaseReportV1);
    const match = [
      candidate.subjectAnalystReadV1,
      report?.subjectAnalystReadV1,
      nestedReport?.subjectAnalystReadV1,
      brief?.subjectAnalystReadV1,
    ].find(hasAnalystReadShape);
    if (match) return match;
  }
  return undefined;
}

function normalizeInterimBrief(latestSourceFileArchive?: DossierSourceFileArchiveMetadata) {
  for (const candidate of archivePayloadCandidates(latestSourceFileArchive)) {
    const brief = asRecord(candidate.sourceFileBriefV2);
    if (brief) return brief;
  }
  return undefined;
}

function valueByKeys(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) return undefined;
  return keys
    .map((key) => record[key])
    .find((value) => value !== undefined && value !== null && value !== "");
}

function displayValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const record = asRecord(value);
  if (!record) return undefined;
  return (
    textValue(record.text) ??
    textValue(record.summary) ??
    textValue(record.note) ??
    textValue(record.explanation) ??
    textValue(record.read)
  );
}

function scalarLabel(value: unknown) {
  return displayValue(value) ?? "—";
}

function listRecords(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      asRecord(item) ? [asRecord(item) as UnknownRecord] : [],
    );
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function listValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

function BriefParagraphs({ value }: { value: unknown }) {
  const record = asRecord(value);
  const parts = record
    ? [
        record.summary,
        record.read,
        record.text,
        record.note,
        record.confirmedFact,
        record.bnlInterpretation,
        record.uncertainty,
      ]
    : listValues(value);
  const paragraphs = parts.flatMap((part) => {
    const items = stringItems(part);
    if (items.length) return items;
    const displayed = displayValue(part);
    return displayed ? [displayed] : [];
  });
  if (!paragraphs.length) return <p className="text-muted">—</p>;
  return (
    <div className="space-y-2 text-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
      ))}
    </div>
  );
}

function SignalList({
  value,
  empty = "No signals recorded in this brief.",
}: {
  value: unknown;
  empty?: string;
}) {
  const items: Array<{ label: string; record?: UnknownRecord }> = listValues(value).flatMap((item) => {
    const record = asRecord(item);
    if (!record) {
      const displayed = displayValue(item);
      return displayed ? [{ label: displayed }] : [];
    }
    const label =
      displayValue(record.signal) ??
      displayValue(record.summary) ??
      displayValue(record.note) ??
      displayValue(record.text) ??
      displayValue(record.url) ??
      JSON.stringify(record);
    return [{ label, record }];
  });
  if (!items.length) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-foreground">
      {items.map((item, index) => (
        <li key={`${index}-${item.label.slice(0, 24)}`}>
          {item.label}
          {item.record &&
            (displayValue(item.record.strength) || displayValue(item.record.status)) && (
            <span className="ml-2 text-xs uppercase tracking-widest text-accent">
              {displayValue(item.record.strength) ?? displayValue(item.record.status)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function SubjectIntelligenceBriefView({
  report,
}: {
  report: DossierSourceFileCaseReportV1;
}) {
  const brief = asRecord(report.subjectIntelligenceBriefV1);
  if (!brief) return null;
  const activity = asRecord(brief.activitySnapshot) ?? brief;
  const snapshot: Array<[string, unknown]> = [
    ["Approved authored items", valueByKeys(activity, ["totalApprovedPublicAuthoredItems", "approvedPublicAuthoredItems", "totalApprovedAuthoredItems"])],
    ["Public mentions", valueByKeys(activity, ["totalPublicMentions", "publicMentions"])],
    ["Admin-review evidence", valueByKeys(activity, ["reviewOnlyEvidenceCount", "reviewOnlyCount"])],
    ["Evidence scanned", valueByKeys(activity, ["totalEvidenceScanned", "evidenceScanned", "totalScanned"])],
    ["Latest observed", valueByKeys(activity, ["latestObserved", "latestObservedAt", "latestActivityAt"])],
    ["Activity level", valueByKeys(activity, ["activityLevel", "level"])],
    ["Top channels", stringItems(valueByKeys(activity, ["topChannels", "channels"])).join(", ") || valueByKeys(activity, ["topChannels", "channels"])],
  ];
  const topicBuckets = listRecords(brief.topicBuckets);
  const anchors = listRecords(brief.namedAnchors).filter((anchor) => {
    const name = scalarLabel(valueByKeys(anchor, ["name", "label"]));
    const strength = scalarLabel(anchor.strength).toLowerCase();
    return name !== "—" && !/^(noise|unknown|n\/a|null)$/i.test(name) && strength !== "noise";
  });
  const bnlTake = asRecord(brief.bnlTake);
  const sourceFileGaps = listValues(brief.sourceFileGaps);
  const adminActions = listValues(brief.recommendedAdminActions);

  return (
    <Section title="BNL Subject Intelligence Brief" tone="review" helper="Primary Admin-review BNL readout. Use this as admin context, not public copy.">
      <div className="space-y-4">
        <section className="border border-accent/60 bg-background/30 p-4">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Subject Read</h4>
          <BriefParagraphs value={brief.subjectRead} />
        </section>

        <section className="border border-border/50 bg-background/20 p-3">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">Activity Snapshot</h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.map(([label, value]) => <SnapshotItem key={label} label={label} value={scalarLabel(value)} />)}
          </dl>
        </section>

        <section className="border border-border/50 bg-background/20 p-3">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">What They Talk About</h4>
          {topicBuckets.length ? (
            <ul className="space-y-3">
              {topicBuckets.map((topic, index) => (
                <li key={`${index}-${scalarLabel(topic.topic).slice(0, 24)}`} className="border border-border/50 bg-background/30 p-3">
                  <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest text-accent">
                    <span>{scalarLabel(valueByKeys(topic, ["topic", "name", "label"]))}</span>
                    <span>Strength: {scalarLabel(topic.strength)}</span>
                    {valueByKeys(topic, ["evidenceCount", "count"]) !== undefined && <span>Evidence: {scalarLabel(valueByKeys(topic, ["evidenceCount", "count"]))}</span>}
                  </div>
                  <BriefParagraphs value={valueByKeys(topic, ["explanation", "summary", "note"])} />
                  {stringItems(valueByKeys(topic, ["exampleSignals", "signals", "examples"])).length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                      {stringItems(valueByKeys(topic, ["exampleSignals", "signals", "examples"])).map((signal, signalIndex) => <li key={`${signalIndex}-${signal.slice(0, 16)}`}>{signal}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="text-muted">No topic buckets recorded in this brief.</p>}
        </section>

        <section className="border border-border/50 bg-background/20 p-3">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">Named Anchors / Connections</h4>
          {anchors.length ? (
            <ul className="space-y-2">
              {anchors.map((anchor, index) => (
                <li key={`${index}-${scalarLabel(anchor.name).slice(0, 24)}`} className="border border-border/50 bg-background/30 p-3">
                  <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest text-accent">
                    <span>{scalarLabel(valueByKeys(anchor, ["name", "label"]))}</span>
                    <span>Type: {scalarLabel(anchor.type)}</span>
                    <span>Strength: {scalarLabel(anchor.strength)}</span>
                  </div>
                  <p className="mt-2 text-foreground">{scalarLabel(valueByKeys(anchor, ["note", "summary", "explanation"]))}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted">No meaningful named anchors recorded in this brief.</p>}
        </section>

        <section className="border border-border/50 bg-background/20 p-3">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">Current Take / Admin Guidance</h4>
          <dl className="space-y-2">
            <div><dt className="text-xs uppercase tracking-widest text-accent">Confirmed fact</dt><dd className="text-foreground">{scalarLabel(valueByKeys(bnlTake, ["confirmedFact", "confirmedFacts", "confirmed"]))}</dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-accent">BNL interpretation</dt><dd className="text-foreground">{scalarLabel(valueByKeys(bnlTake, ["bnlInterpretation", "interpretation", "take"]) ?? brief.bnlTake)}</dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-accent">Uncertainty</dt><dd className="text-foreground">{scalarLabel(valueByKeys(bnlTake, ["uncertainty", "uncertainties", "unknowns"]))}</dd></div>
          </dl>
        </section>

        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">Music / Link Signals</h4><SignalList value={brief.musicAndLinkSignals} /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground">Relationship / Context Signals</h4><p className="mb-3 text-xs text-muted">Admin-review unless separately confirmed.</p><SignalList value={brief.relationshipSignals} /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">Queue / Submission Read</h4><BriefParagraphs value={brief.queueSubmissionRead} /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">What To Add To This Source File</h4><div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><div><h5 className="mb-2 text-xs uppercase tracking-widest text-accent">Source file gaps</h5><SignalList value={sourceFileGaps} empty="No source file gaps recorded." /></div><div><h5 className="mb-2 text-xs uppercase tracking-widest text-accent">Recommended admin actions</h5><SignalList value={adminActions} empty="No recommended admin actions recorded." /></div></div></section>
        <section className="border border-accent/60 bg-accent/10 p-3"><h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground">Do Not Say Publicly Yet</h4><SignalList value={brief.doNotSayPubliclyYet} empty="No do-not-say items recorded." /></section>
      </div>
    </Section>
  );
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


function AnalystList({ value, empty }: { value: unknown; empty: string }) {
  const items = stringItems(value);
  if (!items.length) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-2 pl-5 text-foreground">
      {items.map((item, index) => <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>)}
    </ul>
  );
}

export type DossierSourceFileReviewableClaim = {
  relatedReadinessQuestions?: ReadinessQuestion[];
  readinessMetadata?: string[];
  id: string;
  claimText: string;
  claimType: DossierSourceFileClaimType;
  sourceSection: string;
  title?: string;
  decisionQuestion?: string;
  whyItExists?: string;
  safeEvidenceSummary?: string;
  reviewLane?: string;
  confidence?: string;
  suggestedDecision?: string;
  safestDefault?: string;
  blockedBy?: string[];
  whatYouAreApproving?: string;
  whatToEnter?: string;
  placeholderText?: string;
  exampleApprovedTexts?: string[];
  actionConsequences?: Record<string, string>;
  isSignalSummary?: boolean;
  canConfirmPublic?: boolean;
  canConfirmInternal?: boolean;
  canReject?: boolean;
  canNeedMoreInfo?: boolean;
  requiresEditedTextForPublic?: boolean;
  whatAmIDeciding?: string;
  isWeakEvidenceLabel?: boolean;
  suggestedApprovedText?: string;
  suggestedInternalText?: string;
  suggestedAnswerText?: string;
  suggestedRejectionReason?: string;
  suggestedTextSource?: "bnl" | "site_fallback" | "none";
  suggestedInternalTextSource?: "bnl" | "site_fallback" | "none";
  suggestedAnswerTextSource?: "bnl" | "site_fallback" | "none";
  bnlRecommendationText?: string;
  recommendedAction?: string;
  recommendedActionReason?: string;
  cannotSuggestPublicReason?: string;
  actionability?: string;
  hasSafePublicSuggestion?: boolean;
  isVagueArtifact?: boolean;
  isInternalAuditArtifact?: boolean;
  displayApprovalInstruction?: string;
  confirmationTarget?: DossierSourceFileConfirmationTarget;
  primaryActionLabel?: string;
  secondaryActionLabels?: string[];
  verificationPacketQuestions?: string[];
  verificationPacketAudience?: string;
  recommendedAdminActionCards?: UnknownRecord[];
  review?: DossierSourceFileClaimReview;
  resolvedQuestion?: DossierResolvedQuestionReadModel;
  suppressedReason?: string;
};

type SourceFileSignalSummary = {
  id: string;
  label: string;
  count?: string;
  suggestion: string;
  actionable: string;
};

function stableClaimId(input: { candidateId?: string; sourceSection: string; claimText: string; sourceArchiveId?: string }) {
  const normalized = `${input.candidateId ?? "candidate"}|${input.sourceSection}|${input.claimText.trim().toLowerCase().replace(/\s+/g, " ")}|${input.sourceArchiveId ?? ""}`;
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  return `source_file_claim_${hash.toString(36)}`;
}

function analystString(record: UnknownRecord | undefined, keys: string[]) {
  return displayValue(valueByKeys(record, keys));
}


function stringListFromRecord(record: UnknownRecord | undefined, key: string): string[] {
  return stringItems(record?.[key]);
}

function safeHumanText(value: unknown) {
  const text = displayValue(value);
  if (!text) return undefined;
  if (/@|stripe|payment|customer|token|env|config|raw evidence|raw id|database|table|source-blind detail|private|mod-only|internal alias/i.test(text)) {
    return "BNL can see protected context here, but it needs approved wording or a public source before anything can be used publicly.";
  }
  if (/^[a-z0-9]+(?:_[a-z0-9]+){1,}$/.test(text.trim())) return text.trim().replace(/_/g, " ");
  return text;
}

function normalizedRoutingToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const STANDALONE_ROUTING_TAGS = new Set([
  "collaboration_interest",
  "queue_submission",
  "contest",
  "identity",
  "lore",
  "music",
  "orion",
]);

function isStandaloneRoutingTag(text: string) {
  const normalized = normalizedRoutingToken(text);
  return Boolean(normalized) && STANDALONE_ROUTING_TAGS.has(normalized);
}

function metadataText(record: UnknownRecord | undefined, keys: string[]) {
  return keys.map((key) => displayValue(record?.[key])).filter(Boolean).join(" ");
}

function routeClassificationSourceText(record: UnknownRecord | undefined, sourceKind?: string) {
  return `${sourceKind ?? ""} ${metadataText(record, ["actionability", "reviewLane", "lane", "safetyLane", "sourceSafety", "answerType", "questionFamily", "questionCategory", "dossierSection", "displayTitle", "title"])}`.toLowerCase();
}

function isKnownRouteClassificationSource(record: UnknownRecord | undefined, sourceKind?: string) {
  return /route[-_ ]?only|routing(?: tag)?|classification[-_ ]?only|classification tag|tag candidate|primary tag|secondary tag/.test(routeClassificationSourceText(record, sourceKind));
}

function isRouteOnlyClassificationToken(text: string, record?: UnknownRecord, sourceKind?: string) {
  const normalized = normalizedRoutingToken(text);
  if (!normalized) return false;
  if (isStandaloneRoutingTag(text) && (isKnownRouteClassificationSource(record, sourceKind) || normalized.includes("_"))) return true;
  return isKnownRouteClassificationSource(record, sourceKind) && /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(normalized);
}

function memoryFirstSuppressionReason(record: UnknownRecord | undefined, text: string, sourceSection: string): string | undefined {
  const metadata = metadataText(record, ["actionability", "reviewLane", "lane", "safetyLane", "recommendedAction", "suggestedDecision", "sourceSafety", "answerType", "questionFamily", "questionCategory", "dossierSection", "displayBNLRecommendation", "displaySafeDefault", "cannotSuggestPublicReason"]).toLowerCase();
  const joined = `${text} ${metadata}`.toLowerCase();
  if (isRouteOnlyClassificationToken(text, record, sourceSection)) return "Suppressed route/classification-only item from active review.";
  if (/internal[-_ ]?only|private|withheld|lore/.test(joined)) return "Suppressed internal/source-blind item from public review pressure.";
  if (/omit|omittable|can be omitted|not needed for draft|not required/.test(joined)) return "Suppressed omit-able detail from active review.";
  if (/keep_boundary|resolved_boundary|resolved boundary|already resolved boundary/.test(joined)) return "Suppressed resolved boundary/do-not-say item from active review.";
  return undefined;
}

function memoryFirstQuestionIsDecisionUnlocking(question: ReadinessQuestion) {
  const record = {
    answerType: question.answerType,
    sourceSafety: question.sourceSafety,
    questionFamily: question.questionFamily,
    questionCategory: question.questionCategory,
    dossierSection: question.dossierSection,
  };
  const metadata = `${question.priority ?? ""} ${question.answerType ?? ""} ${question.sourceSafety ?? ""} ${question.dossierSection ?? ""} ${question.questionFamily ?? ""} ${question.questionCategory ?? ""} ${question.audience ?? ""}`.toLowerCase();
  const joined = `${question.question} ${metadata}`.toLowerCase();
  if (isRouteOnlyClassificationToken(question.question, record, question.dossierSection)) return false;
  if (/internal[-_ ]?only|source[-_ ]?blind|omit|omittable|can be omitted|optional|nice_to_have|lore|boundary|do_not_say|do not say|rejected/.test(joined)) return false;
  return /decision|unlock|required|critical|high|public source|owner|identity|safety|public fact|wording|link ownership|ready|draft|clarif|mod/.test(joined);
}

type ReadinessQuestion = {
  id: string;
  question: string;
  audience: DossierSourceFileVerificationPacketAudience;
  audienceLabel: string;
  whyItMatters?: string;
  questionKey?: string;
  questionFamily?: string;
  questionCategory?: string;
  questionVersion?: string;
  scopeKey?: string;
  subjectKey?: string;
  supersedesQuestionKeys?: string[];
  narrowsQuestionKeys?: string[];
  replacedByQuestionKey?: string;
  dossierSection?: string;
  priority?: string;
  answerType?: string;
  sourceSafety?: string;
  sourceCount?: string;
  relatedReviewClaimIds: string[];
  clarificationOnly?: boolean;
  resolution?: DossierResolvedQuestionReadModel;
};

function readinessAudienceKey(value: unknown): DossierSourceFileVerificationPacketAudience {
  const raw = textValue(value)?.toLowerCase().replace(/[ -]+/g, "_");
  if (raw === "subject" || raw === "admin" || raw === "public_source" || raw === "owner_approved_wording" || raw === "link_ownership" || raw === "owner" || raw === "mod") return raw;
  return raw || "unknown";
}

function readinessAudienceLabel(value: unknown) {
  const key = readinessAudienceKey(value);
  if (key === "subject") return "Subject";
  if (key === "admin") return "Admin";
  if (key === "public_source") return "Public source needed";
  if (key === "owner_approved_wording") return "Owner-approved wording";
  if (key === "link_ownership") return "Link ownership";
  if (key === "owner") return "Owner/operator";
  if (key === "mod") return "Mod / informed team member";
  return "Needs routing";
}

function readinessQuestionsFrom(value: unknown, clarificationOnly = false): ReadinessQuestion[] {
  return listValues(value).flatMap((item, index) => {
    const record = asRecord(item);
    const question = safeHumanText(record ? valueByKeys(record, ["question", "text", "prompt", "need"]) : item);
    if (!question) return [];
    const audience = readinessAudienceKey(record ? valueByKeys(record, ["audience", "recipientClass", "confirmationTarget", "verificationPacketAudience"]) : undefined);
    const relatedReviewClaimIds = stringItems(record?.relatedReviewClaimIds);
    return [{
      id: textValue(record?.id) ?? `readiness_question_${index}_${normalizeVerificationQuestion(question).slice(0, 32).replace(/[^a-z0-9]+/g, "_")}`,
      question,
      audience,
      audienceLabel: readinessAudienceLabel(audience),
      whyItMatters: safeHumanText(valueByKeys(record, ["whyItMatters", "reason", "why"])),
      questionKey: textValue(record?.questionKey),
      questionFamily: textValue(record?.questionFamily),
      questionCategory: textValue(record?.questionCategory),
      questionVersion: textValue(record?.questionVersion),
      scopeKey: textValue(record?.scopeKey),
      subjectKey: textValue(record?.subjectKey),
      supersedesQuestionKeys: stringItems(record?.supersedesQuestionKeys),
      narrowsQuestionKeys: stringItems(record?.narrowsQuestionKeys),
      replacedByQuestionKey: textValue(record?.replacedByQuestionKey),
      dossierSection: safeHumanText(record?.dossierSection),
      priority: safeHumanText(record?.priority),
      answerType: safeHumanText(record?.answerType),
      sourceSafety: safeHumanText(record?.sourceSafety),
      sourceCount: safeHumanText(record?.sourceCount),
      relatedReviewClaimIds,
      clarificationOnly,
    }];
  });
}

function readinessMetadataItems(question: ReadinessQuestion) {
  return [
    question.dossierSection ? `Section: ${question.dossierSection}` : undefined,
    question.priority ? `Priority: ${question.priority}` : undefined,
    question.answerType ? `Answer: ${question.answerType}` : undefined,
    question.sourceSafety ? `Source: ${question.sourceSafety}` : undefined,
    question.sourceCount ? `Used by ${question.sourceCount} source items` : undefined,
  ].filter((item): item is string => Boolean(item));
}

function ReadinessMetadataLine({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return <p className="mt-1 text-[11px] text-muted">{items.join(" · ")}</p>;
}

function analystReadinessQuestions(analystRead?: DossierSubjectAnalystReadV1) {
  return [
    ...readinessQuestionsFrom(analystRead?.dossierReadinessQuestions),
    ...readinessQuestionsFrom(analystRead?.dossierClarificationNeeds, true),
  ];
}

function readinessStatusLine(analystRead?: DossierSubjectAnalystReadV1) {
  const raw = analystRead?.readyForDraft;
  const ready = raw === true || (typeof raw === "string" && /^(true|yes|ready)$/i.test(raw.trim()));
  const notReady = raw === false || (typeof raw === "string" && /^(false|no|not_ready|blocked)$/i.test(raw.trim()));
  if (!ready && !notReady && !analystRead?.draftReadinessReason) return undefined;
  return `${ready ? "Ready for draft" : "Not ready for draft"}${safeHumanText(analystRead?.draftReadinessReason) ? ` — ${safeHumanText(analystRead?.draftReadinessReason)}` : ""}`;
}

function confirmationTargetLabel(value: unknown) {
  const target = textValue(value)?.toLowerCase();
  if (!target || target === "none") return undefined;
  if (target === "subject") return "Subject";
  if (target === "admin") return "Admin";
  if (target === "public_source") return "Public source needed";
  if (target === "owner_approved_wording") return "Owner-approved wording";
  if (target === "link_ownership") return "Link ownership";
  if (target === "owner") return "Owner/operator";
  if (target === "mod") return "Mod / informed team member";
  if (target === "unknown") return "Needs routing";
  return target.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayField(record: UnknownRecord | undefined, key: string) {
  return analystString(record, [key]);
}

function classifyClaimType(sourceSection: string, record?: UnknownRecord): DossierSourceFileClaimType {
  const lane = `${analystString(record, ["reviewLane", "lane", "safetyLane"]) ?? ""} ${analystString(record, ["claimType", "type", "actionability"]) ?? ""}`.toLowerCase();
  if (sourceSection === "sourceBlindInsights" || /source[-_ ]?blind|source_blind_warning|withheld|private|internal/.test(lane)) return "source_blind";
  if (sourceSection === "missingInfoQuestions" || sourceSection === "missingConfirmations" || /missing_confirmation/.test(lane)) return "missing_info";
  if (sourceSection === "recommendedAdminActions" || /admin_task/.test(lane)) return "recommended_action";
  if (sourceSection === "doNotSayPublicly" || /boundary/.test(lane)) return "do_not_say";
  if (/public[-_ ]?ready/.test(lane) || record?.publicSafe === true) return "public_ready";
  return "review_needed";
}

function isSignalSummaryText(text: string, record?: UnknownRecord) {
  const joined = `${text} ${analystString(record, ["claimType", "type", "reviewLane", "suggestedDecision", "actionability"]) ?? ""}`.toLowerCase();
  return /music discussion only|song\/track\/demo\/wip|feedback requests|generic links|moderation\/community support|source files\/dossiers|pattern summary|signal summary|signal_count|evidence_signal/.test(joined);
}

function isWeakEvidenceLabelText(text: string, record?: UnknownRecord) {
  const joined = `${text} ${analystString(record, ["claimType", "type", "reviewLane", "suggestedDecision", "actionability"]) ?? ""}`.toLowerCase();
  return /^(possible review claim:\s*)?(contest organizer|rules\/instructions poster|lore-heavy|theory\/anomaly-heavy|antagonistic\/challenging)$/i.test(text.trim()) || /weak evidence label|weak_label|evidence label/.test(joined);
}

function isVagueArtifactText(text: string, record?: UnknownRecord) {
  const joined = `${text} ${analystString(record, ["claimType", "type", "reviewLane", "actionability", "displayTitle", "title"]) ?? ""}`.toLowerCase();
  return /subject-owned\/keyed local evidence exists|some subject memory lacked public-safe provenance|local evidence exists|raw source evidence exists|source-blind\/internal context|non_actionable_artifact|internal evidence artifact|internal[_ -]?(audit|evidence)?[_ -]?artifact|audit[_ -]?artifact|vague internal evidence marker/.test(joined);
}

function subjectLabel(value?: string) {
  return value?.trim() || "this subject";
}

function humanBnlRecommendation(claimType: DossierSourceFileClaimType, suggestedDecision: string | undefined, weakLabel: boolean) {
  const decision = (suggestedDecision ?? "").toLowerCase();
  if (weakLabel || /reject/.test(decision)) return "BNL recommends rejecting this if the label is inaccurate.";
  if (claimType === "source_blind") return "BNL thinks this is source-blind and needs public provenance before use.";
  if (/internal|keep/.test(decision)) return "BNL recommends keeping this internal unless owner/admin confirms it.";
  if (/public/.test(decision)) return "BNL thinks this can be public only if the suggested wording is approved.";
  if (/more|confirm|needs/.test(decision)) return "BNL recommends more confirmation before public use.";
  return "BNL recommends admin review before use.";
}

function suggestedTextsForClaim(input: { claimText: string; claimType: DossierSourceFileClaimType; record?: UnknownRecord; subjectName: string; weakLabel: boolean; vagueArtifact: boolean }) {
  const explicitPublic = analystString(input.record, ["suggestedPublicWording"]);
  const legacyExplicitPublic = analystString(input.record, ["suggestedApprovedText", "suggestedPublicText", "publicSafeText", "approvedText"]);
  const explicitInternal = analystString(input.record, ["suggestedInternalNote"]);
  const legacyInternal = analystString(input.record, ["suggestedInternalText", "internalNote"]);
  const explicitQuestion = analystString(input.record, ["suggestedMissingInfoQuestion"]);
  const legacyAnswer = analystString(input.record, ["suggestedAnswer", "suggestedAnswerText", "answer"]);
  const rejection = analystString(input.record, ["suggestedRejectionReason"]);
  const lower = `${input.claimText} ${analystString(input.record, ["claimType", "title"]) ?? ""}`.toLowerCase();
  const publicText = explicitPublic ?? legacyExplicitPublic;
  const publicSource = explicitPublic ? "bnl" : legacyExplicitPublic ? "site_fallback" : "none";
  const internal = explicitInternal ?? legacyInternal;
  const internalSource = explicitInternal ? "bnl" : legacyInternal ? "site_fallback" : "none";
  const question = explicitQuestion ?? legacyAnswer;
  const questionSource = explicitQuestion ? "bnl" : legacyAnswer ? "site_fallback" : "none";
  if (input.vagueArtifact) return { approved: publicText, publicSource, internal: internal ?? "Keep as internal audit context only.", internalSource: internal ? internalSource : "site_fallback", answer: question, answerSource: questionSource, rejection };
  if (input.weakLabel || lower.trim() === "contest organizer") return { approved: publicText, publicSource, internal: internal ?? "Keep this as internal pattern context only.", internalSource: internal ? internalSource : "site_fallback", answer: question ?? `Reject this claim if ${input.subjectName} is not actually a contest organizer.`, answerSource: question ? questionSource : "site_fallback", rejection };
  if (lower.includes("display name") || lower.includes("preferred name")) return { approved: publicText, publicSource, internal: internal ?? `Use ${input.subjectName} publicly; keep other aliases internal.`, internalSource: internal ? internalSource : "site_fallback", answer: question ?? input.subjectName, answerSource: question ? questionSource : "site_fallback", rejection };
  if (lower.includes("role") || lower.includes("title")) return { approved: publicText, publicSource, internal: internal ?? `Keep role/title internal until owner confirms ${input.subjectName}.`, internalSource: internal ? internalSource : "site_fallback", answer: question ?? `Do not state a public role for ${input.subjectName} yet.`, answerSource: question ? questionSource : "site_fallback", rejection };
  if (lower.includes("link")) return { approved: publicText, publicSource, internal: internal ?? `No public links are approved for ${input.subjectName} yet.`, internalSource: internal ? internalSource : "site_fallback", answer: question ?? `No public links are approved for ${input.subjectName} yet.`, answerSource: question ? questionSource : "site_fallback", rejection };
  if (lower.includes("orion")) return { approved: publicText, publicSource, internal: internal ?? "Keep Orion context internal for now.", internalSource: internal ? internalSource : "site_fallback", answer: question ?? "Keep Orion context internal for now.", answerSource: question ? questionSource : "site_fallback", rejection };
  if (lower.includes("queue") || lower.includes("submission")) return { approved: publicText, publicSource, internal: internal ?? `Do not reference ${input.subjectName}'s queue/submission history publicly.`, internalSource: internal ? internalSource : "site_fallback", answer: question ?? "Do not reference queue/submission history publicly.", answerSource: question ? questionSource : "site_fallback", rejection };
  return { approved: publicText, publicSource, internal: internal ?? input.claimText, internalSource: internal ? internalSource : "site_fallback", answer: question, answerSource: questionSource, rejection };
}

function splitSignal(text: string) {
  const match = text.match(/^(.+?):\s*(\d+)$/);
  return { label: (match?.[1] ?? text).trim(), count: match?.[2] };
}

function signalSuggestion(label: string) {
  const lower = label.toLowerCase();
  if (lower.includes("music discussion")) return "Music discussion signal. BNL found repeated music discussion, but this does not prove a public music identity or owned link.";
  if (lower.includes("feedback")) return "Feedback request signal. BNL found review/feedback patterns, but this is context rather than a public-ready fact.";
  if (lower.includes("song") || lower.includes("track")) return "Music mention signal. BNL found song/track/demo/WIP language without enough public-safe link ownership evidence.";
  if (lower.includes("generic links")) return "Generic link signal. BNL found links, but they still need ownership and public-use confirmation.";
  return "Context signal. BNL used this pattern during analysis, but it is not a public-ready fact by itself.";
}

function buildCardGuidance(claimText: string, claimType: DossierSourceFileClaimType, record: UnknownRecord | undefined, subjectName: string) {
  const lower = `${claimText} ${analystString(record, ["claimType", "title"]) ?? ""}`.toLowerCase();
  if (lower.includes("display name") || lower.includes("preferred name")) return {
    decisionQuestion: "What exact display name may BNL use publicly?",
    placeholderText: subjectName,
    exampleApprovedTexts: [subjectName, `Use ${subjectName} publicly; keep other aliases internal.`],
  };
  if (lower.includes("role") || lower.includes("title")) return {
    title: "Confirm public role/title",
    decisionQuestion: `Which public label, if any, may BNL use for ${subjectName}?`,
    whyItExists: "BNL found role/community/music/context signals, but not enough confirmed public-safe evidence to state a formal role.",
    placeholderText: `${subjectName} is a BARCODE Network community member.`,
    exampleApprovedTexts: [`${subjectName} is a BARCODE Network community member.`, `${subjectName} is a BARCODE Radio viewer/community participant.`, `Do not state a public role for ${subjectName} yet.`],
  };
  if (lower.includes("link")) return {
    decisionQuestion: "Which links are owned/approved for public reference?",
    placeholderText: "No public links approved yet.",
    exampleApprovedTexts: ["No public links approved yet.", "Approved public link: https://...", `Do not mention ${subjectName} music links until owner confirms them.`],
  };
  if (lower.includes("orion")) return {
    decisionQuestion: `Can BNL mention Orion in public ${subjectName} context, or keep it internal?`,
    placeholderText: "Keep Orion context internal for now.",
    exampleApprovedTexts: ["Keep Orion context internal for now.", "BNL may reference Orion only as internal BARCODE context, not public dossier copy.", `BNL may mention ${subjectName} has recurring Orion-related BARCODE context.`],
  };
  if (lower.includes("queue") || lower.includes("submission")) return {
    decisionQuestion: `Can BNL mention ${subjectName}’s queue/submission history publicly?`,
    placeholderText: "Do not reference queue/submission history publicly.",
    exampleApprovedTexts: ["Do not reference queue/submission history publicly.", `${subjectName} has submitted music to BARCODE Radio.`, "Keep queue/submission history internal."],
  };
  return {
    decisionQuestion: claimType === "source_blind" ? "Should this source-blind context stay internal, need provenance, or be rejected?" : "What decision should admins make for this Source File item?",
    placeholderText: claimType === "source_blind" ? "Add separate public-safe replacement wording only if confirmed elsewhere." : "Enter the exact sentence BNL may use as a Source File fact.",
    exampleApprovedTexts: claimType === "source_blind" ? ["Keep this context internal until provenance is confirmed."] : ["Enter the exact public-safe wording admins have confirmed."],
  };
}

function buildClaimCard(input: { value: unknown; sourceSection: string; claimType: DossierSourceFileClaimType; candidateId?: string; sourceArchiveId?: string; subjectName?: string; reviews?: Map<string, DossierSourceFileClaimReview>; candidate?: Partial<DossierCandidate> }): DossierSourceFileReviewableClaim | undefined {
  const record = asRecord(input.value);
  const claimText = displayValue(input.value) ?? analystString(record, ["claimText", "text", "claim", "question", "action", "boundary"]);
  if (!claimText) return undefined;
  const claimType = classifyClaimType(input.sourceSection, record) || input.claimType;
  const displaySubject = subjectLabel(input.subjectName ?? analystString(record, ["subjectName"]));
  const weakLabel = isWeakEvidenceLabelText(claimText, record);
  const vagueArtifact = isVagueArtifactText(claimText, record);
  const displayTitle = displayField(record, "displayTitle");
  const resolutionQuestion = { ...(record ?? {}), question: analystString(record, ["verificationPacketQuestion", "question", "text", "claimText"]) ?? claimText, dossierSection: analystString(record, ["dossierSection"]) ?? input.sourceSection };
  const resolvedQuestion = input.candidate ? resolveBnlDossierQuestionFromExistingTruth({ question: resolutionQuestion, candidate: input.candidate }) : undefined;
  const internalArtifact = vagueArtifact || /^internal evidence artifact$/i.test(displayTitle ?? "") || /^vague internal evidence marker$/i.test(claimText.trim());
  const suppressedReason = memoryFirstSuppressionReason(record, claimText, input.sourceSection);
  const guidance = weakLabel
    ? { title: "Weak evidence label / pattern", decisionQuestion: "Is this label accurate and useful, or should it be rejected?", placeholderText: "Only enter wording here if this label is true and public-safe. Otherwise reject this claim.", exampleApprovedTexts: [`Keep ${displaySubject} label internal until confirmed.`, "Reject this label as inaccurate or not useful."] }
    : claimType === "recommended_action" || claimType === "do_not_say"
      ? { decisionQuestion: claimType === "recommended_action" ? "What admin follow-up should happen for this task?" : "Should this public boundary stay in force?", placeholderText: "", exampleApprovedTexts: [] }
      : buildCardGuidance(claimText, claimType, record, displaySubject);
  const suggested = suggestedTextsForClaim({ claimText, claimType, record, subjectName: displaySubject, weakLabel, vagueArtifact });
  const rawSuggestedDecision = analystString(record, ["recommendedAction", "suggestedDecision", "recommendation"]);
  const id = stableClaimId({ candidateId: input.candidateId, sourceSection: input.sourceSection, claimText, sourceArchiveId: input.sourceArchiveId });
  const blockedBy = stringItems(record?.blockedBy);
  return {
    id,
    claimText,
    claimType,
    sourceSection: input.sourceSection,
    isWeakEvidenceLabel: weakLabel,
    whatAmIDeciding: displayField(record, "displayWhatIsBeingChecked") ?? (vagueArtifact
      ? "This is not a public-ready claim. BNL has not provided a concrete fact to approve."
      : weakLabel
        ? "This appears to be an evidence label or pattern, not a confirmed fact. Do not approve it as public unless BNL or an admin provides exact public-safe wording that is true."
        : claimType === "source_blind"
        ? "You are deciding whether this source-blind context should stay internal, needs a public source, or should be rejected as irrelevant/incorrect."
        : /contest organizer/i.test(claimText)
          ? `You are deciding whether ${displaySubject} is actually a contest organizer. If not, reject this claim.`
          : /role|title/i.test(claimText)
            ? "You are deciding whether this role/title is true for this subject, and whether BNL may use it publicly."
            : /link/i.test(claimText)
              ? "You are deciding whether these links are owned/approved for public reference."
              : /orion/i.test(claimText)
                ? "You are deciding whether Orion may be mentioned publicly, kept internal, or rejected as irrelevant/incorrect."
                : /queue|submission/i.test(claimText)
                  ? "You are deciding whether queue/submission history can be referenced publicly, kept internal, or rejected."
                  : "You are deciding whether this claim is true, whether it is useful internally, and whether exact public wording is approved."),
    title: displayTitle ?? analystString(record, ["title", "label"]) ?? guidance.title ?? (claimType === "do_not_say" ? "Public boundary" : claimType === "recommended_action" ? "Admin task" : claimType === "missing_info" ? "Missing confirmation" : "Review Source File claim"),
    decisionQuestion: displayField(record, "displayDecision") ?? analystString(record, ["decisionQuestion", "question"]) ?? guidance.decisionQuestion,
    whyItExists: displayField(record, "displayWhyBNLFlaggedIt") ?? analystString(record, ["why", "whyItExists", "reason"]) ?? (("whyItExists" in guidance ? guidance.whyItExists : undefined) ?? "BNL flagged this because it needs an explicit admin decision before use."),
    safeEvidenceSummary: displayField(record, "displayEvidenceSummary") ?? analystString(record, ["safeEvidenceSummary", "evidenceSummary", "summary"]),
    reviewLane: analystString(record, ["reviewLane", "lane", "safetyLane"]),
    confidence: analystString(record, ["confidence"]),
    suggestedDecision: rawSuggestedDecision,
    bnlRecommendationText: displayField(record, "displayBNLRecommendation") ?? humanBnlRecommendation(claimType, rawSuggestedDecision, weakLabel),
    suggestedApprovedText: suggested.approved,
    suggestedInternalText: suggested.internal,
    suggestedAnswerText: suggested.answer,
    suggestedRejectionReason: suggested.rejection,
    suggestedTextSource: suggested.publicSource as "bnl" | "site_fallback" | "none",
    suggestedInternalTextSource: suggested.internalSource as "bnl" | "site_fallback" | "none",
    suggestedAnswerTextSource: suggested.answerSource as "bnl" | "site_fallback" | "none",
    recommendedAction: analystString(record, ["recommendedAction"]),
    recommendedActionReason: analystString(record, ["recommendedActionReason"]),
    cannotSuggestPublicReason: analystString(record, ["cannotSuggestPublicReason"]),
    actionability: analystString(record, ["actionability"]),
    isVagueArtifact: vagueArtifact,
    isInternalAuditArtifact: internalArtifact,
    hasSafePublicSuggestion: Boolean(suggested.approved && suggested.publicSource === "bnl" && (record?.publicSafe === true || claimType === "public_ready" || /approve_public|public/.test((rawSuggestedDecision ?? "").toLowerCase())) && !weakLabel && !vagueArtifact && claimType !== "source_blind"),
    safestDefault: displayField(record, "displaySafeDefault") ?? analystString(record, ["safestDefault"]) ?? (vagueArtifact ? "Keep as internal audit context, ask for a public source, or dismiss the artifact." : weakLabel ? "Reject if inaccurate; keep internal if useful; do not approve public without exact confirmed wording." : claimType === "public_ready" ? "Confirm only if the wording is public-safe and sourced." : "Keep internal or ask for confirmation until owner/admin confirms the wording."),
    blockedBy,
    displayApprovalInstruction: displayField(record, "displayApprovalInstruction"),
    confirmationTarget: analystString(record, ["confirmationTarget"]),
    primaryActionLabel: displayField(record, "primaryActionLabel"),
    secondaryActionLabels: stringListFromRecord(record, "secondaryActionLabels"),
    verificationPacketQuestions: stringListFromRecord(record, "verificationPacketQuestion"),
    verificationPacketAudience: analystString(record, ["verificationPacketAudience"]),
    recommendedAdminActionCards: listRecords(record?.recommendedAdminActionCards),
    whatYouAreApproving: claimType === "recommended_action" ? "An admin task state, not a public claim approval." : claimType === "do_not_say" ? "A public-copy boundary that protects against unsupported claims." : claimType === "source_blind" ? "Only a separately confirmed public-safe replacement, not the source-blind text itself." : "A Source File review decision. Confirming public-ready does not publish a dossier.",
    whatToEnter: claimType === "recommended_action" ? "No public-safe text is required unless this task explicitly creates a Source File note." : claimType === "do_not_say" ? "No public-ready wording should be entered for boundaries." : claimType === "source_blind" ? "Add public-safe replacement text, if owner/admin confirms it elsewhere." : "Enter the exact sentence BNL may use as a Source File fact.",
    placeholderText: guidance.placeholderText,
    exampleApprovedTexts: guidance.exampleApprovedTexts,
    actionConsequences: {
      confirmed_public: "Use this only if the claim is true and the exact public wording is approved. This creates a public-safe Source File fact. It does not publish a dossier.",
      confirmed_internal: claimType === "recommended_action" ? "Marks this admin task done." : claimType === "do_not_say" ? "Keeps this public-copy boundary in force." : "Use this if the claim may be useful to BNL internally but should not be public copy.",
      needs_more_info: "Use this if BNL should keep asking for confirmation before using this claim.",
      rejected: claimType === "do_not_say" ? "Removes this boundary from the active review queue." : "Use this if the claim is wrong, misleading, irrelevant, or not worth keeping.",
      edited: claimType === "source_blind" ? "Adds only the edited public-safe replacement wording after separate confirmation." : "Saves edited public-safe Source File wording.",
    },
    canConfirmPublic: claimType === "public_ready" || claimType === "review_needed",
    canConfirmInternal: claimType !== "do_not_say",
    canReject: true,
    canNeedMoreInfo: claimType !== "do_not_say",
    requiresEditedTextForPublic: claimType === "source_blind",
    review: input.reviews?.get(id),
    resolvedQuestion: resolvedQuestion?.safeToSuppressFromActivePacket ? resolvedQuestion : undefined,
    suppressedReason,
  };
}

function reviewCardDedupeKey(card: DossierSourceFileReviewableClaim) {
  const packetQuestions = (card.verificationPacketQuestions ?? []).map(normalizeVerificationQuestion).sort().join("|");
  const audience = verificationAudienceKey(card.verificationPacketAudience ?? card.confirmationTarget);
  return [normalizeVerificationQuestion(card.claimText), packetQuestions, audience].join("::");
}

export function deriveDossierSourceFileReviewableClaims(input: {
  analystRead?: DossierSubjectAnalystReadV1;
  candidateId?: string;
  sourceArchiveId?: string;
  reviews?: DossierSourceFileClaimReview[];
  subjectName?: string;
  candidate?: Partial<DossierCandidate>;
}): { current: DossierSourceFileReviewableClaim[]; previous: DossierSourceFileReviewableClaim[]; signals: SourceFileSignalSummary[]; resolvedQuestions: DossierResolvedQuestionReadModel[] } {
  const reviewById = new Map((input.reviews ?? []).map((review) => [review.id, review]));
  const structured = listValues(input.analystRead?.reviewableClaims);
  const sections: Array<{ sourceSection: string; claimType: DossierSourceFileClaimType; values: unknown }> = structured.length
    ? [{ sourceSection: "reviewableClaims", claimType: "review_needed", values: structured }]
    : [
      { sourceSection: "publicReadyClaims", claimType: "public_ready", values: input.analystRead?.publicReadyClaims },
      { sourceSection: stringItems(input.analystRead?.sourceFileReviewClaims).length ? "sourceFileReviewClaims" : "reviewNeededClaims", claimType: "review_needed", values: stringItems(input.analystRead?.sourceFileReviewClaims).length ? input.analystRead?.sourceFileReviewClaims : input.analystRead?.reviewNeededClaims },
      { sourceSection: "sourceBlindInsights", claimType: "source_blind", values: input.analystRead?.sourceBlindInsights },
    ];
  sections.push(
    { sourceSection: "missingConfirmations", claimType: "missing_info", values: input.analystRead?.missingConfirmations ?? input.analystRead?.missingInfoQuestions },
    { sourceSection: "recommendedAdminActions", claimType: "recommended_action", values: input.analystRead?.recommendedAdminActions },
    { sourceSection: "doNotSayPublicly", claimType: "do_not_say", values: input.analystRead?.doNotSayPublicly },
  );
  const readinessQuestions = analystReadinessQuestions(input.analystRead).map((question) => ({
    ...question,
    resolution: resolveBnlDossierQuestionFromExistingTruth({ question: { ...question, question: question.question }, candidate: input.candidate }),
  }));
  const resolvedReadinessQuestions = readinessQuestions.filter((question) => question.resolution.safeToSuppressFromActivePacket);
  const activeReadinessQuestions = readinessQuestions.filter((question) => !question.resolution.safeToSuppressFromActivePacket && memoryFirstQuestionIsDecisionUnlocking(question));
  const allCards = sections.flatMap((section) => listValues(section.values).flatMap((value) => {
    const card = buildClaimCard({ value, sourceSection: section.sourceSection, claimType: section.claimType, candidateId: input.candidateId, sourceArchiveId: input.sourceArchiveId, subjectName: input.subjectName ?? input.analystRead?.subjectName, reviews: reviewById, candidate: input.candidate });
    return card ? [card] : [];
  }));
  const signals = allCards.filter((card) => isSignalSummaryText(card.claimText, asRecord(card))).map((card) => {
    const split = splitSignal(card.claimText);
    return { id: card.id, label: split.label, count: split.count, suggestion: signalSuggestion(split.label), actionable: "Not directly actionable as a public fact." };
  });
  const attachedQuestionIds = new Set<string>();
  const cardsWithReadiness = allCards.map((card) => {
    const relatedReadinessQuestions = activeReadinessQuestions.filter((question) => question.relatedReviewClaimIds.includes(card.id));
    relatedReadinessQuestions.forEach((question) => attachedQuestionIds.add(question.id));
    return relatedReadinessQuestions.length ? { ...card, relatedReadinessQuestions } : card;
  });
  const existingCardQuestionTexts = new Set(cardsWithReadiness.flatMap((card) => [card.decisionQuestion, card.claimText, ...(card.verificationPacketQuestions ?? [])]).filter((text): text is string => Boolean(text)).map(normalizeVerificationQuestion));
  const readinessCards: DossierSourceFileReviewableClaim[] = activeReadinessQuestions.filter((question) => !attachedQuestionIds.has(question.id) && !existingCardQuestionTexts.has(normalizeVerificationQuestion(question.question))).flatMap((question) => {
    const card = buildClaimCard({
    value: {
      claimText: question.question,
      displayTitle: question.clarificationOnly ? "Dossier clarification need" : "Dossier readiness question",
      displayDecision: question.question,
      displayWhyBNLFlaggedIt: question.whyItMatters ?? "BNL needs this answered before the Source File can safely support a public Proposed Dossier.",
      displayBNLRecommendation: question.clarificationOnly ? "Treat this as a clarification need, not a public-fact approval card." : "Save this as a follow-up question if it is still needed.",
      displayEvidenceSummary: question.sourceSafety ?? "No public-safe source summary provided.",
      displaySafeDefault: "Keep blocked until the routed question is answered or a public-safe source exists.",
      confirmationTarget: question.audience,
      verificationPacketAudience: question.audience,
      verificationPacketQuestion: question.question,
      questionKey: question.questionKey,
      questionFamily: question.questionFamily,
      questionCategory: question.questionCategory,
      questionVersion: question.questionVersion,
      scopeKey: question.scopeKey,
      subjectKey: question.subjectKey,
      supersedesQuestionKeys: question.supersedesQuestionKeys,
      narrowsQuestionKeys: question.narrowsQuestionKeys,
      replacedByQuestionKey: question.replacedByQuestionKey,
      actionability: "missing_confirmation",
      reviewLane: question.clarificationOnly ? "clarification_need" : "dossier_readiness",
    },
    sourceSection: question.clarificationOnly ? "dossierClarificationNeeds" : "dossierReadinessQuestions",
    claimType: "missing_info",
    candidateId: input.candidateId,
    sourceArchiveId: input.sourceArchiveId,
    subjectName: input.subjectName ?? input.analystRead?.subjectName,
    reviews: reviewById,
    candidate: input.candidate,
    });
    return card ? [{ ...card, readinessMetadata: readinessMetadataItems(question), resolvedQuestion: question.resolution }] : [];
  });
  const deduped = new Map<string, DossierSourceFileReviewableClaim>();
  for (const card of [...cardsWithReadiness, ...readinessCards]) {
    const normalized = reviewCardDedupeKey(card);
    if (!deduped.has(normalized)) deduped.set(normalized, card);
  }
  const suppressedCards = [...deduped.values()].filter((card) => card.suppressedReason);
  const current = [...deduped.values()].filter((card) => !signals.some((signal) => signal.id === card.id) && !card.suppressedReason);
  const currentIds = new Set(current.map((claim) => claim.id));
  return {
    current,
    signals,
    resolvedQuestions: [
      ...resolvedReadinessQuestions.map((question) => question.resolution),
      ...suppressedCards.map((card) => ({ questionKey: `${card.id}:suppressed`, resolved: true, resolutionState: "resolved_by_rejection_or_boundary" as const, resolutionSummary: card.suppressedReason ?? "Suppressed from active review.", sourceIds: [card.id], stillNeedsHuman: false, safeToSuppressFromActivePacket: true })),
      ...current.flatMap(suppressedSavedPacketResolutionsForClaim),
    ],
    previous: (input.reviews ?? []).filter((review) => !currentIds.has(review.id)).map((review) => ({
      id: review.id,
      claimText: review.claimText,
      claimType: review.claimType,
      sourceSection: review.sourceSection,
      review,
    })),
  };
}


const VERIFICATION_PACKET_AUDIENCE_LABELS = {
  subject: "Questions for the subject",
  admin: "Admin follow-up",
  public_source: "Public source needed",
  owner_approved_wording: "Owner-approved wording",
  link_ownership: "Link ownership",
  owner: "Owner/operator",
  mod: "Mod / informed team member",
  unknown: "Needs routing",
} as const;

type VerificationPacketAudience = keyof typeof VERIFICATION_PACKET_AUDIENCE_LABELS;

type VerificationPacketQuestion = {
  text: string;
  sourceCount: number;
};

type VerificationPacketSections = Record<VerificationPacketAudience, VerificationPacketQuestion[]>;

function verificationAudienceKey(value: unknown): VerificationPacketAudience {
  const raw = textValue(value)?.toLowerCase().replace(/[ -]+/g, "_");
  if (raw && raw in VERIFICATION_PACKET_AUDIENCE_LABELS) return raw as VerificationPacketAudience;
  return "unknown";
}

function safeCopyQuestions(questions: string[]) {
  return questions.filter((question) => !/@|stripe|payment|customer|token|raw evidence|source-blind|private|database row/i.test(question));
}

function normalizeVerificationQuestion(question: string) {
  return question.trim().replace(/\s+/g, " ").replace(/[?.!;:]+$/g, "").toLowerCase();
}

function unresolvedReviewItems(claims: DossierSourceFileReviewableClaim[]) {
  return claims.filter((claim) => !claim.review?.decision || claim.review.decision === "pending");
}

function isSavedFollowUpQuestion(claim: DossierSourceFileReviewableClaim) {
  const decision = claim.review?.decision;
  if (decision === "needs_more_info") return true;
  return claim.claimType === "missing_info" && decision === "confirmed_internal";
}


type SavedPacketTextClassification =
  | "active_question"
  | "resolved_answer"
  | "boundary_instruction"
  | "internal_only_resolution"
  | "unsafe_or_not_public";

export function classifySavedPacketTextForVerificationPacket(text: string): SavedPacketTextClassification {
  const normalized = text.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  if (!normalized) return "unsafe_or_not_public";
  if (/@|stripe|payment|customer|token|raw evidence|source-blind|private|database row/i.test(normalized)) return "unsafe_or_not_public";
  if (/^(do not|don’t|dont)\b/.test(lower) || /\bdo not use this publicly\b/.test(lower) || /\bdo not reference\b/.test(lower) || /\bdo not state\b/.test(lower)) return "boundary_instruction";
  if (/^(keep|keeps)\b.*\binternal\b/.test(lower) || /\binternal (only|context)\b/.test(lower)) return "internal_only_resolution";
  if (/^(no|none)\b.*\b(approved|public|source|links?|role|title)\b.*\b(yet|approved|available)?[.!]?$/.test(lower) || /\bno approved public source yet\b/.test(lower)) return "resolved_answer";
  if (/\b(not approved|not public-ready|not public ready)\b/.test(lower)) return "resolved_answer";
  if (/[?]\s*$/.test(normalized) || /^(what|which|who|when|where|why|how|should|was|were|did|do|does|is|are|can|could|confirm)\b/i.test(normalized)) return "active_question";
  return "resolved_answer";
}

function isActiveVerificationPacketQuestion(text: string) {
  return classifySavedPacketTextForVerificationPacket(text) === "active_question";
}

function safeActivePacketQuestions(questions: string[]) {
  return safeCopyQuestions(questions).filter(isActiveVerificationPacketQuestion);
}

function suppressedPacketResolutionForClaim(claim: DossierSourceFileReviewableClaim, text: string, classification = classifySavedPacketTextForVerificationPacket(text)): DossierResolvedQuestionReadModel | undefined {
  if (classification === "active_question") return undefined;
  const resolutionState = classification === "boundary_instruction" || classification === "unsafe_or_not_public"
    ? "resolved_by_rejection_or_boundary"
    : classification === "internal_only_resolution"
      ? "resolved_by_claim_review"
      : "resolved_by_existing_public_fact";
  return {
    questionKey: `${claim.id}:suppressed:${normalizeVerificationQuestion(text).slice(0, 80)}`,
    resolved: true,
    resolutionState,
    resolutionSummary: `Suppressed saved ${classification.replace(/_/g, " ")} from the active Verification Packet: ${text.trim().replace(/\s+/g, " ")}`,
    sourceIds: claim.review?.id ? [claim.review.id] : [claim.id],
    stillNeedsHuman: false,
    safeToSuppressFromActivePacket: true,
  };
}

function savedPacketTextCandidatesForClaim(claim: DossierSourceFileReviewableClaim) {
  if (claim.resolvedQuestion?.safeToSuppressFromActivePacket || claim.suppressedReason) return [];
  if (!isSavedFollowUpQuestion(claim) && !(claim.claimType === "missing_info" && (!claim.review || claim.review.decision === "pending")) && !(claim.verificationPacketQuestions?.length && (!claim.review || claim.review.decision === "pending"))) return [];
  const editedText = claim.review?.editedText?.trim();
  if (editedText) return [editedText];
  const relatedReadinessQuestions = claim.review?.decision === "needs_more_info" ? (claim.relatedReadinessQuestions?.map((question) => question.question) ?? []) : [];
  if (relatedReadinessQuestions.length) return relatedReadinessQuestions;
  const reviewClaimText = claim.review?.claimText?.trim();
  const shouldSkipClaimTextFallback = claim.isVagueArtifact || claim.isInternalAuditArtifact;
  if (claim.verificationPacketQuestions?.length) return claim.verificationPacketQuestions;
  if (claim.review?.decision === "needs_more_info" && reviewClaimText && !shouldSkipClaimTextFallback) return [reviewClaimText];
  const suggestedAnswerText = claim.suggestedAnswerText?.trim();
  if (suggestedAnswerText) return [suggestedAnswerText];
  if (claim.claimType === "missing_info" && claim.claimText && !shouldSkipClaimTextFallback) return [claim.claimText];
  return [];
}

function savedFollowUpQuestionsForClaim(claim: DossierSourceFileReviewableClaim) {
  return safeActivePacketQuestions(savedPacketTextCandidatesForClaim(claim));
}

function suppressedSavedPacketResolutionsForClaim(claim: DossierSourceFileReviewableClaim) {
  return safeCopyQuestions(savedPacketTextCandidatesForClaim(claim)).flatMap((text) => {
    const resolution = suppressedPacketResolutionForClaim(claim, text);
    return resolution ? [resolution] : [];
  });
}

function dedupeVerificationQuestions(questions: Array<{ text: string; audience: VerificationPacketAudience }>): VerificationPacketSections {
  const sections = Object.fromEntries((Object.keys(VERIFICATION_PACKET_AUDIENCE_LABELS) as VerificationPacketAudience[]).map((audience) => [audience, []])) as unknown as VerificationPacketSections;
  const seen: Record<VerificationPacketAudience, Map<string, VerificationPacketQuestion>> = {
    subject: new Map(),
    admin: new Map(),
    public_source: new Map(),
    owner_approved_wording: new Map(),
    link_ownership: new Map(),
    owner: new Map(),
    mod: new Map(),
    unknown: new Map(),
  };
  for (const question of questions) {
    const normalized = normalizeVerificationQuestion(question.text);
    if (!normalized) continue;
    const existing = seen[question.audience].get(normalized);
    if (existing) {
      existing.sourceCount += 1;
      continue;
    }
    const entry = { text: question.text.trim().replace(/\s+/g, " "), sourceCount: 1 };
    seen[question.audience].set(normalized, entry);
    sections[question.audience].push(entry);
  }
  return sections;
}

function verificationPacketSections(claims: DossierSourceFileReviewableClaim[]) {
  return dedupeVerificationQuestions(claims.flatMap((claim) => savedFollowUpQuestionsForClaim(claim).map((text) => ({
    text,
    audience: verificationAudienceKey(claim.relatedReadinessQuestions?.find((question) => question.question === text)?.audience ?? claim.verificationPacketAudience ?? claim.confirmationTarget),
  }))));
}

function verificationPacketCopyText(sections: VerificationPacketSections) {
  const blocks = (Object.keys(VERIFICATION_PACKET_AUDIENCE_LABELS) as VerificationPacketAudience[]).flatMap((audience) => {
    const questions = sections[audience];
    if (!questions.length) return [];
    return [`${VERIFICATION_PACKET_AUDIENCE_LABELS[audience]}\n\n${questions.map((question) => `* ${question.text}`).join("\n")}`];
  });
  return blocks.join("\n\n");
}

function copyTextToClipboard(text: string) {
  void navigator.clipboard?.writeText(text);
}

function VerificationPacket({ claims }: { claims: DossierSourceFileReviewableClaim[]; subjectName?: string }) {
  const unresolved = unresolvedReviewItems(claims);
  const sections = verificationPacketSections(claims);
  const hasQuestions = Object.values(sections).some((questions) => questions.length > 0);
  const copyText = verificationPacketCopyText(sections);
  return (
    <section className="border border-border/60 bg-background/20 p-3 text-sm">
      <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">Verification Packet</h4>
      <div className="mt-2 space-y-3">
          <p className="text-xs text-muted">Preview active decision-unlocking questions without approving every review card first. Owner Review and true BNL blockers still apply before publishing.</p>
          {unresolved.length > 0 && <p className="text-xs font-bold text-accent">Preview includes packet questions while {unresolved.length} active review {unresolved.length === 1 ? "item remains" : "items remain"} unresolved.</p>}
          {hasQuestions ? (
            <>
              {(Object.keys(VERIFICATION_PACKET_AUDIENCE_LABELS) as VerificationPacketAudience[]).map((audience) => {
                const questions = sections[audience];
                if (!questions.length) return null;
                return (
                  <div key={audience} className="border border-border/40 bg-background/30 p-2">
                    <p className="text-xs font-bold text-accent">{VERIFICATION_PACKET_AUDIENCE_LABELS[audience]}</p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-foreground">{questions.map((question) => <li key={question.text}>{question.text}{question.sourceCount > 1 ? <span className="ml-2 text-[11px] text-muted">Used by {question.sourceCount} review items</span> : null}</li>)}</ol>
                  </div>
                );
              })}
              <button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => copyTextToClipboard(copyText)}>Copy verification packet</button>
            </>
          ) : (
            <p className="border border-border/40 bg-background/30 p-2 text-xs text-muted">No saved follow-up questions were kept from the resolved review decisions.</p>
          )}
        </div>
    </section>
  );
}

function claimDecisionLabel(claim: DossierSourceFileReviewableClaim) {
  const decision = claim.review?.decision ?? "pending";
  if (decision === "confirmed_public" || decision === "edited") return "Approved as public fact";
  if (decision === "confirmed_internal") return claim.claimType === "do_not_say" ? "Boundary kept" : "Kept internal";
  if (decision === "needs_more_info") return "Needs more info";
  if (decision === "rejected") return claim.claimType === "do_not_say" ? "Boundary removed" : "Rejected as false / not useful";
  return "Pending";
}

function savedReviewText(claim: DossierSourceFileReviewableClaim) {
  return claim.review?.editedText || claim.review?.claimText || claim.claimText;
}

function followUpActionLabel(claim: DossierSourceFileReviewableClaim) {
  const explicit = claim.secondaryActionLabels?.find((label) => /confirm|question|info|source|owner|link|follow/i.test(label));
  if (explicit) return explicit;
  const target = claim.confirmationTarget?.toLowerCase();
  if (target === "subject") return "Add to subject verification packet";
  if (target === "admin") return "Add to admin follow-up";
  if (target === "public_source") return "Request public source";
  if (target === "owner_approved_wording") return "Ask for owner-approved wording";
  if (target === "link_ownership") return "Ask who owns these links";
  return "Add question to follow-up";
}

function CompletedClaimCard({ claim, onReview }: { claim: DossierSourceFileReviewableClaim; onReview?: (claim: DossierSourceFileReviewableClaim, decision: DossierSourceFileClaimReviewDecision, options?: { publicSafe?: boolean; editedText?: string; decisionNote?: string }) => void }) {
  const decision = claim.review?.decision ?? "pending";
  const text = savedReviewText(claim);
  return (
    <li data-claim-card="true" className="border border-border bg-background/30 p-3 shadow-[inset_0_3px_0_rgba(255,255,255,0.08)]">
      <div className="-mx-3 -mt-3 mb-2 border-b border-border/60 bg-background/40 px-3 py-2">
        <h5 className="text-sm font-bold text-foreground">{claim.title}</h5>
        <span className="mt-1 inline-block border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-accent">{claimDecisionLabel(claim)}</span>
      </div>
      {(decision === "confirmed_public" || decision === "edited") && <p className="mt-2 text-sm text-foreground">Saved wording: &quot;{text}&quot;</p>}
      {decision === "confirmed_internal" && <p className="mt-2 text-sm text-foreground">Saved note: &quot;{text}&quot;</p>}
      {decision === "needs_more_info" && <p className="mt-2 text-sm text-foreground">Open question: &quot;{text}&quot;</p>}
      {decision === "rejected" && <p className="mt-2 text-sm text-foreground">No Source File fact was created.</p>}
      {(decision === "confirmed_public" || decision === "edited") && <p className="mt-1 text-xs text-muted">No dossier was published.</p>}
      <button type="button" className="mt-3 border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "pending", { publicSafe: false })}>Undo choice</button>
    </li>
  );
}

function ClaimReviewControls({ claim, onReview }: {
  claim: DossierSourceFileReviewableClaim;
  onReview?: (claim: DossierSourceFileReviewableClaim, decision: DossierSourceFileClaimReviewDecision, options?: { publicSafe?: boolean; editedText?: string; decisionNote?: string }) => void;
}) {
  const publicSuggestion = claim.suggestedApprovedText?.trim();
  const internalSuggestion = claim.suggestedInternalText?.trim() || claim.claimText;
  const answerSuggestion = claim.suggestedAnswerText?.trim();
  const rejectionSuggestion = claim.suggestedRejectionReason?.trim();
  const canApproveSuggestion = Boolean(claim.hasSafePublicSuggestion && claim.suggestedTextSource === "bnl" && publicSuggestion && (claim.claimType === "public_ready" || claim.claimType === "review_needed"));
  const rejectLabel = claim.isVagueArtifact ? "Dismiss artifact" : claim.isWeakEvidenceLabel ? "Reject label" : "Reject claim";
  const internalLabel = claim.suggestedInternalTextSource === "bnl" ? "BNL suggested internal note" : "Fallback guidance";

  if (claim.isInternalAuditArtifact) {
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText: internalSuggestion })}>Keep as internal note</button><p className="mt-1 text-[11px] text-muted">Stores this for Source File memory only. It will not become public dossier copy.</p></div>
        <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false, decisionNote: rejectionSuggestion })}>Dismiss artifact</button><p className="mt-1 text-[11px] text-muted">Removes this from the review queue without creating a public fact.</p></div>
      </div>
    );
  }
  if (claim.claimType === "do_not_say") {
    return <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_internal", { publicSafe: false })}>Keep boundary</button><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false })}>Remove boundary</button></div>;
  }
  if (claim.claimType === "recommended_action") {
    return <div className="mt-3 grid gap-2 sm:grid-cols-3"><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_internal", { publicSafe: false })}>Mark done</button><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "needs_more_info", { publicSafe: false })}>Keep open</button><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false })}>Reject claim</button></div>;
  }
  if (claim.claimType === "missing_info") {
    const answerLabel = claim.suggestedAnswerTextSource === "bnl" ? "BNL suggested confirmation question" : "Suggested fallback question";
    return (
      <div className="mt-3 space-y-3">
        <div className="border border-border/40 bg-background/40 p-2"><p className="text-xs font-bold uppercase tracking-widest text-accent">{answerLabel}</p><p className="text-foreground">{answerSuggestion ?? "No BNL confirmation question yet."}</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          {answerSuggestion && <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText: answerSuggestion })}>{claim.suggestedAnswerTextSource === "bnl" ? "Use BNL suggested question" : "Use BNL best-guess question"}</button><p className="mt-1 text-[11px] text-muted">Adds this question to the review notes so it can be answered before BNL uses the claim.</p></div>}
          <details className="border border-border/40 p-2"><summary className="cursor-pointer text-xs text-foreground">Edit question</summary><form className="mt-2 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const editedText = String(new FormData(event.currentTarget).get("editedText") ?? "").trim(); if (editedText) onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText }); }}><textarea name="editedText" defaultValue={answerSuggestion ?? ""} className="min-h-20 border border-border bg-background p-2 text-xs text-foreground" /><button type="submit" className="w-fit border border-accent px-2 py-1 text-xs text-accent">Save edited question</button></form></details>
          <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "needs_more_info", { publicSafe: false })}>{followUpActionLabel(claim)}</button><p className="mt-1 text-[11px] text-muted">Adds this question to the review notes so it can be answered before BNL uses the claim.</p></div>
          <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false, decisionNote: rejectionSuggestion })}>Reject / not needed</button><p className="mt-1 text-[11px] text-muted">Rejects this question without requiring public wording.</p></div>
        </div>
      </div>
    );
  }
  if (claim.claimType === "source_blind" || claim.isVagueArtifact) {
    return (
      <div className="mt-3 space-y-3">
        <div className="border border-border/40 bg-background/40 p-2"><p className="text-xs font-bold uppercase tracking-widest text-accent">{internalLabel}</p><p className="text-foreground">{internalSuggestion}</p></div>
        <p className="text-xs text-muted">This is not a public-ready claim. BNL has not provided a concrete fact to approve.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText: internalSuggestion })}>{claim.suggestedInternalTextSource === "bnl" ? "Save suggested internal note" : "Keep as internal audit context"}</button><p className="mt-1 text-[11px] text-muted">Stores this for Source File memory only. It will not become public dossier copy.</p></div>
          <details className="border border-border/40 p-2"><summary className="cursor-pointer text-xs text-foreground">Edit internal note</summary><form className="mt-2 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const editedText = String(new FormData(event.currentTarget).get("editedText") ?? "").trim(); if (editedText) onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText }); }}><textarea name="editedText" defaultValue={internalSuggestion} className="min-h-20 border border-border bg-background p-2 text-xs text-foreground" /><button type="submit" className="w-fit border border-accent px-2 py-1 text-xs text-accent">Save internal note</button></form></details>
          <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "needs_more_info", { publicSafe: false })}>{followUpActionLabel(claim)}</button><p className="mt-1 text-[11px] text-muted">Keeps this blocked until a public-safe source or owner-approved wording exists.</p></div>
          <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false, decisionNote: rejectionSuggestion })}>{rejectLabel}</button><p className="mt-1 text-[11px] text-muted">Marks this technical/vague evidence artifact as not useful for Source File review.</p></div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="border border-border/40 bg-background/40 p-2"><p className="text-xs font-bold uppercase tracking-widest text-accent">{claim.suggestedTextSource === "bnl" ? "BNL suggested public wording" : publicSuggestion ? "Example wording" : "No BNL suggested wording yet"}</p>{publicSuggestion ? <p className="text-foreground">{publicSuggestion}</p> : <p className="text-muted">BNL has not provided safe public wording for this yet. Choose Keep as internal audit context, add a follow-up question, reject the claim, or write public wording manually.</p>}</div>
      <div className="border border-border/40 bg-background/40 p-2"><p className="text-xs font-bold uppercase tracking-widest text-accent">{internalLabel}</p><p className="text-foreground">{internalSuggestion}</p></div>
      {rejectionSuggestion && <div className="border border-border/40 bg-background/40 p-2"><p className="text-xs font-bold uppercase tracking-widest text-accent">BNL suggested rejection reason</p><p className="text-foreground">{rejectionSuggestion}</p></div>}
      <div className="grid gap-2 sm:grid-cols-2">
        {canApproveSuggestion && <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_public", { publicSafe: true, editedText: publicSuggestion })}>{claim.primaryActionLabel ?? "Approve suggested wording"}</button><p className="mt-1 text-[11px] text-muted">Saves BNL’s suggested sentence as a public-safe Source File fact. This does not publish a dossier.</p></div>}
        {!canApproveSuggestion && <p className="border border-border/40 p-2 text-xs text-muted">BNL has not provided safe public wording for this yet.</p>}
        <details className="border border-border/40 p-2"><summary className="cursor-pointer text-xs text-foreground">{claim.suggestedTextSource === "bnl" ? "Edit wording" : "Write public wording manually"}</summary><p className="mt-1 text-[11px] text-muted">{claim.suggestedTextSource === "bnl" ? "Edit the suggested sentence before saving it as a public-safe Source File fact." : "Creates an admin-written public-safe Source File fact; this is not BNL’s recommendation."}</p><form className="mt-2 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const editedText = String(new FormData(event.currentTarget).get("editedText") ?? "").trim(); if (editedText) onReview?.(claim, "edited", { publicSafe: true, editedText }); }}><textarea name="editedText" defaultValue={claim.suggestedTextSource === "bnl" ? publicSuggestion : ""} className="min-h-20 border border-border bg-background p-2 text-xs text-foreground" /><button type="submit" className="w-fit border border-accent px-2 py-1 text-xs text-accent">Save public wording</button></form></details>
        <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText: internalSuggestion })}>{claim.suggestedInternalTextSource === "bnl" ? "Save suggested internal note" : "Keep as internal audit context"}</button><p className="mt-1 text-[11px] text-muted">Stores this for Source File memory only. It will not become public dossier copy.</p></div>
        <details className="border border-border/40 p-2"><summary className="cursor-pointer text-xs text-foreground">Edit internal note</summary><form className="mt-2 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const editedText = String(new FormData(event.currentTarget).get("editedText") ?? "").trim(); if (editedText) onReview?.(claim, "confirmed_internal", { publicSafe: false, editedText }); }}><textarea name="editedText" defaultValue={internalSuggestion} className="min-h-20 border border-border bg-background p-2 text-xs text-foreground" /><button type="submit" className="w-fit border border-accent px-2 py-1 text-xs text-accent">Save internal note</button></form></details>
        <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "needs_more_info", { publicSafe: false })}>{followUpActionLabel(claim)}</button><p className="mt-1 text-[11px] text-muted">Adds this question to the review notes so it can be answered before BNL uses the claim.</p></div>
        {rejectionSuggestion ? <details className="border border-border/40 p-2"><summary className="cursor-pointer text-xs text-foreground">Edit rejection reason</summary><form className="mt-2 flex flex-col gap-2" onSubmit={(event) => { event.preventDefault(); const decisionNote = String(new FormData(event.currentTarget).get("decisionNote") ?? "").trim(); onReview?.(claim, "rejected", { publicSafe: false, decisionNote }); }}><textarea name="decisionNote" defaultValue={rejectionSuggestion} className="min-h-20 border border-border bg-background p-2 text-xs text-foreground" /><button type="submit" className="w-fit border border-accent px-2 py-1 text-xs text-accent">Reject with edited reason</button></form></details> : <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false })}>{claim.secondaryActionLabels?.find((label) => /reject|dismiss/i.test(label)) ?? rejectLabel}</button><p className="mt-1 text-[11px] text-muted">Rejects this without requiring public wording.</p></div>}
        {rejectionSuggestion && <div><button type="button" className="border border-border px-2 py-1 text-xs text-foreground hover:border-accent" onClick={() => onReview?.(claim, "rejected", { publicSafe: false, decisionNote: rejectionSuggestion })}>Reject with suggested reason</button><p className="mt-1 text-[11px] text-muted">Rejects this without requiring public wording.</p></div>}
      </div>
    </div>
  );
}

function ClaimDecisionCard({ claim, onReview }: { claim: DossierSourceFileReviewableClaim; onReview?: (claim: DossierSourceFileReviewableClaim, decision: DossierSourceFileClaimReviewDecision, options?: { publicSafe?: boolean; editedText?: string; decisionNote?: string }) => void }) {
  if (claim.review && claim.review.decision !== "pending") return <CompletedClaimCard claim={claim} onReview={onReview} />;
  return (
    <li data-claim-card="true" className="border border-border bg-background/30 p-3 shadow-[inset_0_3px_0_rgba(255,255,255,0.08)]">
      <div className="-mx-3 -mt-3 mb-2 border-b border-border/60 bg-background/40 px-3 py-2">
        <h5 className="text-sm font-bold text-foreground">{claim.title}</h5>
        <span className="mt-1 inline-block border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-accent">Pending review</span>
      </div>
      {claim.isInternalAuditArtifact ? (
        <>
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-accent">Internal audit item</p>
          <p className="mt-2 text-sm text-foreground">BNL found a weak internal signal, but it is not specific enough to become a Source File fact.</p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="font-bold text-accent">Decision</dt><dd className="text-foreground">Keep this as internal audit context or dismiss it.</dd></div>
            <div><dt className="font-bold text-accent">What BNL thinks</dt><dd className="text-foreground">{claim.bnlRecommendationText ?? "BNL recommends keeping this internal only if it helps explain why the item was flagged."}</dd></div>
          </dl>
        </>
      ) : (
        <>
          <p className="mt-1 text-foreground">{claim.claimText}</p>
          {confirmationTargetLabel(claim.confirmationTarget) && <p className="mt-2 text-xs text-muted">Confirmation target: {confirmationTargetLabel(claim.confirmationTarget)}</p>}
          {claim.relatedReadinessQuestions && claim.relatedReadinessQuestions.length > 0 && <div className="mt-2 border border-border/40 bg-background/40 p-2 text-xs"><p className="font-bold text-foreground">Related BNL readiness questions</p><ul className="mt-1 list-disc pl-5 text-foreground">{claim.relatedReadinessQuestions.map((question) => <li key={question.id}>{question.audienceLabel}: {question.question}{question.whyItMatters ? ` — ${question.whyItMatters}` : ""}<ReadinessMetadataLine items={readinessMetadataItems(question)} /></li>)}</ul></div>}
          {claim.readinessMetadata && <ReadinessMetadataLine items={claim.readinessMetadata} />}
          {claim.whatAmIDeciding && <p className="mt-2 border border-border/50 bg-background/40 p-2 text-xs text-foreground"><strong>What am I deciding?</strong> {claim.whatAmIDeciding}</p>}
          {claim.claimType === "source_blind" && <p className="mt-2 border border-accent/60 bg-accent/10 p-2 text-xs text-foreground">Source-blind context cannot become public copy by itself. Only enter public-safe replacement wording if you have separate confirmation.</p>}
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div><dt className="font-bold text-accent">{claim.claimType === "missing_info" ? "Question" : "Decision needed"}</dt><dd className="text-foreground">{claim.decisionQuestion}</dd></div>
        <div><dt className="font-bold text-accent">What BNL thinks</dt><dd className="text-foreground">{claim.bnlRecommendationText ?? "BNL recommends admin review before use."}</dd></div>
        <div><dt className="font-bold text-accent">{claim.claimType === "missing_info" ? "Why BNL needs it" : "Why BNL flagged this"}</dt><dd className="text-foreground">{claim.whyItExists}</dd></div>
        <div><dt className="font-bold text-accent">Evidence summary</dt><dd className="text-foreground">{claim.safeEvidenceSummary ?? "No public-safe evidence summary provided."}</dd></div>
        <div><dt className="font-bold text-accent">Safety lane</dt><dd className="text-foreground">{claim.reviewLane ?? claim.claimType.replace(/_/g, " ")}{claim.confidence ? ` · ${claim.confidence} confidence` : ""}</dd></div>
        <div><dt className="font-bold text-accent">Safest default</dt><dd className="text-foreground">{claim.safestDefault}</dd></div>
        {(claim.displayApprovalInstruction || claim.whatToEnter) && <div><dt className="font-bold text-accent">What to enter if approving</dt><dd className="text-foreground">{claim.displayApprovalInstruction ?? claim.whatToEnter}</dd></div>}
        {claim.whatYouAreApproving && <div><dt className="font-bold text-accent">What you are approving</dt><dd className="text-foreground">{claim.whatYouAreApproving}</dd></div>}
          </dl>
        </>
      )}
      {!claim.isInternalAuditArtifact && claim.recommendedAdminActionCards && claim.recommendedAdminActionCards.length > 0 && <div className="mt-2 border border-border/40 p-2 text-xs"><p className="font-bold text-foreground">Recommended action cards</p>{claim.recommendedAdminActionCards.map((card, index) => <p key={index} className="text-muted">{displayValue(card.title ?? card.label ?? card.action) ?? "Recommended admin action"}{displayValue(card.body ?? card.reason) ? ` — ${displayValue(card.body ?? card.reason)}` : ""}</p>)}</div>}
      {claim.blockedBy && claim.blockedBy.length > 0 && <p className="mt-2 text-xs text-muted">Blocked by: {claim.blockedBy.join(", ")}</p>}
      {!claim.isInternalAuditArtifact && claim.exampleApprovedTexts && claim.exampleApprovedTexts.length > 0 && <div className="mt-2 text-xs"><p className="font-bold text-foreground">Example approved text</p><ul className="list-disc pl-5 text-muted">{claim.exampleApprovedTexts.map((example) => <li key={example}>{example}</li>)}</ul></div>}
      <ClaimReviewControls claim={claim} onReview={onReview} />
    </li>
  );
}

function WithheldEvidenceAudit({ audit }: { audit: unknown }) {
  const record = asRecord(audit);
  if (!record) return null;
  const categories = listRecords(record.categories ?? record.categoryCounts ?? record.counts);
  const examples = stringItems(record.safeExamples ?? record.redactedExamples ?? record.examples).filter((example) => !/@|stripe|payment|customer|priority|token|raw id|database row/i.test(example));
  return <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground">Withheld Evidence Audit</h4><p className="mb-2 text-xs text-muted/80">This explains what BNL excluded. These are not items you need to review one by one.</p><p className="text-foreground">Total withheld: {scalarLabel(record.totalWithheld ?? record.total ?? record.count)}</p>{categories.length > 0 && <ul className="mt-2 space-y-2 text-foreground">{categories.map((category, index) => <li key={index} className="border border-border/40 p-2">{scalarLabel(category.category ?? category.label ?? category.type)}: {scalarLabel(category.count)}{displayValue(category.reason) ? ` — ${displayValue(category.reason)}` : ""}</li>)}</ul>}{examples.length > 0 && <div className="mt-2"><p className="text-xs font-bold text-foreground">Safe redacted examples</p><ul className="list-disc pl-5 text-foreground">{examples.map((example) => <li key={example}>{example}</li>)}</ul></div>}</section>;
}

function BnlAnalystReadPanel({
  analystRead,
  refreshedAt,
  candidateId,
  sourceArchiveId,
  subjectName,
  claimReviews,
  onReviewClaim,
  candidate,
}: {
  analystRead?: DossierSubjectAnalystReadV1;
  refreshedAt?: string;
  candidateId?: string;
  sourceArchiveId?: string;
  subjectName?: string;
  claimReviews?: DossierSourceFileClaimReview[];
  onReviewClaim?: (claim: DossierSourceFileReviewableClaim, decision: DossierSourceFileClaimReviewDecision, options?: { publicSafe?: boolean; editedText?: string; decisionNote?: string }) => void;
  candidate?: Partial<DossierCandidate>;
}) {
  if (!analystRead) {
    return (
      <Section title="BNL Analyst Read" tone="review" helper="Internal Source File intelligence. Not public dossier copy.">
        <p className="text-foreground">No BNL analyst read stored yet. Refresh this Source File after bot PR #284 is deployed.</p>
      </Section>
    );
  }
  const reviewable = deriveDossierSourceFileReviewableClaims({ analystRead, candidateId, sourceArchiveId, subjectName: subjectName ?? analystRead.subjectName, reviews: claimReviews, candidate });
  const draftReadiness = createDossierSourceFileDraftReadinessReadModel({
    sourceFileExists: true,
    candidate: { ...(candidate ?? {}), sourceFileClaimReviews: claimReviews ?? candidate?.sourceFileClaimReviews },
    analystRead,
  });
  const sectionEntries = [
    ["reviewableClaims", "Source File Claim Decisions"],
    ["publicReadyClaims", "Public-Ready Claims"],
    [stringItems(analystRead.sourceFileReviewClaims).length ? "sourceFileReviewClaims" : "reviewNeededClaims", "Review-Needed Claims"],
    ["sourceBlindInsights", "Source-blind / Withheld Context"],
    ["missingConfirmations", "Missing Confirmations"],
    ["recommendedAdminActions", "Recommended Admin Actions"],
    ["dossierReadinessQuestions", "Dossier Readiness Questions"],
    ["dossierClarificationNeeds", "Dossier Clarification Needs"],
    ["doNotSayPublicly", "Do Not Say Publicly"],
  ] as const;
  return (
    <Section title="Support / Diagnostics" tone="review" helper="Internal Source File intelligence. Not public dossier copy. Secondary admin support: review cards, Verification Packet, withheld evidence, provenance, and analyst diagnostics.">
      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">BNL Analyst Read</h4>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotItem label="Subject type" value={scalarLabel(analystRead.likelySubjectType)} />
          <SnapshotItem label="Confidence" value={scalarLabel(analystRead.confidence)} />
          <SnapshotItem label="Public draft posture" value={scalarLabel(analystRead.publicDraftPosture)} />
          <SnapshotItem label="Dossier worthiness" value={scalarLabel(analystRead.dossierWorthiness)} />
          <SnapshotItem label="Last refreshed" value={formatSnapshotDate(refreshedAt)} />
        </dl>
        <section className="border border-accent/60 bg-background/30 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Current / Internal Read</h4><BriefParagraphs value={(analystRead as UnknownRecord).currentRead ?? analystRead.dossierReadinessSummary ?? analystRead.internalRead} /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Dossier readiness</h4><p className="text-foreground">{draftReadiness.readinessState.replace(/_/g, " ")} — {safeHumanText(draftReadiness.primaryReason)}</p><p className="mt-1 text-xs text-muted">Authority: {draftReadiness.authority.replace(/_/g, " ")} · resolved {draftReadiness.resolvedQuestionCount} · unresolved {draftReadiness.unresolvedQuestionCount}</p>{draftReadiness.blockers.length > 0 && <div className="mt-2"><p className="text-xs font-bold text-accent">Current BNL blockers</p><ul className="list-disc pl-5 text-foreground">{draftReadiness.blockers.map((item) => <li key={item}>{safeHumanText(item)}</li>)}</ul></div>}</section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Strongest Signals</h4><AnalystList value={analystRead.strongestSignals} empty="No strongest signals reported." /></section>
        {reviewable.signals.length > 0 && <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground">Evidence Signals / Pattern Summary</h4><p className="mb-2 text-xs text-muted/80">These are pattern counts and context signals BNL used for analysis. They are not public-ready facts by themselves.</p><ul className="space-y-2 text-foreground">{reviewable.signals.map((signal) => <li key={signal.id} className="border border-border/40 p-2"><p className="font-bold">{signal.label}{signal.count ? `: ${signal.count}` : ""}</p><p className="text-xs text-muted">{signal.suggestion}</p><p className="text-xs text-muted">Action: {signal.actionable}</p></li>)}</ul></section>}
        {reviewable.resolvedQuestions.length > 0 && <details className="border border-border/50 bg-background/20 p-3 text-xs text-muted"><summary className="cursor-pointer font-semibold text-foreground">Automatically resolved BNL questions ({reviewable.resolvedQuestions.length})</summary><ul className="mt-2 space-y-1">{reviewable.resolvedQuestions.map((question) => <li key={question.questionKey}><span className="font-semibold text-foreground">{question.resolutionState}</span>: {question.resolutionSummary}</li>)}</ul></details>}
        {sectionEntries.map(([section, label]) => {
          const claims = reviewable.current.filter((claim) => claim.sourceSection === section);
          if (!claims.length && (section === "reviewableClaims" || section === "dossierReadinessQuestions" || section === "dossierClarificationNeeds")) return null;
          const privateExclusions = section === "sourceBlindInsights" ? stringItems(analystRead.privateOrInternalExclusions) : [];
          return <section key={section} className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">{label}</h4>{claims.length ? <ul className="space-y-3 text-foreground">{claims.map((claim) => <ClaimDecisionCard key={claim.id} claim={claim} onReview={onReviewClaim} />)}</ul> : <p className="text-muted">No reviewable claims in this section.</p>}{privateExclusions.length > 0 && <ul className="mt-3 list-disc space-y-2 pl-5 text-foreground">{privateExclusions.map((item, index) => <li key={`private-exclusion-${index}`}>Private/internal withheld: {item}</li>)}</ul>}</section>;
        })}
        <VerificationPacket claims={reviewable.current} subjectName={analystRead?.subjectName} />
        <WithheldEvidenceAudit audit={analystRead.withheldEvidenceAudit} />
        {reviewable.previous.length > 0 && <details className="border border-border/50 bg-background/20 p-3"><summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-foreground">Previously reviewed claims</summary><ul className="mt-3 space-y-3 text-foreground">{reviewable.previous.map((claim) => <li key={claim.id} className="border border-border/40 p-2"><p>{claim.claimText}</p><ClaimReviewControls claim={claim} onReview={onReviewClaim} /></li>)}</ul></details>}
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Provenance Summary</h4><AnalystList value={analystRead.provenanceSummary} empty="No provenance summary reported." /></section>
      </div>
    </Section>
  );
}

function CaseReportView({ report }: { report?: DossierSourceFileCaseReportV1 }) {
  if (asRecord(report?.subjectIntelligenceBriefV1)) {
    return <SubjectIntelligenceBriefView report={report as DossierSourceFileCaseReportV1} />;
  }

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
    { title: "Public-ready Claims", value: report.publicSafeClaims },
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
  const report = normalizeCaseReport(latestSourceFileArchive);
  const rawGroups = [
    ["compactSummary", stringItems(latestSourceFileArchive.compactSummary)],
    ["sourceFileBriefV2", [textValue(asRecord(latestSourceFileArchive.sourceFileBriefV2)?.oneLineSummary), textValue(asRecord(latestSourceFileArchive.sourceFileBriefV2)?.adminSummary), textValue(asRecord(latestSourceFileArchive.sourceFileBriefV2)?.recommendedNextAction)].filter(Boolean) as string[]],
    ["evidenceReceiptSummary", stringItems(latestSourceFileArchive.evidenceReceiptSummary)],
    ["missingInfo raw values", stringItems(latestSourceFileArchive.missingInfo)],
    ["publicSafetyNotes raw values", stringItems(latestSourceFileArchive.publicSafetyNotes)],
    ["doNotSay raw values", stringItems(latestSourceFileArchive.doNotSay)],
  ].filter(([, items]) => (items as string[]).length > 0) as Array<[string, string[]]>;
  const oldReportSections: ReportSection[] = report ? [
    { title: "Case Summary", value: report.caseSummary },
    { title: "Dossier Use", value: report.dossierUse },
    { title: "Public-ready Claims", value: report.publicSafeClaims },
    { title: "Evidence Summary", value: report.evidenceSummary },
    { title: "Community Context", value: report.communityContext },
    { title: "Creative / Music Context", value: report.creativeMusicContext, optional: true },
    { title: "Relationship Context", value: report.relationshipContext, optional: true },
    { title: "Queue / Submission Context", value: report.queueSubmissionContext, optional: true },
    { title: "Identity Context", value: report.identityContext, optional: true },
    { title: "Review Blockers", value: report.reviewBlockers },
    { title: "Internal-Only / Do Not Say", value: report.internalOnlyNotes },
    { title: "Recommended Next Steps", value: report.recommendedNextSteps },
    { title: "Confidence / Memory Coverage", value: [...stringItems(report.confidenceNotes), ...stringItems(report.memoryCoverage)] },
  ] : [];

  return (
    <details className="border border-border/70 bg-background/20 p-3 text-sm text-muted">
      <summary className="cursor-pointer font-semibold text-foreground">
        Raw Report / Debug (Archive / Raw Source File Data)
      </summary>
      <p className="mt-3 text-xs uppercase tracking-widest text-accent">
        Admin-only collapsed debug. Raw BNL archive material and legacy sectioned report data are preserved for audit; they are not dossier copy.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SnapshotItem label="Archive id" value={latestSourceFileArchive.id} />
        <SnapshotItem label="Digest" value={latestSourceFileArchive.sourceDigest.slice(0, 16)} />
        <SnapshotItem label="Size" value={`${latestSourceFileArchive.archiveSize} bytes`} />
        <SnapshotItem label="Chunks" value={String(latestSourceFileArchive.chunkCount)} />
        <SnapshotItem label="Updated" value={formatSnapshotDate(latestSourceFileArchive.updatedAt)} />
        <SnapshotItem label="Admin-review" value={latestSourceFileArchive.reviewOnly ? "Yes" : "No"} />
      </dl>
      {oldReportSections.length > 0 && (
        <section className="mt-3 border border-border/50 bg-background/30 p-2">
          <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">Legacy sectioned Case File Report</h4>
          <div className="mt-2 space-y-3">
            {oldReportSections.map((section) => <ReportSectionView key={section.title} title={section.title} value={section.value} />)}
          </div>
        </section>
      )}
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
      <section className="mt-3 border border-border/50 bg-background/30 p-2">
        <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">Raw archive JSON</h4>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-muted">
          {JSON.stringify(latestSourceFileArchive, null, 2)}
        </pre>
      </section>
    </details>
  );
}


function BlueprintList({ items, empty = "—", humanize = false }: { items?: string[]; empty?: string; humanize?: boolean }) {
  const safeItems = dedupeStrings((items ?? []).filter(Boolean).map((item) => humanize ? humanizeClassificationTag(item) : item));
  if (!safeItems.length) return <p className="text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-foreground">
      {safeItems.slice(0, 6).map((item, index) => (
        <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
      ))}
    </ul>
  );
}

function DossierBlueprintView({ blueprint }: { blueprint: DossierDraftBlueprint }) {
  const stylePacket = buildDossierStylePacket();
  const missingCoverage = stylePacket.categorySpecificExamples
    .filter((item) => item.coverage === "missing")
    .map((item) => item.category);
  return (
    <Section
      title="Dossier Blueprint"
      tone="caution"
      helper="Classification and readiness foundation only. This is not public dossier prose and does not confirm identities or merge aliases."
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotItem label="Category" value={blueprint.classification.category} />
          <SnapshotItem label="Kind" value={blueprint.classification.kind} />
          <SnapshotItem label="Ecosystem lane" value={blueprint.classification.ecosystemLane} />
          <SnapshotItem label="Identity authority" value={blueprint.classification.identityAuthority} />
          <SnapshotItem label="Confidence" value={blueprint.classification.confidence} />
          <SnapshotItem label="Future prefix" value={`${blueprint.classification.recommendedDesignationPrefix}-###`} />
          <SnapshotItem label="Readiness" value={`${blueprint.readiness.label} (${blueprint.readiness.score}/100)`} />
          <SnapshotItem label="Evidence counts" value={`${blueprint.evidenceCounts.publicSafeFacts} Public-ready / ${blueprint.evidenceCounts.reviewOnlyItems} Admin-review`} />
        </dl>
        <details className="border border-border/50 bg-background/30 p-3 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-foreground">Classification diagnostics</summary>
          <p className="mt-2 uppercase tracking-widest text-muted">Authority: {blueprint.classificationProfile.authority === "bnl_source_file_classification" ? "BNL sourceFileClassificationV1" : "Site fallback classification"}</p>
          <p className="mt-2 text-muted">Raw buckets are routing diagnostics only. If the same tag appears in multiple buckets, treat it as a routing conflict, not a dossier fact.</p>
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <SnapshotItem label="Subject type" value={blueprint.classificationProfile.subjectType ?? "—"} />
            <SnapshotItem label="Public dossier type" value={blueprint.classificationProfile.publicDossierType ?? "—"} />
            <SnapshotItem label="Source safety" value={blueprint.classificationProfile.sourceSafety ?? "—"} />
          </dl>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div><p className="text-xs font-bold uppercase tracking-widest text-foreground">Public-safe labels</p><BlueprintList humanize items={blueprint.classificationProfile.publicSafeTags} empty="No public labels approved yet. Public-safe claims may still be available above." /></div>
            <div><p className="text-xs font-bold uppercase tracking-widest text-foreground">Needs-review diagnostics</p><BlueprintList humanize items={blueprint.classificationProfile.needsReviewTags} empty="No needs-review diagnostics." /></div>
            <div><p className="text-xs font-bold uppercase tracking-widest text-foreground">Internal-only diagnostics</p><BlueprintList humanize items={blueprint.classificationProfile.internalOnlyTags} empty="No internal-only diagnostics." /></div>
            <div><p className="text-xs font-bold uppercase tracking-widest text-foreground">Rejected / blocked diagnostics</p><BlueprintList humanize items={[...blueprint.classificationProfile.rejectedTags, ...blueprint.classificationProfile.blockedPublicTags]} empty="No rejected or blocked diagnostics." /></div>
          </div>
        </details>
        <section className="border border-border/50 bg-background/30 p-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Recommended next action</h4>
          <p className="text-foreground">{blueprint.readiness.recommendedNextAction}</p>
        </section>
        <section className="border border-border/50 bg-background/30 p-3">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Style Packet / Draft Contract</h4>
          <p className="text-foreground">Available for future BNL authoring. Draft Blueprint exists and can pair with the site-owned style packet and structured draft contract.</p>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted">Required fields: {DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS.length} · Public examples: {stylePacket.representativePublicDossierExamples.length} · Missing category examples: {missingCoverage.length ? missingCoverage.join(", ") : "none"}</p>
          <details className="mt-3 border border-border/50 bg-background/20 p-2 text-xs text-muted">
            <summary className="cursor-pointer font-semibold text-foreground">Collapsed style reference</summary>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <p className="font-semibold text-foreground">Owner Review rules</p>
                <BlueprintList items={stylePacket.ownerReviewRules} />
              </div>
              <div>
                <p className="font-semibold text-foreground">Source boundary rules</p>
                <BlueprintList items={stylePacket.sourceBoundaryRules} />
              </div>
            </div>
          </details>
        </section>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="border border-border/50 bg-background/30 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Why this classification</h4>
            <BlueprintList items={blueprint.classification.reasons} />
          </section>
          <section className="border border-border/50 bg-background/30 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Blockers / missing info</h4>
            <BlueprintList items={[...blueprint.readiness.blockers, ...blueprint.missingInfoQuestions]} empty="No blockers recorded." />
          </section>
          <section className="border border-border/50 bg-background/30 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Suggested tags</h4>
            <BlueprintList items={blueprint.suggestedTags.tags.map((item) => `${item.tag} (${item.confidence})`)} />
          </section>
          <section className="border border-border/50 bg-background/30 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Proposed tags</h4>
            <BlueprintList items={blueprint.suggestedTags.proposedTags.map((item) => `${item.tag} — ${item.reason}`)} empty="No new/proposed tags." />
          </section>
          <section className="border border-border/50 bg-background/30 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Public-safe ingredients</h4>
            <BlueprintList items={blueprint.safeSummaryIngredients} empty="No public-safe summary ingredients yet." />
          </section>
          <section className="border border-border/50 bg-background/30 p-3">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Queue / music footprint</h4>
            <p className="text-foreground">{blueprint.queueMusicFootprintStatus}</p>
          </section>
        </div>
        <details className="border border-border/50 bg-background/20 p-3 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-foreground">Technical provenance</summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(blueprint.adminOnlyProvenance, null, 2)}
          </pre>
        </details>
      </div>
    </Section>
  );
}


function hasPagePlanShape(value: unknown): value is DossierSourceFilePagePlanV1 {
  const plan = asRecord(value);
  if (!plan) return false;
  return [
    "header",
    "analystRead",
    "whatBnlNeeds",
    "publicSafeMaterial",
    "bnlReviewGuidance",
    "questionsToAsk",
    "worthDecision",
    "internalOmitHold",
    "draftOrUpdatePlan",
    "diagnosticsSummary",
  ].some((key) => plan[key] !== undefined);
}

export function normalizeSourceFilePagePlanV1(
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata,
): DossierSourceFilePagePlanV1 | undefined {
  for (const candidate of archivePayloadCandidates(latestSourceFileArchive)) {
    const rootAnalyst = asRecord(candidate.subjectAnalystReadV1);
    const report = asRecord(candidate.sourceFileCaseReportV1);
    const reportAnalyst = asRecord(report?.subjectAnalystReadV1);
    const brief = asRecord(candidate.sourceFileBriefV2);
    const briefAnalyst = asRecord(brief?.subjectAnalystReadV1);
    const briefReport = asRecord(brief?.sourceFileCaseReportV1);
    const briefReportAnalyst = asRecord(briefReport?.subjectAnalystReadV1);
    const match = [
      candidate.sourceFilePagePlanV1,
      rootAnalyst?.sourceFilePagePlanV1,
      report?.sourceFilePagePlanV1,
      reportAnalyst?.sourceFilePagePlanV1,
      brief?.sourceFilePagePlanV1,
      briefAnalyst?.sourceFilePagePlanV1,
      briefReport?.sourceFilePagePlanV1,
      briefReportAnalyst?.sourceFilePagePlanV1,
    ].find(hasPagePlanShape);
    if (match) return match;
  }
  return undefined;
}

function planFieldHasValue(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(planFieldHasValue);
  const record = asRecord(value);
  return record ? Object.values(record).some(planFieldHasValue) : false;
}

function renderPlanField(label: string, value: unknown, fallback = "BNL did not provide this detail yet.") {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-accent">{label}</dt>
      <dd className="mt-1 text-foreground">
        {planFieldHasValue(value) ? <BriefParagraphs value={value} /> : <p>{fallback}</p>}
      </dd>
    </div>
  );
}

function needPriority(item: UnknownRecord) {
  const marker = `${scalarLabel(item.requiredOrOptional)} ${scalarLabel(item.currentStatus)}`.toLowerCase();
  if (/required|blocker|must|needed/.test(marker)) return 0;
  if (/optional|helpful|nice/.test(marker)) return 1;
  if (/not[ _-]?needed|not needed|none|resolved|complete/.test(marker)) return 2;
  return 1;
}


function planHeaderValue(value: unknown, fallback: string) {
  const displayed = displayValue(value);
  return displayed ?? fallback;
}

function unlockFallback(item: UnknownRecord) {
  const control = asRecord(item.suggestedControl);
  const marker = `${scalarLabel(item.neededItem)} ${scalarLabel(item.whyNeeded)} ${scalarLabel(control?.kind)}`.toLowerCase();
  if (/owner|wording|copy|public/.test(marker)) return "Unlocks clearer public-safe dossier wording.";
  if (/angle|classification|type/.test(marker)) return "Helps confirm dossier angle.";
  if (/draft|worth|decision|dossier/.test(marker)) return "Helps determine whether the dossier should be drafted.";
  if (/refresh|evidence|source|material/.test(marker)) return "Improves dossier readiness.";
  return "BNL did not specify what this unlocks yet.";
}

function SuggestedControlView({ control }: { control?: DossierSourceFilePagePlanSuggestedControl }) {
  if (!control?.kind || control.kind === "none") return null;
  if ((control.kind === "ask_owner" || control.kind === "ask_admin") && control.questionToCopy) {
    return <button type="button" className="mt-2 border border-accent px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent" onClick={() => void navigator.clipboard?.writeText(control.questionToCopy ?? "")}>{control.label ?? `Copy ${control.kind === "ask_owner" ? "owner" : "admin"} question`}</button>;
  }
  const text = control.guidance ?? control.recommendation ?? control.label ?? humanStatus(control.kind);
  return <p className="mt-2 text-xs text-muted">{control.kind === "refresh" ? `Refresh guidance: ${text}` : text}</p>;
}

function PlanItems({ items, empty, render, prioritizeNeeds = false }: { items?: unknown[]; empty: string; render: (item: UnknownRecord, index: number) => React.ReactNode; prioritizeNeeds?: boolean }) {
  const records = (items ?? []).flatMap((item) => asRecord(item) ? [asRecord(item) as UnknownRecord] : []);
  const displayRecords = prioritizeNeeds ? [...records].sort((a, b) => needPriority(a) - needPriority(b)) : records;
  if (!displayRecords.length) return <p className="text-muted">{empty}</p>;
  return <ul className="space-y-3">{displayRecords.map((item, index) => <li key={index} className={`border border-border/50 bg-background/30 p-3 ${prioritizeNeeds && needPriority(item) === 0 ? "border-accent/70" : ""}`}>{render(item, index)}</li>)}</ul>;
}

function SourceFilePagePlanView({
  plan,
  summary,
  latestSourceFileArchive,
  subjectName,
  currentLane,
  latestRecommendationTimestamp,
  sourceFileTargetStatus,
}: {
  plan: DossierSourceFilePagePlanV1;
  summary: DossierSourceFileSummary;
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata;
  subjectName?: string;
  currentLane?: string;
  latestRecommendationTimestamp?: string;
  sourceFileTargetStatus?: string;
}) {
  const header = plan.header ?? {};
  const analyst = plan.analystRead ?? {};
  const internal = plan.internalOmitHold ?? {};
  const draft = plan.draftOrUpdatePlan ?? {};
  const diagnostics = plan.diagnosticsSummary ?? {};
  const canDraft = draft.canDraft === true || String(draft.canDraft).toLowerCase() === "true";
  return <div className="space-y-4" data-source-file-page-plan="primary">
    <Section title="Unified Source File Header" helper="Single BNL page-plan header. Page-plan values win; legacy values only fill missing status context.">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <SnapshotItem label="Subject" value={planHeaderValue(header.subject ?? subjectName ?? latestSourceFileArchive?.subjectName, "BNL did not name the subject yet.")} />
        <SnapshotItem label="Source File status" value={planHeaderValue(header.sourceFileStatus ?? sourceFileTargetStatus ?? summary.nextAction, "BNL did not provide Source File status yet.")} />
        <SnapshotItem label="BNL state" value={planHeaderValue(header.bnlState ?? summary.publicReadiness, "BNL did not provide a state yet.")} />
        <SnapshotItem label="Current lane" value={planHeaderValue(header.currentLane ?? currentLane, "BNL did not provide the current lane yet.")} />
        <SnapshotItem label="Last refresh" value={formatSnapshotDate(String(header.lastRefresh ?? latestRecommendationTimestamp ?? latestSourceFileArchive?.updatedAt ?? summary.lastUpdatedAt ?? ""))} />
        <SnapshotItem label="Existing public dossier" value={planHeaderValue(header.existingPublicDossier ?? summary.existingPublicDossier, "BNL did not state whether a public dossier exists yet.")} />
      </dl>
    </Section>
    <Section title="BNL Analyst Read" tone="caution"><dl className="space-y-3">{renderPlanField("Overall read", analyst.overallRead, "BNL did not provide an overall read yet.")}{renderPlanField("What BNL thinks this is", analyst.whatBnlThinksThisIs, "BNL has not clearly classified this subject yet.")}{renderPlanField("Why this Source File exists", analyst.whyThisSourceFileExists, "BNL did not explain the Source File purpose yet.")}{renderPlanField("What seems useful", analyst.whatSeemsUseful, "BNL did not identify any clearly useful dossier material yet.")}{renderPlanField("What seems weak", analyst.whatSeemsWeak, "BNL did not identify any weak areas yet.")}{renderPlanField("What is uncertain", analyst.whatIsUncertain, "BNL did not specify the uncertain areas yet.")}{renderPlanField("What BNL is watching", analyst.whatBnlIsWatching, "BNL did not list any active watch items yet.")}{renderPlanField("Confidence", analyst.confidence, "BNL did not provide a confidence read yet.")}</dl></Section>
    <Section title="What BNL Needs" helper="Only the things BNL still needs to build a stronger, safer, more solid dossier."><PlanItems items={plan.whatBnlNeeds} prioritizeNeeds empty="BNL did not list any dossier-completion needs." render={(item) => <><dl className="grid grid-cols-1 gap-2 md:grid-cols-2">{renderPlanField("Needed item", item.neededItem, "BNL did not name the needed dossier item yet.")}{renderPlanField("Why needed", item.whyNeeded, "BNL did not explain why this is needed yet.")}{renderPlanField("Who can answer", item.whoCanAnswer, "BNL did not specify who can answer this yet.")}{renderPlanField("Required or optional", item.requiredOrOptional, "BNL did not mark whether this is required or optional yet.")}{renderPlanField("What it unlocks", item.whatItUnlocks, unlockFallback(item))}{renderPlanField("Current status", item.currentStatus, "BNL did not provide a current status yet.")}</dl><SuggestedControlView control={asRecord(item.suggestedControl) as DossierSourceFilePagePlanSuggestedControl | undefined} /></>} /></Section>
    <Section title="Public-Safe Material BNL Can Use"><PlanItems items={plan.publicSafeMaterial} empty={plan.noPublicSafeMaterialReadyText ?? "BNL says no material is ready for public use yet."} render={(item) => <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">{renderPlanField("Material", item.material)}{renderPlanField("How BNL would use it", item.howBnlWouldUseIt)}{renderPlanField("Why safe enough", item.whySafeEnough)}{renderPlanField("Confidence", item.confidence)}{renderPlanField("Needs approval", item.needsApproval)}</dl>} /></Section>
    <Section title="BNL Review Guidance"><PlanItems items={plan.bnlReviewGuidance} empty="BNL did not add review guidance." render={(item) => <><dl className="grid grid-cols-1 gap-2 md:grid-cols-2">{renderPlanField("Review issue", item.reviewIssue)}{renderPlanField("BNL decision", item.bnlDecision)}{renderPlanField("BNL explanation", item.bnlExplanation)}{renderPlanField("Recommended default", item.recommendedDefault)}{renderPlanField("Still active", item.stillActive)}{renderPlanField("Needed to finish", item.neededToFinish)}</dl><SuggestedControlView control={asRecord(item.suggestedControl) as DossierSourceFilePagePlanSuggestedControl | undefined} /></>} /></Section>
    <Section title="Questions To Ask"><PlanItems items={plan.questionsToAsk} empty={plan.noDecisionUnlockingQuestionsText ?? "BNL says no decision-unlocking questions exist."} render={(item) => <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">{renderPlanField("Question", item.question)}{renderPlanField("Audience", item.audience)}{renderPlanField("Why BNL is asking", item.whyBnlIsAsking)}{renderPlanField("What answer would unlock", item.whatAnswerWouldUnlock)}{renderPlanField("Required or optional", item.requiredOrOptional)}</dl>} /></Section>
    <Section title="Dossier Worth-It Decision" tone="caution"><dl className="grid grid-cols-1 gap-2 md:grid-cols-2">{renderPlanField("Worth a dossier", plan.worthDecision?.worthADossier, "BNL did not state whether this is dossier-worthy yet.")}{renderPlanField("Decision", plan.worthDecision?.decision, "BNL did not provide a dossier decision yet.")}{renderPlanField("Why", plan.worthDecision?.why, "BNL did not explain the decision yet.")}{renderPlanField("Possible dossier type", plan.worthDecision?.possibleDossierType, "BNL did not suggest a dossier type yet.")}{renderPlanField("Draft readiness", plan.worthDecision?.draftReadiness, "BNL did not provide a draft-readiness assessment yet.")}{renderPlanField("What would change the decision", plan.worthDecision?.whatWouldChangeTheDecision, "BNL did not explain what would change the decision yet.")}</dl></Section>
    <Section title="Internal / Omit / Hold"><div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><div><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Keep internal</h4><PlanItems items={internal.keepInternal} empty="No keep-internal material listed." render={(item) => <dl className="space-y-2">{renderPlanField("Material", item.material)}{renderPlanField("Why internal", item.whyInternal)}{renderPlanField("Could become public later", item.couldBecomePublicLater)}{renderPlanField("What would make it usable", item.whatWouldMakeItUsable)}</dl>} /></div><div><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Omit from public draft</h4><PlanItems items={internal.omitFromPublicDraft} empty="No omit-from-public-draft material listed." render={(item) => <dl className="space-y-2">{renderPlanField("Material", item.material)}{renderPlanField("Why omitted", item.whyOmitted)}{renderPlanField("Could become public later", item.couldBecomePublicLater)}{renderPlanField("What would make it usable", item.whatWouldMakeItUsable)}</dl>} /></div></div></Section>
    <Section title="Draft / Update Plan"><dl className="grid grid-cols-1 gap-2 md:grid-cols-2">{renderPlanField("Can draft", draft.canDraft)}{renderPlanField("Draft type", draft.draftType)}{renderPlanField("Suggested angle", draft.suggestedAngle)}{renderPlanField("Use these materials", draft.useTheseMaterials)}{renderPlanField("Omit these materials", draft.omitTheseMaterials)}{renderPlanField("Owner Review warnings", draft.ownerReviewWarnings)}{!canDraft && renderPlanField("Why not", draft.whyNot)}</dl>{canDraft && <p className="mt-3 text-xs text-muted">Draft controls remain available only where existing handlers provide them; Owner Review is still required.</p>}</Section>
    <Section title="Diagnostics Summary"><dl className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">{renderPlanField("Raw archive available", diagnostics.rawArchiveAvailable)}{renderPlanField("Case report available", diagnostics.caseReportAvailable)}{renderPlanField("Interim brief available", diagnostics.interimBriefAvailable)}{renderPlanField("Blueprint available", diagnostics.blueprintAvailable)}{renderPlanField("Legacy claim review count", diagnostics.legacyClaimReviewCount)}{renderPlanField("Absorbed review count", diagnostics.absorbedReviewCount)}{renderPlanField("Hidden diagnostic count", diagnostics.hiddenDiagnosticCount)}{renderPlanField("Safety notes", diagnostics.safetyNotes)}</dl></Section>
  </div>;
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
  blueprint,
  candidateId,
  claimReviews = [],
  onReviewClaim,
  candidate,
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
  blueprint?: DossierDraftBlueprint;
  candidateId?: string;
  claimReviews?: DossierSourceFileClaimReview[];
  onReviewClaim?: (claim: DossierSourceFileReviewableClaim, decision: DossierSourceFileClaimReviewDecision, options?: { publicSafe?: boolean; editedText?: string; decisionNote?: string }) => void;
  candidate?: Partial<DossierCandidate>;
}) {
  const sourceFilePagePlan = normalizeSourceFilePagePlanV1(latestSourceFileArchive);
  const report = normalizeCaseReport(latestSourceFileArchive);
  const interimBrief = normalizeInterimBrief(latestSourceFileArchive);
  const analystRead = normalizeSubjectAnalystReadV1(latestSourceFileArchive);
  const dossierCompletionRead = normalizeDossierCompletionReadV1(latestSourceFileArchive);
  const latestArchiveMissingReport = Boolean(latestSourceFileArchive && !report);
  const hasArchiveDiagnostics =
    latestSourceFileArchive?.caseReportPresent !== undefined ||
    latestSourceFileArchive?.caseReportExtractedFrom !== undefined;
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
            Primary BNL readout for this internal Source File. BNL thinks; the site displays; admins decide.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          <StatusBadge>Admin-review</StatusBadge>
          <StatusBadge>Display-only</StatusBadge>
          <StatusBadge>
            Source: {entityReadout?.readoutSource === "structured" ? "Structured packet" : "Safe fallback"}
          </StatusBadge>
        </div>
      </div>

      {!sourceFilePagePlan && (
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
      )}

      {sourceFilePagePlan ? (
        <>
          <SourceFilePagePlanView
            plan={sourceFilePagePlan}
            summary={summary}
            latestSourceFileArchive={latestSourceFileArchive}
            subjectName={subjectName}
            currentLane={currentLane}
            latestRecommendationTimestamp={latestRecommendationTimestamp}
            sourceFileTargetStatus={sourceFileTargetStatus}
          />
          <details className="border border-border/60 bg-background/20 p-3 text-sm text-muted">
            <summary className="cursor-pointer font-semibold text-foreground">Support / Diagnostics</summary>
            <div className="mt-3 space-y-4">
              <DossierCompletionReadout
                completionRead={dossierCompletionRead}
                analystRead={analystRead}
                report={report}
                interimBrief={interimBrief}
              />
              <BnlAnalystReadPanel
                analystRead={analystRead}
                refreshedAt={latestSourceFileArchive?.updatedAt ?? summary.lastUpdatedAt}
                candidateId={candidateId}
                sourceArchiveId={latestSourceFileArchive?.id}
                subjectName={subjectName ?? latestSourceFileArchive?.subjectName}
                claimReviews={claimReviews}
                onReviewClaim={onReviewClaim}
                candidate={candidate}
              />
              {blueprint && <DossierBlueprintView blueprint={blueprint} />}
              {hasArchiveDiagnostics && (
                <Section title="Archive ingest diagnostics" helper="Admin-only preservation check. These fields are safe booleans and path labels, not raw archive secrets.">
                  <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <SnapshotItem label="caseReportPresent" value={latestSourceFileArchive?.caseReportPresent ? "true" : "false"} />
                    <SnapshotItem label="caseReportExtractedFrom" value={latestSourceFileArchive?.caseReportExtractedFrom ?? "—"} />
                  </dl>
                </Section>
              )}
              <CaseReportView report={report} />
              <InterimBriefView brief={interimBrief} hasReport={Boolean(report)} />
            </div>
          </details>
        </>
      ) : (
        <>
          <DossierCompletionReadout
            completionRead={dossierCompletionRead}
            analystRead={analystRead}
            report={report}
            interimBrief={interimBrief}
          />

          <BnlAnalystReadPanel
            analystRead={analystRead}
            refreshedAt={latestSourceFileArchive?.updatedAt ?? summary.lastUpdatedAt}
            candidateId={candidateId}
            sourceArchiveId={latestSourceFileArchive?.id}
            subjectName={subjectName ?? latestSourceFileArchive?.subjectName}
            claimReviews={claimReviews}
            onReviewClaim={onReviewClaim}
            candidate={candidate}
          />

          {blueprint && <DossierBlueprintView blueprint={blueprint} />}

          {hasArchiveDiagnostics && (
            <Section title="Archive ingest diagnostics" helper="Admin-only preservation check. These fields are safe booleans and path labels, not raw archive secrets.">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <SnapshotItem label="caseReportPresent" value={latestSourceFileArchive?.caseReportPresent ? "true" : "false"} />
                <SnapshotItem label="caseReportExtractedFrom" value={latestSourceFileArchive?.caseReportExtractedFrom ?? "—"} />
              </dl>
            </Section>
          )}

          <CaseReportView report={report} />
          <InterimBriefView brief={interimBrief} hasReport={Boolean(report)} />
        </>
      )}
    </section>
  );
}
