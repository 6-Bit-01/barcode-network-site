"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ForegroundOverlayStrip } from "@/components/ForegroundOverlayStrip";
import { foregroundActionWithExpiryAt } from "@/lib/foreground-overlay-resolver";
import type { ForegroundOverlayAction, ForegroundOverlaySnapshot } from "@/lib/foreground-overlay-resolver";

const POLL_INTERVAL_MS = 1_500;
const STALE_AFTER_MS = 10_000;

const SOURCE_STYLE = {
  "--fg-height": "100px",
  "--fg-primary-size": "36px",
  "--fg-secondary-size": "18px",
  "--fg-wheel-size": "92px",
  "--fg-wheel-count-size": "50px",
  "--fg-anchor-y": "1222px",
  "--fg-side-margin": "24px",
  "--fg-key-color": "#0000ff",
} as CSSProperties;

function foregroundAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access");
}

const SYNCING_ACTION: ForegroundOverlayAction = {
  id: "foreground-syncing",
  label: "SIGNAL LINK",
  message: "READING BARCODE RADIO STATE // HOLDING CHANNEL",
  tone: "neutral",
  source: "queue",
  occurredAt: null,
};

function isForegroundSnapshot(value: unknown): value is ForegroundOverlaySnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ForegroundOverlaySnapshot>;
  return candidate.schemaVersion === "foreground_overlay_v1"
    && typeof candidate.serverNow === "string"
    && typeof candidate.submissionsOpen === "boolean"
    && typeof candidate.wheelSpinsOwed === "number"
    && Boolean(candidate.action && typeof candidate.action.label === "string" && typeof candidate.action.message === "string");
}

function countdownLabel(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function identityCycleAnchorForClient(snapshot: ForegroundOverlaySnapshot | null, lastSuccessAtMs: number | null): string | null {
  if (!snapshot) return null;
  if (!snapshot.track || lastSuccessAtMs === null) return snapshot.serverNow;
  const serverNowMs = Date.parse(snapshot.serverNow);
  const serverCycleStartedAtMs = Date.parse(snapshot.track.cycleStartedAt);
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(serverCycleStartedAtMs)) return snapshot.track.cycleStartedAt;
  return new Date(lastSuccessAtMs + (serverCycleStartedAtMs - serverNowMs)).toISOString();
}

function actionAtClock(snapshot: ForegroundOverlaySnapshot | null, clockNowMs: number, lastSuccessAtMs: number | null, syncError: boolean): ForegroundOverlayAction {
  if (!snapshot) return syncError ? { ...SYNCING_ACTION, label: "SYNC RETRY", message: "WAITING FOR FOREGROUND STATE" } : SYNCING_ACTION;

  const stale = lastSuccessAtMs !== null && clockNowMs - lastSuccessAtMs > STALE_AFTER_MS;
  if (syncError && stale) {
    return {
      id: `foreground-stale:${snapshot.revision}`,
      label: "SYNC RETRY",
      message: "LAST CONFIRMED STATE HELD",
      tone: "neutral",
      source: "queue",
      occurredAt: snapshot.serverNow,
    };
  }

  const serverNowMs = Date.parse(snapshot.serverNow);
  const anchoredNowMs = Number.isFinite(serverNowMs) && lastSuccessAtMs !== null
    ? serverNowMs + Math.max(0, clockNowMs - lastSuccessAtMs)
    : clockNowMs;
  const actions = Array.isArray(snapshot.actions) && snapshot.actions.length > 0 ? snapshot.actions : [snapshot.action];
  const action = foregroundActionWithExpiryAt(actions, snapshot.actionCycleStartedAt ?? snapshot.serverNow, anchoredNowMs);
  if (action.source !== "sponsor" || !snapshot.sponsorEndsAt) return action;
  const sponsorEndsAtMs = Date.parse(snapshot.sponsorEndsAt);
  const remainingSeconds = Number.isFinite(sponsorEndsAtMs) ? (sponsorEndsAtMs - anchoredNowMs) / 1000 : 0;
  return {
    ...action,
    message: `A WORD FROM OUR SPONSOR // ${countdownLabel(remainingSeconds)} REMAINING`,
  };
}

export function ForegroundOverlayReceiver() {
  const [snapshot, setSnapshot] = useState<ForegroundOverlaySnapshot | null>(null);
  const [lastSuccessAtMs, setLastSuccessAtMs] = useState<number | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());

  useEffect(() => {
    let stopped = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const accessToken = foregroundAccessToken();
        const response = await fetch("/api/overlay/foreground", {
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        if (!response.ok) throw new Error("Foreground overlay state unavailable.");
        const next = await response.json() as unknown;
        if (!isForegroundSnapshot(next)) throw new Error("Foreground overlay state invalid.");
        if (stopped) return;
        const receivedAt = Date.now();
        setSnapshot(next);
        setLastSuccessAtMs(receivedAt);
        setClockNowMs(receivedAt);
        setSyncError(false);
      } catch {
        if (!stopped) setSyncError(true);
      } finally {
        inFlight = false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const refreshNow = () => { void load(); };
    const markOffline = () => setSyncError(true);

    void load();
    const intervalId = window.setInterval(() => { void load(); }, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshNow);
    window.addEventListener("online", refreshNow);
    window.addEventListener("offline", markOffline);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshNow);
      window.removeEventListener("online", refreshNow);
      window.removeEventListener("offline", markOffline);
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => setClockNowMs(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const action = actionAtClock(snapshot, clockNowMs, lastSuccessAtMs, syncError);
  const track = snapshot?.track ?? null;
  const identityCycleStartedAt = identityCycleAnchorForClient(snapshot, lastSuccessAtMs);
  const syncState = !snapshot ? syncError ? "retrying" : "syncing" : syncError && lastSuccessAtMs !== null && clockNowMs - lastSuccessAtMs > STALE_AFTER_MS ? "retrying" : "synchronized";

  return (
    <div className="foreground-overlay-source-shell" data-source-resolution="1080x1920" data-sync-state={syncState} style={SOURCE_STYLE}>
      <div className="foreground-overlay-canvas">
        <ForegroundOverlayStrip
          artistName={track?.artistName ?? "BARCODE RADIO"}
          trackTitle={track?.trackTitle ?? "NEXT TRANSMISSION STANDING BY"}
          identityCycleStartedAt={identityCycleStartedAt}
          wheelSpinsOwed={snapshot?.wheelSpinsOwed ?? 0}
          submissionsOpen={snapshot?.submissionsOpen ?? false}
          actionId={action.id}
          actionLabel={action.label}
          actionMessage={action.message}
          actionTone={action.tone}
        />
      </div>
    </div>
  );
}
