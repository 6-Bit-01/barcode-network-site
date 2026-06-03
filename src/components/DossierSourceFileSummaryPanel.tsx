"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";
import type { DossierRecommendation, DossierSourceFileNote } from "@/lib/dossier-workflow";
import { buildSourceFileActionableBrief } from "@/lib/dossier-source-file-actionable-brief";
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

function ActivityGroup({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="border border-border/50 bg-background/20 p-2">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground">
        {title}
      </h4>
      <SummaryList items={fallbackItems(items, empty)} />
    </div>
  );
}

function isClassificationText(value: string) {
  return /\b(?:automated topic|topic label|classified|classification|evidence categor(?:y|ies)|topic breakdown|topic detail|source-file|dossier|BNL\/source-file|BNL source-file|BNL\/source file|source file\/dossier)\b/i.test(value);
}

function classificationLabel(value: string) {
  const clean = value
    .replace(/\bauthored\b/gi, "")
    .replace(/\bposted\b/gi, "")
    .replace(/\bCrow\s+(?:discussed|posted about|talked about|authored)\b/gi, "")
    .replace(/\bdiscussed\b/gi, "related to")
    .replace(/\bhandling\b/gi, "context")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-:;,\s]+|[-:;,\s]+$/g, "");
  if (/\bclassified\b/i.test(clean) || /\bautomated topic/i.test(clean)) {
    return clean;
  }
  return `Automated topic label: ${clean}. Needs human review before this becomes a subject claim.`;
}

function displaySafeText(value?: string | null) {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (/\[object Object\]/i.test(clean)) return undefined;
  if (/\b(?:authored_public_conversation|profile_match)\b/i.test(clean)) return undefined;
  if (/\b(?:user_profiles|conversations|relationship_journal|source_memory_packet|source table|table name)\b/i.test(clean)) {
    return undefined;
  }
  if (isClassificationText(clean)) {
    return classificationLabel(clean)
      .replace(/\bpublic-side\b/gi, "approved public context")
      .replace(/\brow\(s\)\b/gi, "items");
  }
  if (containsDossierBackendJunk(clean) || isRawSourceMemoryDebugText(clean)) {
    return undefined;
  }
  return clean
    .replace(/\bauthored public-side row\(s\)\b/gi, "approved public context item")
    .replace(/\bpublic-side row\(s\)\b/gi, "approved public context item")
    .replace(/\brow\(s\)\b/gi, "items")
    .replace(/\bpublic-side\b/gi, "approved public context")
    .replace(/\bReview candidate\b/g, "Review item")
    .replace(/\bidentity matching context\b/gi, "identity review context")
    .replace(/\blocal context\b/gi, "BNL review context")
    .replace(/\bprofile_match\b/gi, "local profile match");
}

