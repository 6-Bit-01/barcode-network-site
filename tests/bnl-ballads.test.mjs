import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
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
  assert.throws(() => contract.archiveBallad(chosen, ""), /Choose/);
  assert.equal(chosen.selectedAudioId, audio.id);
  assert.equal(chosen.archivedSongs.length, 0);
});

const notes = { about: "A last-listener anthem.", inspiration: "I left the light on for Test Member.", mentions: "Test Member — the final voice in the room.", inspiredBy: "The last goodbye in public show chat." };
const show = { sessionId: "show-1", title: "Radio", showDate: "2026-09-11" };
test("track stories publish with the confirmed version and freeze until explicit republishing", () => {
  let doc = draft();
  doc.versions[0].linerNotes = { ...notes };
  doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  doc.versions.push({ ...version, id: "draft-2", ordinal: 2, linerNotes: { ...notes, inspiration: "A different private draft" } });
  doc = contract.saveBalladLinerNotes(doc, "draft-1", { ...notes, inspiration: "Edited story", privateFeedback: "Keep this secret" });
  assert.equal(contract.publicBallad(doc, show).linerNotes.inspiration, notes.inspiration);
  const updated = contract.publishBallad(doc);
  const publicEntry = contract.publicBallad(updated, show);
  assert.equal(publicEntry.version.id, "draft-1");
  assert.equal(publicEntry.linerNotes.inspiration, "Edited story");
  assert.equal(JSON.stringify(publicEntry).includes("private"), false);
  assert.equal(JSON.stringify(publicEntry).includes("Keep this secret"), false);
  assert.equal(doc.versions.length, 2);
  assert.equal(doc.commands.length, 1);
});
test("archival keeps the published story and replacement uses its own story", () => {
  let doc = draft(); doc.versions[0].linerNotes = { ...notes };
  doc.versions.push({ ...version, id: "draft-2", ordinal: 2, linerNotes: { ...notes, inspiration: "A new angle" } });
  doc.audio.push(audio, { ...audio, id: "take-2", versionId: "draft-2" });
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  doc = contract.saveBalladLinerNotes(doc, "draft-1", { ...notes, inspiration: "Unpublished edit" });
  const replaced = contract.archiveBallad(doc, "take-2");
  assert.equal(replaced.archivedSongs[0].linerNotes.inspiration, notes.inspiration);
  assert.equal(replaced.published, null);
  assert.equal(contract.publicBallad(contract.publishBallad(replaced), show).linerNotes.inspiration, "A new angle");
});
test("legacy songs accept optional notes without a model call or a new audio selection", () => {
  let doc = draft(); doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  delete doc.published.linerNotes;
  assert.equal(Object.values(contract.publicBallad(doc, show).linerNotes).join(""), "");
  const withNotes = contract.saveBalladLinerNotes(doc, "draft-1", notes);
  assert.equal(Object.values(contract.publicBallad(withNotes, show).linerNotes).join(""), "");
  assert.equal(contract.publicBallad(contract.publishBallad(withNotes), show).linerNotes.about, notes.about);
  assert.equal(withNotes.selectedAudioId, audio.id);
  assert.throws(() => contract.saveBalladLinerNotes(doc, "wrong-show-version", notes), /saved song version/);
});
test("producer note edits follow edit and restore receipts without changing older versions", () => {
  let doc = contract.saveBalladLinerNotes(draft(), "draft-1", notes);
  const editCommand = { ...command, id: "edit-2", kind: "edit", baseVersion: "draft-1" };
  doc.commands.push(editCommand);
  doc = contract.applyBalladReceipt(doc, { commandId: "edit-2", outcome: "complete", version: { ...version, id: "edit-2", kind: "edit", ordinal: 2, parentId: "draft-1" } });
  assert.equal(contract.balladLinerNotesForVersion(doc, "edit-2").about, notes.about);
  doc = contract.saveBalladLinerNotes(doc, "edit-2", { ...notes, about: "Different version" });
  doc.commands.push({ ...command, id: "restore-3", kind: "restore", baseVersion: "edit-2", restoreVersion: "draft-1" });
  doc = contract.applyBalladReceipt(doc, { commandId: "restore-3", outcome: "complete", version: { ...version, id: "restore-3", kind: "restore", ordinal: 3, parentId: "edit-2" } });
  assert.equal(contract.balladLinerNotesForVersion(doc, "restore-3").about, notes.about);
  assert.equal(contract.balladLinerNotesForVersion(doc, "edit-2").about, "Different version");
});
test("authenticated Save track story persists only to its requested version and queues no generation", async () => {
  const { store } = setup();
  await store.saveBallad(draft(), 0);
  const route = load("src/app/api/admin/ballads/route.ts", { "@vercel/blob": { head() { throw new Error("must not run"); } }, "@/lib/auth": { verifyAdminRequest: async () => true }, "@/lib/bnl-ballads-store": store, "@/lib/bnl-ballads": contract });
  const save = (revision, versionId = "draft-1") => route.POST(new Request("https://test/api/admin/ballads", { method: "POST", body: JSON.stringify({ action: "saveLinerNotes", showId: "show-1", revision, versionId, linerNotes: notes }) }));
  assert.equal((await save(1)).status, 200);
  const saved = await store.readBallad("show-1");
  assert.equal(saved.linerNotesByVersion["draft-1"].inspiration, notes.inspiration);
  assert.equal(saved.commands.length, 1);
  assert.equal(saved.versions.length, 1);
  assert.equal(saved.published, null);
  assert.equal((await save(1)).status, 409);
  assert.equal((await save(2, "other-show-draft")).status, 400);
});
test("public page shows and searches the released story while escaping text and omitting empty notes", async () => {
  const story = load("src/components/BalladTrackStory.tsx", { "@/lib/bnl-ballads": contract });
  assert.equal(renderToStaticMarkup(React.createElement(story.BalladTrackStory, { notes: undefined })), "");
  let doc = draft(); doc.versions[0].linerNotes = { ...notes, about: "<script>not markup</script>" }; doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  const page = load("src/app/radio/ballads/page.tsx", { "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children), "@/components/BalladTrackStory": story, "@/lib/bnl-ballads-store": { listPublicBallads: async () => [contract.publicBallad(doc, show)] } });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ q: "Test Member" }) }));
  for (const label of Object.values(contract.BALLAD_LINER_NOTE_FIELDS)) assert.ok(html.includes(label.replaceAll("&", "&amp;")));
  assert.ok(html.includes(notes.inspiration));
  assert.ok(html.includes("&lt;script&gt;not markup&lt;/script&gt;"));
  assert.equal(html.includes("<script>not markup</script>"), false);
  const absent = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ q: "private producer feedback" }) }));
  assert.ok(absent.includes("No ballads match"));
});

