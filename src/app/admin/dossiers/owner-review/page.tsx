"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DossierCandidate, DossierDraft, DossierDuplicateGroup } from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  duplicateGroups: DossierDuplicateGroup[];
  workflow: { status: string };
};

function MinimalState({ title, message }: { title: string; message: string }) {
  return <main className="pt-14 min-h-screen flex items-center justify-center px-4"><section className="w-full max-w-md border border-border bg-surface p-8"><p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">ADMIN ACCESS CHECK</p><h1 className="text-2xl font-bold text-foreground">{title}</h1><p className="text-sm text-muted mt-3">{message}</p><Link href="/admin/dossiers" className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Back to Dossier Control Center</Link></section></main>;
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function PhaseRail() {
  return <section className="border border-border bg-background/30 p-3 text-xs uppercase tracking-widest text-muted" aria-label="Dossier phase indicator"><div className="flex flex-wrap gap-2"><span className="border border-border px-3 py-2">Phase 1 — BNL Source File</span><span className="border border-border px-3 py-2">Phase 2 — Proposed Dossier + BNL Edit Chat</span><span className="border border-border px-3 py-2">Phase 3 — Final Admin Draft</span><span className="border border-accent bg-accent/10 px-3 py-2 text-accent">Phase 4 — Owner Review</span><span className="border border-border px-3 py-2 opacity-60">Phase 5 — Approved / Publish Later</span></div></section>;
}

export default function OwnerReviewPage() {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadWorkflow() {
    const response = await fetch("/api/admin/dossiers", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Admin authentication required" : `Workflow API returned ${response.status}.`);
    setPayload((await response.json()) as WorkflowPayload);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkflow().catch((err) => setError(err instanceof Error ? err.message : "Failed to load owner review queue.")).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const ownerReviewDrafts = useMemo(() => payload?.drafts.filter((draft) => draft.status === "ready_for_owner_review") ?? [], [payload?.drafts]);

  if (loading) return <MinimalState title="Checking admin access..." message="Loading Owner Review." />;
  if (error === "Admin authentication required") return <MinimalState title="Admin authentication required" message="Sign in through /admin before opening owner review." />;
  if (error || !payload) return <MinimalState title="Owner Review unavailable" message={error ?? "Owner review data is unavailable."} />;

  return <main className="pt-14 min-h-screen bg-background"><section className="border-b border-border bg-surface/80"><div className="mx-auto max-w-5xl px-4 sm:px-6 py-8"><p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">Owner Review</p><h1 className="text-4xl font-bold text-foreground">Owner Final Review Queue</h1><div className="mt-4"><PhaseRail /></div><div className="mt-3 space-y-1 text-sm text-muted"><p>This is Owner Review. The owner does the final pass. Owner final review is separate from admin drafting.</p><p>Owner will be able to use BNL assistance plus manual editing.</p><p>Owner can approve, send back, request more info, or deny after a dedicated owner gate exists.</p><p>Owner approval will require owner gate/secret in a later PR.</p><p>Approval does not publish yet. Owner approval still will not publish until publishing exists.</p><p>Additional Info Added After Submission / Admin Addendum will appear here in a later PR for owner incorporation without overwriting submitted draft fields.</p><p>No BNL invocation, publishing, tag creation, or public database mutation happens here.</p></div><div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest"><Link href="/admin/dossiers" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent">Back to Dossier Control Center</Link></div></div></section><section className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-4">{ownerReviewDrafts.length === 0 ? <p className="border border-border bg-surface p-5 text-sm text-muted">No drafts are currently ready for owner review.</p> : ownerReviewDrafts.map((draft) => { const candidate = payload.candidates.find((item) => item.id === draft.candidateId); return <article key={draft.id} className="border border-border bg-surface p-5 text-sm text-muted"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="text-xl font-bold text-foreground">{draft.fields.name}</h2><p>Linked candidate: {candidate?.name ?? draft.candidateId}</p><p>Updated: {formatDate(draft.updatedAt)}</p><p>Status: {draft.status}</p></div><Link href={`/admin/dossiers/drafts/${draft.id}`} target="_blank" rel="noopener noreferrer" className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background">View Submitted Draft</Link></div></article>; })}</section></main>;
}
