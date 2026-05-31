import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { databasePage, type DatabaseEntry } from "@/content";
import {
  compactDossierSubjectName,
  isActiveSourceFileCandidate,
  normalizeDossierSubjectName,
  type DossierCandidate,
  type DossierDraft,
  type DossierIdentityLink,
  type DossierRecommendation,
  type DossierSourceFileNote,
} from "@/lib/dossier-workflow";
import {
  createExistingDossierUpdateTarget,
  getDossierWorkflowState,
} from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "private, no-store";
const MAX_NOTE_LENGTH = 700;
const MAX_RECOMMENDATIONS = 8;
const MAX_POSSIBLE_MATCHES = 8;

const VISIBILITY_BOUNDARY = {
  visibility: "internal_bnl_source_file" as const,
  boundaryLabel: "internal working case file; not a public dossier" as const,
  publicUse: false,
  publicUseReviewRequired: true,
  publicSummaryAllowed:
    "only when a field is explicitly publicSafe, reviewed, owner-approved, or already published elsewhere" as const,
  identityWarning:
    "identity links and aliases are workflow/routing context, not public identity proof" as const,
  publishWarning:
    "BNL Source Files are internal working case files, not public dossiers" as const,
  draftWarning:
    "proposed dossiers/drafts are curated public-facing drafts only; they are not public until owner-approved and published" as const,
  allowedUse: [
    "internal/operator source-file retrieval",
    "same-subject routing and review context",
    "draft preparation context inside the authenticated BNL boundary",
    "public-safe review support before a proposed dossier is curated",
  ],
  disallowedUse: [
    "public repetition unless a field is explicitly public-safe, reviewed, owner-approved, or already published elsewhere",
    "claiming aliases prove public identity",
    "publishing or mutating source files, drafts, recommendations, or content.ts",
    "exposing private payment, customer, account, upload, contact, token, or raw transcript data",
  ],
};

type MatchKind =
  | "candidate_id"
  | "name"
  | "compact_name"
  | "normalized_name"
  | "confirmed_alias"
  | "candidate_intake_name"
  | "candidate_intake_compact_name"
  | "candidate_intake_normalized_name"
  | "candidate_intake_confirmed_alias"
  | "existing_dossier_update_name"
  | "existing_dossier_update_compact_name"
  | "existing_dossier_update_normalized_name"
  | "existing_dossier_update_confirmed_alias"
  | "public_dossier_only";

type PossibleMatchKind =
  | "same_name"
  | "compact_name"
  | "unconfirmed_alias"
  | "partial_name";

type WorkflowLane =
  | "candidate_intake"
  | "active_source_file"
  | "existing_dossier_update"
  | "public_dossier_update_target";

type QueryMode = "candidateId" | "subject" | "alias" | "normalizedName";

type AliasMatchKind = Extract<MatchKind, `${string}alias`>;
type DirectMatchKind = Exclude<MatchKind, AliasMatchKind>;

type PublicDossierMatchKind =
  | "public_dossier_name"
  | "public_dossier_normalized_name"
  | "public_dossier_compact_name"
  | "public_dossier_slug"
  | "public_dossier_tag";

type PublicDossierMatch = {
  entry: DatabaseEntry;
  slug: string;
  matchKind: PublicDossierMatchKind;
};

const PUBLIC_DOSSIER_ONLY_WARNING =
  "Public dossier exists, but no internal Existing Dossier Update record exists yet. Create an internal update target before enrichment can attach notes.";

