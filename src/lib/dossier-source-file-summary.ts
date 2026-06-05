import type {
  DossierCandidate,
  DossierDraft,
  DossierRecommendation,
  DossierSourceFileRefreshRequest,
} from "./dossier-workflow";
import { normalizeDossierSubjectName } from "./dossier-workflow";
import {
  containsDossierBackendJunk,
  hasDossierMeaningfulPattern,
  sanitizeDossierMeaningItems,
} from "./dossier-note-display";
import {
  isRawSourceMemoryDebugText,
  sanitizeMeaningFirstItems,
  sourceFileEvidenceClusterItems,
  sourceFileReasonMeaning,
  sourceFileWhyNowMeaning,
} from "./dossier-source-memory-meaning";

export type DossierSourceFileSubstanceLevel =
  | "thin"
  | "partial"
  | "useful"
  | "strong";

export type DossierSourceFilePublicReadiness =
  | "not_ready"
  | "needs_review"
  | "draftable"
  | "owner_approved";

export type DossierSourceFileNextAction =
  | "archive"
  | "enrich"
  | "attach_to_existing_dossier"
  | "draft_public_dossier"
  | "owner_review";

export type DossierSourceFileSummary = {
  currentRead: string;
  knownContext: string[];
  whyTracked: string;
  usefulEvidence: string[];
  patterns: string[];
  confirmedStrong: string[];
  claimedNeedsReview: string[];
  privateRelationshipContext: string[];
  publicSafePossibilities: string[];
  privateOnlyNotes: string[];
  uncertainties: string[];
  missingInfo: string[];
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
  representativeEvidence: string[];
  activityFrequencySummary: string[];
  topChannels: string[];
  topTopicDetails: string[];
  recentActivitySummary: string[];
  authoredVsMentionedSummary: string[];
  publicUseCandidates: string[];
  reviewOnlyEvidence: string[];
  queueSubmissionStatus?: string;
  queueSubmissionNote?: string;
  sourceAuthority: string[];
  recommendedNextAction: string;
  substanceLevel: DossierSourceFileSubstanceLevel;
  publicReadiness: DossierSourceFilePublicReadiness;
  existingPublicDossier: "yes" | "no" | "linked_update_target";
  nextAction: DossierSourceFileNextAction;
  lastUpdatedAt: string;
  summarySource: "operator" | "structured" | "derived" | "thin";
};

type SummaryInput = {
  candidate: DossierCandidate;
  drafts?: DossierDraft[];
  recommendations?: DossierRecommendation[];
};

const activeDraftStatuses = new Set<DossierDraft["status"]>([
  "draft",
  "owner_changes_requested",
  "ready_for_owner_review",
]);

function unique(items: Array<string | undefined | null>, limit = 4): string[] {
  return sanitizeDossierMeaningItems(items, limit);
}

function cleanOperatorSummaryValue(value?: string | null): string | undefined {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (containsDossierBackendJunk(clean) || isRawSourceMemoryDebugText(clean))
    return undefined;
  return clean;
}

