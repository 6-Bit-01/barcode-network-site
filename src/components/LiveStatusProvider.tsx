"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { QueueBroadcastPhase, QueuePublicSnapshot } from "@/lib/queue-types";
import { derivePublicShowState } from "@/lib/live-status-public";

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
  const pathname = usePathname();
  const isolatedPrototype = pathname === "/world/playtest";
  const [isLive, setIsLive] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [streamUrl, setStreamUrlState] = useState("https://www.tiktok.com/@six.bit/live");
  const [manualOverride, setManualOverride] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [queueProductionEnabled, setQueueProductionEnabled] = useState(false);
  const [queueSnapshot, setQueueSnapshot] = useState<QueuePublicSnapshot | null>(null);

  const fetchStatus = useCallback(async () => {
    if (isolatedPrototype) return;
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
        setQueueProductionEnabled(queueProduction);
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
        setQueueProductionEnabled(false);
        setQueueSnapshot(null);
        adminError = "Failed to fetch live status";
      }
    } catch {
      setQueueProductionEnabled(false);
      setQueueSnapshot(null);
      adminError = "Failed to fetch live status";
    }

    setLastError(adminError ?? queueError);
  }, [isolatedPrototype]);

  useEffect(() => {
    if (isolatedPrototype) return;
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/admin/verify");
        setIsAdmin(res.ok);
      } catch {
        setIsAdmin(false);
      }
    };
    checkAuth();
  }, [isolatedPrototype]);

  useEffect(() => {
    if (isolatedPrototype) return;
    const initialFetchTimer = setTimeout(fetchStatus, 0);
    const interval = setInterval(fetchStatus, 15_000);
    return () => {
      clearTimeout(initialFetchTimer);
      clearInterval(interval);
    };
  }, [fetchStatus, isolatedPrototype]);

  const toggleLive = useCallback(async () => {
    if (isolatedPrototype) return;
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
  }, [fetchStatus, isolatedPrototype]);

  const setStreamUrl = useCallback(async (url: string) => {
    if (isolatedPrototype) return;
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
  }, [fetchStatus, isolatedPrototype]);

  const {
    hasActiveQueueSession,
    queueSessionId,
    queueHref,
    queueSubmissionsOpen,
    queueBroadcastPhase,
    siteShowMode,
  } = derivePublicShowState({
    queueProductionEnabled,
    isLive,
    queueSnapshot,
  });

  return (
    <LiveStatusContext.Provider value={{
      isLive: isolatedPrototype ? false : isLive,
      toggleLive,
      streamUrl: isolatedPrototype ? "" : streamUrl,
      setStreamUrl,
      isScheduled: isolatedPrototype ? false : isScheduled,
      isAdmin: isolatedPrototype ? false : isAdmin,
      manualOverride: isolatedPrototype ? false : manualOverride,
      lastError: isolatedPrototype ? null : lastError,
      persisted: isolatedPrototype ? null : persisted,
      hasActiveQueueSession:
        isolatedPrototype ? false : hasActiveQueueSession,
      queueSessionId: isolatedPrototype ? null : queueSessionId,
      queueHref: isolatedPrototype ? null : queueHref,
      queueSubmissionsOpen:
        isolatedPrototype ? false : queueSubmissionsOpen,
      queueBroadcastPhase:
        isolatedPrototype ? null : queueBroadcastPhase,
      siteShowMode: isolatedPrototype ? "offline" : siteShowMode,
    }}>
      {children}
    </LiveStatusContext.Provider>
  );
}
