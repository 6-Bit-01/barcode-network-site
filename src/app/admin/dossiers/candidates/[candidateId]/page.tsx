"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getDossierSourceFileMetrics,
  normalizeDossierSubjectName,
  type DossierCandidate,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierIdentityLink,
  type DossierIdentityLinkSource,
  type DossierIdentityLinkStatus,
  type DossierIdentityLinkType,
  type DossierIdentityLinkVisibility,
  type DossierRecommendation,
  type DossierSourceFileRefreshRequest,
  type DossierSourceFileNoteType,
} from "@/lib/dossier-workflow";
import {
  DossierSourceFileArchiveRawData,
  DossierSourceFileSummaryPanel,
} from "@/components/DossierSourceFileSummaryPanel";
import { createHumanReadableSourceFileNoteView } from "@/lib/dossier-note-display";
import {
  createDossierSourceFileSummary,
  selectDossierSourceFileDisplayRecommendations,
} from "@/lib/dossier-source-file-summary";
import { createDossierEntityActivityReadoutFromSourceFile } from "@/lib/dossier-entity-activity-readout";
import {
  sanitizeMeaningFirstItems,
  sourceFileEvidenceClusterItems,
  sourceFileReasonMeaning,
  sourceFileWhyNowMeaning,
} from "@/lib/dossier-source-memory-meaning";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  recommendations: DossierRecommendation[];
  sourceFileRefreshRequests: DossierSourceFileRefreshRequest[];
  workflow: { status: string };
  publicDossiers?: Array<{ id: string; name: string }>;
};

type ImmediateRefreshResult = {
  ok: boolean;
  status: "success" | "failed" | "skipped" | "timeout" | "unavailable";
  recommendationId?: string;
  failureReason?: string;
};

type SourceNoteForm = {
  type: DossierSourceFileNoteType;
  text: string;
  publicSafe: boolean;
};

type IdentityLinkForm = {
  label: string;
  type: DossierIdentityLinkType;
  visibility: DossierIdentityLinkVisibility;
  source: DossierIdentityLinkSource;
  note: string;
  useForMatching: boolean;
};

const activeDraftStatuses = new Set<DossierDraft["status"]>([
  "draft",
  "owner_changes_requested",
  "ready_for_owner_review",
]);
const noteTypes: DossierSourceFileNoteType[] = [
  "fact",
  "correction",
  "missing_info",
  "public_safety",
  "do_not_say",
  "link_note",
  "general_note",
  "owner_note",
];
const emptyNoteForm: SourceNoteForm = {
  type: "fact",
  text: "",
  publicSafe: true,
};
const identityLinkTypes: DossierIdentityLinkType[] = [
  "alias",
  "artist_name",
  "discord_handle",
  "operator_name",
  "public_persona",
  "previous_name",
  "alternate_spelling",
  "related_label",
  "unknown",
];
const identityLinkSources: DossierIdentityLinkSource[] = [
  "owner_confirmed",
  "admin_manual",
  "mod_manual",
  "bnl_recommendation",
  "rd_context",
  "broadcast_memory",
  "website_dossier",
  "unknown",
];
const emptyIdentityLinkForm: IdentityLinkForm = {
  label: "",
  type: "alias",
  visibility: "internal_only",
  source: "admin_manual",
  note: "",
  useForMatching: false,
};

const identityLinkStatusLabels: Record<DossierIdentityLinkStatus, string> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
  rejected: "Rejected",
  retired: "Retired",
};

const identityLinkStatusCopy: Record<DossierIdentityLinkStatus, string> = {
  proposed:
    "This alias is waiting for review. It will not affect matching until confirmed.",
  confirmed:
    "This alias is confirmed and can route future BNL Signals to this BNL Source File when matching is enabled.",
  rejected: "This alias was rejected and will not be used for matching.",
  retired: "This alias is retired and no longer used for matching.",
};

const identityReviewNotice = {
  confirmForMatching:
    "Identity link confirmed for matching. Future BNL Signals using this label can route to this Source File. This does not publish identity or merge Source Files.",
  confirmReferenceOnly:
    "Identity link confirmed as reference-only. It remains internal context and will not route future BNL Signals automatically.",
  rejectDossierIdentityLink:
    "Identity link rejected. It will not be used for matching.",
  retireDossierIdentityLink:
    "Identity link retired. It remains in history and will no longer be used for matching.",
};

const openRefreshStatuses = new Set<DossierSourceFileRefreshRequest["status"]>([
  "pending",
  "claimed",
]);
const STALE_OPEN_REFRESH_REQUEST_MS = 5 * 60 * 1000;

function isOpenRefreshRequest(request?: DossierSourceFileRefreshRequest | null) {
  return Boolean(request && openRefreshStatuses.has(request.status));
}

function refreshRequestMatchesCandidate(input: {
  request: DossierSourceFileRefreshRequest;
  candidateId: string;
  normalizedSubjectKey: string;
}) {
  if (input.request.candidateId) {
    return input.request.candidateId === input.candidateId;
  }
  return input.request.normalizedSubjectKey === input.normalizedSubjectKey;
}

function isStaleOpenRefreshRequest(request?: DossierSourceFileRefreshRequest | null) {
  if (!request || !isOpenRefreshRequest(request)) return false;
  const updatedAt = Date.parse(request.updatedAt || request.requestedAt);
  return !Number.isNaN(updatedAt) && Date.now() - updatedAt > STALE_OPEN_REFRESH_REQUEST_MS;
}

function latestMatchingRefreshRequest(input: {
  requests: DossierSourceFileRefreshRequest[];
  candidateId: string;
  normalizedSubjectKey: string;
  requestId?: string;
}) {
  const matchingRequests = input.requests.filter((request) =>
    input.requestId
      ? request.id === input.requestId ||
        refreshRequestMatchesCandidate({
          request,
          candidateId: input.candidateId,
          normalizedSubjectKey: input.normalizedSubjectKey,
        })
      : refreshRequestMatchesCandidate({
          request,
          candidateId: input.candidateId,
          normalizedSubjectKey: input.normalizedSubjectKey,
        }),
  );

  const exactRequest = input.requestId
    ? matchingRequests.find((request) => request.id === input.requestId)
    : undefined;
  return (
    exactRequest ??
    matchingRequests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  );
}

function isBnlSourceFileEnrichment(recommendation: DossierRecommendation) {
  return recommendation.ingestSource === "bnl_source_file_enrichment";
}

function recommendationTimestamp(recommendation: DossierRecommendation) {
  return (
    recommendation.updatedAt ??
    recommendation.ingestedAt ??
    recommendation.createdAt
  );
}

function latestBnlSourceFileEnrichment(input: {
  candidate: DossierCandidate;
  recommendations: DossierRecommendation[];
}) {
  const candidateSubjectKey = normalizeDossierSubjectName(input.candidate.name);
  const newestForCandidate = (recommendations: DossierRecommendation[]) =>
    [...recommendations].sort((a, b) =>
      recommendationTimestamp(b).localeCompare(recommendationTimestamp(a)),
    )[0];

  return (
    newestForCandidate(
      input.recommendations.filter(
        (recommendation) =>
          isBnlSourceFileEnrichment(recommendation) &&
          recommendation.targetCandidateId === input.candidate.id,
      ),
    ) ??
    newestForCandidate(
      input.recommendations.filter(
        (recommendation) =>
          isBnlSourceFileEnrichment(recommendation) &&
          !recommendation.targetCandidateId &&
          normalizeDossierSubjectName(
            recommendation.subjectKey || recommendation.subjectName,
          ) === candidateSubjectKey,
      ),
    )
  );
}



function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function hasCaseReportShape(value: unknown) {
  const report = recordValue(value);
  if (!report) return false;
  return [
    "caseSummary",
    "dossierUse",
    "publicSafeClaims",
    "evidenceSummary",
    "reviewBlockers",
    "recommendedNextSteps",
    "confidenceNotes",
    "memoryCoverage",
  ].some((key) => report[key] !== undefined);
}

function latestArchiveHasCaseReport(candidate: DossierCandidate) {
  const root = recordValue(candidate.latestSourceFileArchive);
  if (!root) return false;
  const candidates: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();
  const add = (value: unknown) => {
    const object = recordValue(value);
    if (!object || seen.has(object)) return;
    seen.add(object);
    candidates.push(object);
  };
  add(root);
  for (const key of ["sourcePackage", "archivePayload", "archive", "payload", "sourceFileArchive"] as const) {
    const wrapped = root[key];
    add(wrapped);
    add(recordValue(wrapped)?.sourcePackage);
  }
  return candidates.some((candidateValue) => {
    const brief = recordValue(candidateValue.sourceFileBriefV2);
    return [
      candidateValue.sourceFileCaseReportV1,
      brief?.sourceFileCaseReportV1,
      brief?.caseFileReport,
      candidateValue.caseFileReport,
    ].some(hasCaseReportShape);
  });
}

function candidateLatestArchiveMissingCaseReport(candidate?: DossierCandidate | null) {
  if (!candidate) return false;
  const hasLatestSourceData = Boolean(
    candidate.latestSourceFileArchive ??
      candidate.latestSourceFileArchiveId ??
      candidate.latestSourceFileArchiveDigest ??
      candidate.latestSourceFileArchiveUpdatedAt ??
      (candidate.sourceFileArchiveIds?.length ?? 0) > 0,
  );
  return hasLatestSourceData && !latestArchiveHasCaseReport(candidate);
}