function trustedOperatorSummaryItems(
  items: Array<string | undefined | null>,
  limit = 4,
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = cleanOperatorSummaryValue(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

export const DOSSIER_THIN_FILE_WARNING =
  "This file is still thin. This source file only confirms that BNL found internal references. It does not yet contain enough human-usable context to draft from.";

export const DOSSIER_NO_MEANINGFUL_PATTERN =
  "No meaningful pattern has been extracted yet.";

function hasMeaningfulText(value?: string) {
  return sanitizeDossierMeaningItems([value], 1).length > 0;
}

function noteIsUseful(
  note: NonNullable<DossierCandidate["sourceFileNotes"]>[number],
) {
  return (
    (note.publicSafe === true ||
      note.source === "admin_manual" ||
      note.source === "owner_manual") &&
    hasMeaningfulText(note.text)
  );
}

function substanceScore({
  candidate,
  recommendations = [],
}: SummaryInput): number {
  let score = 0;
  if (hasMeaningfulText(candidate.reason)) score += 1;
  if (hasMeaningfulText(candidate.whyNow)) score += 1;
  if (hasMeaningfulText(candidate.evidenceSummary)) score += 1;
  score += Math.min(candidate.knownFacts?.length ?? 0, 3);
  score += Math.min(candidate.evidenceItems?.length ?? 0, 3);
  score += Math.min(
    (candidate.sourceFileNotes ?? []).filter(noteIsUseful).length,
    3,
  );
  score += Math.min(
    recommendations.filter(
      (recommendation) =>
        hasMeaningfulText(recommendation.reason) ||
        hasMeaningfulText(recommendation.evidenceSummary),
    ).length,
    3,
  );
  return score;
}

function substanceLevel(input: SummaryInput): DossierSourceFileSubstanceLevel {
  const score = substanceScore(input);
  if (score >= 10) return "strong";
  if (score >= 6) return "useful";
  if (score >= 3) return "partial";
  return "thin";
}

function labelLevel(level: DossierSourceFileSubstanceLevel) {
  return level[0].toUpperCase() + level.slice(1);
}

function publicReadiness(
  level: DossierSourceFileSubstanceLevel,
  drafts: DossierDraft[] = [],
): DossierSourceFilePublicReadiness {
  if (drafts.some((draft) => draft.status === "owner_approved")) {
    return "owner_approved";
  }
  if (drafts.some((draft) => draft.status === "ready_for_owner_review")) {
    return "draftable";
  }
  if (level === "useful" || level === "strong") return "needs_review";
  return "not_ready";
}

function nextAction(input: {
  candidate: DossierCandidate;
  drafts?: DossierDraft[];
  level: DossierSourceFileSubstanceLevel;
  readiness: DossierSourceFilePublicReadiness;
}): DossierSourceFileNextAction {
  const { candidate, drafts = [], level, readiness } = input;
  if (candidate.status === "archived" || candidate.status === "denied") {
    return "archive";
  }
  if (
    candidate.existingDossierMatch ||
    candidate.status === "existing_dossier_update"
  ) {
    return "attach_to_existing_dossier";
  }
  if (
    readiness === "owner_approved" ||
    drafts.some((draft) => draft.status === "ready_for_owner_review")
  ) {
    return "owner_review";
  }
  if (level === "useful" || level === "strong") return "draft_public_dossier";
  return "enrich";
}

function nextActionCopy(action: DossierSourceFileNextAction) {
  if (action === "archive")
    return "Archive or keep closed unless a lead asks for more review.";
  if (action === "attach_to_existing_dossier")
    return "Review the new context and attach only useful, public-safe updates to the linked public dossier later.";
  if (action === "draft_public_dossier")
    return "Review the evidence, separate claims from confirmed facts, then draft a public dossier only from approved material.";
  if (action === "owner_review")
    return "Send the reviewed draft or update notes through owner review before anything public changes.";
  return "Add real context: repeated appearances, channel notes, public-safe facts, missing history, and owner/admin review notes.";
}

function recommendationTimestamp(recommendation: DossierRecommendation) {
  return (
    recommendation.ingestedAt ??
    recommendation.updatedAt ??
    recommendation.createdAt ??
    ""
  );
}

function sortRecommendationsNewestFirst(
  recommendations: DossierRecommendation[],
): DossierRecommendation[] {
  return [...recommendations].sort((a, b) => {
    const timestampComparison = recommendationTimestamp(b).localeCompare(
      recommendationTimestamp(a),
    );
    if (timestampComparison !== 0) return timestampComparison;
    return b.id.localeCompare(a.id);
  });
}

function isBnlSourceFileEnrichment(recommendation: DossierRecommendation) {
  return recommendation.ingestSource === "bnl_source_file_enrichment";
}

function isRecommendationRelevantToCandidate(input: {
  recommendation: DossierRecommendation;
  candidate: DossierCandidate;
}) {
  const { recommendation, candidate } = input;
  if (recommendation.targetCandidateId) {
    return recommendation.targetCandidateId === candidate.id;
  }
  return (
    normalizeDossierSubjectName(
      recommendation.subjectKey || recommendation.subjectName,
    ) === normalizeDossierSubjectName(candidate.name)
  );
}

function latestCompletedRefreshRequest(input: {
  candidate: DossierCandidate;
  refreshRequests?: DossierSourceFileRefreshRequest[];
}) {
  const candidateSubjectKey = normalizeDossierSubjectName(input.candidate.name);
  return (input.refreshRequests ?? [])
    .filter(
      (request) =>
        request.status === "completed" &&
        (request.candidateId === input.candidate.id ||
          request.normalizedSubjectKey === candidateSubjectKey),
    )
    .sort((a, b) =>
      (b.completedAt ?? b.updatedAt).localeCompare(
        a.completedAt ?? a.updatedAt,
      ),
    )[0];
}

export function selectDossierSourceFileDisplayRecommendations(input: {
  candidate: DossierCandidate;
  recommendations?: DossierRecommendation[];
  refreshRequests?: DossierSourceFileRefreshRequest[];
}): DossierRecommendation[] {
  const recommendations = input.recommendations ?? [];
  const relevantRecommendations = recommendations.filter((recommendation) =>
    isRecommendationRelevantToCandidate({
      recommendation,
      candidate: input.candidate,
    }),
  );
  const completedRefresh = latestCompletedRefreshRequest({
    candidate: input.candidate,
    refreshRequests: input.refreshRequests,
  });
  const completedRefreshRecommendation =
    completedRefresh?.completedByRecommendationId
      ? relevantRecommendations.find(
          (recommendation) =>
            recommendation.id ===
              completedRefresh.completedByRecommendationId &&
            isBnlSourceFileEnrichment(recommendation),
        )
      : undefined;
  const newestTargetedEnrichment = sortRecommendationsNewestFirst(
    relevantRecommendations.filter(
      (recommendation) =>
        isBnlSourceFileEnrichment(recommendation) &&
        recommendation.targetCandidateId === input.candidate.id,
    ),
  )[0];
  const candidateSubjectKey = normalizeDossierSubjectName(input.candidate.name);
  const newestSubjectKeyEnrichment = sortRecommendationsNewestFirst(
    relevantRecommendations.filter(
      (recommendation) =>
        isBnlSourceFileEnrichment(recommendation) &&
        !recommendation.targetCandidateId &&
        normalizeDossierSubjectName(
          recommendation.subjectKey || recommendation.subjectName,
        ) === candidateSubjectKey,
    ),
  )[0];

  const selectedEnrichment =
    completedRefreshRecommendation ??
    newestTargetedEnrichment ??
    newestSubjectKeyEnrichment;

  if (!selectedEnrichment) {
    return sortRecommendationsNewestFirst(relevantRecommendations);
  }

  return [
    selectedEnrichment,
    ...sortRecommendationsNewestFirst(
      relevantRecommendations.filter(
        (recommendation) =>
          recommendation.id !== selectedEnrichment.id &&
          !isBnlSourceFileEnrichment(recommendation),
      ),
    ),
  ];
}

export function createDossierSourceFileSummary(
  input: SummaryInput,
): DossierSourceFileSummary {
  const { candidate, drafts = [], recommendations = [] } = input;
  const level = substanceLevel(input);
  const readiness = publicReadiness(level, drafts);
  const action = nextAction({ candidate, drafts, level, readiness });
  const activeDraft = drafts.find((draft) =>
    activeDraftStatuses.has(draft.status),
  );
  const operatorSummary = candidate.sourceFileSummary;
  const operatorKnownContext = trustedOperatorSummaryItems(
    operatorSummary?.knownContext ?? [],
    4,
  );
  const operatorOpenQuestions = trustedOperatorSummaryItems(
    operatorSummary?.openQuestions ?? [],
    4,
  );
  const operatorNextAction = trustedOperatorSummaryItems(
    [operatorSummary?.nextAction],
    1,
  )[0];
  const operatorSummaryText = trustedOperatorSummaryItems(
    [operatorSummary?.summaryText],
    1,
  )[0];
  const rawEvidenceValues = [
    candidate.evidenceSummary,
    candidate.reason,
    candidate.whyNow,
    ...(candidate.evidenceItems ?? []).flatMap((item) => [
      item.label,
      item.summary,
    ]),
    ...(candidate.sourceFileNotes ?? []).map((note) => note.text),
    ...recommendations.flatMap((recommendation) => [
      recommendation.reason,
      recommendation.evidenceSummary,
      ...(recommendation.sourceTypes ?? []),
      ...(recommendation.sourceLanes ?? []),
    ]),
  ];
  const structuredKnownContext = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.knownContext ?? [],
    ),
    6,
  );
  const structuredUsefulEvidence = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.usefulEvidence ?? [],
    ),
    6,
  );
  const structuredRelationshipSignals = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.relationshipSignals ?? [],
    ),
    6,
  );
  const structuredPublicSafePossibilities = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.publicSafePossibilities ?? [],
    ),
    6,
  );
  const structuredPrivateOnlyNotes = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.privateOnlyNotes ?? [],
    ),
    6,
  );
  const structuredNotPublicYet = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.notPublicYet ?? [],
    ),
    6,
  );

  const structuredObservedChannels = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.observedChannels ?? [],
    ),
    6,
  );
  const structuredConversationHighlights = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.conversationHighlights ?? [],
    ),
    6,
  );
  const structuredTopicBreakdown = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.topicBreakdown ?? [],
    ),
    6,
  );
  const structuredBestEvidenceToReview = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.bestEvidenceToReview ?? [],
    ),
    6,
  );
  const structuredBnlInteractionSignals = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.bnlInteractionSignals ?? [],
    ),
    6,
  );
  const structuredMusicSignals = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.musicSignals ?? [],
    ),
    6,
  );
  const structuredCommunitySignals = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.communitySignals ?? [],
    ),
    6,
  );
  const structuredSourceCoverage = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.sourceCoverage ?? [],
    ),
    6,
  );
  const structuredEvidenceDetails = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.evidenceDetails ?? [],
    ),
    6,
  );
  const structuredRepresentativeEvidence = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.representativeEvidence ?? [],
    ),
    8,
  );
  const structuredActivityFrequencySummary = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.activityFrequencySummary ?? [],
    ),
    4,
  );
  const structuredTopChannels = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.topChannels ?? [],
    ),
    6,
  );
  const structuredTopTopicDetails = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.topTopicDetails ?? [],
    ),
    6,
  );
  const structuredRecentActivitySummary = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.recentActivitySummary ?? [],
    ),
    4,
  );
  const structuredAuthoredVsMentionedSummary = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.authoredVsMentionedSummary ?? [],
    ),
    4,
  );
  const structuredPublicUseCandidates = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.publicUseCandidates ?? [],
    ),
    6,
  );
  const structuredReviewOnlyEvidence = unique(
    recommendations.flatMap(
      (recommendation) => recommendation.reviewOnlyEvidence ?? [],
    ),
    6,
  );
  const queueRecommendation = recommendations.find(
    (recommendation) =>
      recommendation.queueSubmissionStatus ||
      recommendation.queueSubmissionNote,
  );
  const structuredRecommendedAction = unique(
    recommendations.map((recommendation) => recommendation.recommendedAction),
    1,
  )[0];
  const structuredSourceAuthority = unique(
    recommendations.flatMap((recommendation) => [
      ...(recommendation.sourceAuthority ?? []),
      recommendation.confidence
        ? `Source confidence: ${recommendation.confidence}. Review source boundaries before public use.`
        : undefined,
    ]),
    5,
  );
  const sourceMemoryEvidence = sourceFileEvidenceClusterItems(
    rawEvidenceValues,
    {
      subjectName: candidate.name,
    },
  );
  const nonPublicSourceNoteMeanings = sanitizeMeaningFirstItems(
    (candidate.sourceFileNotes ?? [])
      .filter((note) => note.publicSafe !== true)
      .map((note) => note.text),
    {
      subjectName: candidate.name,
      includePublicDiscord: true,
    },
  );
  const structuredSummary = unique(
    [candidate.evidenceSummary, candidate.reason],
    1,
  )[0];
  const usefulEvidence = unique(
    [
      ...structuredUsefulEvidence,
      ...sourceMemoryEvidence,
      candidate.evidenceSummary,
      ...(candidate.evidenceItems ?? []).map(
        (item) => item.summary || item.label,
      ),
      ...recommendations.map(
        (recommendation) => recommendation.evidenceSummary,
      ),
    ],
    5,
  );
  const knownContext = unique(
    [
      ...structuredKnownContext,
      ...(candidate.knownFacts ?? []),
      sourceFileReasonMeaning(candidate.reason, candidate.name),
      ...(candidate.sourceFileNotes ?? [])
        .filter((note) => note.publicSafe === true)
        .map((note) => note.text),
    ],
    4,
  );
  const patterns = unique(
    [
      sourceFileWhyNowMeaning(candidate.whyNow),
      ...recommendations.map((recommendation) => recommendation.reason),
      ...(candidate.sourceFileNotes ?? []).map((note) => note.text),
    ].filter((item) => hasDossierMeaningfulPattern(item)),
    3,
  );
  const notPublicYet = unique(
    [
      ...structuredNotPublicYet,
      ...structuredPrivateOnlyNotes,
      ...structuredRelationshipSignals,
      ...(candidate.publicSafetyNotes ?? []),
      ...(candidate.doNotSay ?? []),
      ...recommendations.flatMap((recommendation) => [
        ...(recommendation.publicSafetyNotes ?? []),
        ...(recommendation.doNotSay ?? []),
      ]),
    ],
    4,
  );
  const uncertainties = notPublicYet;
  const confirmedStrong = unique(
    [
      ...(candidate.knownFacts ?? []),
      ...(candidate.sourceFileNotes ?? [])
        .filter((note) => note.publicSafe === true)
        .map((note) => note.text),
    ],
    4,
  );
  const claimedNeedsReview = unique(
    [
      ...structuredRelationshipSignals,
      ...structuredPublicSafePossibilities,
      sourceFileReasonMeaning(candidate.reason, candidate.name),
      sourceFileWhyNowMeaning(candidate.whyNow),
      ...recommendations.map((recommendation) => recommendation.reason),
      ...nonPublicSourceNoteMeanings,
    ],
    4,
  );
  const missingInfo = unique(
    [
      ...(candidate.missingInfo ?? []),
      ...recommendations.flatMap(
        (recommendation) => recommendation.missingInfo ?? [],
      ),
    ],
    4,
  );
  const primarySummarySourceText = [
    candidate.reason,
    candidate.whyNow,
    candidate.evidenceSummary,
  ].join(" ");
  const technicalOnlyPrimaryText =
    containsDossierBackendJunk(primarySummarySourceText) &&
    !(candidate.knownFacts ?? []).length &&
    !(candidate.evidenceItems ?? []).length &&
    !(candidate.sourceFileNotes ?? []).some(
      (note) =>
        note.publicSafe === true && !containsDossierBackendJunk(note.text),
    );
  const summarySource = operatorSummaryText
    ? "operator"
    : level === "thin" || technicalOnlyPrimaryText
      ? "thin"
      : structuredSummary
        ? "structured"
        : "derived";

  return {
    currentRead:
      operatorSummaryText ??
      (summarySource === "thin"
        ? DOSSIER_THIN_FILE_WARNING
        : `${candidate.name} has a ${labelLevel(level).toLowerCase()} internal case file. Review what is confirmed, what is only claimed, and what still needs owner/admin review before drafting from it.`),
    knownContext:
      operatorKnownContext.length > 0
        ? operatorKnownContext
        : knownContext.length > 0
          ? knownContext
          : [
              "BNL has this subject in the internal review workspace, but no substantial public-safe context has been captured yet.",
            ],
    whyTracked:
      sanitizeMeaningFirstItems([candidate.reason, candidate.whyNow], {
        subjectName: candidate.name,
        limit: 1,
      })[0] ||
      "This subject is being tracked because it appeared in BNL records and needs human review before any public use.",
    usefulEvidence:
      usefulEvidence.length > 0
        ? usefulEvidence
        : [
            "No useful evidence has been captured yet beyond the fact that this internal file exists.",
          ],
    patterns: patterns.length > 0 ? patterns : [DOSSIER_NO_MEANINGFUL_PATTERN],
    confirmedStrong:
      confirmedStrong.length > 0
        ? confirmedStrong
        : ["No confirmed public-safe facts have been separated yet."],
    claimedNeedsReview:
      claimedNeedsReview.length > 0
        ? claimedNeedsReview
        : ["No human-readable claims have been extracted yet."],
    privateRelationshipContext:
      structuredRelationshipSignals.length > 0
        ? structuredRelationshipSignals
        : [
            "No private relationship/context signals are recorded in the structured packet.",
          ],
    publicSafePossibilities:
      structuredPublicSafePossibilities.length > 0
        ? structuredPublicSafePossibilities
        : ["No public-safe possibilities are pending owner review yet."],
    privateOnlyNotes:
      structuredPrivateOnlyNotes.length > 0
        ? structuredPrivateOnlyNotes
        : ["No private/internal notes are recorded in the structured packet."],
    uncertainties:
      uncertainties.length > 0
        ? uncertainties
        : [
            "Treat names, mentions, and possible connections as unconfirmed until reviewed.",
          ],
    missingInfo:
      operatorOpenQuestions.length > 0
        ? operatorOpenQuestions
        : missingInfo.length > 0
          ? missingInfo
          : [
              "Needs more history, repeated appearances, public-safe facts, and owner/admin context.",
            ],
    notPublicYet:
      notPublicYet.length > 0
        ? notPublicYet
        : ["Do not say more publicly until owner/admin review confirms it."],
    observedChannels: structuredObservedChannels,
    conversationHighlights: structuredConversationHighlights,
    topicBreakdown: structuredTopicBreakdown,
    bestEvidenceToReview: structuredBestEvidenceToReview,
    bnlInteractionSignals: structuredBnlInteractionSignals,
    musicSignals: structuredMusicSignals,
    communitySignals: structuredCommunitySignals,
    sourceCoverage: structuredSourceCoverage,
    evidenceDetails: structuredEvidenceDetails,
    representativeEvidence: structuredRepresentativeEvidence,
    activityFrequencySummary: structuredActivityFrequencySummary,
    topChannels: structuredTopChannels,
    topTopicDetails: structuredTopTopicDetails,
    recentActivitySummary: structuredRecentActivitySummary,
    authoredVsMentionedSummary: structuredAuthoredVsMentionedSummary,
    publicUseCandidates: structuredPublicUseCandidates,
    reviewOnlyEvidence: structuredReviewOnlyEvidence,
    queueSubmissionStatus: queueRecommendation?.queueSubmissionStatus,
    queueSubmissionNote: queueRecommendation?.queueSubmissionNote,
    sourceAuthority:
      structuredSourceAuthority.length > 0
        ? structuredSourceAuthority
        : ["Source authority has not been separated from confidence yet."],
    recommendedNextAction:
      operatorNextAction ??
      structuredRecommendedAction ??
      nextActionCopy(action),
    substanceLevel: level,
    publicReadiness: readiness,
    existingPublicDossier: candidate.existingDossierMatch
      ? candidate.status === "existing_dossier_update"
        ? "linked_update_target"
        : "yes"
      : "no",
    nextAction: action,
    lastUpdatedAt:
      [
        candidate.updatedAt,
        activeDraft?.updatedAt,
        recommendations[0]?.updatedAt,
      ]
        .filter(Boolean)
        .sort()
        .at(-1) ?? candidate.updatedAt,
    summarySource,
  };
}

export function formatDossierSummaryBadge(value: string): string {
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