function slugifyPublicDossierName(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function publicDossierMatchSummary(match: PublicDossierMatch) {
  return {
    targetDossierId: match.entry.id,
    publicDossierName: match.entry.name,
    publicDossierSlug: match.slug,
    publicDossierPath: `/database/${match.slug}`,
    publicDossierCategory: match.entry.category,
    publicDossierKind: match.entry.kind,
    publicDossierStatus: match.entry.status,
    publicDossierClearance: match.entry.clearance,
    matchKind: match.matchKind,
    confidence:
      match.matchKind === "public_dossier_name" ||
      match.matchKind === "public_dossier_normalized_name" ||
      match.matchKind === "public_dossier_slug"
        ? "high"
        : "medium",
  };
}

function resolvePublicDossierOnlyMatch(input: {
  mode: QueryMode;
  value: string;
}): PublicDossierMatch[] {
  if (input.mode === "candidateId") return [];
  const normalizedValue = normalizeDossierSubjectName(input.value);
  const compactValue = compactDossierSubjectName(input.value);
  const slugValue = slugifyPublicDossierName(input.value);
  if (!normalizedValue && !slugValue) return [];

  return databasePage.entries
    .map((entry): PublicDossierMatch | null => {
      const slug = slugifyPublicDossierName(entry.name);
      const normalizedName = normalizeDossierSubjectName(entry.name);
      const compactName = compactDossierSubjectName(entry.name);
      const tagMatch = (entry.tags ?? []).some(
        (tag) => normalizeDossierSubjectName(tag) === normalizedValue,
      );

      if (input.mode === "alias" && tagMatch) {
        return { entry, slug, matchKind: "public_dossier_tag" };
      }
      if (input.mode === "normalizedName" && normalizedValue === normalizedName) {
        return { entry, slug, matchKind: "public_dossier_normalized_name" };
      }
      if (input.mode === "subject" && input.value.trim() === entry.name) {
        return { entry, slug, matchKind: "public_dossier_name" };
      }
      if (input.mode === "subject" && normalizedValue === normalizedName) {
        return { entry, slug, matchKind: "public_dossier_normalized_name" };
      }
      if (input.mode === "subject" && compactValue === compactName) {
        return { entry, slug, matchKind: "public_dossier_compact_name" };
      }
      if (input.mode !== "alias" && slugValue === slug) {
        return { entry, slug, matchKind: "public_dossier_slug" };
      }
      return null;
    })
    .filter((match): match is PublicDossierMatch => Boolean(match));
}

function publicDossierOnlyResponse(input: {
  query: { mode: QueryMode; value: string };
  match: PublicDossierMatch;
  possibleMatches: ReturnType<typeof possibleMatchSummary>[];
}) {
  const publicMatch = publicDossierMatchSummary(input.match);
  return {
    ok: true,
    found: true,
    scope: "bnl_internal_source_file_read_model",
    auth: "BNL_SOURCE_FILE_READ_TOKEN",
    mutation: false,
    query: input.query,
    matchKind: "public_dossier_only" as const,
    workflowLane: "public_dossier_update_target" as const,
    sourceFileActive: false,
    laneDescription:
      "Existing public dossier found; no internal update file exists yet. Protected/internal suggestion only.",
    publicDossierMatchFound: true,
    existingDossierUpdateLane: false,
    candidateIntake: false,
    publicCopyApproval: false,
    reviewRequired: true,
    recommendedAction: "create_existing_dossier_update" as const,
    warning: PUBLIC_DOSSIER_ONLY_WARNING,
    targetDossierId: input.match.entry.id,
    publicDossierName: input.match.entry.name,
    publicDossierSlug: input.match.slug,
    publicDossierPath: `/database/${input.match.slug}`,
    publicDossierMatch: publicMatch,
    sourceFile: null,
    sourceRecord: null,
    possibleMatches: input.possibleMatches,
    createExistingDossierUpdateAction: {
      method: "POST",
      endpoint: "/api/bnl/source-files",
      action: "create_existing_dossier_update",
      targetDossierId: input.match.entry.id,
      publicDossierSlug: input.match.slug,
      requestedSubject: input.query.value,
      mutation: "internal_workflow_only",
      publishesPublicDossier: false,
    },
    readModelBoundary: {
      ...VISIBILITY_BOUNDARY,
      boundaryLabel:
        "internal protected lookup fallback; existing public dossier target suggestion only",
      publishWarning:
        "Public dossier-only fallback is not an active Source File, Candidate Intake item, public copy approval, alias confirmation, identity merge, or publication action",
    },
    generatedAt: new Date().toISOString(),
  };
}

function stringFromBody(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

type ResolvedMatch =
  | {
      candidate: DossierCandidate;
      matchKind: DirectMatchKind;
    }
  | {
      candidate: DossierCandidate;
      alias: DossierIdentityLink;
      matchKind: AliasMatchKind;
    };

type SourceFileSummary = {
  candidateId: string;
  id: string;
  name: string;
  normalizedName: string;
  candidateType: DossierCandidate["candidateType"];
  status: DossierCandidate["status"];
  workflowLane: WorkflowLane;
  sourceFileActive: boolean;
  laneDescription: string;
  tier: DossierCandidate["tier"];
  score: number;
  confidence: DossierCandidate["confidence"] | null;
  source: DossierCandidate["source"];
  sourceLanes: DossierCandidate["sourceLanes"];
  ingestSource: DossierCandidate["ingestSource"] | null;
  ingestKey: string | null;
  createdFromRecommendationId: string | null;
  reason: string;
  whyNow: string;
  evidenceSummary: string;
  knownFacts: string[];
  missingInfo: string[];
  doNotSay: string[];
  publicSafetyNotes: string[];
  recommendedTaxonomy: {
    category: DossierCandidate["recommendedCategory"] | null;
    kind: DossierCandidate["recommendedKind"] | null;
    ecosystemLane: DossierCandidate["recommendedEcosystemLane"] | null;
    identityAuthority: DossierCandidate["recommendedIdentityAuthority"] | null;
    status: DossierCandidate["recommendedStatus"] | null;
    clearance: DossierCandidate["recommendedClearance"] | null;
    origin: DossierCandidate["recommendedOrigin"] | null;
    tags: string[];
    proposedTags: string[];
  };
  sourceFileNotes: Array<{
    id: string;
    type: DossierSourceFileNote["type"];
    summary: string;
    source: DossierSourceFileNote["source"];
    status: DossierSourceFileNote["status"];
    publicSafe: boolean;
    appliesToDraftId: string | null;
    incorporatedIntoDraftId: string | null;
    ingestSource: DossierSourceFileNote["ingestSource"] | null;
    ingestKey: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  identityLinks: Array<{
    id: string;
    label: string;
    normalizedLabel: string;
    type: DossierIdentityLink["type"];
    visibility: DossierIdentityLink["visibility"];
    status: DossierIdentityLink["status"];
    source: DossierIdentityLink["source"];
    confidence: DossierIdentityLink["confidence"] | null;
    useForMatching: boolean;
    useInPublicDossier: boolean;
    note: string | null;
    createdFromRecommendationId: string | null;
    createdFromRecommendationSubject: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  attachedRecommendations: Array<{
    id: string;
    type: DossierRecommendation["type"];
    subjectName: string;
    status: DossierRecommendation["status"];
    confidence: DossierRecommendation["confidence"] | null;
    sourceLanes: DossierRecommendation["sourceLanes"];
    sourceTypes: string[];
    ingestSource: DossierRecommendation["ingestSource"] | null;
    ingestKey: string | null;
    reason: string;
    evidenceSummary: string | null;
    updatedAt: string;
    createdAt: string;
  }>;
  activeDraft: {
    id: string;
    status: DossierDraft["status"];
    updatedAt: string;
    createdAt: string;
  } | null;
  ownerReview: {
    status:
      | "waiting"
      | "changes_requested"
      | "approved"
      | "not_in_owner_review";
    draftId: string | null;
  };
  duplicateWarnings: {
    duplicateRisk: DossierCandidate["duplicateRisk"] | null;
    existingDossierMatch: DossierCandidate["existingDossierMatch"] | null;
    mergedIntoCandidateId: string | null;
    mergeSourceCandidateIds: string[];
  };
  visibility: typeof VISIBILITY_BOUNDARY;
  updatedAt: string;
  createdAt: string;
};

function bearerToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return req.headers.get("x-bnl-source-file-read-token")?.trim() ?? "";
}

function tokenMatches(providedToken: string): boolean {
  const expectedToken = process.env.BNL_SOURCE_FILE_READ_TOKEN?.trim() ?? "";
  if (!expectedToken || !providedToken) return false;
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

function cleanQueryValue(value: string | null): string {
  return (value ?? "").trim().slice(0, 200);
}

function queryFrom(req: Request): { mode: QueryMode; value: string } | null {
  const url = new URL(req.url);
  const candidateId = cleanQueryValue(url.searchParams.get("candidateId"));
  if (candidateId) return { mode: "candidateId", value: candidateId };
  const alias = cleanQueryValue(url.searchParams.get("alias"));
  if (alias) return { mode: "alias", value: alias };
  const normalizedName = cleanQueryValue(
    url.searchParams.get("normalizedName"),
  );
  if (normalizedName) return { mode: "normalizedName", value: normalizedName };
  const subject = cleanQueryValue(url.searchParams.get("subject"));
  if (subject) return { mode: "subject", value: subject };
  return null;
}

function isActiveCandidate(candidate: DossierCandidate): boolean {
  return isActiveSourceFileCandidate(candidate);
}

function isLookupCandidate(candidate: DossierCandidate): boolean {
  return (
    isActiveCandidate(candidate) ||
    candidate.status === "candidate_intake" ||
    candidate.status === "existing_dossier_update"
  );
}

function workflowLaneFor(candidate: DossierCandidate): WorkflowLane {
  if (candidate.status === "candidate_intake") return "candidate_intake";
  if (candidate.status === "existing_dossier_update") {
    return "existing_dossier_update";
  }
  return "active_source_file";
}

function laneDescriptionFor(candidate: DossierCandidate): string {
  const lane = workflowLaneFor(candidate);
  if (lane === "candidate_intake") {
    return "Candidate Intake / newly discovered subject; not active case-file fact.";
  }
  if (lane === "existing_dossier_update") {
    return "Existing Dossier Update / Enrichment material; not an active Source File and not public copy.";
  }
  return "Active BNL Source File / internal working case file.";
}

function matchKindForLane(
  candidate: DossierCandidate,
  baseKind: "name" | "compact_name" | "normalized_name" | "confirmed_alias",
): MatchKind {
  const lane = workflowLaneFor(candidate);
  if (lane === "candidate_intake") {
    if (baseKind === "name") return "candidate_intake_name";
    if (baseKind === "compact_name") return "candidate_intake_compact_name";
    if (baseKind === "normalized_name")
      return "candidate_intake_normalized_name";
    return "candidate_intake_confirmed_alias";
  }
  if (lane === "existing_dossier_update") {
    if (baseKind === "name") return "existing_dossier_update_name";
    if (baseKind === "compact_name")
      return "existing_dossier_update_compact_name";
    if (baseKind === "normalized_name") {
      return "existing_dossier_update_normalized_name";
    }
    return "existing_dossier_update_confirmed_alias";
  }
  return baseKind;
}

function noteSummary(note: DossierSourceFileNote): string {
  const text = note.text.trim().replace(/\s+/g, " ");
  if (text.length <= MAX_NOTE_LENGTH) return text;
  return `${text.slice(0, MAX_NOTE_LENGTH - 1).trim()}…`;
}

function hasPartialNameOverlap(query: string, name: string): boolean {
  const normalizedQuery = normalizeDossierSubjectName(query);
  const normalizedName = normalizeDossierSubjectName(name);
  const compactQuery = compactDossierSubjectName(query);
  const compactName = compactDossierSubjectName(name);
  if (!normalizedQuery || !normalizedName) return false;
  if (normalizedQuery === normalizedName || compactQuery === compactName)
    return false;
  if (normalizedQuery.length < 4 || normalizedName.length < 4) return false;
  return (
    normalizedQuery.includes(normalizedName) ||
    normalizedName.includes(normalizedQuery) ||
    compactQuery.includes(compactName) ||
    compactName.includes(compactQuery)
  );
}

function possibleMatchSummary(
  candidate: DossierCandidate,
  matchKind: PossibleMatchKind,
  alias?: DossierIdentityLink,
) {
  const workflowLane = workflowLaneFor(candidate);
  return {
    candidateId: candidate.id,
    name: candidate.name,
    normalizedName: normalizeDossierSubjectName(candidate.name),
    status: candidate.status,
    workflowLane,
    sourceFileActive: workflowLane === "active_source_file",
    laneDescription: laneDescriptionFor(candidate),
    candidateType: candidate.candidateType,
    source: candidate.source,
    confidence: candidate.confidence ?? null,
    matchKind,
    reviewRequired: true,
    alias: alias
      ? {
          id: alias.id,
          label: alias.label,
          normalizedLabel: alias.normalizedLabel,
          status: alias.status,
          type: alias.type,
          visibility: alias.visibility,
          useForMatching: alias.useForMatching,
          useInPublicDossier: alias.useInPublicDossier,
        }
      : null,
    warning:
      matchKind === "unconfirmed_alias"
        ? "Alias is not confirmed for matching; owner/operator review is required."
        : "Possible same-subject match; owner/operator review is required.",
  };
}

function findActiveDraft(
  drafts: DossierDraft[],
  candidateId: string,
): DossierDraft | null {
  return (
    drafts.find(
      (draft) =>
        draft.candidateId === candidateId &&
        draft.status !== "denied" &&
        draft.status !== "published" &&
        draft.status !== "superseded",
    ) ?? null
  );
}

function ownerReviewStatus(
  draft: DossierDraft | null,
): SourceFileSummary["ownerReview"] {
  if (!draft) return { status: "not_in_owner_review", draftId: null };
  if (draft.status === "ready_for_owner_review")
    return { status: "waiting", draftId: draft.id };
  if (draft.status === "owner_changes_requested") {
    return { status: "changes_requested", draftId: draft.id };
  }
  if (draft.status === "owner_approved")
    return { status: "approved", draftId: draft.id };
  return { status: "not_in_owner_review", draftId: draft.id };
}

function sourceFileReadModel(input: {
  candidate: DossierCandidate;
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
}): SourceFileSummary {
  const activeDraft = findActiveDraft(input.drafts, input.candidate.id);
  const attachedRecommendations = input.recommendations
    .filter(
      (recommendation) =>
        recommendation.targetCandidateId === input.candidate.id,
    )
    .slice(0, MAX_RECOMMENDATIONS)
    .map((recommendation) => ({
      id: recommendation.id,
      type: recommendation.type,
      subjectName: recommendation.subjectName,
      status: recommendation.status,
      confidence: recommendation.confidence ?? null,
      sourceLanes: recommendation.sourceLanes,
      sourceTypes: recommendation.sourceTypes ?? [],
      ingestSource: recommendation.ingestSource ?? null,
      ingestKey: recommendation.ingestKey ?? null,
      reason: recommendation.reason,
      evidenceSummary: recommendation.evidenceSummary ?? null,
      updatedAt: recommendation.updatedAt,
      createdAt: recommendation.createdAt,
    }));

  return {
    candidateId: input.candidate.id,
    id: input.candidate.id,
    name: input.candidate.name,
    normalizedName: normalizeDossierSubjectName(input.candidate.name),
    candidateType: input.candidate.candidateType,
    status: input.candidate.status,
    workflowLane: workflowLaneFor(input.candidate),
    sourceFileActive: workflowLaneFor(input.candidate) === "active_source_file",
    laneDescription: laneDescriptionFor(input.candidate),
    tier: input.candidate.tier,
    score: input.candidate.score,
    confidence: input.candidate.confidence ?? null,
    source: input.candidate.source,
    sourceLanes: input.candidate.sourceLanes ?? [],
    ingestSource: input.candidate.ingestSource ?? null,
    ingestKey: input.candidate.ingestKey ?? null,
    createdFromRecommendationId:
      input.candidate.createdFromRecommendationId ?? null,
    reason: input.candidate.reason,
    whyNow: input.candidate.whyNow,
    evidenceSummary: input.candidate.evidenceSummary,
    knownFacts: input.candidate.knownFacts ?? [],
    missingInfo: input.candidate.missingInfo ?? [],
    doNotSay: input.candidate.doNotSay ?? [],
    publicSafetyNotes: input.candidate.publicSafetyNotes ?? [],
    recommendedTaxonomy: {
      category: input.candidate.recommendedCategory ?? null,
      kind: input.candidate.recommendedKind ?? null,
      ecosystemLane: input.candidate.recommendedEcosystemLane ?? null,
      identityAuthority: input.candidate.recommendedIdentityAuthority ?? null,
      status: input.candidate.recommendedStatus ?? null,
      clearance: input.candidate.recommendedClearance ?? null,
      origin: input.candidate.recommendedOrigin ?? null,
      tags: input.candidate.recommendedTags ?? [],
      proposedTags: input.candidate.proposedTags ?? [],
    },
    sourceFileNotes: (input.candidate.sourceFileNotes ?? []).map((note) => ({
      id: note.id,
      type: note.type,
      summary: noteSummary(note),
      source: note.source,
      status: note.status,
      publicSafe: note.publicSafe === true,
      appliesToDraftId: note.appliesToDraftId ?? null,
      incorporatedIntoDraftId: note.incorporatedIntoDraftId ?? null,
      ingestSource: note.ingestSource ?? null,
      ingestKey: note.ingestKey ?? null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })),
    identityLinks: (input.candidate.identityLinks ?? []).map(
      (identityLink) => ({
        id: identityLink.id,
        label: identityLink.label,
        normalizedLabel: identityLink.normalizedLabel,
        type: identityLink.type,
        visibility: identityLink.visibility,
        status: identityLink.status,
        source: identityLink.source,
        confidence: identityLink.confidence ?? null,
        useForMatching: identityLink.useForMatching,
        useInPublicDossier: identityLink.useInPublicDossier,
        note: identityLink.note ?? null,
        createdFromRecommendationId:
          identityLink.createdFromRecommendationId ?? null,
        createdFromRecommendationSubject:
          identityLink.createdFromRecommendationSubject ?? null,
        createdAt: identityLink.createdAt,
        updatedAt: identityLink.updatedAt,
      }),
    ),
    attachedRecommendations,
    activeDraft: activeDraft
      ? {
          id: activeDraft.id,
          status: activeDraft.status,
          updatedAt: activeDraft.updatedAt,
          createdAt: activeDraft.createdAt,
        }
      : null,
    ownerReview: ownerReviewStatus(activeDraft),
    duplicateWarnings: {
      duplicateRisk: input.candidate.duplicateRisk ?? null,
      existingDossierMatch: input.candidate.existingDossierMatch ?? null,
      mergedIntoCandidateId: input.candidate.mergedIntoCandidateId ?? null,
      mergeSourceCandidateIds: input.candidate.mergeSourceCandidateIds ?? [],
    },
    visibility: VISIBILITY_BOUNDARY,
    updatedAt: input.candidate.updatedAt,
    createdAt: input.candidate.createdAt,
  };
}

function resolveSourceFile(input: {
  mode: QueryMode;
  value: string;
  candidates: DossierCandidate[];
}) {
  const lookupCandidates = input.candidates.filter(isLookupCandidate);
  const normalizedValue = normalizeDossierSubjectName(input.value);
  const compactValue = compactDossierSubjectName(input.value);

  if (input.mode === "candidateId") {
    const exact = input.candidates.find(
      (candidate) => candidate.id === input.value,
    );
    if (exact && isLookupCandidate(exact)) {
      return {
        matches: [{ candidate: exact, matchKind: "candidate_id" as const }],
        possibleMatches: [],
      };
    }
    return { matches: [], possibleMatches: [] };
  }

  const directMatches: ResolvedMatch[] = lookupCandidates
    .map((candidate): ResolvedMatch | null => {
      const normalizedName = normalizeDossierSubjectName(candidate.name);
      const compactName = compactDossierSubjectName(candidate.name);
      if (
        input.mode === "normalizedName" &&
        normalizedValue === normalizedName
      ) {
        return {
          candidate,
          matchKind: matchKindForLane(
            candidate,
            "normalized_name",
          ) as DirectMatchKind,
        };
      }
      if (input.mode === "subject" && normalizedValue === normalizedName) {
        return {
          candidate,
          matchKind: matchKindForLane(candidate, "name") as DirectMatchKind,
        };
      }
      if (input.mode === "subject" && compactValue === compactName) {
        return {
          candidate,
          matchKind: matchKindForLane(
            candidate,
            "compact_name",
          ) as DirectMatchKind,
        };
      }
      return null;
    })
    .filter((match): match is ResolvedMatch => Boolean(match));

  const confirmedAliasMatches: ResolvedMatch[] = lookupCandidates
    .map((candidate): ResolvedMatch | null => {
      const alias = (candidate.identityLinks ?? []).find(
        (identityLink) =>
          identityLink.status === "confirmed" &&
          identityLink.useForMatching === true &&
          identityLink.normalizedLabel === normalizedValue,
      );
      return alias
        ? {
            candidate,
            alias,
            matchKind: matchKindForLane(
              candidate,
              "confirmed_alias",
            ) as AliasMatchKind,
          }
        : null;
    })
    .filter((match): match is ResolvedMatch => Boolean(match));

  const allMatches =
    input.mode === "alias" ? confirmedAliasMatches : directMatches;
  const activeMatches = allMatches.filter((match) =>
    isActiveCandidate(match.candidate),
  );
  const matches = activeMatches.length > 0 ? activeMatches : allMatches;
  const matchedIds = new Set(matches.map((match) => match.candidate.id));

  const possibleMatches = lookupCandidates
    .filter((candidate) => !matchedIds.has(candidate.id))
    .flatMap((candidate) => {
      const alias = (candidate.identityLinks ?? []).find(
        (identityLink) =>
          identityLink.normalizedLabel === normalizedValue &&
          (identityLink.status !== "confirmed" ||
            identityLink.useForMatching !== true),
      );
      if (alias) {
        return [possibleMatchSummary(candidate, "unconfirmed_alias", alias)];
      }
      const normalizedName = normalizeDossierSubjectName(candidate.name);
      const compactName = compactDossierSubjectName(candidate.name);
      if (normalizedValue === normalizedName) {
        return [possibleMatchSummary(candidate, "same_name")];
      }
      if (compactValue === compactName) {
        return [possibleMatchSummary(candidate, "compact_name")];
      }
      if (
        input.mode !== "alias" &&
        hasPartialNameOverlap(input.value, candidate.name)
      ) {
        return [possibleMatchSummary(candidate, "partial_name")];
      }
      return [];
    })
    .slice(0, MAX_POSSIBLE_MATCHES);

  return { matches, possibleMatches };
}

export async function GET(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = queryFrom(req);
  if (!query) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provide one lookup query parameter: candidateId, subject, alias, or normalizedName.",
      },
      { status: 400, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const state = await getDossierWorkflowState();
  const { matches, possibleMatches } = resolveSourceFile({
    mode: query.mode,
    value: query.value,
    candidates: state.candidates,
  });

  if (matches.length === 0) {
    const publicDossierMatches = resolvePublicDossierOnlyMatch(query);
    if (publicDossierMatches.length === 1) {
      return NextResponse.json(
        publicDossierOnlyResponse({
          query,
          match: publicDossierMatches[0],
          possibleMatches,
        }),
        { headers: { "Cache-Control": CACHE_CONTROL } },
      );
    }
  }

  if (matches.length === 1) {
    const match = matches[0];
    const sourceRecord = sourceFileReadModel({
      candidate: match.candidate,
      drafts: state.drafts,
      recommendations: state.recommendations,
    });
    return NextResponse.json(
      {
        ok: true,
        found: true,
        scope: "bnl_internal_source_file_read_model",
        auth: "BNL_SOURCE_FILE_READ_TOKEN",
        mutation: false,
        query,
        matchKind: match.matchKind,
        matchedAlias:
          "alias" in match
            ? {
                id: match.alias.id,
                label: match.alias.label,
                normalizedLabel: match.alias.normalizedLabel,
                status: match.alias.status,
                type: match.alias.type,
                visibility: match.alias.visibility,
                useForMatching: match.alias.useForMatching,
                useInPublicDossier: match.alias.useInPublicDossier,
              }
            : null,
        workflowLane: workflowLaneFor(match.candidate),
        sourceFileActive:
          workflowLaneFor(match.candidate) === "active_source_file",
        laneDescription: laneDescriptionFor(match.candidate),
        sourceFile: sourceRecord,
        sourceRecord,
        possibleMatches,
        readModelBoundary: VISIBILITY_BOUNDARY,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const multipleMatches = matches.map((match) =>
    possibleMatchSummary(
      match.candidate,
      match.matchKind.includes("alias") ? "unconfirmed_alias" : "same_name",
      "alias" in match ? match.alias : undefined,
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      found: false,
      scope: "bnl_internal_source_file_read_model",
      auth: "BNL_SOURCE_FILE_READ_TOKEN",
      mutation: false,
      query,
      reviewRequired: matches.length > 1 || possibleMatches.length > 0,
      possibleMatches: [...multipleMatches, ...possibleMatches].slice(
        0,
        MAX_POSSIBLE_MATCHES,
      ),
      reason:
        matches.length > 1
          ? "Multiple exact BNL Source File matches found; owner/operator review is required."
          : possibleMatches.length > 0
            ? "Only possible BNL Source File matches found; no confirmed match was resolved."
            : "No BNL Source File match found.",
      readModelBoundary: VISIBILITY_BOUNDARY,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}

export async function POST(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Valid JSON body is required" },
      { status: 400, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const action = stringFromBody(body.action);
  if (action !== "create_existing_dossier_update") {
    return NextResponse.json(
      {
        ok: false,
        error: "Unsupported action",
        supportedActions: ["create_existing_dossier_update"],
      },
      { status: 400, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const targetDossierId = stringFromBody(body.targetDossierId);
  const requestedSubject = stringFromBody(body.requestedSubject);
  const publicDossierSlug = stringFromBody(body.publicDossierSlug);
  const publicDossierName = stringFromBody(body.publicDossierName);
  const entry = targetDossierId
    ? databasePage.entries.find((item) => item.id === targetDossierId)
    : databasePage.entries.find((item) => {
        const slug = slugifyPublicDossierName(item.name);
        return (
          (publicDossierSlug && slug === publicDossierSlug) ||
          (publicDossierName &&
            normalizeDossierSubjectName(item.name) ===
              normalizeDossierSubjectName(publicDossierName))
        );
      });

  if (!entry) {
    return NextResponse.json(
      { ok: false, error: "Existing public dossier target was not found" },
      { status: 404, headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  const beforePublicDossier = JSON.stringify(entry);
  const candidate = await createExistingDossierUpdateTarget({
    dossierId: entry.id,
    requestedSubject: requestedSubject || publicDossierName || entry.name,
    createdBy: "bnl_source_files_protected_lookup",
  });
  const afterEntry = databasePage.entries.find((item) => item.id === entry.id);

  return NextResponse.json(
    {
      ok: true,
      action,
      mutation: "internal_workflow_only",
      publishesPublicDossier: false,
      publicDossierMutated: JSON.stringify(afterEntry) !== beforePublicDossier,
      workflowLane: "existing_dossier_update",
      sourceFileActive: false,
      existingDossierUpdateLane: true,
      publicDossierMatchFound: true,
      targetDossierId: entry.id,
      publicDossierName: entry.name,
      publicDossierSlug: slugifyPublicDossierName(entry.name),
      candidate,
      warning:
        "Internal Existing Dossier Update lane created for review-only enrichment. No public dossier content was published or changed.",
      readModelBoundary: VISIBILITY_BOUNDARY,
      generatedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
