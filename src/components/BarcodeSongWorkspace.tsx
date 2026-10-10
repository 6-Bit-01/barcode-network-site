"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { OwnerWorkspaceNavigation } from "@/components/OwnerWorkspaceNavigation";
import { CrewWorkspaceNavigation } from "@/components/CrewWorkspaceNavigation";
import type { MemberAccess } from "@/lib/member-access";
import { countLyricsWords, parseSongDraft, type SongDraft, type SongOptions, type SongRequest, type SongText } from "@/lib/barcode-song-contract";

const blank: SongText = { title: "", lyrics: "", style: "" };
const directions: [keyof SongOptions, string, string][] = [
 ["idea", "Idea or topic", "Leave blank and let BNL choose."],
 ["musicalDirection", "Genre, year or musical direction", "Genre, specific year or year range, instruments or influences. Optional."],
 ["mood", "Mood", "Optional tone or atmosphere."],
 ["lengthStructure", "Length and structure", "Optional sections or timing. Written toward five minutes or less."],
 ["revisionInstructions", "Changes for the next pass", "What should BNL change? Optional."]
];
type ArchiveSort = "newest" | "oldest" | "title";
type CopyKind = "lyrics" | "style" | "song";
type CopyFeedback = { value: string; state: "copying" | "copied" | "failed" };
const buttonStyle = "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 transition hover:border-accent hover:bg-accent/10 active:translate-y-0.5 active:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";
const actionLabels: Record<SongRequest["kind"], string> = { generate: "Generating song…", lyrics: "Regenerating lyrics…", style: "Regenerating style prompt…", undo: "Restoring previous result…", select: "Opening track…" };
const copyText = (kind: CopyKind, value: SongText) => kind === "song" ? (value.title.trim() || value.lyrics.trim() || value.style.trim() ? value.title + "\n\n" + value.lyrics + "\n\nSuno style prompt\n" + value.style : "") : value[kind];
const spinner = <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />;
function legacyCopy(value: string) {
 const previous = document.activeElement as HTMLElement | null;
 const field = document.createElement("textarea");
 field.value = value;
 field.setAttribute("readonly", "");
 field.setAttribute("aria-hidden", "true");
 field.style.position = "fixed";
 field.style.left = "-9999px";
 try {
  document.body.appendChild(field);
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, value.length);
  return document.execCommand("copy");
 } catch { return false; }
 finally { field.remove(); try { previous?.focus?.({ preventScroll: true }); } catch { /* A removed control may no longer accept focus. */ } }
}
const errorMessage = (code: string | null) => code === "BUDGET_UNAVAILABLE" ? "BNL's creative budget is unavailable. Your saved song is safe."
 : code === "AUTHORITY_REVOKED" ? "Your tool access changed. Return to your account."
 : code === "LYRICS_TOO_LONG" ? "The result exceeded 2,000 lyric words. Your previous song is safe."
 : code === "GENERATION_INTERRUPTED" ? "Generation was interrupted. Your previous song is safe; you can request a new pass."
 : code === "TRACK_NOT_FOUND" ? "This saved track is no longer available. Refresh your archive."
 : code === "SONG_BASE_CONFLICT" ? "Your saved song changed. Refresh before requesting another pass."
 : "BNL couldn't finish this pass. Your previous song is safe. Try again.";

