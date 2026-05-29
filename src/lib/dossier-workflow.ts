export type DossierCandidateSource =
  | "manual"
  | "rd_conversation"
  | "queue_frequency"
  | "discord_context"
  | "website_read_model"
  | "combined";

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

export type DossierCandidate = {
  id: string;
  name: string;
  source: DossierCandidateSource;
  reason: string;
  evidenceSummary: string;
  evidenceCount?: number;
  confidence?: "low" | "medium" | "high";
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
    category?: "Entity" | "Personnel" | "Sponsor" | "Interface" | "Production";
    status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING" | "UNKNOWN";
    clearance?: "PUBLIC" | "INTERNAL" | "RESTRICTED";
    role?: string;
    origin?: "KNOWN" | "UNKNOWN" | "UNVERIFIED" | "WITHHELD";
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
] as const;
