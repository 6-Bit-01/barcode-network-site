import type { DossierEntityActivityReadout } from "./dossier-entity-activity-readout";
import type { DossierRecommendation } from "./dossier-workflow";
import type { DossierSourceFileSummary } from "./dossier-source-file-summary";
import { containsDossierBackendJunk } from "./dossier-note-display";

export type SourceFileActionableBrief = {
  keyFindings: string[];
  namedTopics: string[];
  platformSignals: string[];
  bnlInteractionPatterns: string[];
  communityActivity: string[];
  musicSignals: string[];
  queueSubmissionStatus: string[];
  reviewOnlyCautions: string[];
  missingInfo: string[];
  recommendedNextActions: string[];
  supportingEvidence: string[];
};

type BriefInput = {
  entityReadout?: DossierEntityActivityReadout | null;
  summary?: DossierSourceFileSummary | null;
  recommendations?: Array<Partial<DossierRecommendation>>;
  sourceFileNotes?: Array<string | { text?: string | null } | null | undefined>;
  subjectName?: string;
};

const platformNames = ["Suno", "Udio", "Ableton", "Bandcamp", "SoundCloud", "Spotify", "YouTube", "Discord"];
const blockedTopicLabels = new Set([
  "Admin",
  "Activity",
  "Automated",
  "BARCODE",
  "BNL",
  "Community",
  "Confirm",
  "Context",
  "Dossier",
  "Evidence",
  "File",
  "History",
  "Music",
  "Owner",
  "Pattern",
  "Platform",
  "Possible",
  "Private",
  "Public",
  "Queue",
  "Radio",
  "Recurring",
  "Review",
  "Reviewed",
  "Signal",
  "Source",
  "Submission",
  "This",
  "Tool",
]);

function clean(items: Array<string | undefined | null>, limit = 6) {
  const output: string[] = [];
  for (const item of items) {
    const cleanItem = item?.replace(/\s+/g, " ").trim();
    if (!cleanItem) continue;
    if (/\[object Object\]|rawProvenance|backendTraceId|source lane mapping|EDGE_SESSION/i.test(cleanItem)) continue;
    if (containsDossierBackendJunk(cleanItem)) continue;
    output.push(cleanItem);
    if (output.length >= limit) break;
  }
  return output;
}

