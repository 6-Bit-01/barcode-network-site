"use client";

import type React from "react";
import type { DossierEntityActivityReadout } from "@/lib/dossier-entity-activity-readout";
import type {
  DossierRecommendation,
  DossierSourceFileNote,
} from "@/lib/dossier-workflow";
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
  receipts = [],
}: {
  title: string;
  items: string[];
  empty: string;
  receipts?: string[];
}) {
  return (
    <div className="border border-border/50 bg-background/20 p-2">
      <h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-foreground">
        {title}
      </h4>
      <SummaryList items={fallbackItems(items, empty)} />
      {receipts.length > 0 && (
        <details className="mt-3 border border-border/50 bg-background/30 p-2 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-foreground">
            Show evidence / Evidence receipts — collapsed by default
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {receipts.map((receipt) => (
              <li key={receipt}>{receipt}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function isClassificationText(value: string) {
  return /\b(?:automated topic|topic label|classified|classification|evidence categor(?:y|ies)|topic breakdown|topic detail)\b/i.test(
    value,
  );
}

function classificationLabel(value: string) {
  const clean = value
    .replace(/\bauthored\b/gi, "")
    .replace(/\bposted\b/gi, "")
    .replace(
      /\bCrow\s+(?:discussed|posted about|talked about|authored)\b/gi,
      "",
    )
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
  if (/\b(?:authored_public_conversation|profile_match)\b/i.test(clean))
    return undefined;
  if (
    /\b(?:user_profiles|conversations|relationship_journal|source_memory_packet|source table|table name)\b/i.test(
      clean,
    )
  ) {
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
  return stripRawUrls(clean)
    .replace(
      /\bauthored public-side row\(s\)\b/gi,
      "approved public context item",
    )
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
    .replace(
      /^(?:music\/platform signal|supporting evidence|supporting classification|source coverage|evidence detail):\s*/i,
      "",
    )
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
  return {
    thin: "Thin",
    partial: "Partial",
    useful: "Useful",
    strong: "Strong",
  }[level];
}

function readinessLabel(
  readiness: DossierSourceFileSummary["publicReadiness"],
) {
  return {
    not_ready: "Not Ready",
    needs_review: "Needs Review",
    draftable: "Draftable",
    owner_approved: "Owner Approved",
  }[readiness];
}

function identityCertaintyLabel(summary: DossierSourceFileSummary) {
  if (summary.existingPublicDossier === "linked_update_target")
    return "Confirmed";
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

function formatSnapshotDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function humanStatus(value?: string) {
  return value ? value.replace(/_/g, " ") : "—";
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

function categoryItems(label: string, items: string[], fallback?: string) {
  const values = safeReviewItems(items, 4);
  if (!values.length && !fallback) return [];
  return [`${label}: ${values.length ? values.join("; ") : fallback}`];
}

function linkPlatformCategories(items: string[]) {
  const all = safeReviewItems(items, 40).filter(
    (item) => !isClassificationText(item),
  );
  const pick = (pattern: RegExp) => all.filter((item) => pattern.test(item));
  return [
    ...categoryItems(
      "Actual music platform links",
      pick(
        /actual music platform links?|music platform links?|bandcamp|soundcloud|spotify|suno|udio/i,
      ),
    ),
    ...categoryItems(
      "Video platform links",
      pick(/video platform links?|youtube|youtu\.be|vimeo|twitch/i),
    ),
    ...categoryItems(
      "Event/contest links",
      pick(/event\/contest links?|event links?|contest links?|competition/i),
    ),
    ...categoryItems(
      "Community/server links",
      pick(/community\/server links?|server links?|discord|community server/i),
    ),
    ...categoryItems(
      "Generic links",
      pick(/generic links?|link evidence|website|url/i),
    ),
    ...categoryItems(
      "Platform references",
      pick(
        /platform references?|tool\/platform|platform mention|platform signal/i,
      ),
    ),
    ...categoryItems(
      "Music discussion",
      pick(
        /music discussion|collaboration|music-making|songwriting|producer|production/i,
      ),
    ),
    ...categoryItems(
      "Song/track/demo/WIP mentions",
      pick(/song\/track\/demo\/WIP mentions?|track|demo|wip|song mention/i),
    ),
    ...categoryItems(
      "Derived duplicate link references suppressed",
      pick(
        /derived duplicate .*suppressed|duplicate link references suppressed/i,
      ),
    ),
  ];
}

function takeWithoutRepeats(items: string[], seen: Set<string>, limit = 6) {
  return withoutVisibleRepeats(safeReviewItems(items, limit * 2), seen).slice(
    0,
    limit,
  );
}


type EvidenceReceiptGroup =
  | "role"
  | "relationship"
  | "creative"
  | "eventCommunity"
  | "bnl"
  | "activity";

type EvidenceReceipt = {
  group: EvidenceReceiptGroup;
  specificity: number;
  text: string;
  key: string;
};

function stripRawUrls(value: string) {
  return value.replace(/https?:\/\/[^\s)\]]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return platformLabelFromDomain(parsed.hostname) ?? parsed.hostname.replace(/^www\./i, "");
    } catch {
      return "linked platform";
    }
  });
}

function platformLabelFromDomain(domain: string) {
  const host = domain.toLowerCase().replace(/^www\./, "");
  if (host.includes("youtu.be") || host.includes("youtube.com")) return "YouTube/youtu.be";
  if (host.includes("soundcloud.com")) return "SoundCloud";
  if (host.includes("bandcamp.com")) return "Bandcamp";
  if (host.includes("spotify.com")) return "Spotify";
  if (host.includes("discord.gg") || host.includes("discord.com")) return "Discord";
  if (host.includes("twitch.tv")) return "Twitch";
  if (host.includes("vimeo.com")) return "Vimeo";
  return undefined;
}

function safeReceiptSummary(value: string) {
  if (/legacy recurring-subject|rawRefJson|source table|row IDs?|source lane mapping|\[object Object\]/i.test(value)) {
    return undefined;
  }
  const clean = displaySafeText(stripRawUrls(value));
  if (!clean) return undefined;
  return clean
    .replace(/\brawRefJson\b/gi, "raw diagnostic detail")
    .replace(/\brow IDs?\b/gi, "source item identifiers")
    .replace(/\bsource table names?\b/gi, "source diagnostics")
    .replace(/relationship\/context/gi, "relationship notes")
    .replace(/\s+/g, " ")
    .trim();
}

function receiptContext(value: string) {
  const channel = value.match(/#[a-z0-9][\w-]*/i)?.[0];
  if (channel) return ` in ${channel}`;
  if (/approved public context|public-safe|public context/i.test(value)) {
    return " in approved public context";
  }
  if (/discord/i.test(value)) return " in Discord context";
  return "";
}

function receiptDate(value: string) {
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return `, ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
    }
  }
  const month = value.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/i)?.[0];
  return month ? `, ${month}` : "";
}

function receiptVisibility(value: string, group: EvidenceReceiptGroup) {
  if (/private|internal|review-only|owner review|not public|do not use publicly/i.test(value)) {
    return "Owner review required before public copy.";
  }
  if (group === "relationship") return "Owner review required before public copy.";
  if (group === "eventCommunity") return "Review event/community details before public use.";
  return "Review before public use.";
}

function receiptTypeAndGroup(value: string): Pick<EvidenceReceipt, "group" | "specificity"> & { label: string } | undefined {
  if (/derived duplicate .*suppressed|duplicate link references suppressed/i.test(value)) {
    return { group: "creative", specificity: 90, label: "Derived duplicate references suppressed" };
  }
  if (/video platform links?|youtube|youtu\.be|vimeo|twitch/i.test(value)) {
    return { group: "creative", specificity: 100, label: "Video platform link evidence" };
  }
  if (/event\/contest links?|event links?|contest links?|competition|contest announcement|discord event/i.test(value)) {
    return { group: "eventCommunity", specificity: 100, label: "Event/contest link evidence" };
  }
  if (/actual music platform links?|music platform links?|bandcamp|soundcloud|spotify|suno|udio/i.test(value)) {
    return { group: "creative", specificity: 95, label: "Actual music platform link evidence" };
  }
  if (/community\/server links?|server links?|discord|community server/i.test(value)) {
    return { group: "eventCommunity", specificity: 80, label: "Community/server link evidence" };
  }
  if (/platform references?|tool\/platform|platform mention|platform signal/i.test(value)) {
    return { group: "creative", specificity: 70, label: "Platform reference evidence" };
  }
  if (/song\/track\/demo\/WIP mentions?|track|demo|wip|song mention/i.test(value)) {
    return { group: "creative", specificity: 65, label: "Song/track/demo/WIP mention evidence" };
  }
  if (/music discussion|collaboration|music-making|songwriting|producer|production/i.test(value)) {
    return { group: "creative", specificity: 60, label: "Music discussion evidence" };
  }
  if (/generic links?|link evidence|website|url/i.test(value)) {
    return { group: "creative", specificity: 40, label: "Generic link evidence" };
  }
  if (/relationship\/context|relationship context|relationship signal|relationship trace|prior relationship|collaborator|appears in reviewed evidence/i.test(value)) {
    return { group: "relationship", specificity: 85, label: "Relationship evidence" };
  }
  if (/BNL interaction|source-file|dossier|challenging|antagonistic|boundary|boundaries/i.test(value)) {
    return { group: "bnl", specificity: 75, label: "BNL-facing interaction evidence" };
  }
  if (/role signal|known context|current read|why tracked/i.test(value)) {
    return { group: "role", specificity: 30, label: "Role signal evidence" };
  }
  if (/activity|conversation|recurring|recent|posted|mentioned|theme|topic/i.test(value)) {
    return { group: "activity", specificity: 50, label: "Activity/theme evidence" };
  }
  return undefined;
}

function evidenceReceiptKey(value: string) {
  return stripRawUrls(value)
    .toLowerCase()
    .replace(/^(?:actual music platform links?|video platform links?|event\/contest links?|community\/server links?|generic links?|platform references?|music discussion|song\/track\/demo\/wip mentions?):\s*/i, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

function buildEvidenceReceipts(items: Array<string | undefined | null>, limit = 4) {
  const byKey = new Map<string, EvidenceReceipt>();
  for (const item of items) {
    const clean = safeReceiptSummary(item ?? "");
    if (!clean || isClassificationText(clean)) continue;
    const type = receiptTypeAndGroup(clean);
    if (!type) continue;
    const key = evidenceReceiptKey(clean);
    if (!key) continue;
    const receipt: EvidenceReceipt = {
      group: type.group,
      specificity: type.specificity,
      key,
      text: `${type.label}: ${clean}${receiptContext(clean)}${receiptDate(clean)}. ${receiptVisibility(clean, type.group)}`,
    };
    const existing = byKey.get(key);
    if (!existing || receipt.specificity > existing.specificity) byKey.set(key, receipt);
  }

  const used = new Set<string>();
  const grouped: Record<EvidenceReceiptGroup, string[]> = {
    role: [],
    relationship: [],
    creative: [],
    eventCommunity: [],
    bnl: [],
    activity: [],
  };
  for (const receipt of Array.from(byKey.values()).sort((a, b) => b.specificity - a.specificity)) {
    const visibleKey = visibleDedupeKey(receipt.text);
    if (used.has(visibleKey)) continue;
    used.add(visibleKey);
    if (grouped[receipt.group].length < limit) grouped[receipt.group].push(receipt.text);
  }
  return grouped;
}

export function DossierSourceFileSummaryPanel({
  summary,
  entityReadout,
  subjectName,
  recommendations = [],
  sourceFileNotes = [],
  title = "Entity Intelligence Review Console",
  currentLane,
  latestRecommendationTimestamp,
  sourceFileTargetStatus,
}: {
  summary: DossierSourceFileSummary;
  entityReadout?: DossierEntityActivityReadout | null;
  subjectName?: string;
  recommendations?: Array<Partial<DossierRecommendation>>;
  sourceFileNotes?: Array<
    Pick<DossierSourceFileNote, "text"> | string | null | undefined
  >;
  title?: string;
  currentLane?: string;
  latestRecommendationTimestamp?: string;
  sourceFileTargetStatus?: string;
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
    ...(summary.conversationHighlights ?? []),
  ]);
  const publicUseCandidates = safeReviewItems([
    ...(entityReadout?.publicUseCandidates ?? []),
    ...(summary.publicUseCandidates ?? []),
  ]);
  const representativeEvidence = safeReviewItems(
    [
      ...(entityReadout?.representativeEvidence ?? []),
      ...(summary.representativeEvidence ?? []),
    ],
    8,
  );
  const activityFrequencySummary = safeReviewItems(
    [
      ...(entityReadout?.activityFrequencySummary ?? []),
      ...(summary.activityFrequencySummary ?? []),
    ],
    4,
  );
  const topChannels = safeReviewItems([
    ...(entityReadout?.topChannels ?? []),
    ...(summary.topChannels ?? []),
  ]);
  const recentActivitySummary = safeReviewItems(
    [
      ...(entityReadout?.recentActivitySummary ?? []),
      ...(summary.recentActivitySummary ?? []),
    ],
    4,
  );
  const authoredVsMentionedSummary = safeReviewItems(
    [
      ...(entityReadout?.authoredVsMentionedSummary ?? []),
      ...(summary.authoredVsMentionedSummary ?? []),
    ],
    4,
  );
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
  const allSignals = safeReviewItems(
    [
      ...actionableBrief.keyFindings,
      ...actionableBrief.namedTopics,
      ...actionableBrief.bnlInteractionPatterns,
      ...actionableBrief.platformSignals,
      ...actionableBrief.musicSignals,
      ...actionableBrief.communityActivity,
      ...(summary.knownContext ?? []),
      ...(summary.usefulEvidence ?? []),
      ...(summary.privateRelationshipContext ?? []),
      ...(summary.conversationHighlights ?? []),
      ...(summary.topicBreakdown ?? []),
      ...(summary.bnlInteractionSignals ?? []),
      ...(summary.musicSignals ?? []),
      ...(summary.communitySignals ?? []),
      ...(summary.sourceCoverage ?? []),
      ...(summary.evidenceDetails ?? []),
      ...(summary.representativeEvidence ?? []),
      ...recommendations.flatMap((recommendation) => [
        ...(recommendation.knownContext ?? []),
        ...(recommendation.usefulEvidence ?? []),
        ...(recommendation.relationshipSignals ?? []),
        ...(recommendation.conversationHighlights ?? []),
        ...(recommendation.topicBreakdown ?? []),
        ...(recommendation.bnlInteractionSignals ?? []),
        ...(recommendation.musicSignals ?? []),
        ...(recommendation.communitySignals ?? []),
        ...(recommendation.sourceCoverage ?? []),
        ...(recommendation.evidenceDetails ?? []),
        ...(recommendation.representativeEvidence ?? []),
      ]),
      ...(sourceFileNotes ?? []).map((note) =>
        typeof note === "string" ? note : note?.text,
      ),
    ],
    60,
  );
  const linkEvidence = linkPlatformCategories(allSignals);
  const linkEvidenceWithoutDuplicateCaution = linkEvidence.filter(
    (item) => !/^Derived duplicate link references suppressed:/i.test(item),
  );
  const duplicateSuppression = linkEvidence.find((item) =>
    /^Derived duplicate link references suppressed:/i.test(item),
  );
  const evidenceReceipts = buildEvidenceReceipts([
    currentRead,
    summary.whyTracked,
    ...allSignals,
    ...publicSafePossibilities,
    ...publicUseCandidates,
    ...representativeEvidence,
    ...activityFrequencySummary,
    ...topChannels,
    ...recentActivitySummary,
    ...authoredVsMentionedSummary,
    ...sourceAuthority,
    ...actionableBrief.supportingEvidence,
    ...actionableBrief.reviewOnlyCautions,
  ]);
  const whatBnlKnows = [
    {
      title: "Role Signals",
      items: takeWithoutRepeats(
        [currentRead, summary.whyTracked, ...actionableBrief.keyFindings],
        visibleFacts,
        4,
      ),
      empty: "No clear role signal has been extracted yet.",
      receiptGroup: "role" as EvidenceReceiptGroup,
    },
    {
      title: "Relationships / People / Projects",
      items: takeWithoutRepeats(
        [
          ...(summary.privateRelationshipContext ?? []),
          ...(entityReadout?.relationshipSignals ?? []),
          ...actionableBrief.namedTopics,
        ],
        visibleFacts,
        4,
      ),
      empty:
        "No relationship, people, or project signal has been separated yet.",
      receiptGroup: "relationship" as EvidenceReceiptGroup,
    },
    {
      title: "BNL Interaction",
      items: takeWithoutRepeats(
        actionableBrief.bnlInteractionPatterns,
        visibleFacts,
        4,
      ),
      empty: "No BNL interaction pattern has been extracted yet.",
      receiptGroup: "bnl" as EvidenceReceiptGroup,
    },
    {
      title: "Creative / Music / Platform Signals",
      items: takeWithoutRepeats(
        [
          ...actionableBrief.musicSignals,
          ...actionableBrief.platformSignals,
          ...linkEvidenceWithoutDuplicateCaution,
        ],
        visibleFacts,
        6,
      ),
      empty:
        "No creative, music, platform, or link signal has been extracted yet.",
      receiptGroup: "creative" as EvidenceReceiptGroup,
    },
    {
      title: "Event / Contest / Community Signals",
      items: takeWithoutRepeats(
        [
          ...actionableBrief.communityActivity,
          ...(summary.communitySignals ?? []),
          ...(entityReadout?.communitySignals ?? []),
          ...observedChannels,
          ...topChannels,
        ],
        visibleFacts,
        6,
      ),
      empty:
        "No event, contest, channel, or community signal has been separated yet.",
      receiptGroup: "eventCommunity" as EvidenceReceiptGroup,
    },
    {
      title: "Activity & Themes",
      items: takeWithoutRepeats(
        [
          ...conversationHighlights,
          ...activityFrequencySummary,
          ...recentActivitySummary,
          ...authoredVsMentionedSummary,
        ],
        visibleFacts,
        6,
      ),
      empty: "No conversation theme or activity rhythm has been extracted yet.",
      receiptGroup: "activity" as EvidenceReceiptGroup,
    },
  ];
  const queueStatus =
    entityReadout?.queueSubmissionStatus ?? summary.queueSubmissionStatus;
  const queueBridgeWarning =
    queueStatus === "not_connected" || !queueStatus
      ? "Queue/submission history is not connected yet. Do not claim submissions, play counts, source type, payment, or Priority history from Discord/platform links."
      : undefined;
  const actionItems = markVisible(
    [
      ...missingChecklist([...missingInfo, ...actionableBrief.missingInfo]),
      ...actionableBrief.recommendedNextActions,
      queueBridgeWarning,
      "Public-safe checklist: confirm public link, public role, and public display name before drafting.",
    ].filter(Boolean) as string[],
    visibleFacts,
  );
  const evidenceSeen = new Set<string>();
  const strongEvidence = takeWithoutRepeats(
    [
      ...(summary.confirmedStrong ?? []),
      ...(summary.usefulEvidence ?? []),
      ...actionableBrief.keyFindings,
    ],
    evidenceSeen,
    5,
  );
  const publicSafeEvidence = takeWithoutRepeats(
    [
      ...publicSafePossibilities,
      ...publicUseCandidates,
      ...(summary.publicUseCandidates ?? []),
    ],
    evidenceSeen,
    5,
  );
  const reviewOnlyEvidence = takeWithoutRepeats(
    [
      ...actionableBrief.reviewOnlyCautions,
      ...(summary.reviewOnlyEvidence ?? []),
      ...(summary.privateOnlyNotes ?? []),
      ...(summary.notPublicYet ?? []),
    ],
    evidenceSeen,
    5,
  );
  const sourceCoverageEvidence = takeWithoutRepeats(
    [
      ...(summary.sourceCoverage ?? []),
      ...sourceAuthority,
      ...actionableBrief.supportingEvidence.filter((item) =>
        /^Source coverage:/i.test(item),
      ),
    ],
    evidenceSeen,
    5,
  );
  const channelActivityEvidence = takeWithoutRepeats(
    [
      ...observedChannels,
      ...topChannels,
      ...representativeEvidence,
      ...conversationHighlights,
    ],
    evidenceSeen,
    5,
  );
  const linkPlatformEvidence = takeWithoutRepeats(
    [
      ...linkEvidence,
      ...actionableBrief.platformSignals,
      ...actionableBrief.musicSignals,
    ],
    evidenceSeen,
    8,
  );
  const diagnostics = safeReviewItems(
    [
      duplicateSuppression,
      ...(summary.sourceCoverage ?? []).map(
        (item) => `Source counts / coverage: ${item}`,
      ),
      ...(summary.evidenceDetails ?? []).map(
        (item) => `Validation or evidence detail: ${item}`,
      ),
      ...(summary.topicBreakdown ?? [])
        .filter(isClassificationText)
        .map((item) => `Legacy recurring-subject diagnostic: ${item}`),
      ...(summary.topTopicDetails ?? [])
        .filter(isClassificationText)
        .map((item) => `Legacy recurring-subject diagnostic: ${item}`),
      ...recommendations.flatMap((recommendation) => [
        recommendation.ingestSource
          ? `Site ingest metadata: ${recommendation.ingestSource}`
          : undefined,
        recommendation.ingestedAt
          ? `Site ingest metadata: ${recommendation.ingestedAt}`
          : undefined,
        recommendation[("raw" + "Provenance") as keyof typeof recommendation]
          ? "Raw provenance is present and intentionally hidden from normal review sections."
          : undefined,
      ]),
    ],
    12,
  );
  const snapshotItems = [
    ["Subject", subjectName ?? "Unknown subject"],
    ["Current lane / status", humanStatus(currentLane ?? summary.nextAction)],
    ["Last BNL refresh", formatSnapshotDate(summary.lastUpdatedAt)],
    [
      "Latest recommendation",
      formatSnapshotDate(latestRecommendationTimestamp),
    ],
    ["Public dossier match", humanStatus(summary.existingPublicDossier)],
    [
      "Source file target",
      humanStatus(sourceFileTargetStatus ?? summary.nextAction),
    ],
    ["Evidence depth", evidenceDepthLabel(summary.substanceLevel)],
    ["Public readiness", readinessLabel(summary.publicReadiness)],
    ["Identity certainty", identityCertaintyLabel(summary)],
    ["Source confidence:", sourceConfidenceLabel(entityReadout?.confidence)],
    [
      "Queue / submission",
      queueStatus === "not_connected" || !queueStatus
        ? "Not connected yet"
        : humanStatus(queueStatus),
    ],
    ["Main next action", recommendedAction],
  ];

  return (
    <section className="border border-accent/70 bg-surface p-5 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-accent mb-2">
            Entity Intelligence Review Console
          </p>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="mt-2 text-sm text-muted max-w-4xl">
            Review Snapshot → What BNL Knows → Action Items → Evidence →
            Notes/Identity → Diagnostics. Internal-only review surface; it does
            not publish, draft, merge identities, or create queue/payment
            behavior.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          <StatusBadge>Review-only</StatusBadge>
          <StatusBadge>Public-safe candidate labels stay separated</StatusBadge>
          <StatusBadge>
            Source:{" "}
            {entityReadout?.readoutSource === "structured"
              ? "Structured packet"
              : "Safe fallback"}
          </StatusBadge>
        </div>
      </div>

      <Section
        title="Review Snapshot"
        helper="Concise status view for deciding how to review this Source File."
      >
        <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {snapshotItems.map(([label, value]) => (
            <SnapshotItem key={label} label={label} value={value} />
          ))}
        </dl>
      </Section>

      <Section
        title="What BNL Knows"
        helper="Primary intelligence summary. Review-only material is labeled and is not public dossier copy."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {whatBnlKnows.map((group) => (
            <ActivityGroup
              key={group.title}
              title={group.title}
              items={group.items}
              empty={group.empty}
              receipts={evidenceReceipts[group.receiptGroup]}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Admin Action Items / Missing Info"
        tone="caution"
        helper="What needs to happen next before public copy, owner review, identity matching, or submission claims."
      >
        <SummaryList
          items={fallbackItems(
            actionItems,
            "No action item has been extracted yet; continue human review before public use.",
          )}
        />
      </Section>

      <Section
        title="Evidence by Category"
        helper="Why BNL thinks this. Evidence is grouped, deduped, and kept separate from raw diagnostics."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <ActivityGroup
            title="Strong Evidence"
            items={strongEvidence}
            empty="No strong evidence has been separated yet."
          />
          <ActivityGroup
            title="Public-safe Evidence"
            items={publicSafeEvidence}
            empty="No public-safe candidate evidence has been separated yet."
          />
          <ActivityGroup
            title="Review-only Evidence"
            items={reviewOnlyEvidence}
            empty="No review-only evidence has been separated yet."
          />
          <ActivityGroup
            title="Source Coverage"
            items={sourceCoverageEvidence}
            empty="No source coverage summary is available yet."
          />
          <ActivityGroup
            title="Channel / Activity Evidence"
            items={channelActivityEvidence}
            empty="No channel or activity evidence is available yet."
          />
          <ActivityGroup
            title="Music / Platform / Link Evidence"
            items={linkPlatformEvidence}
            empty="No link or platform evidence has been separated yet."
          />
        </div>
      </Section>

      <details className="border border-border/70 bg-background/20 p-3 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-foreground">
          Diagnostics — collapsed by default
        </summary>
        <p className="mt-3 text-xs uppercase tracking-widest text-accent">
          Diagnostics only. Not Source File claims.
        </p>
        <div className="mt-3">
          <SummaryList
            items={fallbackItems(
              diagnostics,
              "No secondary diagnostics are available for this readout.",
            )}
          />
        </div>
      </details>

      <p className="text-xs text-muted">
        Public-safe candidate, Review-only, Internal-only, Needs owner review,
        Not connected yet, and Source-blind / diagnostic-only material remain
        separated.
      </p>
    </section>
  );
}
