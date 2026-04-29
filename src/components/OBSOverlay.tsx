"use client";

import { useEffect, useState, useCallback } from "react";
import type { QueueState, QueueEntry, QueueTier } from "@/lib/queue-types";
import { normalizeTier } from "@/lib/queue-types";

const LIVE_URL = "https://www.tiktok.com/@six.bit";

/* Google Drive /preview embed URLs */
const DRIVE_BG = "https://drive.google.com/file/d/1HahJcc_ChAjEwerezfHjerQq2wOKuaAo/preview";
const DRIVE_WAITING = "https://drive.google.com/file/d/1UP4P36vHeD5sWs-EhGOwgFlpntNoeI_L/preview";

/* ---- Schedule check (mirrors LiveStatusProvider logic) ---- */
function isWithinBroadcastWindow(): boolean {
  const now = new Date();
  const pstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = pstParts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(pstParts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(pstParts.find((p) => p.type === "minute")?.value || "0", 10);

  if (weekday !== "Fri") return false;
  const t = hour * 60 + minute;
  return t >= 18 * 60 + 40 && t < 23 * 60; // 6:40 PM – 11:00 PM PST
}

const TIER_CLASS: Record<QueueTier, string> = {
  free: "obs-tier-free",
  featured: "obs-tier-featured",
  fastlane: "obs-tier-fastlane",
  frontrow: "obs-tier-frontrow",
};

const TIER_LABEL: Record<QueueTier, string> = {
  free: "○ FREE",
  featured: "▸ FTD",
  fastlane: "▸▸ FAST",
  frontrow: "▸▸▸ FRONT",
};

function TierBadge({ tier: rawTier }: { tier: QueueTier }) {
  const tier = normalizeTier(rawTier);
  return (
    <span className={`obs-tier ${TIER_CLASS[tier]}`}>{TIER_LABEL[tier]}</span>
  );
}

function NowPlaying({ entry }: { entry: QueueEntry }) {
  return (
    <div className="obs-now-playing">
      <div className="obs-label">
        <span className="obs-dot" />
        Now Playing
      </div>
      <p className="obs-title">{entry.title}</p>
      <p className="obs-artist">
        {entry.artist} <TierBadge tier={entry.tier} />
      </p>
    </div>
  );
}

function QueueRow({ entry, position }: { entry: QueueEntry; position: number }) {
  return (
    <div className="obs-queue-entry" style={{ animationDelay: `${position * 50}ms` }}>
      <span className="obs-position">{String(position).padStart(2, "0")}</span>
      <div className="obs-info">
        <div className="obs-entry-title">{entry.title}</div>
        <div className="obs-entry-artist">{entry.artist}</div>
      </div>
      <TierBadge tier={entry.tier} />
    </div>
  );
}

export function OBSOverlay() {
  const [state, setState] = useState<QueueState | null>(null);
  const [isLive, setIsLive] = useState(false);

  /* Poll queue state every 5s */
  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch("/api/queue");
        if (res.ok) setState(await res.json());
      } catch { /* silent */ }
    }
    poll();
    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, []);

  /* Check broadcast schedule every 15s */
  const checkLive = useCallback(() => setIsLive(isWithinBroadcastWindow()), []);
  useEffect(() => {
    checkLive();
    const interval = setInterval(checkLive, 15_000);
    return () => clearInterval(interval);
  }, [checkLive]);

  if (!state) return null;

  /* ─── A-SHOW IS LIVE → full takeover redirect screen ─── */
  if (isLive) {
    return (
      <div className="obs-container">
        <div className="obs-live-redirect">
          <div className="obs-live-badge">
            <span className="obs-live-dot" />
            LIVE NOW
          </div>
          <h1 className="obs-live-title">6 BIT IS LIVE</h1>
          <p className="obs-live-subtitle">The real broadcast is on. AI stream suspended.</p>
          <div className="obs-live-url">{LIVE_URL}</div>
          <div className="obs-live-bar">
            <span className="obs-live-scan" />
          </div>
          <p className="obs-live-footer">BARCODE NETWORK // CHANNEL 01 // A-SHOW ACTIVE</p>
        </div>
      </div>
    );
  }

  /* ─── B-SHOW (AI stream) ─── */

  const hasActivity = state.nowPlaying || state.queue.length > 0;
  const visible = state.queue.slice(0, 8);

  return (
    <div className="obs-container">
      {/* BG.mp4 — fullscreen looping background (always on) */}
      <iframe
        className="obs-bg-video"
        src={DRIVE_BG}
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="Background"
      />

      {/* WaitingForSubmission.mp4 — shown when queue is idle */}
      {!hasActivity && (
        <iframe
          className="obs-waiting-video"
          src={DRIVE_WAITING}
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="Waiting for submissions"
        />
      )}

      {/* Queue HUD — positioned bottom-left over the video */}
      {hasActivity && (
        <div className="obs-hud">
          {state.nowPlaying && <NowPlaying entry={state.nowPlaying} />}

          {visible.length > 0 && (
            <div className="obs-queue-list">
              {visible.map((entry, i) => (
                <QueueRow key={entry.id} entry={entry} position={i + 1} />
              ))}
              {state.queue.length > 8 && (
                <div className="obs-status">
                  +{state.queue.length - 8} more in queue
                </div>
              )}
            </div>
          )}

          <div className="obs-status">
            BARCODE QUEUE — {state.totalPlayed} played
          </div>
        </div>
      )}
    </div>
  );
}
