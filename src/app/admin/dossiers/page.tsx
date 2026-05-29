/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DOSSIER_CANDIDATE_SCORING_POLICY,
  DOSSIER_SOURCE_BOUNDARIES,
  DOSSIER_WORKFLOW_ACTIONS,
  type DossierCandidate,
  type DossierDraft,
} from "@/lib/dossier-workflow";
import {
  DOSSIER_ECOSYSTEM_LANE_OPTIONS,
  DOSSIER_IDENTITY_AUTHORITY_OPTIONS,
  DOSSIER_KIND_OPTIONS,
} from "@/lib/dossier-taxonomy";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  workflow: {
    status: string;
    storage: string;
    updatedAt?: string;
    boundaries: string[];
    scoringPolicy?: typeof DOSSIER_CANDIDATE_SCORING_POLICY;
    ownerGate?: {
      message: string;
      requiresOwnerSecretFuture: boolean;
      approvalPublishes: boolean;
    };
  };
  ownerReviewQueue?: {
    waitingCount: number;
    draftCount: number;
    candidateCount: number;
  };
  authoringGuide?: {
    version: string;
  };
  tagRegistry?: {
    totalUniqueTags: number;
    totalTagAssignments: number;
  };
};

type DraftForm = {
  name: string;
  category: string;
  kind: string;
  ecosystemLane: string;
  identityAuthority: string;
  status: string;
  clearance: string;
  role: string;
  origin: string;
  summary: string;
  notes: string;
  tags: string;
  proposedTags: string;
  primaryLinkLabel: string;
  primaryLinkUrl: string;
  primaryLinkType: string;
  selectedBy: "operator" | "subject" | "legacy";
};

type ManualCandidateForm = {
  name: string;
  candidateType: DossierCandidate["candidateType"];
  reason: string;
  whyNow: string;
  evidenceSummary: string;
  knownFacts: string;
  missingInfo: string;
  doNotSay: string;
  publicSafetyNotes: string;
  recommendedCategory: string;
  recommendedKind: string;
  recommendedEcosystemLane: string;
  recommendedIdentityAuthority: string;
  recommendedStatus: string;
  recommendedClearance: string;
  recommendedOrigin: string;
  recommendedTags: string;
  proposedTags: string;
  primaryLinkLabel: string;
  primaryLinkUrl: string;
  primaryLinkType: string;
  selectedBy: "operator" | "subject";
};

const emptyDraftForm: DraftForm = {
  name: "",
  category: "",
  kind: "",
  ecosystemLane: "",
  identityAuthority: "",
  status: "",
  clearance: "",
  role: "",
  origin: "",
  summary: "",
  notes: "",
  tags: "",
  proposedTags: "",
  primaryLinkLabel: "",
  primaryLinkUrl: "",
  primaryLinkType: "website",
  selectedBy: "operator",
};

const emptyManualCandidateForm: ManualCandidateForm = {
  name: "",
  candidateType: "unknown",
  reason: "",
  whyNow: "",
  evidenceSummary: "",
  knownFacts: "",
  missingInfo: "",
  doNotSay: "",
  publicSafetyNotes: "",
  recommendedCategory: "",
  recommendedKind: "",
  recommendedEcosystemLane: "",
  recommendedIdentityAuthority: "",
  recommendedStatus: "",
  recommendedClearance: "",
  recommendedOrigin: "",
  recommendedTags: "",
  proposedTags: "",
  primaryLinkLabel: "",
  primaryLinkUrl: "",
  primaryLinkType: "website",
  selectedBy: "operator",
};

const candidateTypes: DossierCandidate["candidateType"][] = [
  "artist",
  "community_member",
  "entity",
  "production",
  "interface",
  "sponsor",
  "story_arc",
  "unknown",
];
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

const reviewActions = [
  "Generate Draft",
  "Try Again: Too Long",
  "Try Again: Too Vague",
  "Try Again: Too Much Lore",
  "Try Again: Too Dry",
  "Try Again: Wrong Tags",
  "Rewrite Summary Only",
  "Rewrite Notes Only",
  "Owner Approve Draft",
  "Owner Request Changes",
  "Owner Deny Draft",
];

const focusedAssistantPrompts = [
  "Why was this recommended?",
  "What evidence is missing?",
  "Suggest safer public version",
  "Suggest stronger in-universe version",
  "Explain tag choices",
];

function MinimalDossierAdminState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="pt-14 min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">
          // ADMIN ACCESS CHECK
        </p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <Link
          href="/admin"
          className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all"
        >
          Back to Admin
        </Link>
      </section>
    </main>
  );
}

