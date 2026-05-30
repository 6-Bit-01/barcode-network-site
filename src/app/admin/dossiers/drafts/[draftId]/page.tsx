"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  DossierCandidate,
  DossierDraft,
  DossierDuplicateGroup,
} from "@/lib/dossier-workflow";
import {
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

const categoryOptions = [
  "",
  "Entity",
  "Personnel",
  "Sponsor",
  "Interface",
  "Production",
];
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

const draftEditorTestCopy = [
  "BNL edit chat comes next",
  "revise the proposed dossier conversationally",
  "BNL will eventually generate the proposed dossier from the BNL Source File and approved sources",
  "BNL should ask only for missing specifics",
  "Saving does not publish.",
  "This page shows the proposed completed dossier built from the BNL Source File",
];
void draftEditorTestCopy;

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

function ProposedDossierPreview({
  form,
  candidate,
}: {
  form: DraftForm;
  candidate?: DossierCandidate;
}) {
  const tags = lines(form.tags);
  const proposedTags = lines(form.proposedTags);
  return (
    <section className="border border-border bg-surface p-5 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.4em] text-muted mb-2">
          Phase 2
        </p>
        <h2 className="text-2xl font-bold text-foreground">
          Proposed Dossier Preview
        </h2>
        <p className="text-sm text-muted">
          This is the readable proposed completed dossier. It is not public and
          does not publish.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted">
        <p>
          <span className="text-foreground">Name:</span> {form.name || "—"}
        </p>
        <p>
          <span className="text-foreground">Category:</span>{" "}
          {form.category || "—"}
        </p>
        <p>
          <span className="text-foreground">Kind:</span> {form.kind || "—"}
        </p>
        <p>
          <span className="text-foreground">Ecosystem lane:</span>{" "}
          {form.ecosystemLane || "—"}
        </p>
        <p>
          <span className="text-foreground">Identity authority:</span>{" "}
          {form.identityAuthority || "—"}
        </p>
        <p>
          <span className="text-foreground">Status:</span> {form.status || "—"}
        </p>
        <p>
          <span className="text-foreground">Clearance:</span>{" "}
          {form.clearance || "—"}
        </p>
        <p>
          <span className="text-foreground">Origin:</span> {form.origin || "—"}
        </p>
        <p className="md:col-span-2">
          <span className="text-foreground">Role:</span> {form.role || "—"}
        </p>
        <p className="md:col-span-2">
          <span className="text-foreground">Summary:</span>{" "}
          {form.summary || "—"}
        </p>
        <p className="md:col-span-2">
          <span className="text-foreground">Notes:</span> {form.notes || "—"}
        </p>
        <p className="md:col-span-2">
          <span className="text-foreground">Tags:</span>{" "}
          {tags.join(", ") || "—"}
        </p>
        <p className="md:col-span-2">
          <span className="text-foreground">Proposed tags:</span>{" "}
          {proposedTags.join(", ") || "—"}
        </p>
        <p className="md:col-span-2">
          <span className="text-foreground">Primary link:</span>{" "}
          {form.primaryLinkUrl
            ? `${form.primaryLinkLabel || "Link"}: ${form.primaryLinkUrl} (${form.primaryLinkType || "website"})`
            : "—"}
        </p>
      </div>
      <div className="border border-accent/50 bg-accent/10 p-3 text-sm text-accent">
        <p>Warnings / missing info / caveats:</p>
        {list(
          [
            ...(candidate?.missingInfo ?? []),
            ...(candidate?.publicSafetyNotes ?? []),
          ],
          "No source caveats recorded yet.",
        )}
      </div>
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
    await saveDraft();
    setConfirming(true);
    setNotice(
      "Final Admin Draft ready for review. Sending to owner does not publish.",
    );
  }

  async function sendToOwnerReview() {
    if (!draft || !isEditable) return;
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
          <ProposedDossierPreview
            form={form}
            candidate={candidate ?? undefined}
          />
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
              disabled={saving || !isEditable}
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
          <p className="text-sm text-muted mt-2">
            This page shows the proposed completed dossier built from the BNL
            Source File. Admins will guide BNL conversationally here. Manual
            editing is fallback only.
          </p>
          <p className="text-sm text-muted mt-2">
            BNL will eventually generate the proposed dossier from the BNL
            Source File and approved sources. Admins will direct changes
            conversationally. BNL should ask only for missing specifics.
          </p>
          <div className="mt-4">
            <PhaseRail currentPhase={currentPhase} />
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
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-[0.85fr_1.15fr] gap-6">
        <aside className="border border-border bg-surface p-5 space-y-4">
          <h2 className="text-2xl font-bold text-foreground">
            BNL Source File
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted">
            <p>
              <span className="text-foreground">Candidate name:</span>{" "}
              {candidate?.name ?? "—"}
            </p>
            <p>
              <span className="text-foreground">Status:</span>{" "}
              {candidate?.status ?? "—"}
            </p>
            <p>
              <span className="text-foreground">Source:</span>{" "}
              {candidate?.source ?? "—"}
            </p>
            <p>
              <span className="text-foreground">Tier/score:</span>{" "}
              {candidate ? `${candidate.tier} / ${candidate.score}` : "—"}
            </p>
            <p>
              <span className="text-foreground">Duplicate risk:</span>{" "}
              {candidate?.duplicateRisk ?? "none"}
            </p>
            <p>
              <span className="text-foreground">
                Existing published dossier match:
              </span>{" "}
              {candidate?.existingDossierMatch?.name ?? "—"}
            </p>
          </div>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Reason</h3>
            <p>{candidate?.reason || "—"}</p>
          </section>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Why now</h3>
            <p>{candidate?.whyNow || "—"}</p>
          </section>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Evidence summary</h3>
            <p>{candidate?.evidenceSummary || "—"}</p>
          </section>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Known facts</h3>
            {list(candidate?.knownFacts)}
          </section>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Missing info</h3>
            {list(candidate?.missingInfo)}
          </section>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Do-not-say</h3>
            {list(candidate?.doNotSay)}
          </section>
          <section className="text-sm text-muted">
            <h3 className="font-bold text-foreground">Public safety notes</h3>
            {list(candidate?.publicSafetyNotes)}
          </section>
        </aside>
        <form onSubmit={saveDraft} className="space-y-5">
          <ProposedDossierPreview
            form={form}
            candidate={candidate ?? undefined}
          />
          <section className="border border-accent/60 bg-accent/10 p-5 text-sm text-accent space-y-3">
            <h2 className="text-2xl font-bold">
              BNL Edit Chat panel — Coming Next
            </h2>
            <p>
              BNL edit chat comes next. This will let admins ask BNL to revise
              the proposed dossier conversationally.
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
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => void completeAdminDraft()}
              disabled={saving || !isEditable}
              className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
            >
              Complete Admin Draft
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
