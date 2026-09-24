"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionStatus = { configured: boolean; connected: { username: string; verifiedAt: number; expiresAt: number } | null };
const ENDPOINT = "/api/discord/connection";

export function DiscordConnection({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const readSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++readSequence.current;
    try {
      const response = await fetch(ENDPOINT, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Discord connection status is unavailable. Your music submission is unaffected.");
      const next = await response.json();
      if (sequence !== readSequence.current) return;
      setStatus(next);
      setError("");
    } catch {
      if (sequence !== readSequence.current) return;
      setStatus(null);
      setError("Discord connection status is unavailable. Your music submission is unaffected.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (!inFlight.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { readSequence.current++; window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  async function act(action: "start" | "disconnect") {
    if (inFlight.current) return;
    inFlight.current = true;
    readSequence.current++;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(8000) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Connection could not be updated.");
      if (action === "start") { window.location.assign(body.authorizationUrl); return; }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Connection could not be updated."); }
    finally { inFlight.current = false; setBusy(false); }
  }

  // Absent configuration does not advertise an unavailable feature on the Deck.
  if (compact && !status?.configured && !status?.connected) return null;
  return <section className="space-y-3 border border-border bg-background/40 p-4 text-sm" aria-label="Discord connection">
    <h2 className="font-bold text-foreground">Discord connection{compact ? " · optional" : ""}</h2>
    <p className="text-muted">Connect your Discord account to BARCODE. You can submit music without connecting.</p>
    <div aria-live="polite">
      {!status && !error && <p className="text-muted">Checking connection…</p>}
      {status?.connected && <p className="break-words text-cyan-200">Connected as @{status.connected.username}</p>}
      {status && !status.connected && !status.configured && <p className="text-muted">Discord connection is not available yet.</p>}
      {error && <p className="text-accent" role="alert">{error}</p>}
    </div>
    {compact ? <a href="/connect/discord" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center border border-accent/50 px-4 py-2 text-accent hover:bg-accent/10">{status?.connected ? "Manage connection" : "Connect Discord"}<span className="sr-only"> (opens in a new tab)</span></a> : <div className="flex flex-wrap gap-3">
      {status?.configured && <button type="button" disabled={busy} onClick={() => { void act("start"); }} className="min-h-11 border border-accent bg-accent px-4 py-2 text-white disabled:opacity-50">{busy ? "Please wait…" : status.connected ? "Use another Discord account" : "Continue to Discord"}</button>}
      {status?.connected && <button type="button" disabled={busy} onClick={() => { void act("disconnect"); }} className="min-h-11 border border-border px-4 py-2 disabled:opacity-50">Disconnect this browser</button>}
      {error && <button type="button" disabled={busy} onClick={() => { void refresh(); }} className="min-h-11 border border-border px-4 py-2">Check again</button>}
    </div>}
    {!compact && <p className="text-xs text-muted">This connection applies to future submissions from this browser. Disconnecting removes the saved connection. Connecting does not verify ownership of an artist name or TikTok account.</p>}
  </section>;
}
