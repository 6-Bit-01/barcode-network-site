/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DOSSIER_SOURCE_BOUNDARIES,
  DOSSIER_WORKFLOW_ACTIONS,
  type DossierCandidate,
  type DossierDraft,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  workflow: {
    status: string;
    storage: string;
    boundaries: string[];
  };
  authoringGuide?: {
    version: string;
  };
  tagRegistry?: {
    totalUniqueTags: number;
    totalTagAssignments: number;
  };
};

const operatorOptions = {
  category: ["Entity", "Personnel", "Sponsor", "Interface", "Production"],
  clearance: ["PUBLIC", "INTERNAL", "RESTRICTED"],
  status: ["ACTIVE", "INACTIVE", "ARCHIVED", "PENDING", "UNKNOWN"],
  origin: ["KNOWN", "UNKNOWN", "UNVERIFIED", "WITHHELD"],
  tagMode: ["Reuse existing tags", "Allow proposed tags"],
};

function MinimalDossierAdminState({ title, message }: { title: string; message: string }) {
  return (
    <main className="pt-14 min-h-screen flex items-center justify-center px-4">
      <section className="w-full max-w-md border border-border bg-surface p-8">
        <p className="text-xs uppercase tracking-[0.5em] text-muted mb-5">// ADMIN ACCESS CHECK</p>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted mt-3">{message}</p>
        <Link href="/admin" className="mt-6 inline-flex border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Back to Admin</Link>
      </section>
    </main>
  );
}

