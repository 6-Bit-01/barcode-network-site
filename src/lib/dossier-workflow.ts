import type {
  DossierEcosystemLane,
  DossierIdentityAuthority,
  PublicDossierKind,
} from "@/content";

export type DossierCandidateSource =
  | "manual"
  | "rd_conversation"
  | "queue_frequency"
  | "discord_context"
  | "website_read_model"
  | "bnl_dynamic_candidate_discovery"
  | "bnl_source_knowledge_bridge"
  | "bnl_source_file_enrichment"
  | "combined";

export type DossierCandidateType =
  | "artist"
  | "community_member"
  | "entity"
  | "production"
  | "interface"
  | "sponsor"
  | "story_arc"
  | "unknown";

export type DossierCandidateTier =
  | "weak_candidate"
  | "review_candidate"
  | "draft_ready";

export type DossierDuplicateRisk = "none" | "low" | "medium" | "high";

export type DossierCandidateEvidenceType =
  | "manual_nomination"
  | "rd_conversation"
  | "queue_recurrence"
  | "completed_play"
  | "priority_moment"
  | "discord_context"
  | "website_context"
  | "public_show_moment"
  | "operator_note";

export type DossierCandidateEvidence = {
  id: string;
  type: DossierCandidateEvidenceType;
  label: string;
  summary: string;
  count?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  publicSafe: boolean;
};

export type DossierCandidateStatus =
  | "candidate_intake"
  | "active_source_file"
  | "existing_dossier_update"
  | "archived"
  | "suggested"
  | "needs_review"
  | "selected"
  | "draft_requested"
  | "draft_ready"
  | "needs_revision"
  | "approved"
  | "denied"
  | "needs_more_evidence"
  | "merged";

export type DossierDraftStatus =
  | "draft"
  | "ready_for_owner_review"
  | "owner_changes_requested"
  | "owner_approved"
  | "denied"
  | "published"
  | "superseded";

export type DossierCategory =
  | "Entity"
  | "Personnel"
  | "Sponsor"
  | "Interface"
  | "Production";
export type DossierPublicStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "ARCHIVED"
  | "PENDING"
  | "UNKNOWN";
export type DossierClearance = "PUBLIC" | "INTERNAL" | "RESTRICTED";
export type DossierOrigin = "KNOWN" | "UNKNOWN" | "UNVERIFIED" | "WITHHELD";

export type DossierSourceFileNoteType =
  | "fact"
  | "correction"
  | "missing_info"
  | "public_safety"
  | "do_not_say"
  | "link_note"
  | "general_note"
  | "owner_note";

export type DossierSourceFileNoteSource =
  | "admin_manual"
  | "mod_manual"
  | "owner_manual"
  | "bnl_recommendation"
  | "rd_context"
  | "broadcast_memory"
  | "queue_context"
  | "website_context"
  | "discord_context"
  | "unknown";

export type DossierSourceFileNoteStatus =
  | "active"
  | "incorporated"
  | "ignored"
  | "superseded";

export type DossierSourceFileOperatorSummary = {
  summaryText?: string;
  knownContext?: string[];
  openQuestions?: string[];
  nextAction?: string;
  updatedAt: string;
  updatedBy?: string;
};


export type DossierSubjectIntelligenceBriefV1 = {
  subjectRead?: unknown;
  bnlTake?: unknown;
  activitySnapshot?: unknown;
  topicBuckets?: unknown;
  namedAnchors?: unknown;
  musicAndLinkSignals?: unknown;
  relationshipSignals?: unknown;
  queueSubmissionRead?: unknown;
  sourceFileGaps?: unknown;
  recommendedAdminActions?: unknown;
  doNotSayPubliclyYet?: unknown;
};

export type DossierSourceFileCaseReportV1 = {
  version?: string;
  generatedAt?: string;
  subjectName?: string;
  subjectKey?: string;
  reportStatus?: string;
  caseSummary?: string | string[];
  dossierUse?: string | string[];
  publicSafeClaims?: string | string[];
  evidenceSummary?: string | string[];
  communityContext?: string | string[];
  creativeMusicContext?: string | string[];
  relationshipContext?: string | string[];
  queueSubmissionContext?: string | string[];
  identityContext?: string | string[];
  reviewBlockers?: string | string[];
  internalOnlyNotes?: string | string[];
  recommendedNextSteps?: string | string[];
  confidenceNotes?: string | string[];
  memoryCoverage?: string | string[];
  subjectIntelligenceBriefV1?: DossierSubjectIntelligenceBriefV1;
};

export type DossierSourceFileBriefV2 = {
  oneLineSummary?: string;
  adminSummary?: string;
  recommendedNextAction?: string;
  sourceFileCaseReportV1?: DossierSourceFileCaseReportV1;
  caseFileReport?: unknown;
};

export type DossierSourceFileArchiveCompactReadout = {
  compactSummary?: string;
  publicSafePossibilities?: string[];
  missingInfo?: string[];
  publicSafetyNotes?: string[];
  doNotSay?: string[];
  evidenceReceiptSummary?: string[];
  sourceFileCaseReportV1?: DossierSourceFileCaseReportV1;
  sourceFileBriefV2?: DossierSourceFileBriefV2;
  archivePayload?: unknown;
  archive?: unknown;
  payload?: unknown;
  sourceFileArchive?: unknown;
};

