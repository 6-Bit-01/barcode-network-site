import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const cjsModule = { exports: {} };
  vm.runInNewContext(code, { module: cjsModule, exports: cjsModule.exports, require: id => mocks[id] ?? require(id), structuredClone, process, console, Buffer, URL, Request, Response, Date, JSON, Set }, { filename: file });
  return cjsModule.exports;
}
const contract = load("src/lib/bnl-ballads.ts");
const command = { id: "draft-1", showId: "show-1", showDate: "2026-09-11", kind: "generate", baseVersion: null, options: contract.DEFAULT_BALLAD_OPTIONS, requestedAt: "2026-09-12T03:00:00Z", status: "queued" };
const version = { id: "draft-1", showId: "show-1", ordinal: 1, parentId: null, title: "Chairs Stayed Warm", lyrics: "[Chorus]\nLeave a light", style: "1977 chamber soul and dub", palette: { topics: "last listener" }, author: "BNL-01", contentHash: "a".repeat(64), kind: "generate", createdAt: "2026-09-12T03:01:00Z", rawOutput: "Original output", note: "", options: {}, promptVersion: "broadcast-ballad-1", sourceDigest: "b".repeat(64) };
function draft() { const doc = contract.newBallad("show-1"); doc.commands.push(structuredClone(command)); return contract.applyBalladReceipt(doc, { commandId: command.id, outcome: "complete", version }); }
const audio = { id: "take-1", versionId: version.id, url: "https://unit.private.blob.vercel-storage.com/bnl-ballads/show-1/take.mp3", pathname: "bnl-ballads/show-1/take.mp3", filename: "take.mp3", contentType: "audio/mpeg", bytes: 5000, duration: 150, createdAt: "2026-09-12T03:30:00Z" };

test("draft receipt is idempotent and never publishes automatically", () => {
  const doc = draft();
  const duplicate = contract.applyBalladReceipt(doc, { commandId: command.id, outcome: "complete", version });
  assert.equal(duplicate, doc);
  assert.equal(doc.versions.length, 1);
  assert.equal(doc.published, null);
  assert.equal(contract.publicBallad(doc, { sessionId: "show-1" }), null);
});
test("publication requires confirmed audio and pins the exact prompt and presentation", () => {
  let doc = draft();
  assert.throws(() => contract.publishBallad(doc), /Confirm/);
  doc.audio.push(audio);
  doc = contract.selectBalladAudio(doc, audio.id);
  doc = contract.publishBallad(doc);
  doc.versions.push({ ...version, id: "draft-2", ordinal: 2, lyrics: "A private rewrite" });
  doc.presentation.credits = "Unsaved public revision";
  const entry = contract.publicBallad(doc, { sessionId: "show-1", title: "Radio", showDate: "2026-09-11" });
  assert.equal(entry.version.lyrics, version.lyrics);
  assert.notEqual(entry.presentation.credits, doc.presentation.credits);
  assert.equal(JSON.stringify(entry).includes("private.blob"), false);
  assert.equal(JSON.stringify(entry).includes("Original output"), false);
  assert.equal(JSON.stringify(entry).includes("sourceDigest"), false);
});
test("failed revision leaves existing versions and public release intact", () => {
  const doc = draft(); doc.audio.push(audio);
  const published = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  published.commands.push({ ...command, id: "draft-2", baseVersion: "draft-1" });
  const failed = contract.applyBalladReceipt(published, { commandId: "draft-2", outcome: "failed", error: "provider_unavailable" });
  assert.deepEqual(failed.versions, published.versions);
  assert.equal(JSON.stringify(failed.published), JSON.stringify(published.published));
});
test("wrong-show and stale-parent receipts cannot overwrite a draft", () => {
  const doc = contract.newBallad("show-1"); doc.commands.push(command);
  assert.throws(() => contract.applyBalladReceipt(doc, { commandId: command.id, outcome: "complete", version: { ...version, showId: "other-show" } }), /Invalid/);
  assert.throws(() => contract.applyBalladReceipt(doc, { commandId: command.id, outcome: "complete", version: { ...version, parentId: "stale" } }), /Invalid/);
});

