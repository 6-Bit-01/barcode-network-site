"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";
import type { MemberHistoryReference, OwnerArtistState } from "@/lib/member-artists";

type Account = { id: string; name: string; email: string; emailVerified: boolean; suspended: boolean };
type CatalogArtist = { projectKey: string; projectLabel: string };
type Candidate = { reference: MemberHistoryReference["reference"]; showLabel: string; showDate: string; title: string; artist: string; status: string; airplay: string; completion: string; coverage: string };
type Operation = { ownerId: string; targetId: string; body: string };
type SearchPage<T> = { items: T[]; nextCursor: string | null; cursors: string[]; query: string };
const emptyPage = <T,>(): SearchPage<T> => ({ items: [], nextCursor: null, cursors: [], query: "" });
const inputClass = "mt-2 w-full rounded border border-border bg-background px-3 py-2 text-foreground";

export function OwnerArtistWorkspace({ access }: { access: MemberAccess }) {
  const [authorized, setAuthorized] = useState(true);
  const [accounts, setAccounts] = useState(emptyPage<Account>);
  const [catalog, setCatalog] = useState(emptyPage<CatalogArtist>);
  const [candidates, setCandidates] = useState(emptyPage<Candidate>);
  const [accountSearch, setAccountSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [source, setSource] = useState("");
  const [target, setTarget] = useState<Account | null>(null);
  const [state, setState] = useState<OwnerArtistState | null>(null);
  const [projectKey, setProjectKey] = useState("");
  const [historyArtistId, setHistoryArtistId] = useState("");
  const [reviewed, setReviewed] = useState<Candidate | null>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unconfirmed, setUnconfirmed] = useState<Operation | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const mutationPending = useRef(false);
  const authorityController = useRef<AbortController | null>(null);
  const reads = useRef<Set<AbortController>>(new Set());
  const pageReads = useRef(new Map<string, AbortController>());
  const targetController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const targetId = useRef("");
  const currentAuthority = useRef(true);
  const pendingForOwner = unconfirmed?.ownerId === access.user.id ? unconfirmed : null;
  const paused = busy || loadingTarget || !authorized || pendingForOwner !== null;

  function abortReads() { for (const controller of reads.current) controller.abort(); reads.current.clear(); pageReads.current.clear(); }
  function clearPrivate() {
    generation.current += 1; currentAuthority.current = false; abortReads();
    setAuthorized(false); setAccounts(emptyPage<Account>()); setCatalog(emptyPage<CatalogArtist>()); setCandidates(emptyPage<Candidate>());
    targetId.current = ""; setTarget(null); setState(null); setProjectKey(""); setHistoryArtistId(""); setReviewed(null); setError(""); setMessage("");
    setAccountSearch(""); setCatalogSearch(""); setCandidateSearch(""); setSource("");
  }
  function deny() { clearPrivate(); operationRef.current = null; setUnconfirmed(null); window.location.assign("/account"); }
  async function readJson(url: string, controller: AbortController) {
    reads.current.add(controller);
    try {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) throw new Error("ABORTED");
      if (response.status === 401 || response.status === 403) { deny(); throw new Error("ABORTED"); }
      if (!response.ok) throw new Error("Artist management is temporarily unavailable. Refresh and try again.");
      return await response.json();
    } finally { reads.current.delete(controller); }
  }
  async function loadPage(kind: "accounts" | "catalog" | "candidates", query = "", cursors: string[] = [], selectedSource = source) {
    if (!currentAuthority.current) return;
    pageReads.current.get(kind)?.abort();
    const controller = new AbortController(); pageReads.current.set(kind, controller);
    const stamp = generation.current;
    const params = new URLSearchParams({ query, limit: kind === "catalog" ? "50" : "25" });
    const cursor = cursors.at(-1); if (cursor) params.set("cursor", cursor);
    if (kind === "accounts") { params.set("sort", "name"); params.set("verification", "all"); params.set("status", "all"); params.set("role", "all"); }
    if (kind === "candidates" && selectedSource) params.set("source", selectedSource);
    const route = kind === "accounts" ? "accounts" : kind === "catalog" ? "artist-catalog" : "radio-candidates";
    try {
      const data = await readJson(`/api/member/owner/${route}?${params}`, controller);
      if (controller.signal.aborted || generation.current !== stamp || !currentAuthority.current) return;
      if (!(data.nextCursor === null || typeof data.nextCursor === "string")) throw new Error("Artist management returned an unavailable page.");
      if (kind === "accounts" && Array.isArray(data.accounts)) setAccounts({ items: data.accounts, nextCursor: data.nextCursor, cursors, query });
      else if (kind === "catalog" && Array.isArray(data.artists)) { setCatalog({ items: data.artists, nextCursor: data.nextCursor, cursors, query }); setProjectKey(""); }
      else if (kind === "candidates" && Array.isArray(data.candidates)) { setCandidates({ items: data.candidates, nextCursor: data.nextCursor, cursors, query }); setReviewed(null); }
      else throw new Error("Artist management returned an unavailable page.");
    } catch (reason) { if (!controller.signal.aborted && generation.current === stamp && currentAuthority.current) { if (kind === "accounts") setAccounts(emptyPage<Account>()); if (kind === "catalog") { setCatalog(emptyPage<CatalogArtist>()); setProjectKey(""); } if (kind === "candidates") { setCandidates(emptyPage<Candidate>()); setReviewed(null); } setError(reason instanceof Error ? reason.message : "Artist management is unavailable."); } }
  }
  async function refreshPages() {
    setLoadingPages(true);
    await Promise.all([loadPage("accounts"), loadPage("catalog"), loadPage("candidates", "", [], "")]);
    if (currentAuthority.current) setLoadingPages(false);
  }
  async function loadTarget(account: Account) {
    if (!currentAuthority.current) return;
    targetController.current?.abort(); const controller = new AbortController(); targetController.current = controller;
    const stamp = generation.current; targetId.current = account.id;
    setTarget(account); setState(null); setHistoryArtistId(""); setReviewed(null); setLoadingTarget(true);
    try {
      const data: OwnerArtistState = await readJson(`/api/member/owner/artists?${new URLSearchParams({ targetId: account.id })}`, controller);
      if (controller.signal.aborted || generation.current !== stamp || !currentAuthority.current || targetId.current !== account.id) return;
      if (data.targetId !== account.id || !Number.isSafeInteger(data.revision) || !Array.isArray(data.artists) || !Array.isArray(data.legacyReferences)) throw new Error("Artist access is unavailable for this account.");
      setState(data);
    } catch (reason) { if (!controller.signal.aborted && generation.current === stamp && currentAuthority.current) setError(reason instanceof Error ? reason.message : "Artist access is unavailable."); }
    finally { if (!controller.signal.aborted && generation.current === stamp) setLoadingTarget(false); }
  }
  useEffect(() => {
    void refreshPages();
    async function revalidate() {
      authorityController.current?.abort(); const controller = new AbortController(); authorityController.current = controller;
      clearPrivate(); setLoadingPages(true);
      try {
        const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        if (data?.user?.id !== access.user.id || data.access?.owner !== true || !(Date.parse(data.session?.expiresAt) > Date.now())) { deny(); return; }
        currentAuthority.current = true; setAuthorized(true); await refreshPages();
      } catch { if (!controller.signal.aborted) setError("Owner access could not be checked. Return to your account or refresh when the service is available."); }
    }
    window.addEventListener("focus", revalidate); window.addEventListener("pageshow", revalidate);
    return () => { authorityController.current?.abort(); abortReads(); currentAuthority.current = false; operationRef.current = null; window.removeEventListener("focus", revalidate); window.removeEventListener("pageshow", revalidate); };
    // The server guard supplies initial authority; event reads bind to this exact Owner identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.user.id]);

  async function executeOperation(operation: Operation) {
    if (mutationPending.current || !currentAuthority.current || operation.ownerId !== access.user.id || operationRef.current !== operation) return;
    const stamp = generation.current;
    mutationPending.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/member/owner/artists/action", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: operation.body });
      if (operationRef.current !== operation || generation.current !== stamp || !currentAuthority.current) return;
      if (response.status === 401 || response.status === 403) { deny(); return; }
      const data = await response.json().catch(() => null);
      if (operationRef.current !== operation || generation.current !== stamp || !currentAuthority.current) return;
      if (response.status >= 400 && response.status < 500) {
        operationRef.current = null; setUnconfirmed(null);
        if (target && target.id === operation.targetId) await loadTarget(target);
        setError(response.status === 409 ? "This account or song source changed. Review its current details before trying again." : "The action was declined. Review the account and selected song before trying again."); return;
      }
      if (!response.ok || data?.ok !== true || data.state?.targetId !== operation.targetId || !Number.isSafeInteger(data.state?.revision) || !Array.isArray(data.state.artists) || !Array.isArray(data.state.legacyReferences)) throw new Error("UNCONFIRMED");
      operationRef.current = null; setUnconfirmed(null);
      if (targetId.current === operation.targetId) { setState(data.state); setReviewed(null); setHistoryArtistId(""); }
      setMessage("Artist access saved.");
    } catch {
      if (operationRef.current === operation && generation.current === stamp && currentAuthority.current) setError("The result could not be confirmed. Retry the same action to check it safely; other changes remain paused.");
    } finally { mutationPending.current = false; setBusy(false); }
  }
  async function mutate(action: string, fields: object) {
    if (paused || mutationPending.current || operationRef.current || !target || !state || state.targetId !== target.id || ((action === "approve-project" || action === "approve-history") && (!target.emailVerified || target.suspended))) return;
    const operation: Operation = { ownerId: access.user.id, targetId: target.id, body: JSON.stringify({ requestId: crypto.randomUUID(), targetId: target.id, expectedRevision: state.revision, action, ...fields }) };
    operationRef.current = operation; setUnconfirmed(operation); await executeOperation(operation);
  }
  function search(event: FormEvent<HTMLFormElement>, kind: "accounts" | "catalog" | "candidates", query: string) {
    event.preventDefault(); if (query.trim().length > 100) { setError("Use up to 100 characters to search."); return; } setError(""); void loadPage(kind, query.trim());
  }
  function pages<T>(kind: "accounts" | "catalog" | "candidates", page: SearchPage<T>) {
    return <div className="mt-3 flex gap-3 text-sm"><button className="btn-secondary" disabled={busy || loadingPages || page.cursors.length === 0} onClick={() => loadPage(kind, page.query, page.cursors.slice(0, -1))}>Previous {kind} page</button><span className="self-center text-muted">Page {page.cursors.length + 1}</span><button className="btn-secondary" disabled={busy || loadingPages || !page.nextCursor} onClick={() => { if (page.nextCursor) void loadPage(kind, page.query, [...page.cursors, page.nextCursor]); }}>Next {kind} page</button></div>;
  }
  const canApprove = !paused && state !== null && target?.emailVerified === true && !target.suspended;
  const activeArtists = state?.artists.filter(artist => artist.approved) ?? [];
  return <section className="mx-auto max-w-6xl rounded-xl border border-border bg-surface p-5 sm:p-8">
    <Link href="/account/owner" className="text-accent underline">Back to Owner workspace</Link>
    <h1 className="mt-5 text-3xl font-bold">Artists &amp; show history</h1>
    <p className="mt-3 text-sm text-muted">Approve an exact account for an Artist project. Review older songs individually before associating them. Public song credits stay unchanged.</p>
    <p className="mt-4 text-sm" role="status" aria-live="polite">{message}</p>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {!authorized ? <p role="status" className="mt-4">Checking current Owner access…</p> : <>
      {pendingForOwner && <div className="mt-4 rounded border border-border p-4"><p className="text-sm">An Artist action for BARCODE ID {pendingForOwner.targetId} is unconfirmed. Other approvals and revocations are paused.</p><button className="btn-secondary mt-3" disabled={busy} onClick={() => executeOperation(pendingForOwner)}>Retry unconfirmed Artist action</button></div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-label="Find an account"><h2 className="text-xl font-bold">Choose the exact account</h2>
          <form className="mt-4 flex items-end gap-3" onSubmit={event => search(event, "accounts", accountSearch)}><label className="min-w-0 flex-1 text-sm">Search accounts<input type="search" className={inputClass} value={accountSearch} maxLength={100} onChange={event => setAccountSearch(event.target.value)} /></label><button className="btn-secondary" disabled={busy}>Search accounts</button></form>
          <ul className="mt-4 space-y-3">{accounts.items.map(account => <li key={account.id} className="rounded border border-border p-3"><p className="font-semibold">{account.name}</p><p className="mt-1 break-all text-sm text-muted">{account.email}</p><p className="mt-1 text-xs text-muted">{account.emailVerified ? "Verified" : "Unverified"} · {account.suspended ? "Suspended" : "Active"}</p><button className="btn-secondary mt-3" disabled={busy} aria-label={`Review Artist access for ${account.name}`} onClick={() => loadTarget(account)}>Review Artist access</button></li>)}</ul>
          {!loadingPages && !accounts.items.length && <p className="mt-3 text-sm text-muted">No accounts match this search.</p>}{pages("accounts", accounts)}
        </section>
        <section aria-label="Account Artist access">{target ? <>
          <h2 className="text-xl font-bold">{target.name}</h2><p className="mt-2 break-all text-sm">{target.email}</p><p className="mt-2 break-all text-xs text-muted">BARCODE ID: {target.id}</p>
          {loadingTarget && <p role="status" className="mt-3">Checking current Artist access…</p>}
          {state && <>
            {(!target.emailVerified || target.suspended) && <p className="mt-3 text-sm text-muted">Approvals require an active, verified account. Existing grants can be revoked.</p>}
            <h3 className="mt-5 font-semibold">Artist project approvals</h3>
            <form className="mt-3 flex items-end gap-3" onSubmit={event => search(event, "catalog", catalogSearch)}><label className="min-w-0 flex-1 text-sm">Search Artist catalog<input type="search" className={inputClass} value={catalogSearch} maxLength={100} onChange={event => setCatalogSearch(event.target.value)} /></label><button className="btn-secondary" disabled={busy}>Search projects</button></form>
            <label className="mt-3 block text-sm">Artist project<select aria-label="Artist project" className={inputClass} value={projectKey} onChange={event => setProjectKey(event.target.value)} disabled={paused}><option value="">Choose a reviewed catalog project</option>{catalog.items.map(artist => <option key={artist.projectKey} value={artist.projectKey}>{artist.projectLabel}</option>)}</select></label>
            {pages("catalog", catalog)}<button className="btn-primary mt-3" disabled={!canApprove || !catalog.items.some(artist => artist.projectKey === projectKey)} onClick={() => mutate("approve-project", { projectKey })}>Approve Artist project</button>
            <ul className="mt-4 space-y-3">{state.artists.map(artist => <li key={artist.id} className="rounded border border-border p-3"><p className="break-words text-sm">{catalog.items.find(item => item.projectKey === artist.projectKey)?.projectLabel ?? artist.projectKey} · {artist.approved ? "Approved" : "Revoked"}</p>{artist.approved && <button className="mt-2 text-sm text-accent underline" disabled={paused} onClick={() => mutate("revoke-project", { artistId: artist.id })}>Revoke Artist access</button>}</li>)}</ul>
            <h3 className="mt-6 font-semibold">Individually approved older songs</h3>
            <p className="mt-2 text-xs text-muted">Only current approved Artist projects can receive an association. Removing Artist access removes its derived history; factual signed-in submissions remain.</p>
            <label className="mt-3 block text-sm">Associate with approved Artist<select className={inputClass} value={historyArtistId} disabled={paused} onChange={event => { setHistoryArtistId(event.target.value); setReviewed(null); }}><option value="">Choose an approved Artist</option>{activeArtists.map(artist => <option key={artist.id} value={artist.id}>{catalog.items.find(item => item.projectKey === artist.projectKey)?.projectLabel ?? artist.projectKey}</option>)}</select></label>
            <form className="mt-3 flex items-end gap-3" onSubmit={event => search(event, "candidates", candidateSearch)}><label className="min-w-0 flex-1 text-sm">Search songs or shows<input type="search" className={inputClass} value={candidateSearch} maxLength={100} onChange={event => setCandidateSearch(event.target.value)} /></label><button className="btn-secondary" disabled={busy}>Search songs</button></form>
            <label className="mt-3 block text-sm">History source<select className={inputClass} value={source} disabled={busy} onChange={event => { setSource(event.target.value); void loadPage("candidates", candidateSearch.trim(), [], event.target.value); }}><option value="">All eligible sources</option><option value="native">Native shows</option><option value="historical">Verified historical evidence</option></select></label>
            <ul className="mt-4 space-y-3">{candidates.items.map((candidate, index) => <li key={index} className="rounded border border-border p-3"><p className="font-semibold">{candidate.title}</p><p className="mt-1 text-sm">{candidate.artist} · {candidate.showLabel} · {candidate.showDate}</p><p className="mt-2 text-xs text-muted">Outcome: {candidate.status} · Airplay: {candidate.airplay} · Completion: {candidate.completion} · Coverage: {candidate.coverage}</p><button className="mt-3 text-sm text-accent underline" disabled={!canApprove || !historyArtistId} onClick={() => setReviewed(candidate)}>Review this exact song</button></li>)}</ul>{pages("candidates", candidates)}
            {reviewed && <div className="mt-4 rounded border border-accent p-4"><h4 className="font-semibold">Confirm this song association</h4><p className="mt-2 text-sm">{reviewed.title} · {reviewed.artist}</p><p className="mt-2 text-xs text-muted">{reviewed.showLabel} · {reviewed.showDate} · {reviewed.reference.kind} source</p><p className="mt-2 break-all text-xs text-muted">Exact song: {reviewed.reference.kind === "native" ? `${reviewed.reference.sessionId} / ${reviewed.reference.trackId}` : reviewed.reference.recoveryTrackId}</p><p className="mt-2 text-xs text-muted">Outcome: {reviewed.status} · Airplay: {reviewed.airplay} · Completion: {reviewed.completion} · Coverage: {reviewed.coverage}</p><button className="btn-primary mt-3" disabled={!canApprove || !activeArtists.some(artist => artist.id === historyArtistId)} onClick={() => mutate("approve-history", { artistId: historyArtistId, reference: reviewed.reference })}>Approve this exact song</button></div>}
            <ul className="mt-5 space-y-3">{state.legacyReferences.map(reference => <li key={reference.id} className="rounded border border-border p-3"><p className="text-sm">{state.artists.find(artist => artist.id === reference.artistId)?.projectKey ?? "Historical Artist"} · {reference.reference.kind} source · {reference.approved ? "Approved" : "Revoked"}</p><p className="mt-2 break-all text-xs text-muted">Exact song: {reference.reference.kind === "native" ? `${reference.reference.sessionId} / ${reference.reference.trackId}` : reference.reference.recoveryTrackId}</p>{reference.approved && <button className="mt-3 text-sm text-accent underline" disabled={paused} onClick={() => mutate("revoke-history", { referenceId: reference.id })}>Revoke this song association</button>}</li>)}</ul>
          </>}
        </> : <p className="rounded border border-border p-4 text-sm text-muted">Choose an account and verify its exact BARCODE ID before approving Artist access.</p>}</section>
      </div>
    </>}
  </section>;
}
