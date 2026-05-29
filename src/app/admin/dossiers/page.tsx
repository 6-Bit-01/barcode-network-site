/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DOSSIER_CANDIDATE_SCORING_POLICY,
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
    scoringPolicy?: typeof DOSSIER_CANDIDATE_SCORING_POLICY;
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
  status: ["ACTIVE", "INACTIVE", "ARCHIVED", "PENDING", "UNKNOWN"],
  clearance: ["PUBLIC", "INTERNAL", "RESTRICTED"],
  origin: ["KNOWN", "UNKNOWN", "UNVERIFIED", "WITHHELD"],
  tagMode: ["Reuse existing tags", "Allow proposed tags"],
  toneIntensity: ["grounded", "in-universe", "classified"],
};

const reviewActions = [
  "Generate Draft",
  "Try Again: Too Long",
  "Try Again: Too Vague",
  "Try Again: Too Much Lore",
  "Try Again: Too Dry",
  "Try Again: Wrong Tags",
  "Rewrite Summary Only",
  "Rewrite Notes Only",
  "Approve Draft",
  "Edit Draft",
  "Deny Candidate",
  "Mark Needs More Evidence",
];

const focusedAssistantPrompts = [
  "Why was this recommended?",
  "What evidence is missing?",
  "Suggest safer public version",
  "Suggest stronger in-universe version",
  "Explain tag choices",
];

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

