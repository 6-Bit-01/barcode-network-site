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
  const [link, setLink] = useState("");
  const [mode, setMode] = useState<"link" | "upload">("link");
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
    setTarget(track); setTitle(track.title); setLink(""); setFile(null); setMode("link");
    setAccepted(false); setError(""); setMessage(""); setProgress(null); preparedUpload.current = null;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !target || !canReplace || !accepted) return;
    inFlight.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const body: Record<string, unknown> = {
        action: "replace", sessionId, trackId: target.id, expectedRevision: target.replacementRevision,
        title: title.trim(), mode, acceptedLegal: true,
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
      } else body.link = link.trim();
      setProgress(null);
      const response = await fetch("/api/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Replacement could not be confirmed. Refresh your songs before trying again.");
      await onRefresh().catch(() => undefined);
      setMessage(`Replaced with “${result.track.submittedSongTitle}”. Your queue slot and purchases are unchanged.`);
      setTarget(null); preparedUpload.current = null;
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "TimeoutError" && failure.name !== "TypeError" ? failure.message : "Replacement could not be confirmed. Refresh your songs before trying again.");
      await onRefresh().catch(() => undefined);
    } finally { inFlight.current = false; setBusy(false); setProgress(null); }
  }

  if (!tracks.length && !target && !message) return null;
  const fieldClass = "mt-1 w-full border border-border bg-background px-3 py-2 text-base text-foreground";
  return <section className="space-y-4 border border-cyan-200/35 bg-surface p-4 sm:p-5" aria-label="Manage your songs">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold text-foreground">Your songs</h2><p className="mt-1 text-sm text-muted">Replace a waiting song from this browser. Your artist credit, place in line and purchases stay with it.</p></div>
      <button type="button" disabled={!canAdd || busy} onClick={() => { setTarget(null); onAdd(); }} className="min-h-11 border border-accent px-4 py-2 text-sm text-accent disabled:opacity-50">Add another song</button>
    </div>
    {message && <p role="status" className="text-sm text-cyan-200">{message}</p>}
    <ul className="space-y-2">{tracks.map(track => <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-background/40 p-3">
      <div className="min-w-0"><p className="break-words text-sm font-bold">{track.artist} — {track.title}</p>{!track.canReplace && <p className="mt-1 text-xs text-muted">{track.unavailableReason}</p>}</div>
      {track.canReplace && <button type="button" disabled={busy} onClick={() => begin(track)} className="min-h-11 border border-cyan-200/40 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50" aria-label={`Replace ${track.title}`}>Replace song</button>}
    </li>)}</ul>
    {target && <form onSubmit={save} className="space-y-4 border-t border-border pt-4" aria-label={`Replace ${target.title}`}>
      <p className="text-sm text-muted">Replacing <strong className="text-foreground">{target.artist} — {target.title}</strong>. Changes lock at Next in Line, Now Playing, or Wheel selection. Replacements pause during a Wheel spin and confirmation.</p>
      {!canReplace && <p role="alert" className="text-sm text-accent">This song changed or is no longer waiting. Close this form and review your songs.</p>}
      <fieldset disabled={busy || !canReplace} className="min-w-0 space-y-4 disabled:opacity-60">
        <label className="block text-sm">Replacement song title<input className={fieldClass} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} required /></label>
        <div className="flex flex-wrap gap-2"><button type="button" aria-pressed={mode === "link"} onClick={() => setMode("link")} className="min-h-11 border border-border px-4 py-2 text-sm aria-pressed:border-cyan-200">Track link</button><button type="button" aria-pressed={mode === "upload"} onClick={() => setMode("upload")} className="min-h-11 border border-border px-4 py-2 text-sm aria-pressed:border-cyan-200">Upload MP3/WAV</button></div>
        {mode === "link" ? <label className="block text-sm">Replacement track link<input className={fieldClass} type="url" value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" required /></label> : <label className="block text-sm">Replacement audio file<input className={fieldClass} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={event => { setFile(event.target.files?.[0] ?? null); preparedUpload.current = null; }} required={!file} /></label>}
        <label className="flex items-start gap-3 text-xs leading-relaxed text-muted"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-accent" required /><span>{PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT}</span></label>
        <p className="flex flex-wrap gap-4 text-xs text-accent"><a href="/legal#terms" target="_blank" rel="noreferrer">Terms</a><a href="/legal#queue-submission" target="_blank" rel="noreferrer">Queue Submission Terms</a><a href="/legal#privacy" target="_blank" rel="noreferrer">Privacy Policy</a></p>
      </fieldset>
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || !canReplace || !accepted} className="min-h-11 border border-cyan-200 bg-cyan-200 px-4 py-2 text-sm font-bold text-background disabled:opacity-50">{busy ? progress === null ? "Saving replacement…" : `Uploading… ${progress}%` : "Save replacement"}</button><button type="button" disabled={busy} onClick={() => { setTarget(null); setError(""); }} className="min-h-11 border border-border px-4 py-2 text-sm disabled:opacity-50">Cancel</button></div>
    </form>}
  </section>;
}
