"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { DEFAULT_BALLAD_OPTIONS, DEFAULT_BALLAD_PRESENTATION, type BalladCommand, type BalladConfig, type BalladDocument, type BalladOptions, type BalladPresentation, type BalladShow } from "@/lib/bnl-ballads";

const inputClass = "w-full rounded border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent";
const buttonClass = "rounded border border-border px-3 py-2 text-xs font-bold text-foreground hover:border-accent disabled:opacity-40 disabled:cursor-wait";
const primaryClass = `${buttonClass} border-accent/60 bg-accent/10 text-accent`;
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-2 text-xs text-muted"><span>{label}</span>{children}</label>; }
function mediaUrl(showId: string, audioId: string) { return `/api/ballads/media?showId=${encodeURIComponent(showId)}&audioId=${encodeURIComponent(audioId)}`; }
function requestStatus(command: BalladCommand, hasVersions: boolean) {
  if (command.status === "queued") {
    return {
      generate: "Draft requested. BNL will use your directions to write lyrics and a Style prompt. They’ll appear below automatically.",
      polish: "Polish requested. BNL will return one light revision below. Your original stays saved.",
      edit: "Saving your edits. This page will update when the new version is saved.",
      restore: "Restoring the selected version. It will appear below as a new saved version.",
    }[command.kind];
  }
  if (command.error?.startsWith("budget_restricted:") || command.error === "local_model_budget_exhausted") {
    const budgetReasons: Record<string, string> = {
      monthly_target_pace: "Monthly spending is ahead of BNL’s target pace.",
      daily_soft_limit: "BNL’s daily spending allowance is used up.",
      monthly_hard_limit: "BNL’s monthly spending limit has been reached.",
      interactive_and_journal_reserve: "The remaining budget is reserved for conversation and the Journal.",
      journal_reserve: "The remaining budget is reserved for the Journal.",
      unpriced_request_model: "The model’s cost could not be estimated.",
      unpriced_monthly_usage: "Some recorded usage still needs a cost estimate.",
    };
    const reason = budgetReasons[command.error.split(":")[1]] ?? "BNL’s model budget is currently unavailable.";
    return `Budget protection stopped this request before it reached Gemini. ${reason} ${hasVersions ? "Your saved versions are intact. " : ""}Try again once budget is available.`;
  }
  const reasons: Record<string, string> = {
    generation_unavailable_try_manually: "BNL couldn’t generate this draft.",
    finalized_public_show_evidence_unavailable: "BNL couldn’t load this show’s source record.",
    draft_changed_reload_workspace: "A newer draft was saved. Reload the workspace before trying again.",
    interrupted_generation_use_generate_to_retry: "The writing request was interrupted.",
    TimeoutError: "The writing request timed out.",
  };
  const reason = reasons[command.error ?? ""] ?? "The last request couldn’t finish.";
  const retry = {
    generate: `Choose ${hasVersions ? "Generate new draft" : "Generate draft"} to try again.`,
    polish: "Choose Polish saved draft to try again.",
    edit: "Choose Save edits to try again.",
    restore: "Choose Confirm restore as new version to try again.",
  }[command.kind];
  return `${reason} ${hasVersions ? "Your saved versions are intact. " : ""}${retry}`;
}

