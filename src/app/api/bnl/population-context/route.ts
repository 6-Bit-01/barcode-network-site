import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { databasePage, type DatabaseEntry } from "@/content";
import {
  isActiveSourceFileCandidate,
  isDiagnosticTestArtifactRecommendation,
  isResolvedDossierRecommendation,
  normalizeDossierSubjectName,
  type DossierCandidate,
  type DossierDraft,
  type DossierIdentityLink,
  type DossierRecommendation,
  type DossierSourceFileRefreshRequest,
} from "@/lib/dossier-workflow";
import { getDossierWorkflowState } from "@/lib/dossier-workflow-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "private, no-store";
const VERSION = "population_context_v1";

type RouteLane =
  | "source_file"
  | "candidate_intake"
  | "dossier_update_workspace"
  | "dossier_draft"
  | "candidate_recommendation"
  | "resolved_record";

function bearerToken(req: Request): string {
  const authorization = req.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return (
    req.headers.get("x-bnl-api-key")?.trim() ??
    req.headers.get("x-bnl-token")?.trim() ??
    req.headers.get("x-bnl-source-file-read-token")?.trim() ??
    ""
  );
}

function configuredTokens(): string[] {
  return [
    process.env.BNL_API_KEY,
    process.env.BNL_TOKEN,
    process.env.BNL_SOURCE_FILE_READ_TOKEN,
  ]
    .map((token) => token?.trim())
    .filter((token): token is string => Boolean(token));
}

function tokenMatches(providedToken: string): boolean {
  if (!providedToken) return false;
  return configuredTokens().some((expectedToken) => {
    const expected = Buffer.from(expectedToken);
    const provided = Buffer.from(providedToken);
    return (
      expected.length === provided.length && timingSafeEqual(expected, provided)
    );
  });
}

function slugifyPublicDossierName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function publicDossierPath(entry: DatabaseEntry) {
  return `/database/${slugifyPublicDossierName(entry.name)}`;
}

function publicDossierRegistryItem(entry: DatabaseEntry) {
  const normalizedSubjectKey = normalizeDossierSubjectName(entry.name);
  return {
    id: entry.id,
    name: entry.name,
    slug: slugifyPublicDossierName(entry.name),
    status: entry.status,
    aliases: [] as string[],
    canonicalSubjectKey: normalizedSubjectKey,
    normalizedSubjectKey,
    path: publicDossierPath(entry),
  };
}

function adminRoute(candidateId: string, lane: RouteLane) {
  const path = `/admin/dossiers/candidates/${encodeURIComponent(candidateId)}`;
  return { path, lane };
}

function publicDossierMatchFor(candidate: DossierCandidate) {
  const match = candidate.existingDossierMatch ?? null;
  if (!match) return null;
  const entry = databasePage.entries.find((item) => item.id === match.id);
  return {
    id: match.id,
    name: match.name,
    confidence: match.confidence,
    path: entry ? publicDossierPath(entry) : null,
  };
}

function adminSummaryFlags(candidate: DossierCandidate) {
  const generatedAt = candidate.sourceFileSummary?.updatedAt ?? null;
  const latestSourceUpdate =
    candidate.latestSourceFileArchiveUpdatedAt ??
    candidate.latestSourceFileArchive?.updatedAt ??
    null;
  return {
    hasAdminSummary: Boolean(candidate.sourceFileSummary),
    adminSummaryStale: Boolean(
      generatedAt && latestSourceUpdate && latestSourceUpdate > generatedAt,
    ),
    adminSummaryGeneratedAt: generatedAt,
  };
}

function updateSummaryFlags(candidate: DossierCandidate) {
  const flags = adminSummaryFlags(candidate);
  return {
    hasUpdateSummary: flags.hasAdminSummary,
    updateSummaryStale: flags.adminSummaryStale,
    updateSummaryGeneratedAt: flags.adminSummaryGeneratedAt,
  };
}

