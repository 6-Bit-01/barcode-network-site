"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface LiveStatusContextType {
  isLive: boolean;
  toggleLive: () => void;
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  isScheduled: boolean;
  isAdmin: boolean;
  manualOverride: boolean;
}

const LiveStatusContext = createContext<LiveStatusContextType>({
  isLive: false,
  toggleLive: () => {},
  streamUrl: "https://www.tiktok.com/@six.bit/live",
  setStreamUrl: () => {},
  isScheduled: false,
  isAdmin: false,
  manualOverride: false,
});

export function useLiveStatus() {
  return useContext(LiveStatusContext);
}

export function LiveStatusProvider({ children }: { children: ReactNode }) {
  const [isLive, setIsLive] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [streamUrl, setStreamUrlState] = useState("https://www.tiktok.com/@six.bit/live");
  const [manualOverride, setManualOverride] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Poll the server for live status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live");
      if (res.ok) {
        const data = await res.json();
        setIsLive(data.isLive);
        setIsScheduled(data.isScheduled);
        setStreamUrlState(data.streamUrl);
        setManualOverride(data.manualOverride);
      }
    } catch {
      // Silent fail — keep current state
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
      await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle" }),
      });
      fetchStatus(); // Refresh immediately
    } catch {
      // Silent fail
    }
  }, [fetchStatus]);

  // Admin stream URL update — persists to Redis via API
  const setStreamUrl = useCallback(async (url: string) => {
    try {
      await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamUrl: url }),
      });
      setStreamUrlState(url);
      fetchStatus();
    } catch {
      // Silent fail
    }
  }, [fetchStatus]);

  return (
    <LiveStatusContext.Provider value={{
      isLive,
      toggleLive,
      streamUrl,
      setStreamUrl,
      isScheduled,
      isAdmin,
      manualOverride,
    }}>
      {children}
    </LiveStatusContext.Provider>
  );
}