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

function editablePublicationStatus(
  status: QueueSessionBnlPublicationStatus,
): QueueSessionBnlPublicationStatus {
  return status === "recap_approved" ? "public_copy_approved" : status;
}

function publicationMeaning(
  purpose: QueueSessionPurpose,
  status: QueueSessionBnlPublicationStatus,
): string {
  if (purpose === "unknown") return "Legacy or unknown sessions cannot provide queue data to BNL.";
  if (status === "private") {
    return "BNL receives no queue or track data from this show.";
  }
  if (status === "runtime_only") {
    return "BNL receives the sanitized operational queue and saved show history only in owner/admin and private-test contexts. It cannot use this show in public replies, public Deck output, or the public Broadcast Archive.";
  }
  return "BNL receives the same sanitized operational queue and saved show history and may use it in public replies, the Broadcast Deck, and Broadcast Archive interactions. It still cannot mutate the queue or create memory or dossiers automatically.";
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
    useState<QueueSessionBnlPublicationStatus>(editablePublicationStatus(session.bnlPublicationStatus));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPurpose(session.purpose);
    setPublicationStatus(editablePublicationStatus(session.bnlPublicationStatus));
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
      editablePublicationStatus(next.session?.bnlPublicationStatus ?? publicationStatus),
    );
    setMessage("BNL access choice saved. Queue behavior was not changed.");
  }

  function changePurpose(value: QueueSessionPurpose) {
    setPurpose(value);
    if (value === "unknown") setPublicationStatus("private");
    else if (value !== "live_broadcast" && publicationStatus === "public_copy_approved") setPublicationStatus("runtime_only");
    setMessage(null);
    setError(null);
  }

  return (
    <details className="border border-cyan-300/35 bg-cyan-300/5 p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.28em] text-cyan-200">
        BNL queue access
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
            <span className="text-xs uppercase tracking-widest text-muted">BNL queue access</span>
            <select
              value={publicationStatus}
              disabled={purpose === "unknown"}
              onChange={(event) => {
                setPublicationStatus(event.target.value as QueueSessionBnlPublicationStatus);
                setMessage(null);
                setError(null);
              }}
              className="w-full border border-border bg-background px-3 py-2.5 text-sm disabled:opacity-50"
            >
              <option value="private">No BNL queue access</option>
              <option value="runtime_only">Private BNL queue access</option>
              {purpose === "live_broadcast" && <option value="public_copy_approved">Public BNL queue access</option>}
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
          {saving ? "Saving…" : "Save BNL Access"}
        </button>
        <p className="text-xs text-muted">
          Payment, checkout, contact, upload, legal-acceptance, and admin-only fields are never included. BNL access is read-only and never enables automatic memory, dossier creation, queue mutation, or playback control.
        </p>
      </div>
    </details>
  );
}