test("polish uses the viewed version while concurrency stays pinned to latest", async () => {
  const { store } = setup();
  const doc = draft(); doc.versions.push({ ...version, id: "draft-2", ordinal: 2, parentId: "draft-1" });
  await store.saveBallad(doc, 0);
  const route = load("src/app/api/admin/ballads/route.ts", { "@vercel/blob": {}, "@/lib/auth": { verifyAdminRequest: async () => true }, "@/lib/bnl-ballads-store": store, "@/lib/bnl-ballads": contract });
  const request = sourceVersion => route.POST(new Request("https://test/api/admin/ballads", { method: "POST", body: JSON.stringify({ action: "polish", showId: "show-1", revision: 1, sourceVersion }) }));
  assert.equal((await request("other-show-version")).status, 400);
  const response = await request("draft-1");
  assert.equal(response.status, 200);
  const queued = (await response.json()).document.commands.at(-1);
  assert.equal(queued.sourceVersion, "draft-1");
  assert.equal(queued.baseVersion, "draft-2");
});

test("editing an older working version inherits that version's story overrides", () => {
  let doc = draft();
  doc = contract.saveBalladLinerNotes(doc, "draft-1", notes);
  doc.versions.push({ ...version, id: "draft-2", ordinal: 2 });
  doc = contract.saveBalladLinerNotes(doc, "draft-2", { ...notes, about: "Newer different story" });
  doc.commands.push({ ...command, id: "edit-3", kind: "edit", sourceVersion: "draft-1", baseVersion: "draft-2" });
  doc = contract.applyBalladReceipt(doc, { commandId: "edit-3", outcome: "complete", version: { ...version, id: "edit-3", ordinal: 3, parentId: "draft-2", kind: "edit" } });
  assert.equal(contract.balladLinerNotesForVersion(doc, "edit-3").about, notes.about);
});
