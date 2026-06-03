"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  matchDossierRecommendationSubject,
  normalizeDossierSubjectName,
  type DossierCandidate,
  type DossierDraft,
  type DossierIdentityLinkSource,
  type DossierIdentityLinkType,
  type DossierIdentityLinkVisibility,
  type DossierRecommendation,
} from "@/lib/dossier-workflow";
import { DossierEntityActivityReadoutPanel } from "@/components/DossierEntityActivityReadoutPanel";
import { createHumanReadableRecommendationView } from "@/lib/dossier-note-display";
import { createDossierEntityActivityReadoutFromRecommendation } from "@/lib/dossier-entity-activity-readout";
import { sanitizeMeaningFirstItems } from "@/lib/dossier-source-memory-meaning";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
  workflow: { status: string };
};

type IdentityLinkRecommendationForm = {
  candidateId: string;
  label: string;
  type: DossierIdentityLinkType;
  visibility: DossierIdentityLinkVisibility;
  source: DossierIdentityLinkSource;
  note: string;
  useForMatchingAfterConfirmation: boolean;
  useInPublicDossier: boolean;
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
  "bnl_recommendation",
  "admin_manual",
  "mod_manual",
  "owner_confirmed",
  "rd_context",
  "broadcast_memory",
  "website_dossier",
  "unknown",
];

function identityLinkDefaults(
  recommendation?: DossierRecommendation | null,
  candidateId = "",
): IdentityLinkRecommendationForm {
  return {
    candidateId,
    label: recommendation?.subjectName ?? "",
    type: "alias",
    visibility: "internal_only",
    source: "bnl_recommendation",
    note: recommendation
      ? `Created from recommendation ${recommendation.id}.`
      : "",
    useForMatchingAfterConfirmation: true,
    useInPublicDossier: false,
  };
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
          Back to Dossier Dashboard
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
    <p>{empty}</p>
  );
}

function queueSubmissionItems(recommendation: DossierRecommendation): string[] {
  const items: string[] = [];
  if (recommendation.queueSubmissionStatus === "not_connected") {
    items.push("Queue/submission identity is not connected yet.");
  } else if (recommendation.queueSubmissionStatus) {
    items.push(
      `Queue/submission status: ${recommendation.queueSubmissionStatus.replace(/_/g, " ")}.`,
    );
  }
  if (recommendation.queueSubmissionNote) items.push(recommendation.queueSubmissionNote);
  return sanitizeMeaningFirstItems(items, 3);
}

