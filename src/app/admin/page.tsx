"use client";

import { useLiveStatus } from "@/components/LiveStatusProvider";
import { useState, useEffect } from "react";

export default function AdminPage() {
  const { isLive, toggleLive, streamUrl, setStreamUrl, isScheduled, manualOverride, lastError, persisted } = useLiveStatus();
  const [urlInput, setUrlInput] = useState(streamUrl);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [passInput, setPassInput] = useState("");
  const [authError, setAuthError] = useState("");

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
        lastError={lastError}
        persisted={persisted}
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
  lastError, persisted,
}: {
  isLive: boolean;
  toggleLive: () => void;
  streamUrl: string;
  setStreamUrl: (v: string) => void;
  isScheduled: boolean;
  manualOverride: boolean;
  urlInput: string;
  setUrlInput: (v: string) => void;
  lastError: string | null;
  persisted: boolean | null;
}) {
  return (
    <section>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 space-y-8">

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
                <p>// Schedule: Every Friday 6:40 PM – 11:00 PM PT (auto)</p>
                <p>// Scheduled: {isScheduled ? "YES — within broadcast window" : "NO — outside broadcast window"}</p>
                <p>// Override: {manualOverride ? "ACTIVE (admin override)" : "NONE (auto-schedule)"}</p>
                <p>// Toggle cycles: Auto → On → Off → Auto</p>
                <p>// Persistence: {persisted === null ? "UNKNOWN" : persisted ? "REDIS (shared)" : "IN-MEMORY (local only)"}</p>
              </div>
              {lastError && (
                <p className="text-xs text-danger border border-danger/30 bg-danger/10 px-3 py-2">
                  {lastError}
                </p>
              )}
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

        {/* System Log */}
        <div className="bg-surface border border-border p-6 font-mono">
          <p className="text-xs text-muted mb-4">
            &gt; BARCODE_NETWORK // ADMIN LOG
          </p>
          <div className="space-y-1 text-sm text-foreground/60">
            <p>&gt; Admin authenticated ........... OK</p>
            <p>&gt; Live status ................... {isLive ? "BROADCASTING" : "OFFLINE"}</p>
            <p>&gt; Stream target ................. {streamUrl}</p>
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

