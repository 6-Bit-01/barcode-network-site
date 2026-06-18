import { databasePage, type DatabaseEntry } from "@/content";
import {
  buildDossierTagRegistry,
  resolveDossierTagCanonical,
  type DossierTagRegistryItem,
} from "@/lib/dossier-tags";
import {
  DOSSIER_CATEGORY_PREFIXES,
  type DossierCategory,
  type DossierCandidate,
  type DossierCandidateType,
  type DossierRecommendation,
  type DossierSourceFileClassificationV1,
  type DossierSourceFileNote,
  type DossierWorkflowLink,
} from "@/lib/dossier-workflow";
import type {
  DossierEcosystemLane,
  DossierIdentityAuthority,
  PublicDossierKind,
} from "@/content";

export type DossierClassificationConfidence = "low" | "medium" | "high";


export type DossierClassificationAuthority = "bnl_source_file_classification" | "site_fallback_classification";

export type DossierSourceFileClassificationReadModel = {
  subjectType?: string;
  publicDossierType?: string;
  confidence?: DossierClassificationConfidence | string;
  publicSafeTags: string[];
  needsReviewTags: string[];
  internalOnlyTags: string[];
  rejectedTags: string[];
  routingTags: string[];
  blockedPublicTags: string[];
  sourceSafety?: string;
  reasons: string[];
  blockers: string[];
  authority: DossierClassificationAuthority;
};

export type DossierClassificationAlternate = {
  category: DossierCategory;
  kind: PublicDossierKind;
  ecosystemLane: DossierEcosystemLane;
  identityAuthority: DossierIdentityAuthority;
  reason: string;
};

export type DossierClassificationResult = {
  category: DossierCategory;
  kind: PublicDossierKind;
  ecosystemLane: DossierEcosystemLane;
  identityAuthority: DossierIdentityAuthority;
  confidence: DossierClassificationConfidence;
  reasons: string[];
  blockers: string[];
  alternatePossibilities: DossierClassificationAlternate[];
  recommendedDesignationPrefix: string;
};

export type DossierTagSuggestion = {
  tag: string;
  confidence: DossierClassificationConfidence;
  reason: string;
  registrySource: DossierTagRegistryItem["source"] | "candidate";
};

export type DossierRejectedTagCandidate = {
  tag: string;
  reason: string;
};

export type DossierTagSuggestionResult = {
  tags: DossierTagSuggestion[];
  proposedTags: DossierTagSuggestion[];
  rejectedTagCandidates: DossierRejectedTagCandidate[];
};

export type DossierEvidenceDistillation = {
  publicSafe: {
    confirmedPublicFacts: string[];
    publicRoleHints: string[];
    publicCommunityActivity: string[];
    publicLinks: DossierWorkflowLink[];
    publicQueueMusicEvidence: string[];
  };
  reviewOnly: {
    internalNotes: string[];
    sourceBlindMemory: string[];
    internalAliases: string[];
    privateAdminEvidence: string[];
    uncertainIdentityLinks: string[];
    inferredRoleClaims: string[];
    unsupportedQueueMusicClaims: string[];
  };
  missing: string[];
};

export type DossierReadinessLabel =
  | "Ready for Proposed Dossier"
  | "Almost Ready"
  | "Internal Source File Only"
  | "Needs Identity Review"
  | "Needs More Public Evidence"
  | "Not Dossier Material Yet";

export type DossierReadinessResult = {
  label: DossierReadinessLabel;
  score: number;
  reasons: string[];
  blockers: string[];
  recommendedNextAction: string;
};

export type DossierDraftBlueprint = {
  version: "1.0";
  subjectName: string;
  classification: DossierClassificationResult;
  classificationProfile: DossierSourceFileClassificationReadModel;
  suggestedTags: DossierTagSuggestionResult;
  publicSafeFacts: DossierEvidenceDistillation["publicSafe"];
  safeRoleDirection: string;
  safeSummaryIngredients: string[];
  safeNotesIngredients: string[];
  linkRecommendations: DossierWorkflowLink[];
  queueMusicFootprintStatus: string;
  communityActivitySummary: string[];
  missingInfoQuestions: string[];
  ownerReviewWarnings: string[];
  readiness: DossierReadinessResult;
  adminOnlyProvenance: {
    candidateId: string;
    sourceLanes: string[];
    recommendationIds: string[];
    reviewOnlyEvidence: DossierEvidenceDistillation["reviewOnly"];
  };
  sourceFileReferences: string[];
  evidenceCounts: {
    publicSafeFacts: number;
    reviewOnlyItems: number;
    missingItems: number;
    recommendations: number;
    sourceNotes: number;
    identityLinks: number;
  };
  styleReferencesToUseLater: string[];
};

