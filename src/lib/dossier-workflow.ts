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
  sourceFileNotes?: DossierSourceFileNote[];
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
  | "modify_existing_dossier";

export type DossierRecommendationStatus =
  | "new"
  | "reviewing"
  | "attached_to_source_file"
  | "converted_to_source_file"
  | "ignored"
  | "dismissed";

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
  suggestedAction?: string;
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
};


export type DossierSubjectMatchResult = {
  exactCandidateId?: string;
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

function isActiveSubjectCandidate(candidate: DossierCandidate): boolean {
  return candidate.status !== "denied" && candidate.status !== "merged";
}

function hasPossibleSubjectOverlap(subjectName: string, candidateName: string): boolean {
  const normalizedSubject = normalizeDossierSubjectName(subjectName);
  const normalizedCandidate = normalizeDossierSubjectName(candidateName);
  const compactSubject = compactDossierSubjectName(subjectName);
  const compactCandidate = compactDossierSubjectName(candidateName);

  if (!normalizedSubject || !normalizedCandidate) return false;
  if (normalizedSubject === normalizedCandidate || compactSubject === compactCandidate)
    return false;
  if (normalizedSubject.length < 4 || normalizedCandidate.length < 4) return false;

  return (
    normalizedSubject.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedSubject) ||
    compactSubject.includes(compactCandidate) ||
    compactCandidate.includes(compactSubject)
  );
}

export function matchDossierRecommendationSubject(input: {
  recommendation: Pick<DossierRecommendation, "subjectName" | "subjectKey">;
  candidates: DossierCandidate[];
}): DossierSubjectMatchResult {
  const activeCandidates = input.candidates.filter(isActiveSubjectCandidate);
  const subjectName = input.recommendation.subjectName;
  const normalizedSubject = normalizeDossierSubjectName(subjectName);
  const compactSubject = compactDossierSubjectName(subjectName);
  const normalizedSubjectKey = input.recommendation.subjectKey
    ? normalizeDossierSubjectName(input.recommendation.subjectKey)
    : "";
  const compactSubjectKey = input.recommendation.subjectKey
    ? compactDossierSubjectName(input.recommendation.subjectKey)
    : "";

  const exactCandidate = activeCandidates.find((candidate) => {
    const normalizedCandidate = normalizeDossierSubjectName(candidate.name);
    const compactCandidate = compactDossierSubjectName(candidate.name);
    return (
      Boolean(normalizedSubject) &&
      (normalizedSubject === normalizedCandidate ||
        compactSubject === compactCandidate ||
        (Boolean(normalizedSubjectKey) &&
          (normalizedSubjectKey === normalizedCandidate ||
            compactSubjectKey === compactCandidate)))
    );
  });

  const possibleCandidateIds = activeCandidates
    .filter((candidate) => candidate.id !== exactCandidate?.id)
    .filter((candidate) => hasPossibleSubjectOverlap(subjectName, candidate.name))
    .map((candidate) => candidate.id);

  if (exactCandidate) {
    return {
      exactCandidateId: exactCandidate.id,
      possibleCandidateIds,
      reason: "Exact same-subject match by normalized name, compact name, or explicit subject key.",
    };
  }

  if (possibleCandidateIds.length > 0) {
    return {
      possibleCandidateIds,
      reason: "Possible duplicate / identity warning from weak partial subject similarity; owner/lead identity resolution is required before attach.",
    };
  }

  return {
    possibleCandidateIds: [],
    reason: "No safe same-subject BNL Source File match found.",
  };
}

export type CreateDossierSourceFileNoteInput = {
  candidateId: string;
  type?: DossierSourceFileNoteType;
  text: string;
  source?: DossierSourceFileNoteSource;
  publicSafe?: boolean;
  appliesToDraftId?: string;
  createdBy?: string;
};

export type CreateDossierRecommendationInput = {
  type: DossierRecommendationType;
  subjectName: string;
  subjectKey?: string;
  targetDossierId?: string;
  targetCandidateId?: string;
  reason: string;
  evidenceSummary?: string;
  confidence?: "low" | "medium" | "high";
  sourceLanes?: DossierRecommendationSourceLane[];
  suggestedAction?: string;
  missingInfo?: string[];
  publicSafetyNotes?: string[];
  doNotSay?: string[];
  recommendedTags?: string[];
  recommendedCategory?: DossierCandidate["recommendedCategory"];
  recommendedKind?: DossierCandidate["recommendedKind"];
  recommendedEcosystemLane?: DossierCandidate["recommendedEcosystemLane"];
  recommendedIdentityAuthority?: DossierCandidate["recommendedIdentityAuthority"];
  createdBy?: string;
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
  | "addSourceFileNote"
  | "createDossierRecommendation"
  | "attachRecommendationToCandidate"
  | "convertRecommendationToCandidate"
  | "ignoreDossierRecommendation"
  | "dismissDossierRecommendation"
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
  "addSourceFileNote",
  "createDossierRecommendation",
  "attachRecommendationToCandidate",
  "convertRecommendationToCandidate",
  "ignoreDossierRecommendation",
  "dismissDossierRecommendation",
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
  "Loose intake, strict drafting/publishing: candidates can enter review early, but drafting and publishing require evidence, duplicate checks, and public-safety review.",
] as const;