export type DossierSourceFileArchiveMetadata =
  DossierSourceFileArchiveCompactReadout & {
    id: string;
    candidateId: string;
    subjectName: string;
    subjectKey?: string;
    ingestKey?: string;
    ingestSource?: DossierRecommendationIngestSource;
    sourceDigest: string;
    createdAt: string;
    updatedAt: string;
    archiveSize: number;
    chunkCount: number;
    archiveKey?: string;
    chunkKeys?: string[];
    reviewOnly: true;
    caseReportPresent?: boolean;
    subjectMemoryPacketPresent?: boolean;
    caseReportExtractedFrom?: string;
    sourceFileBriefExtractedFrom?: string;
  };

export type DossierSourceFileEnrichmentArchive =
  DossierSourceFileArchiveMetadata & {
    sourcePackage: unknown;
  };

export type DossierSourceFileNote = {
  id: string;
  candidateId: string;
  type: DossierSourceFileNoteType;
  text: string;
  source: DossierSourceFileNoteSource;
  status: DossierSourceFileNoteStatus;
  publicSafe?: boolean;
  appliesToDraftId?: string;
  incorporatedIntoDraftId?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  ingestKey?: string;
  ingestedAt?: string;
  ingestSource?: DossierRecommendationIngestSource;
  connectedCandidateId?: string;
  connectedSourceFileCandidateId?: string;
  connectedRecommendationIds?: string[];
  possibleMatchCandidateIds?: string[];
  possibleMatchDossierIds?: string[];
  identityReviewStatus?: "not_required" | "needs_confirmation" | "confirmed";
  routingReason?: string;
  routedFromRecommendationId?: string;
  sourceRecommendationIds?: string[];
};

export type DossierIdentityLinkType =
  | "alias"
  | "artist_name"
  | "discord_handle"
  | "operator_name"
  | "public_persona"
  | "previous_name"
  | "alternate_spelling"
  | "related_label"
  | "unknown";

export type DossierIdentityLinkVisibility = "internal_only" | "public_safe";

export type DossierIdentityLinkStatus =
  | "proposed"
  | "confirmed"
  | "rejected"
  | "retired";

export type DossierIdentityLinkSource =
  | "owner_confirmed"
  | "admin_manual"
  | "mod_manual"
  | "bnl_recommendation"
  | "rd_context"
  | "broadcast_memory"
  | "website_dossier"
  | "unknown";

export type DossierIdentityLink = {
  id: string;
  candidateId: string;
  label: string;
  normalizedLabel: string;
  type: DossierIdentityLinkType;
  visibility: DossierIdentityLinkVisibility;
  status: DossierIdentityLinkStatus;
  source: DossierIdentityLinkSource;
  confidence?: "low" | "medium" | "high" | "confirmed";
  useForMatching: boolean;
  useInPublicDossier: boolean;
  note?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  confirmedBy?: string;
  confirmedAt?: string;
  useForMatchingAfterConfirmation?: boolean;
  createdFromRecommendationId?: string;
  createdFromRecommendationSubject?: string;
};

export type DossierCandidate = {
  id: string;
  name: string;
  candidateType: DossierCandidateType;
  source: DossierCandidateSource;
  tier: DossierCandidateTier;
  score: number;
  whyNow: string;
  reason: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  evidenceSummary: string;
  evidenceItems?: DossierCandidateEvidence[];
  evidenceCount?: number;
  knownFacts?: string[];
  confidence?: "low" | "medium" | "high";
  duplicateRisk?: DossierDuplicateRisk;
  existingDossierMatch?: {
    id: string;
    name: string;
    confidence: "low" | "medium" | "high";
  } | null;
  recommendedCategory?: DossierCategory;
  recommendedKind?: PublicDossierKind;
  recommendedEcosystemLane?: DossierEcosystemLane;
  recommendedIdentityAuthority?: DossierIdentityAuthority;
  recommendedStatus?: DossierPublicStatus;
  recommendedClearance?: DossierClearance;
  recommendedOrigin?: DossierOrigin;
  recommendedTags?: string[];
  proposedTags?: string[];
  primaryLink?: DossierWorkflowLink;
  missingInfo?: string[];
  doNotSay?: string[];
  publicSafetyNotes?: string[];
  sourceFileArchiveIds?: string[];
  latestSourceFileArchiveId?: string;
  latestSourceFileArchiveDigest?: string;
  latestSourceFileArchiveUpdatedAt?: string;
  latestSourceFileArchive?: DossierSourceFileArchiveMetadata;
  sourceFileSummary?: DossierSourceFileOperatorSummary;
  sourceFileNotes?: DossierSourceFileNote[];
  identityLinks?: DossierIdentityLink[];
  sourceLanes?: DossierRecommendationSourceLane[];
  ingestKey?: string;
  ingestSource?: DossierRecommendationIngestSource;
  createdFromRecommendationId?: string;
  connectedCandidateId?: string;
  connectedSourceFileCandidateId?: string;
  connectedRecommendationIds?: string[];
  possibleMatchCandidateIds?: string[];
  possibleMatchDossierIds?: string[];
  identityReviewStatus?: "not_required" | "needs_confirmation" | "confirmed";
  routingReason?: string;
  routedFromRecommendationId?: string;
  sourceRecommendationIds?: string[];
  mergedIntoCandidateId?: string;
  mergedAt?: string;
  mergeNote?: string;
  mergeSourceCandidateIds?: string[];
  status: DossierCandidateStatus;
  createdAt: string;
  updatedAt: string;
};

