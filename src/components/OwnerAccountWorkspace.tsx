"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import type { MemberAccess } from "@/lib/member-access";

type Account = { id: string; name: string; email: string; emailVerified: boolean; suspended: boolean; owner: boolean; crew: boolean; permissions: string[]; revision: number; createdAt: string };
type Filters = { query: string; sort: string; verification: string; status: string; role: string };
type Operation = { ownerId: string; targetId: string; action: string; body: string };
const initialFilters: Filters = { query: "", sort: "name", verification: "all", status: "all", role: "all" };
const fieldClass = "mt-2 w-full rounded border border-border bg-background px-3 py-2 text-foreground focus:outline-2 focus:outline-accent";
const confirmation: Record<string, string> = { "set-name": "Display name saved.", "set-crew": "Crew access saved.", suspend: "Account suspended.", reactivate: "Account reactivated. Previous sessions remain signed out.", "revoke-sessions": "Account sessions signed out.", "send-recovery": "Recovery email requested through the account recovery service." };
function failureMessage(code: string | undefined, status: number) {
  if (code === "NAME_UNAVAILABLE") return "That display name is unavailable. Choose another name.";
  if (code === "INVALID_NAME") return "Use a display name of 1–80 visible characters. Staff and system names are reserved.";
  if (status === 409) return "This account changed. The directory has been refreshed; review the current details before trying again.";
  if (status === 429) return "Too many attempts. Please wait before trying again.";
  if (code === "SELF_SUSPENSION_FORBIDDEN" || code === "LAST_OWNER_PROTECTED") return "The current Owner account cannot be suspended.";
  if (status >= 500) return "Account management is temporarily unavailable. Please try again shortly.";
  return "That action could not be completed. Review the account details and try again.";
}

