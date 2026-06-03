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
const genericTopicWords = new Set([
  "BNL",
  "BARCODE",
  "Radio",
  "Source",
  "File",
  "Dossier",
  "Automated",
  "Recurring",
  "Review",
  "Music",
  "Community",
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

function sourceNoteText(input: BriefInput) {
  return unique(
    (input.sourceFileNotes ?? []).map((note) =>
      typeof note === "string" ? note : note?.text,
    ),
    10,
  );
}

function isClassification(value: string) {
  return /automated topic|topic label|classified|classification|main evidence categor/i.test(value);
}

function isGenericReviewWarning(value: string) {
  return /owner review|required|missing display name|public identity not confirmed|more public-safe context needed/i.test(value);
}

function extractNamedTopicLabel(value: string, subjectName?: string) {
  const cleanValue = value.replace(/\s+/g, " ").trim();
  const explicit = cleanValue.match(/Recurring named topic\s*[:/—-]\s*([A-Z][\w'-]{1,40})/i);
  if (explicit?.[1]) return explicit[1];
  const slash = cleanValue.match(/Recurring named topic\s*\/\s*([A-Z][\w'-]{1,40})/i);
  if (slash?.[1]) return slash[1];
  const appears = cleanValue.match(/\b([A-Z][\w'-]{1,40})\s+appears\b/);
  if (appears?.[1]) return appears[1];
  const ongoing = cleanValue.match(/\b(?:returned to|mention|mentions|discuss(?:es|ion)|topic)\s+([A-Z][\w'-]{1,40})\b/i);
  if (ongoing?.[1]) return ongoing[1];
  const proper = cleanValue.match(/\b([A-Z][a-z][\w'-]{1,40})\b/);
  if (!proper?.[1]) return undefined;
  if (proper[1] === subjectName || genericTopicWords.has(proper[1])) return undefined;
  return proper[1];
}

function namedTopicItems(items: string[], subjectName?: string) {
  const topics = unique(
    items
      .filter((item) => /recurring named topic|named topic|\bappears\b|returned to/i.test(item))
      .map((item) => extractNamedTopicLabel(item, subjectName)),
    4,
  );
  return topics.map(
    (topic) => `${topic} appears in reviewed evidence connected to ${subjectName ?? "this source file"}. Review before public use.`,
  );
}

function platformItems(items: string[]) {
  const names = unique(
    items.flatMap((item) =>
      platformNames.filter((platform) => new RegExp(`\\b${platform}\\b`, "i").test(item)),
    ),
    4,
  );
  return names.map((name) => {
    if (/suno/i.test(name)) {
      return "Suno appears in reviewed evidence. Confirm through queue/submission data before claiming submitted songs.";
    }
    return `${name} appears in reviewed evidence. Confirm the platform context before using it in public copy.`;
  });
}

function bnlPatternItems(items: string[]) {
  const patterns = unique(items, 4);
  if (patterns.length) {
    return patterns.map((item) =>
      /BNL interaction pattern/i.test(item)
        ? item
        : `BNL interaction pattern: ${item}`,
    );
  }
  return [];
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
    ...sourceNoteText(input),
  ], 40);

  const namedTopics = namedTopicItems(allFactText, subjectName);
  const platformSignals = platformItems([...musicSignals, ...usefulEvidence, ...bestEvidence, ...sourceNoteText(input)]);
  const bnlInteractionPatterns = bnlPatternItems(bnlSignals);
  const communityActivity = communityItems(channels, communitySignals, subjectName);
  const queueSubmissionStatus = queueItems(
    input.entityReadout?.queueSubmissionStatus ?? input.summary?.queueSubmissionStatus,
    input.entityReadout?.queueSubmissionNote ?? input.summary?.queueSubmissionNote,
  );
  const musicSignalItems = unique(musicSignals, 4).map((item) => `Music/platform signal: ${item}`);
  const reviewOnlyCautions = unique([
    ...reviewOnly,
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