type ClassificationInput = {
  candidate: DossierCandidate;
  recommendations?: DossierRecommendation[];
  publicDossiers?: DatabaseEntry[];
};

type EvidenceInput = ClassificationInput;

type CandidateRoute = {
  category: DossierCategory;
  kind: PublicDossierKind;
  ecosystemLane: DossierEcosystemLane;
  identityAuthority: DossierIdentityAuthority;
  reason: string;
};

export const DOSSIER_CANDIDATE_TYPE_ROUTES = {
  artist: {
    category: "Artist",
    kind: "artist",
    ecosystemLane: "artist",
    identityAuthority: "community_owned",
    reason: "Candidate type identifies music/performance relevance.",
  },
  collaborator: {
    category: "Collaborator",
    kind: "collaborator",
    ecosystemLane: "collaborator",
    identityAuthority: "community_owned",
    reason: "Candidate type identifies direct creative or project contribution.",
  },
  community_member: {
    category: "Community",
    kind: "community_member",
    ecosystemLane: "community_member",
    identityAuthority: "community_owned",
    reason: "Candidate type identifies recurring community presence.",
  },
  personnel: {
    category: "Personnel",
    kind: "moderator",
    ecosystemLane: "community_mod",
    identityAuthority: "community_owned",
    reason: "Candidate type identifies an official/formal BARCODE role.",
  },
  entity: {
    category: "Entity",
    kind: "core_entity",
    ecosystemLane: "core_team",
    identityAuthority: "barcode_controlled",
    reason: "Candidate type identifies BARCODE-created or entity-like subject.",
  },
  production: {
    category: "Production",
    kind: "program",
    ecosystemLane: "production",
    identityAuthority: "barcode_controlled",
    reason: "Candidate type identifies produced BARCODE output.",
  },
  interface: {
    category: "Interface",
    kind: "interface",
    ecosystemLane: "infrastructure",
    identityAuthority: "external_system",
    reason: "Candidate type identifies access surface or platform layer.",
  },
  sponsor: {
    category: "Sponsor",
    kind: "sponsor_character",
    ecosystemLane: "sponsor",
    identityAuthority: "sponsor_controlled",
    reason: "Candidate type identifies sponsor or commercial-partner context.",
  },
  story_arc: {
    category: "Production",
    kind: "story_arc",
    ecosystemLane: "production",
    identityAuthority: "barcode_controlled",
    reason: "Candidate type identifies narrative or campaign production.",
  },
  unknown: {
    category: "Community",
    kind: "unknown",
    ecosystemLane: "unknown",
    identityAuthority: "mixed_or_unclear",
    reason: "Candidate type is unknown; classification needs evidence review.",
  },
} as const satisfies Record<DossierCandidateType, CandidateRoute>;

const ROLE_HINTS = {
  artist: /\b(artist|rapper|singer|producer|performer|band|song|track|music|submission|submitted|submitter|auxchord|album|release)\b/i,
  collaborator: /\b(collaborator|contributor|playlist|graphic|graphics|designer|feature|segment|creative asset|event|initiative|production help|built|made for barcode|radio function)\b/i,
  community: /\b(community|viewer|chat|regular|supporter|fan|presence|participant|recurring|discord member|radio regular)\b/i,
  personnel: /\b(moderator|mod\b|admin|operator|staff|official|formal role|manager|core team)\b/i,
  entity: /\b(entity|anomaly|character|barcode-created|network-controlled|ai|system character|persona|lore)\b/i,
  interface: /\b(interface|platform|discord|website|tool|surface|integration|submission tool|access)\b/i,
  production: /\b(show|program|episode|segment|arc|campaign|album|broadcast format|release)\b/i,
  sponsor: /\b(sponsor|brand|commercial|partner|ad-world|advertiser)\b/i,
};

function cleanText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: Array<string | undefined | null>, limit = 12): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = cleanText(value);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function combinedEvidenceText(input: ClassificationInput) {
  const candidate = input.candidate;
  return uniqueStrings([
    candidate.name,
    candidate.candidateType,
    candidate.recommendedCategory,
    candidate.recommendedKind,
    candidate.recommendedEcosystemLane,
    candidate.recommendedIdentityAuthority,
    candidate.reason,
    candidate.whyNow,
    candidate.evidenceSummary,
    candidate.sourceFileSummary?.summaryText,
    candidate.sourceFileSummary?.knownContext?.join(" "),
    ...(candidate.knownFacts ?? []),
    ...(candidate.recommendedTags ?? []),
    ...(candidate.proposedTags ?? []),
    ...(candidate.sourceLanes ?? []),
    ...(candidate.sourceFileNotes ?? []).map((note) => note.text),
    ...(input.recommendations ?? []).flatMap((recommendation) => [
      recommendation.recommendedCategory,
      recommendation.recommendedKind,
      recommendation.reason,
      recommendation.adminSummary,
      recommendation.evidenceSummary,
      recommendation.queueSubmissionStatus,
      recommendation.queueSubmissionNote,
      ...(recommendation.musicSignals ?? []),
      ...(recommendation.communitySignals ?? []),
      ...(recommendation.activityFrequencySummary ?? []),
      ...(recommendation.recentActivitySummary ?? []),
      ...(recommendation.sourceLanes ?? []),
    ]),
  ], 80).join(" \n");
}

