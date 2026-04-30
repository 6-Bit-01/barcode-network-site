"use client";

import { useLiveStatus } from "@/components/LiveStatusProvider";
import { useState, useEffect, useCallback } from "react";
import type { QueueState, QueueEntry, QueueTier } from "@/lib/queue-types";
import { TIERS, normalizeTier } from "@/lib/queue-types";

// Tier badge colors
const TIER_COLORS: Record<QueueTier, string> = {
  free: "text-muted border-muted/40",
  featured: "text-accent border-accent/40",
  fastlane: "text-yellow-400 border-yellow-400/40",
  frontrow: "text-danger border-danger/40",
};

export default function AdminPage() {
  const { isLive, toggleLive, streamUrl, setStreamUrl, isScheduled, manualOverride } = useLiveStatus();
  const [urlInput, setUrlInput] = useState(streamUrl);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [passInput, setPassInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Queue state
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueAction, setQueueAction] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");

  // Check if already authenticated on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/admin/verify");
        setAuthenticated(res.ok);
      } catch {
        setAuthenticated(false);
      }
      setAuthLoading(false);
    }
    checkAuth();
  }, []);

  // Sync urlInput when streamUrl changes from server
  useEffect(() => {
    setUrlInput(streamUrl);
  }, [streamUrl]);

  async function handleLogin() {
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passInput }),
      });
      if (res.ok) {
        setAuthenticated(true);
        setPassInput("");
      } else {
        setAuthError("ACCESS DENIED");
      }
    } catch {
      setAuthError("CONNECTION FAILED");
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthenticated(false);
  }

  if (authLoading) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center">
        <p className="text-xs uppercase tracking-[0.5em] text-muted animate-pulse">
          // AUTHENTICATING...
        </p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center">
        <div className="border border-border bg-surface p-8 max-w-sm w-full">
          <p className="text-xs uppercase tracking-[0.5em] text-muted mb-6">
            // ADMIN ACCESS REQUIRED
          </p>
          <div className="space-y-4">
            <input
              type="password"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
              placeholder="Enter access code"
              className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none"
            />
            <button
              onClick={handleLogin}
              className="w-full px-4 py-2.5 text-sm uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all"
            >
              Authenticate
            </button>
            {authError && (
              <p className="text-xs text-danger">{authError}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-14">
      <section className="border-b border-border noise-bg">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted mb-4">
                // SYSTEM: ADMIN PANEL
              </p>
              <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">
                <span className="text-accent text-glow">Admin</span> Panel
              </h1>
              <p className="text-sm text-muted">
                Network control interface. Live status persisted via Redis.
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-xs uppercase tracking-widest border border-danger/40 text-danger hover:bg-danger hover:text-background transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </section>

      <AdminContent
        isLive={isLive}
        toggleLive={toggleLive}
        streamUrl={streamUrl}
        setStreamUrl={setStreamUrl}
        isScheduled={isScheduled}
        manualOverride={manualOverride}
        urlInput={urlInput}
        setUrlInput={setUrlInput}
        queueState={queueState}
        setQueueState={setQueueState}
        queueLoading={queueLoading}
        setQueueLoading={setQueueLoading}
        queueAction={queueAction}
        setQueueAction={setQueueAction}
        apiKey={apiKey}
        setApiKey={setApiKey}
      />
    </div>
  );
}

// ============================================================
// Admin Content — extracted to keep main component clean
// ============================================================