export function OwnerAccountWorkspace({ access }: { access: MemberAccess }) {
  const [authorized, setAuthorized] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [crew, setCrew] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState(access.access.availablePermissions);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [unconfirmed, setUnconfirmed] = useState<Operation | null>(null);
  const operationRef = useRef<Operation | null>(null);
  const readController = useRef<AbortController | null>(null);
  const mutationPending = useRef(false);
  const authorityController = useRef<AbortController | null>(null);
  const cursor = cursors.at(-1);
  const unconfirmedForOwner = unconfirmed?.ownerId === access.user.id ? unconfirmed : null;
  const changesPaused = busy || loading || unconfirmedForOwner !== null;

  function clearOperation() { operationRef.current = null; setUnconfirmed(null); }
  function clearPrivateState(clearPending = true) { setAuthorized(false); setAccounts([]); setSelected(null); setNextCursor(null); setName(""); setCrew(false); setPermissions([]); setAvailablePermissions([]); if (clearPending) clearOperation(); }
  function denyAccess() { readController.current?.abort(); clearPrivateState(); window.location.assign("/account"); }
  function choose(account: Account, available = availablePermissions) {
    setSelected(account); setName(account.name); setCrew(account.crew); setPermissions(account.permissions.filter(permission => available.includes(permission)));
  }
  async function loadDirectory() {
    readController.current?.abort();
    const controller = new AbortController(); readController.current = controller;
    setLoading(true);
    const params = new URLSearchParams({ ...filters, limit: "25" }); if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/member/owner/accounts?${params}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { denyAccess(); return; }
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !Array.isArray(data?.accounts) || !(data.nextCursor === null || typeof data.nextCursor === "string")) throw new Error(failureMessage(data?.code, response.status));
      setAccounts(data.accounts); setNextCursor(data.nextCursor);
      setSelected(previous => {
        if (!previous) return null;
        const current = data.accounts.find((account: Account) => account.id === previous.id) ?? null;
        if (current) { setName(current.name); setCrew(current.crew); setPermissions(current.permissions.filter((permission: string) => availablePermissions.includes(permission))); }
        return current;
      });
    } catch (reason) {
      if (!controller.signal.aborted) { setAccounts([]); setSelected(null); setNextCursor(null); setError(reason instanceof Error ? reason.message : "Account management is temporarily unavailable."); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    void loadDirectory();
    return () => readController.current?.abort();
    // A changed filter or page starts a fresh bounded read. Other state does not trigger polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, cursor]);
  useEffect(() => () => { operationRef.current = null; }, [access.user.id]);
  useEffect(() => {
    async function revalidate() {
      readController.current?.abort(); authorityController.current?.abort();
      const controller = new AbortController(); authorityController.current = controller;
      clearPrivateState(false); setError(""); setMessage("");
      try {
        const response = await fetch("/api/member/access", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        if (data?.user?.id !== access.user.id || data.access?.owner !== true || !(Date.parse(data.session?.expiresAt) > Date.now())) { denyAccess(); return; }
        setAvailablePermissions(data.access.availablePermissions); setAuthorized(true); await loadDirectory();
      } catch { if (!controller.signal.aborted) setError("Account management is temporarily unavailable. Return to your account or retry when the service is available."); }
    }
    window.addEventListener("focus", revalidate); window.addEventListener("pageshow", revalidate);
    return () => { authorityController.current?.abort(); window.removeEventListener("focus", revalidate); window.removeEventListener("pageshow", revalidate); };
    // Rebind when the current directory request changes; no timer or background polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.user.id, filters, cursor]);

  async function executeOperation(operation: Operation) {
    if (mutationPending.current || loading || !authorized || operation.ownerId !== access.user.id || operationRef.current !== operation) return;
    mutationPending.current = true; setBusy(true); setError(""); setMessage("");
    readController.current?.abort();
    try {
      const response = await fetch("/api/member/owner/accounts/action", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: operation.body });
      if (operationRef.current !== operation) return;
      if (response.status === 401 || response.status === 403) { denyAccess(); return; }
      const data = await response.json().catch(() => null);
      if (operationRef.current !== operation) return;
      if (response.status >= 400 && response.status < 500) { clearOperation(); await loadDirectory(); setError(failureMessage(data?.code, response.status)); return; }
      if (!response.ok || data?.ok !== true || data.account?.id !== operation.targetId || !Number.isInteger(data.account?.revision)) throw new Error("UNCONFIRMED_ACTION");
      clearOperation(); setAccounts(previous => previous.map(account => account.id === operation.targetId ? data.account : account)); choose(data.account);
      if (operation.action === "revoke-sessions" && operation.targetId === access.user.id) { denyAccess(); return; }
      setMessage(confirmation[operation.action]);
    } catch {
      if (operationRef.current !== operation) return;
      setUnconfirmed(operation); await loadDirectory();
      if (operationRef.current === operation) setError("The result could not be confirmed. Retry the unconfirmed action to check it safely.");
    } finally { mutationPending.current = false; setBusy(false); }
  }
  async function mutate(action: string, fields: object = {}) {
    if (!selected || mutationPending.current || loading || !authorized || unconfirmedForOwner || (action === "suspend" && selected.id === access.user.id)) return;
    const operation = { ownerId: access.user.id, targetId: selected.id, action, body: JSON.stringify({ requestId: crypto.randomUUID(), targetId: selected.id, expectedRevision: selected.revision, action, ...fields }) };
    operationRef.current = operation; setUnconfirmed(null); await executeOperation(operation);
  }
  function changeFilter(key: keyof Filters, value: string) { setCursors([]); setSelected(null); setError(""); setMessage(""); setFilters(previous => ({ ...previous, [key]: value })); }
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (search.trim().length > 100) { setError("Search accounts using up to 100 characters."); return; } changeFilter("query", search.trim()); }

  return <section className="mx-auto max-w-6xl rounded-xl border border-border bg-surface p-5 sm:p-8">
    <Link href="/account" className="text-accent underline">Back to your account</Link>
    <div role="status" aria-live="polite" className="mt-4 text-sm">{message}</div>
    {error && <p role="alert" className="mt-3 rounded border border-danger p-3 text-sm text-danger">{error}</p>}
    {!authorized ? <p className="mt-4" role="status">Checking your access. Return to your account if it is unavailable.</p> : <>
      <p className="public-kicker mt-5">BARCODE Network</p><h1 className="mt-2 text-3xl font-bold">Owner workspace</h1>
      <nav className="mt-5 flex flex-wrap gap-4 text-sm" aria-label="Owner workspace"><a href="#accounts" className="text-accent underline">Accounts &amp; access</a><Link href="/admin" className="text-accent underline">Existing admin workspace — separate access during transition</Link></nav>
      {unconfirmedForOwner && <div className="mt-5 rounded border border-border p-4"><p className="text-sm">An account action is unconfirmed. Other account changes are paused until it is resolved.</p><button className="btn-secondary mt-3" disabled={busy || loading} onClick={() => executeOperation(unconfirmedForOwner)}>Retry unconfirmed action</button></div>}
      <section id="accounts" className="mt-8" aria-labelledby="account-directory-heading">
        <h2 id="account-directory-heading" className="text-xl font-bold">Accounts &amp; access</h2>
        <p className="mt-2 text-sm text-muted">Members activate after email verification. Manage their name, account status and assigned Crew access here.</p>
        <form onSubmit={submitSearch} className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Search accounts<input type="search" className={fieldClass} value={search} onChange={event => setSearch(event.target.value)} maxLength={100} disabled={busy} placeholder="Name or email" /></label><button className="btn-secondary" disabled={busy || loading}>Search</button></form>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">Sort<select className={fieldClass} value={filters.sort} disabled={busy} onChange={event => changeFilter("sort", event.target.value)}><option value="name">Name</option><option value="newest">Newest first</option></select></label>
          <label className="text-sm">Verification<select className={fieldClass} value={filters.verification} disabled={busy} onChange={event => changeFilter("verification", event.target.value)}><option value="all">All verification states</option><option value="verified">Verified</option><option value="unverified">Unverified</option></select></label>
          <label className="text-sm">Account status<select className={fieldClass} value={filters.status} disabled={busy} onChange={event => changeFilter("status", event.target.value)}><option value="all">All account states</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
          <label className="text-sm">Assigned access<select className={fieldClass} value={filters.role} disabled={busy} onChange={event => changeFilter("role", event.target.value)}><option value="all">All access</option><option value="member">Member</option><option value="crew">Crew</option><option value="owner">Owner</option></select></label>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div aria-busy={loading}>
            {loading ? <p role="status">Loading accounts…</p> : accounts.length === 0 ? <p className="text-muted">No accounts match these filters.</p> : <ul className="space-y-3" aria-label="Account directory">{accounts.map(account => <li key={account.id} className="rounded border border-border p-4"><p className="break-words font-semibold">{account.name}</p><p className="mt-1 break-all text-sm text-muted">{account.email}</p><p className="mt-2 text-xs text-muted">{account.suspended ? "Suspended" : "Active"} · {account.emailVerified ? "Verified" : "Unverified"} · {account.owner ? "Owner" : "Member"}{account.crew ? " · Crew" : ""}</p><button className="btn-secondary mt-3" disabled={busy} onClick={() => { choose(account); setError(""); setMessage(""); }} aria-label={`View account for ${account.name}`}>View account</button></li>)}</ul>}
            <div className="mt-5 flex flex-wrap items-center gap-3"><button className="btn-secondary" disabled={busy || loading || cursors.length === 0} onClick={() => { setSelected(null); setCursors(previous => previous.slice(0, -1)); }}>Previous page</button><span className="text-sm text-muted">Page {cursors.length + 1}</span><button className="btn-secondary" disabled={busy || loading || !nextCursor} onClick={() => { if (nextCursor) { setSelected(null); setCursors(previous => [...previous, nextCursor]); } }}>Next page</button><button className="text-sm text-accent underline" disabled={busy || loading} onClick={() => { setError(""); setMessage(""); void loadDirectory(); }}>Refresh directory</button></div>
          </div>
          <div>{selected ? <section aria-labelledby="account-detail-heading" className="rounded border border-border p-4 sm:p-5">
            <h3 id="account-detail-heading" className="break-words text-lg font-bold">{selected.name}</h3><p className="mt-2 break-all text-sm">{selected.email}</p><p className="mt-2 break-all text-xs text-muted">BARCODE ID: {selected.id}</p><p className="mt-2 text-xs text-muted">Created {selected.createdAt.slice(0, 10)} · {selected.emailVerified ? "Email verified" : "Email unverified"}</p>
            <form className="mt-5" onSubmit={event => { event.preventDefault(); void mutate("set-name", { name }); }}><label className="text-sm">Display name<input className={fieldClass} value={name} onChange={event => setName(event.target.value)} minLength={1} maxLength={80} required disabled={changesPaused} /></label><p className="mt-2 text-xs text-muted">Names are unique. Changes keep the same BARCODE ID.</p><button className="btn-secondary mt-3" disabled={changesPaused || name === selected.name}>Save display name</button></form>
            <form className="mt-5 border-t border-border pt-5" onSubmit={event => { event.preventDefault(); void mutate("set-crew", { assigned: crew, permissions: crew ? permissions : [] }); }}><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={crew} disabled={changesPaused} onChange={event => { setCrew(event.target.checked); if (!event.target.checked) setPermissions([]); }} />Crew access assigned</label>
              {crew && availablePermissions.length > 0 && <fieldset className="mt-4 space-y-3"><legend className="mb-2 text-sm">Available Crew tools</legend>{availablePermissions.map(permission => <label key={permission} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={permissions.includes(permission)} disabled={changesPaused} onChange={event => setPermissions(previous => event.target.checked ? [...previous, permission] : previous.filter(value => value !== permission))} />{permission}</label>)}</fieldset>}
              {crew && availablePermissions.length === 0 && <p className="mt-3 text-xs text-muted">Crew tools will become available as they are ready.</p>}<button className="btn-secondary mt-3" disabled={changesPaused}>Save Crew access</button>
            </form>
            <div className="mt-5 space-y-3 border-t border-border pt-5"><p className="text-sm">{selected.suspended ? "This account is suspended. Reactivation permits a fresh sign-in." : "Suspension signs this account out and blocks sign-in."}</p><button className="btn-secondary" disabled={changesPaused || (!selected.suspended && selected.id === access.user.id)} onClick={() => mutate(selected.suspended ? "reactivate" : "suspend")}>{selected.suspended ? "Reactivate account" : "Suspend account"}</button>{selected.id === access.user.id && <p className="text-xs text-muted">You cannot suspend your current Owner account.</p>}<div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={changesPaused} onClick={() => mutate("revoke-sessions")}>Sign out account sessions</button><button className="btn-secondary" disabled={changesPaused || !selected.emailVerified} onClick={() => mutate("send-recovery")}>Send recovery email</button></div><p className="text-xs text-muted">Recovery uses the account&apos;s existing verified address. It does not reactivate a suspended account.</p></div>
          </section> : <p className="rounded border border-border p-5 text-sm text-muted">Choose an account to review its details and access.</p>}</div>
        </div>
      </section>
    </>}
  </section>;
}
