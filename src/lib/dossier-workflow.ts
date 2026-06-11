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

export type DossierPopulationAuditRecordType =
  | "source_file"
  | "candidate_intake"
  | "dossier_update"
  | "recommendation"
  | "archived_or_closed";

export type DossierPopulationAutomationLevel =
  | "auto_clean_now"
  | "auto_merge_now"
  | "auto_attach_now"
  | "review_recommended"
  | "blocked_manual_resolution_required"
  | "keep_separate_not_same_subject";

export type DossierPopulationAutomationDangerLevel =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "blocked";

export type DossierPopulationAutomationChange = {
  label: string;
  detail: string;
};

export type DossierPopulationAutomationClassification = {
  automationLevel: DossierPopulationAutomationLevel;
  recommendedAction: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  targetRecord?: DossierPopulationAuditRecord;
  sourceRecords: DossierPopulationAuditRecord[];
  proposedChanges: DossierPopulationAutomationChange[];
  blockedReasons: string[];
  canRunAutomatically: boolean;
  requiresReview: boolean;
  safeActionLabel: string;
  dangerLevel: DossierPopulationAutomationDangerLevel;
};

export type DossierPopulationAuditRecord = {
  id: string;
  type: DossierPopulationAuditRecordType;
  name: string;
  status: string;
  href?: string;
  candidateId?: string;
  recommendationId?: string;
  publicDossierId?: string;
  publicDossierName?: string;
  confirmedAliasCount: number;
  proposedAliasCount: number;
  attachedRecommendationCount: number;
  sourceNoteCount: number;
  identityLinkCount: number;
  archiveCount: number;
  activeDraftCount: number;
  sourceLaneCount: number;
  hasPublicDossierLink: boolean;
  hasActiveDraft: boolean;
  hasUsefulUniqueData: boolean;
  missingLatestCaseReport: boolean;
};

export type DossierPopulationAuditDuplicateGroup = {
  id: string;
  reason: string;
  matchKind:
    | "normalized_name"
    | "confirmed_alias"
    | "public_dossier"
    | "recommendation_subject_key"
    | "bnl_recommendation_subject_name";
  publicDossierMatch?: { id: string; name?: string };
  records: DossierPopulationAuditRecord[];
  suggestedAction: string;
  automation: DossierPopulationAutomationClassification;
};

export type DossierPopulationAuditDuplicateRecommendationGroup = {
  id: string;
  canonicalRecommendationId: string;
  duplicateRecommendationIds: string[];
  recommendations: DossierPopulationAuditUnattachedRecommendation[];
  automation: DossierPopulationAutomationClassification;
};

export type DossierPopulationAuditSuppression = {
  id: string;
  groupId: string;
  recordIds: string[];
  reason?: string;
  createdAt: string;
  createdBy?: string;
};

export type DossierPopulationAuditUnattachedRecommendation = {
  id: string;
  subjectName: string;
  subjectKey?: string;
  ingestSource?: DossierRecommendationIngestSource;
  sourceLanes: DossierRecommendationSourceLane[];
  confidence?: DossierRecommendation["confidence"];
  createdAt: string;
  updatedAt: string;
  matchingSourceFileId?: string;
  matchingSourceFileName?: string;
  matchBasis?: string;
  href: string;
  safeNextAction: string;
  automation: DossierPopulationAutomationClassification;
};

export type DossierPopulationAudit = {
  counts: {
    activeSourceFiles: number;
    candidateIntake: number;
    existingDossierUpdates: number;
    publicDossiers: number;
    archivedClosedRecords: number;
    proposedIdentityLinks: number;
    confirmedIdentityLinks: number;
    recordsWithAttachedBnlRecommendations: number;
    unattachedBnlRecommendations: number;
    recordsMissingLatestCaseReportOrEnrichment: number;
  };
  records: DossierPopulationAuditRecord[];
  possibleDuplicateGroups: DossierPopulationAuditDuplicateGroup[];
  unattachedBnlRecommendations: DossierPopulationAuditUnattachedRecommendation[];
  duplicateRecommendationGroups: DossierPopulationAuditDuplicateRecommendationGroup[];
  safeAutomationSummary: {
    emptyDuplicates: number;
    safeMerges: number;
    recommendationsToAttach: number;
    duplicateRecommendationsToArchive: number;
    publicDossiersChanged: 0;
    publicPagesPublished: 0;
    reviewRequired: number;
    blocked: number;
  };
};

function uniqueStrings(
  ...groups: Array<Array<string | undefined> | undefined>
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const group of groups) {
    for (const item of group ?? []) {
      if (!item) continue;
      const trimmed = item.trim();
      const key = trimmed.toLowerCase();
      if (!trimmed || seen.has(key)) continue;
      seen.add(key);
      output.push(trimmed);
    }
  }
  return output;
}

function activeAuditDraftForCandidate(
  drafts: DossierDraft[],
  candidateId: string,
): DossierDraft | undefined {
  return drafts.find(
    (draft) =>
      draft.candidateId === candidateId &&
      draft.status !== "denied" &&
      draft.status !== "published" &&
      draft.status !== "superseded",
  );
}

