"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  DossierCandidate,
  DossierDraft,
  DossierRecommendation,
} from "@/lib/dossier-workflow";

type WorkflowPayload = {
  candidates: DossierCandidate[];
  drafts: DossierDraft[];
  recommendations: DossierRecommendation[];
  workflow: { status: string };
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
          Back to Dossier Dashboard
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
    <p>{empty}</p>
  );
}

function Field({
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

const terminalRecommendationStatuses = new Set<DossierRecommendation["status"]>(
  [
    "attached_to_source_file",
    "converted_to_source_file",
    "ignored",
    "dismissed",
  ],
);

function terminalRecommendationMessage(recommendation: DossierRecommendation) {
  if (recommendation.status === "converted_to_source_file") {
    return "Converted to BNL Source File.";
  }
  if (recommendation.status === "attached_to_source_file") {
    return "Attached to existing BNL Source File.";
  }
  if (recommendation.status === "ignored") {
    return "Ignored. This recommendation is closed.";
  }
  if (recommendation.status === "dismissed") {
    return "Dismissed. This recommendation is closed.";
  }
  return "";
}

export default function DossierRecommendationPage() {
  const params = useParams();
  const recommendationId = routeParam(params?.recommendationId);
  const [payload, setPayload] = useState<WorkflowPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetCandidateId, setTargetCandidateId] = useState("");

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
            err instanceof Error
              ? err.message
              : "Failed to load recommendation.",
          ),
        )
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [recommendationId]);

  const recommendation = useMemo(
    () =>
      payload?.recommendations.find((item) => item.id === recommendationId) ??
      null,
    [payload?.recommendations, recommendationId],
  );
  const activeCandidates = useMemo(
    () =>
      (payload?.candidates ?? []).filter(
        (candidate) =>
          candidate.status !== "denied" && candidate.status !== "merged",
      ),
    [payload?.candidates],
  );
  const targetCandidate = recommendation?.targetCandidateId
    ? (payload?.candidates.find(
        (candidate) => candidate.id === recommendation.targetCandidateId,
      ) ?? null)
    : null;
  const isTerminal = Boolean(
    recommendation && terminalRecommendationStatuses.has(recommendation.status),
  );
  const terminalMessage = recommendation
    ? terminalRecommendationMessage(recommendation)
    : "";

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
        recommendation?: DossierRecommendation;
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

  async function updateRecommendation(
    action:
      | "convertRecommendationToCandidate"
      | "ignoreDossierRecommendation"
      | "dismissDossierRecommendation",
  ) {
    try {
      const data = await postWorkflow({ action, recommendationId });
      setNotice(
        `${data.recommendation?.subjectName ?? "Recommendation"} updated. This does not publish anything.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to update recommendation.",
      );
    }
  }

  async function attachRecommendation() {
    if (!targetCandidateId) {
      setNotice("Choose an existing BNL Source File before attaching.");
      return;
    }
    try {
      const data = await postWorkflow({
        action: "attachRecommendationToCandidate",
        recommendationId,
        candidateId: targetCandidateId,
        createSourceNote: true,
      });
      setNotice(
        `${data.recommendation?.subjectName ?? "Recommendation"} attached as source-file context. No draft was created.`,
      );
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to attach recommendation.",
      );
    }
  }

  if (loading)
    return (
      <MinimalState
        title="Loading recommendation"
        message="Checking the Dossier Recommendation Inbox."
      />
    );
  if (error || !payload)
    return (
      <MinimalState
        title="Admin authentication required"
        message={
          error ?? "Sign in through /admin before opening recommendations."
        }
      />
    );
  if (!recommendation)
    return (
      <MinimalState
        title="Recommendation not found"
        message="This recommendation is not present in the workflow store."
      />
    );

  return (
    <main className="pt-14 min-h-screen bg-background">
      <section className="border-b border-border bg-surface/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-4">
            Dossier Recommendation Inbox
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {recommendation.subjectName}
          </h1>
          <p className="text-sm text-muted mt-3 max-w-3xl">
            Recommendations are admin-only review records. They do not publish,
            create drafts, write content files, or create tags automatically.
          </p>
          {notice && (
            <div className="mt-4 border border-accent/60 bg-accent/10 p-3 text-sm text-accent">
              {notice}
            </div>
          )}
          {isTerminal && (
            <div className="mt-4 border border-border/70 bg-background/30 p-4 text-sm text-muted">
              <p className="font-bold text-foreground">{terminalMessage}</p>
              {targetCandidate ? (
                <Link
                  href={`/admin/dossiers/candidates/${targetCandidate.id}`}
                  className="mt-2 inline-flex text-accent hover:underline"
                >
                  Open target BNL Source File: {targetCandidate.name}
                </Link>
              ) : recommendation.targetCandidateId ? (
                <Link
                  href={`/admin/dossiers/candidates/${recommendation.targetCandidateId}`}
                  className="mt-2 inline-flex text-accent hover:underline"
                >
                  Open target BNL Source File
                </Link>
              ) : null}
              <p className="mt-2 text-xs uppercase tracking-widest text-muted">
                Terminal recommendation actions are closed. No reopen/retry
                behavior is available in this PR.
              </p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-widest">
            <Link
              href="/admin/dossiers"
              className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent"
            >
              Back to Dossier Dashboard
            </Link>
            {!isTerminal && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation(
                      "convertRecommendationToCandidate",
                    )
                  }
                  className="border border-accent px-4 py-2 text-accent hover:bg-accent hover:text-background disabled:opacity-50"
                >
                  Convert to BNL Source File
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation("ignoreDossierRecommendation")
                  }
                  className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Ignore
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void updateRecommendation("dismissDossierRecommendation")
                  }
                  className="border border-border px-4 py-2 text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-4">
        {!isTerminal && (
          <section className="border border-border bg-surface p-5 text-sm text-muted">
            <h2 className="text-2xl font-bold text-foreground mb-3">
              Attach to Existing Source File
            </h2>
            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={targetCandidateId}
                onChange={(event) => setTargetCandidateId(event.target.value)}
                className="w-full bg-background border border-border px-3 py-2.5 text-sm normal-case tracking-normal text-foreground"
              >
                <option value="">Choose existing BNL Source File</option>
                {activeCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={() => void attachRecommendation()}
                className="border border-accent px-4 py-2 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background disabled:opacity-50"
              >
                Attach to Existing Source File
              </button>
            </div>
          </section>
        )}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field title="Subject">
            <p>{recommendation.subjectName}</p>
          </Field>
          <Field title="Type / Status">
            <p>
              {recommendation.type} / {recommendation.status}
            </p>
          </Field>
          <Field title="Reason">
            <p>{recommendation.reason}</p>
          </Field>
          <Field title="Evidence summary">
            <p>{recommendation.evidenceSummary ?? "—"}</p>
          </Field>
          <Field title="Source lanes">
            <p>{recommendation.sourceLanes.join(", ")}</p>
          </Field>
          <Field title="Confidence">
            <p>{recommendation.confidence ?? "—"}</p>
          </Field>
          <Field title="Recommended taxonomy">
            <p>
              {recommendation.recommendedCategory ?? "—"} /{" "}
              {recommendation.recommendedKind ?? "—"} /{" "}
              {recommendation.recommendedEcosystemLane ?? "—"} /{" "}
              {recommendation.recommendedIdentityAuthority ?? "—"}
            </p>
          </Field>
          <Field title="Recommended tags">
            <p>{recommendation.recommendedTags?.join(", ") || "—"}</p>
          </Field>
          <Field title="Missing info">{list(recommendation.missingInfo)}</Field>
          <Field title="Do-not-say">{list(recommendation.doNotSay)}</Field>
          <Field title="Public safety notes">
            {list(recommendation.publicSafetyNotes)}
          </Field>
          <Field title="Suggested action">
            <p>{recommendation.suggestedAction ?? "—"}</p>
          </Field>
        </section>
      </section>
    </main>
  );
}