function routeFromRecommendedFields(candidate: DossierCandidate): CandidateRoute | undefined {
  if (!candidate.recommendedCategory && !candidate.recommendedKind) return undefined;
  const base = DOSSIER_CANDIDATE_TYPE_ROUTES[candidate.candidateType];
  const kind = candidate.recommendedKind ?? base.kind;
  let category = candidate.recommendedCategory ?? base.category;
  let ecosystemLane = candidate.recommendedEcosystemLane ?? base.ecosystemLane;
  let identityAuthority = candidate.recommendedIdentityAuthority ?? base.identityAuthority;

  if (kind === "artist") {
    category = "Artist";
    ecosystemLane = "artist";
    identityAuthority = candidate.recommendedIdentityAuthority ?? "community_owned";
  }
  if (kind === "collaborator") {
    category = "Collaborator";
    ecosystemLane = "collaborator";
    identityAuthority = candidate.recommendedIdentityAuthority ?? "community_owned";
  }
  if (kind === "community_member" || kind === "radio_regular") {
    category = "Community";
    ecosystemLane = kind;
    identityAuthority = candidate.recommendedIdentityAuthority ?? "community_owned";
  }
  if (kind === "moderator") {
    category = "Personnel";
    ecosystemLane = candidate.recommendedEcosystemLane ?? "community_mod";
    identityAuthority = candidate.recommendedIdentityAuthority ?? "community_owned";
  }
  if (kind === "network_operator" || kind === "network_staff" || kind === "core_entity" || kind === "radio_entity") {
    category = "Entity";
    ecosystemLane = kind === "core_entity" ? "core_team" : kind;
    identityAuthority = candidate.recommendedIdentityAuthority ?? "barcode_controlled";
  }
  if (kind === "platform" || kind === "interface" || kind === "system") {
    category = "Interface";
    ecosystemLane = candidate.recommendedEcosystemLane ?? "infrastructure";
    identityAuthority = candidate.recommendedIdentityAuthority ?? "external_system";
  }
  if (kind === "program" || kind === "story_arc") {
    category = "Production";
    ecosystemLane = "production";
    identityAuthority = candidate.recommendedIdentityAuthority ?? "barcode_controlled";
  }

  return { category, kind, ecosystemLane, identityAuthority, reason: "Existing recommended taxonomy fields were normalized." };
}

export function routeDossierCandidateType(candidateType: DossierCandidateType): CandidateRoute {
  return DOSSIER_CANDIDATE_TYPE_ROUTES[candidateType];
}

