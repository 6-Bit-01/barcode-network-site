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
  | "possible_connection_review"
  | "population_recommendation";

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
  | "no_new_info"
  | "not_population_subject"
  | "needs_more_info"
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
  | "bnl_population_recommender"
  | "system"
  | "unknown";


export type DossierPopulationRecommendedLane =
  | "active_source_file"
  | "existing_dossier_update"
  | "public_dossier_update_signal"
  | "candidate_intake"
  | "needs_population_review"
  | "already_represented"
  | "show_state_note"
  | "broadcast_memory_note"
  | "not_population_subject"
  | "unknown";

export type DossierPopulationRecommendedAction =
  | "attach_to_existing_source_file"
  | "attach_to_existing_dossier_update"
  | "create_dossier_update_workspace"
  | "create_source_file_candidate"
  | "admin_review_required"
  | "mark_duplicate_no_new_info"
  | "mark_no_new_info"
  | "mark_not_population_subject"
  | "show_state_note"
  | "broadcast_memory_note"
  | "not_population_subject"
  | "dismiss_population_recommendation"
  | "reopen_population_recommendation"
  | "unknown";

export type DossierPopulationReviewAction = {
  action: DossierPopulationRecommendedAction | "mark_needs_more_info";
  actionAt: string;
  actionBy?: string;
  actionReason?: string;
  targetCandidateId?: string;
  targetDossierId?: string;
};

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
  normalizedSourceLaneDetails?: string[];
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
  populationRecommendation?: boolean;
  recommendedLane?: DossierPopulationRecommendedLane;
  matchedExistingCandidateId?: string;
  matchedPublicDossierId?: string;
  matchedPublicDossierName?: string;
  matchedDossierUpdateCandidateId?: string;
  possibleTargets?: Array<{ id?: string; name?: string; lane?: string; confidence?: string }>;
  duplicateRisk?: DossierDuplicateRisk | "blocked";
  identityRisk?: DossierDuplicateRisk | "blocked";
  publicSafetyLevel?: "low" | "medium" | "high" | "blocked";
  adminSummary?: string;
  recommendedNextStep?: string;
  doNotPublishReason?: string;
  rawEvidenceRefs?: string[];
  rawEvidenceRefCount?: number;
  inputHash?: string;
  stale?: boolean;
  generatedAt?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  seenCount?: number;
  populationReviewActions?: DossierPopulationReviewAction[];
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

export type DossierPopulationAuditRecord = {
  id: string;
  type: DossierPopulationAuditRecordType;
  name: string;
  status: string;
  href?: string;
  candidateId?: string;
  recommendationId?: string;
  displayName?: string;
  publicDossierId?: string;
  publicDossierName?: string;
  confirmedAliasCount: number;
  proposedAliasCount: number;
  attachedRecommendationCount: number;
  missingLatestCaseReport: boolean;
  activeDraftStatus?: DossierDraftStatus;
  sourceNotesCount: number;
  hasLatestArchiveOrReport: boolean;
  uniqueInfo: string[];
  incomingInfo: string[];
  duplicateInfo: string[];
  sourceLanes?: DossierRecommendationSourceLane[];
};

export type DossierPopulationAutomationTier =
  | "Auto attach to kept Source File"
  | "Auto create Dossier Update workspace"
  | "Auto create Source File"
  | "Auto merge safe duplicate"
  | "Auto clean empty duplicate"
  | "Clean no-new-info duplicate recommendation"
  | "Create Source File candidate"
  | "Create Dossier Update workspace candidate"
  | "Attach to Existing Source File candidate"
  | "Select Target Manually"
  | "Source File merge candidate"
  | "Empty duplicate cleanup candidate"
  | "Recommendation-only duplicate group"
  | "Review required"
  | "Blocked"
  | "Needs Source File target";

export type DossierPopulationMergePlanSection = {
  title: string;
  newInfoToAdd: string[];
  alreadyRepresented: string[];
  irrelevantToKeptEntry: string[];
  needsReview: string[];
  blockedReason: string[];
  noActionNeeded: string[];
};


export type SubjectConsolidationBrief = {
  briefId: string;
  subjectDisplayName: string;
  canonicalSubjectKey: string;
  confidence: "high" | "medium" | "low";
  relationshipVerdict:
    | "same_subject"
    | "likely_same_subject"
    | "possible_same_subject"
    | "separate_subjects"
    | "needs_target_selection"
    | "blocked";
  operatorSummary: string;
  incomingSummaryBullets: string[];
  keptTargetSummaryBullets: string[];
  whatWillBeAbsorbed: string[];
  alreadyRepresented: string[];
  whatWillNotChange: string[];
  whyReviewIsNeeded: string[];
  recommendedAction:
    | "consolidate_into_kept_source_file"
    | "create_source_file_from_signals"
    | "create_dossier_update_workspace"
    | "select_target"
    | "keep_separate"
    | "blocked";
  targetOptions: Array<{
    candidateId: string;
    displayName: string;
    status: string;
    publicDossierMatch?: string;
    draftStatus?: string;
    reasonToKeep: string;
  }>;
  blockedReasons: string[];
  rawReferenceIds: {
    recommendationIds: string[];
    candidateIds: string[];
    archiveIds: string[];
  };
  generatedBy: "BNL";
  generatedAt: string;
  inputHash: string;
  clusterHash: string;
  stale: boolean;
};

export type DossierPopulationConsolidationPlan = {
  groupId: string;
  groupType: DossierPopulationAuditDuplicateGroup["matchKind"];
  confidence: "high" | "medium" | "low";
  reason: string;
  targetRecord?: DossierPopulationAuditRecord;
  sourceRecords: DossierPopulationAuditRecord[];
  targetDisplayName?: string;
  targetSourceFileLabel?: string;
  targetDisplayReason?: string;
  suggestedWorkspace?: "Dossier Update" | "New Source File / Candidate" | "Existing Source File";
  existingPublicDossier?: { id: string; name?: string };
  possibleTargetRecords: DossierPopulationAuditRecord[];
  targetSelectionReason: string;
  automationTier: DossierPopulationAutomationTier;
  recommendedNextStep: string;
  canBeAutomatedLater: boolean;
  requiresReview: boolean;
  blockedReasons: string[];
  mergePlanSections: DossierPopulationMergePlanSection[];
  bnlBrief?: SubjectConsolidationBrief;
  bnlBriefStatus: "needed" | "requested" | "ready" | "stale";
  bnlBriefRequestReason: string;
};

export type DossierPopulationAuditDuplicateGroup = {
  id: string;
  reason: string;
  matchKind:
    | "normalized_name"
    | "confirmed_alias"
    | "public_dossier"
    | "recommendation_subject_key"
    | "bnl_recommendation_subject_name"
    | "similar_name";
  publicDossierMatch?: { id: string; name?: string };
  records: DossierPopulationAuditRecord[];
  suggestedAction: string;
  consolidationPlan: DossierPopulationConsolidationPlan;
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
  likelyTargetId?: string;
  likelyTargetName?: string;
  planClassification: DossierPopulationAutomationTier;
  matchReason: string;
  wouldHappenLater: string;
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
};


export type DossierPopulationMethodOrigin =
  | "BNL recommendation"
  | "BNL source knowledge bridge"
  | "BNL dynamic candidate discovery"
  | "manual admin creation"
  | "public dossier update signal"
  | "existing public dossier workspace"
  | "source file refresh"
  | "source file archive"
  | "identity/alias link"
  | "diagnostic/test artifact"
  | "website read model"
  | "unknown / insufficient metadata";

export type DossierPopulationMethodLane =
  | "Active Source File"
  | "Candidate Intake"
  | "Dossier Update Workspace"
  | "Public Dossier Update Signal"
  | "BNL Recommendation Inbox"
  | "Diagnostic/Test Artifact"
  | "Resolved Incoming Record"
  | "Merged Source Record"
  | "Archived / Closed"
  | "Needs Population Review"
  | "Unknown / Unclassified";

export type DossierPopulationMethodVisibility =
  | "visible"
  | "hidden_with_destination"
  | "hidden_without_destination"
  | "hidden_valid_archive_or_diagnostic"
  | "hidden_destination_workspace";

export type DossierPopulationMethodAuditRecord = {
  id: string;
  subject: string;
  sourceType: "candidate" | "recommendation" | "draft" | "source_file_refresh_request";
  currentStatus: string;
  origin: DossierPopulationMethodOrigin;
  intendedLane: DossierPopulationMethodLane;
  visibility: DossierPopulationMethodVisibility;
  href?: string;
  candidateId?: string;
  recommendationId?: string;
  draftId?: string;
  publicDossierId?: string;
  publicDossierName?: string;
  destinationId?: string;
  destinationSubject?: string;
  destinationLane?: DossierPopulationMethodLane;
  destinationHref?: string;
  destinationVisible?: boolean;
  reason: string;
  recommendedAdminNextStep: string;
};