function requestResolvedByNewerEnrichment(input: {
  request?: DossierSourceFileRefreshRequest;
  recommendation?: DossierRecommendation;
}) {
  if (!input.request || !isOpenRefreshRequest(input.request)) return false;
  const recommendationTimestampValue = input.recommendation
    ? Date.parse(recommendationTimestamp(input.recommendation))
    : NaN;
  const requestedAt = Date.parse(input.request.requestedAt);
  return (
    !Number.isNaN(recommendationTimestampValue) &&
    !Number.isNaN(requestedAt) &&
    recommendationTimestampValue > requestedAt
  );
}

function routeParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? decodeURIComponent(raw) : "";
}

function MinimalState({ title, message }: { title: string; message: string }) {
  return (
    <main className="pt-14 min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">
          ADMIN ACCESS CHECK
        </p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <Link
          href="/admin/dossiers"
          className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
        >
          Back to Dossier Control Center
        </Link>
      </section>
    </main>
  );
}

function list(items: string[] | undefined, empty = "—") {
  return items?.length ? (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  ) : (
    <p className="text-muted">{empty}</p>
  );
}

function meaningFirstList(
  items: Array<string | undefined> | undefined,
  empty = "—",
  subjectName?: string,
) {
  return list(
    sanitizeMeaningFirstItems(items ?? [], {
      subjectName,
      fallback: empty,
      includePublicDiscord: true,
    }),
    empty,
  );
}

function recommendationEvidenceItems(recommendation: DossierRecommendation) {
  const clusterItems = sourceFileEvidenceClusterItems(
    [
      ...(recommendation.usefulEvidence ?? []),
      ...(recommendation.knownContext ?? []),
      recommendation.evidenceSummary,
      recommendation.reason,
      ...(recommendation.sourceTypes ?? []),
      ...(recommendation.sourceLanes ?? []),
    ],
    { subjectName: recommendation.subjectName },
  );
  const humanItems = sanitizeMeaningFirstItems(
    [
      ...(recommendation.usefulEvidence ?? []),
      ...(recommendation.knownContext ?? []),
      recommendation.evidenceSummary,
      recommendation.reason,
    ],
    {
      subjectName: recommendation.subjectName,
      includePublicDiscord: true,
    },
  );
  return clusterItems.length ? clusterItems : humanItems;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border/70 bg-background/20 p-4 text-sm text-muted">
      <h2 className="font-bold text-foreground mb-2">{title}</h2>
      {children}
    </section>
  );
}

function StatusBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex border border-border bg-background/40 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-muted">
      {children}
    </span>
  );
}

function uniqueLabels(labels: string[]) {
  return Array.from(new Set(labels.filter(Boolean)));
}

function sourceWarningLabels(input: {
  candidate: DossierCandidate;
  recommendations: DossierRecommendation[];
}) {
  const lanes = new Set([
    ...(input.candidate.sourceLanes ?? []),
    ...input.recommendations.flatMap(
      (recommendation) => recommendation.sourceLanes,
    ),
  ]);
  return uniqueLabels([
    lanes.has("broadcast_memory") ? "Review-only memory context" : "",
    input.candidate.ingestSource === "bnl_dynamic_candidate_discovery" ||
    input.candidate.ingestSource === "bnl_source_knowledge_bridge" ||
    input.candidate.ingestSource === "bnl_source_file_enrichment" ||
    input.recommendations.some(
      (recommendation) =>
        recommendation.ingestSource === "bnl_dynamic_candidate_discovery" ||
        recommendation.ingestSource === "bnl_source_knowledge_bridge" ||
        recommendation.ingestSource === "bnl_source_file_enrichment",
    )
      ? "Internal/private review required"
      : "",
    (input.candidate.publicSafetyNotes ?? []).length > 0 ||
    input.recommendations.some(
      (recommendation) => (recommendation.publicSafetyNotes ?? []).length > 0,
    )
      ? "Public use not allowed until review"
      : "",
    input.recommendations.some(
      (recommendation) => recommendation.type === "identity_link",
    ) ||
    (input.candidate.identityLinks ?? []).some(
      (link) => link.status === "proposed",
    )
      ? "Possible connection, not confirmed identity"
      : "",
    "Owner review required",
  ]);
}

function IdentityLinkDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/60 bg-background/10 p-2">
      <p className="text-[0.65rem] uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function CreatedFromBnlSignalBlock({
  identityLink,
  recommendation,
}: {
  identityLink: DossierIdentityLink;
  recommendation?: DossierRecommendation;
}) {
  if (!identityLink.createdFromRecommendationId) return null;

  const evidenceItems = recommendation
    ? recommendationEvidenceItems(recommendation)
    : [];

  return (
    <div className="border border-border/70 bg-background/30 p-3 space-y-2">
      <p className="font-semibold text-foreground">Created from BNL Signal</p>
      <div className="grid gap-2 md:grid-cols-2">
        <IdentityLinkDetail
          label="BNL Signal subject"
          value={
            identityLink.createdFromRecommendationSubject ??
            recommendation?.subjectName ??
            "—"
          }
        />
        <IdentityLinkDetail
          label="Confidence"
          value={recommendation?.confidence ?? identityLink.confidence ?? "—"}
        />
      </div>
      {evidenceItems.length > 0 ? (
        <div>
          <p className="text-[0.65rem] uppercase tracking-widest text-muted">
            Reason / evidence summary
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            {evidenceItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Review-only recommendation context is attached.</p>
      )}
      {(recommendation?.sourceLanes ?? []).length > 0 && (
        <IdentityLinkDetail
          label="Source lanes"
          value={(recommendation?.sourceLanes ?? []).join(", ")}
        />
      )}
      <Link
        href={`/admin/dossiers/recommendations/${identityLink.createdFromRecommendationId}`}
        className="inline-flex text-accent hover:underline"
      >
        Open recommendation
      </Link>
    </div>
  );
}

function IdentityLinkCard({
  identityLink,
  saving,
  onReview,
  recommendation,
}: {
  identityLink: DossierIdentityLink;
  saving: boolean;
  recommendation?: DossierRecommendation;
  onReview: (
    identityLink: DossierIdentityLink,
    action:
      | "confirmDossierIdentityLink"
      | "rejectDossierIdentityLink"
      | "retireDossierIdentityLink",
    options?: { useForMatching?: boolean; useInPublicDossier?: boolean },
  ) => void;
}) {
  const isProposed = identityLink.status === "proposed";
  const isConfirmed = identityLink.status === "confirmed";

  return (
    <article className="border border-border/70 bg-background/20 p-3 space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-foreground font-semibold">{identityLink.label}</p>
          <p className="mt-1">{identityLinkStatusCopy[identityLink.status]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge>{identityLinkStatusLabels[identityLink.status]}</StatusBadge>
          {isConfirmed && (
            <>
              <StatusBadge>
                {identityLink.useForMatching
                  ? "Active for matching"
                  : "Reference only / Not used for matching"}
              </StatusBadge>
              <StatusBadge>
                {identityLink.visibility === "public_safe"
                  ? "Public-safe label"
                  : "Internal only"}
              </StatusBadge>
              <StatusBadge>
                {identityLink.useInPublicDossier
                  ? "Approved for public dossier text"
                  : "Not public dossier text"}
              </StatusBadge>
            </>
          )}
          {isProposed && <StatusBadge>Not used for matching</StatusBadge>}
        </div>
      </div>

      {isProposed && (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          <IdentityLinkDetail label="Type" value={identityLink.type} />
          <IdentityLinkDetail label="Source" value={identityLink.source} />
          <IdentityLinkDetail
            label="Confidence"
            value={identityLink.confidence ?? "—"}
          />
          <IdentityLinkDetail
            label="Visibility"
            value={
              identityLink.visibility === "public_safe"
                ? "Public-safe label"
                : "Internal only"
            }
          />
          <IdentityLinkDetail
            label="Created from BNL Signal"
            value={identityLink.createdFromRecommendationId ? "Yes" : "No"}
          />
          <IdentityLinkDetail
            label="Currently used for matching"
            value={identityLink.useForMatching ? "Yes" : "No"}
          />
          <IdentityLinkDetail
            label="Public-safe"
            value={identityLink.visibility === "public_safe" ? "Yes" : "No"}
          />
          <IdentityLinkDetail
            label="Allowed in public dossier text"
            value={identityLink.useInPublicDossier ? "Yes" : "No"}
          />
        </div>
      )}

      {isConfirmed && (
        <div className="grid gap-2 md:grid-cols-3">
          <IdentityLinkDetail
            label="Matching"
            value={
              identityLink.useForMatching
                ? "Active for matching"
                : "Reference only / Not used for matching"
            }
          />
          <IdentityLinkDetail
            label="Visibility"
            value={
              identityLink.visibility === "public_safe"
                ? "Public-safe label"
                : "Internal only"
            }
          />
          <IdentityLinkDetail
            label="Public dossier text"
            value={
              identityLink.useInPublicDossier
                ? "Approved for public dossier text"
                : "Not public dossier text"
            }
          />
        </div>
      )}

      <CreatedFromBnlSignalBlock
        identityLink={identityLink}
        recommendation={recommendation}
      />

      <p className="whitespace-pre-wrap">Note: {identityLink.note ?? "—"}</p>
      <p>
        Created by {identityLink.createdBy ?? "—"} at {" "}
        {formatDate(identityLink.createdAt)}
        {isConfirmed && (
          <>
            {" "}/ Confirmed by {identityLink.confirmedBy ?? "—"} at {" "}
            {formatDate(identityLink.confirmedAt)}
          </>
        )}
      </p>

      {isProposed && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onReview(identityLink, "confirmDossierIdentityLink", {
                  useForMatching: true,
                  useInPublicDossier:
                    identityLink.useInPublicDossier === true,
                })
              }
              className="border border-accent px-3 py-1.5 text-accent hover:bg-accent hover:text-background disabled:pointer-events-none disabled:opacity-50"
            >
              Confirm for matching
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onReview(identityLink, "confirmDossierIdentityLink", {
                  useForMatching: false,
                  useInPublicDossier: false,
                })
              }
              className="border border-border px-3 py-1.5 hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
            >
              Confirm reference only
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onReview(identityLink, "rejectDossierIdentityLink")
              }
              className="border border-border px-3 py-1.5 hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
            >
              Reject
            </button>
          </div>
          <p>
            Keep proposed: Leave unresolved. This stays proposed and will not
            affect matching.
          </p>
        </div>
      )}

      {isConfirmed && (
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onReview(identityLink, "retireDossierIdentityLink")
            }
            className="border border-border px-3 py-1.5 hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
          >
            Retire
          </button>
        </div>
      )}
    </article>
  );
}