function listOrEmpty(items: string[] | undefined, empty: string) {
  if (!items || items.length === 0)
    return <p className="text-muted">{empty}</p>;
  return (
    <ul className="list-disc pl-5 space-y-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function textInputClass() {
  return "w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground";
}

function draftFormFromDraft(draft: DossierDraft | null): DraftForm {
  if (!draft) return emptyDraftForm;
  return {
    name: draft.fields.name ?? "",
    category: draft.fields.category ?? "",
    kind: draft.fields.kind ?? "",
    ecosystemLane: draft.fields.ecosystemLane ?? "",
    identityAuthority: draft.fields.identityAuthority ?? "",
    status: draft.fields.status ?? "",
    clearance: draft.fields.clearance ?? "",
    role: draft.fields.role ?? "",
    origin: draft.fields.origin ?? "",
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

export default function AdminDossiersPage() {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ManualCandidateForm>(
    emptyManualCandidateForm,
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState<DraftForm>(emptyDraftForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadWorkflow() {
    try {
      const response = await fetch("/api/admin/dossiers", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Admin authentication required."
            : `Workflow API returned ${response.status}.`,
        );
      }
      const data = (await response.json()) as WorkflowPayload;
      setPayload(data);
      setSelectedCandidateId((current) =>
        current && data.candidates.some((candidate) => candidate.id === current)
          ? current
          : (data.candidates[0]?.id ?? null),
      );
      setSelectedDraftId((current) => {
        const nextDraft =
          current && data.drafts.some((draft) => draft.id === current)
            ? (data.drafts.find((draft) => draft.id === current) ?? null)
            : (data.drafts[0] ?? null);
        setDraftForm(draftFormFromDraft(nextDraft));
        return nextDraft?.id ?? null;
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dossier workflow.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const candidates = useMemo(
    () => payload?.candidates ?? [],
    [payload?.candidates],
  );
  const drafts = useMemo(() => payload?.drafts ?? [], [payload?.drafts]);
  const boundaries = payload?.workflow.boundaries ?? [];
  const scoringPolicy =
    payload?.workflow.scoringPolicy ?? DOSSIER_CANDIDATE_SCORING_POLICY;
  const selectedCandidate = useMemo(
    () =>
      candidates.find((candidate) => candidate.id === selectedCandidateId) ??
      candidates[0] ??
      null,
    [candidates, selectedCandidateId],
  );
  const selectedDraft = useMemo(
    () =>
      drafts.find((draft) => draft.id === selectedDraftId) ??
      drafts.find((draft) => draft.candidateId === selectedCandidate?.id) ??
      drafts[0] ??
      null,
    [drafts, selectedCandidate?.id, selectedDraftId],
  );
  const selectedDraftCandidate = selectedDraft
    ? (candidates.find(
        (candidate) => candidate.id === selectedDraft.candidateId,
      ) ?? null)
    : null;
  const ownerReviewDrafts = drafts.filter(
    (draft) => draft.status === "ready_for_owner_review",
  );
  const selectedEvidence = selectedCandidate?.evidenceItems ?? [];

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
        missingFields?: string[];
      };
      if (!response.ok) {
        const missing = data.missingFields?.length
          ? ` Missing fields: ${data.missingFields.join(", ")}.`
          : "";
        throw new Error(
          `${data.error ?? data.message ?? `Workflow API returned ${response.status}.`}${missing}`,
        );
      }
      if (data.candidates && data.drafts && data.workflow)
        setPayload(data as WorkflowPayload);
      if (data.candidate) setSelectedCandidateId(data.candidate.id);
      if (data.draft) {
        setSelectedDraftId(data.draft.id);
        setSelectedCandidateId(data.draft.candidateId);
        setDraftForm(draftFormFromDraft(data.draft));
      }
      return data;
    } finally {
      setSaving(false);
    }
  }

  async function submitManualCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const primaryLink = form.primaryLinkUrl.trim()
        ? {
            label: form.primaryLinkLabel.trim() || "Featured link",
            url: form.primaryLinkUrl.trim(),
            type: form.primaryLinkType.trim() || "website",
            selectedBy: form.selectedBy,
            publicSafe: true,
          }
        : undefined;
      const data = await postWorkflow({
        action: "createManualCandidate",
        input: {
          name: form.name,
          candidateType: form.candidateType,
          reason: form.reason,
          whyNow: form.whyNow,
          evidenceSummary: form.evidenceSummary,
          knownFacts: lines(form.knownFacts),
          missingInfo: lines(form.missingInfo),
          doNotSay: lines(form.doNotSay),
          publicSafetyNotes: lines(form.publicSafetyNotes),
          recommendedCategory: form.recommendedCategory || undefined,
          recommendedKind: form.recommendedKind || undefined,
          recommendedEcosystemLane: form.recommendedEcosystemLane || undefined,
          recommendedIdentityAuthority:
            form.recommendedIdentityAuthority || undefined,
          recommendedStatus: form.recommendedStatus || undefined,
          recommendedClearance: form.recommendedClearance || undefined,
          recommendedOrigin: form.recommendedOrigin || undefined,
          recommendedTags: lines(form.recommendedTags),
          proposedTags: lines(form.proposedTags),
          primaryLink,
        },
      });
      setForm(emptyManualCandidateForm);
      setNotice(
        `Manual candidate created: ${data.candidate?.name ?? "candidate"}. No public dossier or tag was created.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to create manual candidate.",
      );
    }
  }

  async function createOrOpenDraft(candidateId: string) {
    const existingDraft = drafts.find(
      (draft) =>
        draft.candidateId === candidateId &&
        draft.status !== "denied" &&
        draft.status !== "published",
    );
    if (existingDraft) {
      setSelectedCandidateId(candidateId);
      setSelectedDraftId(existingDraft.id);
      setDraftForm(draftFormFromDraft(existingDraft));
      setNotice(
        `Opened existing draft for ${existingDraft.fields.name || "candidate"}.`,
      );
      return;
    }

    try {
      const data = await postWorkflow({
        action: "createDraftFromCandidate",
        candidateId,
      });
      setNotice(
        `Draft created: ${data.draft?.fields.name ?? "draft"}. Saving this draft does not publish anything.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to create draft.");
    }
  }

  function draftFieldsFromForm(): DossierDraft["fields"] {
    return {
      name: draftForm.name,
      category: draftForm.category
        ? (draftForm.category as DossierDraft["fields"]["category"])
        : undefined,
      status: draftForm.status
        ? (draftForm.status as DossierDraft["fields"]["status"])
        : undefined,
      clearance: draftForm.clearance
        ? (draftForm.clearance as DossierDraft["fields"]["clearance"])
        : undefined,
      role: draftForm.role,
      origin: draftForm.origin
        ? (draftForm.origin as DossierDraft["fields"]["origin"])
        : undefined,
      summary: draftForm.summary,
      notes: draftForm.notes,
      tags: lines(draftForm.tags),
      proposedTags: lines(draftForm.proposedTags),
      primaryLink: draftForm.primaryLinkUrl.trim()
        ? {
            label: draftForm.primaryLinkLabel.trim() || "Featured link",
            url: draftForm.primaryLinkUrl.trim(),
            type: draftForm.primaryLinkType.trim() || "website",
            selectedBy: draftForm.selectedBy,
            publicSafe: true,
          }
        : undefined,
      files: [],
    };
  }

  async function saveSelectedDraft() {
    if (!selectedDraft) return;
    try {
      const data = await postWorkflow({
        action: "saveDraft",
        draftId: selectedDraft.id,
        fields: draftFieldsFromForm(),
      });
      setNotice(
        `Draft saved: ${data.draft?.fields.name ?? "draft"}. Saving this draft does not publish anything.`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to save draft.");
    }
  }

  async function submitSelectedDraftForOwnerReview() {
    if (!selectedDraft) return;
    try {
      const data = await postWorkflow({
        action: "submitDraftForOwnerReview",
        draftId: selectedDraft.id,
      });
      setNotice(
        `Draft submitted for owner review: ${data.draft?.fields.name ?? "draft"}. Submitting for owner review does not publish anything.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to submit draft for owner review.",
      );
    }
  }

  async function updateCandidateStatus(
    candidateId: string,
    action: "denyCandidate" | "markNeedsMoreEvidence",
  ) {
    try {
      const data = await postWorkflow({ action, candidateId });
      setNotice(
        `${data.candidate?.name ?? "Candidate"} updated to ${data.candidate?.status ?? "requested status"}.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "Failed to update candidate status.",
      );
    }
  }

  if (loading) {
    return (
      <MinimalDossierAdminState
        title="Checking admin access..."
        message="Verifying operator credentials before loading the dossier workflow."
      />
    );
  }

  if (error || !payload) {
    return (
      <MinimalDossierAdminState
        title="Admin authentication required"
        message={
          error ??
          "Sign in from the admin panel before opening this operator workflow."
        }
      />
    );
  }

  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            // ADMIN: DOSSIER WORKFLOW
          </p>
          <h1
            aria-label="Dossier Control Center"
            className="text-4xl font-bold tracking-tight text-foreground"
          >
            <span className="text-accent text-glow">Dossier</span> Control
            Center
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Review why a candidate was recommended, inspect evidence and
            duplicate risk, then classify taxonomy before owner review.
            AI/human/unknown are tags, not the organizing structure.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href="/admin"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all"
            >
              Back to Admin
            </Link>
            <Link
              href="/database"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all"
            >
              Public Database
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs text-muted">
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Workflow API
            </p>
            <p>
              Candidate store enabled. Storage: {payload.workflow.storage}.
              Updated: {payload.workflow.updatedAt ?? "not available"}.
            </p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Authoring Guide
            </p>
            <p>Version: {payload.authoringGuide?.version ?? "unknown"}</p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">
              Tag Registry
            </p>
            <p>
              {payload.tagRegistry
                ? `${payload.tagRegistry.totalUniqueTags} tags / ${payload.tagRegistry.totalTagAssignments} assignments`
                : "No tag registry summary returned."}
            </p>
          </div>
        </div>

        <section className="border border-border bg-surface p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
              Manual Candidate Intake
            </p>
            <h2 className="text-2xl font-bold text-foreground">
              Manual Candidate Intake
            </h2>
            <p className="text-sm text-muted mt-2">
              Create workflow-only candidates. This form does not call BNL,
              publish dossiers, create tags, or write src/content.ts.
              AI/human/unknown are tags, not the organizing structure.
            </p>
          </div>
          <form
            onSubmit={submitManualCandidate}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-xs uppercase tracking-widest text-muted"
          >
            <label className="space-y-2">
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2">
              <span>Candidate type</span>
              <select
                value={form.candidateType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    candidateType: event.target
                      .value as DossierCandidate["candidateType"],
                  })
                }
                className={textInputClass()}
              >
                {candidateTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="xl:col-span-2 space-y-2">
              <span>Reason</span>
              <input
                required
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="md:col-span-2 space-y-2">
              <span>Why now</span>
              <textarea
                value={form.whyNow}
                onChange={(event) =>
                  setForm({ ...form, whyNow: event.target.value })
                }
                className={`${textInputClass()} min-h-24`}
              />
            </label>
            <label className="md:col-span-2 space-y-2">
              <span>Evidence summary</span>
              <textarea
                value={form.evidenceSummary}
                onChange={(event) =>
                  setForm({ ...form, evidenceSummary: event.target.value })
                }
                className={`${textInputClass()} min-h-24`}
              />
            </label>
            <label className="space-y-2">
              <span>Known facts</span>
              <textarea
                placeholder="One per line"
                value={form.knownFacts}
                onChange={(event) =>
                  setForm({ ...form, knownFacts: event.target.value })
                }
                className={`${textInputClass()} min-h-28`}
              />
            </label>
            <label className="space-y-2">
              <span>Missing info</span>
              <textarea
                placeholder="One per line"
                value={form.missingInfo}
                onChange={(event) =>
                  setForm({ ...form, missingInfo: event.target.value })
                }
                className={`${textInputClass()} min-h-28`}
              />
            </label>
            <label className="space-y-2">
              <span>Do Not Say</span>
              <textarea
                placeholder="One per line"
                value={form.doNotSay}
                onChange={(event) =>
                  setForm({ ...form, doNotSay: event.target.value })
                }
                className={`${textInputClass()} min-h-28`}
              />
            </label>
            <label className="space-y-2">
              <span>Public safety notes</span>
              <textarea
                placeholder="One per line"
                value={form.publicSafetyNotes}
                onChange={(event) =>
                  setForm({ ...form, publicSafetyNotes: event.target.value })
                }
                className={`${textInputClass()} min-h-28`}
              />
            </label>
            <label className="space-y-2">
              <span>Recommended category</span>
              <select
                value={form.recommendedCategory}
                onChange={(event) =>
                  setForm({ ...form, recommendedCategory: event.target.value })
                }
                className={textInputClass()}
              >
                {categoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended kind</span>
              <select
                value={form.recommendedKind}
                onChange={(event) =>
                  setForm({ ...form, recommendedKind: event.target.value })
                }
                className={textInputClass()}
              >
                {kindOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended ecosystem lane</span>
              <select
                value={form.recommendedEcosystemLane}
                onChange={(event) =>
                  setForm({
                    ...form,
                    recommendedEcosystemLane: event.target.value,
                  })
                }
                className={textInputClass()}
              >
                {ecosystemLaneOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended identity authority</span>
              <select
                value={form.recommendedIdentityAuthority}
                onChange={(event) =>
                  setForm({
                    ...form,
                    recommendedIdentityAuthority: event.target.value,
                  })
                }
                className={textInputClass()}
              >
                {identityAuthorityOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended status</span>
              <select
                value={form.recommendedStatus}
                onChange={(event) =>
                  setForm({ ...form, recommendedStatus: event.target.value })
                }
                className={textInputClass()}
              >
                {statusOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended clearance</span>
              <select
                value={form.recommendedClearance}
                onChange={(event) =>
                  setForm({ ...form, recommendedClearance: event.target.value })
                }
                className={textInputClass()}
              >
                {clearanceOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span>Recommended origin</span>
              <select
                value={form.recommendedOrigin}
                onChange={(event) =>
                  setForm({ ...form, recommendedOrigin: event.target.value })
                }
                className={textInputClass()}
              >
                {originOptions.map((value) => (
                  <option key={value} value={value}>
                    {value || "No recommendation"}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2 space-y-2">
              <span>Recommended tags</span>
              <textarea
                placeholder="One existing tag per line"
                value={form.recommendedTags}
                onChange={(event) =>
                  setForm({ ...form, recommendedTags: event.target.value })
                }
                className={`${textInputClass()} min-h-24`}
              />
            </label>
            <label className="md:col-span-2 space-y-2">
              <span>Proposed tags</span>
              <textarea
                placeholder="One proposed tag per line"
                value={form.proposedTags}
                onChange={(event) =>
                  setForm({ ...form, proposedTags: event.target.value })
                }
                className={`${textInputClass()} min-h-24`}
              />
            </label>
            <label className="space-y-2">
              <span>Featured/primary link label</span>
              <input
                value={form.primaryLinkLabel}
                onChange={(event) =>
                  setForm({ ...form, primaryLinkLabel: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2">
              <span>Featured/primary link URL</span>
              <input
                value={form.primaryLinkUrl}
                onChange={(event) =>
                  setForm({ ...form, primaryLinkUrl: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2">
              <span>Featured/primary link type</span>
              <input
                value={form.primaryLinkType}
                onChange={(event) =>
                  setForm({ ...form, primaryLinkType: event.target.value })
                }
                className={textInputClass()}
              />
            </label>
            <label className="space-y-2">
              <span>selectedBy</span>
              <select
                value={form.selectedBy}
                onChange={(event) =>
                  setForm({
                    ...form,
                    selectedBy: event.target.value as "operator" | "subject",
                  })
                }
                className={textInputClass()}
              >
                <option value="operator">operator</option>
                <option value="subject">subject</option>
              </select>
            </label>
            <div className="md:col-span-2 xl:col-span-4 flex flex-col gap-3 md:flex-row md:items-center">
              <button
                disabled={saving}
                className="border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                {saving ? "Saving candidate..." : "Create Manual Candidate"}
              </button>
              {notice ? (
                <p className="text-sm normal-case tracking-normal text-muted">
                  {notice}
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <section className="border border-border bg-surface p-6 space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Candidate Queue
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Candidate Queue
              </h2>
              <p className="text-sm text-muted mt-2">
                Candidates are recommendations and stored workflow records, not
                public dossiers.
              </p>
            </div>
            <p className="text-xs uppercase tracking-widest text-muted">
              {candidates.length} candidates
            </p>
          </div>
          <div className="overflow-x-auto border border-border/70">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="bg-background/60 text-muted uppercase tracking-widest">
                <tr>
                  <th className="px-3 py-3">Candidate name</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Tier</th>
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3">Why Now</th>
                  <th className="px-3 py-3">Evidence count</th>
                  <th className="px-3 py-3">Duplicate Risk</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Updated</th>
                  <th className="px-3 py-3">Controls</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-8 text-center text-muted"
                    >
                      No candidates yet. Use Manual Candidate Intake to create a
                      workflow-only review record.
                    </td>
                  </tr>
                ) : (
                  candidates.map((candidate) => (
                    <tr
                      key={candidate.id}
                      className={`border-t border-border/70 ${selectedCandidate?.id === candidate.id ? "bg-accent/10" : ""}`}
                    >
                      <td className="px-3 py-3 text-foreground">
                        <button
                          className="text-left underline-offset-4 hover:underline"
                          onClick={() => setSelectedCandidateId(candidate.id)}
                        >
                          {candidate.name}
                        </button>
                      </td>
                      <td className="px-3 py-3">{candidate.candidateType}</td>
                      <td className="px-3 py-3">{candidate.tier}</td>
                      <td className="px-3 py-3">{candidate.score}</td>
                      <td className="px-3 py-3">{candidate.whyNow || "—"}</td>
                      <td className="px-3 py-3">
                        {candidate.evidenceItems?.length ??
                          candidate.evidenceCount ??
                          0}
                      </td>
                      <td className="px-3 py-3">
                        {candidate.duplicateRisk ?? "unknown"}
                      </td>
                      <td className="px-3 py-3">{candidate.status}</td>
                      <td className="px-3 py-3">{candidate.updatedAt}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            disabled={saving}
                            onClick={() =>
                              updateCandidateStatus(
                                candidate.id,
                                "denyCandidate",
                              )
                            }
                            className="border border-border px-2 py-1 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                          >
                            Deny
                          </button>
                          <button
                            disabled={saving}
                            onClick={() =>
                              updateCandidateStatus(
                                candidate.id,
                                "markNeedsMoreEvidence",
                              )
                            }
                            className="border border-border px-2 py-1 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                          >
                            Needs More Evidence
                          </button>
                          <button
                            disabled={saving}
                            onClick={() => createOrOpenDraft(candidate.id)}
                            className="border border-accent px-2 py-1 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                          >
                            {drafts.some(
                              (draft) =>
                                draft.candidateId === candidate.id &&
                                draft.status !== "denied" &&
                                draft.status !== "published",
                            )
                              ? "Open Draft"
                              : "Create Draft"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Candidate Evidence
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Candidate Evidence
              </h2>
              <p className="text-sm text-muted mt-2">
                Evidence is not public copy by default.{" "}
                {
                  "Identity authority separates BARCODE-controlled characters from community-owned identities."
                }
              </p>
            </div>
            <div className="border border-border bg-background/30 p-4 text-sm text-muted space-y-2">
              <p>
                <span className="text-foreground">Evidence summary:</span>{" "}
                {selectedCandidate?.evidenceSummary ?? "No selected candidate."}
              </p>
              <p>
                <span className="text-foreground">Source/tier/score:</span>{" "}
                {selectedCandidate
                  ? `${selectedCandidate.source} / ${selectedCandidate.tier} / ${selectedCandidate.score}`
                  : "No selected candidate."}
              </p>
              <p>
                <span className="text-foreground">Primary link:</span>{" "}
                {selectedCandidate?.primaryLink
                  ? `${selectedCandidate.primaryLink.label} — ${selectedCandidate.primaryLink.url}`
                  : "No selected candidate primary link."}
              </p>
            </div>
            <div className="space-y-2 text-xs text-muted">
              {selectedEvidence.length === 0 ? (
                <p className="border border-border bg-background/20 p-3">
                  No evidence items yet.
                </p>
              ) : (
                selectedEvidence.map((item) => (
                  <div
                    key={item.id}
                    className="border border-border bg-background/20 p-3"
                  >
                    <p className="text-foreground">
                      {item.label} ({item.type})
                    </p>
                    <p>{item.summary}</p>
                    <p>
                      Count: {item.count ?? 1} / publicSafe:{" "}
                      {item.publicSafe ? "yes" : "no"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Candidate Gate / Scoring
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Candidate Gate / Scoring
              </h2>
              <p className="text-sm text-muted mt-2">{scoringPolicy.gate}</p>
            </div>
            <div className="space-y-2 text-xs text-muted">
              <p>
                <span className="text-foreground">weak candidate:</span>{" "}
                {scoringPolicy.tiers.weak_candidate} Minimum score{" "}
                {scoringPolicy.thresholds.weakCandidateMin}.
              </p>
              <p>
                <span className="text-foreground">review candidate:</span>{" "}
                {scoringPolicy.tiers.review_candidate} Minimum score{" "}
                {scoringPolicy.thresholds.reviewCandidateMin}.
              </p>
              <p>
                <span className="text-foreground">draft-ready:</span>{" "}
                {scoringPolicy.tiers.draft_ready} Minimum score{" "}
                {scoringPolicy.thresholds.draftReadyMin}.
              </p>
              <p>{scoringPolicy.signals.manualNomination}</p>
              <p>Duplicate risk must be resolved before drafting.</p>
            </div>
          </div>

          <div className="border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Draft Readiness / Missing Info
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Draft Readiness / Missing Info
              </h2>
              <p className="text-sm text-muted mt-2">
                Missing Info, Do Not Say, public safety notes, and duplicate
                warnings block draft requests until reviewed.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs text-muted">
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Known facts
                </p>
                {listOrEmpty(
                  selectedCandidate?.knownFacts,
                  "No selected candidate; known facts will appear here.",
                )}
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Missing info
                </p>
                {listOrEmpty(
                  selectedCandidate?.missingInfo,
                  "No selected candidate; missing facts will appear here.",
                )}
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Do Not Say
                </p>
                {listOrEmpty(
                  selectedCandidate?.doNotSay,
                  "No restricted phrasing recorded yet.",
                )}
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Public safety notes
                </p>
                {listOrEmpty(
                  selectedCandidate?.publicSafetyNotes,
                  "No public-safety notes recorded yet.",
                )}
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Recommended taxonomy
                </p>
                <p>
                  {selectedCandidate
                    ? [
                        selectedCandidate.recommendedCategory,
                        selectedCandidate.recommendedKind,
                        selectedCandidate.recommendedEcosystemLane,
                        selectedCandidate.recommendedIdentityAuthority,
                      ]
                        .filter(Boolean)
                        .join(" / ") || "No recommended taxonomy recorded yet."
                    : "No selected candidate."}
                </p>
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Recommended tags
                </p>
                {listOrEmpty(
                  selectedCandidate?.recommendedTags,
                  "No recommended tags recorded yet.",
                )}
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Proposed tags
                </p>
                {listOrEmpty(
                  selectedCandidate?.proposedTags,
                  "No proposed tags recorded yet.",
                )}
              </div>
              <div className="border border-border bg-background/30 p-3">
                <p className="uppercase tracking-widest text-accent mb-2">
                  Existing Dossier Match / Duplicate Warning
                </p>
                <p>
                  {selectedCandidate?.existingDossierMatch
                    ? `${selectedCandidate.existingDossierMatch.id} — ${selectedCandidate.existingDossierMatch.name} (${selectedCandidate.existingDossierMatch.confidence})`
                    : "No selected candidate or duplicate match yet."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 border border-border bg-surface p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Draft Workspace
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Draft Workspace
              </h2>
              <p className="text-sm text-muted mt-2">
                Manual draft only — BNL generation comes later. Saving this
                draft does not publish anything.{" "}
                {
                  "Sheila/Cliff-style Network characters are not the same as community mods."
                }
              </p>
            </div>
            {!selectedDraft ? (
              <div className="border border-border bg-background/30 p-4 text-sm text-muted">
                <p className="text-xs uppercase tracking-widest text-accent mb-2">
                  No Draft Selected
                </p>
                <p>
                  {selectedCandidate
                    ? `${selectedCandidate.name} is selected. Use Create Draft in the Candidate Queue to start a manual workflow draft.`
                    : "No selected candidate."}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="border border-border bg-background/30 p-4 text-xs text-muted space-y-2">
                  <p className="uppercase tracking-widest text-accent">
                    Selected Draft
                  </p>
                  <p>
                    <span className="text-foreground">Draft:</span>{" "}
                    {selectedDraft.fields.name || selectedDraft.id}
                  </p>
                  <p>
                    <span className="text-foreground">Status:</span>{" "}
                    {selectedDraft.status}
                  </p>
                  <p>
                    <span className="text-foreground">Linked candidate:</span>{" "}
                    {selectedDraftCandidate
                      ? `${selectedDraftCandidate.name} (${selectedDraftCandidate.id})`
                      : selectedDraft.candidateId}
                  </p>
                  <p>
                    Owner approval will require owner secret in a future PR.
                    Owner approval is separate from editor save/submit and still
                    will not publish until publishing workflow exists.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs uppercase tracking-widest text-muted">
                  <label className="space-y-2">
                    <span>Name</span>
                    <input
                      value={draftForm.name}
                      onChange={(event) =>
                        setDraftForm({ ...draftForm, name: event.target.value })
                      }
                      className={textInputClass()}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Role</span>
                    <input
                      value={draftForm.role}
                      onChange={(event) =>
                        setDraftForm({ ...draftForm, role: event.target.value })
                      }
                      className={textInputClass()}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Category</span>
                    <select
                      value={draftForm.category}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          category: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    >
                      {categoryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select category"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span>Kind</span>
                    <select
                      value={draftForm.kind}
                      onChange={(event) =>
                        setDraftForm({ ...draftForm, kind: event.target.value })
                      }
                      className={textInputClass()}
                    >
                      {kindOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select kind"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span>Ecosystem lane</span>
                    <select
                      value={draftForm.ecosystemLane}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          ecosystemLane: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    >
                      {ecosystemLaneOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select ecosystem lane"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span>Identity authority</span>
                    <select
                      value={draftForm.identityAuthority}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          identityAuthority: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    >
                      {identityAuthorityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select identity authority"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span>Status</span>
                    <select
                      value={draftForm.status}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          status: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    >
                      {statusOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select status"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span>Clearance</span>
                    <select
                      value={draftForm.clearance}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          clearance: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    >
                      {clearanceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select clearance"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span>Origin</span>
                    <select
                      value={draftForm.origin}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          origin: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    >
                      {originOptions.map((option) => (
                        <option key={option} value={option}>
                          {option || "Select origin"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="md:col-span-2 space-y-2">
                    <span>Summary</span>
                    <textarea
                      value={draftForm.summary}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          summary: event.target.value,
                        })
                      }
                      className={`${textInputClass()} min-h-28`}
                    />
                  </label>
                  <label className="md:col-span-2 space-y-2">
                    <span>Notes</span>
                    <textarea
                      value={draftForm.notes}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          notes: event.target.value,
                        })
                      }
                      className={`${textInputClass()} min-h-28`}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Tags, one per line</span>
                    <textarea
                      value={draftForm.tags}
                      onChange={(event) =>
                        setDraftForm({ ...draftForm, tags: event.target.value })
                      }
                      className={`${textInputClass()} min-h-28`}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Proposed tags, one per line</span>
                    <textarea
                      value={draftForm.proposedTags}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          proposedTags: event.target.value,
                        })
                      }
                      className={`${textInputClass()} min-h-28`}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Primary link label</span>
                    <input
                      value={draftForm.primaryLinkLabel}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          primaryLinkLabel: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Primary link URL</span>
                    <input
                      value={draftForm.primaryLinkUrl}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          primaryLinkUrl: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>Primary link type</span>
                    <input
                      value={draftForm.primaryLinkType}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          primaryLinkType: event.target.value,
                        })
                      }
                      className={textInputClass()}
                    />
                  </label>
                  <label className="space-y-2">
                    <span>selectedBy</span>
                    <select
                      value={draftForm.selectedBy}
                      onChange={(event) =>
                        setDraftForm({
                          ...draftForm,
                          selectedBy: event.target
                            .value as DraftForm["selectedBy"],
                        })
                      }
                      className={textInputClass()}
                    >
                      <option value="operator">operator</option>
                      <option value="subject">subject</option>
                      <option value="legacy">legacy</option>
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-muted">
                  <div className="border border-border bg-background/30 p-3">
                    <p className="uppercase tracking-widest text-accent mb-2">
                      Known facts display from candidate
                    </p>
                    {listOrEmpty(
                      selectedDraftCandidate?.knownFacts,
                      "No known facts recorded on linked candidate.",
                    )}
                  </div>
                  <div className="border border-border bg-background/30 p-3">
                    <p className="uppercase tracking-widest text-accent mb-2">
                      Do-not-say display from candidate
                    </p>
                    {listOrEmpty(
                      selectedDraftCandidate?.doNotSay,
                      "No do-not-say notes recorded on linked candidate.",
                    )}
                  </div>
                  <div className="border border-border bg-background/30 p-3">
                    <p className="uppercase tracking-widest text-accent mb-2">
                      Public safety notes display from candidate
                    </p>
                    {listOrEmpty(
                      selectedDraftCandidate?.publicSafetyNotes,
                      "No public-safety notes recorded on linked candidate.",
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveSelectedDraft}
                    className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={submitSelectedDraftForOwnerReview}
                    className="border border-border px-4 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    Submit for Owner Review
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 border border-border bg-surface p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Review Actions
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Review Actions
              </h2>
              <p className="text-sm text-muted mt-2">
                Owner approval actions are disabled placeholders. Owner approval
                will require owner secret in a future PR and will not publish
                until publishing exists.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {reviewActions.map((label) => (
                <button
                  key={label}
                  disabled
                  className="w-full border border-border px-4 py-3 text-xs uppercase tracking-widest text-muted opacity-60"
                >
                  {label} — placeholder only
                </button>
              ))}
            </div>
            <div className="border border-border bg-background/30 p-4 text-xs text-muted space-y-2">
              <p className="uppercase tracking-widest text-accent">
                Future API actions
              </p>
              <p>{DOSSIER_WORKFLOW_ACTIONS.join(", ")}</p>
              <p>
                Current drafts loaded: {drafts.length}. Mutations do not publish
                or mutate real dossier content.
              </p>
            </div>
          </div>
        </section>

        <section className="border border-border bg-surface p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
                Owner Review Queue
              </p>
              <h2 className="text-2xl font-bold text-foreground">
                Owner Review Queue
              </h2>
              <p className="text-sm text-muted mt-2">
                Drafts waiting for owner review appear here. Owner approval is
                separate from editor save/submit and remains placeholder-only.
              </p>
            </div>
            <p className="text-xs uppercase tracking-widest text-muted">
              {payload.ownerReviewQueue?.waitingCount ??
                ownerReviewDrafts.length}{" "}
              waiting / {payload.ownerReviewQueue?.draftCount ?? drafts.length}{" "}
              drafts /{" "}
              {payload.ownerReviewQueue?.candidateCount ?? candidates.length}{" "}
              candidates
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 text-xs text-muted">
            {ownerReviewDrafts.length === 0 ? (
              <p className="border border-border bg-background/30 p-4">
                No drafts are ready_for_owner_review yet.
              </p>
            ) : (
              ownerReviewDrafts.map((draft) => {
                const candidate = candidates.find(
                  (item) => item.id === draft.candidateId,
                );
                return (
                  <div
                    key={draft.id}
                    className="border border-border bg-background/30 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                  >
                    <div>
                      <p className="text-foreground">
                        {draft.fields.name || draft.id}
                      </p>
                      <p>
                        Linked candidate:{" "}
                        {candidate
                          ? `${candidate.name} (${candidate.id})`
                          : draft.candidateId}
                      </p>
                      <p>Updated: {draft.updatedAt}</p>
                      <p>Status: {draft.status}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDraftId(draft.id);
                          setSelectedCandidateId(draft.candidateId);
                          setDraftForm(draftFormFromDraft(draft));
                        }}
                        className="border border-accent px-3 py-2 uppercase tracking-widest text-accent hover:bg-accent hover:text-background"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        disabled
                        className="border border-border px-3 py-2 uppercase tracking-widest text-muted opacity-60"
                      >
                        Owner Approve — placeholder
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="border border-border bg-surface p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">
              Focused BNL Assistant
            </p>
            <h2 className="text-2xl font-bold text-foreground">
              Focused BNL Assistant
            </h2>
            <p className="text-sm text-muted mt-2">
              Disabled placeholder only. It does not call BNL, write memory,
              publish, create tags, or create dossiers in this PR.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {focusedAssistantPrompts.map((prompt) => (
              <button
                key={prompt}
                disabled
                className="border border-border bg-background/30 px-3 py-3 text-xs uppercase tracking-widest text-muted opacity-60"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        <section className="border border-accent/40 bg-surface p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-accent mb-3">
              System Boundaries
            </p>
            <h2 className="text-2xl font-bold text-foreground">
              System Boundaries
            </h2>
            <p className="text-sm text-muted mt-2">
              The dossier workflow keeps evidence, draft generation, approval,
              and publishing separate.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted">
            {boundaries.map((boundary) => (
              <p
                key={boundary}
                className="border border-border bg-background/30 p-3"
              >
                {boundary}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-xs text-muted">
            {DOSSIER_SOURCE_BOUNDARIES.map((source) => (
              <div
                key={source.source}
                className="border border-border bg-background/30 p-4 space-y-2"
              >
                <p className="uppercase tracking-widest text-accent">
                  {source.source}
                </p>
                <p className="text-foreground">{source.label}</p>
                <p>{source.boundary}</p>
                <p>{source.allowedUse}</p>
              </div>
            ))}
          </div>
          <ul className="list-disc pl-5 text-sm text-muted space-y-1">
            <li>BNL recommends and drafts only.</li>
            <li>
              Admin approves/publishes in a future controlled publishing
              workflow.
            </li>
            <li>No automatic dossier creation.</li>
            <li>No automatic tag creation.</li>
            <li>No Discord identity merging.</li>
            <li>No payment/customer identity.</li>
            <li>Queue frequency is evidence, not identity.</li>
            <li>
              Loose intake / strict publishing keeps early candidates separate
              from approved public dossiers.
            </li>
          </ul>
        </section>
      </section>
    </main>
  );
}