export function classifyDossierSourceFileSubject(input: ClassificationInput): DossierClassificationResult {
  const candidate = input.candidate;
  const text = combinedEvidenceText(input);
  const reasons: string[] = [];
  const blockers: string[] = [];
  const alternates: DossierClassificationAlternate[] = [];
  const explicitRoute = routeFromRecommendedFields(candidate);
  let route: CandidateRoute = explicitRoute ?? DOSSIER_CANDIDATE_TYPE_ROUTES[candidate.candidateType];
  reasons.push(explicitRoute?.reason ?? route.reason);

  const hintMatches = Object.entries(ROLE_HINTS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([key]) => key);

  const setRoute = (next: CandidateRoute, reason: string) => {
    if (route.category !== next.category || route.kind !== next.kind) {
      alternates.push({
        category: route.category,
        kind: route.kind,
        ecosystemLane: route.ecosystemLane,
        identityAuthority: route.identityAuthority,
        reason: `Alternate before evidence override: ${route.reason}`,
      });
    }
    route = next;
    reasons.push(reason);
  };

  if (!explicitRoute) {
    const typeLocked = ["artist", "collaborator", "community_member", "personnel", "entity", "production", "interface", "sponsor", "story_arc"].includes(candidate.candidateType);
    if (!typeLocked && ROLE_HINTS.entity.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.entity, "Evidence mentions BARCODE-created/entity-like or lore/system subject.");
    else if (!typeLocked && ROLE_HINTS.sponsor.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.sponsor, "Evidence mentions sponsor/commercial relationship.");
    else if (!typeLocked && ROLE_HINTS.interface.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.interface, "Evidence mentions platform/interface/access surface.");
    else if (!typeLocked && ROLE_HINTS.production.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.production, "Evidence mentions produced BARCODE output.");
    else if (candidate.candidateType === "unknown" && ROLE_HINTS.personnel.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.personnel, "Evidence mentions formal moderator/staff/admin role.");
    else if (candidate.candidateType === "unknown" && ROLE_HINTS.artist.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.artist, "Evidence mentions music, artist, or submission footprint.");
    else if (candidate.candidateType === "unknown" && ROLE_HINTS.collaborator.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.collaborator, "Evidence mentions direct BARCODE project contribution.");
    else if (candidate.candidateType === "unknown" && ROLE_HINTS.community.test(text)) setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.community_member, "Evidence mentions recurring community participation.");
  }

  if (candidate.candidateType === "artist" && route.category === "Personnel") {
    setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.artist, "Artist candidate must not collapse into generic Personnel without stronger formal-role evidence.");
  }
  if (candidate.candidateType === "collaborator" && route.category === "Personnel") {
    setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.collaborator, "Collaborator candidate must not collapse into generic Personnel without stronger formal-role evidence.");
  }
  if (candidate.candidateType === "community_member" && route.category === "Personnel" && !/moderator|admin|staff|official/i.test(text)) {
    setRoute(DOSSIER_CANDIDATE_TYPE_ROUTES.community_member, "Community candidate stays Community when formal-role evidence is absent.");
  }

  if (candidate.identityReviewStatus === "needs_confirmation") blockers.push("Identity links require review before public drafting.");
  if ((candidate.identityLinks ?? []).some((link) => link.status === "proposed")) blockers.push("Proposed identity links are not confirmed.");
  if (!candidate.name.trim()) blockers.push("Public display name is missing.");
  if (route.kind === "unknown" || route.ecosystemLane === "unknown") blockers.push("Subject type still needs operator classification.");

  const confidence: DossierClassificationConfidence = blockers.length > 0 || route.kind === "unknown"
    ? "low"
    : explicitRoute || hintMatches.length > 0 || candidate.candidateType !== "unknown"
      ? "medium"
      : "low";

  const alternateKeys = new Set(alternates.map((item) => `${item.category}/${item.kind}`));
  for (const hint of hintMatches) {
    const hintedRoute = hint === "community" ? DOSSIER_CANDIDATE_TYPE_ROUTES.community_member : DOSSIER_CANDIDATE_TYPE_ROUTES[hint as DossierCandidateType] ?? undefined;
    if (!hintedRoute) continue;
    const key = `${hintedRoute.category}/${hintedRoute.kind}`;
    if (key === `${route.category}/${route.kind}` || alternateKeys.has(key)) continue;
    alternates.push({ ...hintedRoute, reason: `Evidence also contains ${hint} signals.` });
    alternateKeys.add(key);
  }

  return {
    category: route.category,
    kind: route.kind,
    ecosystemLane: route.ecosystemLane,
    identityAuthority: route.identityAuthority,
    confidence,
    reasons: uniqueStrings(reasons, 8),
    blockers: uniqueStrings(blockers, 8),
    alternatePossibilities: alternates.slice(0, 4),
    recommendedDesignationPrefix: DOSSIER_CATEGORY_PREFIXES[route.category],
  };
}


function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringArray(value: unknown, limit = 20): string[] {
  if (typeof value === "string") return uniqueStrings(value.split(/[,\n]/), limit);
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => typeof item === "string" ? item : undefined), limit);
}

function sourceFileClassificationFromCandidate(candidate: DossierCandidate): DossierSourceFileClassificationV1 | undefined {
  const direct = asRecord(candidate.sourceFileClassificationV1);
  if (direct) return direct as DossierSourceFileClassificationV1;
  const archive = asRecord(candidate.latestSourceFileArchive);
  if (!archive) return undefined;
  const candidates = [archive, asRecord(archive.sourceFileBriefV2), asRecord(archive.sourceFileCaseReportV1), asRecord(archive.archivePayload), asRecord(archive.archive), asRecord(archive.payload), asRecord(archive.sourceFileArchive)].filter(Boolean) as Record<string, unknown>[];
  for (const item of candidates) {
    const found = asRecord(item.sourceFileClassificationV1) ?? asRecord(asRecord(item.sourceFileCaseReportV1)?.sourceFileClassificationV1) ?? asRecord(asRecord(item.sourceFileBriefV2)?.sourceFileClassificationV1);
    if (found) return found as DossierSourceFileClassificationV1;
  }
  return undefined;
}