type Snapshot = { shows: BalladShow[]; show: BalladShow | null; document: BalladDocument | null; config: BalladConfig };
type PendingUpload = { url: string; filename: string; duration: number | null; versionId: string };
export function BNLBalladWorkspace({ initialShowId = "" }: { initialShowId?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [showChoice, setShowChoice] = useState(initialShowId);
  const [versionChoice, setVersionChoice] = useState("");
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("");
  const [palette, setPalette] = useState<Record<string, string>>({});
  const [options, setOptions] = useState<BalladOptions>({ ...DEFAULT_BALLAD_OPTIONS });
  const [presentation, setPresentation] = useState<BalladPresentation>({ ...DEFAULT_BALLAD_PRESENTATION });
  const [automation, setAutomation] = useState(false);
  const [audioChoice, setAudioChoice] = useState("");
  const [uploadVersion, setUploadVersion] = useState("");
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirtySections, setDirtySections] = useState<string[]>([]);
  const dirty = dirtySections.length > 0;
  const dirtyRef = useRef(false);
  const dirtyParts = useRef(new Set<string>());
  const markDirty = (part = "draft") => { dirtyParts.current.add(part); dirtyRef.current = true; setDirtySections([...dirtyParts.current]); };
  const clearDirty = (part?: string) => {
    if (part) dirtyParts.current.delete(part); else dirtyParts.current.clear();
    dirtyRef.current = dirtyParts.current.size > 0; setDirtySections([...dirtyParts.current]);
  };
  const doc = snapshot?.document;
  const pending = Boolean(doc?.commands.some(c => c.status === "queued"));

  const install = useCallback((data: Snapshot, reset: boolean) => {
    setSnapshot(data);
    if (reset) {
      const latest = data.document?.versions.at(-1);
      const queuedEdit = data.document?.commands.find(c => c.status === "queued" && c.kind === "edit")?.content;
      setTitle(queuedEdit?.title ?? latest?.title ?? "");
      setLyrics(queuedEdit?.lyrics ?? latest?.lyrics ?? "");
      setStyle(queuedEdit?.style ?? latest?.style ?? "");
      setPalette(queuedEdit?.palette ?? latest?.palette ?? {});
      setVersionChoice(latest?.id ?? ""); setUploadVersion(latest?.id ?? "");
      setOptions(data.document?.options ?? { ...DEFAULT_BALLAD_OPTIONS });
      setPresentation(data.document?.presentation ?? { ...DEFAULT_BALLAD_PRESENTATION });
      setAudioChoice(data.document?.selectedAudioId ?? "");
      setAutomation(data.config.enabled);
      setShowChoice(data.show?.sessionId ?? initialShowId);
    }
  }, [initialShowId]);
  const load = useCallback(async (id: string, reset: boolean) => {
    const response = await fetch(`/api/admin/ballads?showId=${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Workspace unavailable.");
    install(data, reset);
  }, [install]);
  useEffect(() => { load(initialShowId, true).catch(e => setError(e.message)); }, [initialShowId, load]);
  useEffect(() => {
    if (!pending || !doc) return;
    const timer = setInterval(() => { load(doc.showId, !dirtyRef.current).catch(e => setError(e.message)); }, 6000);
    return () => clearInterval(timer);
  }, [pending, doc, load]);
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault(); };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, []);

  async function act(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/ballads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ showId: doc?.showId, revision: doc?.revision, action, ...payload }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save.");
      if (data.document && snapshot) setSnapshot({ ...snapshot, document: data.document });
      if (data.config && snapshot) setSnapshot({ ...snapshot, config: data.config });
      setMessage(["generate", "polish", "edit", "restore"].includes(action) ? "" : action === "saveOptions" ? `Directions saved for this show. Choose ${doc?.versions.length ? "Generate new draft" : "Generate draft"} when you’re ready for BNL to write.` : action === "saveAutomation" ? `After-show automation ${payload.enabled ? "enabled" : "disabled"}.` : action === "savePresentation" ? `Release details saved. Use ${doc?.published ? "Publish updated details" : "Publish ballad"} to put them on the site.` : action === "publish" ? "Ballad published with the confirmed audio and its saved lyrics." : action === "archive" ? "Song archived. This show’s single song slot is empty." : action === "archiveReplace" ? "Previous song archived. Replacement confirmed in this show’s song slot." : "Saved and confirmed.");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); return false; }
    finally { setBusy(false); }
  }
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setMessage(`${label} copied.`); }
    catch { setError("Clipboard unavailable. Select the text and copy it manually."); }
  }
  async function uploadAudio(file: File) {
    if (!doc || !uploadVersion) return;
    setBusy(true); setError("");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const result = await upload(`bnl-ballads/${doc.showId}/${safeName}`, file, { access: "private", handleUploadUrl: "/api/admin/ballads/upload", clientPayload: JSON.stringify({ showId: doc.showId, versionId: uploadVersion }) });
      const duration = await new Promise<number | null>(resolve => {
        const url = URL.createObjectURL(file); const audio = new Audio(url);
        const timeout = window.setTimeout(() => done(null), 5000);
        const done = (value: number | null) => { clearTimeout(timeout); URL.revokeObjectURL(url); audio.removeAttribute("src"); resolve(value); };
        audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
        audio.onerror = () => done(null);
      });
      setPendingUpload({ url: result.url, filename: file.name, duration, versionId: uploadVersion });
      setMessage("Upload complete. Confirm attachment to this show below.");
    } catch { setError("Audio upload failed. Please try the file again."); }
    finally { setBusy(false); }
  }
  const lastCommand = doc?.commands.at(-1);
  const selectedTake = doc?.audio.find(a => a.id === audioChoice);
  const selectedTakeVersion = doc?.versions.find(v => v.id === selectedTake?.versionId);
  return <fieldset disabled={busy} className="space-y-6" aria-label="BNL Broadcast Ballads workspace">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs uppercase tracking-[0.28em] text-accent">BNL-01 / Recording desk</p><h2 className="mt-2 text-3xl font-black text-foreground">Broadcast Ballads</h2><p className="mt-2 max-w-2xl text-sm text-muted">One broadcast. A new BNL original. Shape the words, find the sound, choose the take.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/admin" className={buttonClass}>Admin dashboard</Link><Link href="/radio/ballads" className={buttonClass}>View discography ↗</Link></div>
    </div>
    {error && <p role="alert" className="rounded border border-red-400/50 bg-red-400/5 p-3 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="rounded border border-accent/40 p-3 text-sm text-accent">{message}</p>}
    {!snapshot ? <p className="text-muted">{error ? "Use Reload workspace to try again." : "Loading the recording desk…"}</p> : <>
      <div className="grid gap-4 rounded border border-border bg-surface p-4 md:grid-cols-[1fr_auto] md:items-end">
        <Field label="Selected broadcast"><select className={inputClass} value={showChoice} onChange={e => setShowChoice(e.target.value)}><option value="">Choose a finalized public show</option>{snapshot.shows.map(show => <option key={show.sessionId} value={show.sessionId}>{show.title}</option>)}</select></Field>
        <button type="button" className={primaryClass} disabled={busy || !showChoice} onClick={() => {
          if ((dirty || pendingUpload) && !window.confirm("Switch shows and discard unsaved local changes? Saved drafts remain available.")) return;
          clearDirty(); setPendingUpload(null); setMessage(""); setError(""); load(showChoice, true).catch(e => setError(e.message));
        }}>Confirm show</button>
      </div>
      <details className="rounded border border-border p-4"><summary className="cursor-pointer text-sm font-bold text-foreground">After-show automation · {snapshot.config.enabled ? "On" : "Off"}</summary>
        <div className="mt-4 flex flex-wrap items-center gap-4"><label className="text-sm text-muted"><input type="checkbox" checked={automation} onChange={e => { setAutomation(e.target.checked); markDirty("automation"); }} className="mr-2" />Create a draft after each future finalized public show</label><button type="button" disabled={busy} className={buttonClass} onClick={async () => { if (await act("saveAutomation", { enabled: automation, revision: snapshot.config.revision })) clearDirty("automation"); }}>Save automation</button></div>
        <p className="mt-3 text-xs text-muted">BNL writes the draft automatically. You choose the audio and publish the release. Earlier broadcasts can be generated individually.</p>
      </details>
      {doc && snapshot.show ? <>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><div><span className="font-bold text-foreground">{snapshot.show.title}</span><span className="ml-3 text-muted">{doc.published ? "Published" : "Private draft"} · {doc.versions.length} saved versions</span></div><Link href={`/admin/show-management/session/${encodeURIComponent(doc.showId)}`} className="text-xs text-accent">Show report ↗</Link></div>
        {lastCommand && (pending || lastCommand.status === "failed") && <div role={pending ? "status" : "alert"} className={`rounded border p-3 text-sm ${pending ? "border-accent/40 text-accent" : "border-amber-300/40 text-amber-300"}`}><p>{requestStatus(lastCommand, Boolean(doc.versions.length))}</p>{lastCommand.status === "failed" && lastCommand.error && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Error details</summary><p className="mt-2 break-words font-mono">{lastCommand.error}</p></details>}</div>}
        <section className="space-y-4 rounded border border-border p-5">
          <div><h3 className="text-lg font-bold text-foreground">Creative direction</h3><p className="mt-1 text-sm text-muted">Optional. Leave these blank to let BNL choose the sound and angle.</p></div>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Genre blend / musical direction"><input className={inputClass} value={options.genres} placeholder="Let BNL choose, or give the sound a direction" onChange={e => { setOptions({ ...options, genres: e.target.value }); markDirty("options"); }} /></Field><Field label="Era"><input className={inputClass} value={options.era} placeholder="BNL chooses within 1970–2010 by default" onChange={e => { setOptions({ ...options, era: e.target.value }); markDirty("options"); }} /></Field></div>
          <Field label="Angle, mood, moments or a wild idea"><textarea rows={3} className={inputClass} value={options.direction} onChange={e => { setOptions({ ...options, direction: e.target.value }); markDirty("options"); }} placeholder="Give BNL a starting point—or leave him room to surprise you." /></Field>
          {(doc.versions.length > 0 || options.feedback) && <Field label="Feedback for the next draft or polish"><textarea rows={2} className={inputClass} value={options.feedback} onChange={e => { setOptions({ ...options, feedback: e.target.value }); markDirty("options"); }} placeholder="What should BNL keep? What should change?" /></Field>}
          <div className="flex flex-wrap items-start justify-between gap-5 border-t border-border pt-4">
            <div className="space-y-2"><button type="button" disabled={busy} className={buttonClass} onClick={async () => { if (await act("saveOptions", { options })) clearDirty("options"); }}>Save directions</button><p className="text-xs text-muted">Keep these notes for later.</p>{dirtySections.includes("options") && <p className="text-xs text-amber-300">Unsaved directions</p>}</div>
            <div className="max-w-sm space-y-2"><button type="button" disabled={busy || pending} className={primaryClass} onClick={async () => { if (await act("generate", { options })) clearDirty("options"); }}>{doc.versions.length ? "Generate new draft" : "Generate draft"}</button><p className="text-xs text-muted">Saves these directions and writes lyrics + a Style prompt.{doc.versions.length > 0 && " Previous versions stay saved."}</p></div>
          </div>
        </section>
        <section className="space-y-4 rounded border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-foreground">Lyrics & Style</h3><a href="https://suno.com/create" target="_blank" rel="noopener noreferrer" className={primaryClass}>Open Suno ↗</a></div>
          <Field label="Title"><input className={inputClass} value={title} onChange={e => { setTitle(e.target.value); markDirty(); }} placeholder="BNL-01 — your next original" /></Field>
          <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
            <div><div className="mb-2 flex items-center justify-between"><label htmlFor={`lyrics-${doc.showId}`} className="text-xs font-bold text-muted">Lyrics</label><button type="button" className={buttonClass} onClick={() => copy(lyrics, "Lyrics")}>Copy lyrics</button></div><textarea id={`lyrics-${doc.showId}`} rows={22} value={lyrics} onChange={e => { setLyrics(e.target.value); markDirty(); }} className={`${inputClass} font-mono leading-relaxed`} placeholder="BNL’s lyrics arrive here. Edit freely." /></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><label htmlFor={`style-${doc.showId}`} className="text-xs font-bold text-muted">Style prompt</label><button type="button" className={buttonClass} onClick={() => copy(style, "Style prompt")}>Copy style</button></div><textarea id={`style-${doc.showId}`} rows={9} value={style} onChange={e => { setStyle(e.target.value); markDirty(); }} className={`${inputClass} leading-relaxed`} placeholder="The separate, paste-ready sound direction." /><p className="text-xs text-muted">{style.length} characters · BNL aims for 250–400</p>
              <p className="text-xs leading-relaxed text-muted">Save the exact lyrics and Style you use in Suno. Your chosen audio will be linked to that saved version.</p>
              {doc.versions.find(v => v.id === versionChoice)?.note && <p className="text-xs text-muted">{doc.versions.find(v => v.id === versionChoice)?.note}</p>}
              <button type="button" disabled={busy || pending || !doc.versions.length} className={buttonClass} onClick={async () => { if (await act("polish", { options })) clearDirty("options"); }}>Polish saved draft</button>
              <p className="text-xs text-muted">Saves your directions and feedback, then lightly revises the latest saved draft once. Keeps the original.</p>
            </div>
          </div>
          <details className="rounded border border-border p-3"><summary className="cursor-pointer text-sm text-foreground">Catalog notes · topics, hooks & sound</summary><div className="mt-4 grid gap-3 md:grid-cols-2">{["angle", "hook", "topics", "imagery", "genres", "era", "arrangement"].map(key => <Field key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}><input className={inputClass} value={palette[key] ?? ""} onChange={e => { setPalette({ ...palette, [key]: e.target.value }); markDirty("draft"); }} /></Field>)}</div><p className="mt-3 text-xs text-muted">Saved with the draft. These describe the song and help BNL explore different ideas next time.</p></details>
          <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy || pending || !title.trim() || !lyrics.trim()} className={primaryClass} onClick={async () => { if (await act("edit", { content: { title, lyrics, style, palette } })) clearDirty("draft"); }}>Save edits</button><button type="button" className={buttonClass} onClick={() => copy(`${title}\n\n${lyrics}\n\nStyle\n${style}`, "Song package")}>Copy full package</button>{dirtySections.includes("draft") && <span className="text-xs text-amber-300">Unsaved lyric, Style or catalog edits</span>}</div>
          {!!doc.versions.length && <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4"><div className="min-w-64 flex-1"><Field label="Version history"><select className={inputClass} value={versionChoice} onChange={e => setVersionChoice(e.target.value)}>{doc.versions.map(v => <option value={v.id} key={v.id}>Version {v.ordinal} · {v.kind} · {v.title}</option>)}</select></Field></div><button type="button" className={buttonClass} onClick={() => { const v = doc.versions.find(v => v.id === versionChoice); if (v && (!dirty || window.confirm("Load this version over unsaved local changes?"))) { setTitle(v.title); setLyrics(v.lyrics); setStyle(v.style); setPalette(v.palette); markDirty("draft"); } }}>Load version</button><button type="button" disabled={busy || pending} className={buttonClass} onClick={() => act("restore", { restoreVersion: versionChoice })}>Confirm restore as new version</button></div>}
        </section>
        <section className="space-y-4 rounded border border-border p-5"><h3 className="text-lg font-bold text-foreground">Upload & choose audio</h3><p className="text-sm text-muted">Create and select your song in Suno, then bring the MP3 or WAV here. Alternate takes stay available.</p>
          <Field label="Saved prompt version used for this audio"><select className={inputClass} value={uploadVersion} onChange={e => setUploadVersion(e.target.value)}><option value="">Choose a saved version</option>{doc.versions.map(v => <option key={v.id} value={v.id}>Version {v.ordinal} · {v.title}</option>)}</select></Field>
          <Field label="Upload audio · MP3 / WAV · up to 100 MB"><input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" disabled={busy || !uploadVersion} className={inputClass} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadAudio(file); e.target.value = ""; }} /></Field>
          {pendingUpload && <div className="space-y-2 rounded border border-accent/50 p-3"><p className="text-sm text-foreground">{pendingUpload.filename} → {snapshot.show.title} · Version {doc.versions.find(v => v.id === pendingUpload.versionId)?.ordinal}</p><button type="button" disabled={busy} className={primaryClass} onClick={async () => { if (await act("attachAudio", pendingUpload)) setPendingUpload(null); }}>Confirm upload & show attachment</button></div>}
          {!!doc.audio.length && <><Field label="Saved takes"><select className={inputClass} value={audioChoice} onChange={e => setAudioChoice(e.target.value)}><option value="">Choose a take</option>{doc.audio.map(a => <option key={a.id} value={a.id}>{a.filename} · Version {doc.versions.find(v => v.id === a.versionId)?.ordinal}{a.id === doc.selectedAudioId ? " · Confirmed" : ""}</option>)}</select></Field>{selectedTake && <><audio className="w-full" controls preload="metadata" src={mediaUrl(doc.showId, selectedTake.id)} /><p className="text-xs text-muted">{selectedTakeVersion?.title} · {selectedTake.duration ? `${Math.floor(selectedTake.duration / 60)}:${String(Math.floor(selectedTake.duration % 60)).padStart(2, "0")}` : "Duration available in player"}</p></>}{!doc.selectedAudioId ? <button type="button" disabled={busy || !audioChoice} className={primaryClass} onClick={() => act("selectAudio", { audioId: audioChoice })}>Confirm song for this show</button> : <div className="space-y-3"><p className="text-sm font-bold text-accent">One song slot · selection locked</p><p className="text-xs text-muted">Chosen: {doc.audio.find(a => a.id === doc.selectedAudioId)?.filename}. It stays this show’s song until you archive it.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={() => { if (window.confirm("Archive the chosen song and clear this show’s song slot? Its audio and lyrics stay in history; the public release is removed.")) void act("archive"); }}>Archive song</button><button type="button" disabled={busy || !audioChoice || audioChoice === doc.selectedAudioId} className={primaryClass} onClick={() => { if (window.confirm("Archive the chosen song and put this take in the single song slot? The replacement stays private until you publish it.")) void act("archiveReplace", { audioId: audioChoice }); }}>Archive & replace with this take</button></div></div>}</>}
        </section>
        {!!doc.archivedSongs.length && <details className="rounded border border-border p-5"><summary className="cursor-pointer text-sm font-bold text-foreground">Archived songs · {doc.archivedSongs.length}</summary><div className="mt-4 space-y-3">{doc.archivedSongs.map((entry, i) => { const v = doc.versions.find(v => v.id === entry.versionId); const a = doc.audio.find(a => a.id === entry.audioId); return <div key={`${entry.audioId}-${i}`} className="rounded border border-border p-3"><p className="text-sm text-foreground">BNL-01 — {v?.title} · Version {v?.ordinal}</p><p className="mt-1 text-xs text-muted">Archived {new Date(entry.archivedAt).toLocaleString()} · {a?.filename}</p>{a && <audio className="mt-3 w-full" controls preload="none" src={mediaUrl(doc.showId, a.id)} />}<details className="mt-3 text-xs text-muted"><summary className="cursor-pointer">Archived lyrics & Style</summary><p className="mt-3 whitespace-pre-wrap">{v?.lyrics}</p><p className="mt-3">{v?.style}</p></details></div>; })}</div></details>}
        <section className="space-y-4 rounded border border-border p-5"><h3 className="text-lg font-bold text-foreground">Release details</h3>
          {([ ["credits", "Credits"], ["artworkUrl", "Artwork URL (optional, HTTPS)"], ["sunoUrl", "Suno song link (optional)"], ["sunoModel", "Suno model (optional)"], ["sunoSettings", "Suno settings / production notes (optional)"] ] as [keyof BalladPresentation, string][]).map(([key, label]) => <Field key={key} label={label}><input className={inputClass} value={presentation[key]} onChange={e => { setPresentation({ ...presentation, [key]: e.target.value }); markDirty("presentation"); }} /></Field>)}
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={buttonClass} onClick={async () => { if (await act("savePresentation", { presentation })) clearDirty("presentation"); }}>Save release details</button><button type="button" disabled={busy || !doc.selectedAudioId} className={primaryClass} onClick={() => { if (window.confirm("Publish the confirmed take, its saved lyrics and the saved release details?")) void act("publish"); }}>{doc.published ? "Publish updated details" : "Publish ballad"}</button></div>
          <p className="text-xs text-muted">Published lyrics follow the confirmed take’s saved prompt version. Later draft edits stay private until you publish an updated release.</p>
        </section>
      </> : <p className="rounded border border-border p-5 text-sm text-muted">Choose a finalized public broadcast to begin. Rehearsals remain in the show review.</p>}
    </>}
    <button type="button" className={buttonClass} disabled={busy} onClick={() => load(doc?.showId || initialShowId, !dirtyRef.current).catch(e => setError(e.message))}>Reload workspace</button>
  </fieldset>;
}