export type DossierPopulationMethodAuditWarning = {
  id: string;
  issueTitle: string;
  affectedSubject: string;
  affectedIds: string[];
  sourceType: string;
  currentStatus: string;
  expectedLane: DossierPopulationMethodLane;
  detectedDestination?: string;
  recommendedAdminNextStep: string;
};

export type DossierPopulationMethodAudit = {
  countsByOrigin: Record<DossierPopulationMethodOrigin, number>;
  countsByLane: Record<DossierPopulationMethodLane, number>;
  countsByVisibility: Record<DossierPopulationMethodVisibility, number>;
  intakeFlows: DossierPopulationMethodAuditRecord[];
  orphanedRecords: DossierPopulationMethodAuditRecord[];
  hiddenWithoutDestination: DossierPopulationMethodAuditRecord[];
  hiddenWithDestinations: DossierPopulationMethodAuditRecord[];
  visibleDestinationWorkspaces: DossierPopulationMethodAuditRecord[];
  diagnosticArtifacts: DossierPopulationMethodAuditRecord[];
  recordsNeedingPopulationReview: DossierPopulationMethodAuditRecord[];
  publicDossierUpdateSignals: DossierPopulationMethodAuditRecord[];
  sourceFileRefreshLinks: DossierPopulationMethodAuditRecord[];
  warnings: DossierPopulationMethodAuditWarning[];
};

const populationMethodOrigins: DossierPopulationMethodOrigin[] = [
  "BNL recommendation",
  "BNL source knowledge bridge",
  "BNL dynamic candidate discovery",
  "manual admin creation",
  "public dossier update signal",
  "existing public dossier workspace",
  "source file refresh",
  "source file archive",
  "identity/alias link",
  "diagnostic/test artifact",
  "website read model",
  "unknown / insufficient metadata",
];

const populationMethodLanes: DossierPopulationMethodLane[] = [
  "Active Source File",
  "Candidate Intake",
  "Dossier Update Workspace",
  "Public Dossier Update Signal",
  "BNL Recommendation Inbox",
  "Diagnostic/Test Artifact",
  "Resolved Incoming Record",
  "Merged Source Record",
  "Archived / Closed",
  "Needs Population Review",
  "Unknown / Unclassified",
];

const populationMethodVisibilities: DossierPopulationMethodVisibility[] = [
  "visible",
  "hidden_with_destination",
  "hidden_without_destination",
  "hidden_valid_archive_or_diagnostic",
  "hidden_destination_workspace",
];

function emptyCountMap<T extends string>(labels: T[]): Record<T, number> {
  return Object.fromEntries(labels.map((label) => [label, 0])) as Record<T, number>;
}

function publicDossierKey(value?: string) {
  return value ? normalizeDossierPossessiveVariantName(value) : "";
}

function candidatePublicDossierMatch(
  candidate: DossierCandidate,
  publicDossiersById: Map<string, { id: string; name: string }>,
  publicDossiersByName: Map<string, { id: string; name: string }>,
) {
  return candidate.existingDossierMatch ?? publicDossiersByName.get(publicDossierKey(candidate.name)) ?? (candidate.ingestKey ? publicDossiersById.get(candidate.ingestKey) : undefined);
}

function candidatePopulationMethodOrigin(candidate: DossierCandidate): DossierPopulationMethodOrigin {
  const text = [
    candidate.source,
    candidate.ingestSource,
    candidate.ingestKey,
    candidate.routingReason,
    candidate.mergeNote,
    candidate.reason,
    candidate.whyNow,
    ...(candidate.sourceLanes ?? []),
  ].filter(Boolean).join(" ");
  if (isDiagnosticTestArtifactCandidate(candidate)) return "diagnostic/test artifact";
  if ((candidate.identityLinks ?? []).length > 0 || candidate.connectedCandidateId || candidate.connectedSourceFileCandidateId) return "identity/alias link";
  if (candidate.source === "bnl_source_knowledge_bridge" || candidate.ingestSource === "bnl_source_knowledge_bridge") return "BNL source knowledge bridge";
  if (candidate.source === "bnl_dynamic_candidate_discovery" || candidate.ingestSource === "bnl_dynamic_candidate_discovery") return "BNL dynamic candidate discovery";
  if (/source file refresh|refresh request|missing_bnl_refresh|stale_source_file/i.test(text)) return "source file refresh";
  if (candidate.latestSourceFileArchiveId || candidate.latestSourceFileArchiveUpdatedAt || (candidate.sourceFileArchiveIds ?? []).length > 0) return "source file archive";
  if (candidate.source === "website_read_model" || (candidate.sourceLanes ?? []).includes("website_dossier")) return "website read model";
  if (candidate.status === "existing_dossier_update" || candidate.existingDossierMatch || /public dossier update|existing dossier update|dossier update/i.test(text)) return "public dossier update signal";
  if (candidate.source === "manual") return "manual admin creation";
  if (candidate.source === "bnl_source_file_enrichment" || candidate.ingestSource === "bnl_source_file_enrichment") return "source file refresh";
  return "unknown / insufficient metadata";
}

function recommendationPopulationMethodOrigin(recommendation: DossierRecommendation): DossierPopulationMethodOrigin {
  if (isDiagnosticTestArtifactRecommendation(recommendation)) return "diagnostic/test artifact";
  if (recommendation.type === "identity_link" || recommendation.connectedCandidateId || recommendation.connectedSourceFileCandidateId) return "identity/alias link";
  if (recommendation.ingestSource === "bnl_source_knowledge_bridge") return "BNL source knowledge bridge";
  if (recommendation.ingestSource === "bnl_dynamic_candidate_discovery") return "BNL dynamic candidate discovery";
  if (recommendation.ingestSource === "bnl_source_file_enrichment") return "source file refresh";
  if (recommendation.targetDossierId || recommendation.type === "modify_existing_dossier" || (recommendation.sourceLanes ?? []).includes("website_dossier")) return "public dossier update signal";
  if (recommendation.createdBy === "bnl" || recommendation.ingestSource === "bnl") return "BNL recommendation";
  if ((recommendation.sourceLanes ?? []).includes("admin_manual") || recommendation.createdBy === "admin" || recommendation.createdBy === "operator") return "manual admin creation";
  return "unknown / insufficient metadata";
}

function candidatePopulationMethodLane(candidate: DossierCandidate, origin: DossierPopulationMethodOrigin): DossierPopulationMethodLane {
  if (isDiagnosticTestArtifactCandidate(candidate)) return "Diagnostic/Test Artifact";
  if (candidate.status === "merged") return "Merged Source Record";
  if (candidate.status === "archived" || candidate.status === "denied") return "Archived / Closed";
  if (candidate.mergedIntoCandidateId || isConsolidationResolvedCandidate(candidate)) return "Resolved Incoming Record";
  if (candidate.status === "candidate_intake") return "Candidate Intake";
  if (candidate.status === "existing_dossier_update") return "Dossier Update Workspace";
  if (origin === "unknown / insufficient metadata") return "Needs Population Review";
  return "Active Source File";
}

function recommendationPopulationMethodLane(recommendation: DossierRecommendation, origin: DossierPopulationMethodOrigin): DossierPopulationMethodLane {
  if (origin === "diagnostic/test artifact") return "Diagnostic/Test Artifact";
  if (["archived", "dismissed", "ignored", "no_new_info", "not_population_subject"].includes(recommendation.status)) return "Archived / Closed";
  if (isResolvedDossierRecommendation(recommendation)) return "Resolved Incoming Record";
  if (origin === "public dossier update signal") return "Public Dossier Update Signal";
  if (origin === "unknown / insufficient metadata") return "Needs Population Review";
  return "BNL Recommendation Inbox";
}

function visibleDestinationCandidate(candidate?: DossierCandidate) {
  return Boolean(candidate && !isDiagnosticTestArtifactCandidate(candidate) && !isConsolidationResolvedCandidate(candidate) && candidate.status !== "archived" && candidate.status !== "denied" && candidate.status !== "merged");
}

function isPublicDossierSignal(origin: DossierPopulationMethodOrigin, lane: DossierPopulationMethodLane) {
  return origin === "public dossier update signal" || lane === "Public Dossier Update Signal";
}