function latestRefreshStatus(
  candidate: DossierCandidate,
  refreshRequests: DossierSourceFileRefreshRequest[],
) {
  const related = refreshRequests
    .filter(
      (request) =>
        request.candidateId === candidate.id ||
        request.normalizedSubjectKey ===
          normalizeDossierSubjectName(candidate.name),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latest = related[0];
  if (!latest) return null;
  return {
    id: latest.id,
    status: latest.status,
    requestSource: latest.requestSource,
    updatedAt: latest.updatedAt,
    requestedAt: latest.requestedAt,
  };
}

function sourceFileItem(candidate: DossierCandidate) {
  return {
    candidateId: candidate.id,
    subjectName: candidate.name,
    normalizedSubjectKey: normalizeDossierSubjectName(candidate.name),
    candidateType: candidate.candidateType,
    status: candidate.status,
    publicDossierMatch: publicDossierMatchFor(candidate),
    publicDossierId: candidate.existingDossierMatch?.id ?? null,
    latestSourceFileArchiveId: candidate.latestSourceFileArchiveId ?? null,
    latestSourceFileArchiveUpdatedAt:
      candidate.latestSourceFileArchiveUpdatedAt ??
      candidate.latestSourceFileArchive?.updatedAt ??
      null,
    sourceFileArchiveIds: candidate.sourceFileArchiveIds ?? [],
    sourceLanes: candidate.sourceLanes ?? [],
    ...adminSummaryFlags(candidate),
    route: adminRoute(candidate.id, "source_file"),
  };
}

function candidateIntakeItem(candidate: DossierCandidate) {
  return {
    candidateId: candidate.id,
    subjectName: candidate.name,
    normalizedSubjectKey: normalizeDossierSubjectName(candidate.name),
    candidateType: candidate.candidateType,
    status: candidate.status,
    score: candidate.score,
    tier: candidate.tier,
    source: candidate.source,
    ingestSource: candidate.ingestSource ?? null,
    publicDossierMatch: publicDossierMatchFor(candidate),
    createdFromRecommendationId: candidate.createdFromRecommendationId ?? null,
    connectedRecommendationIds: candidate.connectedRecommendationIds ?? [],
    sourceRecommendationIds: candidate.sourceRecommendationIds ?? [],
    route: adminRoute(candidate.id, "candidate_intake"),
  };
}

function dossierUpdateWorkspaceItem(
  candidate: DossierCandidate,
  refreshRequests: DossierSourceFileRefreshRequest[],
) {
  return {
    candidateId: candidate.id,
    subjectName: candidate.name,
    normalizedSubjectKey: normalizeDossierSubjectName(candidate.name),
    status: candidate.status,
    publicDossierId: candidate.existingDossierMatch?.id ?? null,
    publicDossierName: candidate.existingDossierMatch?.name ?? null,
    existingDossierMatch: publicDossierMatchFor(candidate),
    sourceRecommendationIds: candidate.sourceRecommendationIds ?? [],
    connectedRecommendationIds: candidate.connectedRecommendationIds ?? [],
    sourceFileNotesCount: candidate.sourceFileNotes?.length ?? 0,
    ...updateSummaryFlags(candidate),
    bnlRefreshStatus: latestRefreshStatus(candidate, refreshRequests),
    route: adminRoute(candidate.id, "dossier_update_workspace"),
  };
}

function privateIdentityKey(candidateId: string, link: DossierIdentityLink) {
  const digest = createHash("sha256")
    .update(`${candidateId}:${link.id}:${link.normalizedLabel}`)
    .digest("hex")
    .slice(0, 16);
  return `internal_identity_key:${digest}`;
}

function identityLinkItem(
  candidate: DossierCandidate,
  link: DossierIdentityLink,
) {
  const publicSafe =
    link.visibility === "public_safe" && link.useInPublicDossier;
  return {
    sourceCandidateId: link.candidateId || candidate.id,
    targetCandidateId: candidate.id,
    normalizedLabel: publicSafe
      ? link.normalizedLabel
      : privateIdentityKey(candidate.id, link),
    status: link.status,
    useForMatching: link.useForMatching,
    confidence: link.confidence ?? null,
    publicSafe,
  };
}

function destinationLane(candidate: DossierCandidate | undefined) {
  if (!candidate) return null;
  if (candidate.status === "existing_dossier_update") {
    return "dossier_update_workspace";
  }
  if (candidate.status === "candidate_intake") return "candidate_intake";
  if (isActiveSourceFileCandidate(candidate)) return "source_file";
  return "resolved_record";
}

function resolvedCandidateItem(
  candidate: DossierCandidate,
  candidatesById: Map<string, DossierCandidate>,
) {
  const destination = candidate.mergedIntoCandidateId
    ? candidatesById.get(candidate.mergedIntoCandidateId)
    : undefined;
  return {
    recordId: candidate.id,
    subjectName: candidate.name,
    normalizedSubjectKey: normalizeDossierSubjectName(candidate.name),
    status: candidate.status,
    resolvedReason:
      candidate.mergeNote ?? candidate.routingReason ?? candidate.status,
    destinationCandidateId: candidate.mergedIntoCandidateId ?? null,
    destinationSubjectName: destination?.name ?? null,
    destinationLane: destinationLane(destination),
    publicDossierId: candidate.existingDossierMatch?.id ?? null,
  };
}

function recommendationRoute(recommendationId: string) {
  return `/admin/dossiers/recommendations/${encodeURIComponent(recommendationId)}`;
}

function resolvedRecommendationItem(
  recommendation: DossierRecommendation,
  candidatesById: Map<string, DossierCandidate>,
) {
  const destinationCandidateId =
    recommendation.targetCandidateId ??
    recommendation.connectedSourceFileCandidateId ??
    recommendation.connectedCandidateId ??
    null;
  const destination = destinationCandidateId
    ? candidatesById.get(destinationCandidateId)
    : undefined;
  return {
    recordId: recommendation.id,
    subjectName: recommendation.subjectName,
    normalizedSubjectKey:
      recommendation.subjectKey ??
      normalizeDossierSubjectName(recommendation.subjectName),
    status: recommendation.status,
    resolvedReason: recommendation.routingReason ?? recommendation.status,
    destinationCandidateId,
    destinationSubjectName: destination?.name ?? null,
    destinationLane: destinationLane(destination),
    publicDossierId: recommendation.targetDossierId ?? null,
    recommendationId: recommendation.id,
    route: recommendationRoute(recommendation.id),
  };
}


function draftDestinationItem(draft: DossierDraft, candidatesById: Map<string, DossierCandidate>) {
  const candidate = candidatesById.get(draft.candidateId);
  const subjectName = draft.fields?.name ?? candidate?.name ?? draft.candidateId;
  return {
    draftId: draft.id,
    candidateId: draft.candidateId,
    subjectName,
    normalizedSubjectKey: normalizeDossierSubjectName(subjectName),
    status: draft.status,
    route: { path: `/admin/dossiers/drafts/${encodeURIComponent(draft.id)}`, lane: "dossier_draft" as const },
    candidateRoute: candidate ? adminRoute(candidate.id, "dossier_draft") : null,
  };
}

function existingPopulationRecommendationMapping(recommendation: DossierRecommendation) {
  const subjectName = recommendation.subjectName.trim();
  const normalizedSubjectKey = recommendation.subjectKey?.trim() || normalizeDossierSubjectName(subjectName);
  return {
    recommendationId: recommendation.id,
    subjectName,
    normalizedSubjectKey,
    status: recommendation.status,
    recommendedLane: recommendation.recommendedLane ?? null,
    recommendedAction: recommendation.recommendedAction ?? null,
    targetCandidateId: recommendation.targetCandidateId ?? recommendation.connectedCandidateId ?? null,
    targetDossierId: recommendation.targetDossierId ?? recommendation.matchedPublicDossierId ?? null,
    seenCount: recommendation.seenCount ?? 1,
    rawEvidenceRefCount: recommendation.rawEvidenceRefCount ?? recommendation.rawEvidenceRefs?.length ?? 0,
    route: recommendationRoute(recommendation.id),
  };
}

function pendingCandidateRecommendationDestination(
  recommendation: DossierRecommendation,
) {
  const item = pendingCandidateRecommendationItem(recommendation);
  return {
    candidateId: item.recordId,
    subjectName: item.subjectName,
    normalizedSubjectKey: item.normalizedSubjectKey,
    candidateType: "unknown" as const,
    status: "candidate_intake" as const,
    score: null,
    tier: "review_candidate" as const,
    source: "bnl_dynamic_candidate_discovery" as const,
    ingestSource: recommendation.ingestSource ?? null,
    publicDossierMatch: null,
    createdFromRecommendationId: recommendation.id,
    connectedRecommendationIds: [recommendation.id],
    sourceRecommendationIds: [recommendation.id],
    isRecommendationBacked: true,
    recommendationBacked: true,
    destinationLane: "candidate_recommendation" as const,
    route: recommendationRoute(recommendation.id),
  };
}

function pendingCandidateRecommendationItem(
  recommendation: DossierRecommendation,
) {
  const subjectName = recommendation.subjectName.trim();
  const normalizedSubjectKey =
    recommendation.subjectKey?.trim() ||
    normalizeDossierSubjectName(subjectName);
  return {
    recordId: recommendation.id,
    subjectName,
    normalizedSubjectKey,
    status: recommendation.status,
    resolvedReason: "pending_candidate_recommendation",
    destinationCandidateId: null,
    destinationSubjectName: subjectName,
    destinationLane: "candidate_recommendation" as const,
    publicDossierId: recommendation.targetDossierId ?? null,
    recommendationId: recommendation.id,
    route: recommendationRoute(recommendation.id),
  };
}

function isActiveCandidateRecommendation(
  recommendation: DossierRecommendation,
  resolvedCandidateIds: Set<string>,
) {
  const subjectName = recommendation.subjectName?.trim();
  const normalizedSubjectKey =
    recommendation.subjectKey?.trim() ||
    (subjectName ? normalizeDossierSubjectName(subjectName) : "");
  if (!subjectName || !normalizedSubjectKey) return false;
  if (!["new", "reviewing"].includes(recommendation.status)) return false;
  if (isResolvedDossierRecommendation(recommendation)) return false;
  if (isDiagnosticTestArtifactRecommendation(recommendation)) return false;
  if (
    [
      recommendation.targetCandidateId,
      recommendation.connectedCandidateId,
      recommendation.connectedSourceFileCandidateId,
    ].some(
      (candidateId) => candidateId && resolvedCandidateIds.has(candidateId),
    )
  ) {
    return false;
  }
  if (
    recommendation.type === "modify_existing_dossier" ||
    Boolean(recommendation.targetDossierId) ||
    Boolean(recommendation.targetCandidateId)
  ) {
    return false;
  }
  if (
    recommendation.populationRecommendation &&
    (recommendation.recommendedLane === "already_represented" ||
      recommendation.recommendedAction === "mark_duplicate_no_new_info" ||
      recommendation.recommendedAction === "mark_no_new_info" ||
      recommendation.recommendedAction === "dismiss_population_recommendation")
  ) {
    return false;
  }
  return true;
}

function isResolvedRecommendation(recommendation: DossierRecommendation) {
  return (
    recommendation.status === "attached_to_source_file" ||
    recommendation.status === "attached_to_candidate_intake" ||
    recommendation.status === "attached_to_existing_dossier_update" ||
    recommendation.status === "converted_to_source_file" ||
    recommendation.status === "identity_link_created" ||
    recommendation.status === "ignored" ||
    recommendation.status === "dismissed" ||
    recommendation.status === "archived"
  );
}

export async function GET(req: Request) {
  if (!tokenMatches(bearerToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getDossierWorkflowState();
  const candidatesById = new Map(
    state.candidates.map((candidate) => [candidate.id, candidate]),
  );
  const publicDossiers = databasePage.entries.map(publicDossierRegistryItem);
  const sourceFiles = state.candidates
    .filter(isActiveSourceFileCandidate)
    .map(sourceFileItem);
  const trueCandidateIntakeRecords = state.candidates
    .filter((candidate) => candidate.status === "candidate_intake")
    .map(candidateIntakeItem);
  const dossierUpdateWorkspaces = state.candidates
    .filter((candidate) => candidate.status === "existing_dossier_update")
    .map((candidate) =>
      dossierUpdateWorkspaceItem(candidate, state.sourceFileRefreshRequests),
    );
  const draftDestinations = state.drafts
    .filter((draft) => !["denied", "superseded", "published"].includes(draft.status))
    .map((draft) => draftDestinationItem(draft, candidatesById));
  const existingPopulationRecommendations = state.recommendations
    .filter((recommendation) => recommendation.populationRecommendation || recommendation.type === "population_recommendation")
    .map(existingPopulationRecommendationMapping);
  const resolvedCandidateIds = new Set(
    state.candidates
      .filter(
        (candidate) =>
          candidate.status === "merged" ||
          candidate.status === "archived" ||
          candidate.status === "denied" ||
          Boolean(candidate.mergedIntoCandidateId),
      )
      .map((candidate) => candidate.id),
  );
  const pendingRecommendationCandidates = state.recommendations.filter(
    (recommendation) =>
      isActiveCandidateRecommendation(recommendation, resolvedCandidateIds),
  );
  const pendingRecommendationCandidateRecords =
    pendingRecommendationCandidates.map(pendingCandidateRecommendationItem);
  const candidates = [
    ...trueCandidateIntakeRecords,
    ...pendingRecommendationCandidates.map(
      pendingCandidateRecommendationDestination,
    ),
  ];
  const identityLinks = state.candidates.flatMap((candidate) =>
    (candidate.identityLinks ?? []).map((identityLink) =>
      identityLinkItem(candidate, identityLink),
    ),
  );
  const resolvedRecords = [
    ...state.candidates
      .filter(
        (candidate) =>
          candidate.status === "merged" ||
          candidate.status === "archived" ||
          candidate.status === "denied",
      )
      .map((candidate) => resolvedCandidateItem(candidate, candidatesById)),
    ...state.recommendations
      .filter(isResolvedRecommendation)
      .map((recommendation) =>
        resolvedRecommendationItem(recommendation, candidatesById),
      ),
    ...pendingRecommendationCandidateRecords,
  ];

  return NextResponse.json(
    {
      ok: true,
      generatedAt: new Date().toISOString(),
      version: VERSION,
      publicDossiers,
      sourceFiles,
      candidates,
      dossierUpdateWorkspaces,
      draftDestinations,
      recommendationBackedIntakeRecords: pendingRecommendationCandidates.map(pendingCandidateRecommendationDestination),
      existingPopulationRecommendations,
      identityLinks,
      resolvedRecords,
      diagnostics: {
        publicDossierCount: publicDossiers.length,
        draftDestinationCount: draftDestinations.length,
        sourceFileCount: sourceFiles.length,
        candidateCount: trueCandidateIntakeRecords.length,
        candidateDestinationCount: candidates.length,
        recommendationBackedIntakeCount:
          pendingRecommendationCandidateRecords.length,
        pendingRecommendationCandidateCount:
          pendingRecommendationCandidateRecords.length,
        dossierUpdateWorkspaceCount: dossierUpdateWorkspaces.length,
        existingPopulationRecommendationCount: existingPopulationRecommendations.length,
        identityLinkCount: identityLinks.length,
        resolvedRecordCount: resolvedRecords.length,
      },
    },
    { headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
