/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, react/jsx-no-comment-textnodes, @typescript-eslint/no-explicit-any */
"use client";

import { useLiveStatus } from "@/components/LiveStatusProvider";
import Link from "next/link";
import { useState, useEffect } from "react";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "forcePull" | "unknown";
type BNLV2PresenceSource = "heartbeat" | "startup" | "admin" | "reset" | "unknown";
type BNLV2RelaySourceClass = "fresh_public_event" | "recent_public_continuity" | "scoped_broadcast_memory" | "public_safe_memory" | "approved_canon" | "grounded_reflection";
type BNLV2RelayTrigger = "scheduled" | "force_pull" | "manual";

interface BNLAdminState {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  currentDirective?: string;
  source?: BNLSourceValue;
  lastSeen: string | null;
  persisted?: boolean;
  adminNote?: string;
  forcePullRequestedAt?: string | null;
  contractVersion?: 2;
  presence?: { contractVersion: 2; status: BNLStatusValue; mode: BNLModeValue; source: BNLV2PresenceSource; receivedAt: string };
  relay?: { contractVersion: 2; relayId: string; message: string; currentDirective: string; sourceClass: BNLV2RelaySourceClass; trigger: BNLV2RelayTrigger; publishedAt: string } | null;
}


type ForcePullOutcome = "queued" | "already_running" | "processing" | "published" | "disabled" | "no_safe_source" | "rejected" | "provider_failed" | "delivery_failed" | "unconfirmed" | "legacy";
interface ForcePullAttempt { requestedAt: string; requestId: string | null; status: ForcePullOutcome; sourceClass?: string; reason?: string; acceptedRelayId?: string; persisted?: boolean; warning?: string }
const PENDING_FORCE_PULL_OUTCOMES = new Set<ForcePullOutcome>(["queued", "already_running", "processing", "unconfirmed"]);
function isPendingForcePullAttempt(attempt: ForcePullAttempt | null): boolean { return Boolean(attempt && PENDING_FORCE_PULL_OUTCOMES.has(attempt.status)); }

interface BNLHistoryEntry { relayId?: string; publishedAt?: string; timestamp?: string; status?: BNLStatusValue; mode?: BNLModeValue; currentDirective?: string; message: string; source?: BNLSourceValue; sourceClass?: BNLV2RelaySourceClass; trigger?: BNLV2RelayTrigger; adminNote?: string; persisted?: boolean; }

const defaultRelayMessage = "BNL-01 relay standing by. Discord memory file monitoring active.";
const defaultBNL: BNLAdminState = { status: "OFFLINE", mode: "STANDBY", message: "BNL-01 relay awaiting signal.", lastSeen: null };
const SOURCE_LABELS: Record<BNLSourceValue, string> = {
  bot: "BNL bot",
  startup: "Bot startup",
  relay: "Dynamic relay",
  heartbeat: "Relay heartbeat",
  showday: "Show-day schedule",
  showtest: "Test command",
  admin: "Manual admin update",
  reset: "Admin reset",
  forcePull: "Direct Liaison Request",
  unknown: "Unknown source",
};

function formatLastSeenAge(lastSeen: string | null): string {
  if (!lastSeen) return "unknown";
  const parsed = new Date(lastSeen).getTime();
  if (Number.isNaN(parsed)) return "unknown";
  const diffMs = Date.now() - parsed;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes === 0) return "just now";
  if (minutes === 1) return "1 minute ago";
  return `${minutes} minutes ago`;
}

function formatLocalTimestamp(value: string | null): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(parsed);
}

function formatLastSeenSentence(value: string | null): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
  const date = new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
  return `Last seen at ${time} on ${date}`;
}

