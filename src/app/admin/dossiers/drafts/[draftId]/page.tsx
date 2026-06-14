"use client";

import { DossierPageView } from "@/components/DossierPageView";
import { DossierSourceFileSummaryPanel } from "@/components/DossierSourceFileSummaryPanel";
import { draftToDossierPreviewViewModel } from "@/lib/dossier-page-view-model";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  getUnappliedSourceNotes,
  type DossierCandidate,
  type DossierDraft,
  type DossierDuplicateGroup,
} from "@/lib/dossier-workflow";
import {
  DOSSIER_PUBLIC_ROLE_PLACEHOLDER,
  DOSSIER_PUBLIC_SUMMARY_PLACEHOLDER,
  isDossierPublicCopyPlaceholder,
  sanitizeDossierPublicCopy,
  validateDossierPublicDraftFields,
  type DossierDraftFieldWarning,
} from "@/lib/dossier-public-copy-guard";
import { createDossierSourceFileSummary } from "@/lib/dossier-source-file-summary";
import { createDossierDraftBlueprint } from "@/lib/dossier-classification";
import { buildDossierStylePacket, DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS } from "@/lib/dossier-style-packet";
import {
  DOSSIER_CATEGORY_OPTIONS,
  DOSSIER_ECOSYSTEM_LANE_OPTIONS,
  DOSSIER_IDENTITY_AUTHORITY_OPTIONS,
  DOSSIER_KIND_OPTIONS,
} from "@/lib/dossier-taxonomy";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  workflow: { status: string };
};
type DraftForm = {
  name: string;
  category: string;
  kind: DossierDraft["fields"]["kind"] | "";
  ecosystemLane: DossierDraft["fields"]["ecosystemLane"] | "";
  identityAuthority: DossierDraft["fields"]["identityAuthority"] | "";
  status: string;
  clearance: string;
  origin: string;
  role: string;
  summary: string;
  notes: string;
  tags: string;
  proposedTags: string;
  primaryLinkLabel: string;
  primaryLinkUrl: string;
  primaryLinkType: string;
  selectedBy: "operator" | "subject" | "legacy";
};

const categoryOptions = ["", ...DOSSIER_CATEGORY_OPTIONS];
const statusOptions = [
  "",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
  "PENDING",
  "UNKNOWN",
];
const clearanceOptions = ["", "PUBLIC", "INTERNAL", "RESTRICTED"];
const originOptions = ["", "KNOWN", "UNKNOWN", "UNVERIFIED", "WITHHELD"];
const kindOptions = ["", ...DOSSIER_KIND_OPTIONS];
const ecosystemLaneOptions = ["", ...DOSSIER_ECOSYSTEM_LANE_OPTIONS];
const identityAuthorityOptions = ["", ...DOSSIER_IDENTITY_AUTHORITY_OPTIONS];
const nonEditableDraftStatuses = new Set<DossierDraft["status"]>([
  "ready_for_owner_review",
  "owner_approved",
  "denied",
  "superseded",
  "published",
]);

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

function inputClass() {
  return "w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground disabled:opacity-60";
}

function lines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function PhaseRail({ currentPhase }: { currentPhase: 2 | 3 | 4 | 5 }) {
  const phases = [
    "Phase 1 — BNL Source File",
    "Phase 2 — Proposed Dossier + BNL Edit Chat",
    "Phase 3 — Final Admin Draft",
    "Phase 4 — Owner Review",
    "Phase 5 — Approved / Publish Later",
  ];
  return (
    <section
      className="border border-border bg-background/30 p-3 text-xs uppercase tracking-widest text-muted"
      aria-label="Dossier phase indicator"
    >
      <div className="flex flex-wrap gap-2">
        {phases.map((phase, index) => (
          <span
            key={phase}
            className={`border px-3 py-2 ${currentPhase === index + 1 ? "border-accent bg-accent/10 text-accent" : "border-border"}`}
          >
            {phase}
          </span>
        ))}
      </div>
    </section>
  );
}

function draftFormFromDraft(draft: DossierDraft): DraftForm {
  return {
    name: draft.fields.name ?? "",
    category: draft.fields.category ?? "",
    kind: draft.fields.kind ?? "",
    ecosystemLane: draft.fields.ecosystemLane ?? "",
    identityAuthority: draft.fields.identityAuthority ?? "",
    status: draft.fields.status ?? "",
    clearance: draft.fields.clearance ?? "",
    origin: draft.fields.origin ?? "",
    role: draft.fields.role ?? "",
    summary: draft.fields.summary ?? "",
    notes: draft.fields.notes ?? "",
    tags: (draft.fields.tags ?? []).join("\n"),
    proposedTags: (draft.fields.proposedTags ?? []).join("\n"),
    primaryLinkLabel: draft.fields.primaryLink?.label ?? "",
    primaryLinkUrl: draft.fields.primaryLink?.url ?? "",
    primaryLinkType: draft.fields.primaryLink?.type ?? "website",
    selectedBy: draft.fields.primaryLink?.selectedBy ?? "operator",
  };
}

