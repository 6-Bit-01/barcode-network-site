"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import type { QueueBroadcastPhase, QueuePublicSnapshot } from "@/lib/queue-types";

type SiteShowMode = "offline" | "intake_open" | "broadcast_live";

interface LiveStatusContextType {
  isLive: boolean;
  toggleLive: () => void;
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  isScheduled: boolean;
  isAdmin: boolean;
  manualOverride: boolean;
  lastError: string | null;
  persisted: boolean | null;
  hasActiveQueueSession: boolean;
  queueSessionId: string | null;
  queueHref: string | null;
  queueSubmissionsOpen: boolean;
  queueBroadcastPhase: QueueBroadcastPhase | null;
  siteShowMode: SiteShowMode;
}

const LiveStatusContext = createContext<LiveStatusContextType>({
  isLive: false,
  toggleLive: () => {},
  streamUrl: "https://www.tiktok.com/@six.bit/live",
  setStreamUrl: () => {},
  isScheduled: false,
  isAdmin: false,
  manualOverride: false,
  lastError: null,
  persisted: null,
  hasActiveQueueSession: false,
  queueSessionId: null,
  queueHref: null,
  queueSubmissionsOpen: false,
  queueBroadcastPhase: null,
  siteShowMode: "offline",
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [queueSnapshot, setQueueSnapshot] = useState<QueuePublicSnapshot | null>(null);

  const fetchStatus = useCallback(async () => {
    let adminError: string | null = null;
    let queueError: string | null = null;

    try {
      const res = await fetch("/api/admin/live", { cache: "no-store", credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setIsLive(data.isLive);
        setIsScheduled(data.isScheduled);
        setStreamUrlState(data.streamUrl);
        setManualOverride(data.manualOverride);
        const queueProduction = data?.capabilities?.queueProduction === true;
        if (!queueProduction) {
          setQueueSnapshot(null);
        } else {
          try {
            const queueRes = await fetch("/api/queue", { cache: "no-store" });
            if (queueRes.ok) {
              const queueData = (await queueRes.json()) as QueuePublicSnapshot;
              setQueueSnapshot(queueData);
            } else {
              queueError = "Failed to fetch queue status";
            }
          } catch {
            queueError = "Failed to fetch queue status";
          }
        }
      } else {
        adminError = "Failed to fetch live status";
      }
    } catch {
      adminError = "Failed to fetch live status";
    }


    setLastError(adminError ?? queueError);
  }, []);

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
    const initialFetchTimer = setTimeout(fetchStatus, 0);
    const interval = setInterval(fetchStatus, 15_000);
    return () => {
      clearTimeout(initialFetchTimer);
      clearInterval(interval);
    };
  }, [fetchStatus]);

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
      await fetchStatus();
    } catch {
      setLastError("Toggle failed");
    }
  }, [fetchStatus]);

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

  const queueSession = queueSnapshot?.session;
  const hasActiveQueueSession = Boolean(queueSession && queueSession.status !== "archived" && queueSession.broadcastPhase !== "ended");
  const queueSessionId = hasActiveQueueSession ? queueSession?.sessionId ?? null : null;
  const queueHref = queueSessionId ? `/queue/${queueSessionId}` : null;
  const queueSubmissionsOpen = Boolean(hasActiveQueueSession && queueSnapshot?.status?.isOpen);
  const queueBroadcastPhase = hasActiveQueueSession ? queueSession?.broadcastPhase ?? null : null;

  let siteShowMode: SiteShowMode = "offline";
  if (queueSubmissionsOpen) siteShowMode = "intake_open";
  if (queueBroadcastPhase === "broadcast_active" || isLive) siteShowMode = "broadcast_live";

  return (
    <LiveStatusContext.Provider value={{
      isLive,
      toggleLive,
      streamUrl,
      setStreamUrl,
      isScheduled,
      isAdmin,
      manualOverride,
      lastError,
      persisted,
      hasActiveQueueSession,
      queueSessionId,
      queueHref,
      queueSubmissionsOpen,
      queueBroadcastPhase,
      siteShowMode,
    }}>
      {children}
    </LiveStatusContext.Provider>
  );
}
