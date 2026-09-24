import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Real queue/routes/ceremony, isolated in memory. Never use live services.
for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "QUEUE_REDIS_REST_URL", "QUEUE_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL"]) delete process.env[key];
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
const root = path.resolve(import.meta.dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  return resolve.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, parent, ...args);
};
Module._extensions[".ts"] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const overlay = require("../src/lib/live-overlay.ts");
const route = require("../src/app/api/queue/route.ts");
const types = require("../src/lib/queue-types.ts");
const token = "c".repeat(64);
const ownerHash = createHash("sha256").update(token).digest("hex");
const cookie = `barcode_queue_owner=${token}`;
let seq = 0;
const legal = { acceptedLegal: true, termsVersion: types.PUBLIC_QUEUE_LEGAL_TERMS_VERSION, privacyVersion: types.PUBLIC_QUEUE_LEGAL_PRIVACY_VERSION, queueTermsVersion: types.PUBLIC_QUEUE_LEGAL_QUEUE_TERMS_VERSION, acceptedCheckboxText: types.PUBLIC_QUEUE_LEGAL_CHECKBOX_TEXT };
async function fresh(extra = {}) {
  const state = await queue.getRadioQueueState();
  if (state.session.status !== "archived") await queue.archiveCurrentQueueSession();
  const next = await queue.startNewQueueSession({ purpose: "live_broadcast", submissionCooldownSeconds: 0, ...extra });
  await queue.setQueueOpen(true);
  await overlay.resetWheelCeremonyStateForNewSession();
  return next.session.sessionId;
}
async function add(extra = {}) {
  seq++;
  return queue.addToQueue({ artist: `Artist ${seq}`, submittedArtistName: `Artist ${seq}`, title: `Original ${seq}`, tiktokHandle: `@artist${seq}`, link: `https://example.test/song-${seq}`, sourceType: "other", lane: "regular", tier: "free", amount: 0, createdAt: new Date().toISOString(), submissionOwnerHash: ownerHash, ...extra });
}
function request(body, browser = cookie, origin = "https://example.test") {
  return new Request("https://example.test/api/queue", { method: "POST", headers: { "content-type": "application/json", cookie: browser, ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
}
function replaceBody(sessionId, track, extra = {}) {
  return { action: "replace", sessionId, trackId: track.id, expectedRevision: track.replacementRevision ?? 0, title: `Replacement ${++seq}`, mode: "link", link: `https://example.test/replacement-${seq}`, ...legal, ...extra };
}
async function stored(trackId, sessionId) {
  const state = await queue.getRadioQueueState(sessionId);
  return [...state.queue, state.nextInLine, state.loadedTrack, ...state.history, ...state.removed].filter(Boolean).find(track => track.id === trackId);
}
async function replace(sessionId, track, extra = {}) {
  const response = await route.POST(request(replaceBody(sessionId, track, extra)));
  return { response, body: await response.json() };
}
async function editable(sessionId, track) {
  const snapshot = await queue.getPublicQueueSnapshot(sessionId, { ownerHash });
  return snapshot.ownedTracks.find(row => row.id === track.id)?.canReplace;
}
async function spin() {
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  await overlay.setLiveOverlayState({ action: "launchWheel" });
  const { overlayState } = await overlay.setLiveOverlayState({ action: "spinWheel" });
  return new Date(Date.parse(overlayState.wheelCeremonySpinStartedAt) + overlayState.wheelCeremonySpinDurationMs + 50);
}
async function at(now, run) {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new RealDate(now).getTime(); }
  };
  try { return await run(); } finally { global.Date = RealDate; }
}

test("intake issues a strong private cookie; a typed identity or old browser label cannot authorize edits", async () => {
  const sessionId = await fresh();
  const response = await route.POST(request({ sessionId, mode: "link", artist: "Original artist", title: "Original title", tiktokHandle: "@original", submitterToken: "legacy-public-label", link: "https://example.test/new-intake", submissionOwnerHash: "forged", ...legal }, ""));
  assert.equal(response.status, 201);
  const result = await response.json();
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /barcode_queue_owner=[a-f0-9]{64}/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=lax/i);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  const track = await stored(result.track.id);
  assert.notEqual(track.submissionOwnerHash, "forged");
  for (const browser of ["", cookie, "barcode-radio-submitter-token=legacy-public-label"]) {
    const denied = await route.POST(request(replaceBody(sessionId, track, { artist: "Original artist", tiktokHandle: "@original", submitterToken: "legacy-public-label", ownerHash: track.submissionOwnerHash }), browser));
    assert.equal(denied.status, 409);
  }
  const accepted = await route.POST(request(replaceBody(sessionId, track), setCookie.split(";")[0]));
  assert.equal(accepted.status, 200);
  const legacy = await add({ submissionOwnerHash: null });
  assert.equal((await replace(sessionId, legacy)).response.status, 409);
});