export function BarcodeSongWorkspace({ access }: { access: MemberAccess }) {
 const [draft, setDraft] = useState<SongDraft | null>(null);
 const [text, setText] = useState<SongText>(blank);
 const [options, setOptions] = useState<SongOptions>({});
 const [sort, setSort] = useState<ArchiveSort>("newest");
 const [authorized, setAuthorized] = useState(true);
 const [navigationProjection, setNavigationAccess] = useState<{ input: MemberAccess; value: MemberAccess } | null>({ input: access, value: access });
 const navigationAccess = navigationProjection?.input === access ? navigationProjection.value : access;
 const navigationInput = useRef(access);
 useLayoutEffect(() => { navigationInput.current = access; }, [access]);
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState("");
 const [activeOperation, setActiveOperation] = useState<SongRequest | null>(null);
 const [refreshing, setRefreshing] = useState(false);
 const [copyFeedback, setCopyFeedback] = useState<Partial<Record<CopyKind, CopyFeedback>>>({});
 const copySequence = useRef<Record<CopyKind, number>>({ lyrics: 0, style: 0, song: 0 });
 const currentText = useRef<SongText>(blank);
 const lyricsField = useRef<HTMLTextAreaElement | null>(null), styleField = useRef<HTMLTextAreaElement | null>(null), wholeSongField = useRef<HTMLTextAreaElement | null>(null);
 const [retry, setRetry] = useState<SongRequest | null>(null);
 const epoch = useRef(0), mounted = useRef(true), inFlight = useRef(false), needsSync = useRef(true), mayRead = useRef(true), readSequence = useRef(0), latestRevision = useRef(0);

 const loseAccess = useCallback(() => {
  epoch.current++;
  mayRead.current = false;
  setAuthorized(false);
  setNavigationAccess(null);
  setDraft(null);
  currentText.current = blank;
  setText(blank);
  setOptions({});
  setRetry(null);
  setActiveOperation(null);
  setCopyFeedback({});
  setRefreshing(false);
  setMessage("");
  window.location.assign("/account");
 }, []);
 const readDraft = useCallback(async () => {
  if (!mayRead.current) return;
  const version = epoch.current, sequence = ++readSequence.current;
  try {
   const response = await fetch("/api/member/tools/songs", { credentials: "same-origin", cache: "no-store" });
   if (!mounted.current || version !== epoch.current || sequence !== readSequence.current) return;
   if (response.status === 401 || response.status === 403) { loseAccess(); return; }
   if (!response.ok) throw Error();
   const data = parseSongDraft((await response.json()).draft);
   if (!mounted.current || version !== epoch.current || sequence !== readSequence.current || data.revision < latestRevision.current) return;
   latestRevision.current = data.revision;
   needsSync.current = inFlight.current;
   if (!data.pending && !inFlight.current) setActiveOperation(null);
   setDraft(data);
   currentText.current = { title: data.title, lyrics: data.lyrics, style: data.style };
   setText(currentText.current);
   setOptions(data.options);
   setMessage(data.errorCode ? errorMessage(data.errorCode) : "");
  } catch {
   if (mounted.current && version === epoch.current && sequence === readSequence.current) setMessage("Your song workspace is temporarily unavailable. Refresh to try again.");
  }
 }, [loseAccess]);
 useEffect(() => {
  mounted.current = true;
  epoch.current++;
  void readDraft();
  async function verify() {
   epoch.current++;
   mayRead.current = false;
   setAuthorized(false);
   setNavigationAccess(null);
   const version = epoch.current, input = navigationInput.current;
   try {
    const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store" });
    const current = response.ok ? await response.json() : null;
    if (!mounted.current || version !== epoch.current) return;
    if (current?.user?.id !== access.user.id || !(Date.parse(current.session?.expiresAt) > Date.now()) || !current.access?.availablePermissions?.includes("song.generate") || !(current.access.owner || (current.access.crew && current.access.permissions?.includes("song.generate")))) { loseAccess(); return; }
    mayRead.current = true;
    setAuthorized(true);
    setNavigationAccess({ input, value: current });
    if (needsSync.current) void readDraft();
   } catch {
    if (mounted.current && version === epoch.current) setMessage("Access could not be checked. Return to your account or refresh.");
   }
  }
  window.addEventListener("focus", verify);
  window.addEventListener("pageshow", verify);
  return () => {
   mounted.current = false;
   window.removeEventListener("focus", verify);
   window.removeEventListener("pageshow", verify);
  };
 }, [access.user.id, loseAccess, readDraft]);
 const pendingId = draft?.pending?.id;
 useEffect(() => {
  if (!authorized || !pendingId) return;
  let cancelled = false;
  let timer: number;
  async function poll() { await readDraft(); if (!cancelled) timer = window.setTimeout(() => void poll(), 2500); }
  timer = window.setTimeout(() => void poll(), 2500);
  return () => { cancelled = true; window.clearTimeout(timer); };
 }, [authorized, pendingId, readDraft]);

 async function send(operation: SongRequest) {
  if (inFlight.current || !authorized) return;
  inFlight.current = true;
  needsSync.current = true;
  setBusy(true);
  setActiveOperation(operation);
  setMessage("");
  const version = epoch.current;
  let awaitingResult = false;
  try {
   const response = await fetch("/api/member/tools/songs", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(operation) });
   if (!mounted.current || version !== epoch.current) return;
   if (response.status === 401 || response.status === 403) { loseAccess(); return; }
   if (response.status >= 500) { setRetry(operation); setMessage("The request wasn't confirmed. Retry the same request safely."); return; }
   if (!response.ok) {
    let code: string | null = null;
    try { const data = await response.json(); code = typeof data.code === "string" ? data.code : null; } catch { /* An error response may have no JSON body. */ }
    if (!mounted.current || version !== epoch.current) return;
    setRetry(null);
    setMessage(code === "TRACK_NOT_FOUND" || code === "SONG_BASE_CONFLICT" ? errorMessage(code) : response.status === 409 ? "The song workspace changed. Refresh before requesting another pass or opening a track." : "The request wasn't accepted. Check the fields and try again.");
    return;
   }
   const next = parseSongDraft((await response.json()).draft);
   if (!mounted.current || version !== epoch.current) return;
   needsSync.current = false;
   setRetry(null);
   readSequence.current++;
   if (next.revision < latestRevision.current) return;
   latestRevision.current = next.revision;
   awaitingResult = !!next.pending;
   setDraft(next);
   currentText.current = { title: next.title, lyrics: next.lyrics, style: next.style };
   setText(currentText.current);
   setOptions(next.options);
   setMessage(next.errorCode ? errorMessage(next.errorCode) : "");
  } catch {
   if (mounted.current && version === epoch.current) { setRetry(operation); setMessage("The request wasn't confirmed. Retry the same request safely."); }
  } finally {
   inFlight.current = false;
   if (mounted.current) {
    setBusy(false);
    if (!awaitingResult && version === epoch.current) setActiveOperation(null);
    if (version !== epoch.current) { needsSync.current = true; if (mayRead.current) void readDraft(); }
   }
  }
 }
 const words = countLyricsWords(text.lyrics), overLimit = words > 2000, disabled = !authorized || !draft || busy || !!draft.pending || !!retry;
 function request(kind: Exclude<SongRequest["kind"], "select">) {
  if (disabled || (kind !== "undo" && overLimit)) return;
  void send({ requestId: crypto.randomUUID(), expectedRevision: draft!.revision, kind, ...(kind === "undo" ? {} : { options, base: text }) });
 }
 function openTrack(trackId: string) {
  if (disabled) return;
  void send({ requestId: crypto.randomUUID(), expectedRevision: draft!.revision, kind: "select", trackId });
 }
 async function refresh() {
  if (refreshing || !authorized) return;
  setRefreshing(true);
  try { await readDraft(); }
  finally { if (mounted.current) setRefreshing(false); }
 }
 async function copy(kind: CopyKind) {
  const value = copyText(kind, currentText.current);
  if (!value.trim() || !authorized || (copyFeedback[kind]?.value === value && copyFeedback[kind]?.state === "copying")) return;
  const version = epoch.current, sequence = ++copySequence.current[kind];
  const current = () => mounted.current && version === epoch.current && sequence === copySequence.current[kind] && copyText(kind, currentText.current) === value;
  setCopyFeedback(previous => ({ ...previous, [kind]: { value, state: "copying" } }));
  let copied = false;
  try {
   if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); copied = true; }
  } catch { /* Browser permissions may deny the modern clipboard API. */ }
  if (!current()) {
   if (mounted.current && sequence === copySequence.current[kind]) setCopyFeedback(previous => ({ ...previous, [kind]: undefined }));
   return;
  }
  if (!copied) copied = legacyCopy(value);
  if (current()) setCopyFeedback(previous => ({ ...previous, [kind]: { value, state: copied ? "copied" : "failed" } }));
 }
 function copyControl(kind: CopyKind, label: string, copiedLabel: string) {
  const value = copyText(kind, text), feedback = copyFeedback[kind]?.value === value ? copyFeedback[kind] : undefined;
  const copying = feedback?.state === "copying", failed = feedback?.state === "failed";
  const statusId = "song-copy-" + kind;
  const field = kind === "lyrics" ? lyricsField : kind === "style" ? styleField : wholeSongField;
  return <div className="space-y-2">
   <button type="button" aria-label={label} aria-describedby={statusId} aria-busy={copying} disabled={!value.trim() || copying} onClick={() => void copy(kind)} className={buttonStyle + " text-accent"}>
    {copying && spinner}{label}{copying ? " · Copying…" : feedback?.state === "copied" ? " · Copied ✓" : failed ? " · Copy failed" : ""}
   </button>
   <p id={statusId} role="status" aria-live="polite" className="text-sm text-muted">{copying ? "Copying…" : feedback?.state === "copied" ? copiedLabel + " copied." : failed ? "Copy wasn't available. Select text, then use your device's Copy command." : ""}</p>
   {failed && <>
    {kind === "song" && <textarea aria-label="Whole song for manual copying" ref={wholeSongField} value={value} readOnly rows={6} className="block w-full rounded border border-border bg-background p-3 font-mono text-sm" />}
    <button type="button" onClick={() => { field.current?.focus({ preventScroll: true }); field.current?.select(); }} className={buttonStyle + " text-accent"}>Select {kind === "style" ? "style prompt" : kind === "song" ? "whole song" : "lyrics"}</button>
   </>}
  </div>;
 }
 const waiting = busy || !!draft?.pending;
 const actionWorking = (kind: SongRequest["kind"]) => waiting && activeOperation?.kind === kind;
 const actionContent = (kind: SongRequest["kind"], label: string) => <>{actionWorking(kind) && spinner}{actionWorking(kind) ? actionLabels[kind] : label}</>;
 const actionStyle = (kind: SongRequest["kind"]) => buttonStyle + (actionWorking(kind) ? " border-accent text-accent ring-1 ring-accent disabled:cursor-wait disabled:opacity-100" : "");
 const tracks = [...(draft?.tracks ?? [])].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) || b.createdAt - a.createdAt || a.id.localeCompare(b.id) : (sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt) || a.id.localeCompare(b.id));

 return <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
  {access.access.owner ? <OwnerWorkspaceNavigation section="songs" /> : authorized && navigationAccess ? <CrewWorkspaceNavigation access={navigationAccess} section="songs" /> : <Link href="/account" className="text-accent underline">Your account</Link>}
  <p className="public-kicker mt-6">BARCODE Network</p><h1 className="mt-2 text-3xl font-bold">BNL song generator</h1>
  <p className="mt-3 text-muted">Give BNL a direction, or leave everything blank and let him make a song from his public BARCODE knowledge. Create and refine lyrics and a Suno style prompt, then copy them to make your recording.</p>
  <p className="mt-2 text-sm text-muted">Saved to your account. Lyrics: up to 2,000 words. Written toward five minutes or less; your recording tool determines the final duration.</p>
  {message && <p role="status" className="mt-4 rounded-lg border border-border p-3">{message}</p>}
  {!authorized ? <p role="status" className="mt-8">Checking your access. Return to your account if it is unavailable.</p> : <>
   <fieldset disabled={disabled} className="mt-8 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
    <legend className="px-2 text-lg font-bold">Optional directions</legend>
    {directions.map(([key, label, placeholder]) => <label key={key} className={key === "revisionInstructions" ? "sm:col-span-2" : ""}><span className="mb-2 block font-semibold">{label}</span><textarea value={options[key] ?? ""} maxLength={6000} rows={key === "revisionInstructions" ? 2 : 3} placeholder={placeholder} onChange={event => setOptions({ ...options, [key]: event.target.value })} className="w-full rounded border border-border bg-background p-3" /></label>)}
   </fieldset>
   <div className="mt-4 flex flex-wrap gap-3">
    <button aria-label="Generate song" aria-busy={actionWorking("generate")} disabled={disabled || overLimit} onClick={() => request("generate")} className={actionStyle("generate") + (actionWorking("generate") ? "" : " bg-accent font-bold text-background")}>{actionContent("generate", "Generate song")}</button>
    <button aria-label="Regenerate lyrics" aria-busy={actionWorking("lyrics")} disabled={disabled || overLimit || !text.lyrics.trim()} onClick={() => request("lyrics")} className={actionStyle("lyrics")}>{actionContent("lyrics", "Regenerate lyrics")}</button>
    <button aria-label="Regenerate style prompt" aria-busy={actionWorking("style")} disabled={disabled || overLimit || !text.lyrics.trim()} onClick={() => request("style")} className={actionStyle("style")}>{actionContent("style", "Regenerate style prompt")}</button>
    <button aria-label="Undo previous result" aria-busy={actionWorking("undo")} disabled={disabled || !draft?.previous} onClick={() => request("undo")} className={actionStyle("undo")}>{actionContent("undo", "Undo previous result")}</button>
    <button aria-label="Refresh draft" aria-busy={refreshing} disabled={busy || !!draft?.pending || refreshing} onClick={() => void refresh()} className={buttonStyle + (refreshing ? " border-accent text-accent disabled:cursor-wait disabled:opacity-100" : "")}>{refreshing && spinner}{refreshing ? "Refresh draft · Refreshing…" : "Refresh draft"}</button>
    {retry && <button aria-label="Retry unconfirmed request" aria-busy={busy} disabled={busy} onClick={() => void send(retry)} className={buttonStyle + " border-accent text-accent"}>{busy && spinner}{busy ? "Retry unconfirmed request · Sending…" : "Retry unconfirmed request"}</button>}
   </div>
   {waiting && <div id="song-progress" role="status" aria-live="polite" className="mt-4 rounded-lg border border-accent/50 bg-accent/5 p-4">
    <p className="flex items-center gap-2 font-semibold text-accent">{spinner}{draft?.pending?.status === "queued" ? "Your request is queued. BNL will start when it is ready." : draft?.pending ? "BNL is working on your song. This page will update when it is ready." : "Sending your request…"}</p>
    <div role="progressbar" aria-label="Song request progress" className="mt-3 h-2 overflow-hidden rounded-full bg-accent/10"><div className="h-full w-full rounded-full bg-gradient-to-r from-accent/20 via-accent to-accent/20 motion-safe:animate-pulse" /></div>
   </div>}
   {draft && <fieldset aria-describedby={waiting ? "song-progress" : undefined} className="mt-8 space-y-5 rounded-xl border border-border bg-surface p-5">
    <legend className="px-2 text-lg font-bold">Your song{waiting && (text.title || text.lyrics || text.style) ? " · Previous result" : ""}</legend>
    {waiting && <p className="rounded-lg border border-accent/50 bg-accent/5 p-3 text-sm">{text.title || text.lyrics || text.style ? "Previous result shown below. It remains available to copy while you wait for the next result." : "Your result will appear below when BNL finishes."}</p>}<p className="text-sm text-muted">Ask BNL for changes using the optional directions above. Your results are saved automatically. Select or copy the text to edit it in your recording tool.</p>
    <label className="block font-semibold">Title<input value={text.title} aria-busy={waiting} readOnly className="mt-2 block w-full rounded border border-border bg-background p-3" /></label>
    <label className="block font-semibold">Lyrics<textarea ref={lyricsField} value={text.lyrics} aria-busy={waiting} readOnly rows={18} className="mt-2 block w-full rounded border border-border bg-background p-3 font-mono text-sm" /></label>
    <p role={overLimit ? "alert" : undefined} className={overLimit ? "text-red-400" : "text-sm text-muted"}>{words.toLocaleString()} / 2,000 lyric words{overLimit ? ". Ask BNL to shorten the lyrics." : ""}</p>
    <label className="block font-semibold">Suno style prompt<textarea ref={styleField} value={text.style} aria-busy={waiting} readOnly rows={5} className="mt-2 block w-full rounded border border-border bg-background p-3" /></label>
    <div className="flex flex-wrap items-center gap-4"><a href="https://suno.com/create" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-accent px-4 py-2 font-bold text-background">Open Suno ↗</a>{copyControl("lyrics", "Copy lyrics", "Lyrics")}{copyControl("style", "Copy style", "Style")}{copyControl("song", "Copy all", "Title, lyrics and style")}</div>
   </fieldset>}
   {draft && <section aria-labelledby="song-archive-heading" className="mt-8 rounded-xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="song-archive-heading" className="text-lg font-bold">Your song archive</h2><p className="text-sm text-muted">{tracks.length} / 40 tracks</p></div>
    <p className="mt-2 text-sm text-muted">Successful new songs are saved here automatically. Keep your newest 40 tracks; a new song replaces the oldest when the archive is full. Regeneration and Undo update the current track.</p>
    <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">Sort saved songs<select aria-label="Sort saved songs" value={sort} onChange={event => setSort(event.target.value as ArchiveSort)} className="rounded border border-border bg-background p-2"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option></select></label>
    {tracks.length === 0 ? <p className="mt-4 text-muted">Your saved tracks will appear here after BNL finishes your first song.</p> : <ul className="mt-4 divide-y divide-border">{tracks.map(track => <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
     <div className="min-w-0"><p className="break-words font-semibold">{track.title || "Untitled song"}</p><p className="mt-1 text-sm text-muted">Saved <time dateTime={new Date(track.createdAt).toISOString()}>{new Date(track.createdAt).toLocaleString()}</time>{draft.selectedTrackId === track.id ? " · Current track" : ""}</p></div>
     <button aria-label={"Open track: " + (track.title || "Untitled song")} aria-busy={actionWorking("select") && activeOperation?.trackId === track.id} disabled={disabled} onClick={() => openTrack(track.id)} className={actionWorking("select") && activeOperation?.trackId === track.id ? actionStyle("select") : buttonStyle}>{actionWorking("select") && activeOperation?.trackId === track.id ? <>{spinner}Opening track…</> : "Open track"}</button>
    </li>)}</ul>}
   </section>}
  </>}
 </section>;
}