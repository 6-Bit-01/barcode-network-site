"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";
import type {
  DossierRecommendation,
  DossierSourceFileArchiveMetadata,
  DossierSourceFileCaseReportV1,
  DossierSourceFileNote,
  DossierSubjectAnalystReadV1,
} from "@/lib/dossier-workflow";
import type { DossierDraftBlueprint } from "@/lib/dossier-classification";
import { buildDossierStylePacket, DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS } from "@/lib/dossier-style-packet";
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
    "subjectName",
    "internalRead",
    "likelySubjectType",
    "confidence",
    "publicDraftPosture",
    "strongestSignals",
    "publicReadyClaims",
    "sourceFileReviewClaims",
    "reviewNeededClaims",
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

function BnlAnalystReadPanel({
  analystRead,
  refreshedAt,
}: {
  analystRead?: DossierSubjectAnalystReadV1;
  refreshedAt?: string;
}) {
  if (!analystRead) {
    return (
      <Section title="BNL Analyst Read" tone="review" helper="Internal Source File intelligence. Not public dossier copy.">
        <p className="text-foreground">No BNL analyst read stored yet. Refresh this Source File after bot PR #284 is deployed.</p>
      </Section>
    );
  }
  const reviewClaims = stringItems(analystRead.reviewNeededClaims).length
    ? analystRead.reviewNeededClaims
    : analystRead.sourceFileReviewClaims;
  const withheldContext = [
    ...stringItems(analystRead.sourceBlindInsights).map((item) => `Source-blind: ${item}`),
    ...stringItems(analystRead.privateOrInternalExclusions).map((item) => `Private/internal withheld: ${item}`),
    ...stringItems(analystRead.doNotSayPublicly).map((item) => `Do not say publicly: ${item}`),
  ];
  return (
    <Section title="BNL Analyst Read" tone="review" helper="Internal Source File intelligence. Not public dossier copy.">
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SnapshotItem label="Subject type" value={scalarLabel(analystRead.likelySubjectType)} />
          <SnapshotItem label="Confidence" value={scalarLabel(analystRead.confidence)} />
          <SnapshotItem label="Public draft posture" value={scalarLabel(analystRead.publicDraftPosture)} />
          <SnapshotItem label="Last refreshed" value={formatSnapshotDate(refreshedAt)} />
        </dl>
        <section className="border border-accent/60 bg-background/30 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-accent">Internal Read</h4><BriefParagraphs value={analystRead.internalRead} /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Strongest Signals</h4><AnalystList value={analystRead.strongestSignals} empty="No strongest signals reported." /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Public-Ready Claims</h4><AnalystList value={analystRead.publicReadyClaims} empty="No public-ready claims yet." /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Review-Needed Claims</h4><AnalystList value={reviewClaims} empty="No review-needed claims reported." /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Source-Blind / Withheld Context</h4><AnalystList value={withheldContext} empty="No source-blind insights reported." /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Missing Confirmations</h4><AnalystList value={analystRead.missingInfoQuestions} empty="No missing confirmations reported." /></section>
        <section className="border border-border/50 bg-background/20 p-3"><h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-foreground">Recommended Admin Actions</h4><AnalystList value={analystRead.recommendedAdminActions} empty="No recommended admin actions reported." /></section>
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


function BlueprintList({ items, empty = "—" }: { items?: string[]; empty?: string }) {
  const safeItems = (items ?? []).filter(Boolean);
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
}) {
  const report = normalizeCaseReport(latestSourceFileArchive);
  const interimBrief = normalizeInterimBrief(latestSourceFileArchive);
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

      <BnlAnalystReadPanel analystRead={normalizeSubjectAnalystReadV1(latestSourceFileArchive)} refreshedAt={latestSourceFileArchive?.updatedAt ?? summary.lastUpdatedAt} />

      {blueprint && <DossierBlueprintView blueprint={blueprint} />}

      {hasArchiveDiagnostics && (
        <Section title="Archive ingest diagnostics" helper="Admin-only preservation check. These fields are safe booleans and path labels, not raw archive secrets.">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SnapshotItem
              label="caseReportPresent"
              value={latestSourceFileArchive?.caseReportPresent ? "true" : "false"}
            />
            <SnapshotItem
              label="caseReportExtractedFrom"
              value={latestSourceFileArchive?.caseReportExtractedFrom ?? "—"}
            />
          </dl>
        </Section>
      )}

      <CaseReportView report={report} />
      <InterimBriefView brief={interimBrief} hasReport={Boolean(report)} />
    </section>
  );
}