function HumanReadableNoteView({
  view,
  createdAt,
  workflowLane,
  appliedDraftId,
}: {
  view: ReturnType<typeof createHumanReadableSourceFileNoteView>;
  createdAt?: string;
  workflowLane?: string;
  appliedDraftId?: string;
}) {
  return (
    <article className="border border-border/70 bg-background/20 p-4 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-foreground font-semibold">{view.summary}</p>
          <p className="text-xs text-muted">{view.sourceCopy}</p>
          {view.legacyRawFormatting && (
            <p className="text-xs text-accent">
              This older note had technical formatting. The readable case-file
              view below is derived for admin review only.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge>{view.reviewStatus ?? "review"}</StatusBadge>
          <StatusBadge>Created {formatDate(createdAt)}</StatusBadge>
          {workflowLane && <StatusBadge>Review-only</StatusBadge>}
          <StatusBadge>{view.warningCount} warnings</StatusBadge>
          <StatusBadge>{view.missingInfoCount} missing info</StatusBadge>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {view.sections.map((section) => (
          <section
            key={section.title}
            className="border border-border/60 bg-background/20 p-3 text-sm text-muted"
          >
            <h3 className="font-bold text-foreground mb-2">{section.title}</h3>
            {section.items.length === 1 ? (
              <p className="whitespace-pre-wrap">{section.items[0]}</p>
            ) : (
              <ul className="list-disc pl-5 space-y-1">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      {appliedDraftId && (
        <p className="text-xs text-muted">
          Applied draft:{" "}
          <Link
            className="text-accent hover:underline"
            href={`/admin/dossiers/drafts/${appliedDraftId}`}
          >
            {appliedDraftId}
          </Link>
        </p>
      )}
      <details className="border border-border/60 bg-background/20 p-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-foreground">
          Developer / Raw Source Audit — internal debugging only
        </summary>
        <div className="mt-3 space-y-3">
          {view.rawMetadata.length > 0 && (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {view.rawMetadata.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="border border-border/50 bg-background/20 p-2"
                >
                  <dt className="uppercase tracking-widest text-accent">
                    {item.label}
                  </dt>
                  <dd className="break-words whitespace-pre-wrap">
                    {item.value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-border/50 bg-background/30 p-3">
            {view.rawText || "No original text stored."}
          </pre>
        </div>
      </details>
    </article>
  );
}

function isCandidateClosed(candidate: DossierCandidate) {
  return candidate.status === "denied" || candidate.status === "merged";
}

function isDraftActive(draft: DossierDraft) {
  return activeDraftStatuses.has(draft.status);
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString() : "—";
}

function PhaseRail() {
  return (
    <section
      className="border border-border bg-background/30 p-3 text-xs uppercase tracking-widest text-muted"
      aria-label="Dossier phase indicator"
    >
      <div className="flex flex-wrap gap-2">
        <span className="border border-accent bg-accent/10 px-3 py-2 text-accent">
          Phase 1 — BNL Source File
        </span>
        <span className="border border-border px-3 py-2">
          Phase 2 — Proposed Dossier + BNL Edit Chat
        </span>
        <span className="border border-border px-3 py-2">
          Phase 3 — Final Admin Draft
        </span>
        <span className="border border-border px-3 py-2">
          Phase 4 — Owner Review
        </span>
        <span className="border border-border px-3 py-2 opacity-60">
          Phase 5 — Approved / Publish Later
        </span>
      </div>
    </section>
  );
}

export default function CandidateReviewPage() {
  const params = useParams();
  const router = useRouter();
  const candidateId = routeParam(params?.candidateId);
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteForm, setNoteForm] = useState<SourceNoteForm>(emptyNoteForm);
  const [identityLinkForm, setIdentityLinkForm] = useState<IdentityLinkForm>(
    emptyIdentityLinkForm,
  );
  const [selectedExistingDossierId, setSelectedExistingDossierId] =
    useState("");
  const [refreshPollingTarget, setRefreshPollingTarget] = useState<{
    requestId?: string;
    candidateId: string;
  } | null>(null);
  const [sourceFileOpenState, setSourceFileOpenState] = useState<{
    openedAt?: string;
    immediateRefresh?: ImmediateRefreshResult;
    running: boolean;
  }>({ running: false });

  async function fetchWorkflowPayload(options: { cacheBust?: boolean } = {}) {
    const response = await fetch(
      options.cacheBust
        ? `/api/admin/dossiers?refresh=${Date.now()}`
        : "/api/admin/dossiers",
      { cache: "no-store" },
    );
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Admin authentication required"
          : `Workflow API returned ${response.status}.`,
      );
    return (await response.json()) as WorkflowPayload;
  }

  async function loadWorkflow(options: { recordOpen?: boolean } = {}) {
    if (options.recordOpen === false) {
      const data = await fetchWorkflowPayload();
      setPayload(data);
      return;
    }

    setSourceFileOpenState({ running: true });
    const openResponse = await fetch("/api/admin/dossiers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "recordSourceFileOpen", candidateId }),
    });
    if (!openResponse.ok) {
      throw new Error(`Workflow API returned ${openResponse.status}.`);
    }
    const openPayload = (await openResponse.json()) as WorkflowPayload & {
      openedAt?: string;
      refresh?: { request?: DossierSourceFileRefreshRequest | null };
      immediateRefresh?: ImmediateRefreshResult;
    };
    setPayload(openPayload);
    setSourceFileOpenState({
      openedAt: openPayload.openedAt,
      immediateRefresh: openPayload.immediateRefresh,
      running: false,
    });
    if (
      openPayload.refresh?.request &&
      isOpenRefreshRequest(openPayload.refresh.request)
    ) {
      setRefreshPollingTarget({
        candidateId,
        requestId: openPayload.refresh.request.id,
      });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow({ recordOpen: true })
        .catch((err) => {
          setSourceFileOpenState((current) => ({
            ...current,
            running: false,
            immediateRefresh: {
              ok: false,
              status: "failed",
              failureReason:
                err instanceof Error
                  ? err.message
                  : "Failed to load internal record.",
            },
          }));
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load internal record.",
          );
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [candidateId]);

  useEffect(() => {
    const candidate = payload?.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    const normalizedSubjectKey = normalizeDossierSubjectName(candidate.name);
    const pendingRefreshRequest = latestMatchingRefreshRequest({
      requests: payload?.sourceFileRefreshRequests ?? [],
      candidateId,
      normalizedSubjectKey,
      requestId: refreshPollingTarget?.requestId,
    });
    const latestEnrichment = latestBnlSourceFileEnrichment({
      candidate,
      recommendations: payload?.recommendations ?? [],
    });
    const isResolvedByEnrichment = requestResolvedByNewerEnrichment({
      request: pendingRefreshRequest,
      recommendation: latestEnrichment,
    });
    if (!isOpenRefreshRequest(pendingRefreshRequest) || isResolvedByEnrichment) {
      if (isResolvedByEnrichment) {
        setRefreshPollingTarget(null);
      }
      return;
    }

    let cancelled = false;
    const pollForRefreshCompletion = async () => {
      try {
        const freshPayload = await fetchWorkflowPayload({ cacheBust: true });
        if (cancelled) return;
        setPayload(freshPayload);
        const freshCandidate = freshPayload.candidates.find(
          (item) => item.id === candidateId,
        );
        if (!freshCandidate) return;
        const freshSubjectKey = normalizeDossierSubjectName(freshCandidate.name);
        const latestMatchingRefresh = latestMatchingRefreshRequest({
          requests: freshPayload.sourceFileRefreshRequests,
          candidateId,
          normalizedSubjectKey: freshSubjectKey,
          requestId: refreshPollingTarget?.requestId ?? pendingRefreshRequest.id,
        });
        const freshEnrichment = latestBnlSourceFileEnrichment({
          candidate: freshCandidate,
          recommendations: freshPayload.recommendations,
        });
        const resolvedByFreshEnrichment = requestResolvedByNewerEnrichment({
          request: latestMatchingRefresh,
          recommendation: freshEnrichment,
        });
        const terminalRefresh =
          latestMatchingRefresh && !isOpenRefreshRequest(latestMatchingRefresh);
        if (terminalRefresh || resolvedByFreshEnrichment || !latestMatchingRefresh) {
          const refreshedPayload = await fetchWorkflowPayload({ cacheBust: true });
          if (!cancelled) {
            setPayload(refreshedPayload);
            setRefreshPollingTarget(null);
            router.refresh();
            const completedRecommendationVisible = latestMatchingRefresh
              ?.completedByRecommendationId
              ? refreshedPayload.recommendations.some(
                  (recommendation) =>
                    recommendation.id ===
                    latestMatchingRefresh.completedByRecommendationId,
                )
              : true;
            if (
              latestMatchingRefresh?.status === "completed" &&
              !completedRecommendationVisible
            ) {
              window.setTimeout(() => window.location.reload(), 500);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setNotice(
            err instanceof Error
              ? err.message
              : "Failed to check BNL Source File refresh status.",
          );
        }
      }
    };
    const interval = window.setInterval(() => {
      void pollForRefreshCompletion();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    candidateId,
    payload?.candidates,
    payload?.recommendations,
    payload?.sourceFileRefreshRequests,
    refreshPollingTarget,
    router,
  ]);

  const candidate = useMemo(
    () => payload?.candidates.find((item) => item.id === candidateId) ?? null,
    [payload?.candidates, candidateId],
  );

  const linkedDrafts = useMemo(
    () =>
      payload?.drafts.filter((draft) => draft.candidateId === candidateId) ??
      [],
    [payload?.drafts, candidateId],
  );
  const primaryDraft =
    linkedDrafts.find((draft) => isDraftActive(draft)) ?? linkedDrafts[0];
  const sourceNotes = [...(candidate?.sourceFileNotes ?? [])].sort(
    (a, b) =>
      (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1) ||
      b.createdAt.localeCompare(a.createdAt),
  );
  const sourceNotesSummary = {
    noteCount: sourceNotes.length,
    warningCount: sourceNotes.filter((note) =>
      ["public_safety", "do_not_say", "correction"].includes(note.type),
    ).length,
    dossierQuestionCount: sourceNotes.filter((note) => note.type === "missing_info").length,
    latestUpdatedAt: sourceNotes[0]?.updatedAt ?? sourceNotes[0]?.createdAt,
  };
  const hasOwnerReviewDraft = linkedDrafts.some(
    (draft) => draft.status === "ready_for_owner_review",
  );
  const isArchivedCandidate = candidate?.status === "archived";
  const isCandidateIntake = candidate?.status === "candidate_intake";
  const canPromoteCandidate = Boolean(candidate && isCandidateIntake);
  const canArchiveCandidate = Boolean(
    candidate && !isCandidateClosed(candidate) && !isArchivedCandidate,
  );
  const canRestoreCandidate = Boolean(candidate && isArchivedCandidate);
  const canPermanentlyDeleteCandidate = Boolean(
    candidate && !isCandidateClosed(candidate),
  );
  const canCreateDraft = Boolean(
    candidate &&
    !isCandidateClosed(candidate) &&
    !isArchivedCandidate &&
    !isCandidateIntake &&
    !linkedDrafts.some((draft) => isDraftActive(draft)),
  );
  const canUpdateCandidate = Boolean(
    candidate && !isCandidateClosed(candidate) && !isArchivedCandidate,
  );
  const sourceMetrics = candidate
    ? getDossierSourceFileMetrics({
        candidate,
        drafts: payload?.drafts ?? [],
        recommendations: payload?.recommendations ?? [],
      })
    : null;
  const attachedRecommendations = candidate
    ? selectDossierSourceFileDisplayRecommendations({
        candidate,
        recommendations: payload?.recommendations ?? [],
        refreshRequests: payload?.sourceFileRefreshRequests ?? [],
      })
    : [];
  const latestRecommendationTimestamp = attachedRecommendations
    .map(
      (recommendation) => recommendation.updatedAt ?? recommendation.createdAt,
    )
    .filter(Boolean)
    .sort()
    .at(-1);
  const candidateRefreshKey = candidate
    ? normalizeDossierSubjectName(candidate.name)
    : "";
  const refreshRequests = (payload?.sourceFileRefreshRequests ?? []).filter(
    (request) =>
      candidate &&
      refreshRequestMatchesCandidate({
        request,
        candidateId: candidate.id,
        normalizedSubjectKey: candidateRefreshKey,
      }),
  );
  const latestEnrichmentForRefreshStatus = candidate
    ? latestBnlSourceFileEnrichment({
        candidate,
        recommendations: payload?.recommendations ?? [],
      })
    : undefined;
  const nonStaleActiveRefreshRequest = refreshRequests
    .filter(
      (request) => isOpenRefreshRequest(request) && !isStaleOpenRefreshRequest(request),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const caseReportMissingForLatestArchive = candidateLatestArchiveMissingCaseReport(candidate);
  const activeRefreshResolvedByEnrichment = requestResolvedByNewerEnrichment({
    request: nonStaleActiveRefreshRequest,
    recommendation: latestEnrichmentForRefreshStatus,
  });
  const latestRefreshRequest =
    nonStaleActiveRefreshRequest ??
    [...refreshRequests].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )[0];
  const openTimestamp = sourceFileOpenState.openedAt;
  const latestEnrichmentTimestamp = latestEnrichmentForRefreshStatus
    ? recommendationTimestamp(latestEnrichmentForRefreshStatus)
    : undefined;
  const latestEnrichmentNewerThanOpen = Boolean(
    openTimestamp &&
      latestEnrichmentTimestamp &&
      Date.parse(latestEnrichmentTimestamp) > Date.parse(openTimestamp),
  );
  const immediateRecommendationVisible = Boolean(
    sourceFileOpenState.immediateRefresh?.recommendationId &&
      attachedRecommendations.some(
        (recommendation) =>
          recommendation.id === sourceFileOpenState.immediateRefresh?.recommendationId,
      ),
  );
  const sourceFileFreshForOpen = Boolean(
    !caseReportMissingForLatestArchive &&
      (latestEnrichmentNewerThanOpen ||
        (sourceFileOpenState.immediateRefresh?.ok && immediateRecommendationVisible)),
  );
  const refreshStatusLabel = sourceFileOpenState.running
    ? sourceFileOpenState.immediateRefresh
      ? "RETRYING UPDATE"
      : "UPDATING SOURCE FILE"
    : sourceFileFreshForOpen
      ? "FILE UPDATED"
      : "FILE NOT UPDATED";
  const refreshStatusDetail = sourceFileOpenState.running
    ? "BNL is updating this Source File now through the server-side immediate refresh endpoint."
    : caseReportMissingForLatestArchive
      ? "Latest archive exists, but BNL has not generated the Source File report yet. Refresh requests ask BNL for report backfill."
      : sourceFileFreshForOpen
        ? "Source File updated for this page open."
        : "This page is not treating older BNL Source File data as current. Use FILE NOT UPDATED to retry the immediate update.";
  const refreshFailureReason =
    sourceFileOpenState.immediateRefresh?.failureReason ??
    latestRefreshRequest?.failureReason ??
    (caseReportMissingForLatestArchive
      ? "case_report_missing_after_refresh"
      : !sourceFileFreshForOpen && !sourceFileOpenState.running
        ? "No fresh BNL enrichment is visible for this page open."
        : undefined);
  const manualRefreshDisabled = saving || !candidate || sourceFileOpenState.running || sourceFileFreshForOpen;
  const manualRefreshButtonLabel = sourceFileOpenState.running
    ? sourceFileOpenState.immediateRefresh
      ? "RETRYING UPDATE"
      : "UPDATING SOURCE FILE"
    : sourceFileFreshForOpen
      ? "FILE UPDATED"
      : "FILE NOT UPDATED";
  const manualRefreshButtonClass = sourceFileFreshForOpen
    ? "border border-border bg-muted/20 px-4 py-2 text-xs uppercase tracking-widest text-muted disabled:opacity-70"
    : "border border-red-500 px-4 py-2 text-xs uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-background disabled:opacity-50";
  const staleDataWarning = !sourceFileFreshForOpen;
  const sourceFileSummary = candidate
    ? createDossierSourceFileSummary({
        candidate,
        drafts: linkedDrafts,
        recommendations: attachedRecommendations,
      })
    : null;
  const entityActivityReadout = candidate
    ? createDossierEntityActivityReadoutFromSourceFile({
        summary: sourceFileSummary,
        recommendations: attachedRecommendations,
        subjectName: candidate.name,
      })
    : null;
  const hasSavedOperatorSourceSummary = Boolean(
    candidate?.sourceFileSummary?.summaryText?.trim() ||
    candidate?.sourceFileSummary?.knownContext?.length ||
    candidate?.sourceFileSummary?.openQuestions?.length ||
    candidate?.sourceFileSummary?.nextAction?.trim(),
  );
  const identityLinks = [...(candidate?.identityLinks ?? [])].sort(
    (a, b) =>
      (a.status === "proposed" ? -1 : 1) - (b.status === "proposed" ? -1 : 1) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
  const proposedIdentityLinks = identityLinks.filter(
    (identityLink) => identityLink.status === "proposed",
  );
  const confirmedIdentityLinks = identityLinks.filter(
    (identityLink) => identityLink.status === "confirmed",
  );
  const publicDossiers = payload?.publicDossiers ?? [];
  const existingDossierSelection =
    selectedExistingDossierId || candidate?.existingDossierMatch?.id || "";
  const isExistingDossierUpdate =
    candidate?.status === "existing_dossier_update";
  const workspaceType = isExistingDossierUpdate
    ? "Dossier Update"
    : isCandidateIntake
      ? "Dossier Seed"
      : "BNL Source File";
  const closedIdentityLinks = identityLinks.filter(
    (identityLink) =>
      identityLink.status === "rejected" || identityLink.status === "retired",
  );
  const recommendationById = new Map(
    (payload?.recommendations ?? []).map((recommendation) => [
      recommendation.id,
      recommendation,
    ]),
  );
  const sourceFileChangedSinceDraft = Boolean(
    primaryDraft && (sourceMetrics?.unappliedSourceNotesCount ?? 0) > 0,
  );
  const nextRecommendedAction = sourceFileChangedSinceDraft
    ? "Update Draft From Source File"
    : primaryDraft
      ? "Open Proposed Dossier Draft"
      : candidate?.status === "needs_more_evidence"
        ? "Add missing info"
        : "Create Proposed Dossier Draft";

  async function postWorkflow(body: Record<string, unknown>) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response
        .json()
        .catch(() => ({}))) as Partial<WorkflowPayload> & {
        candidate?: DossierCandidate;
        draft?: DossierDraft;
        refresh?: {
          created?: boolean;
          request?: DossierSourceFileRefreshRequest;
        };
        error?: string;
        immediateRefresh?: ImmediateRefreshResult;
        message?: string;
      };
      if (!response.ok)
        throw new Error(
          data.error ??
            data.message ??
            `Workflow API returned ${response.status}.`,
        );
      if (data.candidates && data.drafts && data.workflow)
        setPayload(data as WorkflowPayload);
      return data;
    } finally {
      setSaving(false);
    }
  }

  async function requestBnlRefresh() {
    if (!candidate) return;
    setSourceFileOpenState((current) => ({ ...current, running: true }));
    try {
      const data = await postWorkflow({
        action: "requestSourceFileRefresh",
        candidateId,
        reason: caseReportMissingForLatestArchive
          ? "case_report_missing"
          : "Manual admin requested a BNL Source File immediate update retry.",
      });
      const refresh = data.refresh;
      if (refresh?.request && isOpenRefreshRequest(refresh.request)) {
        setRefreshPollingTarget({ candidateId, requestId: refresh.request.id });
      }
      setSourceFileOpenState({
        openedAt: new Date().toISOString(),
        immediateRefresh: data.immediateRefresh,
        running: false,
      });
      setNotice(
        data.immediateRefresh?.ok
          ? "BNL Source File updated immediately."
          : (data.immediateRefresh?.failureReason ??
              "BNL Source File immediate update did not complete. Retry from FILE NOT UPDATED."),
      );
    } catch (err) {
      setSourceFileOpenState((current) => ({
        ...current,
        running: false,
        immediateRefresh: {
          ok: false,
          status: "failed",
          failureReason:
            err instanceof Error
              ? err.message
              : "Failed to request BNL Source File refresh.",
        },
      }));
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to request BNL Source File refresh.",
      );
    }
  }

  async function createDraft() {
    if (!canCreateDraft) return;
    try {
      const data = await postWorkflow({
        action: "createDraftFromCandidate",
        candidateId,
      });
      setNotice(
        `Draft from Source File created: ${data.draft?.fields.name ?? "draft"}. Open Proposed Dossier Draft in the dedicated editor.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to create draft.");
    }
  }

  async function updateDraftFromSourceFile() {
    if (!primaryDraft || !sourceFileChangedSinceDraft) return;
    try {
      const data = await postWorkflow({
        action: "updateDraftFromSourceFile",
        draftId: primaryDraft.id,
      });
      setNotice(
        `Draft from Source File updated: ${data.draft?.fields.name ?? "draft"}. Public-safe draft remains unpublished for admin and Owner Review.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to update draft from Source File.",
      );
    }
  }

  async function update(action: "markNeedsMoreEvidence") {
    if (!canUpdateCandidate) return;
    try {
      const data = await postWorkflow({ action, candidateId });
      setNotice(
        `${data.candidate?.name ?? "Workflow record"} updated. Workflow records remain internal only.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to update internal record.",
      );
    }
  }

  async function candidateLifecycleAction(
    action:
      | "promoteCandidateToSourceFile"
      | "archiveCandidate"
      | "restoreCandidate"
      | "permanentlyDeleteCandidate"
      | "attachCandidateToExistingDossier"
      | "markCandidateAsExistingDossierUpdate",
  ) {
    if (!candidate) return;
    try {
      const body: Record<string, unknown> = { action, candidateId };
      if (
        action === "attachCandidateToExistingDossier" ||
        action === "markCandidateAsExistingDossierUpdate"
      ) {
        if (existingDossierSelection) {
          body.dossierId = existingDossierSelection;
          body.confidence = selectedExistingDossierId
            ? "high"
            : candidate.existingDossierMatch?.confidence;
        }
      }
      if (action === "permanentlyDeleteCandidate") {
        const confirmation = window.prompt(
          `Permanent delete removes this unpublished workflow item${
            linkedDrafts.length > 0
              ? ` and ${linkedDrafts.length} linked unpublished proposed dossier draft${linkedDrafts.length === 1 ? "" : "s"}`
              : ""
          }. Public dossiers and published data are not deleted. Type "DELETE SOURCE FILE" to confirm.`,
        );
        if (confirmation !== "DELETE SOURCE FILE") return;
        body.confirmation = confirmation;
      }
      await postWorkflow(body);
      setNotice(
        action === "archiveCandidate"
          ? "Source file archived. It is removed from active dashboard lanes without deleting public dossiers or published data."
          : action === "restoreCandidate"
            ? "Workflow record restored to intake review so it can be reviewed and promoted again if needed."
            : action === "permanentlyDeleteCandidate"
              ? "Source file permanently deleted from unpublished internal records. Public dossiers were not changed."
              : action === "attachCandidateToExistingDossier"
                ? "Existing public dossier target attached. Public dossier content was not changed."
                : action === "markCandidateAsExistingDossierUpdate"
                  ? "Workflow record moved to Dossier Updates. Public dossier content was not changed."
                  : "Dossier Seed promoted to a BNL Source File. Public dossiers were not changed.",
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to update source file lifecycle.",
      );
    }
  }

  async function saveSourceFileSummary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const formData = new FormData(event.currentTarget);
      await postWorkflow({
        action: "updateSourceFileSummary",
        candidateId,
        input: {
          summaryText: String(formData.get("summaryText") ?? ""),
          knownContext: String(formData.get("knownContext") ?? ""),
          openQuestions: String(formData.get("openQuestions") ?? ""),
          nextAction: String(formData.get("nextAction") ?? ""),
          updatedBy: "admin",
        },
      });
      setNotice(
        "Internal Source File summary saved. It stays private and does not publish or overwrite raw notes.",
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to save Source File summary.",
      );
    }
  }

  async function addSourceFileNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await postWorkflow({
        action: "addSourceFileNote",
        candidateId,
        input: {
          type: noteForm.type,
          text: noteForm.text,
          source: "admin_manual",
          publicSafe: noteForm.publicSafe,
          appliesToDraftId: primaryDraft?.id,
        },
      });
      setNoteForm(emptyNoteForm);
      setNotice(
        hasOwnerReviewDraft
          ? "Admin Addendum saved for owner-review context. It does not overwrite the submitted draft."
          : "BNL Source File note saved. It does not directly edit the proposed dossier.",
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to save source file note.",
      );
    }
  }

  async function addIdentityLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await postWorkflow({
        action: "addDossierIdentityLink",
        candidateId,
        input: {
          label: identityLinkForm.label,
          type: identityLinkForm.type,
          visibility: identityLinkForm.visibility,
          source: identityLinkForm.source,
          note: identityLinkForm.note,
          useForMatching: identityLinkForm.useForMatching,
        },
      });
      setIdentityLinkForm(emptyIdentityLinkForm);
      setNotice(
        "Identity link proposed. It will not route recommendations until confirmed.",
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to save identity link.",
      );
    }
  }

  async function reviewIdentityLink(
    identityLink: DossierIdentityLink,
    action:
      | "confirmDossierIdentityLink"
      | "rejectDossierIdentityLink"
      | "retireDossierIdentityLink",
    options: { useForMatching?: boolean; useInPublicDossier?: boolean } = {},
  ) {
    try {
      await postWorkflow({
        action,
        candidateId,
        identityLinkId: identityLink.id,
        useForMatching: options.useForMatching === true,
        useInPublicDossier: options.useInPublicDossier === true,
      });
      setNotice(
        action === "confirmDossierIdentityLink"
          ? options.useForMatching
            ? identityReviewNotice.confirmForMatching
            : identityReviewNotice.confirmReferenceOnly
          : identityReviewNotice[action],
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update identity link.",
      );
    }
  }

  if (loading)
    return (
      <MinimalState
        title="Loading BNL Source File"
        message="Checking the Source File."
      />
    );
  if (error || !payload)
    return (
      <MinimalState
        title="Admin authentication required"
        message={
          error ?? "Sign in through /admin before opening this source file."
        }
      />
    );
  if (!candidate)
    return (
      <MinimalState
        title="BNL Source File not found"
        message="This candidate is not present in the workflow store."
      />
    );

  const evidenceReceiptLanes = uniqueLabels([
    ...(candidate.sourceLanes ?? []),
    ...attachedRecommendations.flatMap((recommendation) => [
      ...(recommendation.sourceLanes ?? []),
      ...(recommendation.sourceTypes ?? []),
    ]),
  ]);
  const publicSafeFactItems = sanitizeMeaningFirstItems(
    [
      ...(candidate.knownFacts ?? []),
      ...(candidate.sourceFileNotes ?? [])
        .filter((note) => note.status === "active" && note.publicSafe === true)
        .map((note) => note.text),
    ],
    { subjectName: candidate.name, fallback: "No public-safe facts separated yet." },
  );
  const reviewOnlyNotes = sanitizeMeaningFirstItems(
    [
      ...(candidate.doNotSay ?? []),
      ...(candidate.publicSafetyNotes ?? []),
      ...(candidate.sourceFileNotes ?? [])
        .filter(
          (note) =>
            note.status === "active" &&
            (note.publicSafe === false ||
              note.type === "do_not_say" ||
              note.type === "public_safety"),
        )
        .map((note) => note.text),
    ],
    { subjectName: candidate.name, fallback: "No review-only evidence notes recorded." },
  );

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            {workspaceType}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {candidate.name}
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            {workspaceType} ID: {candidate.id}. Internal working material only; not
            public copy. Owner review is required before any public use.
          </p>
          {isExistingDossierUpdate && (
            <p className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              This internal record is a Dossier Update target, not a new dossier proposal.
            </p>
          )}
          <details className="mt-4 border border-border/60 bg-background/20 p-3 text-xs text-muted">
            <summary className="cursor-pointer font-semibold uppercase tracking-widest text-foreground">
              Phase Rail
            </summary>
            <div className="mt-3">
              <PhaseRail />
            </div>
          </details>
          <details className="mt-5 border border-border bg-background/20 p-3 text-xs text-muted">
            <summary className="cursor-pointer font-semibold uppercase tracking-widest text-foreground">
              File Status · {sourceMetrics?.sourceDepth ?? "Low"} strength · {sourceMetrics?.sourceNotesCount ?? 0} notes · {nextRecommendedAction}
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 text-xs text-muted">
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                Source strength
              </p>
              <p>{sourceMetrics?.sourceDepth ?? "Low"}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                Current state
              </p>
              <p>{primaryDraft?.status ?? "No proposed dossier"}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                BNL Signals
              </p>
              <p>{sourceMetrics?.attachedRecommendationCount ?? 0}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                Refresh status
              </p>
              <p>{refreshStatusLabel}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                Source notes
              </p>
              <p>{sourceMetrics?.sourceNotesCount ?? 0}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Aliases</p>
              <p>{identityLinks.length}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                Unapplied notes
              </p>
              <p>{sourceMetrics?.unappliedSourceNotesCount ?? 0}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">
                Recommended next step
              </p>
              <p>{nextRecommendedAction}</p>
            </div>
            </div>
          </details>
          {(sourceMetrics?.unappliedSourceNotesCount ?? 0) > 0 &&
            primaryDraft && (
              <div className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
                <p>
                  This BNL Source File has new info not yet applied to the Proposed Dossier.
                </p>
                <p className="mt-2 text-xs uppercase tracking-widest">
                  Use the primary Proposed Dossier action above to apply the new
                  source information.
                </p>
              </div>
            )}
          <div className="mt-4 border border-border bg-background/30 p-3 text-sm text-muted">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-accent">
                  Source File status / refresh state
                </p>
                <p className="text-foreground">{refreshStatusLabel}</p>
                <p className="mt-1">{refreshStatusDetail}</p>
                {refreshFailureReason && (
                  <p className="mt-1 text-red-300">Reason: {refreshFailureReason}</p>
                )}
                {staleDataWarning && (
                  <p className="mt-2 border border-red-500/60 bg-red-500/10 p-2 text-xs uppercase tracking-widest text-red-300">
                    Last-known BNL data is not current for this page open.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void requestBnlRefresh()}
                disabled={manualRefreshDisabled}
                className={manualRefreshButtonClass}
              >
                {manualRefreshButtonLabel}
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 text-xs uppercase tracking-widest lg:grid-cols-3">
            <div className="border border-border bg-background/20 p-3">
              <p className="mb-3 text-accent">Main actions</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/admin/dossiers"
                  className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
                >
                  Back to Dossier Control Center
                </Link>
                <a
                  href="#add-info"
                  className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
                >
                  Add to Source File
                </a>
                {canCreateDraft && (
                  <button
                    type="button"
                    onClick={() => void createDraft()}
                    disabled={saving}
                    className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                  >
                    Create Proposed Dossier Draft
                  </button>
                )}
                {primaryDraft && sourceFileChangedSinceDraft && (
                  <button
                    type="button"
                    onClick={() => void updateDraftFromSourceFile()}
                    disabled={saving}
                    className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                  >
                    Update Draft From Source File
                  </button>
                )}
                {primaryDraft && isDraftActive(primaryDraft) && (
                  <Link
                    href={`/admin/dossiers/drafts/${primaryDraft.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
                  >
                    Open Proposed Dossier Draft
                  </Link>
                )}
              </div>
            </div>
            <div className="border border-border bg-background/20 p-3">
              <p className="mb-3 text-accent">Review state</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled
                  className="border border-border px-4 py-2 text-muted opacity-50"
                  title="Owner action required for final dismissal; add dismissal context as an info/correction note for now."
                >
                  Recommend Dismissal (owner later)
                </button>
                <button
                  type="button"
                  disabled={
                    saving ||
                    !canUpdateCandidate ||
                    candidate.status === "needs_more_evidence"
                  }
                  onClick={() => void update("markNeedsMoreEvidence")}
                  className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Mark Needs Info
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void candidateLifecycleAction(
                      "markCandidateAsExistingDossierUpdate",
                    )
                  }
                  disabled={
                    saving || !canUpdateCandidate || !existingDossierSelection
                  }
                  className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                  title="Reclassify this record as update/enrichment material for the attached public dossier. Does not publish or edit public content."
                >
                  Move to Dossier Update
                </button>
                {isExistingDossierUpdate && (
                  <button
                    type="button"
                    onClick={() =>
                      void candidateLifecycleAction("promoteCandidateToSourceFile")
                    }
                    disabled={saving}
                    className="border border-border px-4 py-2 text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Move Back to BNL Source File
                  </button>
                )}
                {canPromoteCandidate && (
                  <button
                    type="button"
                    onClick={() =>
                      void candidateLifecycleAction("promoteCandidateToSourceFile")
                    }
                    disabled={saving}
                    className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                  >
                    Promote to BNL Source File
                  </button>
                )}
              </div>
            </div>
            <details className="border border-border bg-background/20 p-3">
              <summary className="cursor-pointer text-accent">Archive / danger</summary>
              <div className="mt-3 flex flex-wrap gap-3">
                {canArchiveCandidate && (
                  <button
                    type="button"
                    onClick={() =>
                      void candidateLifecycleAction("archiveCandidate")
                    }
                    disabled={saving}
                    className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                    title="Safe cleanup: removes this BNL Source File from active dashboard lanes without deleting public dossiers or published data."
                  >
                    Archive
                  </button>
                )}
                {canRestoreCandidate && (
                  <button
                    type="button"
                    onClick={() =>
                      void candidateLifecycleAction("restoreCandidate")
                    }
                    disabled={saving}
                    className="border border-border px-4 py-2 text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Restore
                  </button>
                )}
                {canPermanentlyDeleteCandidate && (
                  <button
                    type="button"
                    onClick={() =>
                      void candidateLifecycleAction("permanentlyDeleteCandidate")
                    }
                    disabled={saving}
                    className="border border-red-500/70 px-4 py-2 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    title='Requires typing "DELETE SOURCE FILE". Does not delete public dossiers or published data.'
                  >
                    Delete Permanently
                  </button>
                )}
              </div>
            </details>
          </div>
          {notice && (
            <div className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              {notice}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
        <section className="border border-border bg-surface p-4 space-y-3">
          <h2 className="text-lg font-bold text-foreground">
            Review Boundaries
          </h2>
          <p className="text-sm text-muted">
            Internal working material only: not public copy, owner review required,
            and no public use until review clears the claim.
          </p>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
            {sourceWarningLabels({
              candidate,
              recommendations: attachedRecommendations,
            }).map((label) => (
              <StatusBadge key={label}>{label}</StatusBadge>
            ))}
          </div>
        </section>

        <Section title="BNL take / why this file matters">
          <p>
            {sourceFileSummary?.currentRead ??
              sourceFileReasonMeaning(candidate.reason, candidate.name)}
          </p>
          <p className="mt-2">
            {sourceFileSummary?.whyTracked ??
              sourceFileWhyNowMeaning(candidate.whyNow)}
          </p>
        </Section>

        <Section title="Known facts">
          {meaningFirstList(publicSafeFactItems, "No public-safe facts separated yet.", candidate.name)}
        </Section>

        <Section title="Evidence receipts / source lanes">
          <div className="space-y-3">
            <p>
              Review-only evidence stays internal. Primary copy shows source lanes
              and receipt counts instead of raw/private evidence refs.
            </p>
            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
              {(evidenceReceiptLanes.length ? evidenceReceiptLanes : ["Review-only evidence"]).map((lane) => (
                <StatusBadge key={lane}>{lane}</StatusBadge>
              ))}
            </div>
            <p>{attachedRecommendations.length} BNL Signal receipt{attachedRecommendations.length === 1 ? "" : "s"} attached.</p>
          </div>
        </Section>

        <Section title="Source notes">
          <p>
            {sourceNotesSummary.noteCount} saved Source File note{sourceNotesSummary.noteCount === 1 ? "" : "s"}; {sourceNotesSummary.warningCount} review-only warning{sourceNotesSummary.warningCount === 1 ? "" : "s"}.
          </p>
          <p className="mt-2">
            Source notes remain internal until an admin rewrites them into a
            Public-safe draft.
          </p>
        </Section>

        <Section title="Missing info / open questions">
          {meaningFirstList(
            [
              ...(candidate.sourceFileSummary?.openQuestions ?? []),
              ...(candidate.missingInfo ?? []),
              ...attachedRecommendations.flatMap((recommendation) => recommendation.missingInfo ?? []),
            ],
            "No open questions recorded.",
            candidate.name,
          )}
        </Section>

        <Section title="Public-safety notes">
          {meaningFirstList(
            [
              ...(candidate.publicSafetyNotes ?? []),
              ...attachedRecommendations.flatMap((recommendation) => recommendation.publicSafetyNotes ?? []),
            ],
            "No public-safety notes recorded.",
            candidate.name,
          )}
        </Section>

        <Section title="Do-not-say / review-only notes">
          {meaningFirstList(reviewOnlyNotes, "No review-only evidence notes recorded.", candidate.name)}
        </Section>


        <Section title="Identity links / aliases">
            <div className="space-y-5">
              <p className="border border-border/70 bg-background/20 p-3">
                Identity links are internal routing/context tools. Resolve these before
                using this Source File for dossier drafting. Confirming a link can
                help future BNL Signals route to this Source File, but it does not
                merge Source Files, publish identity, or place the label in a
                public dossier.
              </p>

              <div className="space-y-4">
                {[
                  {
                    title: "Proposed Identity Links",
                    links: proposedIdentityLinks,
                    quiet: false,
                  },
                  {
                    title: "Confirmed Identity Links",
                    links: confirmedIdentityLinks,
                    quiet: false,
                  },
                  {
                    title: "Rejected / Retired Identity History",
                    links: closedIdentityLinks,
                    quiet: true,
                  },
                ]
                  .filter((group) => group.links.length > 0)
                  .map((group) => (
                    <section
                      key={group.title}
                      className={`border border-border/60 bg-background/10 p-3 space-y-3 ${
                        group.quiet ? "opacity-80" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
                          {group.title}
                        </h3>
                        <span className="text-xs text-muted">
                          {group.links.length} link
                          {group.links.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {group.links.map((identityLink) => (
                          <IdentityLinkCard
                            key={identityLink.id}
                            identityLink={identityLink}
                            saving={saving}
                            recommendation={
                              identityLink.createdFromRecommendationId
                                ? recommendationById.get(
                                    identityLink.createdFromRecommendationId,
                                  )
                                : undefined
                            }
                            onReview={(identityLink, action, options) =>
                              void reviewIdentityLink(
                                identityLink,
                                action,
                                options,
                              )
                            }
                          />
                        ))}
                      </div>
                    </section>
                  ))}
              </div>
            </div>
          {identityLinks.length === 0 && (
            <p className="mt-3 border border-border/70 bg-background/20 p-3 text-sm text-muted">
              No identity links pending. Manual identity-link tools are available in the lower admin tools area.
            </p>
          )}
        </Section>
        {sourceFileSummary && (
          <>
            <DossierSourceFileSummaryPanel
              summary={sourceFileSummary}
              entityReadout={entityActivityReadout}
              subjectName={candidate.name}
              recommendations={attachedRecommendations}
              sourceFileNotes={candidate.sourceFileNotes ?? []}
              currentLane={candidate.status}
              latestRecommendationTimestamp={latestRecommendationTimestamp}
              latestSourceFileArchive={candidate.latestSourceFileArchive}
              sourceFileTargetStatus={
                isExistingDossierUpdate
                  ? "existing dossier update"
                  : "active source file"
              }
            />
            {/* BNL Case File Report display lives inside DossierSourceFileSummaryPanel. */}
          </>
        )}
        <Section title="Proposed Dossier status">
          {!primaryDraft ? (
            <div className="space-y-2">
              <p>No Proposed Dossier exists yet.</p>
              <p>
                Create one only from reviewed, public-safe Source File material.
                The primary Create Proposed Dossier action lives in the page
                header so drafting does not become a parallel workflow.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p>Status: {primaryDraft.status}</p>
              <p>Updated: {formatDate(primaryDraft.updatedAt)}</p>
              <p>
                Unapplied source notes:{" "}
                {sourceMetrics?.unappliedSourceNotesCount ?? 0}
              </p>
              <p>
                Owner review blocked until admins separate public-safe language
                from internal BNL Source File context in the dedicated Proposed
                Dossier editor.
              </p>
            </div>
          )}
        </Section>

        <Section title="Next recommended action">
          <p className="text-foreground">{nextRecommendedAction}</p>
          <p className="mt-2">
            Draft from Source File actions create or update a Public-safe draft
            only. They do not publish, confirm aliases, merge identities, or
            mutate public dossier pages. Owner Review remains the final approval lane.
          </p>
        </Section>

        <details
          open={Boolean(candidate.existingDossierMatch)}
          className="border border-border bg-surface p-5 space-y-4"
        >
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Dossier Update Actions
          </summary>
          <div className="mt-4 space-y-4">
          {candidate.existingDossierMatch ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted">
              <p>
                Matched public dossier name:{" "}
                {candidate.existingDossierMatch.name}
              </p>
              <p>
                Match confidence: {candidate.existingDossierMatch.confidence}
              </p>
              <p>Public dossier id/slug: {candidate.existingDossierMatch.id}</p>
              <p>Current workflow state: {candidate.status}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              No existing public dossier match currently attached.
            </p>
          )}
          <label className="block space-y-2 text-xs uppercase tracking-widest text-muted">
            Attach to Existing Public Dossier
            <select
              value={existingDossierSelection}
              onChange={(event) =>
                setSelectedExistingDossierId(event.target.value)
              }
              className="w-full max-w-xl bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
            >
              <option value="">Choose public dossier…</option>
              {publicDossiers.map((dossier) => (
                <option key={dossier.id} value={dossier.id}>
                  {dossier.name} ({dossier.id})
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <button
              type="button"
              onClick={() =>
                void candidateLifecycleAction(
                  "attachCandidateToExistingDossier",
                )
              }
              disabled={saving || !existingDossierSelection}
              className="border border-border px-4 py-2 text-foreground hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Attach to Existing Public Dossier
            </button>
            <button
              type="button"
              onClick={() =>
                void candidateLifecycleAction(
                  "markCandidateAsExistingDossierUpdate",
                )
              }
              disabled={
                saving || !canUpdateCandidate || !existingDossierSelection
              }
              className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              {isExistingDossierUpdate
                ? "Keep as Dossier Update"
                : "Move to Dossier Update"}
            </button>
          </div>
          </div>
        </details>

        <section
          id="add-info"
          className="border border-border bg-surface p-5 space-y-3"
        >
          <h2 className="text-2xl font-bold text-foreground">
            Add to BNL Source File
          </h2>
          <p className="text-sm text-muted">
            This adds information to this subject&apos;s BNL Source File. It
            does not directly edit the proposed dossier.
          </p>
          <p className="text-sm text-muted">
            Add to BNL Source File = add a source note, correction, evidence,
            warning, public-safe fact, or missing-info item to this subject.
            This source file remains one subject/entity. If this information
            belongs to a different subject, create or wait for a separate BNL
            recommendation.
          </p>
          {hasOwnerReviewDraft && (
            <p className="border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              This becomes an Admin Addendum for owner review. It does not
              overwrite the submitted draft.
            </p>
          )}
          <form
            onSubmit={addSourceFileNote}
            className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs uppercase tracking-widest text-muted"
          >
            <label className="space-y-2">
              <span>Info type</span>
              <select
                value={noteForm.type}
                onChange={(event) =>
                  setNoteForm({
                    ...noteForm,
                    type: event.target.value as DossierSourceFileNoteType,
                  })
                }
                className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
              >
                {noteTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2 space-y-2">
              <span>Source file note</span>
              <textarea
                required
                maxLength={2000}
                value={noteForm.text}
                onChange={(event) =>
                  setNoteForm({ ...noteForm, text: event.target.value })
                }
                placeholder="Add one concise fact, correction, link note, missing-info note, do-not-say guidance, public-safety context, or general note."
                className="w-full min-h-24 bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
              />
            </label>
            <label className="flex items-center gap-2 normal-case tracking-normal text-sm">
              <input
                type="checkbox"
                checked={noteForm.publicSafe}
                onChange={(event) =>
                  setNoteForm({ ...noteForm, publicSafe: event.target.checked })
                }
              />{" "}
              Public-safe source material
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className={manualRefreshButtonClass}
              >
                Save Info
              </button>
            </div>
          </form>
        </section>

        <Section title="Source Notes / Admin Addendums">
          <details>
            <summary className="cursor-pointer font-semibold text-foreground">
              {sourceNotesSummary.noteCount} note{sourceNotesSummary.noteCount === 1 ? "" : "s"} · {sourceNotesSummary.warningCount} warning{sourceNotesSummary.warningCount === 1 ? "" : "s"} · {sourceNotesSummary.dossierQuestionCount} dossier question{sourceNotesSummary.dossierQuestionCount === 1 ? "" : "s"} · latest updated {sourceNotesSummary.latestUpdatedAt ? formatDate(sourceNotesSummary.latestUpdatedAt) : "—"}
            </summary>
            <div className="mt-3 space-y-3">
              {sourceNotes.length === 0 ? (
                <p>No saved source notes yet.</p>
              ) : (
                sourceNotes.map((note) => (
                  <details key={note.id} className="border border-border/60 bg-background/20 p-3">
                    <summary className="cursor-pointer font-semibold text-foreground">
                      {note.type} · {formatDate(note.updatedAt)}
                    </summary>
                    <div className="mt-3">
                      <HumanReadableNoteView
                        view={createHumanReadableSourceFileNoteView({
                          ...note,
                          subjectName: candidate.name,
                        })}
                        createdAt={note.createdAt}
                        workflowLane={candidate.status}
                        appliedDraftId={note.appliesToDraftId}
                      />
                    </div>
                  </details>
                ))
              )}
            </div>
          </details>
        </Section>



        <details
          open={hasSavedOperatorSourceSummary}
          className="border border-border bg-surface p-5 text-sm text-muted"
        >
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Operator Source File Summary
          </summary>
          <p className="mt-3 text-sm text-muted max-w-4xl">
            Optional internal override for the top Source File summary. Use only
            when BNL&apos;s current read needs owner/admin correction. This is
            not a draft, not public copy, and not the normal add-info workflow.
          </p>
          <form
            onSubmit={saveSourceFileSummary}
            className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm"
          >
            <label className="md:col-span-2 space-y-2 text-xs uppercase tracking-widest text-muted">
              Summary text
              <textarea
                name="summaryText"
                defaultValue={candidate.sourceFileSummary?.summaryText ?? ""}
                rows={3}
                className="w-full bg-background border border-border px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                placeholder="Plain-English internal correction to BNL's current read…"
              />
            </label>
            <label className="space-y-2 text-xs uppercase tracking-widest text-muted">
              Known context
              <textarea
                name="knownContext"
                defaultValue={(
                  candidate.sourceFileSummary?.knownContext ?? []
                ).join("\n")}
                rows={4}
                className="w-full bg-background border border-border px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                placeholder="One owner/admin-corrected context line per row"
              />
            </label>
            <label className="space-y-2 text-xs uppercase tracking-widest text-muted">
              Open questions
              <textarea
                name="openQuestions"
                defaultValue={(
                  candidate.sourceFileSummary?.openQuestions ?? []
                ).join("\n")}
                rows={4}
                className="w-full bg-background border border-border px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                placeholder="One review question per row"
              />
            </label>
            <label className="md:col-span-2 space-y-2 text-xs uppercase tracking-widest text-muted">
              Recommended next step
              <input
                name="nextAction"
                defaultValue={candidate.sourceFileSummary?.nextAction ?? ""}
                className="w-full bg-background border border-border px-3 py-2 text-sm normal-case tracking-normal text-foreground"
                placeholder="What should an operator do next?"
              />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
              <button
                type="submit"
                disabled={saving}
                className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              >
                Save Operator Source File Summary
              </button>
              <span className="text-muted self-center">
                Optional override only; use Add to BNL Source File for normal
                source updates.
              </span>
            </div>
          </form>
        </details>

        <details className="border border-border bg-surface p-5 space-y-4">
          <summary className="cursor-pointer text-2xl font-bold text-foreground">
            Advanced Tools
          </summary>
          <div className="space-y-5 pt-4">
            <p className="text-sm text-muted">Advanced controls stay collapsed by default and do not generate reports. Manual identity links live here so they do not interrupt normal review.</p>
            <div className="space-y-2 text-sm text-muted">
              <p>
                Aliases help BNL route future BNL Signals to the right source file.
                Identity Links create proposed review material only, not confirmed
                identity. Internal aliases are not public dossier text and remain
                admin-only. Public-safe visibility does not publish anything yet.
              </p>
              <p className="border border-border/70 bg-background/20 p-3">
                Adding an alias does not make it public and does not affect matching
                until confirmed. If an alias is created as proposed, matching is not
                active yet.
              </p>
            </div>
            <form
              onSubmit={addIdentityLink}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs uppercase tracking-widest text-muted"
            >
              <label className="space-y-2">
                <span>Label</span>
                <input
                  required
                  maxLength={120}
                  value={identityLinkForm.label}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      label: event.target.value,
                    })
                  }
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                />
              </label>
              <label className="space-y-2">
                <span>Type</span>
                <select
                  value={identityLinkForm.type}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      type: event.target.value as DossierIdentityLinkType,
                    })
                  }
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                >
                  {identityLinkTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Visibility</span>
                <select
                  value={identityLinkForm.visibility}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      visibility: event.target
                        .value as DossierIdentityLinkVisibility,
                    })
                  }
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                >
                  <option value="internal_only">internal_only</option>
                  <option value="public_safe">public_safe</option>
                </select>
              </label>
              <label className="space-y-2">
                <span>Source</span>
                <select
                  value={identityLinkForm.source}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      source: event.target.value as DossierIdentityLinkSource,
                    })
                  }
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                >
                  {identityLinkSources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-4 space-y-2">
                <span>Note</span>
                <textarea
                  maxLength={1000}
                  value={identityLinkForm.note}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      note: event.target.value,
                    })
                  }
                  className="w-full min-h-20 bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                />
              </label>
              <label className="md:col-span-2 flex items-center gap-2 normal-case tracking-normal text-sm">
                <input
                  type="checkbox"
                  checked={identityLinkForm.useForMatching}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      useForMatching: event.target.checked,
                    })
                  }
                />{" "}
                Use for future matching after confirmation
              </label>
              <label className="md:col-span-2 flex items-center gap-2 normal-case tracking-normal text-sm">
                <input
                  type="checkbox"
                  checked={identityLinkForm.visibility === "public_safe"}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      visibility: event.target.checked
                        ? "public_safe"
                        : "internal_only",
                    })
                  }
                />{" "}
                Public-safe label (does not publish yet)
              </label>
              <div className="md:col-span-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:pointer-events-none disabled:opacity-50"
                >
                  Add Identity Link
                </button>
              </div>
            </form>
          </div>
        </details>


        <details className="border border-border bg-surface p-5 text-sm text-muted">
          <summary className="cursor-pointer text-2xl font-bold text-foreground">
            Diagnostics — collapsed by default
          </summary>
          <p className="mt-3 mb-4">
            Diagnostics only. Not BNL Source File claims. Raw, technical, and legacy
            supporting fields stay here so the primary review flow remains
            concise.
          </p>
          {/* Raw Source File Data stays inside collapsed diagnostics. */}
          <DossierSourceFileArchiveRawData latestSourceFileArchive={candidate.latestSourceFileArchive} />
          <section className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Section title="Reason">
              <p>{sourceFileReasonMeaning(candidate.reason, candidate.name)}</p>
            </Section>
            <Section title="Why now">
              <p>{sourceFileWhyNowMeaning(candidate.whyNow)}</p>
            </Section>
            <Section title="Evidence summary">
              <p>
                {
                  sanitizeMeaningFirstItems([candidate.evidenceSummary], {
                    subjectName: candidate.name,
                    fallback: "—",
                    includePublicDiscord: true,
                  })[0]
                }
              </p>
            </Section>
            <Section title="Evidence items">
              {candidate.evidenceItems?.length ? (
                candidate.evidenceItems.map((item) => (
                  <article key={item.id} className="mb-2">
                    <p className="text-foreground">
                      {
                        sanitizeMeaningFirstItems([item.label], {
                          subjectName: candidate.name,
                          fallback: "Internal evidence item.",
                        })[0]
                      }
                    </p>
                    <p>
                      {
                        sanitizeMeaningFirstItems([item.summary], {
                          subjectName: candidate.name,
                          fallback: "Owner review required before public use.",
                          includePublicDiscord: true,
                        })[0]
                      }
                    </p>
                    <p>
                      Visibility:{" "}
                      {item.publicSafe
                        ? "public-safe after review"
                        : "internal review only"}
                    </p>
                  </article>
                ))
              ) : (
                <p>—</p>
              )}
            </Section>
            <Section title="Review Context / Possible Supporting Evidence">
              {meaningFirstList(candidate.knownFacts, "—", candidate.name)}
            </Section>
            <Section title="Corrections / extra notes">
              <p>Saved notes now live in BNL Source File Notes above.</p>
            </Section>
            <Section title="Missing Info">
              {meaningFirstList(candidate.missingInfo, "—", candidate.name)}
            </Section>
            <Section title="Do Not Say">
              {meaningFirstList(candidate.doNotSay, "—", candidate.name)}
            </Section>
            <Section title="Public-Safe Facts Pending Owner/Admin Approval">
              {list(
                sanitizeMeaningFirstItems(
                  candidate.knownFacts?.filter(Boolean) ?? [],
                  { subjectName: candidate.name },
                ),
                "No public-safe facts marked yet.",
              )}
            </Section>
            <Section title="Internal-Only Notes">
              {sourceNotes.filter((note) => note.publicSafe !== true).length ? (
                <ul className="list-disc pl-5 space-y-1">
                  {sourceNotes
                    .filter((note) => note.publicSafe !== true)
                    .map((note) => (
                      <li key={note.id}>
                        {
                          createHumanReadableSourceFileNoteView({
                            ...note,
                            subjectName: candidate.name,
                          }).summary
                        }
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-muted">No internal-only notes saved yet.</p>
              )}
            </Section>
            <Section title="Source Warnings">
              <div className="flex flex-wrap gap-2">
                {sourceWarningLabels({
                  candidate,
                  recommendations: attachedRecommendations,
                }).map((label) => (
                  <StatusBadge key={label}>{label}</StatusBadge>
                ))}
              </div>
            </Section>
            <Section title="Conflicts / Needs Review">
              <p>Duplicate risk: {candidate.duplicateRisk ?? "none"}</p>
              <p>Pending Identity Links: {proposedIdentityLinks.length}</p>
            </Section>
            <Section title="Public safety notes">
              {meaningFirstList(
                candidate.publicSafetyNotes,
                "—",
                candidate.name,
              )}
            </Section>
            <Section title="Recommended taxonomy">
              <p>
                {candidate.recommendedCategory ?? "—"} /{" "}
                {candidate.recommendedKind ?? "—"} /{" "}
                {candidate.recommendedEcosystemLane ?? "—"} /{" "}
                {candidate.recommendedIdentityAuthority ?? "—"}
              </p>
              <p>
                Status/clearance/origin: {candidate.recommendedStatus ?? "—"} /{" "}
                {candidate.recommendedClearance ?? "—"} /{" "}
                {candidate.recommendedOrigin ?? "—"}
              </p>
            </Section>
            <Section title="Recommended tags">
              <p>{candidate.recommendedTags?.join(", ") || "—"}</p>
            </Section>
            <Section title="Proposed tags">
              <p>{candidate.proposedTags?.join(", ") || "—"}</p>
            </Section>
            <Section title="Primary link">
              <p>
                {candidate.primaryLink
                  ? `${candidate.primaryLink.label}: ${candidate.primaryLink.url} (${candidate.primaryLink.type})`
                  : "—"}
              </p>
            </Section>
            <Section title="Duplicate warnings">
              <p>{candidate.duplicateRisk ?? "none"}</p>
              <p>
                Existing published dossier match:{" "}
                {candidate.existingDossierMatch?.name ?? "—"}
              </p>
            </Section>
          </section>
        </details>
      </section>
    </main>
  );
}
