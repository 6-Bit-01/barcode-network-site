import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

// These behavioral fixtures never use a live queue, provider, or upload store.
for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "QUEUE_REDIS_REST_URL", "QUEUE_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL"]) delete process.env[name];
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
const root = path.resolve(import.meta.dirname, "..");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, parent, ...args);
};
Module._extensions[".ts"] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
};
const require = createRequire(import.meta.url);
const queue = require("../src/lib/queue.ts");
const overlay = require("../src/lib/live-overlay.ts");
const { getQueueTrackCredits } = require("../src/lib/live-overlay-resolver.ts");
let sequence = 0;
async function fresh() {
  const state = await queue.getRadioQueueState();
  if (state.session.status !== "archived") await queue.archiveCurrentQueueSession();
  await queue.startNewQueueSession({ purpose: "live_broadcast", bnlPublicationStatus: "public_copy_approved", submissionCooldownSeconds: 0 });
  await queue.setQueueOpen(true);
}
async function add(extra = {}) {
  sequence += 1;
  const id = `credits-${sequence}`;
  return queue.addToQueue({ id, artist: `Artist ${sequence}`, title: `Song ${sequence}`, sourceType: "other", link: `https://example.test/${id}`, tiktokHandle: `@credits${sequence}`, lane: "regular", tier: "free", amount: 0, status: "queued", createdAt: new Date(Date.UTC(2026, 8, 12, 0, 0, sequence)).toISOString(), ...extra });
}
async function finish(track) {
  await queue.updateRadioTrack(track.id, "load");
  await queue.updateRadioTrack(track.id, "finish");
}

test("submitted broadcast credits cannot be replaced by filenames or provider uploaders", () => {
  for (const sourceType of ["upload", "youtube", "soundcloud", "spotify", "tiktok"]) {
    const track = { sourceType, submittedArtistName: "Actual Submitted Artist", submittedSongTitle: "Actual Submitted Song", artist: "Legacy Artist", title: "Legacy Song", detectedArtistName: "Upload Channel", detectedSongTitle: "Wrong Filename", providerTitle: "Provider caption" };
    const before = structuredClone(track);
    assert.deepEqual(getQueueTrackCredits(track), { artist: "Actual Submitted Artist", title: "Actual Submitted Song" });
    assert.deepEqual(track, before, "display resolution never edits provenance");
  }
  assert.deepEqual(getQueueTrackCredits({ submittedArtistName: "   ", artist: "Legacy Artist", title: "Legacy Song" }), { artist: "Legacy Artist", title: "Legacy Song" });
});

test("Wheel selection and loaded overlay preserve submitted credits and all original metadata", async () => {
  await fresh();
  const track = await add({ sourceType: "upload", artist: "Credit Artist", title: "Credit Song", fileName: "Wrong Artist - Wrong Song.mp3", fileUrl: "https://example.test/private-upload", detectedArtistName: "Wrong Artist", detectedSongTitle: "Wrong Song" });
  const before = await queue.getRadioQueueState();
  const candidate = (await overlay.getLiveOverlayAdminSnapshot()).wheelCandidates.find((item) => item.trackIds.includes(track.id));
  assert.equal(candidate.artistName, "Credit Artist");
  assert.equal(candidate.trackTitle, "Credit Song");
  await queue.updateRadioTrack(track.id, "wheel");
  await queue.updateRadioTrack("", "startShow");
  await queue.updateRadioTrack(track.id, "load");
  const live = await overlay.getLiveOverlayAdminSnapshot();
  assert.equal(live.scene.track.artistName, "Credit Artist");
  assert.equal(live.scene.track.trackTitle, "Credit Song");
  const loaded = (await queue.getRadioQueueState()).loadedTrack;
  for (const key of ["artist", "title", "submittedArtistName", "submittedSongTitle", "fileName", "detectedArtistName", "detectedSongTitle"]) {
    assert.equal(loaded[key], before.queue.find((item) => item.id === track.id)[key]);
  }
  assert.doesNotMatch(JSON.stringify(queue.toPublicQueueTrack(loaded)), /Wrong Artist|Wrong Song|private-upload/);
});

test("full-session personal counts survive removal, restoration and the recent-play window", async () => {
  await fresh();
  const token = "private-count-owner";
  const completed = await add({ submitterToken: token });
  await finish(completed);
  for (let i = 0; i < 11; i += 1) await finish(await add());
  const removed = await add({ submitterToken: token });
  const waiting = await add({ submitterToken: token });
  await queue.updateRadioTrack(removed.id, "remove");
  let snapshot = await queue.getPublicQueueSnapshot(undefined, { submitterToken: token });
  assert.equal(snapshot.completed.some((item) => item.id === completed.id), false, "old owner track is outside the recent ten");
  assert.equal(snapshot.submitterStatus.used, 3);
  assert.equal(snapshot.submitterStatus.remaining, 0, "removal does not reset the accepted-submission allowance");
  assert.equal(snapshot.submitterStatus.lifecycleCounts.finishedTrackCount, 1);
  assert.equal(snapshot.submitterStatus.lifecycleCounts.removedTrackCount, 1);
  assert.equal(snapshot.submitterStatus.lifecycleCounts.activeTrackCount, 1);
  assert.ok(snapshot.submitterStatus.submitted.some((item) => item.id === waiting.id));
  await queue.updateRadioTrack(removed.id, "restoreRegular");
  snapshot = await queue.getPublicQueueSnapshot(undefined, { submitterToken: token });
  assert.equal(snapshot.submitterStatus.lifecycleCounts.removedTrackCount, 0);
  assert.equal(snapshot.submitterStatus.lifecycleCounts.activeTrackCount, 2);
  assert.equal(snapshot.submitterStatus.used, 3);
});

test("counts do not disclose tracks connected only through another submitter identity", async () => {
  await fresh();
  const visible = await add({ submitterToken: "private-visible", contactEmail: "bridge@example.test" });
  const hidden = await add({ submitterToken: "private-hidden", contactEmail: "bridge@example.test" });
  await queue.updateRadioTrack(hidden.id, "remove");
  const snapshot = await queue.getPublicQueueSnapshot(undefined, { submitterToken: "private-visible" });
  assert.equal(snapshot.submitterStatus.used, 2, "the allowance still follows linked identities");
  assert.deepEqual(snapshot.submitterStatus.submitted.map((item) => item.id), [visible.id]);
  assert.equal(snapshot.submitterStatus.lifecycleCounts.submittedTrackCount, 1);
  assert.equal(snapshot.submitterStatus.lifecycleCounts.removedTrackCount, 0);
  assert.doesNotMatch(JSON.stringify(snapshot.submitterStatus), /private-hidden|bridge@example/);
});