class Redis {
  data = new Map();
  async get(key) { return structuredClone(this.data.get(key) ?? null); }
  async eval(_script, keys, args) {
    const current = this.data.get(keys[0]);
    if ((current?.revision ?? 0) !== args[0]) return 0;
    this.data.set(keys[0], JSON.parse(args[1]));
    if (keys[1] && args[2]) this.data.set(keys[1], JSON.parse(args[2]));
    return 1;
  }
}
function setup() {
  const redis = new Redis();
  let shows = [{ sessionId: "show-1", title: "Radio", showDate: "2026-09-11", status: "archived" }, { sessionId: "live-show", title: "Live", showDate: "2026-09-17", status: "open" }];
  const store = load("src/lib/bnl-ballads-store.ts", { "@/lib/bnl-journal-store": { getBNLJournalRedis: () => redis }, "@/lib/queue": { getPublicQueueStats: async () => ({ shows }) }, "@/lib/bnl-ballads": contract });
  return { store, redis, setShows: v => { shows = v; } };
}
test("optimistic saves preserve the winner and reject stale edits", async () => {
  const { store } = setup();
  await store.saveBallad(draft(), 0);
  await assert.rejects(store.saveBallad({ ...draft(), options: { direction: "Stale" } }, 0), /changed/);
  assert.equal((await store.readBallad("show-1")).revision, 1);
});
test("automation is off by default and enabling captures the historical baseline", async () => {
  const { store } = setup();
  assert.equal((await store.readBalladConfig()).enabled, false);
  await store.saveBalladConfig(true, 0);
  assert.deepEqual(Array.from(await store.automationBaseline()), ["show-1"]);
  assert.equal((await store.readBalladConfig()).enabled, true);
  await assert.rejects(store.requireBalladShow("private-rehearsal"), /public/);
  await assert.rejects(store.requireBalladShow("live-show"), /public/);
});
test("public eligibility revocation immediately removes a released ballad", async () => {
  const { store, setShows } = setup();
  const doc = draft(); doc.audio.push(audio);
  await store.saveBallad(contract.publishBallad(contract.selectBalladAudio(doc, audio.id)), 0);
  assert.equal((await store.listPublicBallads()).length, 1);
  setShows([]);
  assert.equal((await store.listPublicBallads()).length, 0);
});
test("API rejects unsigned admin and bot writes before reading storage", async () => {
  const route = load("src/app/api/admin/ballads/route.ts", { "@vercel/blob": { head() { throw new Error("must not run"); } }, "@/lib/auth": { verifyAdminRequest: async () => false }, "@/lib/bnl-ballads-store": {}, "@/lib/bnl-ballads": contract });
  assert.equal((await route.POST(new Request("https://test/api/admin/ballads", { method: "POST", body: "{}" }))).status, 401);
  const bot = load("src/app/api/bnl/ballads/route.ts", { "@/lib/bnl-journal-contract": { authenticateBNLJournalRequest: () => false }, "@/lib/bnl-ballads-store": {}, "@/lib/bnl-ballads": contract });
  assert.equal((await bot.GET(new Request("https://test/api/bnl/ballads"))).status, 401);
  assert.equal((await bot.POST(new Request("https://test/api/bnl/ballads", { method: "POST", body: "{}" }))).status, 401);
});
test("automatic trigger queues one draft per future public show and never backfills the baseline", async () => {
  const { store, setShows } = setup();
  await store.saveBalladConfig(true, 0);
  setShows([{ sessionId: "future", showDate: new Date().toISOString().slice(0, 10), title: "Future Radio", status: "archived" }, { sessionId: "show-1", showDate: "2026-09-11", title: "Old Radio", status: "archived" }]);
  const route = load("src/app/api/bnl/ballads/route.ts", { "@/lib/bnl-journal-contract": { authenticateBNLJournalRequest: () => true }, "@/lib/bnl-ballads-store": store, "@/lib/bnl-ballads": contract });
  const first = await (await route.GET(new Request("https://test/api/bnl/ballads"))).json();
  const second = await (await route.GET(new Request("https://test/api/bnl/ballads"))).json();
  assert.equal(first.commands.length, 1);
  assert.equal(first.commands[0].id, second.commands[0].id);
  assert.equal((await store.readBallad("future")).commands.length, 1);
  assert.equal((await store.readBallad("show-1")).commands.length, 0);
});

test("one chosen song per show: replacement requires explicit atomic archival", () => {
  const doc = draft(); doc.audio.push(audio, { ...audio, id: "take-2" });
  const chosen = contract.selectBalladAudio(doc, "take-1");
  assert.equal(contract.selectBalladAudio(chosen, "take-1"), chosen);
  assert.throws(() => contract.selectBalladAudio(chosen, "take-2"), /locked/);
  const published = contract.publishBallad(chosen);
  const replaced = contract.archiveBallad(published, "take-2", "2026-09-17T04:00:00Z");
  assert.equal(replaced.selectedAudioId, "take-2");
  assert.equal(replaced.published, null);
  assert.equal(replaced.archivedSongs.length, 1);
  assert.equal(replaced.archivedSongs[0].audioId, "take-1");
  assert.equal(replaced.archivedSongs[0].versionId, version.id);
  assert.equal(replaced.archivedSongs[0].publishedAt, published.published.at);
  const empty = contract.archiveBallad(replaced);
  assert.equal(empty.selectedAudioId, null);
  assert.equal(empty.published, null);
  assert.equal(empty.archivedSongs.length, 2);
  assert.equal(empty.audio.length, 2);
  assert.equal(empty.versions[0].lyrics, version.lyrics);
});
test("invalid replacement cannot partially archive the existing song", () => {
  const doc = draft(); doc.audio.push(audio);
  const chosen = contract.selectBalladAudio(doc, audio.id);
  assert.throws(() => contract.archiveBallad(chosen, "missing-take"), /Choose/);
  assert.equal(chosen.selectedAudioId, audio.id);
  assert.equal(chosen.archivedSongs.length, 0);
});
