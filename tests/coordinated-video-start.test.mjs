import assert from "node:assert/strict";
import test from "node:test";
import { CoordinatedVideoStart, VideoReceiverPreparation, VideoStartDeadline, VIDEO_READY_TIMEOUT_MS } from "../src/lib/coordinated-video-start.ts";
import { serverStampYouTubeSync, serverStampTikTokSync } from "../src/lib/live-overlay-resolver.ts";

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const token = "prepare-12345678-1234-1234-1234-123456789012";
const packet = (provider = "youtube") => ({ provider, videoId: "PWYFa2OCWj0", postId: "6718335390845095173", trackId: "C1", playbackState: "paused", currentTimeSeconds: 12, prepareToken: token, updatedAt: new Date().toISOString(), muted: true });
function harness(overrides = {}) {
  let now = 0, next = 0;
  const tasks = new Map(), calls = [];
  const schedule = (callback, delay) => { tasks.set(++next, { callback, due: now + delay }); return next; };
  const clear = (id) => tasks.delete(id);
  const tick = async (ms) => {
    const end = now + ms;
    for (;;) {
      await flush();
      const entry = [...tasks].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!entry) break;
      now = entry[1].due; tasks.delete(entry[0]); entry[1].callback();
    }
    now = end; await flush();
  };
  let ready = false;
  const gate = new CoordinatedVideoStart({
    hold: (seconds) => calls.push(["hold", seconds]), play: () => calls.push(["play", now]),
    drain: async () => {},
    write: async (state, seconds, prepareToken, delayMs) => {
      calls.push(["write", state, seconds, prepareToken, delayMs]);
      return { sync: { ...packet(), playbackState: state, startToken: delayMs ? "video-start-123" : undefined, scheduledStartAt: delayMs ? new Date(1_000_000 + now + delayMs).toISOString() : undefined }, delayMs: delayMs ?? 0 };
    },
    ready: async () => { calls.push(["ready", now]); return ready; },
    changed: (phase) => calls.push(["phase", phase]), token: () => token, now: () => now, schedule, clear,
    ...overrides,
  });
  return { gate, calls, tasks, schedule, clear, tick, setReady: () => { ready = true; }, now: () => now };
}

for (const provider of ["youtube", "tiktok"]) test(`${provider}: slow overlay holds host until provider readiness and the common deadline`, async () => {
  const h = harness();
  assert.equal(h.gate.onPlaying(12), true);
  assert.equal(h.gate.onPaused(), true, "programmatic hold must not cancel preparation");
  await h.tick(4_000);
  assert.equal(h.calls.some(([type]) => type === "play"), false);
  assert.equal(h.calls.filter(([type]) => type === "write").length, 1, "no playback heartbeats during preparation");
  h.setReady(); await h.tick(1_000);
  assert.equal(h.gate.phase, "scheduled");
  const receiver = new VideoStartDeadline({ schedule: h.schedule, clear: h.clear });
  const planned = { ...packet(provider), playbackState: "playing", scheduledStartAt: new Date(1_008_000).toISOString(), startToken: "video-start-123" };
  const plays = [];
  assert.equal(receiver.hold(planned, 1_005_000, () => plays.push(h.now())), true);
  receiver.hold(planned, 1_006_000, () => plays.push(-1));
  await h.tick(2_999);
  assert.equal(plays.length, 0); assert.equal(h.calls.some(([type]) => type === "play"), false);
  await h.tick(1);
  assert.deepEqual(plays, [8_000]);
  assert.deepEqual(h.calls.find(([type]) => type === "play"), ["play", 8_000]);
  assert.equal(h.gate.onPlaying(12), false);
  assert.equal(h.gate.blocksPublish, false);
  assert.equal(receiver.hold(planned, 1_008_000, () => plays.push(-1)), false);
  const reads = h.calls.filter(([type]) => type === "ready").length;
  await h.tick(20_000);
  assert.equal(h.calls.filter(([type]) => type === "ready").length, reads, "no readiness polling after release");
  assert.equal(h.gate.onPaused(), false);
  assert.equal(h.gate.onPlaying(42), true, "a deliberate resume coordinates again");
  h.gate.cancel(true);
});

test("receiver readiness requires real playing then pause, never just iframe/API ready", async () => {
  const prep = new VideoReceiverPreparation(), calls = [];
  const sync = packet();
  const apply = () => prep.apply(sync, (time) => calls.push(["warm", time]), async (id) => { calls.push(["ack", id]); return true; });
  apply(); apply(); prep.onState(5, () => assert.fail("cue is not playback")); apply();
  assert.deepEqual(calls, [["warm", 12]]);
  prep.onState(1, (time) => calls.push(["pause", time])); apply();
  assert.equal(calls.some(([type]) => type === "ack"), false);
  prep.onState(2, () => {}); apply(); await flush(); apply();
  assert.deepEqual(calls, [["warm", 12], ["pause", 12], ["ack", token]]);
  assert.equal(prep.apply({ ...sync, prepareToken: undefined }, () => assert.fail(), async () => false), false);
  assert.equal(prep.token, null);
});

