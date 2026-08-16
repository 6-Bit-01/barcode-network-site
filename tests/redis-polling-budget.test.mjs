import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(path, "utf8");
}

test("Redis-backed browser surfaces share a bounded polling budget", () => {
  const budget = source("src/lib/redis-polling-budget.ts");
  assert.match(budget, /LIVE_OVERLAY_POLL_INTERVAL_MS = 2_000/);
  assert.match(budget, /FOREGROUND_OVERLAY_POLL_INTERVAL_MS = 5_000/);
  assert.match(budget, /PUBLIC_QUEUE_POLL_INTERVAL_MS = 15_000/);
  assert.match(budget, /ADMIN_QUEUE_POLL_INTERVAL_MS = 10_000/);
  assert.match(budget, /SITE_LIVE_STATUS_POLL_INTERVAL_MS = 15_000/);
  assert.match(budget, /REDIS_POLL_ERROR_RETRY_INTERVAL_MS = 30_000/);

  const liveOverlay = source("src/components/LiveOverlayReceiver.tsx");
  assert.match(liveOverlay, /LIVE_OVERLAY_POLL_INTERVAL_MS/);
  assert.match(liveOverlay, /REDIS_POLL_ERROR_RETRY_INTERVAL_MS/);
  assert.match(liveOverlay, /window\.setTimeout\(poll, nextPollDelayMs\)/);

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
});

test("quota failover is read-only and retains only a previously confirmed queue snapshot", () => {
  const queue = source("src/lib/queue.ts");
  assert.match(queue, /lastKnownGoodRedisStore/);
  assert.match(queue, /return normalizeStore\(lastKnownGoodRedisStore\)/);
  assert.match(queue, /throw error/);
  assert.doesNotMatch(queue, /writeStore\(lastKnownGoodRedisStore/);

  const overlay = source("src/lib/live-overlay.ts");
  assert.match(overlay, /memoryPlayerSync = normalizePlayerSync/);
  assert.match(overlay, /return normalizePlayerSync\(memoryPlayerSync\)/);
  assert.match(overlay, /memoryOverlayState = raw/);
  assert.match(overlay, /return normalizeState\(memoryOverlayState\)/);
});