const PUBLIC_BLOCKED_TAG_PATTERNS = [
  /@/, /token|password|secret|payment|customer|account|email|private|member.only|source.blind|internal.alias/i,
];
const INTERNAL_BY_DEFAULT_TAG_PATTERNS = [/\b(queue|submission|submitter|moderator|mod|admin|staff|team|role|operator)\b/i];

function normalizeTagForPublic(tag: string): string | undefined {
  const clean = cleanText(tag)?.toLowerCase().replace(/\s+/g, "-");
  if (!clean || PUBLIC_BLOCKED_TAG_PATTERNS.some((pattern) => pattern.test(clean))) return undefined;
  return clean;
}

export function normalizeBnlSourceFileClassification(input: ClassificationInput): DossierSourceFileClassificationReadModel {
  const bnl = sourceFileClassificationFromCandidate(input.candidate);
  if (bnl) {
    const blocked = uniqueStrings([
      ...stringArray(bnl.doNotPubliclyTagAs),
      ...stringArray(bnl.blockedPublicTags),
      ...stringArray(bnl.rejectedTagCandidates),
    ], 40).map((tag) => tag.toLowerCase());
    const blockedSet = new Set(blocked);
    const sourceSafety = cleanText(bnl.sourceSafety);
    const sourceBlind = /source[_ -]?blind|internal[_ -]?only/i.test(sourceSafety ?? "");
    const publicSafeTags = sourceBlind ? [] : uniqueStrings(stringArray(bnl.publicSafeTagCandidates)
      .map(normalizeTagForPublic)
      .filter((tag): tag is string => Boolean(tag && !blockedSet.has(tag))), 12);
    const primarySecondary = uniqueStrings([...stringArray(bnl.primaryTags), ...stringArray(bnl.secondaryTags)], 20);
    const internalOnlyTags = uniqueStrings([
      ...stringArray(bnl.internalTags),
      ...primarySecondary.filter((tag) => !publicSafeTags.includes(tag.toLowerCase().replace(/\s+/g, "-")) || INTERNAL_BY_DEFAULT_TAG_PATTERNS.some((pattern) => pattern.test(tag))),
      ...stringArray(bnl.routingTags),
    ], 20);
    return {
      subjectType: cleanText(bnl.subjectType),
      publicDossierType: cleanText(bnl.publicDossierType),
      confidence: cleanText(bnl.confidence),
      publicSafeTags,
      needsReviewTags: stringArray(bnl.needsReviewTagCandidates, 12),
      internalOnlyTags,
      rejectedTags: stringArray(bnl.rejectedTagCandidates, 12),
      routingTags: stringArray(bnl.routingTags, 12),
      blockedPublicTags: uniqueStrings([...stringArray(bnl.blockedPublicTags), ...stringArray(bnl.doNotPubliclyTagAs)], 20),
      sourceSafety,
      reasons: stringArray(bnl.classificationReasons, 8),
      blockers: stringArray(bnl.classificationBlockedBy, 8),
      authority: "bnl_source_file_classification",
    };
  }
  const fallback = classifyDossierSourceFileSubject(input);
  return {
    subjectType: fallback.category,
    publicDossierType: fallback.kind,
    confidence: fallback.confidence,
    publicSafeTags: [],
    needsReviewTags: [],
    internalOnlyTags: [],
    rejectedTags: [],
    routingTags: [],
    blockedPublicTags: [],
    sourceSafety: undefined,
    reasons: fallback.reasons,
    blockers: fallback.blockers,
    authority: "site_fallback_classification",
  };
}

function registryItemFor(tag: string, registryItems: DossierTagRegistryItem[]) {
  const canonical = resolveDossierTagCanonical(tag) ?? tag.toLowerCase();
  return registryItems.find((item) => item.tag.toLowerCase() === canonical || item.canonical.toLowerCase() === canonical);
}