export default function AdminDossiersPage() {
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkflow() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/dossiers", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(response.status === 401 ? "Admin authentication required." : `Workflow API returned ${response.status}.`);
        }
        const data = (await response.json()) as WorkflowPayload;
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dossier workflow.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <MinimalDossierAdminState title="Checking admin access..." message="Verifying operator credentials before loading the dossier workflow." />;
  }

  if (error || !payload) {
    return <MinimalDossierAdminState title="Admin authentication required" message={error ?? "Sign in from the admin panel before opening this operator workflow."} />;
  }

  const candidates = payload.candidates;
  const drafts = payload.drafts;
  const boundaries = payload.workflow.boundaries;

  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// ADMIN: DOSSIER WORKFLOW</p>
          <h1 aria-label="Dossier Control Center" className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Dossier</span> Control Center</h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Review dossier candidates, choose minimal drafting options, request BNL draft support, and keep approval/publishing under operator control.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link href="/admin" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all">Back to Admin</Link>
            <Link href="/database" className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent transition-all">Public Database</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs text-muted">
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">Workflow API</p>
            <p>Foundation contract loaded.</p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">Authoring Guide</p>
            <p>Version: {payload.authoringGuide?.version ?? "unknown"}</p>
          </div>
          <div className="border border-border bg-surface p-4">
            <p className="uppercase tracking-[0.35em] text-accent mb-2">Tag Registry</p>
            <p>{payload.tagRegistry ? `${payload.tagRegistry.totalUniqueTags} tags / ${payload.tagRegistry.totalTagAssignments} assignments` : "No tag registry summary returned."}</p>
          </div>
        </div>

        <section className="border border-border bg-surface p-6 space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Candidate Queue</p>
              <h2 className="text-2xl font-bold text-foreground">Candidate Queue</h2>
              <p className="text-sm text-muted mt-2">Candidate intake wiring comes in a later PR. No candidates create dossiers automatically.</p>
            </div>
            <p className="text-xs uppercase tracking-widest text-muted">{candidates.length} candidates</p>
          </div>
          <div className="overflow-x-auto border border-border/70">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-background/60 text-muted uppercase tracking-widest">
                <tr>
                  <th className="px-3 py-3">Candidate name</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3">Confidence / Priority</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Last seen / Evidence count</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted">No candidates yet. Candidate intake wiring comes in a later PR.</td>
                  </tr>
                ) : candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-t border-border/70">
                    <td className="px-3 py-3 text-foreground">{candidate.name}</td>
                    <td className="px-3 py-3">{candidate.source}</td>
                    <td className="px-3 py-3">{candidate.reason}</td>
                    <td className="px-3 py-3">{candidate.confidence ?? "unranked"}</td>
                    <td className="px-3 py-3">{candidate.status}</td>
                    <td className="px-3 py-3">{candidate.updatedAt} / {candidate.evidenceCount ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 border border-border bg-surface p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Draft Workspace</p>
              <h2 className="text-2xl font-bold text-foreground">Draft Workspace</h2>
              <p className="text-sm text-muted mt-2">No draft selected. Select an operator-reviewed candidate before BNL drafting is requested.</p>
            </div>
            <div className="border border-border bg-background/30 p-4 text-sm text-muted">
              <p className="text-xs uppercase tracking-widest text-accent mb-2">Selected Candidate</p>
              <p>No draft selected. Candidate intake wiring comes in a later PR.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(operatorOptions).map(([key, values]) => (
                <label key={key} className="text-xs uppercase tracking-widest text-muted space-y-2">
                  <span>{key === "tagMode" ? "Tag mode" : key}</span>
                  <select disabled className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-muted">
                    {values.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
              ))}
              <label className="md:col-span-2 text-xs uppercase tracking-widest text-muted space-y-2">
                <span>Selected / featured link</span>
                <input disabled placeholder="Public-safe link selection will be wired later" className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-muted" />
              </label>
              <label className="md:col-span-2 text-xs uppercase tracking-widest text-muted space-y-2">
                <span>Notes to BNL</span>
                <textarea disabled placeholder="Operator notes for future draft request" className="min-h-28 w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-muted" />
              </label>
            </div>
            <p className="text-xs text-muted">Draft records are workflow records only. Approved drafts do not become website entries until a future operator-controlled site update.</p>
          </div>

          <div className="lg:col-span-2 border border-border bg-surface p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Review Actions</p>
              <h2 className="text-2xl font-bold text-foreground">Review Actions</h2>
              <p className="text-sm text-muted mt-2">Backend mutations return not_implemented_yet in this foundation PR.</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {["Generate Draft", "Try Again", "Approve Draft", "Edit Draft", "Deny Candidate", "Mark Needs More Evidence"].map((label) => (
                <button key={label} disabled className="w-full border border-border px-4 py-3 text-xs uppercase tracking-widest text-muted opacity-60">
                  {label} — pending backend
                </button>
              ))}
            </div>
            <div className="border border-border bg-background/30 p-4 text-xs text-muted space-y-2">
              <p className="uppercase tracking-widest text-accent">Future API actions</p>
              <p>{DOSSIER_WORKFLOW_ACTIONS.join(", ")}</p>
              <p>Current drafts loaded: {drafts.length}. Mutations do not publish or mutate real dossier content.</p>
            </div>
          </div>
        </section>

        <section className="border border-accent/40 bg-surface p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-accent mb-3">System Boundaries</p>
            <h2 className="text-2xl font-bold text-foreground">System Boundaries</h2>
            <p className="text-sm text-muted mt-2">The dossier workflow keeps evidence, draft generation, approval, and publishing separate.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-muted">
            {boundaries.map((boundary) => <p key={boundary} className="border border-border bg-background/30 p-3">{boundary}</p>)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 text-xs text-muted">
            {DOSSIER_SOURCE_BOUNDARIES.map((source) => (
              <div key={source.source} className="border border-border bg-background/30 p-4 space-y-2">
                <p className="uppercase tracking-widest text-accent">{source.source}</p>
                <p className="text-foreground">{source.label}</p>
                <p>{source.boundary}</p>
                <p>{source.allowedUse}</p>
              </div>
            ))}
          </div>
          <ul className="list-disc pl-5 text-sm text-muted space-y-1">
            <li>BNL recommends and drafts only.</li>
            <li>Admin approves/publishes.</li>
            <li>No automatic dossier creation.</li>
            <li>No automatic tag creation.</li>
            <li>No Discord identity merging.</li>
            <li>No payment/customer identity.</li>
            <li>Queue frequency is evidence, not identity.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