test("GET returns ownership only for the strong cookie, never the proof or private metadata", async () => {
  const sessionId = await fresh();
  const own = await add({ supersededUploads: [{ fileUrl: "https://private.example/old.mp3" }] });
  await add({ submissionOwnerHash: "d".repeat(64) });
  for (const browser of ["", cookie]) {
    const response = await route.GET(new Request(`https://example.test/api/queue?sessionId=${sessionId}`, { headers: { cookie: browser } }));
    const body = await response.json();
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    assert.doesNotMatch(JSON.stringify(body), /submissionOwnerHash|supersededUploads|replacementLockedAt|replacementWheelHold|private.example/);
    assert.deepEqual(body.ownedTracks?.map(track => track.id) ?? [], browser ? [own.id] : []);
  }
  assert.equal((await queue.getPublicQueueSnapshot(sessionId)).ownedTracks, undefined);
});

test("replacement preserves the slot, order, identity, corrections, purchases and original timestamps", async () => {
  const sessionId = await fresh();
  await add();
  const track = await add({ artistCredit: { primary: "Corrected artist", collaborators: [], original: "Original", decision: "whole", source: "admin" }, contactEmail: "private@example.test", submitterToken: "private-token", discordConnectionId: `${"a".repeat(64)}.${"b".repeat(64)}`, priorityUpgradeStatus: "checkout_pending", priorityUpgradeCheckoutSessionId: "cs_pending", priorityUpgradeCheckoutOwnerTokenHash: "private-checkout", signalHoldStatus: "active", signalHoldPaymentId: "pi_hold", note: "Private note" });
  await add();
  const before = await stored(track.id);
  const state = await queue.getRadioQueueState();
  const result = await replace(sessionId, track, { artist: "Forged artist", tiktokHandle: "@forged", contactEmail: "forged@example.test", submitterToken: "forged", discordConnectionId: "forged", lane: "wheel", priorityUpgradeStatus: "paid" });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  const after = await stored(track.id);
  for (const field of ["id", "createdAt", "lane", "artist", "submittedArtistName", "artistCredit", "tiktokHandle", "contactEmail", "submitterToken", "discordConnectionId", "priorityUpgradeStatus", "priorityUpgradeCheckoutSessionId", "priorityUpgradeCheckoutOwnerTokenHash", "signalHoldStatus", "signalHoldPaymentId", "note"]) assert.deepEqual(after[field], before[field], field);
  assert.equal(after.replacementRevision, 1);
  assert.notEqual(after.title, before.title);
  assert.deepEqual((await queue.getRadioQueueState()).queue.map(row => row.id), state.queue.map(row => row.id));
  assert.equal((await queue.getPublicQueueSnapshot()).status.acceptedCount, 3);
});

test("closed/full intake and the three-song artist limit block adds, not an eligible slot replacement", async () => {
  const sessionId = await fresh({ queueCapacity: 3 });
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(await add({ artist: "Same artist", tiktokHandle: "@same", submitterToken: "same" }));
  await queue.setQueueOpen(false);
  const result = await replace(sessionId, rows[1]);
  assert.equal(result.response.status, 200);
  assert.equal((await queue.getPublicQueueSnapshot()).status.acceptedCount, 3);
  const denied = await route.POST(request({ sessionId, mode: "link", artist: "Same artist", title: "Fourth", tiktokHandle: "@same", link: "https://example.test/fourth", ...legal }));
  assert.equal(denied.status, 409);
});