function sourceAuthorityItems(recommendation: DossierRecommendation): string[] {
  const sanitized = sanitizeMeaningFirstItems(
    recommendation.sourceAuthority ?? [],
    { subjectName: recommendation.subjectName },
  );
  return [
    ...sanitized,
    recommendation.confidence
      ? `Confidence: ${recommendation.confidence}`
      : undefined,
    (recommendation.sourceAuthority ?? []).length > 0 && sanitized.length === 0
      ? "Source authority was supplied by BNL; review raw audit details before public use."
      : undefined,
  ].filter((item): item is string => Boolean(item));
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function recommendationProvenance(recommendation: DossierRecommendation) {
  if (recommendation.ingestSource === "bnl_source_file_enrichment") {
    return "BNL review addendum";
  }
  if (recommendation.ingestSource === "bnl_dynamic_candidate_discovery") {
    return "Known from BNL records";
  }
  if (recommendation.ingestSource === "bnl_source_knowledge_bridge") {
    return "Older BNL review note";
  }
  if (
    recommendation.ingestSource === "bnl" ||
    recommendation.createdBy === "bnl"
  ) {
    return "Known from BNL records";
  }
  return recommendation.createdBy
    ? `Seeded by ${recommendation.createdBy}`
    : "Manually seeded";
}

function Field({
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

function recommendationAddsUsefulInformation(
  view: ReturnType<typeof createHumanReadableRecommendationView>,
) {
  return view.sections.some(
    (section) =>
      section.title !== "Case File Quality" &&
      section.items.some(
        (item) => item !== "No meaningful pattern has been extracted yet.",
      ),
  );
}

function HumanReadableRecommendationCaseFile({
  recommendation,
}: {
  recommendation: DossierRecommendation;
}) {
  const view = createHumanReadableRecommendationView(recommendation);
  const addsUsefulInformation = recommendationAddsUsefulInformation(view);
  return (
    <section className="border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.4em] text-accent">
            Plain-English review view
          </p>
          <h2 className="text-2xl font-bold text-foreground">
            Recommendation Takeaway
          </h2>
          <p className="text-sm text-muted">{view.sourceCopy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge>{recommendation.status}</StatusBadge>
          <StatusBadge>
            Created {formatDate(recommendation.createdAt)}
          </StatusBadge>
          <StatusBadge>{view.warningCount} warnings</StatusBadge>
          <StatusBadge>{view.missingInfoCount} open questions</StatusBadge>
          <StatusBadge>
            {addsUsefulInformation
              ? "Adds review context"
              : "Thin: routing only"}
          </StatusBadge>
        </div>
      </div>
      <div className="border border-border/60 bg-background/30 p-3 text-sm text-foreground space-y-2">
        <p className="font-semibold">{view.summary}</p>
        <p className="text-muted">
          {addsUsefulInformation
            ? "This recommendation may add useful internal context. Review the claims and safety notes before attaching it to a source file or drafting from it."
            : "This recommendation is currently thin. It mainly says where the item belongs and does not add enough useful context to draft from."}
        </p>
        <p className="text-muted">
          Next step: attach it to the right BNL Source File, create a proposed
          identity link, dismiss it, or convert it only after confirming it is a
          separate subject.
        </p>
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
      <details className="border border-border/60 bg-background/20 p-3 text-xs text-muted">
        <summary className="cursor-pointer font-semibold text-foreground">
          Developer / Raw Source Audit
        </summary>
        <div className="mt-3 space-y-3">
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
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border border-border/50 bg-background/30 p-3">
            {view.rawText || "No original text stored."}
          </pre>
        </div>
      </details>
    </section>
  );
}

const terminalRecommendationStatuses = new Set<DossierRecommendation["status"]>(
  [
    "attached_to_source_file",
    "attached_to_candidate_intake",
    "attached_to_existing_dossier_update",
    "converted_to_source_file",
    "identity_link_created",
    "ignored",
    "dismissed",
  ],
);

function terminalRecommendationMessage(recommendation: DossierRecommendation) {
  if (recommendation.status === "converted_to_source_file") {
    return "Converted to BNL Source File.";
  }
  if (recommendation.status === "attached_to_source_file") {
    return "Attached to matched BNL Source File.";
  }
  if (recommendation.status === "attached_to_candidate_intake") {
    return "Attached to intake item as review-only enrichment.";
  }
  if (recommendation.status === "attached_to_existing_dossier_update") {
    return "Attached to Existing Dossier Update as review-only enrichment.";
  }
  if (recommendation.status === "identity_link_created") {
    return "Proposed identity link created. Confirm it from the BNL Source File when ready.";
  }
  if (recommendation.status === "ignored") {
    return "Ignored. This recommendation is closed.";
  }
  if (recommendation.status === "dismissed") {
    return "Dismissed. This recommendation is closed.";
  }
  return "";
}

export default function DossierRecommendationPage() {
  const params = useParams();
  const recommendationId = routeParam(params?.recommendationId);
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identityLinkForm, setIdentityLinkForm] =
    useState<IdentityLinkRecommendationForm>(() => identityLinkDefaults());

  const loadWorkflow = useCallback(
    async function loadWorkflow() {
      const response = await fetch("/api/admin/dossiers", {
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "Admin authentication required"
            : `Workflow API returned ${response.status}.`,
        );
      const nextPayload = (await response.json()) as WorkflowPayload;
      const nextRecommendation = nextPayload.recommendations.find(
        (item) => item.id === recommendationId,
      );
      if (nextRecommendation) {
        const nextMatch = matchDossierRecommendationSubject({
          recommendation: nextRecommendation,
          candidates: nextPayload.candidates,
        });
        const nextCandidateId =
          nextRecommendation.targetCandidateId ??
          nextMatch.exactCandidateId ??
          nextMatch.possibleCandidateIds[0] ??
          "";
        setIdentityLinkForm((current) =>
          current.label || current.candidateId
            ? current
            : identityLinkDefaults(nextRecommendation, nextCandidateId),
        );
      }
      setPayload(nextPayload);
    },
    [recommendationId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow()
        .catch((err) =>
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load recommendation.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkflow]);

  const recommendation = useMemo(
    () =>
      payload?.recommendations.find((item) => item.id === recommendationId) ??
      null,
    [payload?.recommendations, recommendationId],
  );
  const entityActivityReadout = recommendation
    ? createDossierEntityActivityReadoutFromRecommendation(recommendation)
    : null;
  const targetCandidate = recommendation?.targetCandidateId
    ? (payload?.candidates.find(
        (candidate) => candidate.id === recommendation.targetCandidateId,
      ) ?? null)
    : null;
  const isTerminal = Boolean(
    recommendation && terminalRecommendationStatuses.has(recommendation.status),
  );
  const terminalMessage = recommendation
    ? terminalRecommendationMessage(recommendation)
    : "";
  const subjectMatch = recommendation
    ? matchDossierRecommendationSubject({
        recommendation,
        candidates: payload?.candidates ?? [],
      })
    : { possibleCandidateIds: [], reason: "No recommendation loaded." };
  const exactCandidate = subjectMatch.exactCandidateId
    ? (payload?.candidates.find(
        (candidate) => candidate.id === subjectMatch.exactCandidateId,
      ) ?? null)
    : null;
  const confirmedAliasLink =
    subjectMatch.exactMatchKind === "confirmed_alias" && exactCandidate
      ? (exactCandidate.identityLinks ?? []).find(
          (identityLink) =>
            identityLink.status === "confirmed" &&
            identityLink.useForMatching &&
            identityLink.normalizedLabel ===
              normalizeDossierSubjectName(recommendation?.subjectName ?? ""),
        )
      : undefined;
  const possibleAliasConflictCandidates = recommendation
    ? (payload?.candidates ?? []).filter((candidate) =>
        (candidate.identityLinks ?? []).some(
          (identityLink) =>
            identityLink.status === "proposed" &&
            identityLink.normalizedLabel ===
              normalizeDossierSubjectName(recommendation.subjectName),
        ),
      )
    : [];
  const possibleCandidates = subjectMatch.possibleCandidateIds
    .map((candidateId) =>
      payload?.candidates.find((candidate) => candidate.id === candidateId),
    )
    .filter((candidate): candidate is DossierCandidate => Boolean(candidate));
  const activeCandidates = (payload?.candidates ?? []).filter(
    (candidate) =>
      candidate.status !== "denied" && candidate.status !== "merged",
  );
  const enrichmentLane =
    recommendation?.ingestSource === "bnl_source_file_enrichment"
      ? targetCandidate?.status === "active_source_file"
        ? "Active Source File"
        : targetCandidate?.status === "candidate_intake"
          ? "Intake Item"
          : targetCandidate?.status === "existing_dossier_update"
            ? "Existing Dossier Update"
            : "Recommendation Inbox"
      : null;
  const isEnrichmentRecommendation = enrichmentLane !== null;
  const preselectedCandidateId =
    targetCandidate?.id ??
    exactCandidate?.id ??
    possibleCandidates[0]?.id ??
    "";
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
        recommendation?: DossierRecommendation;
        error?: string;
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

  async function updateRecommendation(
    action:
      | "convertRecommendationToCandidate"
      | "ignoreDossierRecommendation"
      | "dismissDossierRecommendation",
  ) {
    try {
      const data = await postWorkflow({ action, recommendationId });
      setNotice(
        `${data.recommendation?.subjectName ?? "Recommendation"} updated. This does not publish anything.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update recommendation.",
      );
    }
  }

  async function attachRecommendationToMatchedSourceFile() {
    if (!subjectMatch.exactCandidateId) {
      setNotice(
        "Attach is only allowed when the system confirms an exact same-subject BNL Source File match.",
      );
      return;
    }
    try {
      const data = await postWorkflow({
        action: "attachRecommendationToCandidate",
        recommendationId,
        candidateId: subjectMatch.exactCandidateId,
        createSourceNote: true,
      });
      setNotice(
        `${data.recommendation?.subjectName ?? "Recommendation"} attached to the matched BNL Source File. No draft was created.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to attach recommendation.",
      );
    }
  }

  async function createIdentityLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await postWorkflow({
        action: "createIdentityLinkFromRecommendation",
        recommendationId,
        candidateId: identityLinkForm.candidateId,
        input: {
          label: identityLinkForm.label,
          type: identityLinkForm.type,
          visibility: identityLinkForm.visibility,
          source: identityLinkForm.source,
          note: identityLinkForm.note,
          useForMatchingAfterConfirmation:
            identityLinkForm.useForMatchingAfterConfirmation,
          useInPublicDossier: identityLinkForm.useInPublicDossier,
        },
      });
      setNotice(
        "Proposed identity link created. Confirm it from the BNL Source File when ready.",
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to create proposed identity link.",
      );
    }
  }

  if (loading)
    return (
      <MinimalState
        title="Loading recommendation"
        message="Checking the Dossier Recommendation Inbox."
      />
    );
  if (error || !payload)
    return (
      <MinimalState
        title="Admin authentication required"
        message={
          error ?? "Sign in through /admin before opening recommendations."
        }
      />
    );
  if (!recommendation)
    return (
      <MinimalState
        title="Recommendation not found"
        message="This recommendation is not present in the workflow store."
      />
    );

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            Dossier Recommendation Inbox
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {recommendation.subjectName}
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            BNL Recommendation / Evidence Cluster records are admin-only
            evidence records and Source File inputs, not public copy. They do
            not publish, create drafts, write content files, or create tags
            automatically. Attach is only allowed for confirmed same-subject
            matches; merge is owner/lead identity resolution. BNL dynamic
            discovery can create an internal working case file only when no
            exact or possible existing source-file match is found.
            Identity/alias and duplicate recommendations create proposed review
            material only; they do not confirm identity, merge identities,
            create drafts, create tags, or create public pages automatically.
          </p>
          {notice && (
            <div className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              {notice}
            </div>
          )}
          {isTerminal && (
            <div className="mt-4 border border-border/70 bg-background/30 p-4 text-sm text-muted">
              <p className="font-bold text-foreground">{terminalMessage}</p>
              <p>Ingest: {recommendationProvenance(recommendation)}</p>
              {recommendation.ingestKey && (
                <p>Ingest key: {recommendation.ingestKey}</p>
              )}
              {targetCandidate ? (
                <Link
                  href={`/admin/dossiers/candidates/${targetCandidate.id}`}
                  className="mt-2 inline-flex text-accent hover:underline"
                >
                  Open target internal record: {targetCandidate.name}
                </Link>
              ) : recommendation.targetCandidateId ? (
                <Link
                  href={`/admin/dossiers/candidates/${recommendation.targetCandidateId}`}
                  className="mt-2 inline-flex text-accent hover:underline"
                >
                  Open target internal record
                </Link>
              ) : null}
              <p className="mt-2 text-xs uppercase tracking-widest text-muted">
                Terminal recommendation actions are closed. No reopen/retry
                behavior is available in this PR.
              </p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href="/admin/dossiers"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Back to Dossier Dashboard
            </Link>
            {!isTerminal && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation("ignoreDossierRecommendation")
                  }
                  className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Ignore
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation("dismissDossierRecommendation")
                  }
                  className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
        {isEnrichmentRecommendation && (
          <section className="border border-accent/60 bg-accent/10 p-5 text-sm text-accent space-y-3">
            <p className="text-xs uppercase tracking-[0.45em]">
              BNL Review Addendum
            </p>
            <h2 className="text-2xl font-bold">
              Review-only internal case-file material
            </h2>
            <p>
              {
                "This packet is BNL-generated review context. It is not candidate discovery, not public copy, and not publication approval. Owner/admin review is required before any public use."
              }
            </p>
            <p>Review target: {enrichmentLane}</p>
            {targetCandidate ? (
              <p>
                Target record: {targetCandidate.name} ({targetCandidate.status})
              </p>
            ) : (
              <p>
                No target candidate is set; this remains in the Recommendation
                Inbox.
              </p>
            )}
            <p>
              Allowed actions: review, dismiss, ignore, or attach only through
              the matched target lane. No public dossier, alias confirmation,
              merge, or Proposed Dossier is created automatically.
            </p>
          </section>
        )}
        {!isTerminal && !isEnrichmentRecommendation && (
          <section className="border border-border bg-surface p-5 text-sm text-muted space-y-4">
            <h2 className="text-2xl font-bold text-foreground">
              Matched BNL Source File
            </h2>
            <p>
              BNL Source File = internal working case file / evidence folder for
              one subject/entity. Admins can add info to this subject, but
              cannot freely combine unrelated recommendations with arbitrary
              source files. Public use requires review.
            </p>
            {exactCandidate ? (
              <div className="border border-accent/60 bg-accent/10 p-4 text-accent space-y-2">
                {subjectMatch.exactMatchKind === "confirmed_alias" ? (
                  <>
                    <p className="font-bold">
                      Matched by confirmed alias:{" "}
                      {confirmedAliasLink?.label ??
                        subjectMatch.aliasLabel ??
                        recommendation.subjectName}
                    </p>
                    <p>Target source file: {exactCandidate.name}</p>
                    <p>
                      This alias is used for internal routing only unless public
                      use is later approved.
                    </p>
                  </>
                ) : subjectMatch.exactMatchKind === "pre_targeted" ? (
                  <>
                    <p className="font-bold">
                      Pre-targeted BNL Source File: {exactCandidate.name}
                    </p>
                    <p>
                      This recommendation already points to an existing source
                      file.
                    </p>
                  </>
                ) : (
                  <p className="font-bold">
                    Exact same-subject match: {exactCandidate.name}
                  </p>
                )}
                <p>{subjectMatch.reason}</p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void attachRecommendationToMatchedSourceFile()}
                  className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                >
                  Attach to Matched BNL Source File
                </button>
              </div>
            ) : possibleAliasConflictCandidates.length > 0 ? (
              <div className="border border-accent/60 bg-accent/10 p-4 text-accent space-y-2">
                <p className="font-bold">Possible identity review needed</p>
                <p>
                  A proposed identity link uses this subject label, but proposed
                  aliases do not count as exact confirmed matches, auto-match,
                  attach, or merge source files.
                </p>
                <ul className="list-disc pl-5">
                  {possibleAliasConflictCandidates.map((candidate) => (
                    <li key={candidate.id}>{candidate.name}</li>
                  ))}
                </ul>
              </div>
            ) : possibleCandidates.length > 0 ? (
              <div className="border border-accent/60 bg-accent/10 p-4 text-accent space-y-2">
                <p className="font-bold">
                  Possible duplicate / identity warning
                </p>
                <p>{subjectMatch.reason}</p>
                <ul className="list-disc pl-5">
                  {possibleCandidates.map((candidate) => (
                    <li key={candidate.id}>{candidate.name}</li>
                  ))}
                </ul>
                <p>
                  Owner/lead identity review is required before merge or attach.
                  Possible existing source files found. Confirm this is a
                  separate subject before converting.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation(
                      "convertRecommendationToCandidate",
                    )
                  }
                  className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                >
                  Convert to New BNL Source File
                </button>
              </div>
            ) : (
              <div className="border border-border/70 bg-background/30 p-4 space-y-2">
                <p className="font-bold text-foreground">
                  No BNL Source File match
                </p>
                <p>{subjectMatch.reason}</p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation(
                      "convertRecommendationToCandidate",
                    )
                  }
                  className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                >
                  Convert to New BNL Source File
                </button>
              </div>
            )}
          </section>
        )}

        {!isTerminal && (
          <section className="border border-border bg-surface p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-muted mb-2">
                Create Identity Link
              </p>
              <h2 className="text-xl font-bold text-foreground">
                Create proposed identity link
              </h2>
              <p className="text-sm text-muted mt-2">
                Recommendation subject: {recommendation.subjectName}. This
                creates a proposed alias on the selected internal record only.
                It does not confirm the alias, publish, merge source files,
                create a draft, or create tags.
              </p>
              {preselectedCandidateId && (
                <p className="mt-2 text-sm text-accent">
                  Matched/pre-targeted enrichment target:{" "}
                  {targetCandidate?.name ??
                    exactCandidate?.name ??
                    possibleCandidates[0]?.name}
                </p>
              )}
            </div>
            <form
              onSubmit={createIdentityLink}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs uppercase tracking-widest text-muted"
            >
              <label className="space-y-2 md:col-span-2">
                <span>BNL Source File</span>
                <select
                  required
                  value={identityLinkForm.candidateId}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      candidateId: event.target.value,
                    })
                  }
                  className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
                >
                  <option value="">Select BNL Source File</option>
                  {activeCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span>Alias label</span>
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
                <span>Identity link type</span>
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
                  checked={identityLinkForm.useForMatchingAfterConfirmation}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      useForMatchingAfterConfirmation: event.target.checked,
                    })
                  }
                />
                Use for future matching after confirmation
              </label>
              <label className="md:col-span-2 flex items-center gap-2 normal-case tracking-normal text-sm">
                <input
                  type="checkbox"
                  checked={identityLinkForm.useInPublicDossier}
                  onChange={(event) =>
                    setIdentityLinkForm({
                      ...identityLinkForm,
                      useInPublicDossier: event.target.checked,
                    })
                  }
                />
                Use in public dossier later after review
              </label>
              <div className="md:col-span-4">
                <button
                  type="submit"
                  disabled={saving || !identityLinkForm.candidateId}
                  className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:pointer-events-none disabled:opacity-50"
                >
                  Create Proposed Identity Link
                </button>
              </div>
            </form>
          </section>
        )}
        <HumanReadableRecommendationCaseFile recommendation={recommendation} />
        {entityActivityReadout && (
          <DossierEntityActivityReadoutPanel
            readout={entityActivityReadout}
            compact
          />
        )}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field title="Subject">
            <p>{recommendation.subjectName}</p>
          </Field>
          <Field title="Type / Status">
            <p>
              {recommendation.type} / {recommendation.status}
            </p>
          </Field>
          <Field title="Admin audit summary">
            <p>{recommendationProvenance(recommendation)}</p>
            <p>Created by: {recommendation.createdBy ?? "—"}</p>
            <p>Ingest source: {recommendation.ingestSource ?? "—"}</p>
            <p>Ingested at: {formatDate(recommendation.ingestedAt)}</p>
            <p>Ingest key: {recommendation.ingestKey ?? "—"}</p>
          </Field>
          <Field title="Reason">
            <p>{recommendation.reason}</p>
          </Field>
          <Field title="Evidence / Source Notes">
            <p>
              Recommendation detail is evidence for the internal working case
              file, not public dossier copy.
            </p>
          </Field>
          <Field title="Known Context / Current Read">
            {list(recommendation.knownContext)}
          </Field>
          <Field title="Best Evidence to Review">
            {list(recommendation.bestEvidenceToReview)}
          </Field>
          <Field title="Useful Evidence">
            {list(recommendation.usefulEvidence)}
          </Field>
          <Field title="Observed Channels / Activity">
            {list(recommendation.observedChannels)}
          </Field>
          <Field title="Conversation Highlights">
            {list(recommendation.conversationHighlights)}
          </Field>
          <Field title="Music / Show Signals">
            {list(recommendation.musicSignals)}
          </Field>
          <Field title="Community Signals">
            {list(recommendation.communitySignals)}
          </Field>
          <Field title="BNL Interaction Signals">
            {list(recommendation.bnlInteractionSignals)}
          </Field>
          <Field title="Private Relationship Context — Review Only">
            {list(recommendation.relationshipSignals)}
          </Field>
          <Field title="Public-Safe / Public-Use Candidates Pending Owner Review">
            {list([
              ...(recommendation.publicSafePossibilities ?? []),
              ...(recommendation.publicUseCandidates ?? []),
            ])}
          </Field>
          <Field title="Review-Only Evidence">
            {list(recommendation.reviewOnlyEvidence)}
          </Field>
          <Field title="Private/Internal Notes">
            {list(recommendation.privateOnlyNotes)}
          </Field>
          <Field title="Not Public Yet">
            {list(recommendation.notPublicYet)}
          </Field>
          <Field title="Source Coverage">
            {list(recommendation.sourceCoverage)}
          </Field>
          <Field title="Topic Breakdown">
            {list(recommendation.topicBreakdown)}
          </Field>
          <Field title="Evidence Details">
            {list(recommendation.evidenceDetails)}
          </Field>
          <Field title="Queue / Submission Status">
            {list(queueSubmissionItems(recommendation))}
          </Field>
          <Field title="Recommended Next Action">
            <p>{recommendation.recommendedAction ?? recommendation.suggestedAction ?? "—"}</p>
          </Field>
          <Field title="Source Authority / Confidence">
            {list(sourceAuthorityItems(recommendation))}
          </Field>
          <Field title="Evidence summary">
            <p>{recommendation.evidenceSummary ?? "—"}</p>
          </Field>
          <Field title="Source lanes">
            <p>{recommendation.sourceLanes.join(", ")}</p>
          </Field>
          <Field title="Source types">
            <p>{recommendation.sourceTypes?.join(", ") || "—"}</p>
          </Field>
          <Field title="Confidence">
            <p>{recommendation.confidence ?? "—"}</p>
          </Field>
          <Field title="Recommended taxonomy">
            <p>
              {recommendation.recommendedCategory ?? "—"} /{" "}
              {recommendation.recommendedKind ?? "—"} /{" "}
              {recommendation.recommendedEcosystemLane ?? "—"} /{" "}
              {recommendation.recommendedIdentityAuthority ?? "—"}
            </p>
          </Field>
          <Field title="Recommended tags">
            <p>{recommendation.recommendedTags?.join(", ") || "—"}</p>
          </Field>
          <Field title="Missing info">{list(recommendation.missingInfo)}</Field>
          <Field title="Do-not-say">{list(recommendation.doNotSay)}</Field>
          <Field title="Source Warnings">
            <ul className="list-disc pl-5 space-y-1">
              {recommendation.sourceLanes.includes("broadcast_memory") && (
                <li>Source-blind memory trace</li>
              )}
              {recommendation.ingestSource?.startsWith("bnl") && (
                <li>Internal/private review required</li>
              )}
              {recommendation.ingestSource === "bnl_source_file_enrichment" && (
                <>
                  <li>Review-only BNL-generated enrichment</li>
                  <li>Internal case-file material; not public copy</li>
                  <li>Does not publish or create Proposed Dossiers</li>
                </>
              )}
              <li>Public use not allowed until review</li>
              <li>Owner/admin review required</li>
              {recommendation.type === "identity_link" && (
                <li>Possible connection, not confirmed identity</li>
              )}
            </ul>
          </Field>
          <Field title="Public safety notes">
            {list(recommendation.publicSafetyNotes)}
          </Field>
          <Field title="Suggested action">
            <p>{recommendation.suggestedAction ?? "—"}</p>
          </Field>
        </section>
      </section>
    </main>
  );
}