export default function AdminPage() {
  const { isLive, toggleLive, streamUrl, setStreamUrl, isScheduled, manualOverride, lastError, persisted } = useLiveStatus();
  const [urlInput, setUrlInput] = useState(streamUrl);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [passInput, setPassInput] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => { (async () => { try { const res = await fetch("/api/admin/verify"); setAuthenticated(res.ok);} catch {setAuthenticated(false);} setAuthLoading(false); })(); }, []);
  useEffect(() => { setUrlInput(streamUrl); }, [streamUrl]);

  async function handleLogin() { setAuthError(""); try { const res = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: passInput }) }); if (res.ok) { setAuthenticated(true); setPassInput(""); } else setAuthError("ACCESS DENIED"); } catch { setAuthError("CONNECTION FAILED"); } }
  async function handleLogout() { await fetch("/api/admin/auth", { method: "DELETE" }); setAuthenticated(false); }

  if (authLoading) return <div className="pt-14 min-h-screen flex items-center justify-center"><p className="text-xs uppercase tracking-[0.5em] text-muted animate-pulse">// AUTHENTICATING...</p></div>;
  if (!authenticated) return <div className="pt-14 min-h-screen flex items-center justify-center"><div className="border border-border bg-surface p-8 max-w-sm w-full"><p className="text-xs uppercase tracking-[0.5em] text-muted mb-6">// ADMIN ACCESS REQUIRED</p><div className="space-y-4"><input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }} placeholder="Enter access code" className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none" /><button onClick={handleLogin} className="w-full px-4 py-2.5 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all">Authenticate</button>{authError && <p className="text-xs text-danger">{authError}</p>}</div></div></div>;

  return <div className="pt-14"><section className="border-b border-border noise-bg"><div className="mx-auto max-w-7xl px-4 sm:px-6 py-16"><div className="flex items-center justify-between"><div><p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">// SYSTEM: ADMIN PANEL</p><h1 className="text-4xl font-bold tracking-tight text-foreground mb-2"><span className="text-accent text-glow">Admin</span> Panel</h1><p className="text-sm text-muted">Network control interface. Live status persisted via Redis.</p></div><button onClick={handleLogout} className="px-4 py-2 text-xs uppercase tracking-widest border border-danger/40 text-danger hover:bg-danger hover:text-background transition-all">Logout</button></div></div></section><AdminContent isLive={isLive} toggleLive={toggleLive} streamUrl={streamUrl} setStreamUrl={setStreamUrl} isScheduled={isScheduled} manualOverride={manualOverride} urlInput={urlInput} setUrlInput={setUrlInput} lastError={lastError} persisted={persisted} /></div>;
}