test("Next in Line and Now Playing lock immediately and stay locked after return or Priority displacement", async () => {
  for (const action of ["moveBack", "load", "priority_displacement"]) {
    const sessionId = await fresh();
    const track = await add();
    await queue.updateRadioTrack("", "pullFreeTransmission");
    assert.equal(await editable(sessionId, track), false);
    assert.equal((await replace(sessionId, track)).response.status, 409);
    if (action === "priority_displacement") {
      const priority = await add();
      await queue.updateRadioTrack(priority.id, "priority");
    } else {
      await queue.updateRadioTrack(track.id, action);
      if (action === "load") await queue.updateRadioTrack(track.id, "moveBack");
    }
    assert.equal(await editable(sessionId, track), false, action);
    assert.equal((await replace(sessionId, track)).response.status, 409, action);
  }
});

test("a confirmed Wheel song is locked while waiting and after demotion or Signal Hold", async () => {
  const sessionId = await fresh();
  const blocker = await add();
  await queue.updateRadioTrack(blocker.id, "priority");
  const track = await add({ signalHoldStatus: "active" });
  await queue.updateRadioTrack(track.id, "wheel");
  assert.equal((await stored(track.id)).lane, "wheel");
  assert.equal((await replace(sessionId, track)).response.status, 409);
  await queue.updateRadioTrack(track.id, "regular");
  assert.equal((await replace(sessionId, track)).response.status, 409);
  await queue.updateRadioTrack(track.id, "useSignalHold");
  assert.equal((await replace(sessionId, track)).response.status, 409);
});

test("Wheel ready/re-encryption permits edits; spin freezes candidates through confirmation and unlocks only unchosen tracks", async () => {
  const sessionId = await fresh();
  const a = await add({ artist: "One entrant", submittedArtistName: "One entrant", tiktokHandle: "@one" });
  const b = await add({ artist: "One entrant", submittedArtistName: "One entrant", tiktokHandle: "@one" });
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  await overlay.setLiveOverlayState({ action: "launchWheel" });
  await overlay.setLiveOverlayState({ action: "reencryptWheel" });
  assert.equal(await editable(sessionId, a), true);
  await overlay.setLiveOverlayState({ action: "launchWheel" });
  const { overlayState: state } = await overlay.setLiveOverlayState({ action: "spinWheel" });
  for (const row of [a, b]) assert.equal((await replace(sessionId, row)).response.status, 409);
  const late = await add({ artist: "Late entrant" });
  assert.equal(await editable(sessionId, late), false, "late intake cannot bypass an active ceremony hold");
  const readyAt = new Date(Date.parse(state.wheelCeremonySpinStartedAt) + state.wheelCeremonySpinDurationMs + 50);
  await at(readyAt, async () => {
    assert.equal(await editable(sessionId, b), false, "animation ending alone does not unlock candidates");
    await overlay.setLiveOverlayState({ action: "confirmWheel", selectedTrackId: a.id });
  });
  assert.equal(await editable(sessionId, a), false);
  assert.equal(await editable(sessionId, b), true);
  assert.equal(await editable(sessionId, late), true);
});

test("cancel, clear, full overlay reset and absent-winner resolution release only temporary holds", async () => {
  for (const action of ["cancelWheel", "clearWheel", "clearAllOverrides", "wheelWinnerNotHere"]) {
    const sessionId = await fresh();
    const first = await add({ artist: "Same entrant", tiktokHandle: "@same" });
    const second = await add({ artist: "Same entrant", tiktokHandle: "@same" });
    const readyAt = await spin();
    await at(readyAt, () => overlay.setLiveOverlayState({ action }));
    assert.equal(await editable(sessionId, second), true, action);
    assert.equal(await editable(sessionId, first), action !== "wheelWinnerNotHere", action);
  }
});

test("simultaneous replacements commit once; a stale form never overwrites the new version", async () => {
  const sessionId = await fresh();
  const track = await add();
  const results = await Promise.all([replace(sessionId, track), replace(sessionId, track)]);
  assert.deepEqual(results.map(result => result.response.status).sort(), [200, 409]);
  assert.equal((await stored(track.id)).replacementRevision, 1);
  assert.equal((await replace(sessionId, track)).response.status, 409);
});

test("selection and slow provider resolution race under the same fence", async () => {
  for (const selection of ["next", "wheel"]) {
    const sessionId = await fresh();
    const track = await add();
    let release;
    let entered;
    const blocked = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const oldFetch = global.fetch;
    global.fetch = async () => { entered(); await blocked; return new Response("{}", { headers: { "content-type": "application/json" } }); };
    try {
      const pending = replace(sessionId, track, { link: "https://soundcloud.com/fixture/new-track" });
      await started;
      if (selection === "next") await queue.updateRadioTrack("", "pullFreeTransmission");
      else await spin();
      release();
      const result = await pending;
      assert.equal(result.response.status, 409, selection);
      assert.equal((await stored(track.id)).title, track.title);
    } finally { release(); global.fetch = oldFetch; }
  }
});