function candidateAuditSubstance(input: {
  candidate: DossierCandidate;
  attachedRecommendationCount: number;
  activeDraftCount: number;
}): {
  sourceNoteCount: number;
  identityLinkCount: number;
  archiveCount: number;
  sourceLaneCount: number;
  hasPublicDossierLink: boolean;
  hasUsefulUniqueData: boolean;
} {
  const sourceNoteCount = (input.candidate.sourceFileNotes ?? []).filter(
    (note) => note.status === "active" && note.text.trim(),
  ).length;
  const identityLinkCount = (input.candidate.identityLinks ?? []).filter(
    (link) => link.status !== "rejected" && link.status !== "retired",
  ).length;
  const archiveCount = uniqueStrings(
    input.candidate.sourceFileArchiveIds,
    input.candidate.latestSourceFileArchiveId
      ? [input.candidate.latestSourceFileArchiveId]
      : [],
  ).length;
  const sourceLaneCount = (input.candidate.sourceLanes ?? []).length;
  const hasPublicDossierLink = Boolean(
    input.candidate.existingDossierMatch?.id,
  );
  const hasMeaningfulSummary = Boolean(
    input.candidate.sourceFileSummary?.summaryText?.trim() ||
    input.candidate.sourceFileSummary?.knownContext?.length ||
    input.candidate.sourceFileSummary?.openQuestions?.length ||
    input.candidate.latestSourceFileArchiveId ||
    input.candidate.latestSourceFileArchiveUpdatedAt,
  );
  const hasUsefulUniqueData = Boolean(
    sourceNoteCount > 0 ||
    input.attachedRecommendationCount > 0 ||
    identityLinkCount > 0 ||
    archiveCount > 0 ||
    input.activeDraftCount > 0 ||
    hasPublicDossierLink ||
    sourceLaneCount > 0 ||
    (input.candidate.evidenceItems ?? []).length > 0 ||
    (input.candidate.knownFacts ?? []).length > 0 ||
    (input.candidate.missingInfo ?? []).length > 0 ||
    (input.candidate.doNotSay ?? []).length > 0 ||
    (input.candidate.publicSafetyNotes ?? []).length > 0 ||
    hasMeaningfulSummary,
  );
  return {
    sourceNoteCount,
    identityLinkCount,
    archiveCount,
    sourceLaneCount,
    hasPublicDossierLink,
    hasUsefulUniqueData,
  };
}

function automationClassification(input: {
  automationLevel: DossierPopulationAutomationLevel;
  recommendedAction: string;
  confidence: "low" | "medium" | "high";
  reason: string;
  targetRecord?: DossierPopulationAuditRecord;
  sourceRecords?: DossierPopulationAuditRecord[];
  proposedChanges?: DossierPopulationAutomationChange[];
  blockedReasons?: string[];
  safeActionLabel: string;
  dangerLevel: DossierPopulationAutomationDangerLevel;
}): DossierPopulationAutomationClassification {
  const blockedReasons = input.blockedReasons ?? [];
  return {
    automationLevel: input.automationLevel,
    recommendedAction: input.recommendedAction,
    confidence: input.confidence,
    reason: input.reason,
    targetRecord: input.targetRecord,
    sourceRecords: input.sourceRecords ?? [],
    proposedChanges: input.proposedChanges ?? [],
    blockedReasons,
    canRunAutomatically:
      blockedReasons.length === 0 &&
      (input.automationLevel === "auto_clean_now" ||
        input.automationLevel === "auto_attach_now"),
    requiresReview: input.automationLevel === "review_recommended",
    safeActionLabel: input.safeActionLabel,
    dangerLevel: input.dangerLevel,
  };
}

