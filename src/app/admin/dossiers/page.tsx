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
const activeCandidateStatuses = new Set<DossierCandidate["status"]>([
  "suggested",
  "needs_review",
  "selected",
  "draft_requested",
  "draft_ready",
  "needs_revision",
  "needs_more_evidence",
  "approved",
]);
const activeDraftStatuses = new Set<DossierDraft["status"]>([
  "draft",
  "owner_changes_requested",
]);
const closedDraftStatuses = new Set<DossierDraft["status"]>([
  "denied",
  "superseded",
  "owner_approved",
  "published",
]);

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

function isCandidateClosed(candidate: DossierCandidate) {
  return candidate.status === "denied" || candidate.status === "merged";
}

function isDraftActive(draft: DossierDraft) {
  return activeDraftStatuses.has(draft.status);
}

function linkedActiveDraftFor(candidate: DossierCandidate, drafts: DossierDraft[]) {
  return drafts.find((draft) => draft.candidateId === candidate.id && isDraftActive(draft));
}

function candidateName(candidateId: string | undefined, candidates: DossierCandidate[]) {
  if (!candidateId) return "master retained";
  return candidates.find((candidate) => candidate.id === candidateId)?.name ?? candidateId;
}

function draftName(draftId: string | undefined, drafts: DossierDraft[]) {
  if (!draftId) return "master retained";
  return drafts.find((draft) => draft.id === draftId)?.fields.name ?? draftId;
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
  const activeCandidates = candidates.filter((candidate) => activeCandidateStatuses.has(candidate.status));
  const closedCandidates = candidates.filter((candidate) => candidate.status === "denied" || candidate.status === "merged");
  const draftsInProgress = drafts.filter((draft) => isDraftActive(draft));
  const ownerReviewDrafts = drafts.filter((draft) => draft.status === "ready_for_owner_review");
  const closedDrafts = drafts.filter((draft) => closedDraftStatuses.has(draft.status));
  const activeDuplicateGroups = duplicateGroups.filter((group) => {
    const activeGroupCandidates = group.candidateIds
      .map((candidateId) => candidates.find((candidate) => candidate.id === candidateId))
      .filter((candidate): candidate is DossierCandidate => candidate !== undefined && !isCandidateClosed(candidate));
    return activeGroupCandidates.length >= 2;
  });
  const resolvedDuplicateGroups = duplicateGroups.filter((group) => !activeDuplicateGroups.some((activeGroup) => activeGroup.id === group.id));

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
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate || isCandidateClosed(candidate) || linkedActiveDraftFor(candidate, drafts)) return;

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
    const candidate = candidates.find((item) => item.id === candidateId);
    if (!candidate || isCandidateClosed(candidate)) return;

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
            Dashboard traffic control for the question: What needs attention next? Candidate review, draft editing, owner review, and merge comparison now live in dedicated workflow lanes.
          </p>
          <p className="text-sm text-muted mt-2 max-w-3xl">
            BNL generation comes later. Future BNL full-dossier drafting should land in the dedicated draft editor with complete fields, approved source packets, duplicate/merge history, style guidance, and strict no-invention rules.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link href="/admin" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all">Back to Admin</Link>
            <Link href="/database" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all">Public Database</Link>
            <Link href="/admin/dossiers/owner-review" className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background transition-all">Owner Review</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
        {notice && <div className="border border-accent/60 bg-accent/10 p-4 text-sm text-accent">{notice}</div>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-muted">
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Active Candidates</p><p>{activeCandidates.length} active / {closedCandidates.length} closed</p></div>
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Drafts</p><p>{draftsInProgress.length} active / {closedDrafts.length} closed</p></div>
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Owner Review</p><p>{ownerReviewDrafts.length} waiting</p></div>
          <div className="border border-border bg-surface p-4"><p className="uppercase tracking-[0.35em] text-accent mb-2">Workflow API</p><p>{payload.workflow.status} / {payload.workflow.storage}</p></div>
        </div>

        <DashboardCard eyebrow="Manual fallback" title="Quick Candidate Intake" aside={<StatusPill>Manual fallback / quick seed</StatusPill>}>
          <p className="text-sm text-muted">Manual fallback / quick seed. Use this when BNL has not suggested a candidate yet or when an operator needs to seed one directly. Main BNL-led workbench comes later. This does not publish, invoke BNL, create tags, or mutate the public database.</p>
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

        <DashboardCard eyebrow="Coming next" title="BNL Dossier Workbench — Coming Next" aside={<StatusPill>future BNL-led flow</StatusPill>}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-muted">
            <div className="border border-border/70 bg-background/20 p-4 space-y-2">
              <p className="font-bold text-foreground">Prompt-based dossier drafting comes next.</p>
              <p>Admin will be able to ask BNL to build or revise a dossier from approved source packets.</p>
              <p>BNL will generate full dossier fields, not starter notes.</p>
              <p>BNL will ask only for missing decisions.</p>
              <p>Manual editing remains available.</p>
            </div>
            <div className="border border-border/70 bg-background/20 p-4 space-y-2">
              <p className="font-bold text-foreground">Intended future BNL-led workflow</p>
              <p>Admin selects or creates a candidate, gives BNL a loose instruction, BNL gathers the approved source packet, drafts complete dossier fields, admin asks for revisions or edits manually, then submits to Owner Review.</p>
              <p>Owner opens the submitted draft, can prompt BNL for final changes, edit manually, approve, send back, deny, or request more info. Approval still does not publish until publishing workflow exists.</p>
            </div>
          </div>
          <p className="text-xs text-muted">Future source packet: website read model, dossier taxonomy guide, authoring guide, tag registry, selected candidate facts, queue/public show context, R&amp;D/operator-approved notes, Discord-safe/mod-approved context, duplicate/merge history, and existing dossier style profile. Future output includes name, category, kind, ecosystemLane, identityAuthority, status, clearance, origin, role, summary, notes, tags, proposedTags if needed, primary link if known/public-safe, evidence/caveat notes, public safety notes, and missing info questions. BNL must not invent facts, must preserve tone/style, must keep community-owned identities separate from BARCODE-controlled characters, and must treat AI/human/unknown as tags/traits.</p>
        </DashboardCard>

        <DashboardCard eyebrow="Lane 1" title="Candidate Queue" aside={<StatusPill>{activeCandidates.length} active records</StatusPill>}>
          {activeCandidates.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No active candidate records need review.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm text-muted">
                <thead className="text-xs uppercase tracking-widest text-foreground"><tr><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Tier / Score</th><th className="py-2 pr-3">Duplicate Risk</th><th className="py-2 pr-3">Updated</th><th className="py-2 pr-3">Actions</th></tr></thead>
                <tbody>{activeCandidates.map((candidate) => {
                  const draft = linkedActiveDraftFor(candidate, drafts);
                  const createdDraftId = createdDraftIdByCandidate[candidate.id];
                  const openDraftId = draft?.id ?? createdDraftId;
                  const canCreateDraft = !isCandidateClosed(candidate) && !openDraftId;
                  const canUpdateCandidate = !isCandidateClosed(candidate);
                  return <tr key={candidate.id} className="border-t border-border/70 align-top"><td className="py-3 pr-3 text-foreground font-semibold">{candidate.name}</td><td className="py-3 pr-3">{candidate.status}</td><td className="py-3 pr-3">{candidate.source}</td><td className="py-3 pr-3">{candidate.tier} / {candidate.score}</td><td className="py-3 pr-3">{candidate.duplicateRisk ?? "none"}</td><td className="py-3 pr-3">{formatDate(candidate.updatedAt)}</td><td className="py-3 pr-3"><div className="flex flex-wrap gap-2"><Link href={`/admin/dossiers/candidates/${candidate.id}`} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent">Review Candidate</Link>{openDraftId ? <Link href={`/admin/dossiers/drafts/${openDraftId}`} target="_blank" rel="noopener noreferrer" className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Draft</Link> : <button type="button" disabled={saving || !canCreateDraft} onClick={() => void createDraft(candidate.id)} className="border border-accent px-3 py-1.5 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50">Create Draft</button>}<button type="button" disabled={saving || !canUpdateCandidate} onClick={() => void updateCandidate(candidate.id, "denyCandidate")} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50">Deny</button><button type="button" disabled={saving || !canUpdateCandidate || candidate.status === "needs_more_evidence"} onClick={() => void updateCandidate(candidate.id, "markNeedsMoreEvidence")} className="border border-border px-3 py-1.5 text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50">Needs More Evidence</button></div></td></tr>;
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

          <DashboardCard eyebrow="Lane 3" title="Owner Review" aside={<StatusPill>{ownerReviewDrafts.length} waiting</StatusPill>}>
            <p className="text-sm text-muted">Admin/editor submits a workflow draft here for owner focus. Owner gate/secret comes later and owner approval still will not publish until publishing exists.</p>
            {ownerReviewDrafts.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No drafts waiting for owner review.</p> : <div className="space-y-3">{ownerReviewDrafts.map((draft) => {
              const candidate = candidates.find((item) => item.id === draft.candidateId);
              return <article key={draft.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="font-bold text-foreground">{draft.fields.name}</p><p>Linked candidate: {candidate?.name ?? draft.candidateId}</p><p>Updated: {formatDate(draft.updatedAt)}</p></div><Link href={`/admin/dossiers/drafts/${draft.id}`} target="_blank" rel="noopener noreferrer" className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Open Draft Editor</Link></div></article>;
            })}</div>}
            <Link href="/admin/dossiers/owner-review" className="inline-flex border border-border px-3 py-2 text-xs uppercase tracking-widest text-muted hover:border-accent hover:text-accent">Open Owner Review Page</Link>
          </DashboardCard>
        </div>

        <DashboardCard eyebrow="Lane 4" title="Possible Duplicates" aside={<StatusPill>{activeDuplicateGroups.length} active groups</StatusPill>}>
          <p className="text-sm text-muted">Merge is a lead/owner review action. Nothing auto-merges. Source candidates and source drafts are preserved; merged records move out of active lanes.</p>
          {activeDuplicateGroups.length === 0 ? <p className="text-sm text-muted border border-border/70 bg-background/30 p-4">No active duplicate groups need merge review.</p> : <div className="space-y-3">{activeDuplicateGroups.map((group) => <article key={group.id} className="border border-border/70 bg-background/20 p-4 text-sm text-muted"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold text-foreground">{group.names.join(" / ")}</p><p>Risk: {group.risk}</p><p>{group.candidateIds.length} candidates / {group.draftIds.length} drafts</p><p>Reason: {group.reason}</p></div><Link href={`/admin/dossiers/duplicates/${group.id}`} className="border border-accent px-3 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">Review Merge</Link></div></article>)}</div>}
          {resolvedDuplicateGroups.length > 0 && <p className="text-xs text-muted">{resolvedDuplicateGroups.length} duplicate group(s) are already resolved or no longer have enough active candidates; see History below.</p>}
        </DashboardCard>

        <details className="border border-border bg-surface p-5">
          <summary className="cursor-pointer text-xl font-bold text-foreground">Closed / Merged Candidates and Closed / Superseded Drafts History</summary>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted">
            <div className="border border-border/70 bg-background/20 p-4"><p className="text-xs uppercase tracking-widest text-accent mb-2">Closed / Merged Candidates</p><p>{closedCandidates.length} closed candidate records.</p>{closedCandidates.slice(0, 8).map((candidate) => <article key={candidate.id} className="mt-3 border-t border-border/60 pt-3"><p className="text-foreground font-semibold">{candidate.name}</p><p>Status: {candidate.status}</p>{candidate.status === "merged" && <p>mergedIntoCandidateId: {candidate.mergedIntoCandidateId ?? "—"}</p>}{candidate.status === "merged" && <p>Master candidate: {candidate.mergedIntoCandidateId ? <Link className="text-accent hover:underline" href={`/admin/dossiers/candidates/${candidate.mergedIntoCandidateId}`}>{candidateName(candidate.mergedIntoCandidateId, candidates)}</Link> : "—"}</p>}{candidate.status === "merged" && <p>mergedAt: {formatDate(candidate.mergedAt)}</p>}<p className="text-xs uppercase tracking-widest text-muted">No normal active action buttons</p></article>)}</div>
            <div className="border border-border/70 bg-background/20 p-4"><p className="text-xs uppercase tracking-widest text-accent mb-2">Closed / Superseded Drafts</p><p>{closedDrafts.length} closed draft records.</p>{closedDrafts.slice(0, 8).map((draft) => <article key={draft.id} className="mt-3 border-t border-border/60 pt-3"><p className="text-foreground font-semibold">{draft.fields.name}</p><p>Status: {draft.status}</p>{draft.status === "superseded" && <p>mergedIntoDraftId: {draft.mergedIntoDraftId ?? "—"}</p>}{draft.status === "superseded" && <p>Superseded by master draft: {draft.mergedIntoDraftId ? <Link className="text-accent hover:underline" href={`/admin/dossiers/drafts/${draft.mergedIntoDraftId}`}>{draftName(draft.mergedIntoDraftId, drafts)}</Link> : "—"}</p>}<p className="text-xs uppercase tracking-widest text-muted">Reference-only; no normal active edit button</p></article>)}</div>
            <div className="border border-border/70 bg-background/20 p-4"><p className="text-xs uppercase tracking-widest text-accent mb-2">Resolved duplicate groups</p><p>{resolvedDuplicateGroups.length} group(s) no longer have at least two active, non-merged candidates.</p></div>
          </div>
        </details>

        <DashboardCard eyebrow="Boundaries" title="System Boundaries">
          <ul className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm text-muted">
            <li className="border border-border/70 bg-background/20 p-3">No BNL invocation.</li>
            <li className="border border-border/70 bg-background/20 p-3">No publishing.</li>
            <li className="border border-border/70 bg-background/20 p-3">No automatic tag creation.</li>
            <li className="border border-border/70 bg-background/20 p-3">No public database mutation.</li>
          </ul>
          <p className="text-xs text-muted">Dedicated pages keep operators in one lane: candidate review, focused draft editor, owner review, or merge review. Dashboard buttons navigate; there is no hidden editor below unrelated sections and no dashboard auto-scroll workflow.</p>
        </DashboardCard>
      </section>
    </main>
  );
}
