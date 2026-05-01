"use client";

import { useLiveStatus } from "@/components/LiveStatusProvider";
import { useState, useEffect } from "react";

type BNLStatusValue = "ONLINE" | "OFFLINE";
type BNLModeValue = "STANDBY" | "OBSERVATION" | "ACTIVE_LIAISON" | "SIGNAL_DEGRADATION" | "RESTRICTED";
type BNLSourceValue = "admin" | "reset" | "bot" | "startup" | "showday" | "heartbeat" | "showtest" | "unknown";

interface BNLAdminState {
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  lastSeen: string | null;
  persisted?: boolean;
}

interface BNLHistoryEntry {
  timestamp: string;
  status: BNLStatusValue;
  mode: BNLModeValue;
  message: string;
  source: BNLSourceValue;
}

const defaultRelayMessage = "BNL-01 relay standing by. Discord-side signal monitoring active.";
const defaultBNL: BNLAdminState = { status: "OFFLINE", mode: "STANDBY", message: "BNL-01 relay awaiting signal.", lastSeen: null };
const sourceLabelMap: Record<BNLSourceValue, string> = {
  admin: "Manual admin update",
  reset: "Admin reset",
  bot: "BNL bot",
  startup: "Bot startup",
  showday: "Show-day schedule",
  heartbeat: "Website relay heartbeat",
  showtest: "Test command",
  unknown: "Unknown source",
};

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

