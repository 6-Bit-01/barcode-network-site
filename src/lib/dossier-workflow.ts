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

export type DossierCandidateTier = "weak_candidate" | "review_candidate" | "draft_ready";

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
  | "needs_more_evidence";

export type DossierDraftStatus =
  | "draft"
  | "revision_requested"
  | "approved"
  | "denied"
  | "published";

export type DossierCategory = "Entity" | "Personnel" | "Sponsor" | "Interface" | "Production";
export type DossierPublicStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING" | "UNKNOWN";
export type DossierClearance = "PUBLIC" | "INTERNAL" | "RESTRICTED";
export type DossierOrigin = "KNOWN" | "UNKNOWN" | "UNVERIFIED" | "WITHHELD";

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
  confidence?: "low" | "medium" | "high";
  duplicateRisk?: DossierDuplicateRisk;
  existingDossierMatch?: { id: string; name: string; confidence: "low" | "medium" | "high" } | null;
  recommendedCategory?: DossierCategory;
  recommendedClearance?: DossierClearance;
  recommendedTags?: string[];
  proposedTags?: string[];
  missingInfo?: string[];
  doNotSay?: string[];
  publicSafetyNotes?: string[];
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

export type DossierWorkflowAction =
  | "createManualCandidate"
  | "selectCandidate"
  | "requestDraft"
  | "saveDraftEdit"
  | "requestRevision"
  | "approveDraft"
  | "denyCandidate"
  | "markNeedsMoreEvidence";

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
  "saveDraftEdit",
  "requestRevision",
  "approveDraft",
  "denyCandidate",
  "markNeedsMoreEvidence",
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
    queueRecurrence: "Repeated appearances across separate sessions can support candidacy.",
    rdConversation: "R&D discussion can support candidacy but is not public copy by itself.",
    discordContext: "Discord context is internal evidence and must be public-safe before use.",
    manualNomination: "Operator nomination can create a review candidate but still needs facts.",
    duplicatePenalty: "Likely duplicate dossiers should be merged or rejected before drafting.",
    privacyPenalty: "Private, payment, or identity-sensitive evidence blocks drafting.",
  },
  gate: "Loose intake, strict drafting/publishing.",
} as const;

export const DOSSIER_SOURCE_BOUNDARIES: DossierSourceBoundary[] = [
  {
    source: "manual",
    label: "Manual operator intake",
    boundary: "Operator-entered candidate notes are workflow records only, not published dossiers.",
    allowedUse: "May create a candidate for review before BNL drafting is requested.",
  },
  {
    source: "rd_conversation",
    label: "R&D conversation",
    boundary: "Internal operator discussion evidence is not public automatically.",
    allowedUse: "May produce a candidate only; public copy still requires operator review.",
  },
  {
    source: "queue_frequency",
    label: "Queue frequency",
    boundary: "Repeated artist or song appearance across sessions is evidence only, not account identity.",
    allowedUse: "May support candidate priority but never auto-promotes a queue participant into a dossier.",
  },
  {
    source: "discord_context",
    label: "Discord context",
    boundary: "Internal or community context must not expose private user data and is not payment identity.",
    allowedUse: "May inform bounded evidence summaries for operator-selected candidates.",
  },
  {
    source: "website_read_model",
    label: "Website read model",
    boundary: "Public site state may include existing public-page dossiers and tags only.",
    allowedUse: "May help compare candidates against existing public database records.",
  },
  {
    source: "combined",
    label: "Combined signals",
    boundary: "Multiple source signals still do not create dossiers automatically.",
    allowedUse: "May raise review priority when each evidence summary remains bounded and safe.",
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
  "Loose intake, strict drafting/publishing: candidates can enter review early, but drafting and publishing require evidence, duplicate checks, and public-safety review.",
] as const;
