import {
  databasePage,
  type DatabaseEntry,
  type DossierEcosystemLane,
  type DossierIdentityAuthority,
  type PublicDossierKind,
} from "@/content";
import { dossierAuthoringGuide } from "@/lib/dossier-authoring-guide";
import type { DossierDraftBlueprint } from "@/lib/dossier-classification";
import { buildDossierTagRegistry } from "@/lib/dossier-tags";
import {
  DOSSIER_CATEGORY_OPTIONS,
  DOSSIER_ECOSYSTEM_LANE_OPTIONS,
  DOSSIER_IDENTITY_AUTHORITY_OPTIONS,
  DOSSIER_KIND_OPTIONS,
  DOSSIER_TAXONOMY_GUIDE,
} from "@/lib/dossier-taxonomy";
import type {
  DossierCandidate,
  DossierCategory,
  DossierClearance,
  DossierOrigin,
  DossierPublicStatus,
  DossierWorkflowLink,
} from "@/lib/dossier-workflow";

export type DossierDraftContractOutput = {
  name: string;
  category: DossierCategory;
  kind: PublicDossierKind;
  ecosystemLane: DossierEcosystemLane;
  identityAuthority: DossierIdentityAuthority;
  status: DossierPublicStatus;
  clearance: DossierClearance;
  origin: DossierOrigin;
  role: string;
  summary: string;
  notes: string;
  tags: string[];
  proposedTags: string[];
  primaryLink?: DossierWorkflowLink | null;
  links: DossierWorkflowLink[];
  files: [];
  missingInfoQuestions: string[];
  ownerReviewWarnings: string[];
  publicSafetyWarnings: string[];
  unsupportedClaimsRejected: string[];
  sourceUsageSummary: string;
};

export const DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS = [
  "name",
  "category",
  "kind",
  "ecosystemLane",
  "identityAuthority",
  "status",
  "clearance",
  "origin",
  "role",
  "summary",
  "notes",
  "tags",
  "proposedTags",
  "primaryLink",
  "links",
  "files",
  "missingInfoQuestions",
  "ownerReviewWarnings",
  "publicSafetyWarnings",
  "unsupportedClaimsRejected",
  "sourceUsageSummary",
] as const satisfies readonly (keyof DossierDraftContractOutput)[];

export const DOSSIER_DRAFT_CONTRACT = {
  version: "1.0",
  outputMode: "structured_fields_only",
  requiredFields: DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS,
  rules: [
    "Return structured fields only; do not return one blob of public copy.",
    "role must be a short public role line.",
    "summary must be one compact public-facing dossier paragraph.",
    "notes must be one or two short contextual public-safe sentences.",
    "tags must prefer existing tag registry entries.",
    "proposedTags may contain uncertain or new suggestions only.",
    "missingInfoQuestions, ownerReviewWarnings, and publicSafetyWarnings are admin/review fields, not public dossier prose.",
    "sourceUsageSummary is admin-only provenance, not public dossier prose.",
  ],
} as const;

export const DOSSIER_FORBIDDEN_PUBLIC_COPY_PATTERNS = [
  "BNL Dossier Intelligence",
  "Community Activity Profile",
  "Queue / Music Footprint",
  "Activity frequency",
  "Review only evidence count",
  "Most recent observed evidence",
  "sourceFileSummary",
  "memory_tiers",
  "relationship_state",
  "rd_context",
  "queue_frequency",
  "source lane",
  "evidence id",
  "recommendation id",
] as const;

