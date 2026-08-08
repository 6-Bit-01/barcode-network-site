"use client";

import { useEffect, useState } from "react";
import type {
  QueueSessionBnlPublicationStatus,
  QueueSessionPurpose,
  QueueSessionSummary,
  QueueState,
} from "@/lib/queue-types";

const PURPOSE_OPTIONS: Array<{
  value: QueueSessionPurpose;
  label: string;
}> = [
  { value: "unknown", label: "Legacy / unknown (quarantined)" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "live_broadcast", label: "Live broadcast" },
  { value: "simulation", label: "Simulation" },
  { value: "internal_test", label: "Internal test" },
];

const PUBLICATION_OPTIONS: Array<{
  value: QueueSessionBnlPublicationStatus;
  label: string;
}> = [
  { value: "private", label: "Private / quarantined" },
  { value: "runtime_only", label: "Runtime context only" },
  { value: "recap_approved", label: "Recap candidates approved" },
  { value: "public_copy_approved", label: "Public copy approved" },
];

function publicationMeaning(
  purpose: QueueSessionPurpose,
  status: QueueSessionBnlPublicationStatus,
): string {
  if (purpose !== "live_broadcast") {
    return "This purpose is quarantined from every queue-derived BNL lane, even while the native queue remains publicly usable.";
  }
  if (status === "private") {
    return "The session remains unavailable to BNL. Native queue behavior is unchanged.";
  }
  if (status === "runtime_only") {
    return "BNL may receive sanitized, temporary live context. Completed tracks are not recap or public-copy candidates.";
  }
  if (status === "recap_approved") {
    return "Sanitized completed tracks may enter the recap-candidate lane. Generic public-copy use remains blocked.";
  }
  return "Sanitized runtime, recap-candidate, and public-copy lanes are approved. Broadcast Memory and dossier seeds remain independently blocked.";
}

export function AdminQueueSessionProvenance({
  session,
  onSave,
}: {
  session: QueueSessionSummary;
  onSave: (body: Record<string, unknown>) => Promise<QueueState | null>;
}) {
  const [purpose, setPurpose] = useState<QueueSessionPurpose>(session.purpose);
  const [publicationStatus, setPublicationStatus] =
    useState<QueueSessionBnlPublicationStatus>(session.bnlPublicationStatus);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPurpose(session.purpose);
    setPublicationStatus(session.bnlPublicationStatus);
    setMessage(null);
    setError(null);
  }, [session.sessionId, session.purpose, session.bnlPublicationStatus]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    const next = await onSave({
      action: "updateSessionProvenance",
      sessionId: session.sessionId,
      purpose,
      bnlPublicationStatus: publicationStatus,
    });
    setSaving(false);
    if (!next) {
      setError("Session provenance could not be saved.");
      return;
    }
    setPurpose(next.session?.purpose ?? purpose);
    setPublicationStatus(
      next.session?.bnlPublicationStatus ?? publicationStatus,
    );
    setMessage("Session provenance saved. Queue behavior and bot gates were not changed.");
  }

  function changePurpose(value: QueueSessionPurpose) {
    setPurpose(value);
    if (value !== "live_broadcast") setPublicationStatus("private");
    setMessage(null);
    setError(null);
  }

  return (
    <details className="border border-cyan-300/35 bg-cyan-300/5 p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">
        Session provenance / BNL publication
      </summary>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-widest text-muted">Session purpose</span>
            <select
              value={purpose}
              onChange={(event) => changePurpose(event.target.value as QueueSessionPurpose)}
              className="w-full border border-border bg-background px-3 py-2.5 text-sm"
            >
              {PURPOSE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-widest text-muted">BNL publication</span>
            <select
              value={publicationStatus}
              disabled={purpose !== "live_broadcast"}
              onChange={(event) => {
                setPublicationStatus(event.target.value as QueueSessionBnlPublicationStatus);
                setMessage(null);
                setError(null);
              }}
              className="w-full border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-50"
            >
              {PUBLICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="border border-border bg-background/50 p-3 text-sm text-muted">
          {publicationMeaning(purpose, publicationStatus)}
        </p>
        <p className="text-xs text-muted">
          {session.provenanceUpdatedAt
            ? `Provenance revision ${session.provenanceRevision} · last explicit action: ${new Date(session.provenanceUpdatedAt).toLocaleString()}`
            : "No explicit provenance action is recorded. Legacy/unknown sessions remain safely quarantined."}
        </p>
        {error && <p className="border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        {message && <p className="border border-accent/40 bg-accent/10 p-3 text-sm text-accent">{message}</p>}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="border border-cyan-300/60 px-4 py-2 text-xs uppercase tracking-widest text-cyan-200 hover:bg-cyan-200 hover:text-background disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save BNL Boundary"}
        </button>
        <p className="text-xs text-muted">
          This action does not publish a recap, enable bot memory, change queue mechanics, or alter payment/playback authority.
        </p>
      </div>
    </details>
  );
}