export function suggestDossierTags(input: ClassificationInput & { classification?: DossierClassificationResult }): DossierTagSuggestionResult {
  const classification = input.classification ?? classifyDossierSourceFileSubject(input);
  const registry = buildDossierTagRegistry(input.publicDossiers ?? databasePage.entries);
  const confirmed = new Map<string, DossierTagSuggestion>();
  const proposed = new Map<string, DossierTagSuggestion>();
  const rejected: DossierRejectedTagCandidate[] = [];

  const addTag = (tag: string, reason: string, confidence: DossierClassificationConfidence = "medium") => {
    const item = registryItemFor(tag, registry.items);
    if (!item) {
      const clean = tag.toLowerCase().replace(/\s+/g, "-");
      if (["human", "ai", "hybrid", "unknown-nature"].includes(clean)) {
        rejected.push({ tag: clean, reason: "Nature tags are traits only and are not inferred from taxonomy classification." });
        return;
      }
      proposed.set(clean, { tag: clean, confidence: "low", reason: `${reason} Registry entry does not exist yet.`, registrySource: "candidate" });
      return;
    }
    confirmed.set(item.tag, { tag: item.tag, confidence, reason, registrySource: item.source });
  };

  const normalizedClassification = normalizeBnlSourceFileClassification(input);
  if (normalizedClassification.authority !== "bnl_source_file_classification") {
    addTag(classification.kind === "community_member" ? "member" : classification.kind, "Suggested from dossier kind.");
    if (classification.category === "Artist") addTag("artist", "Artist category maps to the existing artist tag.", "high");
    if (classification.category === "Collaborator") addTag("collaborator", "Collaborator category maps to the existing collaborator tag.", "high");
    if (classification.category === "Community") addTag("community", "Community category maps to existing community tag.", "high");
    if (classification.kind === "radio_regular") addTag("radio", "Radio regular kind maps to the existing radio tag.");
    if (classification.kind === "moderator") addTag("mod", "Moderator kind maps to the existing mod tag.", "high");
    if (classification.category === "Production") addTag("producer", "Production records use existing production-oriented tag when applicable.");
    if (classification.category === "Interface") addTag("systems", "Interface records use existing systems tag when applicable.");
    if (classification.category === "Sponsor") addTag("sponsor", "Sponsor category maps to existing sponsor tag.", "high");
    if (classification.category === "Entity") addTag("core", "Entity records can reuse core/entity-oriented registry tags when applicable.");
  }

  if (normalizedClassification.authority === "bnl_source_file_classification") {
    const blocked = new Set([
      ...normalizedClassification.blockedPublicTags,
      ...normalizedClassification.rejectedTags,
      ...normalizedClassification.internalOnlyTags,
      ...normalizedClassification.needsReviewTags,
    ].map((tag) => tag.toLowerCase()));
    for (const tag of normalizedClassification.publicSafeTags) {
      if (!blocked.has(tag.toLowerCase())) addTag(tag, "BNL sourceFileClassificationV1 marked this as a public-safe tag candidate.", "high");
    }
    for (const tag of normalizedClassification.rejectedTags) rejected.push({ tag, reason: "BNL sourceFileClassificationV1 rejected this public tag candidate." });
  } else {
    for (const tag of input.candidate.recommendedTags ?? []) addTag(tag, "Existing candidate recommendation reused when present in registry.");
    for (const tag of input.candidate.proposedTags ?? []) {
      const item = registryItemFor(tag, registry.items);
      if (item) addTag(item.tag, "Candidate proposed tag already exists in registry, so it is safe to suggest.");
      else proposed.set(tag, { tag, confidence: "low", reason: "Candidate proposed tag is not in the registry yet.", registrySource: "candidate" });
    }
  }

  return {
    tags: Array.from(confirmed.values()).slice(0, 8),
    proposedTags: Array.from(proposed.values()).slice(0, 8),
    rejectedTagCandidates: rejected,
  };
}

function publicSafeNotes(notes: DossierSourceFileNote[] = []) {
  return notes.filter((note) => note.status === "active" && note.publicSafe === true);
}

function reviewOnlyNotes(notes: DossierSourceFileNote[] = []) {
  return notes.filter((note) => note.status === "active" && note.publicSafe === false);
}

