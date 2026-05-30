"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  DossierCandidate,
  DossierDraft,
  DossierDuplicateGroup,
  DossierSourceFileNoteType,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  workflow: { status: string };
};

type SourceNoteForm = {
  type: DossierSourceFileNoteType;
  text: string;
  publicSafe: boolean;
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
            Source File ID: {candidate.id}. This page collects what BNL knows
            and what mods/admins add as source material, not the public dossier.
            Internal workflow only; notes do not publish, create tags, or mutate
            public records.
          </p>
          <div className="mt-4">
            <PhaseRail />
          </div>
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
                Create / Open Proposed Dossier
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
        <section
          id="add-info"
          className="border border-border bg-surface p-5 space-y-3"
        >
          <h2 className="text-2xl font-bold text-foreground">
            Add to BNL Source File
          </h2>
          <p className="text-sm text-muted">
            This adds source material for BNL. It does not directly edit the
            proposed dossier.
          </p>
          <p className="text-sm text-muted">
            Add to BNL Source File = add knowledge/context for BNL. BNL Edit
            Chat = tell BNL how to revise the proposed dossier. Advanced Manual
            Edit = fallback direct editing of the proposed dossier fields.
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
                Additional Info Added After Submission / Admin Addendum
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

        <Section title="BNL Source File Notes">
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
          <Section title="Known facts">{list(candidate.knownFacts)}</Section>
          <Section title="Corrections / extra notes">
            <p>Saved notes now live in BNL Source File Notes above.</p>
          </Section>
          <Section title="Missing info">{list(candidate.missingInfo)}</Section>
          <Section title="Do-not-say">{list(candidate.doNotSay)}</Section>
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
          <Section title="Active owner review state">
            <p>
              {hasOwnerReviewDraft
                ? "Submitted draft waiting for owner review. Additional source notes become an Admin Addendum and do not overwrite the submitted draft."
                : "No submitted owner-review draft."}
            </p>
          </Section>
          <Section title="Duplicate warnings">
            <p>{candidate.duplicateRisk ?? "none"}</p>
            <p>
              Existing published dossier match:{" "}
              {candidate.existingDossierMatch?.name ?? "—"}
            </p>
          </Section>
          <Section title="Linked drafts">
            {linkedDrafts.length ? (
              linkedDrafts.map((draft) => (
                <p key={draft.id}>
                  {draft.status === "superseded" ? "Superseded by " : ""}
                  <Link
                    href={`/admin/dossiers/drafts/${draft.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {draft.fields.name}
                  </Link>{" "}
                  — {draft.status}
                </p>
              ))
            ) : (
              <p>—</p>
            )}
          </Section>
        </section>
      </section>
    </main>
  );
}
