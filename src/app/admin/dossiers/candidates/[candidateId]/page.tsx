"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getDossierSourceFileMetrics,
  type DossierCandidate,
  type DossierDraft,
  type DossierDuplicateGroup,
  type DossierIdentityLink,
  type DossierIdentityLinkSource,
  type DossierIdentityLinkStatus,
  type DossierIdentityLinkType,
  type DossierIdentityLinkVisibility,
  type DossierRecommendation,
  type DossierSourceFileNoteType,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  recommendations: DossierRecommendation[];
  workflow: { status: string };
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
    "This alias is confirmed and can route future recommendations to this BNL Source File when matching is enabled.",
  rejected: "This alias was rejected and will not be used for matching.",
  retired: "This alias is retired and no longer used for matching.",
};

const identityReviewNotice: Record<
  "confirmDossierIdentityLink" | "rejectDossierIdentityLink" | "retireDossierIdentityLink",
  string
> = {
  confirmDossierIdentityLink:
    "Identity link confirmed. Future recommendations can now match this alias if matching is enabled; it is still not public identity proof.",
  rejectDossierIdentityLink:
    "Identity link rejected. It will not be used for matching.",
  retireDossierIdentityLink:
    "Identity link retired. It is no longer active.",
};

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
    ...input.recommendations.flatMap((recommendation) => recommendation.sourceLanes),
  ]);
  return uniqueLabels([
    lanes.has("broadcast_memory") ? "Source-blind memory trace" : "",
    input.candidate.ingestSource === "bnl_dynamic_candidate_discovery" ||
    input.candidate.ingestSource === "bnl_source_knowledge_bridge" ||
    input.recommendations.some(
      (recommendation) =>
        recommendation.ingestSource === "bnl_dynamic_candidate_discovery" ||
        recommendation.ingestSource === "bnl_source_knowledge_bridge",
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
    ) || (input.candidate.identityLinks ?? []).some((link) => link.status === "proposed")
      ? "Possible connection, not confirmed identity"
      : "",
    "Owner review required",
  ]);
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
    identityLinkId: string,
    action:
      | "confirmDossierIdentityLink"
      | "rejectDossierIdentityLink"
      | "retireDossierIdentityLink",
    useForMatching?: boolean,
  ) => void;
}) {
  const isProposed = identityLink.status === "proposed";
  const isConfirmed = identityLink.status === "confirmed";
  const isRetired = identityLink.status === "retired";

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
                  : "Not used for matching"}
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
          {!isConfirmed && !isRetired && (
            <StatusBadge>Not used for matching</StatusBadge>
          )}
        </div>
      </div>
      <p>
        Type: {identityLink.type} / Visibility: {identityLink.visibility} /
        Source: {identityLink.source}
      </p>
      <p>Confidence: {identityLink.confidence ?? "—"}</p>
      {identityLink.createdFromRecommendationId && (
        <div className="border border-border/70 bg-background/30 p-3 space-y-1">
          <p className="font-semibold text-foreground">Created from recommendation</p>
          <p>Recommendation subject: {identityLink.createdFromRecommendationSubject ?? recommendation?.subjectName ?? "—"}</p>
          <p>Source lanes: {recommendation?.sourceLanes.join(", ") ?? "—"}</p>
          <p>Ingest source: {recommendation?.ingestSource ?? recommendation?.createdBy ?? "—"}</p>
          <Link
            href={`/admin/dossiers/recommendations/${identityLink.createdFromRecommendationId}`}
            className="inline-flex text-accent hover:underline"
          >
            Open recommendation
          </Link>
        </div>
      )}
      <p className="whitespace-pre-wrap">Note: {identityLink.note ?? "—"}</p>
      <p>
        Created: {formatDate(identityLink.createdAt)} by{" "}
        {identityLink.createdBy ?? "—"} / Confirmed: {" "}
        {formatDate(identityLink.confirmedAt)} by {identityLink.confirmedBy ?? "—"}
      </p>
      {(isProposed || isConfirmed) && (
        <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
          {isProposed && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onReview(
                    identityLink.id,
                    "confirmDossierIdentityLink",
                    true,
                  )
                }
                className="border border-accent px-3 py-1.5 text-accent hover:bg-accent hover:text-background disabled:pointer-events-none disabled:opacity-50"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onReview(identityLink.id, "rejectDossierIdentityLink")
                }
                className="border border-border px-3 py-1.5 hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {isConfirmed && (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                onReview(identityLink.id, "retireDossierIdentityLink")
              }
              className="border border-border px-3 py-1.5 hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-50"
            >
              Retire
            </button>
          )}
        </div>
      )}
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
  const candidateId = routeParam(params?.candidateId);
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteForm, setNoteForm] = useState<SourceNoteForm>(emptyNoteForm);
  const [identityLinkForm, setIdentityLinkForm] =
    useState<IdentityLinkForm>(emptyIdentityLinkForm);

  async function loadWorkflow() {
    const response = await fetch("/api/admin/dossiers", { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? "Admin authentication required"
          : `Workflow API returned ${response.status}.`,
      );
    setPayload((await response.json()) as WorkflowPayload);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow()
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Failed to load candidate.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [candidateId]);

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
  const hasOwnerReviewDraft = linkedDrafts.some(
    (draft) => draft.status === "ready_for_owner_review",
  );
  const canCreateDraft = Boolean(
    candidate &&
    !isCandidateClosed(candidate) &&
    !linkedDrafts.some((draft) => isDraftActive(draft)),
  );
  const canUpdateCandidate = Boolean(
    candidate && !isCandidateClosed(candidate),
  );
  const sourceMetrics = candidate
    ? getDossierSourceFileMetrics({
        candidate,
        drafts: payload?.drafts ?? [],
        recommendations: payload?.recommendations ?? [],
      })
    : null;
  const attachedRecommendations = (payload?.recommendations ?? []).filter(
    (recommendation) => recommendation.targetCandidateId === candidate?.id,
  );
  const identityLinks = [...(candidate?.identityLinks ?? [])].sort(
    (a, b) =>
      (a.status === "proposed" ? -1 : 1) -
        (b.status === "proposed" ? -1 : 1) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
  const proposedIdentityLinks = identityLinks.filter(
    (identityLink) => identityLink.status === "proposed",
  );
  const confirmedIdentityLinks = identityLinks.filter(
    (identityLink) => identityLink.status === "confirmed",
  );
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
  const nextRecommendedAction = sourceMetrics?.unappliedSourceNotesCount
    ? "Review source updates in proposed dossier"
    : primaryDraft
      ? "Open Proposed Dossier"
      : candidate?.status === "needs_more_evidence"
        ? "Add missing info"
        : "Create Proposed Dossier";

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

  async function createDraft() {
    if (!canCreateDraft) return;
    try {
      const data = await postWorkflow({
        action: "createDraftFromCandidate",
        candidateId,
      });
      setNotice(
        `Draft created: ${data.draft?.fields.name ?? "draft"}. Open Proposed Dossier in the dedicated editor.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to create draft.");
    }
  }

  async function update(action: "markNeedsMoreEvidence") {
    if (!canUpdateCandidate) return;
    try {
      const data = await postWorkflow({ action, candidateId });
      setNotice(
        `${data.candidate?.name ?? "Candidate"} updated. Workflow records remain internal only.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update candidate.",
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
    identityLinkId: string,
    action:
      | "confirmDossierIdentityLink"
      | "rejectDossierIdentityLink"
      | "retireDossierIdentityLink",
    useForMatching = false,
  ) {
    try {
      await postWorkflow({
        action,
        candidateId,
        identityLinkId,
        useForMatching,
      });
      setNotice(identityReviewNotice[action]);
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
        message="Checking the candidate workflow record."
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

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            Phase 1 — BNL Source File
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {candidate.name}
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Source File ID: {candidate.id}. Internal working case file. This may
            include unverified, internal, conflicting, source-blind, or
            private-review material. Do not treat this as public copy. Admins
            can add information to this BNL Source File, but cannot turn this
            source file into another subject. Notes do not publish, create tags,
            or mutate public records.
          </p>
          <div className="mt-4">
            <PhaseRail />
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 text-xs text-muted">
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Source strength</p>
              <p>{sourceMetrics?.sourceDepth ?? "Low"}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Current draft status</p>
              <p>{primaryDraft?.status ?? "No proposed dossier"}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Recommendations</p>
              <p>{sourceMetrics?.attachedRecommendationCount ?? 0}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Source notes</p>
              <p>{sourceMetrics?.sourceNotesCount ?? 0}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Aliases</p>
              <p>{identityLinks.length}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Unapplied notes</p>
              <p>{sourceMetrics?.unappliedSourceNotesCount ?? 0}</p>
            </div>
            <div className="border border-border bg-background/30 p-3">
              <p className="uppercase tracking-widest text-accent">Next action</p>
              <p>{nextRecommendedAction}</p>
            </div>
          </div>
          {(sourceMetrics?.unappliedSourceNotesCount ?? 0) > 0 && primaryDraft && (
            <div className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              <p>
                This source file has new info not yet applied to the proposed
                dossier.
              </p>
              <Link
                href={`/admin/dossiers/drafts/${primaryDraft.id}`}
                className="mt-2 inline-flex border border-accent px-3 py-1.5 text-xs uppercase tracking-widest hover:bg-accent hover:text-background"
              >
                Open Proposed Dossier
              </Link>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href="/admin/dossiers"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Back to Dossier Control Center
            </Link>
            {canCreateDraft && (
              <button
                type="button"
                onClick={() => void createDraft()}
                disabled={saving}
                className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                Create Proposed Dossier
              </button>
            )}
            {primaryDraft && isDraftActive(primaryDraft) && (
              <Link
                href={`/admin/dossiers/drafts/${primaryDraft.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background"
              >
                Open Proposed Dossier
              </Link>
            )}
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
          </div>
          {notice && (
            <div className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              {notice}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
        <section className="border border-border bg-surface p-5 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            Case File Summary
          </h2>
          <p className="text-sm text-muted">
            The BNL Source File is an internal working case file / evidence
            folder. It can contain confirmed facts, claimed facts, inferred
            facts, messy evidence, recommendation evidence clusters,
            source-blind memory traces, private/internal notes, conflicting
            information, missing info, warnings, do-not-say
            notes, identity possibilities, duplicate/identity warnings,
            taxonomy suggestions, public safety notes, and public-safe facts. It
            is not an
            almost-public dossier.
          </p>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
            {sourceWarningLabels({ candidate, recommendations: attachedRecommendations }).map((label) => (
              <StatusBadge key={label}>{label}</StatusBadge>
            ))}
          </div>
        </section>

        <section
          id="add-info"
          className="border border-border bg-surface p-5 space-y-3"
        >
          <h2 className="text-2xl font-bold text-foreground">
            Add to BNL Source File
          </h2>
          <p className="text-sm text-muted">
            This adds information to this subject&apos;s BNL Source File. It does not
            directly edit the proposed dossier.
          </p>
          <p className="text-sm text-muted">
            Add to BNL Source File = add info to this subject. This source file
            remains one subject/entity. If this information belongs to a
            different subject, create or wait for a separate BNL recommendation.
            BNL Edit Chat = tell BNL how to revise
            the proposed dossier. Advanced Manual Edit = fallback direct
            editing of the proposed dossier fields.
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
              <span>
                Source file note
              </span>
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
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                Save Info
              </button>
            </div>
          </form>
        </section>

        <Section title="Evidence / Source Notes">
          <p className="mb-3">BNL recommendations are evidence/source-file inputs, not public copy.</p>
        </Section>

        <Section title="Recommendation/evidence clusters">
          {attachedRecommendations.length === 0 ? (
            <p>No recommendations attached yet.</p>
          ) : (
            <div className="space-y-3">
              {attachedRecommendations.map((recommendation) => (
                <article key={recommendation.id} className="border border-border/70 bg-background/20 p-3">
                  <p className="text-foreground font-semibold">
                    {recommendation.subjectName}
                  </p>
                  <p>{recommendation.evidenceSummary || recommendation.reason}</p>
                  <p>Source lanes: {recommendation.sourceLanes.join(", ")}</p>
                </article>
              ))}
            </div>
          )}
        </Section>

        <Section title="Identity / Alias Review">
          <div className="space-y-5">
            <div className="space-y-2">
              <p>
                Aliases help BNL route future recommendations to the right source
                file. Identity recommendations create proposed review material
                only, not confirmed identity. Internal aliases are not public dossier text
                and remain admin-only. Public-safe visibility does not publish
                anything yet.
              </p>
              <p className="border border-border/70 bg-background/20 p-3">
                Adding an alias does not make it public and does not affect
                matching until confirmed. If an alias is created as proposed,
                matching is not active yet.
              </p>
            </div>

            {identityLinks.length === 0 ? (
              <p>No identity links saved yet.</p>
            ) : (
              <div className="space-y-4">
                {[
                  {
                    title: "Pending Review",
                    empty: "No pending aliases.",
                    links: proposedIdentityLinks,
                  },
                  {
                    title: "Confirmed Aliases",
                    empty: "No confirmed aliases.",
                    links: confirmedIdentityLinks,
                  },
                  {
                    title: "Closed / Inactive",
                    empty: "No closed aliases.",
                    links: closedIdentityLinks,
                  },
                ].map((group) => (
                  <section
                    key={group.title}
                    className="border border-border/60 bg-background/10 p-3 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
                        {group.title}
                      </h3>
                      <span className="text-xs text-muted">
                        {group.links.length} alias
                        {group.links.length === 1 ? "" : "es"}
                      </span>
                    </div>
                    {group.links.length === 0 ? (
                      <p className="text-xs">{group.empty}</p>
                    ) : (
                      <div className="space-y-3">
                        {group.links.map((identityLink) => (
                          <IdentityLinkCard
                            key={identityLink.id}
                            identityLink={identityLink}
                            saving={saving}
                            recommendation={
                              identityLink.createdFromRecommendationId
                                ? recommendationById.get(identityLink.createdFromRecommendationId)
                                : undefined
                            }
                            onReview={(identityLinkId, action, useForMatching) =>
                              void reviewIdentityLink(
                                identityLinkId,
                                action,
                                useForMatching,
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}
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
                      visibility: event.target.value as DossierIdentityLinkVisibility,
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
        </Section>

        <Section title="Proposed Dossier">
          {!primaryDraft ? (
            <div className="space-y-3">
              <p>Ready for Proposed Dossier: the proposed dossier should be written from reviewed, public-safe Source File material, not copied wholesale from this working case file.</p>
              <button
                type="button"
                onClick={() => void createDraft()}
                disabled={saving || !canCreateDraft}
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                Create Proposed Dossier
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p>Status: {primaryDraft.status}</p>
              <p>Updated: {formatDate(primaryDraft.updatedAt)}</p>
              <p>Unapplied notes: {sourceMetrics?.unappliedSourceNotesCount ?? 0}</p>
              <Link
                href={`/admin/dossiers/drafts/${primaryDraft.id}`}
                className="inline-flex border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
              >
                Open Proposed Dossier
              </Link>
            </div>
          )}
        </Section>

        {hasOwnerReviewDraft && (
          <Section title="Owner Review">
            <p>Submitted draft is waiting in the separate owner review page.</p>
            <Link
              href="/admin/dossiers/owner-review"
              className="mt-2 inline-flex border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent"
            >
              Open Owner Review
            </Link>
          </Section>
        )}

        <Section title="Source-File Notes UI">
          {sourceNotes.length === 0 ? (
            <p>No saved source notes yet.</p>
          ) : (
            <div className="space-y-3">
              {sourceNotes.map((note) => (
                <article
                  key={note.id}
                  className="border border-border/70 bg-background/20 p-3"
                >
                  <p className="text-foreground font-semibold">
                    {note.type} / {note.status}
                  </p>
                  <p className="whitespace-pre-wrap">{note.text}</p>
                  <p>
                    Source: {note.source} / Public safe:{" "}
                    {String(note.publicSafe)} / Created:{" "}
                    {formatDate(note.createdAt)}
                  </p>
                  <p>
                    Applied draft:{" "}
                    {note.appliesToDraftId ? (
                      <Link
                        className="text-accent hover:underline"
                        href={`/admin/dossiers/drafts/${note.appliesToDraftId}`}
                      >
                        {note.appliesToDraftId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Section title="Reason">
            <p>{candidate.reason || "—"}</p>
          </Section>
          <Section title="Why now">
            <p>{candidate.whyNow || "—"}</p>
          </Section>
          <Section title="Evidence summary">
            <p>{candidate.evidenceSummary || "—"}</p>
          </Section>
          <Section title="Evidence items">
            {candidate.evidenceItems?.length ? (
              candidate.evidenceItems.map((item) => (
                <article key={item.id} className="mb-2">
                  <p className="text-foreground">{item.label}</p>
                  <p>{item.summary}</p>
                  <p>
                    Type: {item.type} / Public safe: {String(item.publicSafe)}
                  </p>
                </article>
              ))
            ) : (
              <p>—</p>
            )}
          </Section>
          <Section title="Known / Claimed / Inferred">{list(candidate.knownFacts)}</Section>
          <Section title="Corrections / extra notes">
            <p>Saved notes now live in BNL Source File Notes above.</p>
          </Section>
          <Section title="Missing Info">{list(candidate.missingInfo)}</Section>
          <Section title="Do Not Say">{list(candidate.doNotSay)}</Section>
          <Section title="Public-Safe Facts">
            {list(candidate.knownFacts?.filter(Boolean), "No public-safe facts marked yet.")}
          </Section>
          <Section title="Internal-Only Notes">
            {sourceNotes.filter((note) => note.publicSafe !== true).length ? (
              <ul className="list-disc pl-5 space-y-1">
                {sourceNotes
                  .filter((note) => note.publicSafe !== true)
                  .map((note) => (
                    <li key={note.id}>{note.text}</li>
                  ))}
              </ul>
            ) : (
              <p className="text-muted">No internal-only notes saved yet.</p>
            )}
          </Section>
          <Section title="Source Warnings">
            <div className="flex flex-wrap gap-2">
              {sourceWarningLabels({ candidate, recommendations: attachedRecommendations }).map((label) => (
                <StatusBadge key={label}>{label}</StatusBadge>
              ))}
            </div>
          </Section>
          <Section title="Conflicts / Needs Review">
            <p>Duplicate risk: {candidate.duplicateRisk ?? "none"}</p>
            <p>Pending identity aliases: {proposedIdentityLinks.length}</p>
          </Section>
          <Section title="Public safety notes">
            {list(candidate.publicSafetyNotes)}
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
      </section>
    </main>
  );
}