function draftFieldsForPublicGuard(form: DraftForm): DossierDraft["fields"] {
  return {
    name: form.name,
    role: form.role,
    summary: form.summary,
    notes: form.notes,
    tags: lines(form.tags),
    proposedTags: lines(form.proposedTags),
    primaryLink: form.primaryLinkUrl
      ? {
          label: form.primaryLinkLabel || form.name,
          url: form.primaryLinkUrl,
          type: form.primaryLinkType || "website",
          selectedBy: form.selectedBy,
        }
      : undefined,
  };
}

function ThinSourcePublicCopyWarning({
  show,
}: {
  show: boolean;
}) {
  if (!show) return null;
  return (
    <section className="border border-accent/70 bg-accent/10 p-5 text-sm text-accent">
      Source material is not strong enough for public dossier copy yet. Add
      public-safe facts or use BNL Edit Chat after more source context is
      available.
    </section>
  );
}

function PublicCopyGuardWarning({
  warnings,
}: {
  warnings: DossierDraftFieldWarning[];
}) {
  if (warnings.length === 0) return null;
  const labels = [...new Set(warnings.map((warning) => warning.label))];
  return (
    <section className="border border-accent/70 bg-accent/10 p-5 text-sm text-accent space-y-3">
      <p className="text-xs uppercase tracking-[0.4em]">Clean draft needed</p>
      <h2 className="text-2xl font-bold">Clean draft public copy</h2>
      <p>
        This proposed dossier contains internal source/debug text in
        public-facing fields. Clean {labels.join(", ")} before owner review.
      </p>
      <ul className="list-disc pl-5 space-y-1">
        {warnings.map((warning) => (
          <li key={`${warning.field}-${warning.message}`}>
            <span className="font-semibold">{warning.label}:</span>{" "}
            {warning.message}
          </li>
        ))}
      </ul>
      <p>
        Use source summary to rewrite. Do not send to owner review yet. Raw
        source/audit material remains available in Source File sections.
      </p>
    </section>
  );
}


function ProvenanceList({
  items,
  empty,
}: {
  items?: string[];
  empty: string;
}) {
  const cleanItems = (items ?? []).filter(Boolean);
  if (cleanItems.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
      {cleanItems.map((item) => (
        <li key={item} className="whitespace-pre-wrap">{item}</li>
      ))}
    </ul>
  );
}

function BnlDraftProvenancePanel({ draft }: { draft: DossierDraft }) {
  const provenance = draft.sourceFileDraftMetadata?.bnlDraftProvenance;
  const validationItems = [
    ...(provenance?.validationIssues ?? draft.sourceFileDraftMetadata?.validationIssues ?? []).map(
      (item) => `Issue: ${item}`,
    ),
    ...(provenance?.validationWarnings ?? draft.sourceFileDraftMetadata?.validationWarnings ?? []).map(
      (item) => `Warning: ${item}`,
    ),
  ];
  return (
    <section className="border border-border bg-surface p-5 space-y-4 text-sm text-muted">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-muted mb-2">
          Admin-only provenance
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          BNL Draft Evidence + Review Notes
        </h2>
        <p>
          This section is stored admin review metadata from BNL. It is not public
          dossier copy and is not rendered by public dossier pages.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="border border-border/70 bg-background/20 p-3">
          <h3 className="font-bold text-foreground">Source Usage</h3>
          <p className="whitespace-pre-wrap">
            {provenance?.sourceUsageSummary || "No source usage summary was stored for this draft."}
          </p>
        </section>
        <section className="border border-border/70 bg-background/20 p-3">
          <h3 className="font-bold text-foreground">Subject Memory Resolver</h3>
          <ProvenanceList
            items={provenance?.resolverSummary}
            empty="No resolver metadata stored for this draft."
          />
        </section>
        <section className="border border-border/70 bg-background/20 p-3">
          <h3 className="font-bold text-foreground">Owner Review Warnings</h3>
          <ProvenanceList
            items={provenance?.ownerReviewWarnings}
            empty="No owner review warnings were reported."
          />
        </section>
        <section className="border border-border/70 bg-background/20 p-3">
          <h3 className="font-bold text-foreground">Missing Info</h3>
          <ProvenanceList
            items={provenance?.missingInfoQuestions}
            empty="No missing info was reported."
          />
        </section>
        <section className="border border-border/70 bg-background/20 p-3">
          <h3 className="font-bold text-foreground">Public Safety Notes</h3>
          <ProvenanceList
            items={provenance?.publicSafetyWarnings}
            empty="No public safety notes were reported."
          />
        </section>
        <section className="border border-border/70 bg-background/20 p-3">
          <h3 className="font-bold text-foreground">Unsupported / Rejected Claims</h3>
          <ProvenanceList
            items={provenance?.unsupportedClaimsRejected}
            empty="No unsupported claims were reported."
          />
        </section>
        <section className="border border-border/70 bg-background/20 p-3 lg:col-span-2">
          <h3 className="font-bold text-foreground">Validation</h3>
          <ProvenanceList
            items={validationItems}
            empty="No validation issues or warnings were stored."
          />
        </section>
      </div>
    </section>
  );
}