export function createDossierPopulationMethodAudit(input: {
  candidates: DossierCandidate[];
  recommendations?: DossierRecommendation[];
  drafts?: DossierDraft[];
  publicDossiers?: Array<{ id: string; name: string }>;
  sourceFileRefreshRequests?: DossierSourceFileRefreshRequest[];
}): DossierPopulationMethodAudit {
  const recommendations = input.recommendations ?? [];
  const drafts = input.drafts ?? [];
  const publicDossiers = input.publicDossiers ?? [];
  const publicDossiersById = new Map(publicDossiers.map((dossier) => [dossier.id, dossier]));
  const publicDossiersByName = new Map(publicDossiers.map((dossier) => [publicDossierKey(dossier.name), dossier]));
  const candidatesById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const recommendationsById = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation]));
  const draftsByCandidateId = new Map(drafts.map((draft) => [draft.candidateId, draft]));
  const visibleWorkspaceByPublicDossierId = new Map<string, DossierCandidate>();
  const hiddenWorkspaceByPublicDossierId = new Map<string, DossierCandidate>();

  for (const candidate of input.candidates) {
    const match = candidatePublicDossierMatch(candidate, publicDossiersById, publicDossiersByName);
    if (!match?.id) continue;
    if (candidate.status !== "existing_dossier_update") continue;
    if (visibleDestinationCandidate(candidate)) visibleWorkspaceByPublicDossierId.set(match.id, candidate);
    else hiddenWorkspaceByPublicDossierId.set(match.id, candidate);
  }

  const records: DossierPopulationMethodAuditRecord[] = [];
  const warnings: DossierPopulationMethodAuditWarning[] = [];

  function candidateDestination(candidate: DossierCandidate, publicMatch?: { id: string; name: string } | null) {
    const direct = candidate.mergedIntoCandidateId ? candidatesById.get(candidate.mergedIntoCandidateId) : undefined;
    const connected = candidate.connectedSourceFileCandidateId ? candidatesById.get(candidate.connectedSourceFileCandidateId) : candidate.connectedCandidateId ? candidatesById.get(candidate.connectedCandidateId) : undefined;
    const byPublic = publicMatch?.id ? visibleWorkspaceByPublicDossierId.get(publicMatch.id) ?? hiddenWorkspaceByPublicDossierId.get(publicMatch.id) : undefined;
    const byRecommendation = (candidate.sourceRecommendationIds ?? []).concat(candidate.connectedRecommendationIds ?? [], candidate.createdFromRecommendationId ? [candidate.createdFromRecommendationId] : [])
      .map((id) => recommendationsById.get(id))
      .find((recommendation) => recommendation?.targetCandidateId || recommendation?.connectedCandidateId || recommendation?.connectedSourceFileCandidateId);
    const byRecommendationCandidate = byRecommendation ? candidatesById.get(byRecommendation.targetCandidateId ?? byRecommendation.connectedCandidateId ?? byRecommendation.connectedSourceFileCandidateId ?? "") : undefined;
    return direct ?? connected ?? byRecommendationCandidate ?? byPublic;
  }

  function recommendationDestination(recommendation: DossierRecommendation) {
    const direct = candidatesById.get(recommendation.targetCandidateId ?? "") ?? candidatesById.get(recommendation.connectedCandidateId ?? "") ?? candidatesById.get(recommendation.connectedSourceFileCandidateId ?? "");
    if (direct) return direct;
    if (recommendation.targetDossierId) return visibleWorkspaceByPublicDossierId.get(recommendation.targetDossierId) ?? hiddenWorkspaceByPublicDossierId.get(recommendation.targetDossierId);
    const nameMatch = publicDossiersByName.get(publicDossierKey(recommendation.subjectName));
    return nameMatch ? visibleWorkspaceByPublicDossierId.get(nameMatch.id) ?? hiddenWorkspaceByPublicDossierId.get(nameMatch.id) : undefined;
  }

  function addWarning(record: DossierPopulationMethodAuditRecord, issueTitle: string, recommendedAdminNextStep: string) {
    warnings.push({
      id: `${issueTitle}:${record.id}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
      issueTitle,
      affectedSubject: record.subject,
      affectedIds: [record.id, record.destinationId].filter(Boolean) as string[],
      sourceType: record.sourceType,
      currentStatus: record.currentStatus,
      expectedLane: record.intendedLane,
      detectedDestination: record.destinationSubject,
      recommendedAdminNextStep,
    });
  }

  for (const candidate of input.candidates) {
    const origin = candidatePopulationMethodOrigin(candidate);
    const lane = candidatePopulationMethodLane(candidate, origin);
    const publicMatch = candidatePublicDossierMatch(candidate, publicDossiersById, publicDossiersByName);
    const destination = candidateDestination(candidate, publicMatch);
    const hidden = isConsolidationResolvedCandidate(candidate) || candidate.status === "archived" || candidate.status === "denied" || candidate.status === "merged";
    const destinationVisible = visibleDestinationCandidate(destination);
    const visibility: DossierPopulationMethodVisibility = hidden
      ? destination
        ? destinationVisible
          ? "hidden_with_destination"
          : "hidden_without_destination"
        : origin === "diagnostic/test artifact" || candidate.status === "archived" || candidate.status === "denied"
          ? "hidden_valid_archive_or_diagnostic"
          : "hidden_without_destination"
      : lane === "Dossier Update Workspace" && isConsolidationResolvedCandidate(candidate)
        ? "hidden_destination_workspace"
        : "visible";
    const record: DossierPopulationMethodAuditRecord = {
      id: candidate.id,
      subject: candidate.name,
      sourceType: "candidate",
      currentStatus: candidate.status,
      origin,
      intendedLane: lane,
      visibility,
      href: `/admin/dossiers/candidates/${candidate.id}`,
      candidateId: candidate.id,
      publicDossierId: publicMatch?.id,
      publicDossierName: publicMatch?.name,
      destinationId: destination?.id,
      destinationSubject: destination?.existingDossierMatch?.name ?? destination?.name,
      destinationLane: destination ? candidatePopulationMethodLane(destination, candidatePopulationMethodOrigin(destination)) : undefined,
      destinationHref: destination ? `/admin/dossiers/candidates/${destination.id}` : undefined,
      destinationVisible,
      reason: destination ? `Routes to ${destination.name}.` : "No destination workspace detected.",
      recommendedAdminNextStep: destination ? "Review the destination workspace if the source record needs follow-up." : "Review origin metadata and decide whether this should become a Source File, Dossier Update workspace, archive item, or manual review item.",
    };
    records.push(record);

    if (candidate.mergedIntoCandidateId && !candidatesById.has(candidate.mergedIntoCandidateId)) addWarning(record, "Merged source record points nowhere", "Reconnect the merged source record to a valid destination or unhide it for manual review.");
    if (visibility === "hidden_without_destination") addWarning(record, isPublicDossierSignal(origin, lane) ? `Public dossier update signals for ${record.subject} were resolved, but no visible ${record.subject} Dossier Update workspace was found.` : "Hidden incoming record has no visible destination", "Create or attach a visible destination workspace, or mark the record as archived/diagnostic with clear metadata.");
    if (!hidden && origin === "diagnostic/test artifact" && lane !== "Diagnostic/Test Artifact") addWarning(record, "Diagnostic/test artifact is visible in a normal lane", "Archive the diagnostic artifact or keep it isolated from normal active lanes.");
    if (origin === "unknown / insufficient metadata") addWarning(record, "Source File record is missing clear origin metadata", "Add non-public origin metadata or move the record to population review.");
    if (candidate.status === "existing_dossier_update" && !hidden && !(candidate.sourceRecommendationIds ?? []).length && !(candidate.connectedRecommendationIds ?? []).length && !(candidate.sourceFileNotes ?? []).length && !publicMatch?.id && !draftsByCandidateId.has(candidate.id)) addWarning(record, "Dossier Update workspace has no bundled source links", "Confirm the workspace has sourceRecommendationIds, connectedRecommendationIds, source notes, or a public dossier match.");
    if (candidate.status === "existing_dossier_update" && hidden) addWarning(record, `Destination workspace for ${record.subject} exists but is currently hidden by resolved-candidate filtering.`, "Unhide the destination workspace or move the incoming records to a visible workspace.");
    if (isPublicDossierSignal(origin, lane) && hidden && !destinationVisible) addWarning(record, `Visible destination missing for canonical public dossier target ${record.publicDossierName ?? record.subject}.`, "Ensure the canonical public dossier target has a visible Dossier Update workspace.");
  }

  for (const recommendation of recommendations) {
    const origin = recommendationPopulationMethodOrigin(recommendation);
    const lane = recommendationPopulationMethodLane(recommendation, origin);
    const destination = recommendationDestination(recommendation);
    const hidden = isResolvedDossierRecommendation(recommendation) || ["archived", "dismissed", "ignored", "no_new_info", "not_population_subject"].includes(recommendation.status);
    const destinationVisible = visibleDestinationCandidate(destination);
    const publicMatch = recommendation.targetDossierId ? publicDossiersById.get(recommendation.targetDossierId) : publicDossiersByName.get(publicDossierKey(recommendation.subjectName));
    const visibility: DossierPopulationMethodVisibility = hidden
      ? destination
        ? destinationVisible
          ? "hidden_with_destination"
          : "hidden_without_destination"
        : origin === "diagnostic/test artifact" || ["archived", "dismissed", "ignored", "no_new_info", "not_population_subject"].includes(recommendation.status)
          ? "hidden_valid_archive_or_diagnostic"
          : "hidden_without_destination"
      : "visible";
    const record: DossierPopulationMethodAuditRecord = {
      id: recommendation.id,
      subject: recommendation.subjectName,
      sourceType: "recommendation",
      currentStatus: recommendation.status,
      origin,
      intendedLane: lane,
      visibility,
      href: `/admin/dossiers/recommendations/${recommendation.id}`,
      recommendationId: recommendation.id,
      publicDossierId: publicMatch?.id,
      publicDossierName: publicMatch?.name,
      destinationId: destination?.id,
      destinationSubject: destination?.existingDossierMatch?.name ?? destination?.name,
      destinationLane: destination ? candidatePopulationMethodLane(destination, candidatePopulationMethodOrigin(destination)) : undefined,
      destinationHref: destination ? `/admin/dossiers/candidates/${destination.id}` : undefined,
      destinationVisible,
      reason: destination ? `Routes to ${destination.name}.` : "No destination workspace detected.",
      recommendedAdminNextStep: destination ? "Review the destination workspace if the source record needs follow-up." : "Review whether this inbox item should attach to a Source File, become a Dossier Update workspace, or be archived.",
    };
    records.push(record);

    for (const targetId of [recommendation.targetCandidateId, recommendation.connectedCandidateId, recommendation.connectedSourceFileCandidateId].filter(Boolean) as string[]) {
      if (!candidatesById.has(targetId)) addWarning(record, "Recommendation points to a missing candidate destination", "Reconnect targetCandidateId / connectedCandidateId to a valid workspace or return the recommendation to review.");
    }
    if (visibility === "hidden_without_destination") addWarning(record, isPublicDossierSignal(origin, lane) ? `Public dossier update signals for ${record.subject} were resolved, but no visible ${record.subject} Dossier Update workspace was found.` : "Hidden incoming record has no visible destination", "Create or attach a visible destination workspace, or mark the record as archived/diagnostic with clear metadata.");
    if (origin === "diagnostic/test artifact" && !hidden) addWarning(record, "Diagnostic/test artifact is visible in a normal lane", "Archive the diagnostic artifact or keep it isolated from normal active lanes.");
    if (origin === "unknown / insufficient metadata") addWarning(record, "Incoming record has unknown origin metadata", "Add source, ingestSource, source lanes, or createdBy metadata before routing.");
    if (isPublicDossierSignal(origin, lane) && hidden && !destinationVisible) addWarning(record, `Visible destination missing for canonical public dossier target ${record.publicDossierName ?? record.subject}.`, "Ensure the canonical public dossier target has a visible Dossier Update workspace.");
  }

  for (const request of input.sourceFileRefreshRequests ?? []) {
    const destination = request.candidateId ? candidatesById.get(request.candidateId) : undefined;
    records.push({
      id: request.id,
      subject: request.subjectName,
      sourceType: "source_file_refresh_request",
      currentStatus: request.status,
      origin: "source file refresh",
      intendedLane: request.status === "completed" || request.status === "skipped" || request.status === "cancelled" ? "Resolved Incoming Record" : "Active Source File",
      visibility: destination ? "hidden_with_destination" : request.status === "completed" ? "hidden_without_destination" : "visible",
      href: destination ? `/admin/dossiers/candidates/${destination.id}` : undefined,
      candidateId: request.candidateId,
      destinationId: destination?.id,
      destinationSubject: destination?.name,
      destinationHref: destination ? `/admin/dossiers/candidates/${destination.id}` : undefined,
      destinationVisible: visibleDestinationCandidate(destination),
      reason: request.reason,
      recommendedAdminNextStep: destination ? "Review the linked Source File refresh result." : "Find or create the Source File destination for this refresh request.",
    });
  }

  const countsByOrigin = emptyCountMap(populationMethodOrigins);
  const countsByLane = emptyCountMap(populationMethodLanes);
  const countsByVisibility = emptyCountMap(populationMethodVisibilities);
  for (const record of records) {
    countsByOrigin[record.origin] += 1;
    countsByLane[record.intendedLane] += 1;
    countsByVisibility[record.visibility] += 1;
  }

  const hiddenWithoutDestination = records.filter((record) => record.visibility === "hidden_without_destination");
  const hiddenWithDestinations = records.filter((record) => record.visibility === "hidden_with_destination");
  const diagnosticArtifacts = records.filter((record) => record.origin === "diagnostic/test artifact" || record.intendedLane === "Diagnostic/Test Artifact");
  const recordsNeedingPopulationReview = records.filter((record) => record.intendedLane === "Needs Population Review" || record.origin === "unknown / insufficient metadata" || warnings.some((warning) => warning.affectedIds.includes(record.id)));
  const visibleDestinationWorkspaces = records.filter((record) => record.sourceType === "candidate" && record.destinationVisible !== false && (record.intendedLane === "Active Source File" || record.intendedLane === "Dossier Update Workspace") && record.visibility === "visible");

  return {
    countsByOrigin,
    countsByLane,
    countsByVisibility,
    intakeFlows: records,
    orphanedRecords: records.filter((record) => !record.destinationId && (record.intendedLane === "Needs Population Review" || record.visibility === "hidden_without_destination")),
    hiddenWithoutDestination,
    hiddenWithDestinations,
    visibleDestinationWorkspaces,
    diagnosticArtifacts,
    recordsNeedingPopulationReview,
    publicDossierUpdateSignals: records.filter((record) => isPublicDossierSignal(record.origin, record.intendedLane)),
    sourceFileRefreshLinks: records.filter((record) => record.origin === "source file refresh" || record.origin === "source file archive"),
    warnings,
  };
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




export function isDiagnosticTestArtifactRecommendation(
  recommendation: DossierRecommendation,
): boolean {
  const joined = [
    recommendation.subjectName,
    recommendation.subjectKey,
    recommendation.reason,
    recommendation.evidenceSummary,
    recommendation.ingestKey,
    recommendation.ingestSource,
    recommendation.createdBy,
    ...(recommendation.sourceTypes ?? []),
    ...(recommendation.knownContext ?? []),
    ...(recommendation.usefulEvidence ?? []),
  ].filter(Boolean).join(" ");
  return /checkpoint|smoke test|manual endpoint smoke test|diagnostic|\bprobe\b|\btest\b/i.test(joined);
}

export function isDiagnosticTestArtifactCandidate(candidate: DossierCandidate): boolean {
  const joined = [
    candidate.name,
    candidate.reason,
    candidate.whyNow,
    candidate.evidenceSummary,
    candidate.source,
    candidate.routingReason,
    ...(candidate.knownFacts ?? []),
    ...(candidate.evidenceItems ?? []),
    ...(candidate.sourceFileNotes ?? []).flatMap((note) => [note.text, note.ingestKey, note.ingestSource, note.createdBy]),
  ].filter(Boolean).join(" ");
  return /checkpoint|smoke test|manual endpoint smoke test|diagnostic|\bprobe\b|\btest\b/i.test(joined);
}

export function isResolvedDossierRecommendation(
  recommendation: DossierRecommendation,
): boolean {
  return [
    "attached_to_source_file",
    "attached_to_candidate_intake",
    "attached_to_existing_dossier_update",
    "converted_to_source_file",
    "identity_link_created",
    "ignored",
    "dismissed",
    "no_new_info",
    "not_population_subject",
    "archived",
  ].includes(recommendation.status);
}

export function isConsolidationResolvedCandidate(candidate: DossierCandidate): boolean {
  if (candidate.status === "merged" || candidate.status === "archived" || candidate.status === "denied") return true;
  if (candidate.mergedIntoCandidateId) return true;
  if (isDiagnosticTestArtifactCandidate(candidate)) return true;
  const isDestinationDossierUpdateWorkspace = Boolean(
    candidate.status === "existing_dossier_update" &&
      candidate.existingDossierMatch &&
      !candidate.mergedIntoCandidateId &&
      ((candidate.sourceRecommendationIds ?? []).length > 0 ||
        (candidate.connectedRecommendationIds ?? []).length > 0 ||
        (candidate.sourceFileNotes ?? []).length > 0),
  );
  if (isDestinationDossierUpdateWorkspace) return false;
  const lifecycleText = [
    candidate.mergeNote,
    candidate.routingReason,
    candidate.reason,
    candidate.whyNow,
  ].filter(Boolean).join(" ");
  return /variant_of_canonical|keep_separate_suppressed|bundled_into_dossier_update|Bundled .* update signals into .* Dossier Update workspace|Subject Consolidation archived diagnostic_test_artifact/i.test(lifecycleText);
}

function duplicateGroupPriority(
  matchKind: DossierPopulationAuditDuplicateGroup["matchKind"],
): number {
  if (matchKind === "public_dossier") return 6;
  if (matchKind === "confirmed_alias") return 5;
  if (matchKind === "bnl_recommendation_subject_name") return 4;
  if (matchKind === "recommendation_subject_key") return 3;
  if (matchKind === "normalized_name") return 2;
  if (matchKind === "similar_name") return 1;
  return 0;
}

function mergeCanonicalDuplicateGroups(
  groups: Array<{
    id: string;
    reason: string;
    matchKind: DossierPopulationAuditDuplicateGroup["matchKind"];
    publicDossierMatch?: { id: string; name?: string };
    records: DossierPopulationAuditRecord[];
  }>,
): Array<{
  id: string;
  reason: string;
  matchKind: DossierPopulationAuditDuplicateGroup["matchKind"];
  publicDossierMatch?: { id: string; name?: string };
  records: DossierPopulationAuditRecord[];
}> {
  const remaining = [...groups];
  const merged: typeof groups = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const component = [seed];
    const recordKeys = new Set(seed.records.map(recordKey));
    const publicDossierIds = new Set(
      seed.publicDossierMatch?.id ? [seed.publicDossierMatch.id] : [],
    );
    for (const record of seed.records) {
      if (record.publicDossierId) publicDossierIds.add(record.publicDossierId);
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        const candidateRecordKeys = candidate.records.map(recordKey);
        const candidatePublicIds = new Set(
          candidate.publicDossierMatch?.id ? [candidate.publicDossierMatch.id] : [],
        );
        for (const record of candidate.records) {
          if (record.publicDossierId) candidatePublicIds.add(record.publicDossierId);
        }
        const sharesRecord = candidateRecordKeys.some((key) => recordKeys.has(key));
        const sharesPublicDossier = Array.from(candidatePublicIds).some((id) =>
          publicDossierIds.has(id),
        );
        if (!sharesRecord && !sharesPublicDossier) continue;
        remaining.splice(index, 1);
        component.push(candidate);
        for (const key of candidateRecordKeys) recordKeys.add(key);
        for (const id of candidatePublicIds) publicDossierIds.add(id);
        changed = true;
      }
    }

    const records = uniqueAuditRecords(component.flatMap((group) => group.records));
    const primary = [...component].sort(
      (left, right) =>
        duplicateGroupPriority(right.matchKind) - duplicateGroupPriority(left.matchKind) ||
        left.id.localeCompare(right.id),
    )[0];
    const publicDossierMatch =
      component.find((group) => group.publicDossierMatch)?.publicDossierMatch ??
      records
        .map((record) =>
          record.publicDossierId
            ? { id: record.publicDossierId, name: record.publicDossierName }
            : undefined,
        )
        .find(Boolean);
    const idBase = publicDossierMatch
      ? `${primary.matchKind}:${publicDossierMatch.id}`
      : `${primary.matchKind}:${records.map((record) => recordKey(record)).sort().join(":")}`;
    merged.push({
      id: idBase
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase(),
      reason:
        publicDossierMatch?.name
          ? `Canonical subject cluster for ${publicDossierMatch.name}.`
          : primary.reason,
      matchKind: primary.matchKind,
      publicDossierMatch,
      records,
    });
  }

  return merged;
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


function auditRecordUniqueInfo(input: {
  confirmedAliasCount: number;
  proposedAliasCount: number;
  sourceNotesCount: number;
  attachedRecommendationCount: number;
  hasLatestArchiveOrReport: boolean;
  activeDraftStatus?: DossierDraftStatus;
  publicDossierId?: string;
}): string[] {
  const info: string[] = [];
  if (input.confirmedAliasCount > 0)
    info.push(`${input.confirmedAliasCount} confirmed alias${input.confirmedAliasCount === 1 ? "" : "es"}`);
  if (input.proposedAliasCount > 0)
    info.push(`${input.proposedAliasCount} proposed alias${input.proposedAliasCount === 1 ? "" : "es"}`);
  if (input.sourceNotesCount > 0)
    info.push(`${input.sourceNotesCount} active source note${input.sourceNotesCount === 1 ? "" : "s"}`);
  if (input.attachedRecommendationCount > 0)
    info.push(`${input.attachedRecommendationCount} BNL recommendation${input.attachedRecommendationCount === 1 ? "" : "s"}`);
  if (input.hasLatestArchiveOrReport) info.push("latest BNL archive or case report");
  if (input.activeDraftStatus) info.push(`active proposed dossier (${input.activeDraftStatus})`);
  if (input.publicDossierId) info.push("public dossier match");
  return info.length > 0 ? info : ["No unique useful data detected by consolidation scan."];
}

function recordHasUsefulData(record: DossierPopulationAuditRecord): boolean {
  return (
    record.confirmedAliasCount > 0 ||
    record.proposedAliasCount > 0 ||
    record.sourceNotesCount > 0 ||
    record.attachedRecommendationCount > 0 ||
    record.hasLatestArchiveOrReport ||
    Boolean(record.activeDraftStatus) ||
    Boolean(record.publicDossierId) ||
    record.incomingInfo.length > 0
  );
}

function realTargetPriority(record: DossierPopulationAuditRecord): number {
  if (record.type === "recommendation") return -1;
  let score = 0;
  if (record.publicDossierId) score += 1000;
  if (record.type === "source_file" || record.type === "dossier_update") score += 800;
  if (record.activeDraftStatus) score += 300;
  if (record.hasLatestArchiveOrReport) score += 150;
  if (record.confirmedAliasCount > 0) score += 100;
  if (record.type === "candidate_intake") score += 50;
  score += Math.min(record.sourceNotesCount, 20);
  score += Math.min(record.attachedRecommendationCount, 20);
  return score;
}

function targetSelectionReason(record?: DossierPopulationAuditRecord): string {
  if (!record)
    return "No Source File target resolved. A real Source File/candidate target is missing from this group.";
  if (record.publicDossierId)
    return "Selected because it is backed by an existing public dossier match.";
  if (record.type === "source_file" || record.type === "dossier_update")
    return "Selected because an active Source File / Case File is safer than candidate intake or loose recommendations.";
  if (record.activeDraftStatus)
    return "Selected because it has an active proposed dossier draft.";
  if (record.hasLatestArchiveOrReport)
    return "Selected because it has the latest BNL Source File archive or case report evidence.";
  if (record.confirmedAliasCount > 0)
    return "Selected because it has confirmed aliases that can safely support matching.";
  return "Selected because it is the real candidate record available for this group; recommendations cannot be merge targets.";
}

function planSection(
  title: string,
  input: Partial<DossierPopulationMergePlanSection>,
): DossierPopulationMergePlanSection {
  return {
    title,
    newInfoToAdd: input.newInfoToAdd ?? [],
    alreadyRepresented: input.alreadyRepresented ?? [],
    irrelevantToKeptEntry: input.irrelevantToKeptEntry ?? [],
    needsReview: input.needsReview ?? [],
    blockedReason: input.blockedReason ?? [],
    noActionNeeded: input.noActionNeeded ?? [],
  };
}

function targetDisplayName(record?: DossierPopulationAuditRecord): string | undefined {
  return record?.publicDossierName || record?.publicDossierId || record?.name;
}

function targetDisplayReason(record?: DossierPopulationAuditRecord): string | undefined {
  if (!record) return undefined;
  if (record.publicDossierName && record.publicDossierName !== record.name) {
    return "Target display is using the public dossier match.";
  }
  return undefined;
}

function createConsolidationPlan(input: {
  id: string;
  matchKind: DossierPopulationAuditDuplicateGroup["matchKind"];
  reason: string;
  records: DossierPopulationAuditRecord[];
}): DossierPopulationConsolidationPlan {
  const records = uniqueAuditRecords(input.records);
  const realRecords = records.filter((record) => record.type !== "recommendation");
  const recommendationRecords = records.filter((record) => record.type === "recommendation");
  const sortedTargets = [...realRecords].sort(
    (left, right) =>
      realTargetPriority(right) - realTargetPriority(left) ||
      left.status.localeCompare(right.status) ||
      left.id.localeCompare(right.id),
  );
  const publicDossierRecords = records.filter((record) => record.publicDossierId);
  const publicTargets = new Map<string, string | undefined>();
  for (const record of publicDossierRecords) {
    if (record.publicDossierId) {
      publicTargets.set(record.publicDossierId, record.publicDossierName);
    }
  }
  const possibleTargetRecords = sortedTargets;
  const topTargetScore = sortedTargets[0]
    ? realTargetPriority(sortedTargets[0])
    : undefined;
  const ambiguousTargetRecords =
    sortedTargets.length > 1 &&
    topTargetScore !== undefined &&
    realTargetPriority(sortedTargets[1]) === topTargetScore;
  const hasOnlyRecommendations = realRecords.length === 0;
  const selectedTargetRecord = ambiguousTargetRecords ? undefined : sortedTargets[0];
  const sourceRecords = selectedTargetRecord
    ? records.filter((record) => recordKey(record) !== recordKey(selectedTargetRecord))
    : records;
  const realSourceRecords = sourceRecords.filter(
    (record) => record.type !== "recommendation",
  );
  const activeDraftCount = realRecords.filter(
    (record) => record.activeDraftStatus,
  ).length;
  const blockedReasons: string[] = [];
  if (publicTargets.size > 1)
    blockedReasons.push("Different public dossier matches are present.");
  if (activeDraftCount > 1)
    blockedReasons.push("Multiple real records have active proposed dossiers.");
  if (records.some((record) => record.status === "merged" || record.status === "deleted")) {
    blockedReasons.push("Already merged/deleted record involved.");
  }

  const hasRecommendationSources = recommendationRecords.length > 0;
  const hasRealDuplicateSources = realSourceRecords.length > 0;
  const allRealSourcesEmpty =
    hasRealDuplicateSources && realSourceRecords.every((record) => !recordHasUsefulData(record));
  const sharedPublicTarget = publicTargets.size === 1;
  const existingPublicDossier = sharedPublicTarget
    ? {
        id: Array.from(publicTargets.keys())[0],
        name: Array.from(publicTargets.values())[0],
      }
    : undefined;
  const targetRecord = selectedTargetRecord;
  const existingWorkspaceTarget = Boolean(targetRecord);
  const suggestedWorkspace: DossierPopulationConsolidationPlan["suggestedWorkspace"] =
    targetRecord
      ? "Existing Source File"
      : sharedPublicTarget
        ? "Dossier Update"
        : hasOnlyRecommendations
          ? "New Source File / Candidate"
          : undefined;

  let automationTier: DossierPopulationAutomationTier = "Review required";
  if (blockedReasons.length > 0) {
    automationTier = "Blocked";
  } else if (ambiguousTargetRecords) {
    automationTier = "Select Target Manually";
  } else if (hasOnlyRecommendations && sharedPublicTarget) {
    automationTier = "Create Dossier Update workspace candidate";
  } else if (hasOnlyRecommendations) {
    automationTier = "Create Source File candidate";
  } else if (hasRecommendationSources && existingWorkspaceTarget && !hasRealDuplicateSources) {
    automationTier = "Attach to Existing Source File candidate";
  } else if (allRealSourcesEmpty) {
    automationTier = "Empty duplicate cleanup candidate";
  } else if (
    hasRealDuplicateSources &&
    (input.matchKind === "normalized_name" ||
      input.matchKind === "confirmed_alias" ||
      input.matchKind === "public_dossier")
  ) {
    automationTier = "Source File merge candidate";
  }
  if (
    automationTier !== "Blocked" &&
    records.some((record) => record.proposedAliasCount > 0) &&
    input.matchKind !== "confirmed_alias"
  ) {
    automationTier = "Review required";
  }

  const canBeAutomatedLater = [
    "Create Source File candidate",
    "Create Dossier Update workspace candidate",
    "Attach to Existing Source File candidate",
    "Source File merge candidate",
    "Empty duplicate cleanup candidate",
  ].includes(automationTier);
  const requiresReview = !canBeAutomatedLater || records.some((record) => record.proposedAliasCount > 0);
  const noTargetExplanation = sharedPublicTarget
    ? `These are duplicate or related BNL recommendations for an existing public dossier, but no Dossier Update workspace exists in this group yet. The next action is to create/select a Dossier Update workspace later.`
    : "These are duplicate or related BNL recommendations, but no Source File target exists in this group yet. The next action is to attach them to an existing Source File if one matches, or create/select a Source File target later.";
  const publicDossierUpdateExplanation =
    (targetRecord?.publicDossierId || (hasOnlyRecommendations && sharedPublicTarget)) &&
    hasRecommendationSources
      ? `Existing public dossier match found. This should be reviewed as an update/attachment to the canonical ${targetDisplayName(targetRecord) ?? existingPublicDossier?.name ?? existingPublicDossier?.id} record, not merged into a separate duplicate Source File.`
      : undefined;
  const manualTargetExplanation = ambiguousTargetRecords
    ? "Several possible Source File targets have equal priority. Select the correct target manually before any future action."
    : undefined;

  return {
    groupId: input.id,
    groupType: input.matchKind,
    confidence:
      input.matchKind === "confirmed_alias" || input.matchKind === "public_dossier"
        ? "high"
        : input.matchKind === "similar_name"
          ? "low"
        : input.matchKind === "normalized_name"
          ? "medium"
          : "low",
    reason: publicDossierUpdateExplanation ?? manualTargetExplanation ?? input.reason,
    targetRecord,
    sourceRecords,
    targetDisplayName: targetDisplayName(targetRecord),
    targetSourceFileLabel: targetRecord?.name,
    targetDisplayReason: targetDisplayReason(targetRecord),
    suggestedWorkspace,
    existingPublicDossier,
    possibleTargetRecords,
    targetSelectionReason: ambiguousTargetRecords
      ? "No single Source File target was selected because multiple possible targets have the same priority."
      : targetSelectionReason(targetRecord),
    automationTier,
    recommendedNextStep: ambiguousTargetRecords
      ? manualTargetExplanation ?? "Select the target manually before any future automation."
      : hasOnlyRecommendations
        ? noTargetExplanation
        : canBeAutomatedLater
          ? `${automationTier}: server-side consolidation can process this after the admin runs Subject Consolidation.`
          : "Admin review required before consolidation can mutate records.",
    canBeAutomatedLater,
    requiresReview,
    blockedReasons: hasOnlyRecommendations && !sharedPublicTarget
      ? ["No Source File target resolved."]
      : blockedReasons,
    bnlBrief: undefined,
    bnlBriefStatus: "needed",
    bnlBriefRequestReason: "BNL consolidation brief needed before review.",
    mergePlanSections: [
      planSection("New info to add", {
        newInfoToAdd: sourceRecords.flatMap((record) => record.incomingInfo),
        noActionNeeded: sourceRecords.flatMap((record) => record.incomingInfo).length
          ? []
          : ["No new incoming information detected."],
      }),
      planSection("Already represented / duplicate info", {
        alreadyRepresented: [
          ...sourceRecords.flatMap((record) => record.duplicateInfo),
          ...(targetRecord?.publicDossierId && hasRecommendationSources
            ? ["Incoming recommendation already points at the same public dossier target."]
            : []),
        ],
        noActionNeeded: sourceRecords.every((record) => record.duplicateInfo.length === 0)
          ? ["No duplicate facts were identified by this consolidation scan."]
          : [],
      }),
      planSection("Irrelevant to kept entry", {
        irrelevantToKeptEntry: sourceRecords
          .filter((record) => record.type === "recommendation" && !targetRecord)
          .map((record) =>
            suggestedWorkspace
              ? `${record.name} is incoming recommendation material for a ${suggestedWorkspace} workspace, not a Source File merge target.`
              : `${record.name} cannot be merged until a Source File target exists.`,
          ),
      }),
      planSection("Needs review", {
        needsReview: [
          ...(sourceRecords.some((record) => record.proposedAliasCount > 0)
            ? ["Proposed aliases require human confirmation before matching."]
            : []),
          ...(publicDossierUpdateExplanation ? [publicDossierUpdateExplanation] : []),
          ...(hasOnlyRecommendations ? [noTargetExplanation] : []),
          ...(manualTargetExplanation ? [manualTargetExplanation] : []),
        ],
      }),
      planSection("Blocked reason", {
        blockedReason: hasOnlyRecommendations && !sharedPublicTarget
          ? ["No Source File target resolved."]
          : blockedReasons,
        noActionNeeded: blockedReasons.length === 0 && !(hasOnlyRecommendations && !sharedPublicTarget)
          ? ["No blocker detected by this planning pass."]
          : [],
      }),
      planSection("No action needed", {
        noActionNeeded: [
          "Public dossier copy will not change.",
          "Internal aliases stay internal.",
          "Nothing publishes automatically.",
          "Consolidation does not publish public pages.",
        ],
      }),
    ],
  };
}

export function createDossierPopulationAudit(input: {
  candidates: DossierCandidate[];
  recommendations?: DossierRecommendation[];
  publicDossiers?: Array<{ id: string; name: string }>;
  drafts?: DossierDraft[];
}): DossierPopulationAudit {
  const recommendations = input.recommendations ?? [];
  const bnlRecommendations = recommendations.filter((recommendation) =>
    isBnlRecommendation(recommendation) &&
    !isDiagnosticTestArtifactRecommendation(recommendation),
  );
  const workflowCandidates = input.candidates.filter(
    (candidate) => !isDiagnosticTestArtifactCandidate(candidate),
  );
  const candidatesById = new Map(
    workflowCandidates.map((candidate) => [candidate.id, candidate]),
  );
  const publicDossiersById = new Map(
    (input.publicDossiers ?? []).map((dossier) => [dossier.id, dossier]),
  );
  const publicDossiersByPossessiveName = new Map(
    (input.publicDossiers ?? []).map((dossier) => [
      normalizeDossierPossessiveVariantName(dossier.name),
      dossier,
    ]),
  );
  const activeDraftByCandidateId = new Map<string, DossierDraft>();
  for (const draft of input.drafts ?? []) {
    if (
      draft.status === "draft" ||
      draft.status === "owner_changes_requested" ||
      draft.status === "ready_for_owner_review"
    ) {
      activeDraftByCandidateId.set(draft.candidateId, draft);
    }
  }

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
  for (const candidate of workflowCandidates) {
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

  const records = workflowCandidates.map((candidate) => {
    const confirmedAliasCount = (candidate.identityLinks ?? []).filter(
      (link) => link.status === "confirmed",
    ).length;
    const proposedAliasCount = (candidate.identityLinks ?? []).filter(
      (link) => link.status === "proposed",
    ).length;
    const canonicalPublicDossier = candidate.existingDossierMatch ??
      publicDossiersByPossessiveName.get(normalizeDossierPossessiveVariantName(candidate.name));
    return {
      id: candidate.id,
      type: candidatePopulationType(candidate),
      name: candidate.name,
      status: candidate.status,
      href: `/admin/dossiers/candidates/${candidate.id}`,
      candidateId: candidate.id,
      displayName: canonicalPublicDossier?.name ?? candidate.name,
      publicDossierId: canonicalPublicDossier?.id,
      publicDossierName: canonicalPublicDossier?.name,
      confirmedAliasCount,
      proposedAliasCount,
      attachedRecommendationCount:
        bnlRecommendationIdsByCandidate.get(candidate.id)?.size ?? 0,
      missingLatestCaseReport:
        candidateMissingLatestCaseReportOrEnrichment(candidate),
      activeDraftStatus: activeDraftByCandidateId.get(candidate.id)?.status,
      sourceNotesCount: (candidate.sourceFileNotes ?? []).filter(
        (note) => note.status === "active",
      ).length,
      hasLatestArchiveOrReport: Boolean(
        candidate.latestSourceFileArchiveUpdatedAt ||
          candidate.latestSourceFileArchiveId ||
          candidate.latestSourceFileArchive?.caseReportPresent,
      ),
      incomingInfo: [
        ...(candidate.evidenceSummary ? [`Source evidence: ${candidate.evidenceSummary}`] : []),
        ...((candidate.sourceFileNotes ?? [])
          .filter((note) => note.status === "active" && note.text)
          .slice(0, 2)
          .map((note) => `Source note: ${note.text}`)),
      ],
      duplicateInfo: candidate.existingDossierMatch?.name
        ? [`Already connected to public dossier ${candidate.existingDossierMatch.name}.`]
        : [],
      sourceLanes: candidate.sourceLanes,
      uniqueInfo: auditRecordUniqueInfo({
        confirmedAliasCount,
        proposedAliasCount,
        sourceNotesCount: (candidate.sourceFileNotes ?? []).filter(
          (note) => note.status === "active",
        ).length,
        attachedRecommendationCount:
          bnlRecommendationIdsByCandidate.get(candidate.id)?.size ?? 0,
        hasLatestArchiveOrReport: Boolean(
          candidate.latestSourceFileArchiveUpdatedAt ||
            candidate.latestSourceFileArchiveId ||
            candidate.latestSourceFileArchive?.caseReportPresent,
        ),
        activeDraftStatus: activeDraftByCandidateId.get(candidate.id)?.status,
        publicDossierId: candidate.existingDossierMatch?.id,
      }),
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
      !isDiagnosticTestArtifactCandidate(candidate) &&
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

  const openBnlRecommendationsForConsolidation = bnlRecommendations.filter(
    (recommendation) =>
      (recommendation.status === "new" || recommendation.status === "reviewing") &&
      !clearlyAttachedRecommendationIds.has(recommendation.id),
  );

  const unattachedBnlRecommendations = openBnlRecommendationsForConsolidation
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
          ? "Classification only: eligible to attach later after the classifier is approved."
          : "Needs Source File target: decide whether this becomes a Dossier Seed, Dossier Update, or archive item.",
        likelyTargetId: matchingSourceFile?.id,
        likelyTargetName: matchingSourceFile?.existingDossierMatch?.name ?? matchingSourceFile?.name,
        planClassification: matchingSourceFile
          ? "Attach to Existing Source File candidate"
          : recommendation.targetDossierId
            ? "Create Dossier Update workspace candidate"
            : "Create Source File candidate",
        matchReason: matchingSourceFile
          ? matchingSourceFile.existingDossierMatch?.name
            ? `Existing public dossier match found for ${matchingSourceFile.existingDossierMatch.name}; route as update/attachment, not a Source File merge.`
            : `Exact/confirmed ${matchBasis ?? "subject"} match to active Source File.`
          : recommendation.targetDossierId
            ? "Existing public dossier match found, but no Source File/Dossier Update workspace target exists yet."
            : "No exact normalized-name, subjectKey, or confirmed-alias active Source File target exists yet.",
        wouldHappenLater: matchingSourceFile
          ? "Later automation could attach this recommendation to the existing Source File without changing public dossier copy."
          : recommendation.targetDossierId
            ? "Later automation could create a Dossier Update workspace for the existing public dossier without changing public copy."
            : "Later automation could create a new Source File / Candidate workspace after review.",
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

  for (const candidate of workflowCandidates) {
    const record = recordByCandidateId.get(candidate.id);
    if (!record || record.type === "archived_or_closed") continue;
    addBucketRecord(
      "normalized_name",
      normalizeDossierSubjectName(candidate.name),
      "Normalized exact name match.",
      record,
    );
    const canonicalPublicDossier = candidate.existingDossierMatch ??
      publicDossiersByPossessiveName.get(normalizeDossierPossessiveVariantName(candidate.name));
    if (canonicalPublicDossier?.id) {
      addBucketRecord(
        "public_dossier",
        canonicalPublicDossier.id,
        "Shared public dossier target.",
        record,
        {
          id: canonicalPublicDossier.id,
          name: canonicalPublicDossier.name,
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
      for (const possibleAliasTarget of workflowCandidates) {
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

  for (let leftIndex = 0; leftIndex < workflowCandidates.length; leftIndex += 1) {
    const left = workflowCandidates[leftIndex];
    if (isClosedPopulationCandidate(left)) continue;
    const leftRecord = recordByCandidateId.get(left.id);
    if (!leftRecord) continue;
    for (const right of workflowCandidates.slice(leftIndex + 1)) {
      if (isClosedPopulationCandidate(right)) continue;
      if (!hasSimilarDossierSubjectName(left.name, right.name)) continue;
      const leftKey = normalizeDossierSubjectName(left.name);
      const rightKey = normalizeDossierSubjectName(right.name);
      if (leftKey === rightKey || compactDossierSubjectName(left.name) === compactDossierSubjectName(right.name)) continue;
      const rightRecord = recordByCandidateId.get(right.id);
      if (!rightRecord) continue;
      const key = [leftKey, rightKey].sort().join(":");
      const variantReason = hasPossessiveVariantSubjectName(left.name, right.name)
        ? `Variant needs review: ${left.name} / ${right.name}`
        : "Similar names only; admin must decide whether these are the same subject.";
      addBucketRecord(
        "similar_name",
        key,
        variantReason,
        leftRecord,
      );
      addBucketRecord(
        "similar_name",
        key,
        variantReason,
        rightRecord,
      );
    }
  }

  for (const recommendation of openBnlRecommendationsForConsolidation) {
    const record: DossierPopulationAuditRecord = {
      id: recommendation.id,
      type: "recommendation",
      name: recommendation.subjectName,
      status: recommendation.status,
      href: `/admin/dossiers/recommendations/${recommendation.id}`,
      recommendationId: recommendation.id,
      displayName: recommendation.targetDossierId
        ? publicDossiersById.get(recommendation.targetDossierId)?.name ??
          recommendation.subjectName
        : recommendation.subjectName,
      publicDossierId: recommendation.targetDossierId,
      publicDossierName: recommendation.targetDossierId
        ? publicDossiersById.get(recommendation.targetDossierId)?.name
        : undefined,
      confirmedAliasCount: 0,
      proposedAliasCount: 0,
      attachedRecommendationCount: 1,
      missingLatestCaseReport: false,
      sourceNotesCount: 0,
      hasLatestArchiveOrReport: false,
      incomingInfo: [
        `Incoming recommendation subject: ${recommendation.subjectName}`,
        ...(recommendation.reason ? [`Recommendation reason: ${recommendation.reason}`] : []),
        ...(recommendation.evidenceSummary ? [`Recommendation summary: ${recommendation.evidenceSummary}`] : []),
        ...(recommendation.sourceLanes.length > 0
          ? [`Source lanes: ${recommendation.sourceLanes.join(", ")}`]
          : []),
        ...(recommendation.targetDossierId
          ? [
              `Public dossier match: ${
                publicDossiersById.get(recommendation.targetDossierId)?.name ??
                recommendation.targetDossierId
              }`,
            ]
          : []),
      ],
      duplicateInfo: recommendation.targetDossierId
        ? [
            `Recommendation already points at public dossier ${
              publicDossiersById.get(recommendation.targetDossierId)?.name ??
              recommendation.targetDossierId
            }.`,
          ]
        : [],
      sourceLanes: recommendation.sourceLanes,
      uniqueInfo: auditRecordUniqueInfo({
        confirmedAliasCount: 0,
        proposedAliasCount: 0,
        sourceNotesCount: 0,
        attachedRecommendationCount: 1,
        hasLatestArchiveOrReport: false,
        activeDraftStatus: undefined,
        publicDossierId: recommendation.targetDossierId,
      }),
    };
    const recommendationSubjectKey = normalizeDossierSubjectName(
      recommendation.subjectName,
    );
    const subjectKeyRecord = recommendation.subjectKey
      ? normalizeDossierSubjectName(recommendation.subjectKey)
      : "";
    const matchingRecommendationSourceFile =
      activeSourceFilesByNormalizedName.get(recommendationSubjectKey) ??
      (subjectKeyRecord
        ? activeSourceFilesByNormalizedName.get(subjectKeyRecord)
        : undefined) ??
      activeSourceFilesByConfirmedAlias.get(recommendationSubjectKey) ??
      (subjectKeyRecord
        ? activeSourceFilesByConfirmedAlias.get(subjectKeyRecord)
        : undefined);
    addBucketRecord(
      "bnl_recommendation_subject_name",
      recommendationSubjectKey,
      matchingRecommendationSourceFile
        ? "BNL recommendation subject matches an active Source File target."
        : "Same normalized subjectName from BNL recommendations.",
      record,
    );
    const matchingRecommendationSourceFileRecord = matchingRecommendationSourceFile
      ? recordByCandidateId.get(matchingRecommendationSourceFile.id)
      : undefined;
    if (matchingRecommendationSourceFileRecord) {
      addBucketRecord(
        "bnl_recommendation_subject_name",
        recommendationSubjectKey,
        "BNL recommendation subject matches an active Source File target.",
        matchingRecommendationSourceFileRecord,
      );
    }
    if (recommendation.subjectKey) {
      addBucketRecord(
        "recommendation_subject_key",
        subjectKeyRecord,
        matchingRecommendationSourceFile
          ? "Recommendation subjectKey matches an active Source File target."
          : "Same recommendation subjectKey.",
        record,
      );
      if (matchingRecommendationSourceFileRecord) {
        addBucketRecord(
          "recommendation_subject_key",
          subjectKeyRecord,
          "Recommendation subjectKey matches an active Source File target.",
          matchingRecommendationSourceFileRecord,
        );
      }
    }
    const recommendationPublicDossier = recommendation.targetDossierId
      ? publicDossiersById.get(recommendation.targetDossierId)
      : recommendation.subjectKey
        ? publicDossiersById.get(recommendation.subjectKey) ??
          publicDossiersByPossessiveName.get(normalizeDossierPossessiveVariantName(recommendation.subjectKey))
        : publicDossiersByPossessiveName.get(normalizeDossierPossessiveVariantName(recommendation.subjectName));
    if (recommendationPublicDossier?.id) {
      addBucketRecord(
        "public_dossier",
        recommendationPublicDossier.id,
        "Shared public dossier target.",
        record,
        {
          id: recommendationPublicDossier.id,
          name: recommendationPublicDossier.name,
        },
      );
    }
  }

  const possibleDuplicateGroups = mergeCanonicalDuplicateGroups(
    Array.from(duplicateBuckets.entries())
      .map(([bucketKey, bucket]) => ({
        id: bucketKey
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase(),
        reason: bucket.reason,
        matchKind: bucket.matchKind,
        publicDossierMatch: bucket.publicDossierMatch,
        records: uniqueAuditRecords(bucket.records),
      }))
      .filter((group) => group.records.length >= 2),
  )
    .map((group) => ({
      ...group,
      suggestedAction: duplicateGroupAction(group.matchKind, group.records),
      consolidationPlan: createConsolidationPlan({
        id: group.id,
        matchKind: group.matchKind,
        reason: group.reason,
        records: group.records,
      }),
    }))
    .sort(
      (left, right) =>
        right.records.length - left.records.length ||
        left.id.localeCompare(right.id),
    );

  return {
    counts: {
      activeSourceFiles: activeSourceFiles.length,
      candidateIntake: workflowCandidates.filter(
        (candidate) => candidate.status === "candidate_intake",
      ).length,
      existingDossierUpdates: workflowCandidates.filter(
        (candidate) => candidate.status === "existing_dossier_update",
      ).length,
      publicDossiers: input.publicDossiers?.length ?? 0,
      archivedClosedRecords: workflowCandidates.filter(
        isClosedPopulationCandidate,
      ).length,
      proposedIdentityLinks: workflowCandidates.reduce(
        (total, candidate) =>
          total +
          (candidate.identityLinks ?? []).filter(
            (link) => link.status === "proposed",
          ).length,
        0,
      ),
      confirmedIdentityLinks: workflowCandidates.reduce(
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

export function normalizeDossierPossessiveVariantName(value: string): string {
  const normalized = normalizeDossierSubjectName(value);
  if (!normalized) return normalized;
  return normalized.replace(/\s+s$/i, "").trim();
}

export function compactDossierSubjectName(value: string): string {
  return normalizeDossierSubjectName(value).replace(/\s+/g, "");
}

function hasPossessiveVariantSubjectName(left: string, right: string): boolean {
  const normalizedLeft = normalizeDossierSubjectName(left);
  const normalizedRight = normalizeDossierSubjectName(right);
  const possessiveLeft = normalizeDossierPossessiveVariantName(left);
  const possessiveRight = normalizeDossierPossessiveVariantName(right);
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      normalizedLeft !== normalizedRight &&
      possessiveLeft &&
      possessiveLeft === possessiveRight,
  );
}

function hasSimilarDossierSubjectName(left: string, right: string): boolean {
  const normalizedLeft = normalizeDossierSubjectName(left);
  const normalizedRight = normalizeDossierSubjectName(right);
  const compactLeft = compactDossierSubjectName(left);
  const compactRight = compactDossierSubjectName(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight || compactLeft === compactRight) {
    return false;
  }
  if (normalizedLeft.length < 4 || normalizedRight.length < 4) return false;
  return (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft) ||
    compactLeft.includes(compactRight) ||
    compactRight.includes(compactLeft)
  );
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
  normalizedSourceLaneDetails?: string[];
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
  populationRecommendation?: boolean;
  recommendedLane?: DossierPopulationRecommendedLane;
  matchedExistingCandidateId?: string;
  matchedPublicDossierId?: string;
  matchedPublicDossierName?: string;
  matchedDossierUpdateCandidateId?: string;
  possibleTargets?: Array<{ id?: string; name?: string; lane?: string; confidence?: string }>;
  duplicateRisk?: DossierDuplicateRisk | "blocked";
  identityRisk?: DossierDuplicateRisk | "blocked";
  publicSafetyLevel?: "low" | "medium" | "high" | "blocked";
  adminSummary?: string;
  recommendedNextStep?: string;
  doNotPublishReason?: string;
  rawEvidenceRefs?: string[];
  inputHash?: string;
  stale?: boolean;
  generatedAt?: string;
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
  | "runSubjectConsolidation"
  | "consolidateSubjectGroup"
  | "detectDuplicateCandidates"
  | "mergeCandidates"
  | "createMasterDraftFromMerge"
  | "attach_to_existing_source_file"
  | "attach_to_existing_dossier_update"
  | "create_dossier_update_workspace"
  | "create_source_file_candidate"
  | "mark_no_new_info"
  | "mark_not_population_subject"
  | "dismiss_population_recommendation"
  | "reopen_population_recommendation"
  | "mark_needs_more_info";

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
  "runSubjectConsolidation",
  "consolidateSubjectGroup",
  "detectDuplicateCandidates",
  "mergeCandidates",
  "createMasterDraftFromMerge",
  "attach_to_existing_source_file",
  "attach_to_existing_dossier_update",
  "create_dossier_update_workspace",
  "create_source_file_candidate",
  "mark_no_new_info",
  "mark_not_population_subject",
  "dismiss_population_recommendation",
  "reopen_population_recommendation",
  "mark_needs_more_info",
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