const FORBIDDEN_REGEXES = [
  /BNL Dossier Intelligence/i,
  /Community Activity Profile/i,
  /Queue\s*\/\s*Music Footprint/i,
  /Activity frequency/i,
  /Review only evidence count/i,
  /Most recent observed evidence/i,
  /sourceFileSummary/i,
  /memory_tiers/i,
  /relationship_state/i,
  /rd_context/i,
  /queue_frequency/i,
  /source lanes?/i,
  /evidence id/i,
  /recommendation id/i,
  /\b(?:public_discord|broadcast_memory|queue_context|website_dossier|admin_manual|owner_manual|mod_manual)\b/i,
  /\b(?:evidence|recommendation|candidate|source|target)[-_ ]?id\s*[:=]?\s*[a-z0-9:_-]{6,}\b/i,
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\b/,
  /\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\b/,
  /\b(?:\d+\s*)?(?:activity|message|submission|evidence|observation)s?\s+count\b/i,
  /\{\s*"?[a-z0-9_]+"?\s*:/i,
  /\[[\s\n]*\{\s*"?[a-z0-9_]+"?\s*:/i,
  /\.\.\.\s*$/,
  /[,;:]\s*$/,
  /\b(?:published|publish-ready|ready to publish|live on the site|public page has been created)\b/i,
];

const QUEUE_CLAIM_REGEX = /\b(?:queue|submission|submitted|track|song|artist|music|Auxchord)\b/i;
const IDENTITY_CONFIRMED_REGEX = /\b(?:confirmed identity|same person|identity confirmed|alias confirmed|verified alias)\b/i;

export type DossierStylePacketPublicExample = Pick<
  DatabaseEntry,
  | "id"
  | "name"
  | "category"
  | "kind"
  | "ecosystemLane"
  | "identityAuthority"
  | "status"
  | "clearance"
  | "origin"
  | "role"
  | "summary"
  | "notes"
  | "tags"
  | "primaryLink"
  | "links"
  | "files"
>;

export type DossierStylePacketCategoryCoverage = {
  category: DossierCategory;
  definition: string;
  examples: DossierStylePacketPublicExample[];
  coverage: "available" | "missing";
};

export type DossierStylePacket = {
  version: "1.0";
  generatedAt: string;
  publicDossierFieldModel: typeof dossierAuthoringGuide.fieldGuide;
  requiredOutputShape: typeof DOSSIER_DRAFT_CONTRACT;
  taxonomyGuide: typeof DOSSIER_TAXONOMY_GUIDE;
  tagRegistryGuidance: ReturnType<typeof buildDossierTagRegistry>;
  authoringGuideSummary: {
    purpose: string;
    pageStructure: readonly string[];
    toneGuide: typeof dossierAuthoringGuide.toneGuide;
    lengthGuide: typeof dossierAuthoringGuide.lengthGuide;
    draftingRules: readonly string[];
  };
  representativePublicDossierExamples: DossierStylePacketPublicExample[];
  categorySpecificExamples: DossierStylePacketCategoryCoverage[];
  goodRoleLineExamples: string[];
  goodSummaryExamples: string[];
  goodNotesExamples: string[];
  forbiddenPublicCopyPatterns: readonly string[];
  publicSafetyRules: string[];
  ownerReviewRules: string[];
  sourceBoundaryRules: string[];
  draftBlueprintInputExpectations: string[];
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function publicExample(entry: DatabaseEntry): DossierStylePacketPublicExample {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    kind: entry.kind,
    ecosystemLane: entry.ecosystemLane,
    identityAuthority: entry.identityAuthority,
    status: entry.status,
    clearance: entry.clearance,
    origin: entry.origin,
    role: entry.role,
    summary: entry.summary,
    notes: entry.notes,
    tags: [...entry.tags],
    primaryLink: entry.primaryLink,
    links: entry.links,
    files: entry.files,
  };
}

function representativeExamples(entries: DatabaseEntry[]) {
  const examples: DossierStylePacketPublicExample[] = [];
  for (const category of DOSSIER_CATEGORY_OPTIONS) {
    const entry = entries.find((item) => item.category === category);
    if (entry) examples.push(publicExample(entry));
  }
  return examples;
}

export function buildDossierStylePacket(input: {
  publicDossiers?: DatabaseEntry[];
  generatedAt?: string;
} = {}): DossierStylePacket {
  const publicDossiers = input.publicDossiers ?? databasePage.entries;
  const categorySpecificExamples = DOSSIER_CATEGORY_OPTIONS.map((category) => {
    const examples = publicDossiers
      .filter((entry) => entry.category === category)
      .slice(0, 3)
      .map(publicExample);
    return {
      category,
      definition: DOSSIER_TAXONOMY_GUIDE.categoryGuide[category],
      examples,
      coverage: examples.length ? ("available" as const) : ("missing" as const),
    };
  });
  const examples = representativeExamples(publicDossiers);

  return {
    version: "1.0",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    publicDossierFieldModel: dossierAuthoringGuide.fieldGuide,
    requiredOutputShape: DOSSIER_DRAFT_CONTRACT,
    taxonomyGuide: DOSSIER_TAXONOMY_GUIDE,
    tagRegistryGuidance: buildDossierTagRegistry(publicDossiers),
    authoringGuideSummary: {
      purpose: dossierAuthoringGuide.purpose,
      pageStructure: dossierAuthoringGuide.pageStructure,
      toneGuide: dossierAuthoringGuide.toneGuide,
      lengthGuide: dossierAuthoringGuide.lengthGuide,
      draftingRules: dossierAuthoringGuide.draftingRules,
    },
    representativePublicDossierExamples: examples,
    categorySpecificExamples,
    goodRoleLineExamples: examples.map((entry) => entry.role).filter(Boolean).slice(0, 8),
    goodSummaryExamples: examples.map((entry) => entry.summary).filter(Boolean).slice(0, 8),
    goodNotesExamples: examples.map((entry) => entry.notes).filter(Boolean).slice(0, 8),
    forbiddenPublicCopyPatterns: DOSSIER_FORBIDDEN_PUBLIC_COPY_PATTERNS,
    publicSafetyRules: [
      "Public fields may use only public-safe facts and selected public links.",
      "Review-only evidence, internal aliases, raw evidence IDs, source lane names, and diagnostics must stay out of public prose.",
      "Do not claim queue/music participation unless connected public-safe evidence supports it.",
      "Do not confirm identity, merge aliases, or imply publication from draft generation.",
    ],
    ownerReviewRules: [
      "Owner Review remains required before public use.",
      "Generated draft fields are proposed admin material only.",
      "Packet generation must not publish, approve, or mutate public dossier pages.",
    ],
    sourceBoundaryRules: [
      "Source File truth is read-only input for this packet.",
      "Draft Blueprint adminOnlyProvenance remains review-only.",
      "missingInfoQuestions, warnings, unsupportedClaimsRejected, and sourceUsageSummary are admin-only fields.",
    ],
    draftBlueprintInputExpectations: [
      "Use DossierDraftBlueprint classification for category, kind, ecosystemLane, and identityAuthority direction.",
      "Use safeSummaryIngredients and safeNotesIngredients as ingredients, not prose to dump verbatim.",
      "Keep adminOnlyProvenance and reviewOnlyEvidence out of public fields.",
      "Keep Owner Review warnings attached to review fields, not public dossier copy.",
    ],
  };
}

export type DossierDraftContractValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export type DossierDraftContractValidationResult = {
  ok: boolean;
  issues: DossierDraftContractValidationIssue[];
};

function textFields(draft: Partial<DossierDraftContractOutput>) {
  return [
    ["name", draft.name],
    ["role", draft.role],
    ["summary", draft.summary],
    ["notes", draft.notes],
  ] as const;
}

function addIssue(
  issues: DossierDraftContractValidationIssue[],
  field: string,
  code: string,
  message: string,
) {
  issues.push({ field, code, message });
}

function validatePublicText(
  issues: DossierDraftContractValidationIssue[],
  field: string,
  value: string | undefined,
  options: DossierDraftContractValidationOptions,
) {
  const text = value?.trim() ?? "";
  if (!text) return;
  for (const pattern of FORBIDDEN_REGEXES) {
    if (pattern.test(text)) addIssue(issues, field, "forbidden_public_pattern", `${field} contains internal/source-file or unsafe public text.`);
  }
  for (const alias of options.internalAliases ?? []) {
    if (alias.trim() && text.toLowerCase().includes(alias.trim().toLowerCase())) {
      addIssue(issues, field, "internal_alias_exposed", `${field} exposes an internal alias.`);
    }
  }
  if (!options.queueMusicEvidenceAllowed && QUEUE_CLAIM_REGEX.test(text)) {
    addIssue(issues, field, "unsupported_queue_music_claim", `${field} includes unsupported queue/music claims.`);
  }
  if (!options.identityConfirmed && IDENTITY_CONFIRMED_REGEX.test(text)) {
    addIssue(issues, field, "identity_confirmation_blocked", `${field} confirms identity without confirmation.`);
  }
}

function isPublicSafeUrl(url: string) {
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export type DossierDraftContractValidationOptions = {
  internalAliases?: string[];
  identityConfirmed?: boolean;
  queueMusicEvidenceAllowed?: boolean;
  existingTags?: string[];
};

export function validateDossierDraftContractOutput(
  draft: Partial<DossierDraftContractOutput>,
  options: DossierDraftContractValidationOptions = {},
): DossierDraftContractValidationResult {
  const issues: DossierDraftContractValidationIssue[] = [];
  for (const field of DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS) {
    if (!(field in draft)) addIssue(issues, field, "missing_required_field", `${field} is required.`);
  }
  if (draft.category && !DOSSIER_CATEGORY_OPTIONS.includes(draft.category)) addIssue(issues, "category", "invalid_category", "category must be an expanded dossier category.");
  if (draft.kind && !DOSSIER_KIND_OPTIONS.includes(draft.kind)) addIssue(issues, "kind", "invalid_kind", "kind is not allowed.");
  if (draft.ecosystemLane && !DOSSIER_ECOSYSTEM_LANE_OPTIONS.includes(draft.ecosystemLane)) addIssue(issues, "ecosystemLane", "invalid_ecosystem_lane", "ecosystemLane is not allowed.");
  if (draft.identityAuthority && !DOSSIER_IDENTITY_AUTHORITY_OPTIONS.includes(draft.identityAuthority)) addIssue(issues, "identityAuthority", "invalid_identity_authority", "identityAuthority is not allowed.");
  if (draft.status && !["ACTIVE", "INACTIVE", "ARCHIVED", "PENDING", "UNKNOWN"].includes(draft.status)) addIssue(issues, "status", "invalid_status", "status is not allowed.");
  if (draft.clearance && !["PUBLIC", "INTERNAL", "RESTRICTED"].includes(draft.clearance)) addIssue(issues, "clearance", "invalid_clearance", "clearance is not allowed.");
  if (draft.origin && !["KNOWN", "UNKNOWN", "UNVERIFIED", "WITHHELD"].includes(draft.origin)) addIssue(issues, "origin", "invalid_origin", "origin is not allowed.");

  if (draft.role && (draft.role.length < 2 || draft.role.length > 80 || /[\n\r]/.test(draft.role))) addIssue(issues, "role", "role_length", "role must be a short public role line.");
  if (!draft.summary?.trim()) addIssue(issues, "summary", "summary_required", "summary must not be empty.");
  if (draft.summary && (draft.summary.length > 800 || draft.summary.split(/\n+/).length > 1)) addIssue(issues, "summary", "summary_shape", "summary must be one compact paragraph, not a source-file dump.");
  if (draft.notes && (draft.notes.length > 360 || draft.notes.split(/[.!?]+/).filter((part) => part.trim()).length > 2)) addIssue(issues, "notes", "notes_shape", "notes must be one or two short public-safe sentences.");

  for (const [field, value] of textFields(draft)) validatePublicText(issues, field, value, options);

  const registry = new Set((options.existingTags ?? buildDossierTagRegistry(databasePage.entries).items.map((item) => item.canonical)).map((tag) => tag.toLowerCase()));
  const tags = draft.tags ?? [];
  const proposedTags = draft.proposedTags ?? [];
  const proposedLower = new Set(proposedTags.map((tag) => tag.toLowerCase()));
  for (const tag of tags) {
    if (!/^[a-z0-9][a-z0-9 -]{1,32}$/i.test(tag) || tag.split(/\s+/).length > 3) addIssue(issues, "tags", "wild_tag", "tags must not be one-off junk or diagnostics.");
    if (!registry.has(tag.toLowerCase())) addIssue(issues, "tags", "unregistered_confirmed_tag", "confirmed tags must prefer existing registry entries; place uncertain/new tags in proposedTags.");
    validatePublicText(issues, "tags", tag, options);
  }
  for (const tag of proposedTags) {
    if (tags.map((item) => item.toLowerCase()).includes(tag.toLowerCase())) addIssue(issues, "proposedTags", "tag_not_separated", "proposedTags must be separated from confirmed tags.");
    validatePublicText(issues, "proposedTags", tag, options);
  }
  for (const tag of tags) {
    if (proposedLower.has(tag.toLowerCase())) addIssue(issues, "tags", "tag_not_separated", "confirmed tags must not duplicate proposedTags.");
  }

  for (const [field, links] of [["primaryLink", draft.primaryLink ? [draft.primaryLink] : []], ["links", draft.links ?? []]] as const) {
    for (const link of links) {
      if (link && (!link.publicSafe || !isPublicSafeUrl(link.url))) addIssue(issues, field, "unsafe_link", "links must be public-safe http(s) or site-relative URLs.");
    }
  }

  return { ok: issues.length === 0, issues };
}

export type FutureBnlDossierAuthoringPacket = {
  sourceFileSubject: {
    candidateId: string;
    name: string;
    status: DossierCandidate["status"];
  };
  draftBlueprint: DossierDraftBlueprint;
  stylePacket: DossierStylePacket;
  publicSafeInputs: DossierDraftBlueprint["publicSafeFacts"];
  reviewOnlyBoundaries: {
    adminOnlyProvenance: DossierDraftBlueprint["adminOnlyProvenance"];
    ownerReviewWarnings: string[];
    sourceBoundaryRules: string[];
  };
  requiredOutputContract: typeof DOSSIER_DRAFT_CONTRACT;
  validationRules: {
    forbiddenPublicCopyPatterns: readonly string[];
    requiredFields: typeof DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS;
    publicSafetyRules: string[];
  };
};

export function createFutureBnlDossierAuthoringPacket(input: {
  sourceFileSubject: DossierCandidate;
  draftBlueprint: DossierDraftBlueprint;
  stylePacket?: DossierStylePacket;
}): FutureBnlDossierAuthoringPacket {
  const stylePacket = input.stylePacket ?? buildDossierStylePacket();
  return {
    sourceFileSubject: {
      candidateId: input.sourceFileSubject.id,
      name: input.sourceFileSubject.name,
      status: input.sourceFileSubject.status,
    },
    draftBlueprint: clone(input.draftBlueprint),
    stylePacket: clone(stylePacket),
    publicSafeInputs: clone(input.draftBlueprint.publicSafeFacts),
    reviewOnlyBoundaries: {
      adminOnlyProvenance: clone(input.draftBlueprint.adminOnlyProvenance),
      ownerReviewWarnings: [...input.draftBlueprint.ownerReviewWarnings, "Owner Review remains required before any public dossier publication."],
      sourceBoundaryRules: [...stylePacket.sourceBoundaryRules],
    },
    requiredOutputContract: DOSSIER_DRAFT_CONTRACT,
    validationRules: {
      forbiddenPublicCopyPatterns: DOSSIER_FORBIDDEN_PUBLIC_COPY_PATTERNS,
      requiredFields: DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS,
      publicSafetyRules: [...stylePacket.publicSafetyRules],
    },
  };
}
