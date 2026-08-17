import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(path, "utf8");
}

test("Redis-backed browser surfaces share a bounded polling budget", () => {
  const budget = source("src/lib/redis-polling-budget.ts");
  assert.match(budget, /LIVE_OVERLAY_POLL_INTERVAL_MS = 650/);
  assert.match(budget, /FOREGROUND_OVERLAY_POLL_INTERVAL_MS = 1_500/);
  assert.match(budget, /PUBLIC_QUEUE_POLL_INTERVAL_MS = 10_000/);
  assert.match(budget, /ADMIN_QUEUE_POLL_INTERVAL_MS = 10_000/);
  assert.match(budget, /SITE_LIVE_STATUS_POLL_INTERVAL_MS = 15_000/);

  const liveOverlay = source("src/components/LiveOverlayReceiver.tsx");
  assert.match(liveOverlay, /LIVE_OVERLAY_POLL_INTERVAL_MS/);
  assert.doesNotMatch(liveOverlay, /REDIS_POLL_ERROR_RETRY_INTERVAL_MS/);
  assert.match(liveOverlay, /window\.setTimeout\(poll, OVERLAY_POLL_DELAY_MS\)/);

  for (const path of [
    "src/components/PublicQueueGateway.tsx",
    "src/components/PublicQueueSession.tsx",
    "src/components/RadioQueueForm.tsx",
    "src/components/useQueue.ts",
  ]) {
    assert.match(source(path), /PUBLIC_QUEUE_POLL_INTERVAL_MS/, path);
  }

  for (const path of [
    "src/components/AdminLiveOverlayControl.tsx",
    "src/components/AdminRadioQueueControl.tsx",
    "src/components/OBSOverlay.tsx",
  ]) {
    assert.match(source(path), /ADMIN_QUEUE_POLL_INTERVAL_MS/, path);
  }

  assert.match(source("src/components/ForegroundOverlayReceiver.tsx"), /FOREGROUND_OVERLAY_POLL_INTERVAL_MS/);
  assert.match(source("src/components/LiveStatusProvider.tsx"), /SITE_LIVE_STATUS_POLL_INTERVAL_MS/);

  const fourHourShowMs = 4 * 60 * 60 * 1_000;
  const liveOverlaySharedReads = Math.ceil(fourHourShowMs / 650) * 2;
  const foregroundOverlaySharedReads = Math.ceil(fourHourShowMs / 1_500) * 2;
  const playerSyncSharedWrites = Math.ceil(fourHourShowMs / 1_000);
  const showCriticalSharedRedisCommands = liveOverlaySharedReads + foregroundOverlaySharedReads + playerSyncSharedWrites;
  assert.equal(showCriticalSharedRedisCommands, 77_908);
  assert.ok(showCriticalSharedRedisCommands <= 80_000, "four hours of both transient receivers plus 1 Hz player sync stays inside the bounded show allowance");
});

test("quota failover is read-only and retains only a previously confirmed queue snapshot", () => {
  const queue = source("src/lib/queue.ts");
  assert.match(queue, /lastKnownGoodRedisStore/);
  assert.match(queue, /fallback = normalizeStore\(lastKnownGoodRedisStore\)/);
  assert.match(queue, /if \(fallback\) return fallback/);
  assert.match(queue, /throw redisError/);
  assert.doesNotMatch(queue, /writeStore\(lastKnownGoodRedisStore/);

  const overlay = source("src/lib/live-overlay.ts");
  assert.match(overlay, /memoryPlayerSync = normalizePlayerSync/);
  assert.match(overlay, /return normalizePlayerSync\(memoryPlayerSync\)/);
  assert.match(overlay, /memoryOverlayState = raw/);
  assert.match(overlay, /return normalizeState\(memoryOverlayState\)/);
});
