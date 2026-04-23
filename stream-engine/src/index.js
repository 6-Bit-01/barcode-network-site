// ============================================================
// BARCODE STREAM ENGINE — Main Entry
// ============================================================
// Orchestrates automated broadcasting by coordinating between
// OBS Studio and the BARCODE Network queue API.
//
// Flow:
//   1. Connect to OBS via WebSocket
//   2. Poll queue state at regular intervals
//   3. When a track is playing, start a timer for auto-advance
//   4. Switch OBS scenes based on queue state
//   5. Send heartbeat to website API
// ============================================================

import "dotenv/config";
import { OBSManager } from "./obs.js";
import { getQueueState, advanceTrack, sendHeartbeat } from "./api.js";

// ── Config ──────────────────────────────────────────────────
const SCENE_LIVE = process.env.SCENE_LIVE || "BARCODE Live";
const SCENE_WAITING = process.env.SCENE_WAITING || "Waiting Screen";
const SCENE_INTRO = process.env.SCENE_INTRO || "Intro Sequence";
const SCENE_OFFLINE = process.env.SCENE_OFFLINE || "Offline";

const DEFAULT_TRACK_DURATION = parseInt(process.env.DEFAULT_TRACK_DURATION || "180", 10) * 1000;
const ADVANCE_WARNING = parseInt(process.env.ADVANCE_WARNING || "10", 10) * 1000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "10", 10) * 1000;
const HEARTBEAT_INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || "30", 10) * 1000;
const AUTO_ADVANCE = process.env.AUTO_ADVANCE !== "false";

// ── State ───────────────────────────────────────────────────
const state = {
  currentTrackId: null,
  trackStartedAt: null,
  trackTimer: null,
  warningTimer: null,
  queueDepth: 0,
  isPlaying: false,
  engineStartedAt: Date.now(),
};

const obs = new OBSManager();

// ── Track Identification ────────────────────────────────────
function trackId(entry) {
  if (!entry) return null;
  return `${entry.artist}::${entry.title}::${entry.tier}`;
}

// ── Auto-Advance Timer ──────────────────────────────────────
function clearTimers() {
  if (state.trackTimer) {
    clearTimeout(state.trackTimer);
    state.trackTimer = null;
  }
  if (state.warningTimer) {
    clearTimeout(state.warningTimer);
    state.warningTimer = null;
  }
}

function startTrackTimer(duration = DEFAULT_TRACK_DURATION) {
  clearTimers();

  if (!AUTO_ADVANCE) {
    console.log("[engine] Auto-advance disabled — manual skip required");
    return;
  }

  const durationSec = Math.round(duration / 1000);
  console.log(`[engine] Track timer: ${durationSec}s`);

  // Warning before advance
  if (duration > ADVANCE_WARNING) {
    state.warningTimer = setTimeout(() => {
      console.log(`[engine] ⚠ Track ending in ${ADVANCE_WARNING / 1000}s…`);
    }, duration - ADVANCE_WARNING);
  }

  // Auto-advance
  state.trackTimer = setTimeout(async () => {
    console.log("[engine] ⏭ Auto-advancing to next track…");
    try {
      const result = await advanceTrack();
      if (result.nowPlaying) {
        console.log(`[engine] Now playing: ${result.nowPlaying.artist} — ${result.nowPlaying.title}`);
      } else {
        console.log("[engine] Queue empty after advance");
      }
      // The poll loop will pick up the new state
    } catch (err) {
      console.error("[engine] Auto-advance failed:", err.message);
    }
  }, duration);

  state.trackStartedAt = Date.now();
}