export function distillDossierEvidence(input: EvidenceInput): DossierEvidenceDistillation {
  const candidate = input.candidate;
  const recommendations = input.recommendations ?? [];
  const safeNotes = publicSafeNotes(candidate.sourceFileNotes);
  const unsafeNotes = reviewOnlyNotes(candidate.sourceFileNotes);
  const publicLinks = [candidate.primaryLink].filter((link): link is DossierWorkflowLink => Boolean(link?.url && link.publicSafe !== false));
  const queueEvidence = uniqueStrings([
    ...recommendations.map((recommendation) => recommendation.queueSubmissionStatus),
    ...recommendations.map((recommendation) => recommendation.queueSubmissionNote),
  ], 6);
  const publicQueueMusicEvidence = queueEvidence.length
    ? uniqueStrings([...queueEvidence, ...recommendations.flatMap((recommendation) => recommendation.musicSignals ?? [])], 8)
    : [];
  const unsupportedMusic = queueEvidence.length
    ? []
    : uniqueStrings(recommendations.flatMap((recommendation) => recommendation.musicSignals ?? []), 6);
  const publicActivity = uniqueStrings([
    ...recommendations.flatMap((recommendation) => recommendation.communitySignals ?? []),
    ...recommendations.flatMap((recommendation) => recommendation.activityFrequencySummary ?? []),
    ...recommendations.flatMap((recommendation) => recommendation.recentActivitySummary ?? []),
  ], 8);
  const publicRoleHints = uniqueStrings([
    candidate.recommendedKind,
    candidate.recommendedCategory,
    ...safeNotes.filter((note) => note.type === "fact" || note.type === "correction").map((note) => note.text),
  ], 8);
  const missing = uniqueStrings([
    ...(candidate.missingInfo ?? []),
    candidate.name ? undefined : "public display name",
    candidate.recommendedKind || candidate.recommendedCategory ? undefined : "role confirmation",
    publicLinks.length ? undefined : "public links",
    publicQueueMusicEvidence.length ? undefined : "owned music links or queue/submission history, if this is an artist/music dossier",
    candidate.identityReviewStatus === "needs_confirmation" ? "identity review" : undefined,
    "owner approval",
  ], 12);

  return {
    publicSafe: {
      confirmedPublicFacts: uniqueStrings([
        ...(candidate.knownFacts ?? []),
        ...safeNotes.map((note) => note.text),
        ...recommendations.flatMap((recommendation) => recommendation.publicUseCandidates ?? []),
      ], 10),
      publicRoleHints,
      publicCommunityActivity: publicActivity,
      publicLinks,
      publicQueueMusicEvidence,
    },
    reviewOnly: {
      internalNotes: uniqueStrings([...(candidate.doNotSay ?? []), ...(candidate.publicSafetyNotes ?? []), ...unsafeNotes.map((note) => note.text)], 10),
      sourceBlindMemory: uniqueStrings(recommendations.flatMap((recommendation) => recommendation.conversationHighlights ?? []), 6),
      internalAliases: uniqueStrings((candidate.identityLinks ?? []).filter((link) => link.visibility === "internal_only").map((link) => link.label), 8),
      privateAdminEvidence: uniqueStrings([candidate.evidenceSummary, candidate.reason, candidate.whyNow], 8),
      uncertainIdentityLinks: uniqueStrings((candidate.identityLinks ?? []).filter((link) => link.status !== "confirmed").map((link) => link.label), 8),
      inferredRoleClaims: uniqueStrings([candidate.sourceFileSummary?.summaryText], 4),
      unsupportedQueueMusicClaims: unsupportedMusic,
    },
    missing,
  };
}

export function evaluateDossierReadiness(input: {
  classification: DossierClassificationResult;
  evidence: DossierEvidenceDistillation;
  candidate: DossierCandidate;
}): DossierReadinessResult {
  const reasons: string[] = [];
  const blockers = [...input.classification.blockers];
  let score = input.classification.confidence === "high" ? 70 : input.classification.confidence === "medium" ? 55 : 30;
  const publicFactCount = input.evidence.publicSafe.confirmedPublicFacts.length + input.evidence.publicSafe.publicRoleHints.length;
  const activityCount = input.evidence.publicSafe.publicCommunityActivity.length + input.evidence.publicSafe.publicQueueMusicEvidence.length;
  const reviewOnlyCount = Object.values(input.evidence.reviewOnly).reduce((sum, items) => sum + items.length, 0);

  if (publicFactCount > 0) { score += 15; reasons.push("Public-safe facts or role hints are available."); }
  else blockers.push("Public-safe facts have not been separated yet.");
  if (activityCount > 0) { score += 10; reasons.push("Activity, community, or queue/music evidence is available for review."); }
  if (input.evidence.publicSafe.publicLinks.length > 0) { score += 5; reasons.push("At least one public-safe link is available."); }
  if (reviewOnlyCount > 0) { score -= 10; reasons.push("Review-only evidence exists and must stay admin-only."); }
  if (input.evidence.missing.length > 0) score -= Math.min(20, input.evidence.missing.length * 3);
  if (input.candidate.identityReviewStatus === "needs_confirmation" || input.evidence.reviewOnly.uncertainIdentityLinks.length > 0) blockers.push("Identity links need review; no alias should be auto-confirmed or auto-merged.");
  score = Math.max(0, Math.min(100, score));

  let label: DossierReadinessLabel = "Almost Ready";
  let recommendedNextAction = "Review the blueprint, fill missing facts, and keep owner review required.";
  if (blockers.some((item) => /identity/i.test(item))) {
    label = "Needs Identity Review";
    recommendedNextAction = "Resolve identity/alias review before drafting public copy.";
  } else if (publicFactCount === 0) {
    label = "Needs More Public Evidence";
    recommendedNextAction = "Add public-safe facts, role confirmation, or public links before drafting.";
  } else if (score >= 75 && blockers.length === 0) {
    label = "Ready for Proposed Dossier";
    recommendedNextAction = "Use this blueprint as structured input for a later BNL Proposed Dossier draft.";
  } else if (score < 35) {
    label = input.candidate.status === "candidate_intake" ? "Not Dossier Material Yet" : "Internal Source File Only";
    recommendedNextAction = "Keep this as an internal Source File until more public evidence exists.";
  }

  return { label, score, reasons: uniqueStrings(reasons, 8), blockers: uniqueStrings(blockers, 10), recommendedNextAction };
}

