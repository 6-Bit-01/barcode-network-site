"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { CrewWorkspaceNavigation } from "@/components/CrewWorkspaceNavigation";
import { OwnerWorkspaceNavigation } from "@/components/OwnerWorkspaceNavigation";
import type { MemberAccess } from "@/lib/member-access";
import type { CrewShowOverview as ShowData, CrewShowTrack } from "@/lib/crew-show";
import { crewDuration, useCrewToolData } from "@/lib/crew-show-client";
import { crewIntroductionCopy, crewIntroductionCreditLabel } from "@/lib/crew-introduction-copy";

const spinner = <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />;
type CopyFeedback = { snapshot: ShowData; state: "copying" | "copied" | "failed" };
function legacyCopy(value: string): boolean {
 if (typeof document === "undefined") return false;
 const previous = document.activeElement as HTMLElement | null;
 let field: HTMLTextAreaElement | null = null;
 try {
  field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.setAttribute("aria-hidden", "true");
  field.style.position = "fixed";
  field.style.left = "-9999px";
  document.body.appendChild(field);
  field.focus({ preventScroll: true });
  field.select();
  field.setSelectionRange(0, value.length);
  return document.execCommand("copy");
 } catch { return false; }
 finally { field?.remove(); try { previous?.focus?.({ preventScroll: true }); } catch { /* The previous control may no longer be mounted. */ } }
}
function TrackCard({ label, track }: { label: string; track: CrewShowTrack | null }) {
 return <article style={{ minWidth: 0 }} className="rounded-xl border border-border bg-background/60 p-5 sm:p-6">
  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</h2>
  {track ? <><p className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">{track.title}</p><p className="mt-3 text-lg font-semibold text-accent">{track.artist}{track.collaborators.length > 0 ? ` · feat. ${track.collaborators.join(", ")}` : ""}</p><p className="mt-3 text-sm text-muted">{track.lane} lane · {track.status}</p></> : <p className="mt-3 text-muted">No track selected.</p>}
 </article>;
}
export function CrewShowOverview({ access }: { access: MemberAccess }) {
 const [selected, setSelected] = useState("");
 const { data, currentAccess, loading, error, refresh } = useCrewToolData<ShowData>(access, "show.overview", "/api/member/tools/show" + (selected ? `?trackId=${encodeURIComponent(selected)}` : ""));
 const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null), [invalidatedSnapshot, setInvalidatedSnapshot] = useState<ShowData | null>(null);
 const mounted = useRef(true), copySequence = useRef(0), copyInFlight = useRef(false);
 const currentCopyContext = useRef<{ data: ShowData | null; available: boolean }>({ data: null, available: false });
 const timing = data?.timing, intro = data?.introduction;
 const assigned = currentAccess?.access.owner || (currentAccess?.access.crew && currentAccess.access.permissions.includes("show.overview"));
 const canCopy = Boolean(assigned && currentAccess?.access.availablePermissions.includes("show.overview") && !loading && !error && data?.available && data.session && intro && data.upcoming.some(track => track.id === intro.trackId) && data !== invalidatedSnapshot);
 const clearCopyFeedback = useCallback(() => {
  copySequence.current++;
  copyInFlight.current = false;
  setInvalidatedSnapshot(currentCopyContext.current.data);
  setCopyFeedback(null);
 }, []);
 useEffect(() => {
  mounted.current = true;
  window.addEventListener("focus", clearCopyFeedback);
  window.addEventListener("pageshow", clearCopyFeedback);
  return () => { mounted.current = false; copyInFlight.current = false; window.removeEventListener("focus", clearCopyFeedback); window.removeEventListener("pageshow", clearCopyFeedback); };
 }, [clearCopyFeedback]);
 useLayoutEffect(() => {
  currentCopyContext.current = { data, available: canCopy };
  copySequence.current++;
  copyInFlight.current = false;
  setCopyFeedback(previous => previous && canCopy && previous.snapshot === data ? previous : null);
 }, [data, canCopy]);
 const feedback = canCopy && copyFeedback?.snapshot === data ? copyFeedback : null;
 const copying = feedback?.state === "copying";
 async function copyIntroduction() {
  if (!canCopy || !data || !intro || copyInFlight.current) return;
  if (!(Date.parse(currentAccess?.session.expiresAt ?? "") > Date.now())) { clearCopyFeedback(); return; }
  const snapshot = data, sequence = ++copySequence.current, value = crewIntroductionCopy(intro);
  const current = () => mounted.current && sequence === copySequence.current && currentCopyContext.current.data === snapshot && currentCopyContext.current.available && Date.parse(currentAccess?.session.expiresAt ?? "") > Date.now();
  copyInFlight.current = true;
  setCopyFeedback({ snapshot, state: "copying" });
  let copied = false;
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); copied = true; } }
  catch { /* Browser permissions may deny the modern clipboard API. */ }
  if (!current()) { if (mounted.current && sequence === copySequence.current) clearCopyFeedback(); return; }
  if (!copied) copied = legacyCopy(value);
  if (current()) { copyInFlight.current = false; setCopyFeedback({ snapshot, state: copied ? "copied" : "failed" }); }
 }
 function refreshShow() { clearCopyFeedback(); void refresh(); }
 return <section style={{ overflowWrap: "anywhere", minWidth: 0 }} className="mx-auto max-w-6xl rounded-xl border border-border bg-surface p-5 sm:p-8">
  {access.access.owner ? <OwnerWorkspaceNavigation section="radio" tool="Live show overview" /> : currentAccess && !loading && !error ? <CrewWorkspaceNavigation access={currentAccess} section="show" /> : <Link href="/account" className="text-accent underline">Your account</Link>}
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="public-kicker">BARCODE Radio</p><h1 className="mt-2 text-3xl font-bold">Live show overview</h1><p className="mt-3 text-muted">Current show information and credited artist introductions.</p></div>
   <div className="flex flex-wrap items-center gap-3">
    {data?.source.readAt && <p className="text-sm text-muted">Read at {new Date(data.source.readAt).toLocaleString()}. Refresh to update.</p>}
    <button type="button" aria-label="Refresh show information" aria-busy={loading} onClick={refreshShow} disabled={loading} className="btn-secondary">{loading && spinner}{loading ? "Refreshing…" : "Refresh"}</button>
   </div>
  </div>
  {loading ? <p role="status" className="mt-6 text-muted">Checking access and current show information…</p> : error ? <p role="alert" className="mt-6 text-muted">{error}</p> : !data?.available ? <p role="status" className="mt-6 text-muted">Current queue information is unavailable.</p> : !data.session ? <p role="status" className="mt-6 text-muted">No current public broadcast is available.</p> : <>
   <p className="mt-6 text-muted">{data.session.title} · {data.session.showDate} · Submissions {data.session.submissionsOpen ? "open" : "closed"}</p>
   <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><TrackCard label="Playing" track={data.current} /><TrackCard label="Up next" track={data.next} /></div>
    <article className="min-w-0 rounded-xl border border-border bg-background/30 p-5 sm:p-6">
     <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-xl font-bold">Artist introduction</h2><button type="button" aria-label="Copy introduction" aria-describedby="crew-intro-copy-result" aria-busy={copying} disabled={!canCopy || copying} onClick={() => void copyIntroduction()} className="btn-primary">{copying && spinner}{copying ? "Copying introduction…" : feedback?.state === "copied" ? "Copied ✓" : "Copy introduction"}</button></div>
     <p id="crew-intro-copy-result" role="status" aria-live="polite" className="mt-2 text-sm text-muted">{copying ? "Copying introduction…" : feedback?.state === "copied" ? "Introduction copied." : feedback?.state === "failed" ? "Could not copy the introduction. Try again or select the introduction text to copy it." : ""}</p>
     <label htmlFor="crew-intro-track" className="mt-4 block text-sm text-muted">Upcoming song</label><select id="crew-intro-track" value={intro?.trackId ?? ""} onChange={event => { clearCopyFeedback(); setSelected(event.target.value); }} className="mt-2 w-full rounded-lg border border-border bg-background p-3" disabled={data.upcoming.length === 0}><option value="" disabled>Select an upcoming song</option>{data.upcoming.map(track => <option key={track.id} value={track.id}>{track.artist} — {track.title}</option>)}</select>
     {intro ? <><h3 className="mt-5 text-2xl font-bold">{intro.artist}</h3><p className="mt-2 text-lg">{intro.title}{intro.collaborators.length > 0 ? ` · feat. ${intro.collaborators.join(", ")}` : ""}</p><p className="mt-3 text-sm text-accent">{crewIntroductionCreditLabel(intro.creditSource)}</p><p className="mt-2 text-sm text-muted">Archive appearances describe a credited artist group. They do not verify an account or establish complete artist history.</p>{intro.archive.available ? <><p className="mt-4 font-semibold">{intro.archive.showCount} retained public shows · {intro.archive.trackCount} credited tracks</p><p className="mt-2 text-sm text-muted">Archive coverage begins {intro.archive.historyCoverageStartedAt}. {intro.archive.trackCount === 0 ? "No matching appearances are recorded in this coverage." : "Recorded appearances:"}</p>{intro.archive.appearances.length > 0 && <ul className="mt-3 space-y-2 text-sm">{intro.archive.appearances.map((appearance, i) => <li key={i}>{appearance.showDate} · {appearance.title} · {appearance.outcome}</li>)}</ul>}{intro.archive.href && <Link href={intro.archive.href} className="mt-4 inline-block text-accent underline">View credited archive group</Link>}</> : <p className="mt-4 text-muted">Public archive information is unavailable.</p>}</> : <p className="mt-4 text-muted">No upcoming song is available for an introduction.</p>}
    </article>
   </div>
   {(timing || data.pressure) && <aside className="mt-4 rounded-xl border border-border p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-bold">{timing ? "Show timing estimates" : "Queue pressure"}</h2>{data.pressure && <p className="text-sm text-muted">Queue pressure: {data.pressure.level} · {data.pressure.accepted} of {data.pressure.capacity} show slots accepted{data.pressure.full ? " · Full" : ""}</p>}</div>
    {timing && <><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted">Music remaining</p><p className="mt-1 text-lg font-semibold">{crewDuration(timing.remainingMusicSeconds)}</p></div><div><p className="text-xs text-muted">Show remaining</p><p className="mt-1 text-lg font-semibold">{crewDuration(timing.remainingShowSeconds)}</p></div><div><p className="text-xs text-muted">Estimated end</p><p className="mt-1 text-lg font-semibold">{timing.projectedEndAt ? new Date(timing.projectedEndAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unavailable"}</p></div></div><p className="mt-3 text-xs text-muted">{timing.confidence} confidence · {timing.unknownDurationCount} tracks use estimated duration. End time includes modeled talk, Wheel and commercial time. Playback timing {timing.playbackEvidence === "player_reported" ? "is player reported" : "is unavailable"}.</p><div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2"><div><h3 className="text-sm font-semibold">Wheel</h3><p className="mt-1 text-xs text-muted">{timing.wheel.spinsOwed} spins owed · {timing.wheel.status.replaceAll("_", " ")} · {crewDuration(timing.wheel.estimatedSeconds)} estimated ceremony time</p></div><div><h3 className="text-sm font-semibold">Commercial</h3><p className="mt-1 text-xs text-muted">{timing.commercial.status.replaceAll("_", " ")} · {timing.commercial.eligible ? "Timing conditions met" : "Timing conditions not met"} · {crewDuration(timing.commercial.estimatedSeconds)} planned{timing.commercial.estimatedRemainingSeconds !== null ? ` · ${crewDuration(timing.commercial.estimatedRemainingSeconds)} remaining estimate` : ""}</p></div></div></>}
   </aside>}
  </>}
 </section>;
}
