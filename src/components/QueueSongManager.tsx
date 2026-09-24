"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { audioMimeTypeForFile, readAudioDuration, safeFileName } from "@/lib/queue-upload-client";
import { assertQueueTrackDuration, PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT, PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, PUBLIC_QUEUE_LEGAL_TERMS_VERSION, type QueueOwnedTrack } from "@/lib/queue-types";

export function QueueSongManager({ sessionId, tracks, canAdd, onAdd, onRefresh }: {
  sessionId: string; tracks: QueueOwnedTrack[]; canAdd: boolean; onAdd: () => void; onRefresh: () => Promise<unknown>;
}) {
  const [target, setTarget] = useState<QueueOwnedTrack | null>(null);
  const [title, setTitle] = useState("");
  const [collaboratorNames, setCollaboratorNames] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [mode, setMode] = useState<"details" | "link" | "upload">("details");
  const [file, setFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const preparedUpload = useRef<{ file: File; url: string } | null>(null);
  const current = tracks.find(track => track.id === target?.id);
  const canReplace = Boolean(target && current?.canReplace && current.replacementRevision === target.replacementRevision);

  function begin(track: QueueOwnedTrack) {
    setTarget(track); setTitle(track.title); setCollaboratorNames(track.collaboratorNames); setNote(track.note);
    setLink(""); setFile(null); setMode("details");
    setAccepted(false); setError(""); setMessage(""); setProgress(null); preparedUpload.current = null;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !target || !canReplace || (mode !== "details" && !accepted)) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        action: "replace", sessionId, trackId: target.id, expectedRevision: target.replacementRevision,
        title: title.trim(), mode, collaboratorNames: collaboratorNames.trim(), note: note.trim(), acceptedLegal: accepted,
        termsVersion: PUBLIC_QUEUE_LEGAL_TERMS_VERSION, privacyVersion: PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION,
        queueTermsVersion: PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, acceptedCheckboxText: PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT,
      };
      if (mode === "upload") {
        if (!file) throw new Error("Choose an MP3 or WAV file.");
        if (file.size > 100 * 1024 * 1024) throw new Error("Uploads must be 100MB or less.");
        const duration = await readAudioDuration(file);
        assertQueueTrackDuration(duration);
        const mimeType = audioMimeTypeForFile(file);
        if (preparedUpload.current?.file !== file) {
          setProgress(0);
          const blob = await upload(`barcode-radio-queue/${Date.now()}-${safeFileName(file.name)}`, file, {
            access: "private", contentType: mimeType, multipart: true, handleUploadUrl: "/api/queue/upload",
            clientPayload: JSON.stringify({ sessionId, replaceTrackId: target.id, expectedRevision: target.replacementRevision, uploadOriginalName: file.name, fileSize: file.size, mimeType }),
            onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
          });
          preparedUpload.current = { file, url: blob.url };
        }
        Object.assign(body, { uploadedBlobUrl: preparedUpload.current.url, uploadOriginalName: file.name, fileSize: file.size, mimeType, detectedDurationSeconds: duration });
      } else if (mode === "link") body.link = link.trim();
      setProgress(null);
      const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your changes could not be confirmed. Refresh your songs before trying again.");
      await onRefresh().catch(() => undefined);
      setMessage(`Saved “${result.track.submittedSongTitle}”. ${mode === "details" ? "Your audio, queue slot and purchases are unchanged." : "Your queue slot and purchases are unchanged."}`);
      setTarget(null); preparedUpload.current = null;
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "TimeoutError" && failure.name !== "TypeError" ? failure.message : "Your changes could not be confirmed. Refresh your songs before trying again.");
      await onRefresh().catch(() => undefined);
    } finally { inFlight.current = false; setBusy(false); setProgress(null); }
  }

  if (!tracks.length && !target && !message) return null;
  const fieldClass = "mt-1 w-full border border-border bg-background px-3 py-2 text-base text-foreground";
  return <section className="space-y-4 border border-cyan-200/35 bg-surface p-4 sm:p-5" aria-label="Manage your songs">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-foreground">Your songs</h2><p className="mt-1 text-sm text-muted">Editing and track replacement are optional conveniences for songs in the middle or back of the queue. They close near the front or within the 10-minute safety window and stay closed if your song moves back.</p></div>
      <button type="button" disabled={!canAdd || busy} onClick={() => { setTarget(null); onAdd(); }} className="min-h-11 border border-accent px-4 py-2 text-sm text-accent disabled:opacity-50">Add another song</button>
    </div>
    {message && <p role="status" className="text-sm text-cyan-200">{message}</p>}
    <ul className="space-y-2">{tracks.map(track => <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-background/40 p-3">
      <div className="min-w-0"><p className="break-words text-sm font-bold">{track.artist} — {track.title}</p>{!track.canReplace && <p className="mt-1 text-xs text-muted">{track.unavailableReason}</p>}</div>
      {track.canReplace && <button type="button" disabled={busy} onClick={() => begin(track)} className="min-h-11 border border-cyan-200/40 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50" aria-label={`Edit or replace ${track.title}`}>Edit / replace song</button>}
    </li>)}</ul>
    {target && <form onSubmit={save} className="space-y-4 border-t border-border pt-4" aria-label={`Edit or replace ${target.title}`}>
      <p className="text-sm text-muted">Editing <strong className="text-foreground">{target.artist} — {target.title}</strong>. Your primary artist, queue slot and purchases stay with it.</p>
      <p className="border-l-2 border-accent pl-3 text-sm text-foreground">Editing or uploading does not reserve your song or delay the host. Skips and removals can move the line forward without warning. If your song gets too close or the host or Wheel selects it, all edits close even while this form is open. Wheel spins also pause candidate edits until confirmation. Only a confirmed save changes your track.</p>
      {!canReplace && <p role="alert" className="text-sm text-accent">{current?.unavailableReason || "This song changed or is no longer available for replacement. Close this form and review your songs."}</p>}
      <fieldset disabled={busy || !canReplace} className="min-w-0 space-y-4 disabled:opacity-60">
        <label className="block text-sm">Song title<input className={fieldClass} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} required /></label>
        <label className="block text-sm">Featured artists / collaborators (optional)<input className={fieldClass} value={collaboratorNames} maxLength={200} onChange={event => setCollaboratorNames(event.target.value)} placeholder="Separate names with commas" /></label>
        <label className="block text-sm">Note to the host (optional)<textarea className={fieldClass} rows={3} value={note} maxLength={500} onChange={event => setNote(event.target.value)} aria-describedby="song-edit-note-help" /></label>
        <p id="song-edit-note-help" className="text-xs text-muted">Only you and the host can see this note. Leave either optional field empty to clear it.</p>
        <div className="flex flex-wrap gap-2">{([ ["details", "Keep current audio"], ["link", "Replace track link"], ["upload", "Upload MP3/WAV"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className="min-h-11 border border-border px-4 py-2 text-sm aria-pressed:border-cyan-200">{label}</button>)}</div>
        {mode === "link" && <label className="block text-sm">Replacement track link<input className={fieldClass} type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" required /></label>}
        {mode === "upload" && <label className="block text-sm">Replacement audio file<input className={fieldClass} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={event => { setFile(event.target.files?.[0] ?? null); preparedUpload.current = null; }} required={!file} /></label>}
        {mode !== "details" && <><label className="flex items-start gap-3 text-xs leading-relaxed text-muted"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-accent" required /><span>{PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT}</span></label>
        <p className="flex flex-wrap gap-4 text-xs text-accent"><a href="/legal#terms" target="_blank" rel="noreferrer">Terms</a><a href="/legal#queue-submission" target="_blank" rel="noreferrer">Queue Submission Terms</a><a href="/legal#privacy" target="_blank" rel="noreferrer">Privacy Policy</a></p></>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || !canReplace || (mode !== "details" && !accepted)} className="min-h-11 border border-cyan-200 bg-cyan-200 px-4 py-2 text-sm font-bold text-background disabled:opacity-50">{busy ? progress === null ? "Saving changes…" : `Uploading… ${progress}%` : "Save changes"}</button><button type="button" disabled={busy} onClick={() => { setTarget(null); setError(""); }} className="min-h-11 border border-border px-4 py-2 text-sm disabled:opacity-50">Cancel</button></div>
    </form>}
  </section>;
}
