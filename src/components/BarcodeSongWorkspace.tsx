"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OwnerWorkspaceNavigation } from "@/components/OwnerWorkspaceNavigation";
import type { MemberAccess } from "@/lib/member-access";
import { countLyricsWords, parseSongDraft, type SongDraft, type SongOptions, type SongRequest, type SongText } from "@/lib/barcode-song-contract";

const blank: SongText = { title: "", lyrics: "", style: "" };
const directions: [keyof SongOptions, string, string][] = [
 ["idea", "Idea or topic", "Leave blank and let BNL choose."],
 ["musicalDirection", "Genre or musical direction", "Any genres, era, instruments or influences. Optional."],
 ["mood", "Mood", "Optional tone or atmosphere."],
 ["lengthStructure", "Length and structure", "Optional sections or timing. Written toward five minutes or less."],
 ["revisionInstructions", "Changes for the next pass", "What should BNL change? Optional."]
];
type ArchiveSort = "newest" | "oldest" | "title";
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
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState("");
 const [retry, setRetry] = useState<SongRequest | null>(null);
 const epoch = useRef(0), mounted = useRef(true), inFlight = useRef(false), needsSync = useRef(true), mayRead = useRef(true), readSequence = useRef(0), latestRevision = useRef(0);

 const loseAccess = useCallback(() => {
  epoch.current++;
  mayRead.current = false;
  setAuthorized(false);
  setDraft(null);
  setText(blank);
  setOptions({});
  setRetry(null);
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
   setDraft(data);
   setText({ title: data.title, lyrics: data.lyrics, style: data.style });
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
   const version = epoch.current;
   try {
    const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store" });
    const current = response.ok ? await response.json() : null;
    if (!mounted.current || version !== epoch.current) return;
    if (current?.user?.id !== access.user.id || !(Date.parse(current.session?.expiresAt) > Date.now()) || !current.access?.availablePermissions?.includes("song.generate") || !(current.access.owner || (current.access.crew && current.access.permissions?.includes("song.generate")))) { loseAccess(); return; }
    mayRead.current = true;
    setAuthorized(true);
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
  setMessage("");
  const version = epoch.current;
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
   setDraft(next);
   setText({ title: next.title, lyrics: next.lyrics, style: next.style });
   setOptions(next.options);
   setMessage(next.errorCode ? errorMessage(next.errorCode) : "");
  } catch {
   if (mounted.current && version === epoch.current) { setRetry(operation); setMessage("The request wasn't confirmed. Retry the same request safely."); }
  } finally {
   inFlight.current = false;
   if (mounted.current) {
    setBusy(false);
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
 async function copy(value: string, label: string) {
  const version = epoch.current;
  try { await navigator.clipboard.writeText(value); if (mounted.current && version === epoch.current) setMessage(label + " copied."); }
  catch { if (mounted.current && version === epoch.current) setMessage("Copy wasn't available. Select and copy the text below."); }
 }
 const tracks = [...(draft?.tracks ?? [])].sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) || b.createdAt - a.createdAt || a.id.localeCompare(b.id) : (sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt) || a.id.localeCompare(b.id));

 return <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
  {access.access.owner ? <OwnerWorkspaceNavigation section="songs" /> : <Link href="/account/crew" className="text-accent underline">Back to Crew workspace</Link>}
  <p className="public-kicker mt-6">BARCODE Network</p><h1 className="mt-2 text-3xl font-bold">BNL song generator</h1>
  <p className="mt-3 text-muted">Give BNL a direction, or leave everything blank and let him make a BARCODE song. Create and refine lyrics and a Suno style prompt, then copy them to make your recording.</p>
  <p className="mt-2 text-sm text-muted">Private to your account. Lyrics: up to 2,000 words. Written toward five minutes or less; your recording tool determines the final duration.</p>
  {message && <p role="status" className="mt-4 rounded-lg border border-border p-3">{message}</p>}
  {!authorized ? <p role="status" className="mt-8">Checking your access. Return to your account if it is unavailable.</p> : <>
   <fieldset disabled={disabled} className="mt-8 grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
    <legend className="px-2 text-lg font-bold">Optional directions</legend>
    {directions.map(([key, label, placeholder]) => <label key={key} className={key === "revisionInstructions" ? "sm:col-span-2" : ""}><span className="mb-2 block font-semibold">{label}</span><textarea value={options[key] ?? ""} maxLength={6000} rows={key === "revisionInstructions" ? 2 : 3} placeholder={placeholder} onChange={event => setOptions({ ...options, [key]: event.target.value })} className="w-full rounded border border-border bg-background p-3" /></label>)}
   </fieldset>
   <div className="mt-4 flex flex-wrap gap-3">
    <button disabled={disabled || overLimit} onClick={() => request("generate")} className="rounded-lg bg-accent px-4 py-2 font-bold text-background">Generate song</button>
    <button disabled={disabled || overLimit || !text.lyrics.trim()} onClick={() => request("lyrics")} className="rounded-lg border border-border px-4 py-2">Regenerate lyrics</button>
    <button disabled={disabled || overLimit || !text.lyrics.trim()} onClick={() => request("style")} className="rounded-lg border border-border px-4 py-2">Regenerate style prompt</button>
    <button disabled={disabled || !draft?.previous} onClick={() => request("undo")} className="rounded-lg border border-border px-4 py-2">Undo previous result</button>
    <button disabled={busy || !!draft?.pending} onClick={() => void readDraft()} className="rounded-lg border border-border px-4 py-2">Refresh draft</button>
    {retry && <button disabled={busy} onClick={() => void send(retry)} className="rounded-lg border border-accent px-4 py-2 text-accent">Retry unconfirmed request</button>}
   </div>
   {draft?.pending && <p role="status" className="mt-4">BNL is working on your song. This page will update when it is ready.</p>}
   {draft && <fieldset className="mt-8 space-y-5 rounded-xl border border-border bg-surface p-5">
    <legend className="px-2 text-lg font-bold">Your song</legend><p className="text-sm text-muted">Ask BNL for changes using the optional directions above. Your results are saved automatically. Select or copy the text to edit it in your recording tool.</p>
    <label className="block font-semibold">Title<input value={text.title} readOnly className="mt-2 block w-full rounded border border-border bg-background p-3" /></label>
    <label className="block font-semibold">Lyrics<textarea value={text.lyrics} readOnly rows={18} className="mt-2 block w-full rounded border border-border bg-background p-3 font-mono text-sm" /></label>
    <p role={overLimit ? "alert" : undefined} className={overLimit ? "text-red-400" : "text-sm text-muted"}>{words.toLocaleString()} / 2,000 lyric words{overLimit ? ". Ask BNL to shorten the lyrics." : ""}</p>
    <button onClick={() => void copy(text.lyrics, "Lyrics")} className="text-accent underline">Copy lyrics</button>
    <label className="block font-semibold">Suno style prompt<textarea value={text.style} readOnly rows={5} className="mt-2 block w-full rounded border border-border bg-background p-3" /></label>
    <div className="flex flex-wrap gap-4"><button onClick={() => void copy(text.style, "Style prompt")} className="text-accent underline">Copy style prompt</button><button onClick={() => void copy(text.title + "\n\n" + text.lyrics + "\n\nSuno style prompt\n" + text.style, "Song")} className="text-accent underline">Copy whole song</button></div>
   </fieldset>}
   {draft && <section aria-labelledby="song-archive-heading" className="mt-8 rounded-xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="song-archive-heading" className="text-lg font-bold">Your private song archive</h2><p className="text-sm text-muted">{tracks.length} / 40 tracks</p></div>
    <p className="mt-2 text-sm text-muted">Successful new songs are saved here automatically. Keep your newest 40 tracks; a new song replaces the oldest when the archive is full. Regeneration and Undo update the current track.</p>
    <label className="mt-4 flex flex-wrap items-center gap-3 text-sm">Sort saved songs<select aria-label="Sort saved songs" value={sort} onChange={event => setSort(event.target.value as ArchiveSort)} className="rounded border border-border bg-background p-2"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option></select></label>
    {tracks.length === 0 ? <p className="mt-4 text-muted">Your saved tracks will appear here after BNL finishes your first song.</p> : <ul className="mt-4 divide-y divide-border">{tracks.map(track => <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
     <div className="min-w-0"><p className="break-words font-semibold">{track.title || "Untitled song"}</p><p className="mt-1 text-sm text-muted">Saved <time dateTime={new Date(track.createdAt).toISOString()}>{new Date(track.createdAt).toLocaleString()}</time>{draft.selectedTrackId === track.id ? " · Current track" : ""}</p></div>
     <button aria-label={"Open track: " + (track.title || "Untitled song")} disabled={disabled} onClick={() => openTrack(track.id)} className="rounded-lg border border-border px-4 py-2">Open track</button>
    </li>)}</ul>}
   </section>}
  </>}
 </section>;
}