function classifyDuplicateGroup(input: {
  groupId: string;
  matchKind: DossierPopulationAuditDuplicateGroup["matchKind"];
  reason: string;
  records: DossierPopulationAuditRecord[];
  suppressions: DossierPopulationAuditSuppression[];
}): DossierPopulationAutomationClassification {
  const records = uniqueAuditRecords(input.records);
  const candidateRecords = records.filter((record) => record.candidateId);
  const sortedCandidates = [...candidateRecords].sort((left, right) => {
    const rightScore =
      (right.hasPublicDossierLink ? 10 : 0) +
      (right.hasActiveDraft ? 5 : 0) +
      right.sourceNoteCount +
      right.attachedRecommendationCount +
      right.identityLinkCount +
      right.archiveCount;
    const leftScore =
      (left.hasPublicDossierLink ? 10 : 0) +
      (left.hasActiveDraft ? 5 : 0) +
      left.sourceNoteCount +
      left.attachedRecommendationCount +
      left.identityLinkCount +
      left.archiveCount;
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
  const targetRecord = sortedCandidates[0];
  const sourceRecords = targetRecord
    ? candidateRecords.filter((record) => record.id !== targetRecord.id)
    : records.slice(1);
  const recordIds = candidateRecords.map((record) => record.id).sort();
  const suppressed = input.suppressions.some((suppression) => {
    const suppressionIds = [...suppression.recordIds].sort();
    return (
      suppression.groupId === input.groupId ||
      (suppressionIds.length === recordIds.length &&
        suppressionIds.every((id, index) => id === recordIds[index]))
    );
  });
  if (suppressed) {
    return automationClassification({
      automationLevel: "keep_separate_not_same_subject",
      recommendedAction:
        "Keep separate; this false-positive pair was suppressed by an admin.",
      confidence: "high",
      reason: "Admin suppression says these records are not the same subject.",
      targetRecord,
      sourceRecords,
      safeActionLabel: "Kept Separate",
      dangerLevel: "none",
    });
  }

  const publicDossierIds = uniqueStrings(
    candidateRecords
      .map((record) => record.publicDossierId)
      .filter((id): id is string => Boolean(id)),
  );
  const blockedReasons: string[] = [];
  if (!targetRecord || candidateRecords.length < 2) {
    blockedReasons.push(
      "Source and target Source File records could not be resolved.",
    );
  }
  if (publicDossierIds.length > 1) {
    blockedReasons.push("Records point to different public dossiers.");
  }
  if (candidateRecords.filter((record) => record.hasActiveDraft).length > 1) {
    blockedReasons.push("Both records have active proposed dossiers.");
  }
  if (candidateRecords.some((record) => record.status === "merged")) {
    blockedReasons.push("A source record is already merged.");
  }
  if (blockedReasons.length > 0) {
    return automationClassification({
      automationLevel: "blocked_manual_resolution_required",
      recommendedAction:
        "Resolve the conflict manually before any merge or cleanup.",
      confidence: "high",
      reason: input.reason,
      targetRecord,
      sourceRecords,
      blockedReasons,
      safeActionLabel: "Manual Resolution Required",
      dangerLevel: "blocked",
    });
  }

  const proofIsStrong =
    input.matchKind === "normalized_name" ||
    input.matchKind === "confirmed_alias" ||
    input.matchKind === "public_dossier" ||
    input.matchKind === "recommendation_subject_key";
  const hasProposedAlias = candidateRecords.some(
    (record) => record.proposedAliasCount > 0,
  );
  if (!proofIsStrong || hasProposedAlias) {
    return automationClassification({
      automationLevel: "review_recommended",
      recommendedAction:
        "Review Merge field-by-field or mark Keep Separate before consolidation.",
      confidence: hasProposedAlias ? "medium" : "low",
      reason: hasProposedAlias
        ? "A proposed alias is present and cannot be used as confirmed duplicate evidence."
        : input.reason,
      targetRecord,
      sourceRecords,
      proposedChanges: [
        {
          label: "Review Merge",
          detail:
            "Compare target and incoming records before accepting changes.",
        },
        {
          label: "Keep Separate",
          detail: "Suppress this suggestion if it is not the same subject.",
        },
      ],
      safeActionLabel: "Review Merge",
      dangerLevel: "medium",
    });
  }

  const emptySources = sourceRecords.filter(
    (record) => !record.hasUsefulUniqueData,
  );
  if (emptySources.length === sourceRecords.length && emptySources.length > 0) {
    return automationClassification({
      automationLevel: "auto_clean_now",
      recommendedAction:
        "No unique info found. This record can be safely removed from the active workflow.",
      confidence: "high",
      reason: `${input.reason} The duplicate has no notes, recommendations, identity links, archive, active draft, public dossier link, unique lanes, or meaningful status history.`,
      targetRecord,
      sourceRecords: emptySources,
      proposedChanges: [
        {
          label: "Retire duplicate Source File",
          detail: "Mark empty duplicate records as merged into the target.",
        },
        {
          label: "Audit trail",
          detail:
            "Add internal merge metadata without changing public dossier copy.",
        },
      ],
      safeActionLabel: "Remove Empty Duplicate",
      dangerLevel: "low",
    });
  }

  return automationClassification({
    automationLevel: "auto_merge_now",
    recommendedAction:
      "Exact/confirmed duplicate records can be merged automatically after explicit admin action; useful non-conflicting internal data will be moved additively.",
    confidence: "high",
    reason: input.reason,
    targetRecord,
    sourceRecords,
    proposedChanges: [
      {
        label: "Will add aliases",
        detail:
          "Identity links move with original visibility, status, and matching flags.",
      },
      {
        label: "Will move notes",
        detail:
          "Source notes move with original timestamps, source, and createdBy metadata.",
      },
      {
        label: "Will attach BNL recommendations",
        detail:
          "Recommendation IDs and source lanes are preserved while retargeting to the merged Source File.",
      },
      {
        label: "Will preserve archive history",
        detail:
          "Archive IDs and latest enrichment are added only where the target lacks them.",
      },
      {
        label: "Will retire duplicate Source File",
        detail: "The incoming record is marked merged into the target.",
      },
      {
        label: "Will not change public dossier copy",
        detail: "No public dossier fields are edited or published.",
      },
      {
        label: "Will not publish identity",
        detail:
          "Internal aliases remain internal and useInPublicDossier is not escalated.",
      },
    ],
    safeActionLabel: "Auto-Merge Safe Duplicate",
    dangerLevel: "medium",
  });
}

function classifyUnattachedRecommendation(input: {
  recommendation: DossierRecommendation;
  matchingSourceFile?: DossierCandidate;
  matchBasis?: string;
}): DossierPopulationAutomationClassification {
  const recommendationRecord: DossierPopulationAuditRecord = {
    id: input.recommendation.id,
    type: "recommendation",
    name: input.recommendation.subjectName,
    status: input.recommendation.status,
    href: `/admin/dossiers/recommendations/${input.recommendation.id}`,
    recommendationId: input.recommendation.id,
    publicDossierId: input.recommendation.targetDossierId,
    confirmedAliasCount: 0,
    proposedAliasCount: 0,
    attachedRecommendationCount: 1,
    sourceNoteCount: 0,
    identityLinkCount: 0,
    archiveCount: 0,
    activeDraftCount: 0,
    sourceLaneCount: input.recommendation.sourceLanes.length,
    hasPublicDossierLink: Boolean(input.recommendation.targetDossierId),
    hasActiveDraft: false,
    hasUsefulUniqueData: true,
    missingLatestCaseReport: false,
  };
  if (!input.matchingSourceFile) {
    return automationClassification({
      automationLevel: "review_recommended",
      recommendedAction:
        "Review manually; decide whether this becomes a Dossier Seed, Dossier Update, or archive item.",
      confidence: "low",
      reason: "No exact Source File or confirmed alias match was found.",
      sourceRecords: [recommendationRecord],
      safeActionLabel: "Review Placement",
      dangerLevel: "medium",
    });
  }
  const targetRecord: DossierPopulationAuditRecord = {
    id: input.matchingSourceFile.id,
    type: "source_file",
    name: input.matchingSourceFile.name,
    status: input.matchingSourceFile.status,
    href: `/admin/dossiers/candidates/${input.matchingSourceFile.id}`,
    candidateId: input.matchingSourceFile.id,
    publicDossierId: input.matchingSourceFile.existingDossierMatch?.id,
    publicDossierName: input.matchingSourceFile.existingDossierMatch?.name,
    confirmedAliasCount: (input.matchingSourceFile.identityLinks ?? []).filter(
      (link) => link.status === "confirmed",
    ).length,
    proposedAliasCount: (input.matchingSourceFile.identityLinks ?? []).filter(
      (link) => link.status === "proposed",
    ).length,
    attachedRecommendationCount: 0,
    sourceNoteCount: (input.matchingSourceFile.sourceFileNotes ?? []).length,
    identityLinkCount: (input.matchingSourceFile.identityLinks ?? []).length,
    archiveCount: (input.matchingSourceFile.sourceFileArchiveIds ?? []).length,
    activeDraftCount: 0,
    sourceLaneCount: (input.matchingSourceFile.sourceLanes ?? []).length,
    hasPublicDossierLink: Boolean(
      input.matchingSourceFile.existingDossierMatch?.id,
    ),
    hasActiveDraft: false,
    hasUsefulUniqueData: true,
    missingLatestCaseReport: false,
  };
  return automationClassification({
    automationLevel: "auto_attach_now",
    recommendedAction:
      "This BNL Signal matches an existing Source File by confirmed alias/exact subject key. It will be attached for review.",
    confidence: "high",
    reason: `Matched by ${input.matchBasis ?? "exact subject"}; attachment remains review-only and does not publish.`,
    targetRecord,
    sourceRecords: [recommendationRecord],
    proposedChanges: [
      {
        label: "Attach to Existing Source File",
        detail:
          "Set the recommendation targetCandidateId to the matched Source File.",
      },
      {
        label: "Review-only source note",
        detail: "Add a non-public BNL source note for reviewer context.",
      },
      {
        label: "No public change",
        detail: "Public dossier text and publishing status stay untouched.",
      },
    ],
    safeActionLabel: "Attach Automatically",
    dangerLevel: "low",
  });
}

function isBnlRecommendation(
  recommendation: Pick<DossierRecommendation, "ingestSource" | "createdBy">,
): boolean {
  return (
    recommendation.createdBy === "bnl" ||
    recommendation.ingestSource === "bnl" ||
    recommendation.ingestSource === "bnl_dynamic_candidate_discovery" ||
    recommendation.ingestSource === "bnl_source_knowledge_bridge" ||
    recommendation.ingestSource === "bnl_source_file_enrichment"
  );
}

function isClosedPopulationCandidate(
  candidate: Pick<DossierCandidate, "status">,
): boolean {
  return (
    candidate.status === "archived" ||
    candidate.status === "denied" ||
    candidate.status === "merged"
  );
}

function candidatePopulationType(
  candidate: DossierCandidate,
): DossierPopulationAuditRecordType {
  if (isClosedPopulationCandidate(candidate)) return "archived_or_closed";
  if (candidate.status === "candidate_intake") return "candidate_intake";
  if (candidate.status === "existing_dossier_update") return "dossier_update";
  return "source_file";
}

function candidateMissingLatestCaseReportOrEnrichment(
  candidate: DossierCandidate,
): boolean {
  if (!isActiveSourceFileCandidate(candidate)) return false;
  const archive = candidate.latestSourceFileArchive;
  if (archive?.caseReportPresent === false) return true;
  return !Boolean(
    candidate.latestSourceFileArchiveUpdatedAt ||
    candidate.latestSourceFileArchiveId ||
    archive?.updatedAt ||
    candidate.sourceFileSummary?.updatedAt,
  );
}

function recordKey(
  record: Pick<DossierPopulationAuditRecord, "type" | "id">,
): string {
  return `${record.type}:${record.id}`;
}

function uniqueAuditRecords(
  records: DossierPopulationAuditRecord[],
): DossierPopulationAuditRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = recordKey(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function duplicateGroupAction(
  matchKind: DossierPopulationAuditDuplicateGroup["matchKind"],
  records: DossierPopulationAuditRecord[],
): string {
  if (matchKind === "confirmed_alias")
    return "Review manually; confirmed aliases may justify moving stale records out of the active lane.";
  if (matchKind === "public_dossier")
    return "Review manually; consider moving one record to Dossier Updates if it targets an existing public dossier.";
  if (records.some((record) => record.proposedAliasCount > 0)) {
    return "Review manually; proposed aliases need confirmation before they are used as duplicate evidence.";
  }
  return "Review manually before drafting; confirm alias or archive stale duplicate only after owner/admin decision.";
}

export function createDossierPopulationAudit(input: {
  candidates: DossierCandidate[];
  drafts?: DossierDraft[];
  recommendations?: DossierRecommendation[];
  publicDossiers?: Array<{ id: string; name: string }>;
  suppressions?: DossierPopulationAuditSuppression[];
}): DossierPopulationAudit {
  const recommendations = input.recommendations ?? [];
  const drafts = input.drafts ?? [];
  const suppressions = input.suppressions ?? [];
  const bnlRecommendations = recommendations.filter(isBnlRecommendation);
  const candidatesById = new Map(
    input.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const publicDossiersById = new Map(
    (input.publicDossiers ?? []).map((dossier) => [dossier.id, dossier]),
  );

  const bnlRecommendationIdsByCandidate = new Map<string, Set<string>>();
  for (const recommendation of bnlRecommendations) {
    for (const candidateId of [
      recommendation.targetCandidateId,
      recommendation.connectedCandidateId,
      recommendation.connectedSourceFileCandidateId,
    ]) {
      if (!candidateId) continue;
      const current =
        bnlRecommendationIdsByCandidate.get(candidateId) ?? new Set<string>();
      current.add(recommendation.id);
      bnlRecommendationIdsByCandidate.set(candidateId, current);
    }
  }
  for (const candidate of input.candidates) {
    for (const recommendationId of [
      ...(candidate.sourceRecommendationIds ?? []),
      ...(candidate.connectedRecommendationIds ?? []),
      candidate.createdFromRecommendationId,
      candidate.routedFromRecommendationId,
    ]) {
      if (!recommendationId) continue;
      const recommendation = bnlRecommendations.find(
        (item) => item.id === recommendationId,
      );
      if (!recommendation) continue;
      const current =
        bnlRecommendationIdsByCandidate.get(candidate.id) ?? new Set<string>();
      current.add(recommendation.id);
      bnlRecommendationIdsByCandidate.set(candidate.id, current);
    }
  }

  const records = input.candidates.map((candidate) => {
    const confirmedAliasCount = (candidate.identityLinks ?? []).filter(
      (link) => link.status === "confirmed",
    ).length;
    const proposedAliasCount = (candidate.identityLinks ?? []).filter(
      (link) => link.status === "proposed",
    ).length;
    const attachedRecommendationCount =
      bnlRecommendationIdsByCandidate.get(candidate.id)?.size ?? 0;
    const activeDraftCount = drafts.filter((draft) =>
      activeAuditDraftForCandidate([draft], candidate.id),
    ).length;
    const substance = candidateAuditSubstance({
      candidate,
      attachedRecommendationCount,
      activeDraftCount,
    });
    return {
      id: candidate.id,
      type: candidatePopulationType(candidate),
      name: candidate.name,
      status: candidate.status,
      href: `/admin/dossiers/candidates/${candidate.id}`,
      candidateId: candidate.id,
      publicDossierId: candidate.existingDossierMatch?.id,
      publicDossierName: candidate.existingDossierMatch?.name,
      confirmedAliasCount,
      proposedAliasCount,
      attachedRecommendationCount,
      sourceNoteCount: substance.sourceNoteCount,
      identityLinkCount: substance.identityLinkCount,
      archiveCount: substance.archiveCount,
      activeDraftCount,
      sourceLaneCount: substance.sourceLaneCount,
      hasPublicDossierLink: substance.hasPublicDossierLink,
      hasActiveDraft: activeDraftCount > 0,
      hasUsefulUniqueData: substance.hasUsefulUniqueData,
      missingLatestCaseReport:
        candidateMissingLatestCaseReportOrEnrichment(candidate),
    } satisfies DossierPopulationAuditRecord;
  });
  const recordByCandidateId = new Map(
    records.map((record) => [record.id, record]),
  );

  const clearlyAttachedRecommendationIds = new Set<string>();
  for (const recommendation of bnlRecommendations) {
    const targetCandidate = recommendation.targetCandidateId
      ? candidatesById.get(recommendation.targetCandidateId)
      : undefined;
    const connectedCandidate = recommendation.connectedCandidateId
      ? candidatesById.get(recommendation.connectedCandidateId)
      : undefined;
    const connectedSourceFile = recommendation.connectedSourceFileCandidateId
      ? candidatesById.get(recommendation.connectedSourceFileCandidateId)
      : undefined;
    if (
      [targetCandidate, connectedCandidate, connectedSourceFile].some(
        (candidate) =>
          candidate &&
          (candidate.status === "active_source_file" ||
            candidate.status === "existing_dossier_update" ||
            isActiveSourceFileCandidate(candidate)),
      ) ||
      recommendation.status === "attached_to_source_file" ||
      recommendation.status === "attached_to_existing_dossier_update" ||
      recommendation.status === "converted_to_source_file"
    ) {
      clearlyAttachedRecommendationIds.add(recommendation.id);
    }
  }

  const activeSourceFiles = input.candidates.filter(
    (candidate) =>
      !isClosedPopulationCandidate(candidate) &&
      isActiveSourceFileCandidate(candidate),
  );
  const activeSourceFilesByNormalizedName = new Map(
    activeSourceFiles.map((candidate) => [
      normalizeDossierSubjectName(candidate.name),
      candidate,
    ]),
  );
  const activeSourceFilesByConfirmedAlias = new Map<string, DossierCandidate>();
  for (const candidate of activeSourceFiles) {
    for (const link of candidate.identityLinks ?? []) {
      if (link.status !== "confirmed" || link.useForMatching !== true) continue;
      activeSourceFilesByConfirmedAlias.set(
        link.normalizedLabel || normalizeDossierSubjectName(link.label),
        candidate,
      );
    }
  }

  const unattachedBnlRecommendations = bnlRecommendations
    .filter(
      (recommendation) =>
        !clearlyAttachedRecommendationIds.has(recommendation.id),
    )
    .map((recommendation) => {
      const normalizedSubject = normalizeDossierSubjectName(
        recommendation.subjectName,
      );
      const normalizedSubjectKey = recommendation.subjectKey
        ? normalizeDossierSubjectName(recommendation.subjectKey)
        : "";
      const matchingSourceFile =
        activeSourceFilesByNormalizedName.get(normalizedSubject) ??
        (normalizedSubjectKey
          ? activeSourceFilesByNormalizedName.get(normalizedSubjectKey)
          : undefined) ??
        activeSourceFilesByConfirmedAlias.get(normalizedSubject) ??
        (normalizedSubjectKey
          ? activeSourceFilesByConfirmedAlias.get(normalizedSubjectKey)
          : undefined);
      const matchBasis = matchingSourceFile
        ? activeSourceFilesByConfirmedAlias.get(normalizedSubject) ===
            matchingSourceFile ||
          (normalizedSubjectKey &&
            activeSourceFilesByConfirmedAlias.get(normalizedSubjectKey) ===
              matchingSourceFile)
          ? "confirmed alias"
          : "normalized name"
        : undefined;
      return {
        id: recommendation.id,
        subjectName: recommendation.subjectName,
        subjectKey: recommendation.subjectKey,
        ingestSource: recommendation.ingestSource,
        sourceLanes: recommendation.sourceLanes,
        confidence: recommendation.confidence,
        createdAt: recommendation.createdAt,
        updatedAt: recommendation.updatedAt,
        matchingSourceFileId: matchingSourceFile?.id,
        matchingSourceFileName: matchingSourceFile?.name,
        matchBasis,
        href: `/admin/dossiers/recommendations/${recommendation.id}`,
        safeNextAction: matchingSourceFile
          ? "Attach to the matching Source File for review; do not publish or create a new Source File."
          : "Review manually; decide whether this becomes a Dossier Seed, Dossier Update, or archive item.",
        automation: classifyUnattachedRecommendation({
          recommendation,
          matchingSourceFile,
          matchBasis,
        }),
      } satisfies DossierPopulationAuditUnattachedRecommendation;
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const duplicateBuckets = new Map<
    string,
    {
      matchKind: DossierPopulationAuditDuplicateGroup["matchKind"];
      reason: string;
      publicDossierMatch?: { id: string; name?: string };
      records: DossierPopulationAuditRecord[];
    }
  >();

  function addBucketRecord(
    matchKind: DossierPopulationAuditDuplicateGroup["matchKind"],
    key: string,
    reason: string,
    record: DossierPopulationAuditRecord,
    publicDossierMatch?: { id: string; name?: string },
  ) {
    if (!key) return;
    const bucketKey = `${matchKind}:${key}`;
    const bucket = duplicateBuckets.get(bucketKey) ?? {
      matchKind,
      reason,
      publicDossierMatch,
      records: [],
    };
    bucket.records.push(record);
    duplicateBuckets.set(bucketKey, bucket);
  }

  for (const candidate of input.candidates) {
    const record = recordByCandidateId.get(candidate.id);
    if (!record || record.type === "archived_or_closed") continue;
    addBucketRecord(
      "normalized_name",
      normalizeDossierSubjectName(candidate.name),
      "Normalized exact name match.",
      record,
    );
    if (candidate.existingDossierMatch?.id) {
      addBucketRecord(
        "public_dossier",
        candidate.existingDossierMatch.id,
        "Shared public dossier target.",
        record,
        {
          id: candidate.existingDossierMatch.id,
          name: candidate.existingDossierMatch.name,
        },
      );
    }
    for (const link of candidate.identityLinks ?? []) {
      if (link.status !== "confirmed" || link.useForMatching !== true) continue;
      const aliasKey =
        link.normalizedLabel || normalizeDossierSubjectName(link.label);
      addBucketRecord(
        "confirmed_alias",
        aliasKey,
        "Confirmed alias match.",
        record,
      );
      for (const possibleAliasTarget of input.candidates) {
        if (possibleAliasTarget.id === candidate.id) continue;
        if (isClosedPopulationCandidate(possibleAliasTarget)) continue;
        if (
          normalizeDossierSubjectName(possibleAliasTarget.name) !== aliasKey
        ) {
          continue;
        }
        const possibleAliasTargetRecord = recordByCandidateId.get(
          possibleAliasTarget.id,
        );
        if (possibleAliasTargetRecord) {
          addBucketRecord(
            "confirmed_alias",
            aliasKey,
            "Confirmed alias match.",
            possibleAliasTargetRecord,
          );
        }
      }
    }
  }

  for (const recommendation of bnlRecommendations) {
    const record: DossierPopulationAuditRecord = {
      id: recommendation.id,
      type: "recommendation",
      name: recommendation.subjectName,
      status: recommendation.status,
      href: `/admin/dossiers/recommendations/${recommendation.id}`,
      recommendationId: recommendation.id,
      publicDossierId: recommendation.targetDossierId,
      publicDossierName: recommendation.targetDossierId
        ? publicDossiersById.get(recommendation.targetDossierId)?.name
        : undefined,
      confirmedAliasCount: 0,
      proposedAliasCount: 0,
      attachedRecommendationCount: 1,
      sourceNoteCount: 0,
      identityLinkCount: 0,
      archiveCount: 0,
      activeDraftCount: 0,
      sourceLaneCount: recommendation.sourceLanes.length,
      hasPublicDossierLink: Boolean(recommendation.targetDossierId),
      hasActiveDraft: false,
      hasUsefulUniqueData: true,
      missingLatestCaseReport: false,
    };
    addBucketRecord(
      "bnl_recommendation_subject_name",
      normalizeDossierSubjectName(recommendation.subjectName),
      "Same normalized subjectName from BNL recommendations.",
      record,
    );
    if (recommendation.subjectKey) {
      addBucketRecord(
        "recommendation_subject_key",
        normalizeDossierSubjectName(recommendation.subjectKey),
        "Same recommendation subjectKey.",
        record,
      );
    }
    if (recommendation.targetDossierId) {
      addBucketRecord(
        "public_dossier",
        recommendation.targetDossierId,
        "Shared public dossier target.",
        record,
        {
          id: recommendation.targetDossierId,
          name: publicDossiersById.get(recommendation.targetDossierId)?.name,
        },
      );
    }
  }

  const possibleDuplicateGroups = Array.from(duplicateBuckets.entries())
    .map(([bucketKey, bucket]) => {
      const id = bucketKey
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
      const records = uniqueAuditRecords(bucket.records);
      const automation = classifyDuplicateGroup({
        groupId: id,
        matchKind: bucket.matchKind,
        reason: bucket.reason,
        records,
        suppressions,
      });
      return {
        id,
        reason: bucket.reason,
        matchKind: bucket.matchKind,
        publicDossierMatch: bucket.publicDossierMatch,
        records,
        suggestedAction:
          automation.recommendedAction ||
          duplicateGroupAction(bucket.matchKind, bucket.records),
        automation,
      };
    })
    .filter(
      (group) =>
        group.records.length >= 2 &&
        group.automation.automationLevel !== "keep_separate_not_same_subject",
    )
    .sort(
      (left, right) =>
        right.records.length - left.records.length ||
        left.id.localeCompare(right.id),
    );

  const duplicateRecommendationGroups = Array.from(
    bnlRecommendations.reduce((map, recommendation) => {
      const evidenceDigest = normalizeDossierSubjectName(
        [
          recommendation.ingestKey,
          recommendation.subjectKey,
          recommendation.subjectName,
          recommendation.sourceLanes.join(","),
          recommendation.reason,
          recommendation.evidenceSummary,
        ]
          .filter(Boolean)
          .join("|"),
      );
      if (!evidenceDigest) return map;
      const current = map.get(evidenceDigest) ?? [];
      current.push(recommendation);
      map.set(evidenceDigest, current);
      return map;
    }, new Map<string, DossierRecommendation[]>()),
  )
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const sorted = [...group].sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      );
      const canonical = sorted[0];
      const duplicates = sorted.slice(1);
      const recommendationRecords = sorted.map(
        (recommendation) =>
          ({
            id: recommendation.id,
            subjectName: recommendation.subjectName,
            subjectKey: recommendation.subjectKey,
            ingestSource: recommendation.ingestSource,
            sourceLanes: recommendation.sourceLanes,
            confidence: recommendation.confidence,
            createdAt: recommendation.createdAt,
            updatedAt: recommendation.updatedAt,
            href: `/admin/dossiers/recommendations/${recommendation.id}`,
            safeNextAction:
              recommendation.id === canonical.id
                ? "Keep as canonical duplicate recommendation."
                : "Archive duplicate recommendation after preserving the canonical item.",
            automation: automationClassification({
              automationLevel:
                recommendation.id === canonical.id
                  ? "review_recommended"
                  : "auto_clean_now",
              recommendedAction:
                recommendation.id === canonical.id
                  ? "Keep canonical recommendation."
                  : "Archive duplicate recommendation; no unique evidence was detected.",
              confidence: "high",
              reason: "Same ingest key/subject/evidence digest.",
              sourceRecords: [],
              safeActionLabel:
                recommendation.id === canonical.id
                  ? "Canonical"
                  : "Archive Duplicate Recommendation",
              dangerLevel: recommendation.id === canonical.id ? "none" : "low",
            }),
          }) satisfies DossierPopulationAuditUnattachedRecommendation,
      );
      return {
        id: `duplicate-recommendations-${key}`
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase(),
        canonicalRecommendationId: canonical.id,
        duplicateRecommendationIds: duplicates.map(
          (recommendation) => recommendation.id,
        ),
        recommendations: recommendationRecords,
        automation: automationClassification({
          automationLevel: "auto_clean_now",
          recommendedAction:
            "Keep one canonical recommendation and archive duplicate recommendations with no unique evidence.",
          confidence: "high",
          reason: "Same ingest key/subject/evidence digest.",
          sourceRecords: [],
          proposedChanges: [
            { label: "Keep canonical recommendation", detail: canonical.id },
            {
              label: "Archive duplicate recommendations",
              detail: duplicates
                .map((recommendation) => recommendation.id)
                .join(", "),
            },
            {
              label: "Preserve unique evidence",
              detail:
                "Cleanup is only suggested when the digest proves no unique evidence.",
            },
          ],
          safeActionLabel: "Clean Duplicate Recommendations",
          dangerLevel: "low",
        }),
      } satisfies DossierPopulationAuditDuplicateRecommendationGroup;
    });

  return {
    counts: {
      activeSourceFiles: activeSourceFiles.length,
      candidateIntake: input.candidates.filter(
        (candidate) => candidate.status === "candidate_intake",
      ).length,
      existingDossierUpdates: input.candidates.filter(
        (candidate) => candidate.status === "existing_dossier_update",
      ).length,
      publicDossiers: input.publicDossiers?.length ?? 0,
      archivedClosedRecords: input.candidates.filter(
        isClosedPopulationCandidate,
      ).length,
      proposedIdentityLinks: input.candidates.reduce(
        (total, candidate) =>
          total +
          (candidate.identityLinks ?? []).filter(
            (link) => link.status === "proposed",
          ).length,
        0,
      ),
      confirmedIdentityLinks: input.candidates.reduce(
        (total, candidate) =>
          total +
          (candidate.identityLinks ?? []).filter(
            (link) => link.status === "confirmed",
          ).length,
        0,
      ),
      recordsWithAttachedBnlRecommendations: Array.from(
        bnlRecommendationIdsByCandidate.values(),
      ).filter((recommendationIds) => recommendationIds.size > 0).length,
      unattachedBnlRecommendations: unattachedBnlRecommendations.length,
      recordsMissingLatestCaseReportOrEnrichment: records.filter(
        (record) => record.missingLatestCaseReport,
      ).length,
    },
    records,
    possibleDuplicateGroups,
    unattachedBnlRecommendations,
    duplicateRecommendationGroups,
    safeAutomationSummary: {
      emptyDuplicates: possibleDuplicateGroups.filter(
        (group) => group.automation.automationLevel === "auto_clean_now",
      ).length,
      safeMerges: possibleDuplicateGroups.filter(
        (group) => group.automation.automationLevel === "auto_merge_now",
      ).length,
      recommendationsToAttach: unattachedBnlRecommendations.filter(
        (recommendation) =>
          recommendation.automation.automationLevel === "auto_attach_now",
      ).length,
      duplicateRecommendationsToArchive: duplicateRecommendationGroups.reduce(
        (total, group) => total + group.duplicateRecommendationIds.length,
        0,
      ),
      publicDossiersChanged: 0,
      publicPagesPublished: 0,
      reviewRequired:
        possibleDuplicateGroups.filter(
          (group) => group.automation.requiresReview,
        ).length +
        unattachedBnlRecommendations.filter(
          (recommendation) => recommendation.automation.requiresReview,
        ).length,
      blocked: possibleDuplicateGroups.filter(
        (group) =>
          group.automation.automationLevel ===
          "blocked_manual_resolution_required",
      ).length,
    },
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
  | "runDossierPopulationAutomation"
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
  "runDossierPopulationAutomation",
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