function AdminContent({ isLive, toggleLive, streamUrl, setStreamUrl, isScheduled, manualOverride, urlInput, setUrlInput, lastError, persisted }: any) {
  const [bnl, setBnl] = useState<BNLAdminState>(defaultBNL);
  const [history, setHistory] = useState<BNLHistoryEntry[]>([]);
  const [flags, setFlags] = useState({ websiteRelayEnabled: true, showdayDiscordPostsEnabled: true, heartbeatEnabled: true });
  const [relayForm, setRelayForm] = useState({ status: "ONLINE" as BNLStatusValue, mode: "OBSERVATION" as BNLModeValue, message: defaultRelayMessage });
  const [bnlApiReachable, setBnlApiReachable] = useState(false);

  const loadBnl = async () => {
    const [publicRes, adminRes] = await Promise.all([fetch('/api/bnl/status', { cache: 'no-store' }), fetch('/api/admin/bnl', { cache: 'no-store' })]);
    setBnlApiReachable(publicRes.ok);
    if (publicRes.ok) {
      const publicData = await publicRes.json();
      setBnl(publicData);
      setRelayForm((x) => ({ ...x, status: publicData.status, mode: publicData.mode, message: publicData.message }));
    }
    if (adminRes.ok) {
      const adminData = await adminRes.json();
      setHistory(adminData.history || []);
      setFlags(adminData.flags || flags);
    }
  };

  useEffect(() => { loadBnl(); }, []);

  const updateRelay = async (action: 'updateStatus' | 'resetStandby') => {
    if (action === "updateStatus") {
      const shouldPublish = window.confirm("Publish this exact message to the public website ticker?");
      if (!shouldPublish) return;
    }
    if (action === "resetStandby") {
      const shouldReset = window.confirm("This will replace the current public relay with the neutral standby message. It will not restart BNL or affect Discord.");
      if (!shouldReset) return;
    }
    await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action === 'resetStandby' ? { action } : { action, ...relayForm }) });
    await loadBnl();
  };

  const updateFlags = async (next: typeof flags) => {
    setFlags(next);
    await fetch('/api/admin/bnl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateFlags', flags: next }) });
  };

  const lastSeenAge = bnl.lastSeen ? `${Math.max(0, Math.floor((Date.now() - new Date(bnl.lastSeen).getTime()) / 60000))} minutes ago` : 'unknown';

  return <section><div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 space-y-8">{/* existing cards omitted for brevity in source */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-8"><div className="border border-border bg-surface p-6"><h2 className="text-[10px] uppercase tracking-[0.5em] text-muted mb-6">BARCODE Radio — Live Status</h2><button onClick={toggleLive} className="w-full px-4 py-3 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all font-bold">{isLive ? 'GO OFFLINE':'GO LIVE'}</button><div className="text-xs text-muted/50 mt-3"><p>// Scheduled: {isScheduled ? 'YES' : 'NO'}</p><p>// Override: {manualOverride ? 'ACTIVE' : 'NONE'}</p><p>// Persistence: {persisted === null ? 'UNKNOWN' : persisted ? 'REDIS' : 'IN-MEMORY'}</p>{lastError && <p className='text-danger'>{lastError}</p>}</div></div><div className="border border-border bg-surface p-6"><h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-6">Stream URL</h2><input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /><button onClick={() => setStreamUrl(urlInput)} className="mt-4 w-full px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all">Update Stream URL</button></div></div>

  <div className="border border-border bg-surface p-6 space-y-5"><div><h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">BNL-01 Relay Control</h2><p className="text-xs text-muted/70 mt-2">Admin controls for relay state, safety flags, and operator history.</p></div>
  <div className="border border-border bg-background/40 p-4 text-sm text-muted"><p>BNL-01 Relay Control changes what the public website displays in the Network Relay ticker. These controls do not restart the Discord bot, clear BNL memory, or change Discord messages unless explicitly stated.</p></div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted"><p>BNL status API reachable: <span className="text-foreground">{bnlApiReachable ? 'yes':'no'}</span></p><p>Last seen age: <span className="text-foreground">{lastSeenAge}</span></p><p>Redis persistence: <span className="text-foreground">{bnl.persisted ? 'enabled':'in-memory fallback'}</span></p><p>Current mode: <span className="text-foreground">{bnl.mode}</span></p></div>
  <div className="text-sm border border-border p-4 bg-background/40"><p className="text-xs text-muted mb-2">Current BNL status from /api/bnl/status.</p><p>Status: {bnl.status}</p><p>Mode: {bnl.mode}</p><p>Message: {bnl.message}</p><p>Last seen: {bnl.lastSeen || 'never'}</p></div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div><p className="text-xs text-muted mb-2">Status: Whether the public site should show BNL as online or offline.</p><select value={relayForm.status} onChange={(e)=>setRelayForm({...relayForm,status:e.target.value as BNLStatusValue})} className="w-full bg-background border border-border px-3 py-2.5 text-sm"><option>ONLINE</option><option>OFFLINE</option></select></div><div><p className="text-xs text-muted mb-2">Mode: The public operating state shown on the site.</p><select value={relayForm.mode} onChange={(e)=>setRelayForm({...relayForm,mode:e.target.value as BNLModeValue})} className="w-full bg-background border border-border px-3 py-2.5 text-sm"><option>STANDBY</option><option>OBSERVATION</option><option>ACTIVE_LIAISON</option><option>SIGNAL_DEGRADATION</option><option>RESTRICTED</option></select></div></div>
  <div><p className="text-xs text-muted mb-2">Message: The exact text displayed in the public Network Relay ticker. Maximum 240 characters.</p><textarea value={relayForm.message} maxLength={240} onChange={(e)=>setRelayForm({...relayForm,message:e.target.value.slice(0,240)})} className="w-full bg-background border border-border px-3 py-2.5 text-sm" /></div>
  <div className="space-y-3"><div><p className="text-xs text-muted mb-2">Use this to manually set exactly what the public website ticker says. This overrides the current relay message until BNL sends another update.</p><button onClick={()=>updateRelay('updateStatus')} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all">Publish Manual Relay Message</button></div><div><p className="text-xs text-muted mb-2">Returns the public website relay to neutral BNL observation mode. This does not restart BNL, clear memory, or affect Discord.</p><button onClick={()=>updateRelay('resetStandby')} className="px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all">Reset Website Relay to Standby</button></div></div>
  <div className="border border-dashed border-border p-4 bg-background/20"><h3 className="text-xs uppercase tracking-[0.35em] text-muted mb-2">Request Fresh BNL Relay</h3><p className="text-xs text-muted/80">Coming next: asks BNL to generate a new dynamic relay based on Discord/show context. This is different from manually publishing a message.</p><button disabled className="mt-3 px-4 py-2.5 text-xs uppercase tracking-widest border border-border text-muted/60 cursor-not-allowed">Unavailable in website admin</button></div>
  <div><p className="text-xs text-muted mb-2">Kill switches are stored for future bot consumption.</p>{Object.entries(flags).map(([k,v])=><label key={k} className="flex items-center justify-between text-sm border border-border px-3 py-2 mb-2"><span>{k}</span><input type="checkbox" checked={v} onChange={(e)=>updateFlags({...flags,[k]:e.target.checked})} /></label>)}</div>
  <div><p className="text-xs text-muted mb-2">Most recent 10 relay updates with source labels.</p><div className="space-y-2 text-xs">{history.map((entry, idx)=><div key={idx} className="border border-border p-2"><p>{entry.timestamp} — {entry.status} / {entry.mode} ({sourceLabelMap[entry.source] || sourceLabelMap.unknown})</p><p>{entry.message}</p></div>)}</div></div>
  </div>

  </div></section>;
}