function unique(items: Array<string | undefined | null>, limit = 6) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of clean(items, limit * 3)) {
    const key = item.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function valuesFrom(
  input: BriefInput,
  readoutKey: keyof DossierEntityActivityReadout,
  summaryKey: keyof DossierSourceFileSummary,
): string[] {
  const readoutValue = input.entityReadout?.[readoutKey];
  const summaryValue = input.summary?.[summaryKey];
  return unique([
    ...(Array.isArray(readoutValue) ? readoutValue : []),
    ...(Array.isArray(summaryValue) ? summaryValue : []),
    ...(input.recommendations ?? []).flatMap((recommendation) => {
      const value = recommendation[readoutKey as keyof DossierRecommendation];
      return Array.isArray(value) ? value : [];
    }),
  ], 10);
}

function textLines(items: Array<string | undefined | null>) {
  return unique(
    items.flatMap((item) =>
      (item ?? "")
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
    40,
  );
}

function sourceNoteText(input: BriefInput) {
  return textLines(
    (input.sourceFileNotes ?? []).map((note) =>
      typeof note === "string" ? note : note?.text,
    ),
  );
}

function recommendationScalarText(input: BriefInput) {
  return textLines(
    (input.recommendations ?? []).flatMap((recommendation) => [
      recommendation.reason,
      recommendation.evidenceSummary,
      recommendation.queueSubmissionNote,
      recommendation.recommendedAction,
      ...(recommendation.sourceAuthority ?? []),
      ...(recommendation.publicSafetyNotes ?? []),
      ...(recommendation.missingInfo ?? []),
    ]),
  );
}

function isClassification(value: string) {
  return /automated topic|topic label|classified|classification|main evidence categor/i.test(value);
}

function isGenericReviewWarning(value: string) {
  return /owner review|required|missing display name|public identity not confirmed|more public-safe context needed/i.test(value);
}

function cleanTopicLabel(value?: string, subjectName?: string) {
  const label = value
    ?.replace(/[.?!,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) return undefined;
  if (!/^[A-Z][\w'-]{1,40}$/.test(label)) return undefined;
  if (label === subjectName || blockedTopicLabels.has(label)) return undefined;
  return label;
}

function extractNamedTopicLabel(value: string, subjectName?: string) {
  const cleanValue = value.replace(/\s+/g, " ").trim();
  const patterns = [
    /\bRecurring named topic\s*[:/—-]\s*([A-Z][\w'-]{1,40})\b/i,
    /\bReview-only recurring topic\s*[:/—-]\s*([A-Z][\w'-]{1,40})\b/i,
    /\btopic\s*:\s*([A-Z][\w'-]{1,40})\b/i,
    /\b([A-Z][\w'-]{1,40})\s+appears in reviewed evidence\b/i,
  ];
  for (const pattern of patterns) {
    const match = cleanValue.match(pattern);
    const label = cleanTopicLabel(match?.[1], subjectName);
    if (label) return label;
  }
  return undefined;
}

function namedTopicItems(items: string[], subjectName?: string) {
  const topics = unique(
    items.map((item) => extractNamedTopicLabel(item, subjectName)),
    4,
  );
  return topics.map(
    (topic) => `${topic} appears in reviewed evidence connected to ${subjectName ?? "this source file"}. Review before public use.`,
  );
}

function platformItems(items: string[], subjectName?: string) {
  const names = unique(
    items.flatMap((item) =>
      platformNames.filter((platform) => new RegExp(`\\b${platform}\\b`, "i").test(item)),
    ),
    4,
  );
  return names.map((name) => {
    if (/suno/i.test(name)) {
      return `Suno appears in reviewed evidence connected to ${subjectName ?? "this source file"}. Confirm through queue/submission data before claiming submitted songs or source type.`;
    }
    return `${name} appears in reviewed evidence. Confirm the platform context before using it in public copy.`;
  });
}

function bnlPatternItems(items: string[], subjectName?: string) {
  const patterns = unique(items, 4);
  if (!patterns.length) return [];
  if (patterns.some((item) => /repeated|recurring|exchange|conversation/i.test(item))) {
    return [
      `${subjectName ?? "This source"} has repeated BNL interaction evidence in approved review context. Review the evidence before using this publicly.`,
    ];
  }
  return [
    `${subjectName ?? "This source"} appears in exchanges involving BNL. Review the evidence before using this publicly.`,
  ];
}

function communityItems(channels: string[], communitySignals: string[], subjectName?: string) {
  const channelText = unique(channels, 4).join("; ");
  const signalText = unique(communitySignals, 2).join("; ");
  return unique([
    channelText
      ? `${subjectName ?? "This source"} appears in approved public/community context, especially ${channelText}.`
      : undefined,
    signalText ? `Community activity: ${signalText}` : undefined,
  ], 4);
}

function queueItems(status?: string, note?: string) {
  const items = [
    status === "not_connected"
      ? "Queue/submission history is not connected yet."
      : status
        ? `Queue/submission status: ${status.replace(/_/g, " ")}.`
        : "Queue/submission history is not connected yet.",
    note,
    "This evidence does not confirm submitted song counts, play history, source type, or Priority/payment history.",
  ];
  return unique(items, 3);
}

export function buildSourceFileActionableBrief(input: BriefInput): SourceFileActionableBrief {
  const subjectName = input.subjectName;
  const knownContext = valuesFrom(input, "knownContext", "knownContext");
  const usefulEvidence = valuesFrom(input, "usefulEvidence", "usefulEvidence");
  const bestEvidence = valuesFrom(input, "bestEvidenceToReview", "bestEvidenceToReview");
  const topicBreakdown = valuesFrom(input, "topicBreakdown", "topicBreakdown");
  const topTopicDetails = valuesFrom(input, "topTopicDetails", "topTopicDetails");
  const musicSignals = valuesFrom(input, "musicSignals", "musicSignals");
  const bnlSignals = valuesFrom(input, "bnlInteractionSignals", "bnlInteractionSignals");
  const communitySignals = valuesFrom(input, "communitySignals", "communitySignals");
  const channels = valuesFrom(input, "topChannels", "topChannels").concat(
    valuesFrom(input, "observedChannels", "observedChannels"),
  );
  const representativeEvidence = valuesFrom(input, "representativeEvidence", "representativeEvidence");
  const evidenceDetails = valuesFrom(input, "evidenceDetails", "evidenceDetails");
  const sourceCoverage = valuesFrom(input, "sourceCoverage", "sourceCoverage");
  const noteText = sourceNoteText(input);
  const recommendationText = recommendationScalarText(input);
  const enrichmentText = unique([...noteText, ...recommendationText], 40);
  const reviewOnly = valuesFrom(input, "reviewOnlyEvidence", "reviewOnlyEvidence").concat(
    valuesFrom(input, "relationshipSignals", "privateRelationshipContext"),
    valuesFrom(input, "privateOnlyNotes", "privateOnlyNotes"),
    valuesFrom(input, "notPublicYet", "notPublicYet"),
  );
  const allFactText = unique([
    ...knownContext,
    ...usefulEvidence,
    ...bestEvidence,
    ...topicBreakdown,
    ...topTopicDetails,
    ...musicSignals,
    ...bnlSignals,
    ...communitySignals,
    ...channels,
    ...representativeEvidence,
    ...enrichmentText,
  ], 40);

  const namedTopics = namedTopicItems(allFactText, subjectName);
  const platformSignals = platformItems([...musicSignals, ...usefulEvidence, ...bestEvidence, ...enrichmentText], subjectName);
  const bnlInteractionPatterns = bnlPatternItems(
    unique([
      ...bnlSignals,
      ...enrichmentText.filter((item) => /BNL interaction pattern|repeated .*BNL|BNL conversation|exchanges involving BNL/i.test(item)),
    ], 6),
    subjectName,
  );
  const communityActivity = communityItems(channels, communitySignals, subjectName);
  const queueSubmissionStatus = unique([
    ...queueItems(
      input.entityReadout?.queueSubmissionStatus ?? input.summary?.queueSubmissionStatus,
      input.entityReadout?.queueSubmissionNote ?? input.summary?.queueSubmissionNote,
    ),
    ...enrichmentText.filter((item) => /Queue\/submission history is not connected yet|source-file memory cannot confirm submitted songs|cannot confirm submitted songs/i.test(item)),
  ], 4);
  const musicSignalItems = unique(musicSignals, 4).map((item) => `Music/platform signal: ${item}`);
  const reviewOnlyCautions = unique([
    ...reviewOnly,
    ...enrichmentText.filter((item) => /review-only|internal context|Reception and co-participant analysis is not available/i.test(item)),
    "Reception and co-participant analysis is not available yet.",
  ], 6);
  const missingInfo = unique([
    ...valuesFrom(input, "missingInfo", "missingInfo"),
    "Confirm public-safe display name.",
    "Confirm public role/description.",
    "Add public links.",
    "Connect queue/submission identity when that bridge exists.",
  ], 8);
  const recommendedNextActions = unique([
    input.entityReadout?.recommendedAction,
    input.summary?.recommendedNextAction,
    ...(input.recommendations ?? []).map((recommendation) => recommendation.recommendedAction),
    "Do not publish, merge identities, infer submissions, or update public dossier copy until owner/admin review is complete.",
  ], 4);
  const supportingEvidence = unique([
    ...sourceCoverage.map((item) => `Source coverage: ${item}`),
    ...evidenceDetails.map((item) => `Evidence detail: ${item}`),
    ...topicBreakdown.filter(isClassification).map((item) => `Supporting classification: ${item}`),
    ...topTopicDetails.filter(isClassification).map((item) => `Supporting classification: ${item}`),
    ...representativeEvidence.filter((item) => !isGenericReviewWarning(item)).map((item) => `Supporting evidence: ${item}`),
    ...enrichmentText.filter((item) => /Possible music\/submission-related language|source-file memory cannot confirm submitted songs/i.test(item)),
    ...bestEvidence.filter((item) => !namedTopics.some((topic) => topic.includes(item))),
  ], 10);

  const keyFindings = unique([
    ...namedTopics,
    ...bnlInteractionPatterns,
    ...platformSignals,
    ...musicSignalItems,
    ...communityActivity,
    queueSubmissionStatus[0]
      ? `${queueSubmissionStatus[0]} Do not claim submitted song counts, played tracks, source type, or Priority/payment history.`
      : undefined,
    input.summary?.publicReadiness && input.summary.publicReadiness !== "owner_approved"
      ? "Public readiness remains limited; owner/admin review is required before public wording changes."
      : undefined,
    namedTopics.length || bnlInteractionPatterns.length || platformSignals.length || communityActivity.length
      ? undefined
      : knownContext[0],
  ], 7);

  return {
    keyFindings,
    namedTopics,
    platformSignals,
    bnlInteractionPatterns,
    communityActivity,
    musicSignals: musicSignalItems,
    queueSubmissionStatus,
    reviewOnlyCautions,
    missingInfo,
    recommendedNextActions,
    supportingEvidence,
  };
}