function AdminContent({
  isLive, toggleLive, streamUrl, setStreamUrl, isScheduled, manualOverride,
  urlInput, setUrlInput,
  queueState, setQueueState,
  queueLoading, setQueueLoading,
  queueAction, setQueueAction,
  apiKey, setApiKey,
}: {
  isLive: boolean;
  toggleLive: () => void;
  streamUrl: string;
  setStreamUrl: (v: string) => void;
  isScheduled: boolean;
  manualOverride: boolean;
  urlInput: string;
  setUrlInput: (v: string) => void;
  queueState: QueueState | null;
  setQueueState: (v: QueueState | null) => void;
  queueLoading: boolean;
  setQueueLoading: (v: boolean) => void;
  queueAction: string | null;
  setQueueAction: (v: string | null) => void;
  apiKey: string;
  setApiKey: (v: string) => void;
}) {
  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const res = await fetch("/api/queue");
      if (res.ok) setQueueState(await res.json());
    } catch { /* silent */ }
    setQueueLoading(false);
  }, [setQueueState, setQueueLoading]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  async function queueApiCall(path: string, body?: Record<string, string>) {
    if (!apiKey.trim()) {
      setQueueAction("ERROR: Enter API key first");
      return;
    }
    setQueueAction(`Calling ${path}...`);
    try {
      const res = await fetch(`/api/queue/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      setQueueAction(res.ok ? `OK: ${JSON.stringify(data).slice(0, 120)}` : `ERROR: ${data.error}`);
      fetchQueue();
    } catch (err) {
      setQueueAction(`FAIL: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return (
    <section>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 space-y-8">

        {/* API Key Input */}
        <div className="border border-border bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <h2 className="text-[10px] uppercase tracking-[0.5em] text-muted">
              Queue API Key
            </h2>
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste QUEUE_API_KEY to enable queue controls"
            className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none font-mono"
          />
          <p className="text-xs text-muted/50 mt-2">Required for skip, reset, and stream status controls.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Live Toggle */}
          <div className="border border-border bg-surface p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className={`w-2 h-2 rounded-full ${isLive ? "bg-danger live-indicator" : "bg-muted"}`} />
              <h2 className="text-[10px] uppercase tracking-[0.5em] text-muted">
                BARCODE Radio — Live Status
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-foreground">Broadcast Status:</span>
                <span className={`text-sm font-bold uppercase tracking-wider ${isLive ? "text-danger text-glow-red" : "text-muted"}`}>
                  {isLive ? "LIVE" : "OFFLINE"}
                </span>
              </div>

              <button
                onClick={toggleLive}
                className={`w-full px-4 py-3 text-sm uppercase tracking-widest border transition-all font-bold ${
                  isLive
                    ? "border-danger text-danger hover:bg-danger hover:text-background"
                    : "border-accent text-accent hover:bg-accent hover:text-background"
                }`}
              >
                {isLive ? "GO OFFLINE" : "GO LIVE"}
              </button>

              <div className="text-xs text-muted/50 space-y-1">
                <p>// Schedule: Every Friday 6:40 PM – 11:00 PM PST (auto)</p>
                <p>// Scheduled: {isScheduled ? "YES — within broadcast window" : "NO — outside broadcast window"}</p>
                <p>// Override: {manualOverride ? "ACTIVE (admin override)" : "NONE (auto-schedule)"}</p>
                <p>// Toggle cycles: Auto → On → Off → Auto</p>
                <p>// Changes persist to Redis — visible to all visitors</p>
              </div>
            </div>
          </div>

          {/* Stream URL */}
          <div className="border border-border bg-surface p-6">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <h2 className="text-xs sm:text-sm uppercase tracking-[0.5em] text-muted">
                Stream URL
              </h2>
            </div>

            <div className="space-y-4">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.tiktok.com/@6bithiphop/live"
                className="w-full bg-background border border-border px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => setStreamUrl(urlInput)}
                className="w-full px-4 py-2.5 text-sm uppercase tracking-widest border border-border text-muted hover:border-accent hover:text-accent transition-all"
              >
                Update Stream URL
              </button>
              <p className="text-xs text-muted/50">Current: {streamUrl}</p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* QUEUE MANAGEMENT */}
        {/* ============================================================ */}

        <div className="border-t border-border pt-8">
          <div className="flex items-center gap-3 mb-6">
            <span className={`w-2 h-2 rounded-full ${queueState?.streamStatus === "online" ? "bg-accent animate-status-blink" : "bg-muted"}`} />
            <h2 className="text-[10px] uppercase tracking-[0.5em] text-muted">
              AI Stream — Queue Management
            </h2>
            <button
              onClick={fetchQueue}
              disabled={queueLoading}
              className="ml-auto text-xs text-muted hover:text-accent transition-colors uppercase tracking-wider"
            >
              {queueLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Queue Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="border border-border bg-surface p-4 text-center">
              <p className="text-2xl font-bold text-accent">{queueState?.queue.length ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted mt-1">In Queue</p>
            </div>
            <div className="border border-border bg-surface p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{queueState?.totalPlayed ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted mt-1">Total Played</p>
            </div>
            <div className="border border-border bg-surface p-4 text-center">
              <p className={`text-2xl font-bold ${queueState?.streamStatus === "online" ? "text-accent" : "text-muted"}`}>
                {queueState?.streamStatus === "online" ? "ON" : "OFF"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted mt-1">Stream Status</p>
            </div>
            <div className="border border-border bg-surface p-4 text-center">
              <p className="text-2xl font-bold text-foreground">
                {queueState?.nowPlaying ? "▶" : "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted mt-1">Now Playing</p>
            </div>
          </div>

          {/* Queue Controls */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <button
              onClick={() => queueApiCall("next")}
              className="px-4 py-3 text-xs uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all font-bold"
            >
              Skip / Next
            </button>
            <button
              onClick={() => {
                if (confirm("Reset queue? Free entries will be cleared. Paid entries will carry over.")) {
                  queueApiCall("reset");
                }
              }}
              className="px-4 py-3 text-xs uppercase tracking-widest border border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-background transition-all font-bold"
            >
              Reset Queue
            </button>
            <button
              onClick={() => queueApiCall("status", { status: "online" })}
              className="px-4 py-3 text-xs uppercase tracking-widest border border-accent text-accent hover:bg-accent hover:text-background transition-all font-bold"
            >
              Stream ON
            </button>
            <button
              onClick={() => queueApiCall("status", { status: "offline" })}
              className="px-4 py-3 text-xs uppercase tracking-widest border border-danger text-danger hover:bg-danger hover:text-background transition-all font-bold"
            >
              Stream OFF
            </button>
          </div>

          {/* Action Feedback */}
          {queueAction && (
            <div className="bg-surface border border-border px-4 py-2 mb-6 font-mono text-xs text-muted">
              &gt; {queueAction}
            </div>
          )}

          {/* Now Playing */}
          {queueState?.nowPlaying && (
            <div className="border border-accent/30 bg-accent/5 p-4 mb-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-accent mb-2">▶ Now Playing</p>
              <QueueEntryRow entry={queueState.nowPlaying} />
            </div>
          )}

          {/* Queue List */}
          <div className="border border-border bg-surface p-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted mb-3">
              Queue ({queueState?.queue.length ?? 0} entries)
            </p>
            {!queueState?.queue.length ? (
              <p className="text-xs text-muted/50 py-4 text-center">Queue is empty.</p>
            ) : (
              <div className="space-y-2">
                {queueState.queue.map((entry, i) => (
                  <div key={entry.id} className="flex items-center gap-3">
                    <span className="text-xs text-muted/50 font-mono w-6 text-right shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <QueueEntryRow entry={entry} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* System Log */}
        <div className="bg-surface border border-border p-6 font-mono">
          <p className="text-xs text-muted mb-4">
            &gt; BARCODE_NETWORK // ADMIN LOG
          </p>
          <div className="space-y-1 text-sm text-foreground/60">
            <p>&gt; Admin authenticated ........... OK</p>
            <p>&gt; Live status ................... {isLive ? "BROADCASTING" : "OFFLINE"}</p>
            <p>&gt; Stream target ................. {streamUrl}</p>
            <p>&gt; Queue entries ................. {queueState?.queue.length ?? "?"}</p>
            <p>&gt; Stream status ................. {queueState?.streamStatus ?? "unknown"}</p>
            <p>&gt; Phase ......................... 2</p>
            <p>&gt; Automation .................... ACTIVE</p>
            <p className="text-accent mt-3">
              &gt; SYSTEM READY<span className="cursor-blink">_</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Queue Entry Row
// ============================================================

function QueueEntryRow({ entry }: { entry: QueueEntry }) {
  const tier = normalizeTier(entry.tier);
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border font-bold shrink-0 ${TIER_COLORS[tier]}`}>
        {TIERS[tier]?.icon} {tier}
      </span>
      <span className="text-sm text-foreground truncate">
        {entry.artist} — {entry.title}
      </span>
      {entry.amount > 0 && (
        <span className="text-xs text-accent shrink-0">
          ${(entry.amount / 100).toFixed(2)}
        </span>
      )}
    </div>
  );
}