// ── Scene Logic ─────────────────────────────────────────────
async function updateScene(nowPlaying, queueDepth) {
  if (!obs.connected) return;

  const currentScene = await obs.getCurrentScene();

  if (nowPlaying) {
    // We have a track playing — show live scene
    if (currentScene !== SCENE_LIVE) {
      await obs.switchScene(SCENE_LIVE);
    }

    // Update text overlays if they exist
    await obs.setText("NowPlaying-Artist", nowPlaying.artist || "Unknown");
    await obs.setText("NowPlaying-Title", nowPlaying.title || "Untitled");
    await obs.setText("NowPlaying-Tier", (nowPlaying.tier || "free").toUpperCase());
    await obs.setText("QueueCount", `${queueDepth} in queue`);
  } else if (queueDepth > 0) {
    // Queue has entries but nothing is playing — shouldn't normally happen
    // Trigger an advance
    console.log("[engine] Queue has entries but nothing playing — advancing…");
    try {
      await advanceTrack();
    } catch (err) {
      console.error("[engine] Initial advance failed:", err.message);
    }
  } else {
    // Nothing playing, queue empty — show waiting screen
    if (currentScene !== SCENE_WAITING && currentScene !== SCENE_OFFLINE) {
      await obs.switchScene(SCENE_WAITING);
    }
  }
}

// ── Main Poll Loop ──────────────────────────────────────────
async function poll() {
  try {
    const { nowPlaying, queue } = await getQueueState();
    const newTrackId = trackId(nowPlaying);
    const queueDepth = queue?.length || 0;

    state.queueDepth = queueDepth;

    // Detect track change
    if (newTrackId !== state.currentTrackId) {
      if (newTrackId) {
        console.log(`\n[engine] 🔊 Track changed → ${nowPlaying.artist} — ${nowPlaying.title}`);
        state.isPlaying = true;
        startTrackTimer();
      } else {
        console.log("\n[engine] 📭 No track playing");
        state.isPlaying = false;
        clearTimers();
      }
      state.currentTrackId = newTrackId;
    }

    // Update OBS scene and overlays
    await updateScene(nowPlaying, queueDepth);
  } catch (err) {
    console.error("[poll] Error:", err.message);
  }
}

// ── Heartbeat ───────────────────────────────────────────────
async function heartbeat() {
  try {
    const currentScene = obs.connected ? await obs.getCurrentScene() : null;
    const isStreaming = obs.connected ? await obs.isStreaming() : false;

    await sendHeartbeat({
      scene: currentScene,
      obsConnected: obs.connected,
      streaming: isStreaming,
      currentTrack: state.currentTrackId,
      queueDepth: state.queueDepth,
      uptime: Math.round((Date.now() - state.engineStartedAt) / 1000),
    });
  } catch (err) {
    // Silently continue — heartbeat is non-critical
  }
}

// ── Startup ─────────────────────────────────────────────────
async function start() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   BARCODE Stream Automation Engine       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  OBS URL:        ${process.env.OBS_WS_URL || "ws://localhost:4455"}`);
  console.log(`  API URL:        ${process.env.BARCODE_API_URL || "https://barcode-network.com"}`);
  console.log(`  Track Duration: ${DEFAULT_TRACK_DURATION / 1000}s`);
  console.log(`  Auto-Advance:   ${AUTO_ADVANCE}`);
  console.log(`  Poll Interval:  ${POLL_INTERVAL / 1000}s`);
  console.log(`  Heartbeat:      ${HEARTBEAT_INTERVAL / 1000}s`);
  console.log();

  // Connect to OBS
  console.log("[engine] Connecting to OBS…");
  await obs.connect();

  if (obs.connected) {
    const scenes = await obs.getScenes();
    console.log(`[engine] Available scenes: ${scenes.join(", ")}`);
  }

  // Start poll loop
  console.log("[engine] Starting poll loop…");
  setInterval(poll, POLL_INTERVAL);
  poll(); // Initial poll

  // Start heartbeat
  setInterval(heartbeat, HEARTBEAT_INTERVAL);
  heartbeat();

  console.log("[engine] ✓ Engine running\n");
}

// ── Graceful Shutdown ───────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[engine] ${signal} received — shutting down…`);
  clearTimers();
  await obs.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Launch
start().catch((err) => {
  console.error("[engine] Fatal error:", err);
  process.exit(1);
});