function ProposedDossierPreview({
  form,
}: {
  form: DraftForm;
  candidate?: DossierCandidate;
}) {
  const role = sanitizeDossierPublicCopy(form.role);
  const summary = sanitizeDossierPublicCopy(form.summary);
  const notes = sanitizeDossierPublicCopy(form.notes);
  const primaryLinkLabel = sanitizeDossierPublicCopy(form.primaryLinkLabel);
  const tags = lines(form.tags).map(sanitizeDossierPublicCopy).filter(Boolean);
  const proposedTags = lines(form.proposedTags)
    .map(sanitizeDossierPublicCopy)
    .filter(Boolean);
  const previewDraft = {
    id: "draft-preview",
    fields: {
      id: "DRAFT-PREVIEW",
      name: sanitizeDossierPublicCopy(form.name) || "Proposed dossier",
      category: form.category || "Entity",
      status: form.status || "PENDING",
      clearance: form.clearance || "PUBLIC",
      origin: form.origin || "UNVERIFIED",
      role: role || DOSSIER_PUBLIC_ROLE_PLACEHOLDER,
      summary: summary || DOSSIER_PUBLIC_SUMMARY_PLACEHOLDER,
      notes,
      tags,
      proposedTags,
      primaryLink: form.primaryLinkUrl
        ? {
            label: primaryLinkLabel || "Featured link",
            url: form.primaryLinkUrl,
            type: form.primaryLinkType || "website",
            selectedBy: form.selectedBy,
            publicSafe: true,
          }
        : undefined,
      files: [],
    },
  } as Pick<DossierDraft, "id" | "fields">;
  const dossier = draftToDossierPreviewViewModel(previewDraft);
  return (
    <section className="border border-border bg-surface space-y-4 overflow-hidden">
      <div className="p-5 pb-0">
        <p className="text-xs uppercase tracking-[0.4em] text-muted mb-2">
          Public Dossier Preview
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Proposed Dossier Preview / Shared public-style preview
        </h2>
        <p className="text-sm text-muted">
          This uses the shared DossierPageView surface so admins review the same
          shape a public dossier uses later. Dirty backend/source text is
          stripped for preview safety and remains blocked before owner review.
        </p>
      </div>
      <DossierPageView dossier={dossier} />
    </section>
  );
}