export type DossierDraft = {
  id: string;
  candidateId: string;
  status: DossierDraftStatus;
  fields: {
    id?: string;
    name: string;
    category?: DossierCategory;
    kind?: PublicDossierKind;
    ecosystemLane?: DossierEcosystemLane;
    identityAuthority?: DossierIdentityAuthority;
    status?: DossierPublicStatus;
    clearance?: DossierClearance;
    role?: string;
    origin?: DossierOrigin;
    summary?: string;
    notes?: string;
    tags?: string[];
    proposedTags?: string[];
    primaryLink?: DossierWorkflowLink;
    links?: DossierWorkflowLink[];
    files?: [];
  };
  mergedIntoDraftId?: string;
  mergedAt?: string;
  mergeNote?: string;
  mergeSourceDraftIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type DossierWorkflowLink = {
  label: string;
  url: string;
  type: string;
  selectedBy?: "subject" | "operator" | "legacy";
  publicSafe?: boolean;
};

export type CreateManualDossierCandidateInput = {
  name: string;
  candidateType?: DossierCandidate["candidateType"];
  reason: string;
  whyNow?: string;
  evidenceSummary?: string;
  knownFacts?: string[];
  missingInfo?: string[];
  doNotSay?: string[];
  publicSafetyNotes?: string[];
  recommendedCategory?: DossierDraft["fields"]["category"];
  recommendedKind?: DossierDraft["fields"]["kind"];
  recommendedEcosystemLane?: DossierDraft["fields"]["ecosystemLane"];
  recommendedIdentityAuthority?: DossierDraft["fields"]["identityAuthority"];
  recommendedStatus?: DossierDraft["fields"]["status"];
  recommendedClearance?: DossierDraft["fields"]["clearance"];
  recommendedOrigin?: DossierDraft["fields"]["origin"];
  recommendedTags?: string[];
  proposedTags?: string[];
  primaryLink?: DossierDraft["fields"]["primaryLink"];
};

export type CreateExistingDossierUpdateTargetInput = {
  dossierId: string;
  requestedSubject?: string;
  createdBy?: string;
};

export type DossierDuplicateGroup = {
  id: string;
  normalizedName: string;
  candidateIds: string[];
  draftIds: string[];
  names: string[];
  risk: "low" | "medium" | "high";
  reason: string;
  suggestedMasterCandidateId?: string;
  existingPublishedDossierMatch?: {
    id: string;
    name: string;
    confidence: "low" | "medium" | "high";
  } | null;
};

export type DossierRecommendationType =
  | "new_subject"
  | "modify_existing_dossier"
  | "identity_link"
  | "possible_connection_review";

export type DossierRecommendationStatus =
  | "new"
  | "reviewing"
  | "attached_to_source_file"
  | "attached_to_candidate_intake"
  | "attached_to_existing_dossier_update"
  | "converted_to_source_file"
  | "identity_link_created"
  | "ignored"
  | "dismissed"
  | "archived";

export type DossierRecommendationSourceLane =
  | "public_discord"
  | "rd_context"
  | "broadcast_memory"
  | "queue_context"
  | "website_dossier"
  | "admin_manual"
  | "mod_manual"
  | "owner_manual"
  | "unknown";

export type DossierRecommendationIngestSource =
  | "bnl"
  | "bnl_dynamic_candidate_discovery"
  | "bnl_source_knowledge_bridge"
  | "bnl_source_file_enrichment"
  | "system"
  | "unknown";

export type DossierSourceFileRefreshRequestStatus =
  | "pending"
  | "claimed"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

export type DossierSourceFileRefreshRequestSource =
  | "opened_source_file"
  | "manual_admin"
  | "stale_source_file"
  | "missing_bnl_refresh"
  | "source_notes_newer_than_bnl"
  | "existing_dossier_update_review"
  | "case_report_missing";

export type DossierSourceFileRefreshRequest = {
  id: string;
  candidateId?: string;
  subjectName: string;
  normalizedSubjectKey: string;
  status: DossierSourceFileRefreshRequestStatus;
  reason: string;
  requestedBy?: string;
  requestedAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  completedAt?: string;
  completedByRecommendationId?: string;
  failureReason?: string;
  caseReportMissing?: boolean;
  requiresCaseReportBackfill?: boolean;
  requestSource: DossierSourceFileRefreshRequestSource;
  priority: number;
  notBeforeAt?: string;
};

export type DossierSourceFileRefreshDecision = {
  needed: boolean;
  reason: string;
  requestSource: DossierSourceFileRefreshRequestSource;
  priority: number;
  latestRecommendationTimestamp?: string;
  latestSourceNoteTimestamp?: string;
};

export type DossierQueueSubmissionStatus =
  | "not_connected"
  | "connected"
  | "confirmed_submission"
  | "no_submission_found"
  | "review_needed"
  | "unknown";

export type DossierSourceCoverageItem = {
  source?: string;
  count?: number;
  counts?: Record<string, number>;
  status?: string;
};

export type DossierSourceCoverageInput = Array<
  string | DossierSourceCoverageItem
>;

export type DossierStructuredSourcePacket = {
  knownContext?: string[];
  usefulEvidence?: string[];
  relationshipSignals?: string[];
  publicSafePossibilities?: string[];
  privateOnlyNotes?: string[];
  notPublicYet?: string[];
  observedChannels?: string[];
  conversationHighlights?: string[];
  topicBreakdown?: string[];
  bestEvidenceToReview?: string[];
  bnlInteractionSignals?: string[];
  musicSignals?: string[];
  communitySignals?: string[];
  sourceCoverage?: DossierSourceCoverageInput;
  evidenceDetails?: string[];
  representativeEvidence?: string[];
  activityFrequencySummary?: string[];
  topChannels?: string[];
  topTopicDetails?: string[];
  recentActivitySummary?: string[];
  authoredVsMentionedSummary?: string[];
  publicUseCandidates?: string[];
  reviewOnlyEvidence?: string[];
  queueSubmissionStatus?: DossierQueueSubmissionStatus;
  queueSubmissionNote?: string;
  recommendedAction?: string;
  sourceAuthority?: string[];
  rawProvenance?: unknown;
};

export type DossierRecommendation = {
  id: string;
  type: DossierRecommendationType;
  subjectName: string;
  subjectKey?: string;
  targetDossierId?: string;
  targetCandidateId?: string;
  status: DossierRecommendationStatus;
  reason: string;
  evidenceSummary?: string;
  confidence?: "low" | "medium" | "high";
  sourceLanes: DossierRecommendationSourceLane[];
  sourceTypes?: string[];
  suggestedAction?: string;
  knownContext?: string[];
  usefulEvidence?: string[];
  relationshipSignals?: string[];
  publicSafePossibilities?: string[];
  privateOnlyNotes?: string[];
  notPublicYet?: string[];
  observedChannels?: string[];
  conversationHighlights?: string[];
  topicBreakdown?: string[];
  bestEvidenceToReview?: string[];
  bnlInteractionSignals?: string[];
  musicSignals?: string[];
  communitySignals?: string[];
  sourceCoverage?: string[];
  evidenceDetails?: string[];
  representativeEvidence?: string[];
  activityFrequencySummary?: string[];
  topChannels?: string[];
  topTopicDetails?: string[];
  recentActivitySummary?: string[];
  authoredVsMentionedSummary?: string[];
  publicUseCandidates?: string[];
  reviewOnlyEvidence?: string[];
  queueSubmissionStatus?: DossierQueueSubmissionStatus;
  queueSubmissionNote?: string;
  recommendedAction?: string;
  sourceAuthority?: string[];
  rawProvenance?: unknown;
  missingInfo?: string[];
  publicSafetyNotes?: string[];
  doNotSay?: string[];
  recommendedTags?: string[];
  recommendedCategory?: DossierCandidate["recommendedCategory"];
  recommendedKind?: DossierCandidate["recommendedKind"];
  recommendedEcosystemLane?: DossierCandidate["recommendedEcosystemLane"];
  recommendedIdentityAuthority?: DossierCandidate["recommendedIdentityAuthority"];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  ingestKey?: string;
  ingestedAt?: string;
  ingestSource?: DossierRecommendationIngestSource;
  connectedCandidateId?: string;
  connectedSourceFileCandidateId?: string;
  connectedRecommendationIds?: string[];
  possibleMatchCandidateIds?: string[];
  possibleMatchDossierIds?: string[];
  identityReviewStatus?: "not_required" | "needs_confirmation" | "confirmed";
  routingReason?: string;
  routedFromRecommendationId?: string;
  sourceRecommendationIds?: string[];
};

export type DossierSourceDepthLabel = "Low" | "Medium" | "Strong";

export type DossierSourceFileMetrics = {
  sourceNotesCount: number;
  activeSourceNotesCount: number;
  attachedRecommendationCount: number;
  evidenceItemCount: number;
  sourceDepth: DossierSourceDepthLabel;
  sourceDepthScore: number;
  unappliedSourceNotesCount: number;
  unappliedSourceNotes: DossierSourceFileNote[];
};

function isWorkflowDraftActiveForMetrics(draft: DossierDraft): boolean {
  return (
    draft.status === "draft" ||
    draft.status === "owner_changes_requested" ||
    draft.status === "ready_for_owner_review"
  );
}

export function getLinkedActiveDossierDraft(
  candidate: Pick<DossierCandidate, "id">,
  drafts: DossierDraft[],
): DossierDraft | undefined {
  return drafts.find(
    (draft) =>
      draft.candidateId === candidate.id &&
      isWorkflowDraftActiveForMetrics(draft),
  );
}

export function getUnappliedSourceNotes(input: {
  candidate: Pick<DossierCandidate, "sourceFileNotes">;
  draft?: Pick<DossierDraft, "updatedAt"> | null;
}): DossierSourceFileNote[] {
  if (!input.draft?.updatedAt) return [];
  const draftUpdatedAt = Date.parse(input.draft.updatedAt);
  if (Number.isNaN(draftUpdatedAt)) return [];

  return (input.candidate.sourceFileNotes ?? [])
    .filter((note) => {
      if (note.status !== "active") return false;
      const noteCreatedAt = Date.parse(note.createdAt);
      return !Number.isNaN(noteCreatedAt) && noteCreatedAt > draftUpdatedAt;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDossierSourceFileMetrics(input: {
  candidate: DossierCandidate;
  drafts?: DossierDraft[];
  recommendations?: DossierRecommendation[];
}): DossierSourceFileMetrics {
  const sourceNotes = input.candidate.sourceFileNotes ?? [];
  const activeSourceNotes = sourceNotes.filter(
    (note) => note.status === "active",
  );
  const attachedRecommendations = (input.recommendations ?? []).filter(
    (recommendation) => recommendation.targetCandidateId === input.candidate.id,
  );
  const evidenceItemCount =
    input.candidate.evidenceItems?.length ?? input.candidate.evidenceCount ?? 0;
  const linkedDraft = getLinkedActiveDossierDraft(
    input.candidate,
    input.drafts ?? [],
  );
  const unappliedSourceNotes = getUnappliedSourceNotes({
    candidate: input.candidate,
    draft: linkedDraft,
  });

  let score = 0;
  score += Math.min(activeSourceNotes.length, 4);
  score += Math.min(attachedRecommendations.length, 3);
  score += Math.min(evidenceItemCount, 3);
  if (linkedDraft) score += 2;
  if (input.candidate.primaryLink) score += 1;
  if ((input.candidate.publicSafetyNotes ?? []).length > 0) score += 1;
  if ((input.candidate.doNotSay ?? []).length > 0) score += 1;
  if ((input.candidate.missingInfo ?? []).length > 0) score -= 1;

  const sourceDepth: DossierSourceDepthLabel =
    score >= 7 ? "Strong" : score >= 3 ? "Medium" : "Low";

  return {
    sourceNotesCount: sourceNotes.length,
    activeSourceNotesCount: activeSourceNotes.length,
    attachedRecommendationCount: attachedRecommendations.length,
    evidenceItemCount,
    sourceDepth,
    sourceDepthScore: score,
    unappliedSourceNotesCount: unappliedSourceNotes.length,
    unappliedSourceNotes,
  };
}

export type DossierSubjectMatchResult = {
  exactCandidateId?: string;
  exactMatchKind?:
    | "pre_targeted"
    | "name"
    | "compact_name"
    | "subject_key"
    | "confirmed_alias";
  aliasLabel?: string;
  possibleCandidateIds: string[];
  reason: string;
};

export function normalizeDossierSubjectName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactDossierSubjectName(value: string): string {
  return normalizeDossierSubjectName(value).replace(/\s+/g, "");
}

export function isActiveSourceFileCandidate(
  candidate: Pick<DossierCandidate, "status">,
): boolean {
  return (
    candidate.status !== "candidate_intake" &&
    candidate.status !== "existing_dossier_update" &&
    candidate.status !== "archived" &&
    candidate.status !== "denied" &&
    candidate.status !== "merged"
  );
}

const SOURCE_FILE_ENRICHMENT_ATTACHABLE_STATUSES =
  new Set<DossierCandidateStatus>([
    "candidate_intake",
    "active_source_file",
    "existing_dossier_update",
    "suggested",
    "needs_review",
    "selected",
    "draft_requested",
    "draft_ready",
    "needs_revision",
    "needs_more_evidence",
  ]);

export function isSourceFileEnrichmentAttachableCandidate(
  candidate: Pick<DossierCandidate, "status">,
): boolean {
  return SOURCE_FILE_ENRICHMENT_ATTACHABLE_STATUSES.has(candidate.status);
}

function isActiveSubjectCandidate(candidate: DossierCandidate): boolean {
  return isSourceFileEnrichmentAttachableCandidate(candidate);
}

function subjectMatchPriority(candidate: DossierCandidate): number {
  if (isActiveSourceFileCandidate(candidate)) return 0;
  if (candidate.status === "existing_dossier_update") return 1;
  return 2;
}

function sortedSubjectCandidates(
  candidates: DossierCandidate[],
): DossierCandidate[] {
  return [...candidates].sort((left, right) => {
    const priority = subjectMatchPriority(left) - subjectMatchPriority(right);
    if (priority !== 0) return priority;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function hasPossibleSubjectOverlap(
  subjectName: string,
  candidateName: string,
): boolean {
  const normalizedSubject = normalizeDossierSubjectName(subjectName);
  const normalizedCandidate = normalizeDossierSubjectName(candidateName);
  const compactSubject = compactDossierSubjectName(subjectName);
  const compactCandidate = compactDossierSubjectName(candidateName);

  if (!normalizedSubject || !normalizedCandidate) return false;
  if (
    normalizedSubject === normalizedCandidate ||
    compactSubject === compactCandidate
  )
    return false;
  if (normalizedSubject.length < 4 || normalizedCandidate.length < 4)
    return false;

  return (
    normalizedSubject.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedSubject) ||
    compactSubject.includes(compactCandidate) ||
    compactCandidate.includes(compactSubject)
  );
}

export function matchDossierRecommendationSubject(input: {
  recommendation: Pick<
    DossierRecommendation,
    "subjectName" | "subjectKey" | "targetCandidateId"
  >;
  candidates: DossierCandidate[];
}): DossierSubjectMatchResult {
  const activeCandidates = sortedSubjectCandidates(
    input.candidates.filter(isActiveSubjectCandidate),
  );
  const subjectName = input.recommendation.subjectName;
  const normalizedSubject = normalizeDossierSubjectName(subjectName);
  const compactSubject = compactDossierSubjectName(subjectName);
  const normalizedSubjectKey = input.recommendation.subjectKey
    ? normalizeDossierSubjectName(input.recommendation.subjectKey)
    : "";
  const compactSubjectKey = input.recommendation.subjectKey
    ? compactDossierSubjectName(input.recommendation.subjectKey)
    : "";
  const preTargetedCandidate = input.recommendation.targetCandidateId
    ? activeCandidates.find(
        (candidate) => candidate.id === input.recommendation.targetCandidateId,
      )
    : undefined;

  if (preTargetedCandidate) {
    return {
      exactCandidateId: preTargetedCandidate.id,
      exactMatchKind: "pre_targeted",
      possibleCandidateIds: [],
      reason:
        "Explicit pre-targeted source-file match from recommendation targetCandidateId.",
    };
  }

  let exactMatchKind: DossierSubjectMatchResult["exactMatchKind"];
  const exactCandidate = activeCandidates.find((candidate) => {
    const normalizedCandidate = normalizeDossierSubjectName(candidate.name);
    const compactCandidate = compactDossierSubjectName(candidate.name);
    if (!normalizedSubject) return false;
    if (normalizedSubject === normalizedCandidate) {
      exactMatchKind = "name";
      return true;
    }
    if (compactSubject === compactCandidate) {
      exactMatchKind = "compact_name";
      return true;
    }
    if (
      Boolean(normalizedSubjectKey) &&
      (normalizedSubjectKey === normalizedCandidate ||
        compactSubjectKey === compactCandidate)
    ) {
      exactMatchKind = "subject_key";
      return true;
    }
    return false;
  });

  let exactAliasCandidate: DossierCandidate | undefined;
  let exactAliasLabel: string | undefined;
  if (!exactCandidate && normalizedSubject) {
    exactAliasCandidate = activeCandidates.find((candidate) => {
      const link = (candidate.identityLinks ?? []).find(
        (identityLink) =>
          identityLink.status === "confirmed" &&
          identityLink.useForMatching === true &&
          identityLink.normalizedLabel === normalizedSubject,
      );
      if (!link) return false;
      exactAliasLabel = link.label;
      return true;
    });
  }
  const safeExactCandidate = exactCandidate ?? exactAliasCandidate;

  const possibleCandidateIds = activeCandidates
    .filter((candidate) => candidate.id !== safeExactCandidate?.id)
    .filter((candidate) =>
      hasPossibleSubjectOverlap(subjectName, candidate.name),
    )
    .map((candidate) => candidate.id);

  if (safeExactCandidate) {
    return {
      exactCandidateId: safeExactCandidate.id,
      exactMatchKind: exactAliasCandidate ? "confirmed_alias" : exactMatchKind,
      aliasLabel: exactAliasCandidate ? exactAliasLabel : undefined,
      possibleCandidateIds,
      reason: exactAliasCandidate
        ? "Confirmed identity link / alias match."
        : "Exact same-subject match by normalized name, compact name, or explicit subject key.",
    };
  }

  if (possibleCandidateIds.length > 0) {
    return {
      possibleCandidateIds,
      reason:
        "Possible duplicate / identity warning from weak partial subject similarity; owner/lead identity resolution is required before attach.",
    };
  }

  return {
    possibleCandidateIds: [],
    reason: "No safe same-subject BNL Source File match found.",
  };
}

export type UpdateDossierSourceFileSummaryInput = {
  candidateId: string;
  summaryText?: string;
  knownContext?: string[];
  openQuestions?: string[];
  nextAction?: string;
  updatedBy?: string;
};

export type CreateDossierSourceFileNoteInput = {
  candidateId: string;
  type?: DossierSourceFileNoteType;
  text: string;
  source?: DossierSourceFileNoteSource;
  publicSafe?: boolean;
  appliesToDraftId?: string;
  createdBy?: string;
};

export type CreateDossierSourceFileArchiveInput =
  DossierSourceFileArchiveCompactReadout & {
    candidateId?: string;
    subjectName: string;
    subjectKey?: string;
    ingestKey?: string;
    ingestSource?: DossierRecommendationIngestSource;
    sourcePackage: unknown;
  };

export type DossierSourceFileArchiveAttachStatus =
  | "attached_active_source_file"
  | "attached_candidate_intake"
  | "attached_existing_dossier_update"
  | "deduped_existing";

export type CreateDossierRecommendationInput = {
  type: DossierRecommendationType;
  subjectName: string;
  subjectKey?: string;
  targetDossierId?: string;
  targetCandidateId?: string;
  reason?: string;
  evidenceSummary?: string;
  confidence?: "low" | "medium" | "high";
  sourceLanes?: DossierRecommendationSourceLane[];
  sourceTypes?: string[];
  suggestedAction?: string;
  knownContext?: string[];
  usefulEvidence?: string[];
  relationshipSignals?: string[];
  publicSafePossibilities?: string[];
  privateOnlyNotes?: string[];
  notPublicYet?: string[];
  observedChannels?: string[];
  conversationHighlights?: string[];
  topicBreakdown?: string[];
  bestEvidenceToReview?: string[];
  bnlInteractionSignals?: string[];
  musicSignals?: string[];
  communitySignals?: string[];
  sourceCoverage?: DossierSourceCoverageInput;
  evidenceDetails?: string[];
  representativeEvidence?: string[];
  activityFrequencySummary?: string[];
  topChannels?: string[];
  topTopicDetails?: string[];
  recentActivitySummary?: string[];
  authoredVsMentionedSummary?: string[];
  publicUseCandidates?: string[];
  reviewOnlyEvidence?: string[];
  queueSubmissionStatus?: DossierQueueSubmissionStatus;
  queueSubmissionNote?: string;
  recommendedAction?: string;
  sourceAuthority?: string[];
  rawProvenance?: unknown;
  missingInfo?: string[];
  publicSafetyNotes?: string[];
  doNotSay?: string[];
  recommendedTags?: string[];
  recommendedCategory?: DossierCandidate["recommendedCategory"];
  recommendedKind?: DossierCandidate["recommendedKind"];
  recommendedEcosystemLane?: DossierCandidate["recommendedEcosystemLane"];
  recommendedIdentityAuthority?: DossierCandidate["recommendedIdentityAuthority"];
  createdBy?: string;
  ingestKey?: string;
  ingestedAt?: string;
  ingestSource?: DossierRecommendationIngestSource;
};

export type MergeDossierCandidatesInput = {
  primaryCandidateId: string;
  sourceCandidateIds: string[];
  sourceDraftIds?: string[];
  createMasterDraft?: boolean;
  mergeNote?: string;
};

export type DossierWorkflowAction =
  | "createManualCandidate"
  | "selectCandidate"
  | "requestDraft"
  | "createDraftFromCandidate"
  | "saveDraft"
  | "saveDraftEdit"
  | "submitDraftForOwnerReview"
  | "requestRevision"
  | "approveDraft"
  | "ownerApproveDraft"
  | "ownerRequestChanges"
  | "ownerDenyDraft"
  | "publishDraft"
  | "denyCandidate"
  | "markNeedsMoreEvidence"
  | "updateSourceFileSummary"
  | "addSourceFileNote"
  | "requestSourceFileRefresh"
  | "recordSourceFileOpen"
  | "addDossierIdentityLink"
  | "createIdentityLinkFromRecommendation"
  | "updateDossierIdentityLink"
  | "confirmDossierIdentityLink"
  | "rejectDossierIdentityLink"
  | "retireDossierIdentityLink"
  | "createDossierRecommendation"
  | "attachRecommendationToCandidate"
  | "convertRecommendationToCandidate"
  | "promoteCandidateToSourceFile"
  | "archiveCandidate"
  | "restoreCandidate"
  | "permanentlyDeleteCandidate"
  | "ignoreDossierRecommendation"
  | "dismissDossierRecommendation"
  | "archiveDossierRecommendation"
  | "attachCandidateToExistingDossier"
  | "markCandidateAsExistingDossierUpdate"
  | "detectDuplicateCandidates"
  | "mergeCandidates"
  | "createMasterDraftFromMerge";

export type DossierSourceBoundary = {
  source: DossierCandidateSource;
  label: string;
  boundary: string;
  allowedUse: string;
};

export const DOSSIER_WORKFLOW_ACTIONS: DossierWorkflowAction[] = [
  "createManualCandidate",
  "selectCandidate",
  "requestDraft",
  "createDraftFromCandidate",
  "saveDraft",
  "saveDraftEdit",
  "submitDraftForOwnerReview",
  "requestRevision",
  "approveDraft",
  "ownerApproveDraft",
  "ownerRequestChanges",
  "ownerDenyDraft",
  "publishDraft",
  "denyCandidate",
  "markNeedsMoreEvidence",
  "updateSourceFileSummary",
  "addSourceFileNote",
  "requestSourceFileRefresh",
  "recordSourceFileOpen",
  "addDossierIdentityLink",
  "createIdentityLinkFromRecommendation",
  "updateDossierIdentityLink",
  "confirmDossierIdentityLink",
  "rejectDossierIdentityLink",
  "retireDossierIdentityLink",
  "createDossierRecommendation",
  "attachRecommendationToCandidate",
  "convertRecommendationToCandidate",
  "promoteCandidateToSourceFile",
  "archiveCandidate",
  "restoreCandidate",
  "permanentlyDeleteCandidate",
  "ignoreDossierRecommendation",
  "dismissDossierRecommendation",
  "archiveDossierRecommendation",
  "attachCandidateToExistingDossier",
  "markCandidateAsExistingDossierUpdate",
  "detectDuplicateCandidates",
  "mergeCandidates",
  "createMasterDraftFromMerge",
];

export const DOSSIER_CANDIDATE_SCORING_POLICY = {
  tiers: {
    weak_candidate: "Possible future dossier; not draft-ready.",
    review_candidate: "Enough evidence for operator review.",
    draft_ready: "Enough public/operator-approved context to request a draft.",
  },
  thresholds: {
    weakCandidateMin: 30,
    reviewCandidateMin: 50,
    draftReadyMin: 70,
  },
  signals: {
    queueRecurrence:
      "Repeated appearances across separate sessions can support candidacy.",
    rdConversation:
      "R&D discussion can support candidacy but is not public copy by itself.",
    discordContext:
      "Discord context is internal evidence and must be public-safe before use.",
    manualNomination:
      "Operator nomination can create a review candidate but still needs facts.",
    duplicatePenalty:
      "Likely duplicate dossiers should be merged or rejected before drafting.",
    privacyPenalty:
      "Private, payment, or identity-sensitive evidence blocks drafting.",
  },
  gate: "Loose intake, strict drafting/publishing.",
} as const;

const IDENTITY_SENSITIVE_PATTERN =
  /\b(discord|email|payment|stripe|customer|account|phone|address|legal name|real name|ip address|private|dm|direct message)\b/i;

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasItems(value: string[] | undefined): boolean {
  return Boolean(value?.some((item) => item.trim()));
}

function tierForScore(score: number): DossierCandidateTier {
  if (score >= DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.draftReadyMin)
    return "draft_ready";
  if (score >= DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.reviewCandidateMin)
    return "review_candidate";
  return "weak_candidate";
}

export function scoreManualDossierCandidate(
  input: CreateManualDossierCandidateInput,
): {
  score: number;
  tier: DossierCandidateTier;
  confidence: "low" | "medium" | "high";
  publicSafetyNotes: string[];
  missingInfo: string[];
} {
  let score: number =
    DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.weakCandidateMin;
  const publicSafetyNotes = [
    ...(input.publicSafetyNotes ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  const missingInfo = [
    ...(input.missingInfo ?? []).map((item) => item.trim()).filter(Boolean),
  ];
  const combinedText = [
    input.name,
    input.reason,
    input.whyNow,
    input.evidenceSummary,
    ...(input.knownFacts ?? []),
    ...(input.doNotSay ?? []),
  ].join(" ");

  if (hasText(input.reason)) score += 8;
  else score -= 12;

  if (hasText(input.whyNow)) score += 8;
  if (hasText(input.evidenceSummary)) score += 10;
  else {
    score -= 8;
    missingInfo.push("Add a public-safe evidence summary before drafting.");
  }

  if (hasItems(input.knownFacts)) score += 10;
  else {
    score -= 6;
    missingInfo.push("Add operator-approved known facts before drafting.");
  }

  const recommendedFieldCount = [
    input.recommendedCategory,
    input.recommendedKind,
    input.recommendedEcosystemLane,
    input.recommendedIdentityAuthority,
    input.recommendedStatus,
    input.recommendedClearance,
    input.recommendedOrigin,
  ].filter(Boolean).length;
  score += recommendedFieldCount * 3;

  if (input.primaryLink?.url && input.primaryLink.publicSafe !== false)
    score += 5;
  if (hasItems(input.recommendedTags)) score += 5;

  if (!hasItems(publicSafetyNotes)) {
    score -= 5;
    publicSafetyNotes.push(
      "Public-safety review required before any draft or publication step.",
    );
  }

  if (IDENTITY_SENSITIVE_PATTERN.test(combinedText)) {
    score -= 15;
    publicSafetyNotes.push(
      "Possible private, payment, account, or identity-sensitive wording detected; review and remove before drafting.",
    );
  }

  score = Math.max(0, Math.min(100, score));
  const tier =
    hasText(input.reason) &&
    hasText(input.whyNow) &&
    hasText(input.evidenceSummary)
      ? tierForScore(score)
      : "weak_candidate";
  const confidence =
    score >= DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.draftReadyMin
      ? "high"
      : score >= DOSSIER_CANDIDATE_SCORING_POLICY.thresholds.reviewCandidateMin
        ? "medium"
        : "low";

  return { score, tier, confidence, publicSafetyNotes, missingInfo };
}

export const DOSSIER_SOURCE_BOUNDARIES: DossierSourceBoundary[] = [
  {
    source: "manual",
    label: "Manual operator intake",
    boundary:
      "Operator-entered candidate notes are workflow records only, not published dossiers.",
    allowedUse:
      "May create a candidate for review before BNL drafting is requested.",
  },
  {
    source: "rd_conversation",
    label: "R&D conversation",
    boundary:
      "Internal operator discussion evidence is not public automatically.",
    allowedUse:
      "May produce a candidate only; public copy still requires operator review.",
  },
  {
    source: "queue_frequency",
    label: "Queue frequency",
    boundary:
      "Repeated artist or song appearance across sessions is evidence only, not account identity.",
    allowedUse:
      "May support candidate priority but never auto-promotes a queue participant into a dossier.",
  },
  {
    source: "discord_context",
    label: "Discord context",
    boundary:
      "Internal or community context must not expose private user data and is not payment identity.",
    allowedUse:
      "May inform bounded evidence summaries for operator-selected candidates.",
  },
  {
    source: "website_read_model",
    label: "Website read model",
    boundary:
      "Public site state may include existing public-page dossiers and tags only.",
    allowedUse:
      "May help compare candidates against existing public database records.",
  },
  {
    source: "bnl_dynamic_candidate_discovery",
    label: "BNL dynamic candidate discovery",
    boundary:
      "BNL dynamic discovery creates Candidate Intake records first; it never publishes, drafts, confirms aliases, creates tags, or opens active Source Files automatically.",
    allowedUse:
      "May create an admin-only Candidate Intake record when no exact or possible existing source-file match is found; admin promotion is required before active source-file work.",
  },
  {
    source: "bnl_source_file_enrichment",
    label: "BNL Source File Enrichment",
    boundary:
      "BNL-generated enrichment is review-only internal case-file material; it is not discovery, public copy, or publication approval.",
    allowedUse:
      "May attach to an existing workflow lane for owner/admin review; it never creates public dossiers, confirms aliases, merges identities, or publishes by itself.",
  },
  {
    source: "combined",
    label: "Combined signals",
    boundary:
      "Multiple source signals still do not create dossiers automatically.",
    allowedUse:
      "May raise review priority when each evidence summary remains bounded and safe.",
  },
];

export const DOSSIER_WORKFLOW_RULES = [
  "Workflow records are not published dossier records.",
  "Drafts are not live website dossiers.",
  "Candidates are not identities or accounts.",
  "Queue frequency is evidence only.",
  "Discord and R&D context must be handled as internal evidence and not automatically public.",
  "BNL recommends and drafts only; admin operators approve and publish through future controlled site updates.",
  "No candidate source creates a dossier automatically.",
  "Drafting requires operator selection.",
  "Proposed tags are proposal-only until an operator or site content update creates them.",
  "AI/human/unknown nature tags do not organize dossiers; category, kind, ecosystem lane, and identity authority come first.",
  "Sheila/Cliff-style Network characters are BARCODE-controlled records, while mods are community-owned identities.",
  "Loose intake, strict drafting/publishing: BNL discoveries enter Candidate Intake first, active Source Files require admin promotion, and drafting/publishing require evidence, duplicate checks, public-safety review, and owner approval.",
] as const;