export function createDossierDraftBlueprint(input: ClassificationInput): DossierDraftBlueprint {
  const publicDossiers = input.publicDossiers ?? databasePage.entries;
  const normalizedClassification = normalizeBnlSourceFileClassification({ ...input, publicDossiers });
  const fallbackClassification = classifyDossierSourceFileSubject({ ...input, publicDossiers });
  const classification = normalizedClassification.authority === "bnl_source_file_classification"
    ? { ...fallbackClassification, kind: (normalizedClassification.publicDossierType as PublicDossierKind) || fallbackClassification.kind, confidence: (normalizedClassification.confidence as DossierClassificationConfidence) || fallbackClassification.confidence, reasons: normalizedClassification.reasons.length ? normalizedClassification.reasons : fallbackClassification.reasons, blockers: uniqueStrings([...fallbackClassification.blockers, ...normalizedClassification.blockers], 8) }
    : fallbackClassification;
  const suggestedTags = suggestDossierTags({ ...input, publicDossiers, classification });
  const evidence = distillDossierEvidence(input);
  const readiness = evaluateDossierReadiness({ classification, evidence, candidate: input.candidate });
  const reviewOnlyCount = Object.values(evidence.reviewOnly).reduce((sum, items) => sum + items.length, 0);
  const publicFacts = evidence.publicSafe.confirmedPublicFacts;
  const roleDirection = `${classification.category} / ${classification.kind} / ${classification.ecosystemLane}; keep identity authority as ${classification.identityAuthority}.`;

  return {
    version: "1.0",
    subjectName: input.candidate.name,
    classification,
    classificationProfile: normalizedClassification,
    suggestedTags,
    publicSafeFacts: evidence.publicSafe,
    safeRoleDirection: roleDirection,
    safeSummaryIngredients: uniqueStrings([...publicFacts, ...evidence.publicSafe.publicRoleHints, ...evidence.publicSafe.publicCommunityActivity], 8),
    safeNotesIngredients: uniqueStrings([...evidence.publicSafe.publicQueueMusicEvidence, ...evidence.publicSafe.publicCommunityActivity], 8),
    linkRecommendations: evidence.publicSafe.publicLinks,
    queueMusicFootprintStatus: evidence.publicSafe.publicQueueMusicEvidence.length
      ? "Connected queue/music footprint is present and may be reviewed."
      : "No queue/music footprint should be claimed until connected evidence is added.",
    communityActivitySummary: evidence.publicSafe.publicCommunityActivity,
    missingInfoQuestions: evidence.missing,
    ownerReviewWarnings: uniqueStrings([
      "Owner Review remains required before any public use.",
      reviewOnlyCount > 0 ? "Review-only evidence exists and must stay out of public dossier prose." : undefined,
      input.candidate.identityReviewStatus === "needs_confirmation" ? "Identity links are not confirmed." : undefined,
    ], 8),
    readiness,
    adminOnlyProvenance: {
      candidateId: input.candidate.id,
      sourceLanes: uniqueStrings([...(input.candidate.sourceLanes ?? []), ...(input.recommendations ?? []).flatMap((recommendation) => recommendation.sourceLanes ?? [])], 12),
      recommendationIds: (input.recommendations ?? []).map((recommendation) => recommendation.id),
      reviewOnlyEvidence: evidence.reviewOnly,
    },
    sourceFileReferences: uniqueStrings([
      input.candidate.latestSourceFileArchiveId,
      ...(input.candidate.sourceFileArchiveIds ?? []),
      ...(input.recommendations ?? []).map((recommendation) => recommendation.id),
    ], 20),
    evidenceCounts: {
      publicSafeFacts: publicFacts.length,
      reviewOnlyItems: reviewOnlyCount,
      missingItems: evidence.missing.length,
      recommendations: (input.recommendations ?? []).length,
      sourceNotes: (input.candidate.sourceFileNotes ?? []).length,
      identityLinks: (input.candidate.identityLinks ?? []).length,
    },
    styleReferencesToUseLater: publicDossiers
      .filter((entry) => entry.category === classification.category || entry.kind === classification.kind)
      .slice(0, 3)
      .map((entry) => `${entry.id} ${entry.name}`),
  };
}
