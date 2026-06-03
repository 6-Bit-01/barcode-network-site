import type { DossierRecommendation } from "./dossier-workflow";
import type { DossierSourceFileSummary } from "./dossier-source-file-summary";
import { sanitizeDossierMeaningItems } from "./dossier-note-display";

export type DossierEntityActivityReadout = {
  currentRead: string;
  knownContext: string[];
  usefulEvidence: string[];
  relationshipSignals: string[];
  publicSafePossibilities: string[];
  privateOnlyNotes: string[];
  notPublicYet: string[];
  observedChannels: string[];
  conversationHighlights: string[];
  topicBreakdown: string[];
  bestEvidenceToReview: string[];
  bnlInteractionSignals: string[];
  musicSignals: string[];
  communitySignals: string[];
  sourceCoverage: string[];
  evidenceDetails: string[];
  publicUseCandidates: string[];
  reviewOnlyEvidence: string[];
  queueSubmissionStatus?: string;
  queueSubmissionNote?: string;
  missingInfo: string[];
  sourceAuthority: string[];
  recommendedAction: string;
  confidence?: string;
  readoutSource: "structured" | "fallback";
};

type ReadoutRecommendation = Pick<
  DossierRecommendation,
  | "subjectName"
  | "knownContext"
  | "usefulEvidence"
  | "relationshipSignals"
  | "publicSafePossibilities"
  | "privateOnlyNotes"
  | "notPublicYet"
  | "observedChannels"
  | "conversationHighlights"
  | "topicBreakdown"
  | "bestEvidenceToReview"
  | "bnlInteractionSignals"
  | "musicSignals"
  | "communitySignals"
  | "sourceCoverage"
  | "evidenceDetails"
  | "publicUseCandidates"
  | "reviewOnlyEvidence"
  | "queueSubmissionStatus"
  | "queueSubmissionNote"
  | "missingInfo"
  | "sourceAuthority"
  | "recommendedAction"
  | "suggestedAction"
  | "confidence"
>;

const defaultCurrentRead =
  "BNL has not attached a structured entity summary yet. Review the Source File Snapshot and add owner-reviewed context before public use.";

function cleanItems(items: Array<string | undefined | null>, limit = 6) {
  return sanitizeDossierMeaningItems(items, limit);
}

function cleanText(value?: string | null) {
  return cleanItems([value], 1)[0];
}

function unique(items: string[], limit = 6) {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const clean = item.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function recommendationHasStructuredReadout(
  recommendation: ReadoutRecommendation,
) {
  return Boolean(
    recommendation.knownContext?.length ||
      recommendation.usefulEvidence?.length ||
      recommendation.relationshipSignals?.length ||
      recommendation.publicSafePossibilities?.length ||
      recommendation.privateOnlyNotes?.length ||
      recommendation.notPublicYet?.length ||
      recommendation.observedChannels?.length ||
      recommendation.conversationHighlights?.length ||
      recommendation.topicBreakdown?.length ||
      recommendation.bestEvidenceToReview?.length ||
      recommendation.bnlInteractionSignals?.length ||
      recommendation.musicSignals?.length ||
      recommendation.communitySignals?.length ||
      recommendation.sourceCoverage?.length ||
      recommendation.evidenceDetails?.length ||
      recommendation.publicUseCandidates?.length ||
      recommendation.reviewOnlyEvidence?.length ||
      recommendation.queueSubmissionStatus ||
      recommendation.queueSubmissionNote ||
      recommendation.missingInfo?.length ||
      recommendation.sourceAuthority?.length ||
      recommendation.recommendedAction ||
      recommendation.confidence,
  );
}

function structuredReadoutFromRecommendations(
  recommendations: ReadoutRecommendation[],
  subjectName?: string,
): DossierEntityActivityReadout | null {
  const structuredRecommendations = recommendations.filter(
    recommendationHasStructuredReadout,
  );
  if (!structuredRecommendations.length) return null;

  const knownContext = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.knownContext ?? [],
    ),
  );
  const usefulEvidence = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.usefulEvidence ?? [],
    ),
  );
  const relationshipSignals = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.relationshipSignals ?? [],
    ),
  );
  const publicSafePossibilities = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.publicSafePossibilities ?? [],
    ),
  );
  const privateOnlyNotes = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.privateOnlyNotes ?? [],
    ),
  );
  const notPublicYet = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.notPublicYet ?? [],
    ),
  );

  const observedChannels = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.observedChannels ?? [],
    ),
  );
  const conversationHighlights = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.conversationHighlights ?? [],
    ),
  );
  const topicBreakdown = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.topicBreakdown ?? [],
    ),
  );
  const bestEvidenceToReview = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.bestEvidenceToReview ?? [],
    ),
  );
  const bnlInteractionSignals = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.bnlInteractionSignals ?? [],
    ),
  );
  const musicSignals = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.musicSignals ?? [],
    ),
  );
  const communitySignals = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.communitySignals ?? [],
    ),
  );
  const sourceCoverage = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.sourceCoverage ?? [],
    ),
  );
  const evidenceDetails = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.evidenceDetails ?? [],
    ),
  );
  const publicUseCandidates = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.publicUseCandidates ?? [],
    ),
  );
  const reviewOnlyEvidence = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.reviewOnlyEvidence ?? [],
    ),
  );
  const queueRecommendation = structuredRecommendations.find(
    (recommendation) =>
      recommendation.queueSubmissionStatus || recommendation.queueSubmissionNote,
  );
  const missingInfo = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.missingInfo ?? [],
    ),
  );
  const sourceAuthority = cleanItems(
    structuredRecommendations.flatMap(
      (recommendation) => recommendation.sourceAuthority ?? [],
    ),
    5,
  );
  const confidence = unique(
    structuredRecommendations
      .map((recommendation) => recommendation.confidence)
      .filter(Boolean)
      .map((item) => String(item)),
    2,
  ).join(", ");
  const recommendedAction = cleanText(
    structuredRecommendations.find((recommendation) => recommendation.recommendedAction)
      ?.recommendedAction,
  );
  const subject = subjectName ?? structuredRecommendations[0]?.subjectName;

  return {
    currentRead:
      knownContext[0] ??
      recommendedAction ??
      `BNL supplied a structured entity activity readout${subject ? ` for ${subject}` : ""}. Treat it as admin review context, not public copy.`,
    knownContext,
    usefulEvidence,
    relationshipSignals,
    publicSafePossibilities,
    privateOnlyNotes,
    notPublicYet,
    observedChannels,
    conversationHighlights,
    topicBreakdown,
    bestEvidenceToReview,
    bnlInteractionSignals,
    musicSignals,
    communitySignals,
    sourceCoverage,
    evidenceDetails,
    publicUseCandidates,
    reviewOnlyEvidence,
    queueSubmissionStatus: queueRecommendation?.queueSubmissionStatus,
    queueSubmissionNote: cleanText(queueRecommendation?.queueSubmissionNote),
    missingInfo,
    sourceAuthority,
    recommendedAction:
      recommendedAction ??
      "Owner review needed before public wording, publishing, linking, or merging.",
    confidence: confidence || undefined,
    readoutSource: "structured",
  };
}