test("edits committed first are exactly the version later selected and locked", async () => {
  const sessionId = await fresh();
  const track = await add();
  assert.equal((await replace(sessionId, track, { title: "Final version" })).response.status, 200);
  await queue.updateRadioTrack("", "pullFreeTransmission");
  assert.equal((await queue.getRadioQueueState()).nextInLine.title, "Final version");
  assert.equal((await replace(sessionId, await stored(track.id))).response.status, 409);
});

test("missing/cross-site origin, private sessions, ended shows, stale sessions and invalid source data fail closed", async () => {
  let sessionId = await fresh();
  const track = await add();
  for (const origin of [null, "https://attacker.test"]) assert.equal((await route.POST(request(replaceBody(sessionId, track), cookie, origin))).status, 403);
  for (const extra of [{ link: "invalid" }, { link: "https://music.apple.com/us/album/a/123?i=456" }, { mode: "upload", uploadedBlobUrl: "https://not-blob.test/a.mp3", uploadOriginalName: "a.mp3", fileSize: 100, mimeType: "audio/mpeg" }, { mode: "upload", detectedDurationSeconds: 361 }]) assert.equal((await replace(sessionId, track, extra)).response.status, 400);
  assert.notEqual((await replace(sessionId, track, { acceptedLegal: false })).response.status, 200);
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "false";
  assert.equal((await replace(sessionId, track)).response.status, 404);
  process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
  await queue.archiveCurrentQueueSession();
  assert.equal((await replace(sessionId, track)).response.status, 409);
  sessionId = await fresh({ purpose: "rehearsal" });
  const privateTrack = await add();
  assert.equal((await replace(sessionId, privateTrack)).response.status, 409);
  assert.equal((await replace("stale-session", privateTrack)).response.status, 409);
});

test("other submissions remain duplicate-protected; own source can be corrected without adding another submission event", async () => {
  const sessionId = await fresh();
  const own = await add();
  const other = await add();
  assert.equal((await replace(sessionId, own, { link: other.link })).response.status, 409);
  assert.equal((await replace(sessionId, own, { link: own.link, title: "Correct title" })).response.status, 200);
  const report = await queue.getQueueSessionShowLog(sessionId);
  const events = report.events ?? report.showLog;
  assert.equal(events.filter(event => event.track?.trackId === own.id && event.eventType === "track_submitted").length, 1);
  assert.equal(events.filter(event => event.track?.trackId === own.id && event.eventType === "track_replaced").length, 1);
  assert.equal(events.find(event => event.track?.trackId === own.id && event.eventType === "track_submitted").track.title, own.title);
});

test("upload/link replacements retain retired sources privately and cleanup never marks the new source deleted", async () => {
  const sessionId = await fresh();
  const oldUrl = "https://fixture.private.blob.vercel-storage.com/barcode-radio-queue/old.mp3";
  const newUrl = "https://fixture.private.blob.vercel-storage.com/barcode-radio-queue/new.wav";
  const track = await add({ sourceType: "upload", fileUrl: oldUrl, link: oldUrl, fileName: "old.mp3", fileSize: 100, mimeType: "audio/mpeg", detectedDurationSeconds: 100 });
  const result = await replace(sessionId, track, { mode: "upload", uploadedBlobUrl: newUrl, uploadOriginalName: "new.wav", fileSize: 200, mimeType: "audio/wav", detectedDurationSeconds: 120 });
  assert.equal(result.response.status, 200);
  let current = await stored(track.id);
  assert.deepEqual(current.supersededUploads, [{ fileUrl: oldUrl }]);
  assert.equal(current.detectedDurationSeconds, 120);
  const removed = [];
  await queue.cleanupExpiredQueueUploads({ now: new Date(Date.now() + 40 * 86400000), deleteBlob: async url => { removed.push(url); } });
  assert.ok(!removed.includes(oldUrl) && !removed.includes(newUrl), "active-show sources are retained");
  assert.equal((await replace(sessionId, current)).response.status, 200);
  current = await stored(track.id);
  assert.equal(current.fileUrl, null);
  assert.equal(current.fileName, null);
  assert.equal(current.detectedDurationSeconds, null);
  assert.equal(current.supersededUploads.length, 2);
  await queue.archiveCurrentQueueSession();
  await queue.cleanupExpiredQueueUploads({ now: new Date(Date.now() + 40 * 86400000), deleteBlob: async url => { removed.push(url); } });
  current = await stored(track.id, sessionId);
  assert.ok(removed.includes(oldUrl) && removed.includes(newUrl));
  assert.ok(current.supersededUploads.every(upload => upload.deletedAt));
  assert.notEqual(current.uploadedFileDeletionStatus, "deleted", "retired-file cleanup must not mark the replacement source deleted");
});