function listOrEmpty(items: string[] | undefined, empty: string) {
  if (!items || items.length === 0) return <p className="text-muted">{empty}</p>;
  return <ul className="list-disc pl-5 space-y-1">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
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
  const scoringPolicy = payload.workflow.scoringPolicy ?? DOSSIER_CANDIDATE_SCORING_POLICY;
  const selectedCandidate = candidates[0] ?? null;
  const selectedEvidence = selectedCandidate?.evidenceItems ?? [];

  return (
    <main className="pt-14 min-h-screen">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">// ADMIN: DOSSIER WORKFLOW</p>
          <h1 aria-label="Dossier Control Center" className="text-4xl font-bold tracking-tight text-foreground"><span className="text-accent text-glow">Dossier</span> Control Center</h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Review why a candidate was recommended, inspect evidence and duplicate risk, then request BNL drafting only after operator selection.
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
            <p>Foundation contract loaded. Storage: {payload.workflow.storage}.</p>
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
              <p className="text-sm text-muted mt-2">Candidates are recommendations, not dossiers. Candidate intake wiring comes in a later PR.</p>
            </div>
            <p className="text-xs uppercase tracking-widest text-muted">{candidates.length} candidates</p>
          </div>
          <div className="overflow-x-auto border border-border/70">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-background/60 text-muted uppercase tracking-widest">
                <tr>
                  <th className="px-3 py-3">Candidate name</th>
                  <th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Tier</th>
                  <th className="px-3 py-3">Score</th>
                  <th className="px-3 py-3">Why Now</th>
                  <th className="px-3 py-3">Evidence count</th>
                  <th className="px-3 py-3">Duplicate Risk</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted">No candidates yet. Candidate intake wiring comes in a later PR.</td>
                  </tr>
                ) : candidates.map((candidate) => (
                  <tr key={candidate.id} className="border-t border-border/70">
                    <td className="px-3 py-3 text-foreground">{candidate.name}</td>
                    <td className="px-3 py-3">{candidate.candidateType}</td>
                    <td className="px-3 py-3">{candidate.source}</td>
                    <td className="px-3 py-3">{candidate.tier}</td>
                    <td className="px-3 py-3">{candidate.score}</td>
                    <td className="px-3 py-3">{candidate.whyNow}</td>
                    <td className="px-3 py-3">{candidate.evidenceItems?.length ?? candidate.evidenceCount ?? 0}</td>
                    <td className="px-3 py-3">{candidate.duplicateRisk ?? "unknown"}</td>
                    <td className="px-3 py-3">{candidate.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Candidate Evidence</p>
              <h2 className="text-2xl font-bold text-foreground">Candidate Evidence</h2>
              <p className="text-sm text-muted mt-2">Evidence is not public copy by default. Each item must be checked for publicSafe status before it can inform a draft.</p>
            </div>
            <div className="border border-border bg-background/30 p-4 text-sm text-muted space-y-2">
              <p><span className="text-foreground">Evidence summary:</span> {selectedCandidate?.evidenceSummary ?? "No candidate selected."}</p>
              <p><span className="text-foreground">First seen:</span> {selectedCandidate?.firstSeenAt ?? "not available"}</p>
              <p><span className="text-foreground">Last seen:</span> {selectedCandidate?.lastSeenAt ?? "not available"}</p>
              <p><span className="text-foreground">publicSafe flag:</span> future evidence items must be individually marked true before public drafting use.</p>
            </div>
            <div className="space-y-2 text-xs text-muted">
              {selectedEvidence.length === 0 ? (
                <p className="border border-border bg-background/20 p-3">No evidence items yet. Future entries will show type, label, summary, count, first seen, last seen, and publicSafe status.</p>
              ) : selectedEvidence.map((item) => (
                <div key={item.id} className="border border-border bg-background/20 p-3">
                  <p className="text-foreground">{item.label} ({item.type})</p>
                  <p>{item.summary}</p>
                  <p>Count: {item.count ?? 1} / publicSafe: {item.publicSafe ? "yes" : "no"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Candidate Gate / Scoring</p>
              <h2 className="text-2xl font-bold text-foreground">Candidate Gate / Scoring</h2>
              <p className="text-sm text-muted mt-2">{scoringPolicy.gate}</p>
            </div>
            <div className="space-y-2 text-xs text-muted">
              <p><span className="text-foreground">weak candidate:</span> {scoringPolicy.tiers.weak_candidate} Minimum score {scoringPolicy.thresholds.weakCandidateMin}.</p>
              <p><span className="text-foreground">review candidate:</span> {scoringPolicy.tiers.review_candidate} Minimum score {scoringPolicy.thresholds.reviewCandidateMin}.</p>
              <p><span className="text-foreground">draft-ready:</span> {scoringPolicy.tiers.draft_ready} Minimum score {scoringPolicy.thresholds.draftReadyMin}.</p>
              <p>{scoringPolicy.signals.queueRecurrence}</p>
              <p>Queue frequency is evidence, not identity.</p>
              <p>Duplicate risk must be resolved before drafting.</p>
            </div>
          </div>

          <div className="border border-border bg-surface p-6 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Draft Readiness / Missing Info</p>
              <h2 className="text-2xl font-bold text-foreground">Draft Readiness / Missing Info</h2>
              <p className="text-sm text-muted mt-2">Missing Info, Do Not Say, public safety notes, and duplicate warnings block draft requests until reviewed.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs text-muted">
              <div className="border border-border bg-background/30 p-3"><p className="uppercase tracking-widest text-accent mb-2">Missing Info</p>{listOrEmpty(selectedCandidate?.missingInfo, "No selected candidate; missing facts will appear here.")}</div>
              <div className="border border-border bg-background/30 p-3"><p className="uppercase tracking-widest text-accent mb-2">Do Not Say</p>{listOrEmpty(selectedCandidate?.doNotSay, "No restricted phrasing recorded yet.")}</div>
              <div className="border border-border bg-background/30 p-3"><p className="uppercase tracking-widest text-accent mb-2">Public Safety Notes</p>{listOrEmpty(selectedCandidate?.publicSafetyNotes, "No public-safety notes recorded yet.")}</div>
              <div className="border border-border bg-background/30 p-3"><p className="uppercase tracking-widest text-accent mb-2">Existing Dossier Match / Duplicate Warning</p><p>{selectedCandidate?.existingDossierMatch ? `${selectedCandidate.existingDossierMatch.name} (${selectedCandidate.existingDossierMatch.confidence})` : "No selected candidate or duplicate match yet."}</p></div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 border border-border bg-surface p-6 space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Draft Workspace</p>
              <h2 className="text-2xl font-bold text-foreground">Draft Workspace</h2>
              <p className="text-sm text-muted mt-2">No draft selected. Select a reviewed candidate before BNL drafting is requested.</p>
            </div>
            <div className="border border-border bg-background/30 p-4 text-sm text-muted">
              <p className="text-xs uppercase tracking-widest text-accent mb-2">Selected Candidate</p>
              <p>No draft selected. Candidate intake wiring comes in a later PR.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(operatorOptions).map(([key, values]) => (
                <label key={key} className="text-xs uppercase tracking-widest text-muted space-y-2">
                  <span>{key === "tagMode" ? "Tag mode" : key === "toneIntensity" ? "Tone intensity" : key}</span>
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
                <span>Known facts</span>
                <textarea disabled placeholder="Operator-approved facts for BNL drafting" className="min-h-24 w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-muted" />
              </label>
              <label className="md:col-span-2 text-xs uppercase tracking-widest text-muted space-y-2">
                <span>Do not say</span>
                <textarea disabled placeholder="Claims, private details, or lore directions BNL must avoid" className="min-h-24 w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-muted" />
              </label>
              <label className="md:col-span-2 text-xs uppercase tracking-widest text-muted space-y-2">
                <span>Notes to BNL</span>
                <textarea disabled placeholder="Candidate-specific drafting instructions for future BNL request" className="min-h-28 w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-muted" />
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
              {reviewActions.map((label) => (
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

        <section className="border border-border bg-surface p-6 space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-muted mb-3">Focused BNL Assistant</p>
            <h2 className="text-2xl font-bold text-foreground">Focused BNL Assistant</h2>
            <p className="text-sm text-muted mt-2">Not a full chat yet. Future wiring is candidate-specific only and cannot publish, write memory, or create dossiers.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {focusedAssistantPrompts.map((prompt) => (
              <button key={prompt} disabled className="border border-border bg-background/30 px-3 py-3 text-xs uppercase tracking-widest text-muted opacity-60">{prompt}</button>
            ))}
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
            <li>Loose intake / strict publishing keeps early candidates separate from approved public dossiers.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
