"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface LiveStatusContextType {
  isLive: boolean;
  toggleLive: () => void;
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  isScheduled: boolean;
  sponsorsActive: boolean;
  setSponsorsActiveSignal: (active: boolean) => void;
  toggleSponsorsActive: () => void;
  isAdmin: boolean;
  manualOverride: boolean;
  lastError: string | null;
  persisted: boolean | null;
}

const LiveStatusContext = createContext<LiveStatusContextType>({
  isLive: false,
  toggleLive: () => {},
  streamUrl: "https://www.tiktok.com/@six.bit/live",
  setStreamUrl: () => {},
  isScheduled: false,
  sponsorsActive: false,
  setSponsorsActiveSignal: () => {},
  toggleSponsorsActive: () => {},
  isAdmin: false,
  manualOverride: false,
  lastError: null,
  persisted: null,
});

export function useLiveStatus() {
  return useContext(LiveStatusContext);
}

export function LiveStatusProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [streamUrl, setStreamUrlState] = useState("https://www.tiktok.com/@six.bit/live");
  const [sponsorsActive, setSponsorsActive] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  // Poll the server for live status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setIsLive(Boolean(data.isLive));
        setIsScheduled(Boolean(data.isScheduled));
        setStreamUrlState(data.streamUrl);
        setSponsorsActive(Boolean(data.sponsorsActive));
        setManualOverride(Boolean(data.manualOverride));
        if (typeof data?.persisted === "boolean") setPersisted(data.persisted);
        setLastError(null);
      }
    } catch {
      setLastError("Failed to fetch live status");
    }
  }, []);

  // Check admin auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/admin/verify");
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000); // Poll every 15s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Admin toggle — persists to Redis via API
  const toggleLive = useCallback(async () => {
    try {
      const toggleRes = await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
        credentials: "include",
      });
      const toggleBody = await toggleRes.json().catch(() => ({}));
      if (!toggleRes.ok) {
        setLastError(toggleBody?.error ? `Toggle failed: ${toggleBody.error}` : `Toggle failed (${toggleRes.status})`);
        return;
      }
      if (typeof toggleBody?.persisted === "boolean") setPersisted(toggleBody.persisted);
      const res = await fetch("/api/admin/live", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setLastError(`Toggle failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setIsLive(Boolean(data.isLive));
      setIsScheduled(Boolean(data.isScheduled));
      setStreamUrlState(data.streamUrl);
      setSponsorsActive(Boolean(data.sponsorsActive));
      if (typeof data?.persisted === "boolean") setPersisted(data.persisted);
      setManualOverride(Boolean(data.manualOverride));
      setLastError(null);
    } catch {
      setLastError("Toggle failed");
    }
  }, []);

  // Admin stream URL update — persists to Redis via API
  const setStreamUrl = useCallback(async (url: string) => {
    try {
      const res = await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamUrl: url }),
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLastError(body?.error ? `Stream URL update failed: ${body.error}` : "Stream URL update failed");
        return;
      }
      if (typeof body?.persisted === "boolean") setPersisted(body.persisted);
      setStreamUrlState(url);
      fetchStatus();
      setLastError(null);
    } catch {
      setLastError("Stream URL update failed");
    }
  }, [fetchStatus]);

  // Admin sponsor signal update — persists to Redis via API
  const setSponsorsActiveSignal = useCallback(async (active: boolean) => {
    setSponsorsActive(active);
    try {
      const res = await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setSponsorsActive", sponsorsActive: active }),
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSponsorsActive(!active);
        setLastError(body?.error ? `Sponsor signal update failed: ${body.error}` : `Sponsor signal update failed (${res.status})`);
        return;
      }
      if (typeof body?.persisted === "boolean") setPersisted(body.persisted);
      setSponsorsActive(Boolean(body?.sponsorsActive));
      fetchStatus();
      setLastError(null);
    } catch {
      setSponsorsActive(!active);
      setLastError("Sponsor signal update failed");
    }
  }, [fetchStatus]);

  const toggleSponsorsActive = useCallback(() => {
    setSponsorsActiveSignal(!sponsorsActive);
  }, [setSponsorsActiveSignal, sponsorsActive]);

  return (
    <LiveStatusContext.Provider value={{
      isLive,
      toggleLive,
      streamUrl,
      setStreamUrl,
      isScheduled,
      sponsorsActive,
      setSponsorsActiveSignal,
      toggleSponsorsActive,
      isAdmin,
      manualOverride,
      lastError,
      persisted,
    }}>
      {children}
    </LiveStatusContext.Provider>
  );
}
