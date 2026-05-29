"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  DossierCandidate,
  DossierDraft,
  DossierDuplicateGroup,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  workflow: {
    status: string;
    storage: string;
    updatedAt?: string;
    boundaries: string[];
  };
  ownerReviewQueue?: {
    waitingCount: number;
    draftCount: number;
    candidateCount: number;
  };
  authoringGuide?: { version: string };
  tagRegistry?: { totalUniqueTags: number; totalTagAssignments: number };
};

type ManualCandidateForm = {
  name: string;
  candidateType: DossierCandidate["candidateType"];
  reason: string;
  whyNow: string;
  evidenceSummary: string;
  recommendedCategory: string;
};

const emptyForm: ManualCandidateForm = {
  name: "",
  candidateType: "unknown",
  reason: "",
  whyNow: "",
  evidenceSummary: "",
  recommendedCategory: "",
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

const categoryOptions = ["", "Entity", "Personnel", "Sponsor", "Interface", "Production"];

function MinimalDossierAdminState({ title, message }: { title: string; message: string }) {
  return (
    <main className="pt-14 min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">ADMIN ACCESS CHECK</p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <Link href="/admin" className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">
          Back to Admin
        </Link>
      </section>
    </main>
  );
}

function textInputClass() {
  return "w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground";
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function linkedDraftFor(candidate: DossierCandidate, drafts: DossierDraft[]) {
  return drafts.find(
    (draft) =>
      draft.candidateId === candidate.id &&
      draft.status !== "denied" &&
      draft.status !== "published" &&
      draft.status !== "superseded",
  );
}

function StatusPill({ children }: { children: React.ReactNode }) {
  return <span className="border border-border bg-background/40 px-2 py-1 text-[0.65rem] uppercase tracking-widest text-muted">{children}</span>;
}

function DashboardCard({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border border-border bg-surface p-5 space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.45em] text-muted mb-2">{eyebrow}</p>
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function DossierControlCenterPage() {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<ManualCandidateForm>(emptyForm);
  const [createdDraftIdByCandidate, setCreatedDraftIdByCandidate] = useState<Record<string, string>>({});

  async function loadWorkflow() {
    setError(null);
    const response = await fetch("/api/admin/dossiers", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(response.status === 401 ? "Admin authentication required" : `Workflow API returned ${response.status}.`);
    }
    setPayload((await response.json()) as WorkflowPayload);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadWorkflow()
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dossier workflow."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const candidates = useMemo(() => payload?.candidates ?? [], [payload?.candidates]);
  const drafts = useMemo(() => payload?.drafts ?? [], [payload?.drafts]);
  const duplicateGroups = useMemo(() => payload?.duplicateGroups ?? [], [payload?.duplicateGroups]);
  const draftsInProgress = drafts.filter((draft) => draft.status === "draft" || draft.status === "owner_changes_requested");
  const ownerReviewDrafts = drafts.filter((draft) => draft.status === "ready_for_owner_review");
  const mergedCandidates = candidates.filter((candidate) => candidate.status === "merged");
  const supersededDrafts = drafts.filter((draft) => draft.status === "superseded");

  async function postWorkflow(body: Record<string, unknown>) {
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/dossiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<WorkflowPayload> & {
        candidate?: DossierCandidate;
        draft?: DossierDraft;
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(data.error ?? data.message ?? `Workflow API returned ${response.status}.`);
      if (data.candidates && data.drafts && data.workflow) setPayload(data as WorkflowPayload);
      return data;
    } finally {
      setSaving(false);
    }
  }

  async function submitManualCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const data = await postWorkflow({
        action: "createManualCandidate",
        input: {
          name: form.name,
          candidateType: form.candidateType,
          reason: form.reason,
          whyNow: form.whyNow,
          evidenceSummary: form.evidenceSummary,
          recommendedCategory: form.recommendedCategory || undefined,
        },
      });
      setForm(emptyForm);
      setNotice(`Manual candidate created: ${data.candidate?.name ?? "candidate"}. No BNL invocation, publishing, tag creation, or public database mutation occurred.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to create manual candidate.");
    }
  }

  async function createDraft(candidateId: string) {
    try {
      const data = await postWorkflow({ action: "createDraftFromCandidate", candidateId });
      if (data.draft) {
        setCreatedDraftIdByCandidate((current) => ({ ...current, [candidateId]: data.draft?.id ?? "" }));
        setNotice(`Draft created: ${data.draft.fields.name}. Open the dedicated draft editor to continue. Saving does not publish.`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to create draft.");
    }
  }

  async function updateCandidate(candidateId: string, action: "denyCandidate" | "markNeedsMoreEvidence") {
    try {
      const data = await postWorkflow({ action, candidateId });
      setNotice(`${data.candidate?.name ?? "Candidate"} updated. Workflow records remain internal only.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to update candidate.");
    }
  }

  if (loading) {
    return <MinimalDossierAdminState title="Checking admin access..." message="Loading the dossier workflow dashboard." />;
  }

  if (error || !payload) {
    return <MinimalDossierAdminState title="Admin authentication required" message={error ?? "Sign in through /admin before opening the dossier workflow."} />;
  }

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">ADMIN DOSSIER WORKFLOW</p>
          <h1 aria-label="Dossier Control Center" className="text-4xl font-bold tracking-tight text-foreground">
            <span className="text-accent text-glow">Dossier</span> Control Center
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Dashboard traffic control for the question: What needs attention next? Candidate review, draft editing, and merge comparison now live in dedicated workflow lanes instead of one crowded all-in-one workbench.
          </p>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            BNL generation comes later. Future BNL full-dossier drafting should land in the dedicated draft editor with complete fields, approved source packets, duplicate/merge history, style guidance, and strict no-invention rules.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link href="/admin" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all">Back to Admin</Link>
            <Link href="/database" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all">Public Database</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {notice && <div className="border border-accent/60 bg-accent/10 p-4 text-sm text-accent">{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-muted">
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Candidates</p><p>{candidates.length} total</p></div>
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Drafts</p><p>{drafts.length} total</p></div>
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Owner Review</p><p>{ownerReviewDrafts.length} waiting</p></div>
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Workflow API</p><p>{payload.workflow.status} / {payload.workflow.storage}</p></div>
        </div>

        <DashboardCard eyebrow="Quick intake" title="Quick Candidate Intake" aside={<StatusPill>compact form</StatusPill>}>
          <p className="text-sm text-muted">Create workflow-only candidates. Advanced evidence, taxonomy, and safety review happens on the Candidate Review page. This does not publish, invoke BNL, create tags, or mutate the public database.</p>
          <form onSubmit={submitManualCandidate} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 text-xs uppercase tracking-widest text-muted">
            <label className="space-y-2 xl:col-span-2"><span>Name</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={textInputClass()} /></label>
            <label className="space-y-2"><span>Type</span><select value={form.candidateType} onChange={(event) => setForm({ ...form, candidateType: event.target.value as DossierCandidate["candidateType"] })} className={textInputClass()}>{candidateTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="space-y-2"><span>Recommended category</span><select value={form.recommendedCategory} onChange={(event) => setForm({ ...form, recommendedCategory: event.target.value })} className={textInputClass()}>{categoryOptions.map((value) => <option key={value} value={value}>{value || "No recommendation"}</option>)}</select></label>
            <label className="space-y-2 xl:col-span-2"><span>Reason</span><input required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={textInputClass()} /></label>
            <label className="space-y-2 xl:col-span-3"><span>Why now</span><textarea value={form.whyNow} onChange={(event) => setForm({ ...form, whyNow: event.target.value })} className={`${textInputClass()} min-h-20`} /></label>
            <label className="space-y-2 xl:col-span-3"><span>Evidence summary</span><textarea value={form.evidenceSummary} onChange={(event) => setForm({ ...form, evidenceSummary: event.target.value })} className={`${textInputClass()} min-h-20`} /></label>
            <div className="xl:col-span-6"><button type="submit" disabled={saving} className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Create Manual Candidate</button></div>
          </form>
        </DashboardCard>

        <DashboardCard eyebrow="Lane 1" title="Candidate Queue" aside={<StatusPill>{candidates.length} records</StatusPill>}>
          {candidates.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No candidate records yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground"><tr><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Tier / Score</th><th className="py-2 pr-3">Duplicate Risk</th><th className="py-2 pr-3">Updated</th><th className="py-2 pr-3">Actions</th></tr></thead>
                <tbody>{candidates.map((candidate) => {
                  const draft = linkedDraftFor(candidate, drafts);
                  const createdDraftId = createdDraftIdByCandidate[candidate.id];
                  const openDraftId = draft?.id ?? createdDraftId;
                  return <tr key={candidate.id} className="border-t border-border/70 align-top"><td className="py-3 pr-3 text-foreground font-semibold">{candidate.name}</td><td className="py-3 pr-3">{candidate.status}</td><td className="py-3 pr-3">{candidate.source}</td><td className="py-3 pr-3">{candidate.tier} / {candidate.score}</td><td className="py-3 pr-3">{candidate.duplicateRisk ?? "none"}</td><td className="py-3 pr-3">{formatDate(candidate.updatedAt)}</td><td className="py-3 pr-3"><div className="flex flex-wrap gap-2"><Link href={`/admin/dossiers/candidates/${candidate.id}`} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Review Candidate</Link>{openDraftId ? <Link href={`/admin/dossiers/drafts/${openDraftId}`} target="_blank" rel="noopener noreferrer" className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Draft</Link> : <button type="button" disabled={saving || candidate.status === "denied" || candidate.status === "merged"} onClick={() => void createDraft(candidate.id)} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Create Draft</button>}<button type="button" disabled={saving || candidate.status === "denied"} onClick={() => void updateCandidate(candidate.id, "denyCandidate")} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50">Deny</button><button type="button" disabled={saving || candidate.status === "needs_more_evidence"} onClick={() => void updateCandidate(candidate.id, "markNeedsMoreEvidence")} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50">Needs More Evidence</button></div></td></tr>;
                })}</tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <DashboardCard eyebrow="Lane 2" title="Drafts in Progress" aside={<StatusPill>{draftsInProgress.length} open</StatusPill>}>
            {draftsInProgress.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No draft or owner-changes-requested drafts.</p> : <div className="space-y-3">{draftsInProgress.map((draft) => {
              const candidate = candidates.find((item) => item.id === draft.candidateId);
              return <article key={draft.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="font-bold text-foreground">{draft.fields.name}</p><p>Linked candidate: {candidate?.name ?? draft.candidateId}</p><p>Status: {draft.status}</p><p>Updated: {formatDate(draft.updatedAt)}</p></div><Link href={`/admin/dossiers/drafts/${draft.id}`} target="_blank" rel="noopener noreferrer" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Draft Editor</Link></div></article>;
            })}</div>}
          </DashboardCard>

          <DashboardCard eyebrow="Lane 3" title="Owner Review Queue" aside={<StatusPill>{ownerReviewDrafts.length} waiting</StatusPill>}>
            {ownerReviewDrafts.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No drafts waiting for owner review. Owner approval remains placeholder-only; there is no publishing action here.</p> : <div className="space-y-3">{ownerReviewDrafts.map((draft) => {
              const candidate = candidates.find((item) => item.id === draft.candidateId);
              return <article key={draft.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="font-bold text-foreground">{draft.fields.name}</p><p>Linked candidate: {candidate?.name ?? draft.candidateId}</p><p>Updated: {formatDate(draft.updatedAt)}</p></div><Link href={`/admin/dossiers/drafts/${draft.id}`} target="_blank" rel="noopener noreferrer" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Draft Editor</Link></div></article>;
            })}</div>}
          </DashboardCard>
        </div>

        <DashboardCard eyebrow="Lane 4" title="Possible Duplicates" aside={<StatusPill>{duplicateGroups.length} groups</StatusPill>}>
          {duplicateGroups.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No workflow-internal duplicate groups detected.</p> : <div className="space-y-3">{duplicateGroups.map((group) => <article key={group.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold text-foreground">{group.names.join(" / ")}</p><p>Risk: {group.risk}</p><p>{group.candidateIds.length} candidates / {group.draftIds.length} drafts</p><p>Reason: {group.reason}</p></div><Link href={`/admin/dossiers/duplicates/${group.id}`} className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Review Merge</Link></div></article>)}</div>}
        </DashboardCard>

        <details className="border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">Merged / Superseded Records</summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted">
            <div className="border border-border/70 bg-background/20 p-4"><p className="text-xs uppercase tracking-widest text-accent mb-2">Merged candidates</p><p>{mergedCandidates.length} merged candidate records.</p>{mergedCandidates.slice(0, 5).map((candidate) => <p key={candidate.id}>{candidate.name} → {candidate.mergedIntoCandidateId ?? "master retained"}</p>)}</div>
            <div className="border border-border/70 bg-background/20 p-4"><p className="text-xs uppercase tracking-widest text-accent mb-2">Superseded drafts</p><p>{supersededDrafts.length} superseded draft records.</p>{supersededDrafts.slice(0, 5).map((draft) => <p key={draft.id}>{draft.fields.name} → {draft.mergedIntoDraftId ?? "master retained"}</p>)}</div>
          </div>
        </details>

        <DashboardCard eyebrow="Boundaries" title="System Boundaries">
          <ul className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-muted">
            <li className="border border-border/70 bg-background/20 p-3">No BNL invocation.</li>
            <li className="border border-border/70 bg-background/20 p-3">No publishing.</li>
            <li className="border border-border/70 bg-background/20 p-3">No automatic tag creation.</li>
            <li className="border border-border/70 bg-background/20 p-3">No public database mutation.</li>
          </ul>
          <p className="text-xs text-muted">Dedicated pages keep operators in one lane: candidate review, focused draft editor, or merge review. Dashboard buttons navigate; there is no hidden editor below unrelated sections and no dashboard auto-scroll workflow.</p>
        </DashboardCard>
      </section>
    </main>
  );
}