test("the actual 44-slot show stays at 44 when a waiting song is replaced", async () => {
  const sessionId = await fresh();
  const target = await add();
  for (let index = 1; index < 44; index++) await add();
  assert.equal((await queue.getPublicQueueSnapshot()).status.isFull, true);
  assert.equal((await replace(sessionId, target)).response.status, 200);
  assert.equal((await queue.getPublicQueueSnapshot()).status.acceptedCount, 44);
  await assert.rejects(() => add(), /full/i);
});

test("completed/removed songs cannot be replaced and completed selection locks survive restoration", async () => {
  for (const action of ["finish", "remove"]) {
    const sessionId = await fresh();
    const track = await add();
    await queue.updateRadioTrack(track.id, "load");
    await queue.updateRadioTrack(track.id, action);
    assert.equal((await replace(sessionId, track)).response.status, 409);
    await queue.updateRadioTrack(track.id, "restoreRegular");
    assert.equal((await replace(sessionId, track)).response.status, 409);
  }
});

test("a checkout started during media lookup is preserved by the eventual replacement", async () => {
  const sessionId = await fresh();
  const track = await add();
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const originalFetch = global.fetch;
  global.fetch = async () => { entered(); await blocked; return new Response("{}"); };
  try {
    const pending = replace(sessionId, track, { link: "https://soundcloud.com/fixture/payment-race" });
    await started;
    await queue.markPriorityUpgradeCheckoutPending(track.id, sessionId, { provider: "stripe", checkoutSessionId: "cs_new", checkoutOwnerTokenHash: "hash_new" });
    release();
    assert.equal((await pending).response.status, 200);
    const updated = await stored(track.id);
    assert.equal(updated.priorityUpgradeCheckoutSessionId, "cs_new");
    assert.equal(updated.priorityUpgradeCheckoutOwnerTokenHash, "hash_new");
    assert.equal(updated.priorityUpgradeStatus, "checkout_pending");
  } finally { release(); global.fetch = originalFetch; }
});

test("public Deck/history preserves each version's event title without exposing edit capabilities or increasing counts", async () => {
  const sessionId = await fresh();
  const track = await add();
  await replace(sessionId, track, { title: "New public title" });
  const stats = await queue.getPublicQueueStats();
  assert.equal(stats.currentShow.submittedTrackCount, 1);
  const milestones = stats.currentShow.milestones.filter(event => event.track?.trackId === track.id);
  assert.equal(milestones.find(event => event.eventType === "track_submitted").track.title, track.title);
  assert.equal(milestones.find(event => event.eventType === "track_replaced").track.title, "New public title");
  assert.doesNotMatch(JSON.stringify(stats), /submissionOwnerHash|replacementWheelHold|replacementLockedAt|supersededUploads/);
});