export default function DossierDraftEditorPage() {
  const params = useParams();
  const draftId = routeParam(params?.draftId);
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [form, setForm] = useState<DraftForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
      const data = (await response.json()) as WorkflowPayload;
      setPayload(data);
      const draft = data.drafts.find((item) => item.id === draftId);
      if (draft) setForm(draftFormFromDraft(draft));
    },
    [draftId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow()
        .catch((err) =>
          setError(
            err instanceof Error ? err.message : "Failed to load draft.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkflow]);

  const draft = useMemo(
    () => payload?.drafts.find((item) => item.id === draftId) ?? null,
    [payload?.drafts, draftId],
  );
  const candidate = useMemo(
    () =>
      payload?.candidates.find((item) => item.id === draft?.candidateId) ??
      null,
    [payload?.candidates, draft?.candidateId],
  );
  const masterDraft = draft?.mergedIntoDraftId
    ? payload?.drafts.find((item) => item.id === draft.mergedIntoDraftId)
    : null;
  const isEditable = Boolean(
    draft && !nonEditableDraftStatuses.has(draft.status),
  );
  const currentPhase =
    draft?.status === "ready_for_owner_review"
      ? 4
      : draft?.status === "owner_approved" || draft?.status === "published"
        ? 5
        : confirming
          ? 3
          : 2;
  const activeSourceNotes = [...(candidate?.sourceFileNotes ?? [])]
    .filter((note) => note.status === "active")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unappliedSourceNotes = draft
    ? getUnappliedSourceNotes({ candidate: candidate ?? {}, draft })
    : [];
  const sourceNoteCount = candidate?.sourceFileNotes?.length ?? 0;
  const blueprint = candidate
    ? createDossierDraftBlueprint({ candidate, recommendations: [], publicDossiers: [] })
    : null;
  const stylePacket = useMemo(() => buildDossierStylePacket(), []);
  const sourceFileSummary = candidate
    ? createDossierSourceFileSummary({
        candidate,
        drafts: payload?.drafts.filter((item) => item.candidateId === candidate.id) ?? [],
      })
    : null;
  const publicCopyWarnings = form
    ? validateDossierPublicDraftFields(draftFieldsForPublicGuard(form))
    : [];
  const sourceMaterialNeedsPublicCopy = Boolean(
    form &&
      (!form.summary.trim() ||
        !form.role.trim() ||
        isDossierPublicCopyPlaceholder(form.summary) ||
        isDossierPublicCopyPlaceholder(form.role) ||
        sourceFileSummary?.substanceLevel === "thin"),
  );
  const publicCopyIsDirty =
    publicCopyWarnings.length > 0 || sourceMaterialNeedsPublicCopy;

  function draftFieldsFromForm() {
    if (!form) return {};
    return {
      name: form.name,
      category: form.category,
      kind: form.kind || undefined,
      ecosystemLane: form.ecosystemLane || undefined,
      identityAuthority: form.identityAuthority || undefined,
      status: form.status,
      clearance: form.clearance,
      origin: form.origin,
      role: form.role,
      summary: form.summary,
      notes: form.notes,
      tags: lines(form.tags),
      proposedTags: lines(form.proposedTags),
      primaryLink: form.primaryLinkUrl
        ? {
            label: form.primaryLinkLabel || form.name,
            url: form.primaryLinkUrl,
            type: form.primaryLinkType || "website",
            selectedBy: form.selectedBy,
          }
        : undefined,
    };
  }

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

  async function saveDraft(event?: FormEvent) {
    event?.preventDefault();
    if (!draft || !isEditable) return;
    try {
      await postWorkflow({
        action: "saveDraft",
        draftId: draft.id,
        fields: draftFieldsFromForm(),
      });
      setNotice("Draft saved. Saving does not publish.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to save draft.");
    }
  }

  async function completeAdminDraft() {
    if (!draft || !isEditable) return;
    if (publicCopyIsDirty) {
      setNotice("Clean draft public copy before final admin review.");
      return;
    }
    await saveDraft();
    setConfirming(true);
    setNotice(
      "Final Admin Draft ready for review. Sending to owner does not publish.",
    );
  }

  async function sendToOwnerReview() {
    if (!draft || !isEditable) return;
    if (publicCopyIsDirty) {
      setNotice("Clean draft public copy before sending to Owner Review.");
      return;
    }
    try {
      await saveDraft();
      await postWorkflow({
        action: "submitDraftForOwnerReview",
        draftId: draft.id,
      });
      setSubmitted(true);
      setConfirming(false);
      setNotice("Sent to Owner Review. Waiting for owner final pass.");
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to send to owner review.",
      );
    }
  }

  if (loading)
    return (
      <MinimalState
        title="Checking admin access..."
        message="Loading Proposed Dossier + BNL Edit Chat."
      />
    );
  if (error === "Admin authentication required")
    return (
      <MinimalState
        title="Admin authentication required"
        message="Sign in through /admin before opening this proposed dossier."
      />
    );
  if (error)
    return (
      <MinimalState
        title="Proposed Dossier + BNL Edit Chat unavailable"
        message={error}
      />
    );
  if (!draft || !form)
    return (
      <MinimalState
        title="Draft not found"
        message="That workflow draft does not exist or is no longer available."
      />
    );

  if (submitted) {
    return (
      <main className="pt-14 min-h-screen bg-background">
        <section className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
          <div className="border border-accent/60 bg-accent/10 p-8 text-sm text-accent space-y-4">
            <p className="text-xs uppercase tracking-[0.5em]">
              Phase 4 — Owner Review
            </p>
            <h1 className="text-3xl font-bold">Sent to Owner Review</h1>
            <p>Waiting for owner final pass.</p>
            <p>
              Admins can still add extra info from the BNL Source File. That
              addendum will not overwrite submitted draft fields.
            </p>
            <p>
              Sending to Owner Review does not publish, invoke BNL, or create
              tags.
            </p>
            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-widest">
              <Link
                href="/admin/dossiers"
                className="border border-accent px-5 py-3 text-accent hover:bg-accent hover:text-background"
              >
                Back to Dossier Dashboard
              </Link>
              <Link
                href={`/admin/dossiers/candidates/${draft.candidateId}`}
                className="border border-border px-5 py-3 text-accent hover:border-accent"
              >
                Open BNL Source File
              </Link>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (confirming) {
    return (
      <main className="pt-14 min-h-screen bg-background">
        <section className="border-b border-border bg-surface/80">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-4">
            <p className="text-xs uppercase tracking-[0.5em] text-muted">
              Phase 3
            </p>
            <h1 className="text-4xl font-bold text-foreground">
              Final Admin Draft
            </h1>
            <PhaseRail currentPhase={3} />
            <p className="text-sm text-muted">
              Review the completed admin draft before sending it to Owner
              Review. This will go to Owner Review, not the public site. Sending
              to owner does not publish.
            </p>
            {notice && (
              <p className="border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
                {notice}
              </p>
            )}
          </div>
        </section>
        <section className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-5">
          <section className="border border-border bg-surface p-5 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-muted mb-2">
                  Phase 1 context
                </p>
                <h2 className="text-2xl font-bold text-foreground">
                  BNL Source File Notes
                </h2>
                <p className="text-sm text-muted">
                  {activeSourceNotes.length} active source note(s). These are
                  context only and do not auto-merge into draft fields.
                </p>
              </div>
              <Link
                href={`/admin/dossiers/candidates/${draft.candidateId}#add-info`}
                className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
              >
                Back to source file
              </Link>
            </div>
            {activeSourceNotes.length === 0 ? (
              <p className="text-sm text-muted border border-border/70 bg-background/30 p-3">
                No active BNL Source File Notes yet.
              </p>
            ) : (
              <div className="space-y-2">
                {activeSourceNotes.slice(0, 5).map((note) => (
                  <article
                    key={note.id}
                    className="border border-border/70 bg-background/20 p-3 text-sm text-muted"
                  >
                    <p className="text-foreground font-semibold">
                      {note.type} / {note.source}
                    </p>
                    <p className="whitespace-pre-wrap">{note.text}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="border border-border bg-surface p-5 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-muted mb-2">
                  Phase 1 context
                </p>
                <h2 className="text-2xl font-bold text-foreground">
                  BNL Source File Notes
                </h2>
                <p className="text-sm text-muted">
                  {activeSourceNotes.length} active source note(s). These are
                  context only and do not auto-merge into draft fields.
                </p>
              </div>
              <Link
                href={`/admin/dossiers/candidates/${draft.candidateId}#add-info`}
                className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
              >
                Back to source file
              </Link>
            </div>
            {activeSourceNotes.length === 0 ? (
              <p className="text-sm text-muted border border-border/70 bg-background/30 p-3">
                No active BNL Source File Notes yet.
              </p>
            ) : (
              <div className="space-y-2">
                {activeSourceNotes.slice(0, 5).map((note) => (
                  <article
                    key={note.id}
                    className="border border-border/70 bg-background/20 p-3 text-sm text-muted"
                  >
                    <p className="text-foreground font-semibold">
                      {note.type} / {note.source}
                    </p>
                    <p className="whitespace-pre-wrap">{note.text}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="border border-border bg-surface p-5 text-sm text-muted">
            <h2 className="text-2xl font-bold text-foreground">
              Final Admin Draft Checks
            </h2>
            <p>
              Taxonomy: {form.category || "—"} / {form.kind || "—"} /{" "}
              {form.ecosystemLane || "—"} / {form.identityAuthority || "—"}
            </p>
            <p>Tags: {lines(form.tags).join(", ") || "—"}</p>
            <p>
              Warnings: source/caveat warnings and missing info are listed in
              the preview above if present.
            </p>
          </section>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <button
              type="button"
              onClick={() => void sendToOwnerReview()}
              disabled={saving || !isEditable || publicCopyIsDirty}
              className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              Send to Owner Review
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Return to Editing
            </button>
            <Link
              href="/admin/dossiers"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Back to Dashboard
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            Phase 2
          </p>
          <h1 className="text-4xl font-bold text-foreground">
            Proposed Dossier + BNL Edit Chat
          </h1>
          <p className="text-sm text-muted mt-3">
            Subject: {candidate?.name ?? draft.candidateId} / Draft status:{" "}
            {draft.status}
          </p>
          {draft.status === "superseded" && (
            <p className="text-sm text-accent mt-2">
              Superseded by{" "}
              {masterDraft ? (
                <Link
                  href={`/admin/dossiers/drafts/${masterDraft.id}`}
                  className="underline"
                >
                  {masterDraft.fields.name}
                </Link>
              ) : (
                (draft.mergedIntoDraftId ?? "master draft")
              )}
              . Draft is superseded. Superseded drafts are not presented as
              normal editable work.
            </p>
          )}
          {draft.status === "denied" && (
            <p className="text-sm text-accent mt-2">
              Denied draft. Reopen actions are not part of this PR.
            </p>
          )}
          {draft.status === "ready_for_owner_review" && (
            <p className="text-sm text-accent mt-2">
              Already submitted to Owner Review. This draft is waiting for owner
              final pass and is not normal active editing.
            </p>
          )}
          {draft.status === "published" && (
            <p className="text-sm text-accent mt-2">
              Publishing not built yet. Published remains
              future/placeholder-only in this workflow.
            </p>
          )}
          <p className="text-sm text-muted mt-2 max-w-4xl">
            This is the curated public-facing draft. It should be
            generated/written from reviewed BNL Source File material, not copied
            wholesale from the internal working case file. The source file may
            contain unverified, internal, conflicting, source-blind, or
            private-review material; this page contains only the curated draft
            that may become public after owner review.
          </p>
          <p className="text-sm text-muted mt-2 max-w-4xl">
            BNL will eventually generate the proposed dossier from the BNL Source File and approved sources; when connected, BNL authors generated proposed dossier drafts from the Source File packet. The site owns packet construction, validation, storage, editing, and review gates; manual drafts remain placeholder scaffolds. BNL should ask only for missing specifics. Draft fields are not mutated automatically when new source notes arrive.
          </p>
          <div className="mt-4">
            <PhaseRail currentPhase={currentPhase} />
            {/* BNL Source File Summary / Source File Summary */}
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href={`/admin/dossiers/candidates/${draft.candidateId}`}
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Back to BNL Source File
            </Link>
            <Link
              href="/admin/dossiers"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Back to Dossier Dashboard
            </Link>
            {notice && (
              <span className="border border-accent/60 bg-accent/10 px-4 py-2 text-accent">
                {notice}
              </span>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {sourceFileSummary && (
          <DossierSourceFileSummaryPanel
            summary={sourceFileSummary}
            subjectName={candidate?.name}
            sourceFileNotes={candidate?.sourceFileNotes ?? []}
            latestSourceFileArchive={candidate?.latestSourceFileArchive}
            currentLane={candidate?.status}
            sourceFileTargetStatus="proposed dossier source"
            blueprint={blueprint ?? undefined}
          />
        )}
        {!sourceFileSummary && (
          <section className="border border-border bg-surface p-5 text-sm text-muted">
            <h2 className="text-2xl font-bold text-foreground">
              Source Summary / Case File Snapshot
            </h2>
            <p>No source file could be loaded for this draft.</p>
          </section>
        )}

        {blueprint && (
          <details className="border border-border bg-surface p-5 text-sm text-muted">
            <summary className="cursor-pointer text-xl font-bold text-foreground">
              Draft Contract / Style Reference — admin-only
            </summary>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <section className="border border-border/60 bg-background/30 p-3">
                <h3 className="font-bold text-foreground">Structured contract</h3>
                <p>{DOSSIER_DRAFT_CONTRACT_REQUIRED_FIELDS.length} required fields. Future BNL output must return fields, not a blob.</p>
              </section>
              <section className="border border-border/60 bg-background/30 p-3">
                <h3 className="font-bold text-foreground">Style packet</h3>
                <p>{stylePacket.representativePublicDossierExamples.length} representative public examples loaded from site content.</p>
              </section>
              <section className="border border-border/60 bg-background/30 p-3">
                <h3 className="font-bold text-foreground">Review boundary</h3>
                <p>Owner Review remains required; style data is not public dossier text.</p>
              </section>
            </div>
            <details className="mt-4 border border-border/60 bg-background/20 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-foreground">Collapsed style packet boundaries</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {[...stylePacket.publicSafetyRules, ...stylePacket.sourceBoundaryRules].map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </details>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="border border-border/60 bg-background/30 p-3">
                <h3 className="font-bold text-foreground">Classification</h3>
                <p>{blueprint.classification.category} / {blueprint.classification.kind} / {blueprint.classification.ecosystemLane}</p>
                <p>Identity authority: {blueprint.classification.identityAuthority}</p>
                <p>Confidence: {blueprint.classification.confidence}</p>
              </section>
              <section className="border border-border/60 bg-background/30 p-3">
                <h3 className="font-bold text-foreground">Readiness</h3>
                <p>{blueprint.readiness.label} ({blueprint.readiness.score}/100)</p>
                <p>{blueprint.readiness.recommendedNextAction}</p>
              </section>
            </div>
            <p className="mt-3 text-xs uppercase tracking-widest text-accent">
              Blueprint material is not public dossier prose and is not displayed in the public preview text fields.
            </p>
          </details>
        )}
        <details className="border border-border bg-surface p-5 text-sm text-muted">
          <summary className="cursor-pointer text-xl font-bold text-foreground">
            Developer / Raw Source Audit — internal debugging only
          </summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <section>
              <h3 className="font-bold text-foreground">Source file identifiers</h3>
              <p>Candidate: {candidate?.name ?? draft.candidateId}</p>
              <p>Status: {candidate?.status ?? "—"}</p>
              <p>Source: {candidate?.source ?? "—"}</p>
              <p>Tier/score: {candidate ? `${candidate.tier} / ${candidate.score}` : "—"}</p>
              <p>Duplicate risk: {candidate?.duplicateRisk ?? "none"}</p>
              <p>Source notes: {sourceNoteCount}</p>
              <p>Unapplied source notes: {unappliedSourceNotes.length}</p>
            </section>
            <section>
              <h3 className="font-bold text-foreground">Raw source fields</h3>
              <p className="whitespace-pre-wrap">Reason: {candidate?.reason || "—"}</p>
              <p className="whitespace-pre-wrap">Why now: {candidate?.whyNow || "—"}</p>
              <p className="whitespace-pre-wrap">Evidence summary: {candidate?.evidenceSummary || "—"}</p>
              <p>Known facts: {(candidate?.knownFacts ?? []).join(", ") || "—"}</p>
              <p>Missing info: {(candidate?.missingInfo ?? []).join(", ") || "—"}</p>
              <p>Do-not-say: {(candidate?.doNotSay ?? []).join(", ") || "—"}</p>
              <p>Public safety notes: {(candidate?.publicSafetyNotes ?? []).join(", ") || "—"}</p>
            </section>
          </div>
          <Link
            href={`/admin/dossiers/candidates/${draft.candidateId}`}
            className="mt-4 inline-flex text-accent hover:underline"
          >
            Open full BNL Source File
          </Link>
        </details>
        <form onSubmit={saveDraft} className="space-y-5">
          <section className="border border-border bg-surface p-5 space-y-3 text-sm text-muted">
            <h2 className="text-2xl font-bold text-foreground">
              Unapplied Source Notes
            </h2>
            {unappliedSourceNotes.length > 0 ? (
              <>
                <p className="border border-accent/60 bg-accent/10 p-3 text-accent">
                  BNL Source File has new notes since this Proposed Dossier was last
                  updated.
                </p>
                <div className="space-y-3">
                  {unappliedSourceNotes.slice(0, 6).map((note) => (
                    <article
                      key={note.id}
                      className="border border-border/70 bg-background/20 p-3"
                    >
                      <p className="font-semibold text-foreground">
                        {note.type} / {new Date(note.createdAt).toLocaleString()}
                      </p>
                      <p className="whitespace-pre-wrap">
                        {sanitizeDossierPublicCopy(note.text) ||
                          "This source note needs meaning-first interpretation before it can inform public copy."}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p>No unapplied source notes. Proposed Dossier fields are unchanged unless an admin saves edits here.</p>
            )}
            <p>
              BNL Edit Chat will eventually help rewrite source material into
              clean, public-safe dossier copy. It must not apply raw notes or
              backend metadata directly to draft fields. Do not auto-apply notes to draft fields.
            </p>
          </section>

          <section className="border border-accent/60 bg-accent/10 p-5 text-sm text-accent space-y-3">
            <h2 className="text-2xl font-bold">
              BNL Edit Chat panel — Coming Next
            </h2>
            <p>
              BNL edit chat comes next. This panel will help rewrite reviewed
              source material into clean, public-safe dossier copy and revise the proposed dossier conversationally instead of
              applying raw source notes directly.
            </p>
            <p>
              This is the intended main editing flow. Example future prompts:
              “Make this more in-universe.” “Remove that detail.” “Use this
              chosen link.” “Ask me what you still need.” “Make this match the
              other collaborator dossiers.”
            </p>
            <p>
              Future BNL source packet: BNL Source File, website read model,
              dossier taxonomy guide, authoring guide, tag registry,
              queue/public show context, broadcast memory references,
              R&amp;D/operator-approved notes, Discord-safe/mod-approved
              context, duplicate/merge history, and existing dossier style
              profile.
            </p>
            <p>
              Future BNL output: complete proposed dossier, tags, taxonomy,
              warnings, missing info questions, and public-safety caveats. BNL
              must not invent facts, must ask only for missing specifics,
              preserve dossier tone, keep community-owned identities separate
              from BARCODE-controlled characters, and treat AI/human/unknown as
              tags/traits, not primary organization.
            </p>
            <textarea
              disabled
              placeholder="BNL edit chat is not wired yet."
              className={`${inputClass()} min-h-24`}
            />
          </section>
          <PublicCopyGuardWarning warnings={publicCopyWarnings} />
          <ThinSourcePublicCopyWarning show={sourceMaterialNeedsPublicCopy} />
          <ProposedDossierPreview
            form={form}
            candidate={candidate ?? undefined}
          />
          <BnlDraftProvenancePanel draft={draft} />
          <details className="border border-border bg-surface p-5 space-y-4">
            <summary className="cursor-pointer text-xl font-bold text-foreground">
              Open Advanced Manual Edit — Manual Override
            </summary>
            <p className="text-sm text-muted mt-3">
              Advanced Manual Edit is fallback/manual override. Manual fields
              are fallback/advanced and are not the intended main Phase 2
              workflow.
            </p>
            <p className="text-sm text-muted">
              Field guidance: role: short phrase; summary: compact dossier
              paragraph; notes: optional operational/context note; tags: use
              existing tags first; proposed tags: proposal-only, not automatic
              creation. Exact character limits will be enforced in a later PR.
            </p>
            {!isEditable && (
              <p className="border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
                This draft is {draft.status}; it is shown for reference, not
                normal editing.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs uppercase tracking-widest text-muted">
              {[
                ["name", "Name"],
                ["role", "Role"],
                ["summary", "Summary"],
                ["notes", "Notes"],
                ["tags", "Tags, one per line"],
                ["proposedTags", "Proposed tags, one per line"],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className={`${["summary", "notes", "tags", "proposedTags"].includes(key) ? "md:col-span-2" : ""} space-y-2`}
                >
                  <span>{label}</span>
                  {["summary", "notes", "tags", "proposedTags"].includes(
                    key,
                  ) ? (
                    <textarea
                      disabled={!isEditable}
                      value={String(form[key as keyof DraftForm])}
                      onChange={(event) =>
                        setForm({ ...form, [key]: event.target.value })
                      }
                      className={`${inputClass()} min-h-24`}
                    />
                  ) : (
                    <input
                      disabled={!isEditable}
                      value={String(form[key as keyof DraftForm])}
                      onChange={(event) =>
                        setForm({ ...form, [key]: event.target.value })
                      }
                      className={inputClass()}
                    />
                  )}
                </label>
              ))}
              <label className="space-y-2">
                <span>Category</span>
                <select
                  disabled={!isEditable}
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  className={inputClass()}
                >
                  {categoryOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Kind</span>
                <select
                  disabled={!isEditable}
                  value={form.kind}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      kind: event.target.value as DraftForm["kind"],
                    })
                  }
                  className={inputClass()}
                >
                  {kindOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Ecosystem lane</span>
                <select
                  disabled={!isEditable}
                  value={form.ecosystemLane}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      ecosystemLane: event.target
                        .value as DraftForm["ecosystemLane"],
                    })
                  }
                  className={inputClass()}
                >
                  {ecosystemLaneOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Identity authority</span>
                <select
                  disabled={!isEditable}
                  value={form.identityAuthority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      identityAuthority: event.target
                        .value as DraftForm["identityAuthority"],
                    })
                  }
                  className={inputClass()}
                >
                  {identityAuthorityOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Status</span>
                <select
                  disabled={!isEditable}
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                  className={inputClass()}
                >
                  {statusOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Clearance</span>
                <select
                  disabled={!isEditable}
                  value={form.clearance}
                  onChange={(event) =>
                    setForm({ ...form, clearance: event.target.value })
                  }
                  className={inputClass()}
                >
                  {clearanceOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>Origin</span>
                <select
                  disabled={!isEditable}
                  value={form.origin}
                  onChange={(event) =>
                    setForm({ ...form, origin: event.target.value })
                  }
                  className={inputClass()}
                >
                  {originOptions.map((value) => (
                    <option key={value} value={value}>
                      {value || "No value"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span>selectedBy</span>
                <select
                  disabled={!isEditable}
                  value={form.selectedBy}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      selectedBy: event.target.value as DraftForm["selectedBy"],
                    })
                  }
                  className={inputClass()}
                >
                  <option>operator</option>
                  <option>subject</option>
                  <option>legacy</option>
                </select>
              </label>
              <label className="space-y-2">
                <span>Primary link label</span>
                <input
                  disabled={!isEditable}
                  value={form.primaryLinkLabel}
                  onChange={(event) =>
                    setForm({ ...form, primaryLinkLabel: event.target.value })
                  }
                  className={inputClass()}
                />
              </label>
              <label className="space-y-2">
                <span>Primary link URL</span>
                <input
                  disabled={!isEditable}
                  value={form.primaryLinkUrl}
                  onChange={(event) =>
                    setForm({ ...form, primaryLinkUrl: event.target.value })
                  }
                  className={inputClass()}
                />
              </label>
              <label className="space-y-2">
                <span>Primary link type</span>
                <input
                  disabled={!isEditable}
                  value={form.primaryLinkType}
                  onChange={(event) =>
                    setForm({ ...form, primaryLinkType: event.target.value })
                  }
                  className={inputClass()}
                />
              </label>
            </div>
          </details>
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving || !isEditable}
              className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              Save Proposed Dossier
            </button>
            <button
              type="button"
              onClick={() => void completeAdminDraft()}
              disabled={saving || !isEditable || publicCopyIsDirty}
              className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              Complete Proposed Dossier
            </button>
            <Link
              href={`/admin/dossiers/candidates/${draft.candidateId}`}
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent"
            >
              Back to BNL Source File
            </Link>
            <Link
              href="/admin/dossiers"
              className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent"
            >
              Back to Dossier Dashboard
            </Link>
          </div>
          <p className="text-xs text-muted">
            Owner approval remains disabled/placeholder-only. No BNL invocation,
            publishing, tag creation, or src/content.ts mutation occurs here.
          </p>
        </form>
      </section>
    </main>
  );
}