export function createDossierEntityActivityReadoutFromSourceFile({
  summary,
  recommendations,
  subjectName,
}: {
  summary?: DossierSourceFileSummary | null;
  recommendations?: ReadoutRecommendation[];
  subjectName?: string;
}): DossierEntityActivityReadout {
  const structuredReadout = structuredReadoutFromRecommendations(
    recommendations ?? [],
    subjectName,
  );
  if (structuredReadout) return structuredReadout;

  return {
    currentRead: cleanText(summary?.currentRead) ?? defaultCurrentRead,
    knownContext: cleanItems(summary?.knownContext ?? []),
    usefulEvidence: cleanItems(summary?.usefulEvidence ?? []),
    relationshipSignals: cleanItems(summary?.privateRelationshipContext ?? []),
    publicSafePossibilities: cleanItems(summary?.publicSafePossibilities ?? []),
    privateOnlyNotes: cleanItems(summary?.privateOnlyNotes ?? []),
    notPublicYet: cleanItems(summary?.notPublicYet ?? []),
    observedChannels: cleanItems(summary?.observedChannels ?? []),
    conversationHighlights: cleanItems(summary?.conversationHighlights ?? []),
    topicBreakdown: cleanItems(summary?.topicBreakdown ?? []),
    bestEvidenceToReview: cleanItems(summary?.bestEvidenceToReview ?? []),
    bnlInteractionSignals: cleanItems(summary?.bnlInteractionSignals ?? []),
    musicSignals: cleanItems(summary?.musicSignals ?? []),
    communitySignals: cleanItems(summary?.communitySignals ?? []),
    sourceCoverage: cleanItems(summary?.sourceCoverage ?? []),
    evidenceDetails: cleanItems(summary?.evidenceDetails ?? []),
    publicUseCandidates: cleanItems(summary?.publicUseCandidates ?? []),
    reviewOnlyEvidence: cleanItems(summary?.reviewOnlyEvidence ?? []),
    queueSubmissionStatus: summary?.queueSubmissionStatus,
    queueSubmissionNote: cleanText(summary?.queueSubmissionNote),
    missingInfo: cleanItems(summary?.missingInfo ?? []),
    sourceAuthority: cleanItems(summary?.sourceAuthority ?? [], 5),
    recommendedAction:
      cleanText(summary?.recommendedNextAction) ??
      "Owner review needed before public wording.",
    readoutSource: "fallback",
  };
}

export function createDossierEntityActivityReadoutFromRecommendation(
  recommendation: ReadoutRecommendation,
): DossierEntityActivityReadout {
  return (
    structuredReadoutFromRecommendations([recommendation], recommendation.subjectName) ??
    {
      currentRead: defaultCurrentRead,
      knownContext: [],
      usefulEvidence: [],
      relationshipSignals: [],
      publicSafePossibilities: [],
      privateOnlyNotes: [],
      notPublicYet: [],
      observedChannels: [],
      conversationHighlights: [],
      topicBreakdown: [],
      bestEvidenceToReview: [],
      bnlInteractionSignals: [],
      musicSignals: [],
      communitySignals: [],
      sourceCoverage: [],
      evidenceDetails: [],
      publicUseCandidates: [],
      reviewOnlyEvidence: [],
      missingInfo: [],
      sourceAuthority: [],
      recommendedAction:
        cleanText(recommendation.suggestedAction) ??
        "Owner review needed before public wording.",
      confidence: recommendation.confidence,
      readoutSource: "fallback",
    }
  );
}