test("failed Wheel publishing or cancellation keeps edits paused; successful host reset recovers", async () => {
  const sessionId = await fresh();
  const track = await add();
  await queue.updateRadioTrack("", "addWheelSpinOwed");
  const values = new Map();
  let fail = false;
  class FakeRedis {
    async get(key) { return values.get(key) ?? null; }
    async mget(...keys) { return keys.map(key => values.get(key) ?? null); }
    async set(key, value) { if (fail) throw new Error("fixture overlay store unavailable"); values.set(key, value); return "OK"; }
  }
  const filename = path.join(root, "src/lib/live-overlay.ts");
  const localRequire = createRequire(filename);
  const loadedModule = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { module: loadedModule, exports: loadedModule.exports, require: name => name === "@upstash/redis" ? { Redis: FakeRedis } : localRequire(name), process: { env: { ...process.env, UPSTASH_REDIS_REST_URL: "https://fixture.test", UPSTASH_REDIS_REST_TOKEN: "fixture" } }, console, Date, URL, setTimeout, clearTimeout, crypto: global.crypto });
  const failingOverlay = loadedModule.exports;
  await failingOverlay.setLiveOverlayState({ action: "launchWheel" });
  fail = true;
  await assert.rejects(() => failingOverlay.setLiveOverlayState({ action: "spinWheel" }), /unavailable/);
  assert.equal(await editable(sessionId, track), false);
  await assert.rejects(() => failingOverlay.setLiveOverlayState({ action: "cancelWheel" }), /unavailable/);
  assert.equal(await editable(sessionId, track), false);
  fail = false;
  await failingOverlay.setLiveOverlayState({ action: "cancelWheel" });
  assert.equal(await editable(sessionId, track), true);
});

test("upload authorization checks ownership and selection; signed completion retains an upload rejected by later selection", async () => {
  const sessionId = await fresh();
  const track = await add();
  let callbacks;
  const filename = path.join(root, "src/app/api/queue/upload/route.ts");
  const loadedModule = { exports: {} };
  const localRequire = createRequire(filename);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { module: loadedModule, exports: loadedModule.exports, require: name => name === "@vercel/blob/client" ? { handleUpload: async input => { callbacks = input; return {}; } } : localRequire(name), process, console, URL, Number, JSON });
  const payload = JSON.stringify({ sessionId, replaceTrackId: track.id, expectedRevision: 0, uploadOriginalName: "late.mp3", fileSize: 100, mimeType: "audio/mpeg" });
  await loadedModule.exports.POST(request({}));
  const approved = await callbacks.onBeforeGenerateToken("barcode-radio-queue/late.mp3", payload);
  const tokenPayload = approved.tokenPayload;
  assert.equal(JSON.parse(tokenPayload).ownerHash, ownerHash);
  await loadedModule.exports.POST(request({}, ""));
  await assert.rejects(() => callbacks.onBeforeGenerateToken("barcode-radio-queue/late.mp3", payload), /browser cannot replace/);
  await loadedModule.exports.POST(request({}));
  await queue.updateRadioTrack("", "pullFreeTransmission");
  await assert.rejects(() => callbacks.onBeforeGenerateToken("barcode-radio-queue/late.mp3", payload), /staged/);
  const url = "https://fixture.private.blob.vercel-storage.com/barcode-radio-queue/late.mp3";
  await callbacks.onUploadCompleted({ blob: { url }, tokenPayload });
  assert.deepEqual((await stored(track.id)).supersededUploads, [{ fileUrl: url }]);
  assert.equal((await stored(track.id)).fileUrl ?? null, null);
  await callbacks.onUploadCompleted({ blob: { url }, tokenPayload });
  assert.equal((await stored(track.id)).supersededUploads.length, 1);
});

test("a retired URL reused by a newer archive retains that archive's recovery window", async () => {
  const base = Date.now();
  const url = "https://fixture.private.blob.vercel-storage.com/barcode-radio-queue/shared-retired.mp3";
  const oldSession = await fresh();
  const old = await add({ supersededUploads: [{ fileUrl: url }] });
  await queue.archiveCurrentQueueSession();
  let newerSession;
  let newer;
  await at(new Date(base + 20 * 86400000), async () => {
    newerSession = await fresh();
    newer = await add({ sourceType: "upload", fileUrl: url, link: url, fileName: "shared.mp3", fileSize: 100, mimeType: "audio/mpeg" });
    await queue.archiveCurrentQueueSession();
  });
  const deleted = [];
  await queue.cleanupExpiredQueueUploads({ now: new Date(base + 31 * 86400000), deleteBlob: async value => { deleted.push(value); } });
  assert.ok(!deleted.includes(url));
  await queue.cleanupExpiredQueueUploads({ now: new Date(base + 51 * 86400000), deleteBlob: async value => { deleted.push(value); } });
  assert.equal(deleted.filter(value => value === url).length, 1);
  assert.ok((await stored(old.id, oldSession)).supersededUploads[0].deletedAt);
  assert.equal((await stored(newer.id, newerSession)).uploadedFileDeletionStatus, "deleted");
});