function safeReviewItems(items: Array<string | undefined | null>, limit = 6) {
  const output: string[] = [];
  const seenKeys = new Set<string>();
  for (const item of items) {
    const clean = displaySafeText(item);
    if (!clean) continue;
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

function visibleDedupeKey(item: string) {
  return item
    .toLowerCase()
    .replace(/^(?:music\/platform signal|supporting evidence|supporting classification|source coverage|evidence detail):\s*/i, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

function withoutVisibleRepeats(items: string[], seen: Set<string>) {
  const output: string[] = [];
  for (const item of items) {
    const key = visibleDedupeKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function markVisible(items: string[], seen: Set<string>) {
  const output: string[] = [];
  const localSeen = new Set<string>();
  for (const item of items) {
    const key = visibleDedupeKey(item);
    if (!key || localSeen.has(key)) continue;
    localSeen.add(key);
    seen.add(key);
    output.push(item);
  }
  return output;
}

function queueStatusItems(status?: string, note?: string) {
  const items: string[] = [];
  if (status === "not_connected") {
    items.push("Queue/submission history is not connected yet.");
  } else if (status) {
    items.push(`Queue/submission status: ${status.replace(/_/g, " ")}.`);
  }
  if (note) items.push(note);
  return safeReviewItems(items, 3);
}

function evidenceDepthLabel(level: DossierSourceFileSummary["substanceLevel"]) {
  return { thin: "Thin", partial: "Partial", useful: "Useful", strong: "Strong" }[level];
}

function readinessLabel(readiness: DossierSourceFileSummary["publicReadiness"]) {
  return {
    not_ready: "Not Ready",
    needs_review: "Needs Review",
    draftable: "Draftable",
    owner_approved: "Owner Approved",
  }[readiness];
}

function identityCertaintyLabel(summary: DossierSourceFileSummary) {
  if (summary.existingPublicDossier === "linked_update_target") return "Confirmed";
  if (summary.existingPublicDossier === "yes") return "Needs Review";
  return "Unconfirmed";
}

function sourceConfidenceLabel(value?: string) {
  const values = (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!values.length) return "Mixed / review required";
  const uniqueValues = Array.from(new Set(values));
  if (uniqueValues.length !== 1) return "Mixed / review required";
  if (uniqueValues[0] === "low") return "Low";
  if (uniqueValues[0] === "medium") return "Medium";
  if (uniqueValues[0] === "high") return "High";
  return "Mixed / review required";
}

function missingChecklist(items: string[]) {
  return safeReviewItems(
    [
      ...items,
      "Confirm public-safe display name.",
      "Confirm public role/description.",
      "Add public links.",
      "Connect queue/submission identity when that bridge exists.",
      "Confirm whether this subject should have a public dossier at all.",
    ],
    8,
  );
}

export function DossierSourceFileSummaryPanel({
  summary,
  entityReadout,
  subjectName,
  recommendations = [],
  sourceFileNotes = [],
  title = "Source File Snapshot / BNL Readout",
}: {
  summary: DossierSourceFileSummary;
  entityReadout?: DossierEntityActivityReadout | null;
  subjectName?: string;
  recommendations?: Array<Partial<DossierRecommendation>>;
  sourceFileNotes?: Array<Pick<DossierSourceFileNote, "text"> | string | null | undefined>;
  title?: string;
}) {
  const currentRead = entityReadout?.currentRead ?? summary.currentRead;
  const publicSafePossibilities = safeReviewItems([
    ...(entityReadout?.publicSafePossibilities ?? []),
    ...summary.publicSafePossibilities,
  ]);
  const missingInfo = safeReviewItems([
    ...(entityReadout?.missingInfo ?? []),
    ...summary.missingInfo,
  ]);
  const observedChannels = safeReviewItems([
    ...(entityReadout?.observedChannels ?? []),
    ...summary.observedChannels,
  ]);
  const conversationHighlights = safeReviewItems([
    ...(entityReadout?.conversationHighlights ?? []),
    ...summary.conversationHighlights,
  ]);
  const publicUseCandidates = safeReviewItems([
    ...(entityReadout?.publicUseCandidates ?? []),
    ...summary.publicUseCandidates,
  ]);
  const representativeEvidence = safeReviewItems([
    ...(entityReadout?.representativeEvidence ?? []),
    ...(summary.representativeEvidence ?? []),
  ], 8);
  const activityFrequencySummary = safeReviewItems([
    ...(entityReadout?.activityFrequencySummary ?? []),
    ...(summary.activityFrequencySummary ?? []),
  ], 4);
  const topChannels = safeReviewItems([
    ...(entityReadout?.topChannels ?? []),
    ...(summary.topChannels ?? []),
  ]);
  const recentActivitySummary = safeReviewItems([
    ...(entityReadout?.recentActivitySummary ?? []),
    ...(summary.recentActivitySummary ?? []),
  ], 4);
  const authoredVsMentionedSummary = safeReviewItems([
    ...(entityReadout?.authoredVsMentionedSummary ?? []),
    ...(summary.authoredVsMentionedSummary ?? []),
  ], 4);
  const queueItems = queueStatusItems(
    entityReadout?.queueSubmissionStatus ?? summary.queueSubmissionStatus,
    entityReadout?.queueSubmissionNote ?? summary.queueSubmissionNote,
  );
  const sourceAuthority = safeReviewItems([
    ...(entityReadout?.sourceAuthority ?? []),
    ...summary.sourceAuthority,
  ]);
  const recommendedAction =
    entityReadout?.recommendedAction ?? summary.recommendedNextAction;
  const evidenceStatus = [
    `Evidence depth: ${evidenceDepthLabel(summary.substanceLevel)}.`,
    `Public readiness: ${readinessLabel(summary.publicReadiness)}.`,
    `Identity certainty: ${identityCertaintyLabel(summary)}.`,
    `Source confidence: ${sourceConfidenceLabel(entityReadout?.confidence)}.`,
  ];
  const actionableBrief = buildSourceFileActionableBrief({
    entityReadout,
    summary,
    subjectName,
    recommendations,
    sourceFileNotes,
  });
  const visibleFacts = new Set<string>();
  const keyFindings = markVisible(actionableBrief.keyFindings, visibleFacts);
  const namedTopics = markVisible(actionableBrief.namedTopics, visibleFacts);
  const bnlInteractionPatterns = markVisible(actionableBrief.bnlInteractionPatterns, visibleFacts);
  const platformAndMusicSignals = markVisible(
    [...actionableBrief.platformSignals, ...actionableBrief.musicSignals],
    visibleFacts,
  );
  const communityActivity = markVisible(actionableBrief.communityActivity, visibleFacts);
  const queueSubmissionStatus = markVisible(actionableBrief.queueSubmissionStatus, visibleFacts);
  const reviewOnlyCautions = markVisible(actionableBrief.reviewOnlyCautions, visibleFacts);
  const missingBeforePublic = markVisible(
    missingChecklist([...missingInfo, ...actionableBrief.missingInfo]),
    visibleFacts,
  );
  const recommendedNextActions = markVisible(
    fallbackItems(actionableBrief.recommendedNextActions, recommendedAction),
    visibleFacts,
  );
  const activityChannels = safeReviewItems([
    ...topChannels.map((item) => `Public channel/activity: ${item}`),
    ...observedChannels.map((item) => `Observed activity: ${item}`),
  ], 6);
  const activityNamedTopics = withoutVisibleRepeats(namedTopics, visibleFacts);
  const activityPlatformMentions = withoutVisibleRepeats(
    safeReviewItems([
      ...actionableBrief.platformSignals,
      ...actionableBrief.musicSignals,
    ], 6),
    visibleFacts,
  );
  const activityBnlInteraction = withoutVisibleRepeats(bnlInteractionPatterns, visibleFacts);
  const activityFrequency = safeReviewItems([
    ...activityFrequencySummary.map((item) => `Frequency: ${item}`),
    ...recentActivitySummary.map((item) => `Recency: ${item}`),
    ...authoredVsMentionedSummary.map((item) => `Posted/mentioned balance: ${item}`),
  ], 6);
  const activitySupportingEvidence = withoutVisibleRepeats(
    safeReviewItems([
      ...representativeEvidence.map((item) => isClassificationText(item) ? `Supporting review item: ${item}` : `Representative public activity: ${item}`),
      ...conversationHighlights.map((item) => isClassificationText(item) ? `Supporting review item: ${item}` : `Public activity note: ${item}`),
    ], 6),
    visibleFacts,
  );
  const supportingEvidenceLog = withoutVisibleRepeats(
    [...actionableBrief.supportingEvidence, ...evidenceStatus, ...sourceAuthority].filter(
      (item) => !/owner review|required|more public-safe context needed/i.test(item),
    ),
    visibleFacts,
  );


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
          <StatusBadge>Source confidence: {sourceConfidenceLabel(entityReadout?.confidence)}</StatusBadge>
          <StatusBadge>Review-only</StatusBadge>
          <StatusBadge>
            Source:{" "}
            {entityReadout?.readoutSource === "structured"
              ? "Structured packet"
              : "Safe fallback"}
          </StatusBadge>
          <StatusBadge>
            {queueItems[0] ?? "Queue/submission history is not connected yet"}
          </StatusBadge>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm text-muted">
        <Section
          title="Current Read"
          helper="Why this source file exists, what BNL sees now, and whether public use is safe yet."
        >
          <SummaryList
            items={[
              summary.whyTracked,
              currentRead,
              `${readinessLabel(summary.publicReadiness)} for public use; owner/admin review is still required before public copy changes.`,
            ]}
          />
        </Section>
        <Section
          title="Key Intelligence"
          helper="Highest-value facts first. These are admin-review leads, not public dossier copy."
        >
          <SummaryList
            items={fallbackItems(
              keyFindings,
              "No high-value actionable intelligence has been extracted yet.",
            )}
          />
        </Section>
        <Section
          title="Named Topics / People"
          helper="Recurring names surfaced for review before any public use."
        >
          <SummaryList items={fallbackItems(namedTopics, "No recurring named topic has been extracted yet.")} />
        </Section>
        <Section
          title="BNL Interaction Pattern"
          helper="How this source appears to interact with BNL in approved review context."
        >
          <SummaryList items={fallbackItems(bnlInteractionPatterns, "No BNL interaction pattern has been extracted yet.")} />
        </Section>
        <Section
          title="Music / Platform Signals"
          helper="Tool, platform, music, or show signals that still need review before public use."
        >
          <SummaryList items={fallbackItems(platformAndMusicSignals, "No music/tool/platform signal has been extracted yet.")} />
        </Section>
        <Section
          title="Community Activity"
          helper="Approved public/community context without raw transcripts or IDs."
        >
          <SummaryList items={fallbackItems(communityActivity, "No community activity detail has been extracted yet.")} />
        </Section>
        <Section
          title="Queue / Submission Status"
          tone="review"
          helper="Submission and payment boundaries. Do not infer queue history from source evidence."
        >
          <SummaryList items={queueSubmissionStatus} />
        </Section>
        <Section
          title="Activity Details"
          helper="Structured activity split by review use, with classifications kept as supporting context."
        >
          <div className="space-y-2">
            <ActivityGroup title="Public Channels / Activity" items={activityChannels} empty="No public channel/activity detail has been supplied yet." />
            <ActivityGroup title="Named Topics" items={activityNamedTopics} empty="No named topic detail has been supplied yet." />
            <ActivityGroup title="Tool / Platform Mentions" items={activityPlatformMentions} empty="No tool/platform mention has been supplied yet." />
            <ActivityGroup title="BNL Interaction" items={activityBnlInteraction} empty="No BNL interaction detail has been supplied yet." />
            <ActivityGroup title="Frequency / Recency" items={activityFrequency} empty="No frequency or recency detail has been supplied yet." />
            <ActivityGroup title="Supporting Evidence" items={activitySupportingEvidence} empty="No representative supporting evidence has been supplied yet." />
          </div>
        </Section>
        <Section
          title="Review-Only Cautions"
          tone="review"
          helper="Internal, private, source-blind, or unconfirmed context. Do not use publicly unless owner/admin review approves it."
        >
          <SummaryList items={fallbackItems(reviewOnlyCautions, "No review-only cautions are recorded in the structured readout.")} />
        </Section>
        <Section
          title="Missing Before Public Dossier"
          tone="caution"
          helper="What still needs to be confirmed before this can become a clean public dossier."
        >
          <SummaryList items={missingBeforePublic} />
        </Section>
        <Section
          title="Dossier Use / Public-Safe Possibilities"
          tone="review"
          helper="What may become useful later. Public wording remains owner-review gated."
        >
          <SummaryList
            items={fallbackItems(
              safeReviewItems([...publicSafePossibilities, ...publicUseCandidates]),
              "Owner review needed before public wording.",
            )}
          />
        </Section>
        <Section title="Recommended Next Action">
          <SummaryList items={recommendedNextActions} />
        </Section>
        <Section
          title="Supporting Evidence Log"
          helper="Lower-priority source coverage, supporting classification, and evidence-log records. These support review, but they are not public copy."
        >
          <SummaryList items={fallbackItems(supportingEvidenceLog, "No lower-priority supporting evidence entries have been attached yet.")} />
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