function AdminContent({ isLive, toggleLive, setStreamUrl, isScheduled, manualOverride, urlInput, setUrlInput, lastError, persisted }: any) {
  const [bnl, setBnl] = useState<BNLAdminState>(defaultBNL);
  const [history, setHistory] = useState<BNLHistoryEntry[]>([]);
  const [flags, setFlags] = useState({ websiteRelayEnabled: true, showdayDiscordPostsEnabled: true, heartbeatEnabled: true });
  const [relayForm, setRelayForm] = useState({ status: "ONLINE" as BNLStatusValue, mode: "OBSERVATION" as BNLModeValue, message: defaultRelayMessage });
  const [bnlApiReachable, setBnlApiReachable] = useState(false);
  const [forcePullRequestedAt, setForcePullRequestedAt] = useState<string | null>(null);
  const [forcePullAttempt, setForcePullAttempt] = useState<ForcePullAttempt | null>(null);
  const [relayActionError, setRelayActionError] = useState<string | null>(null);
  const [relayActionNote, setRelayActionNote] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadBnl = async (strict = false) => {
    const [publicRes, adminRes] = await Promise.all([fetch('/api/bnl/status', { cache: 'no-store' }), fetch('/api/admin/bnl', { cache: 'no-store' })]);
    setBnlApiReachable(publicRes.ok);
    if (strict && (!publicRes.ok || !adminRes.ok)) {
      throw new Error(`Refresh failed: public status ${publicRes.status}, admin status ${adminRes.status}`);
    }
    if (publicRes.ok) {
      const publicData = await publicRes.json();
      setBnl((prev) => ({ ...prev, ...publicData }));
      setRelayForm((x) => ({ ...x, status: publicData.status, mode: publicData.mode, message: publicData.message }));
    }
    if (adminRes.ok) {
      const adminData = await adminRes.json();
      if (adminData.status && typeof adminData.status === "object") {
        setBnl((prev) => ({ ...prev, ...(adminData.status as Partial<BNLAdminState>) }));
      }
      setHistory(adminData.history || []);
      setFlags(adminData.flags || flags);
      setForcePullRequestedAt(typeof adminData.forcePullRequestedAt === "string" ? adminData.forcePullRequestedAt : null);
      setForcePullAttempt(adminData.forcePullAttempt || null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const load = async () => {
      if (cancelled || document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        await loadBnl();
      } catch (error) {
        console.error("[admin] failed to refresh BNL state:", error);
      } finally {
        inFlight = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!isPendingForcePullAttempt(forcePullAttempt)) return;
    const started = Date.now();
    const interval = window.setInterval(() => {
      if (Date.now() - started > 60_000) {
        window.clearInterval(interval);
        setRelayActionNote("Force-pull outcome is still unconfirmed. Use manual refresh to resume checking.");
        return;
      }
      void loadBnl();
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [forcePullAttempt?.requestId, forcePullAttempt?.status]);

  const updateRelay = async (action: 'updateStatus' | 'resetStandby') => {
    if (pendingAction) return;
    setPendingAction(action); setRelayActionError(null); setRelayActionNote(null);
    try {
      const res = await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'resetStandby' ? { action } : { action, ...relayForm }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${res.status})`);
      setRelayActionNote(payload.persisted === false ? 'Relay updated in in-memory fallback only; persistence unavailable.' : 'Relay update confirmed.');
      await loadBnl(true);
    } catch (error) { setRelayActionError(error instanceof Error ? error.message : 'Relay action failed'); }
    finally { setPendingAction(null); }
  };

  const updateFlags = async (next: typeof flags) => {
    if (pendingAction) return;
    const previous = flags; setFlags(next); setPendingAction('updateFlags'); setRelayActionError(null); setRelayActionNote(null);
    try {
      const res = await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateFlags', flags: next }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${res.status})`);
      setRelayActionNote(payload.persisted === false ? 'Flags stored in in-memory fallback only; persistence unavailable.' : 'Control flags stored. BNL may apply scheduled flag changes on his next control refresh.');
    } catch (error) { setFlags(previous); setRelayActionError(error instanceof Error ? error.message : 'Flag update failed; previous values restored.'); }
    finally { setPendingAction(null); }
  };
  const clearLegacyHistory = async () => {
    const confirmed = window.confirm("This clears only the legacy v1 admin history compatibility log. Accepted v2 relay history is read-only and is not cleared.");
    if (!confirmed) return;
    if (pendingAction) return; setPendingAction('clearLegacyHistory'); setRelayActionError(null); setRelayActionNote(null);
    try { const res = await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearHistory' }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${res.status})`);
      setRelayActionNote(payload.persisted === false ? 'Legacy v1 history cleared in local in-memory fallback only; accepted v2 relay history was left intact.' : 'Legacy v1 history cleared. Accepted v2 relay history was left intact.');
      await loadBnl(true); } catch (error) { setRelayActionError(error instanceof Error ? error.message : 'Clear legacy history failed'); } finally { setPendingAction(null); }
  };
  const requestForcePull = async () => {
    if (pendingAction) return;
    setRelayActionError(null);
    setRelayActionNote(null);
    setPendingAction('forcePull');
    let forcePullError: string | null = null;
    try {
      const res = await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'forcePull' }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reasonParts = [
          typeof payload?.error === "string" ? payload.error : `Request failed (${res.status})`,
          payload?.forcePullAttempt?.reason ? `reason: ${payload.forcePullAttempt.reason}` : null,
          typeof payload?.forcePullAttempt?.status === "string" ? `status: ${payload.forcePullAttempt.status}` : null,
        ].filter(Boolean);
        forcePullError = reasonParts.join(" | ");
        throw new Error(forcePullError);
      }
      if (typeof payload?.note === "string") setRelayActionNote(payload.note);
    } catch (error) {
      forcePullError = error instanceof Error ? error.message : 'Failed to request immediate check-in';
      console.error('[admin] forcePull request failed:', error);
      setRelayActionError(forcePullError);
    } finally {
      try {
        await loadBnl(true);
      } catch (refreshError) {
        const refreshMessage = refreshError instanceof Error ? refreshError.message : 'Manual refresh failed after force-pull request';
        if (!forcePullError) setRelayActionError(refreshMessage);
      } finally {
        setPendingAction(null);
      }
    }
  };

  const lastSeenAge = formatLastSeenAge(bnl.lastSeen);
  const lastSeenSentence = formatLastSeenSentence(bnl.lastSeen);
  const modSignalBriefing = bnl.adminNote?.trim();

  return <section><div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 space-y-8">{/* existing cards omitted for brevity in source */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div className="border border-accent/40 bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-[0.5em] text-accent mb-3">Show Management</p><h2 className="text-2xl font-bold text-foreground">Show Management</h2><p className="text-sm text-muted mt-2">Start sessions, open submissions, run the queue, and review archived shows.</p></div><a href="/admin/show-management" className="inline-flex items-center justify-center border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Open Show Management</a></div></div>
    <div className="border border-accent/40 bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-[0.5em] text-accent mb-3">Dossier Workflow</p><h2 className="text-2xl font-bold text-foreground">Dossier Control Center</h2><p className="text-sm text-muted mt-2">Review dossier candidates, manage drafts, and prepare approved website dossier entries.</p></div><Link href="/admin/dossiers" className="inline-flex items-center justify-center border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Open Dossier Control Center</Link></div></div>
    <div className="border border-accent/40 bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-[0.5em] text-accent mb-3">BNL Observation Center</p><h2 className="text-2xl font-bold text-foreground">Journal Automation</h2><p className="text-sm text-muted mt-2">Control daily and weekly Journal publishing, queue a run, and inspect BNL automation telemetry.</p></div><Link href="/admin/journal" className="inline-flex items-center justify-center border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Open Observation Center</Link></div></div>
  </div><div className="grid grid-cols-1"><div className="border border-danger/40 bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-[0.5em] text-danger mb-3">Storage Recovery</p><h2 className="text-2xl font-bold text-foreground">Redis Capacity Recovery</h2><p className="text-sm text-muted mt-2">Analyze Redis storage and explicitly clean only superseded dossier Source File archive keys.</p></div><Link href="/admin/storage-recovery" className="inline-flex items-center justify-center border border-danger px-5 py-3 text-xs uppercase tracking-widest text-danger hover:bg-danger hover:text-background transition-all">Open Storage Recovery</Link></div></div>
  </div>


  <div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="border border-border bg-surface p-6"><h2 className="text-[10px] uppercase tracking-[0.5em] text-muted mb-6">BARCODE Radio — Live Status</h2><button onClick={toggleLive} className="w-full px-4 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all font-bold">{isLive ? 'GO OFFLINE':'GO LIVE'}</button><div className="text-xs text-muted/50 mt-3"><p>// Scheduled: {isScheduled ? 'YES' : 'NO'}</p><p>// Override: {manualOverride ? 'ACTIVE' : 'NONE'}</p><p>// Persistence: {persisted === null ? 'UNKNOWN' : persisted ? 'REDIS' : 'IN-MEMORY'}</p>{lastError && <p className='text-danger'>{lastError}</p>}</div></div><div className="border border-border bg-surface p-6"><h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-6">Stream URL</h2><input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /><button onClick={() => setStreamUrl(urlInput)} className="mt-4 w-full px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all">Update Stream URL</button></div></div>

  <div className="border border-border bg-surface p-6 space-y-5"><div><h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">BNL-01 Relay Control</h2><p className="text-xs text-muted/70 mt-2">Admin controls for relay state, safety flags, and operator history. State refreshes automatically every 15 seconds.</p></div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted"><p>BNL status API reachable: <span className="text-foreground">{bnlApiReachable ? 'yes':'no'}</span></p><p>Last seen age: <span className="text-foreground">{lastSeenAge}</span></p><p>Redis persistence: <span className="text-foreground">{bnl.persisted ? 'enabled':'in-memory fallback'}</span></p><p>Current mode: <span className="text-foreground">{bnl.mode}</span></p></div>
  <div className="space-y-3">
    <div className="text-sm border border-border p-4 bg-background/40">
      <p className="text-xs text-accent uppercase tracking-widest mb-2">Public Website Relay (what visitors see)</p>
      <p>Status: {bnl.status}</p>
      <p>Mode: {bnl.mode}</p>
      <p>Message: {bnl.message}</p>
      <p>Current Directive: {bnl.currentDirective || 'Monitoring Discord-side relay traffic.'}</p>
      <p>{lastSeenSentence} (your local time)</p>
      <p>Last Seen Age: {lastSeenAge}</p>
    </div>
    <div className="text-sm border border-border p-4 bg-background/30">
      <p className="text-xs text-muted uppercase tracking-widest mb-2">Admin Relay Metadata (admin only)</p>
      <p>Source Label: {SOURCE_LABELS[bnl.source || "unknown"]}</p>
      <p>Raw Source Code: {bnl.source || "unknown"}</p>
      <p>Resolved Presence: {bnl.presence ? `${bnl.presence.status} / ${bnl.presence.mode}` : "v1 fallback"}</p>
      <p>Relay ID: {bnl.relay?.relayId || "v1 fallback / no v2 relay"}</p>
      <p>Relay Published At: {bnl.relay?.publishedAt ? formatLocalTimestamp(bnl.relay.publishedAt) : "unknown"}</p>
      <p>Presence Received At: {bnl.presence?.receivedAt ? formatLocalTimestamp(bnl.presence.receivedAt) : "unknown"}</p>
      <p>Source Class: {bnl.relay?.sourceClass || "v1 fallback"}</p>
      <p>Trigger: {bnl.relay?.trigger || "v1 fallback"}</p>
      <p>Persistence Layer: {bnl.persisted ? "Redis" : "In-memory fallback"}</p>
      <p className="text-xs text-muted mt-2">This metadata is for admin visibility and is not part of the public ticker display.</p>
    </div>
    <div className="text-sm border border-border p-4 bg-background/20">
      <p className="text-xs text-accent uppercase tracking-widest mb-2">Mod Signal Briefing</p>
      <p className="text-foreground break-words whitespace-pre-wrap">{modSignalBriefing || "No fresh mod-facing signal. BNL has not produced a briefing from eligible public activity yet."}</p>
      <p className="text-xs text-muted mt-2">Briefings should be generated from eligible public Discord activity only. Sealed, admin, and internal channels are excluded.</p>
    </div>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><select value={relayForm.status} onChange={(e)=>setRelayForm({...relayForm,status:e.target.value as BNLStatusValue})} className="bg-background border border-border px-3 py-2.5 text-sm"><option>ONLINE</option><option>OFFLINE</option></select><select value={relayForm.mode} onChange={(e)=>setRelayForm({...relayForm,mode:e.target.value as BNLModeValue})} className="bg-background border border-border px-3 py-2.5 text-sm"><option>STANDBY</option><option>OBSERVATION</option><option>ACTIVE_LIAISON</option><option>SIGNAL_DEGRADATION</option><option>RESTRICTED</option></select></div>
  <textarea value={relayForm.message} maxLength={600} onChange={(e)=>setRelayForm({...relayForm,message:e.target.value.slice(0,600)})} className="w-full bg-background border border-border px-3 py-2.5 text-sm" />
  <div className="flex flex-wrap gap-3"><button disabled={Boolean(pendingAction)} onClick={()=>updateRelay('updateStatus')} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all disabled:opacity-50">{pendingAction === 'updateStatus' ? 'Updating…' : 'Update BNL Relay'}</button><button disabled={Boolean(pendingAction)} onClick={()=>updateRelay('resetStandby')} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all disabled:opacity-50">{pendingAction === 'resetStandby' ? 'Resetting…' : 'Reset BNL Relay to Standby'}</button><button disabled={Boolean(pendingAction)} onClick={requestForcePull} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all disabled:opacity-50">{pendingAction === 'forcePull' ? 'Sending request…' : 'Request Immediate BNL Check-in'}</button><button disabled={Boolean(pendingAction)} onClick={async()=>{ setPendingAction('refresh'); setRelayActionError(null); try { await loadBnl(true); setRelayActionNote('BNL status refreshed. Pending outcomes were checked again if available.'); } catch { setRelayActionError('Manual refresh failed.'); } finally { setPendingAction(null); } }} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all disabled:opacity-50">{pendingAction === 'refresh' ? 'Refreshing…' : 'Refresh BNL Status'}</button></div>
  <div className="text-xs text-muted space-y-1">
    <p><strong>Update BNL Relay:</strong> Publishes the status, mode, and message entered above to the public website relay immediately.</p>
    <p><strong>Reset BNL Relay to Standby:</strong> Updates presence/mode to standby without erasing the last accepted relay speech or history.</p>
    <p><strong>Request Immediate BNL Check-in:</strong> Sends a forcePull request to BNL. A delivered or 202 accepted request means BNL accepted work; it does not by itself mean a relay was published.</p>
    <p><strong>If webhook delivery fails:</strong> The request timestamp is still recorded on this site, but the bot endpoint did not receive the check-in request.</p>
    <p><strong>History refresh:</strong> Accepted v2 relay history is authoritative/read-only here; legacy v1 history is retained only for compatibility inspection.</p>
  </div>
  <p className="text-xs text-muted">Last immediate check-in request: {forcePullRequestedAt || "never"}.</p>
  {forcePullAttempt && <p className="text-xs text-muted">Force-pull outcome: {String(forcePullAttempt.status || "outcome unavailable")} {forcePullAttempt.requestId ? `(request ${forcePullAttempt.requestId})` : ""}{forcePullAttempt.warning ? ` — ${forcePullAttempt.warning}` : ""}{forcePullAttempt.persisted === false ? " — persistence unavailable" : ""}</p>}
  {relayActionError && <p className="text-xs text-danger">Immediate check-in request failed: {relayActionError}</p>}
  {relayActionNote && <p className="text-xs text-muted">{relayActionNote}</p>}
  <div><p className="text-xs text-muted mb-2">Control flags are stored immediately. BNL may apply scheduled flag changes on his next control refresh; a switch alone does not guarantee an immediate relay.</p>
    <label className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span><strong>Website Relay Enabled:</strong> Allows BNL to update the public website relay automatically.</span><input disabled={Boolean(pendingAction)} type="checkbox" checked={flags.websiteRelayEnabled} onChange={(e)=>updateFlags({...flags,websiteRelayEnabled:e.target.checked})} /></label>
    <label className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span><strong>Show-Day Discord Posts Enabled:</strong> Allows BNL to post scheduled Friday show updates in Discord.</span><input disabled={Boolean(pendingAction)} type="checkbox" checked={flags.showdayDiscordPostsEnabled} onChange={(e)=>updateFlags({...flags,showdayDiscordPostsEnabled:e.target.checked})} /></label>
    <label className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span><strong>Heartbeat Enabled:</strong> Allows BNL to refresh presence/heartbeat state only; heartbeat never replaces accepted relay speech.</span><input disabled={Boolean(pendingAction)} type="checkbox" checked={flags.heartbeatEnabled} onChange={(e)=>updateFlags({...flags,heartbeatEnabled:e.target.checked})} /></label>
  </div>
  <div><div className="flex items-center justify-between"><p className="text-xs text-muted mb-2">Accepted v2 Relay History (admin only) — most recent 25 accepted relay publications. Legacy v1 history is retained server-side for compatibility/migration inspection.</p><button disabled={Boolean(pendingAction)} onClick={clearLegacyHistory} className="px-3 py-1.5 text-xs uppercase tracking-widest border border-danger/40 text-danger hover:bg-danger hover:text-background transition-all">Clear Legacy v1 History</button></div><div className="space-y-2 text-xs">{history.map((entry, idx)=><div key={entry.relayId || idx} className="border border-border p-2"><p>{formatLocalTimestamp(entry.publishedAt || entry.timestamp || null)} — {entry.relayId || 'legacy entry'} {entry.sourceClass ? `(${entry.sourceClass} / ${entry.trigger || 'unknown trigger'})` : `(${SOURCE_LABELS[entry.source || 'unknown']})`}</p>{entry.currentDirective && <p className="break-words whitespace-pre-wrap">Directive: {entry.currentDirective}</p>}<p>{entry.message}</p>{entry.adminNote && <p>Legacy Operator Note: {entry.adminNote}</p>}<p className="text-muted">Persistence: {entry.persisted === undefined ? "canonical v2 / unknown layer" : entry.persisted ? "Stored in Redis (persistent shared storage)" : "In-memory fallback (temporary local storage)"}</p></div>)}</div></div>
  </div>

  </div></section>;
}
