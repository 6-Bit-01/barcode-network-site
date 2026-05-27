/* eslint-disable react-hooks/set-state-in-effect, react/jsx-no-comment-textnodes, @typescript-eslint/no-explicit-any */
"use client";

import { useLiveStatus } from "@/components/LiveStatusProvider";
import { useState, useEffect } from "react";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
type BNLSourceValue = "bot" | "startup" | "relay" | "heartbeat" | "showday" | "showtest" | "admin" | "reset" | "forcePull" | "unknown";

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
}

interface BNLHistoryEntry {
  timestamp: string;
  status: BNLStatusValue;
  mode: BNLModeValue;
  currentDirective?: string;
  message: string;
  source: BNLSourceValue;
  adminNote?: string;
  persisted?: boolean;
}

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
  forcePull: "Immediate check-in",
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
  const [relayActionError, setRelayActionError] = useState<string | null>(null);
  const [relayActionNote, setRelayActionNote] = useState<string | null>(null);

  const loadBnl = async () => {
    const [publicRes, adminRes] = await Promise.all([fetch('/api/bnl/status', { cache: 'no-store' }), fetch('/api/admin/bnl', { cache: 'no-store' })]);
    setBnlApiReachable(publicRes.ok);
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
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cancelled) return;
      try {
        await loadBnl();
      } catch (error) {
        console.error("[admin] failed to refresh BNL state:", error);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const updateRelay = async (action: 'updateStatus' | 'resetStandby') => {
    await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'resetStandby' ? { action } : { action, ...relayForm }) });
    await loadBnl();
  };

  const updateFlags = async (next: typeof flags) => {
    setFlags(next);
    await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateFlags', flags: next }) });
  };
  const clearHistory = async () => {
    const confirmed = window.confirm("This clears the admin history log only. It does not reset BNL, change the public ticker, or affect Discord.");
    if (!confirmed) return;
    await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'clearHistory' }) });
    await loadBnl();
  };
  const requestForcePull = async () => {
    setRelayActionError(null);
    setRelayActionNote(null);
    try {
      const res = await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'forcePull' }) });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reasonParts = [
          typeof payload?.error === "string" ? payload.error : `Request failed (${res.status})`,
          payload?.webhookDelivery?.reason ? `reason: ${payload.webhookDelivery.reason}` : null,
          typeof payload?.webhookDelivery?.status === "number" ? `status: ${payload.webhookDelivery.status}` : null,
        ].filter(Boolean);
        const reason = reasonParts.join(" | ");
        throw new Error(reason);
      }
      if (typeof payload?.note === "string") setRelayActionNote(payload.note);
      if (payload?.webhookDelivery && payload.webhookDelivery.delivered === false) {
        console.warn("[admin] forcePull webhook delivery warning:", payload.webhookDelivery);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request immediate check-in';
      console.error('[admin] forcePull request failed:', error);
      setRelayActionError(message);
    } finally {
      await loadBnl();
    }
  };

  const lastSeenAge = formatLastSeenAge(bnl.lastSeen);
  const lastSeenSentence = formatLastSeenSentence(bnl.lastSeen);
  const modSignalBriefing = bnl.adminNote?.trim();

  return <section><div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 space-y-8">{/* existing cards omitted for brevity in source */}
  <div className="border border-accent/40 bg-surface p-6 space-y-4"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-xs uppercase tracking-[0.5em] text-accent mb-3">Show Management</p><h2 className="text-2xl font-bold text-foreground">Show Management</h2><p className="text-sm text-muted mt-2">Start sessions, open submissions, run the queue, and review archived shows.</p></div><a href="/admin/show-management" className="inline-flex items-center justify-center border border-accent px-5 py-3 text-xs uppercase tracking-widest text-accent hover:bg-accent hover:text-background transition-all">Open Show Management</a></div></div>


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
  <div className="flex flex-wrap gap-3"><button onClick={()=>updateRelay('updateStatus')} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all">Update BNL Relay</button><button onClick={()=>updateRelay('resetStandby')} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all">Reset BNL Relay to Standby</button><button onClick={requestForcePull} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all">Request Immediate BNL Check-in</button><button onClick={loadBnl} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all">Refresh BNL Status</button></div>
  <div className="text-xs text-muted space-y-1">
    <p><strong>Update BNL Relay:</strong> Publishes the status, mode, and message entered above to the public website relay immediately.</p>
    <p><strong>Reset BNL Relay to Standby:</strong> Sets relay back to monitoring/standby messaging and marks source as admin reset.</p>
    <p><strong>Request Immediate BNL Check-in:</strong> Sends a forcePull request to the bot/VPS endpoint so it can generate and push a fresh relay update.</p>
    <p><strong>If webhook delivery fails:</strong> The request timestamp is still recorded on this site, but the bot endpoint did not receive the check-in request.</p>
    <p><strong>History refresh:</strong> Relay metadata/history refresh automatically and can also be refreshed manually with <em>Refresh BNL Status</em>.</p>
  </div>
  <p className="text-xs text-muted">Last immediate check-in request: {forcePullRequestedAt || "never"}.</p>
  {relayActionError && <p className="text-xs text-danger">Immediate check-in request failed: {relayActionError}</p>}
  {relayActionNote && <p className="text-xs text-muted">{relayActionNote}</p>}
  <div><p className="text-xs text-muted mb-2">Kill switches are stored for future bot consumption.</p>
    <label className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span><strong>Website Relay Enabled:</strong> Allows BNL to update the public website relay automatically.</span><input type="checkbox" checked={flags.websiteRelayEnabled} onChange={(e)=>updateFlags({...flags,websiteRelayEnabled:e.target.checked})} /></label>
    <label className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span><strong>Show-Day Discord Posts Enabled:</strong> Allows BNL to post scheduled Friday show updates in Discord.</span><input type="checkbox" checked={flags.showdayDiscordPostsEnabled} onChange={(e)=>updateFlags({...flags,showdayDiscordPostsEnabled:e.target.checked})} /></label>
    <label className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span><strong>Heartbeat Enabled:</strong> Allows BNL to keep the website relay fresh with periodic status updates.</span><input type="checkbox" checked={flags.heartbeatEnabled} onChange={(e)=>updateFlags({...flags,heartbeatEnabled:e.target.checked})} /></label>
  </div>
  <div><div className="flex items-center justify-between"><p className="text-xs text-muted mb-2">Admin Relay History (admin only) — most recent 25 updates received from BNL/admin actions.</p><button onClick={clearHistory} className="px-3 py-1.5 text-xs uppercase tracking-widest border border-danger/40 text-danger hover:bg-danger hover:text-background transition-all">Clear Relay History</button></div><div className="space-y-2 text-xs">{history.map((entry, idx)=><div key={idx} className="border border-border p-2"><p>{formatLocalTimestamp(entry.timestamp)} — {entry.status} / {entry.mode} ({SOURCE_LABELS[entry.source || 'unknown']})</p>{entry.currentDirective && <p className="break-words whitespace-pre-wrap">Directive: {entry.currentDirective}</p>}<p>{entry.message}</p>{entry.adminNote && <p>Operator Note: {entry.adminNote}</p>}<p className="text-muted">Persistence: {entry.persisted === undefined ? "unknown" : entry.persisted ? "Stored in Redis (persistent shared storage)" : "In-memory fallback (temporary local storage)"}</p></div>)}</div></div>
  </div>

  </div></section>;
}