for (const provider of ["youtube", "tiktok"]) {
  test(`${provider}: repeated playing stays held throughout preparation and stops holding after release`, async () => {
    const prep = new VideoReceiverPreparation(), holds = [], acknowledgements = [];
    const sync = packet(provider);
    const hold = (seconds) => holds.push(seconds);
    const apply = () => prep.apply(sync, () => {}, async (id) => { acknowledgements.push(id); return true; });
    apply();
    prep.onState(1, hold); // warming
    prep.onState(1, hold); // waiting for pause
    prep.onState(2, hold);
    prep.onState(1, hold); // held, before acknowledgement
    apply();
    assert.equal(acknowledgements.length, 0, "playing cannot count as confirmed pause");
    prep.onState(2, hold); apply(); await flush();
    prep.onState(1, hold); // already acknowledged ready
    apply();
    assert.deepEqual(holds, [12, 12, 12, 12]);
    assert.equal(acknowledgements.length, 1);
    prep.onState(2, hold); apply(); await flush();
    prep.onState(1, hold); prep.onState(2, hold); apply(); await flush();
    assert.equal(acknowledgements.length, 2, "the existing acknowledgement budget stays bounded");
    assert.equal(prep.apply({ ...sync, playbackState: "playing", scheduledStartAt: new Date().toISOString() }, () => assert.fail(), async () => false), false);
    prep.onState(1, () => assert.fail("released playback must not be held"));
  });

  test(`${provider}: a late acknowledgement cannot skip the repeated-play pause confirmation`, async () => {
    const prep = new VideoReceiverPreparation();
    let resolve, acknowledgements = 0;
    const apply = () => prep.apply(packet(provider), () => {}, () => {
      acknowledgements++;
      return new Promise((done) => { resolve = done; });
    });
    apply(); prep.onState(1, () => {}); prep.onState(2, () => {}); apply();
    prep.onState(1, () => {});
    resolve(true); await flush(); apply();
    assert.equal(acknowledgements, 1);
    prep.onState(2, () => {}); apply();
    assert.equal(acknowledgements, 2, "readiness must follow a fresh confirmed pause");
    prep.cancel(); resolve(true); await flush();
    prep.onState(1, () => assert.fail("cancelled preparation must not intercept playback"));
  });
}

test("Cancel during an outstanding start response serializes pause last and never releases", async () => {
  let resolve;
  const writes = [];
  const h = harness({ ready: async () => true, write: async (state) => {
    writes.push(state);
    if (state === "playing") return new Promise((done) => { resolve = done; });
    return { sync: packet(), delayMs: 0 };
  }});
  h.gate.onPlaying(0); await flush();
  assert.deepEqual(writes, ["paused", "playing"]);
  h.gate.cancel();
  resolve({ sync: { ...packet(), scheduledStartAt: new Date().toISOString(), startToken: "video-start-late" }, delayMs: 3_000 });
  await h.tick(10_000);
  assert.deepEqual(writes, ["paused", "playing", "paused"]);
  assert.equal(h.calls.some(([type]) => type === "play"), false);
});

test("replaced host invalidates a pending response and never writes over its successor", async () => {
  let resolve;
  const writes = [];
  const h = harness({ write: (state) => { writes.push(state); return new Promise((done) => { resolve = done; }); } });
  h.gate.onPlaying(0); await flush(); h.gate.cancel(true);
  resolve({ sync: packet(), delayMs: 0 }); await h.tick(20_000);
  assert.deepEqual(writes, ["paused"]);
  assert.equal(h.calls.some(([type]) => type === "play" || type === "ready"), false);
});

test("unavailable overlay times out with the host held and no unbounded reads", async () => {
  const h = harness(); h.gate.onPlaying(0); await h.tick(VIDEO_READY_TIMEOUT_MS + 1_000);
  assert.equal(h.gate.phase, "failed");
  assert.equal(h.calls.some(([type]) => type === "play"), false);
  assert.ok(h.calls.filter(([type]) => type === "ready").length <= 16);
  const count = h.calls.length; await h.tick(60_000); assert.equal(h.calls.length, count);
});

test("late acknowledgements fail paused; paused/replaced receiver cancels scheduled play", async () => {
  const h = harness({ ready: async () => true, write: async () => ({ sync: { ...packet(), startToken: "video-start-late", scheduledStartAt: new Date().toISOString() }, delayMs: 0 }) });
  h.gate.onPlaying(0); await flush(); assert.equal(h.gate.phase, "failed");
  const deadline = new VideoStartDeadline({ schedule: h.schedule, clear: h.clear });
  const sync = { ...packet(), playbackState: "playing", startToken: "video-start-123", scheduledStartAt: new Date(10_000).toISOString() };
  deadline.hold(sync, 7_000, () => assert.fail("cancelled receiver started"));
  deadline.hold({ ...sync, playbackState: "paused" }, 8_000, () => assert.fail());
  await h.tick(10_000);
});

test("storage normalization retains the preparation identity and immutable server deadline for both providers", () => {
  for (const [provider, stamp] of [["youtube", serverStampYouTubeSync], ["tiktok", serverStampTikTokSync]]) {
    const now = new Date("2026-09-16T12:00:00Z");
    const paused = stamp(packet(provider), now); assert.equal(paused.prepareToken, token);
    const normalized = stamp({ ...paused, playbackState: "playing" }, now);
    const scheduled = stamp(normalized, now, 3000);
    assert.equal(scheduled.prepareToken, token);
    assert.equal(scheduled.scheduledStartAt, "2026-09-16T12:00:03.000Z");
    assert.deepEqual(stamp(scheduled, now), scheduled);
    assert.equal(stamp({ ...paused, prepareToken: "invalid" }, now).prepareToken, undefined);
  }
});
