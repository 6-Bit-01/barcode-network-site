import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
  vm.runInNewContext(code, { module: cjsModule, exports: cjsModule.exports, require: id => mocks[id] ?? (id === "@/components/SiteAudioProvider" ? { useSiteAudio: () => ({ track: null, currentTime: 0, duration: 0, status: "idle", controller: {} }) } : id === "next/link" ? (({ href, children, ...props }) => React.createElement("a", { href, ...props }, children)) : id === "next/form" ? (({ children, ...props }) => React.createElement("form", props, children)) : undefined) ?? (id.startsWith("@/") ? load(`src/${id.slice(2)}${existsSync(`src/${id.slice(2)}.tsx`) ? ".tsx" : ".ts"}`, mocks) : require(id)), structuredClone, process, console, Buffer, URL, URLSearchParams, Request, Response, Date, JSON, Set }, { filename: file });
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
const artistTools = load("src/lib/bnl-ballad-artists.ts");
const profile = label => ({ projectKey: label.toLocaleLowerCase(), projectLabel: label });
const artistFixtures = ["LostMarbles", "Mr Nice Guy", "Ash Flowers", "WittyF0x", "antigrain", "AI/ML Music", "6 X Bit"].map(label => ({ ...profile(label), tracks: [{ sessionId: "show-1" }], privateNotes: "must not leak" }));
function setup() {
  const redis = new Redis();
  let shows = [{ sessionId: "show-1", title: "Radio", showDate: "2026-09-11", status: "archived" }, { sessionId: "live-show", title: "Live", showDate: "2026-09-17", status: "open" }];
  let artists = [...artistFixtures]; // The queue public projection owns private-session exclusion.
  const store = load("src/lib/bnl-ballads-store.ts", { "@/lib/bnl-journal-store": { getBNLJournalRedis: () => redis }, "@/lib/queue": { getPublicQueueStats: async () => ({ shows, artists }) }, "@/lib/bnl-ballads": contract });
  return { store, redis, setShows: v => { shows = v; }, setArtists: v => { artists = v; } };
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
test("show card shows the released story while escaping text and omitting empty notes", async () => {
  const story = load("src/components/BalladTrackStory.tsx", { "@/lib/bnl-ballads": contract });
  assert.equal(renderToStaticMarkup(React.createElement(story.BalladTrackStory, { notes: undefined })), "");
  let doc = draft(); doc.versions[0].linerNotes = { ...notes, about: "<script>not markup</script>" }; doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  const page = load("src/components/BroadcastBallad.tsx", { "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children), "@/components/BalladTrackStory": story, "@/lib/bnl-ballads-store": { listPublicBallads: async () => [contract.publicBallad(doc, show)] } });
  const html = renderToStaticMarkup(React.createElement(page.BroadcastBallad, { ballad: contract.publicBallad(doc, show) }));
  for (const label of Object.values(contract.BALLAD_LINER_NOTE_FIELDS)) assert.ok(html.includes(label.replaceAll("&", "&amp;")));
  assert.ok(html.includes(notes.inspiration));
  assert.ok(html.includes("&lt;script&gt;not markup&lt;/script&gt;"));
  assert.equal(html.includes("<script>not markup</script>"), false);
  assert.ok(!html.includes("private producer feedback"));
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


test("artist suggestions rank aliases and typos without excluding punctuation in primary names", () => {
  const catalog = artistTools.balladArtistProfiles(artistFixtures);
  assert.equal(catalog.length, 7);
  assert.equal(artistTools.suggestBalladArtists("Lost Marbles", catalog)[0].projectKey, "lostmarbles");
  assert.equal(artistTools.suggestBalladArtists("Mr. Nice Guy", catalog)[0].projectKey, "mr nice guy");
  assert.equal(artistTools.suggestBalladArtists("WittyFox", catalog)[0].projectKey, "wittyf0x");
  assert.equal(artistTools.suggestBalladArtists("Nobody similar", catalog).length, 0);
  const names = Array.from(artistTools.suggestedBalladNames("Mr Nice Guy and Lost Marbles — the studio duo; WittyFox — a remake; antigrain — wheel jokes.", catalog));
  for (const name of ["Mr Nice Guy", "Lost Marbles", "WittyFox", "antigrain"]) assert.ok(names.includes(name), name);
  assert.equal(names.some(name => name.includes(" and ")), false);
});

test("workspace artist catalog contains only individual public Archive destinations", async () => {
  const { store } = setup();
  const route = load("src/app/api/admin/ballads/route.ts", { "@vercel/blob": {}, "@/lib/auth": { verifyAdminRequest: async () => true }, "@/lib/bnl-ballads-store": store, "@/lib/bnl-ballads": contract });
  const response = await route.GET(new Request("https://test/api/admin/ballads?showId=show-1"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.artists.length, 7);
  assert.equal(JSON.stringify(data.artists).includes("private"), false);
  assert.equal(JSON.stringify(data.artists).includes("tracks"), false);
  assert.equal(JSON.stringify(data.artists).includes(" and "), false);
});

const lostLink = { name: "Lost Marbles", ...profile("LostMarbles") };
const ashLink = { name: "Ash", ...profile("Ash Flowers") };
test("artist link API validates current destinations and uses canonical labels with stale-write protection", async () => {
  const { store, setArtists } = setup();
  await store.saveBallad(draft(), 0);
  const route = load("src/app/api/admin/ballads/route.ts", { "@vercel/blob": {}, "@/lib/auth": { verifyAdminRequest: async () => true }, "@/lib/bnl-ballads-store": store, "@/lib/bnl-ballads": contract });
  const post = body => route.POST(new Request("https://test/api/admin/ballads", { method: "POST", body: JSON.stringify({ showId: "show-1", revision: 1, versionId: "draft-1", action: "saveArtistLinks", ...body }) }));
  for (const bad of [[{ name: "Lost Marbles", projectKey: "private persona" }], [{ name: "Both", projectKey: "mr nice guy and lostmarbles" }], [{ name: "Wrong", projectKey: "javascript:alert(1)" }], [lostLink, lostLink], Array.from({ length: 51 }, () => lostLink), "not a list"]) {
    assert.equal((await post({ artistLinks: bad })).status, 400);
    assert.equal((await store.readBallad("show-1")).revision, 1);
  }
  assert.equal((await post({ versionId: "other-show-version", artistLinks: [lostLink] })).status, 400);
  const response = await post({ artistLinks: [{ ...lostLink, projectLabel: "Forged label", url: "https://evil.test", privateNotes: "secret" }] });
  assert.equal(response.status, 200);
  const saved = await store.readBallad("show-1");
  assert.equal(JSON.stringify(saved.artistLinksByVersion["draft-1"]), JSON.stringify([lostLink]));
  assert.equal(saved.versions.length, 1);
  assert.equal(saved.commands.length, 1);
  assert.equal(saved.published, null);
  assert.equal((await post({ artistLinks: [] })).status, 409);
  saved.audio.push(audio);
  await store.saveBallad(contract.selectBalladAudio(saved, audio.id), 2);
  setArtists([]);
  const invalidPublish = await post({ revision: 3, action: "publish" });
  assert.equal(invalidPublish.status, 400);
  assert.equal((await store.readBallad("show-1")).published, null);
  assert.equal((await post({ revision: 3, artistLinks: [] })).status, 200);
  assert.equal((await post({ revision: 4, action: "publish" })).status, 200);
});

test("artist links freeze with the exact confirmed version until republish and survive archive/replacement", () => {
  let doc = contract.saveBalladArtistLinks(draft(), "draft-1", [lostLink]);
  doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  doc.versions.push({ ...version, id: "draft-2", ordinal: 2 });
  doc.audio.push({ ...audio, id: "take-2", versionId: "draft-2" });
  doc = contract.saveBalladArtistLinks(doc, "draft-1", [ashLink]);
  doc = contract.saveBalladArtistLinks(doc, "draft-2", [{ name: "", ...profile("WittyF0x") }]);
  assert.equal(contract.publicBallad(doc, show).artistLinks[0].projectKey, "lostmarbles");
  const published = contract.publishBallad(doc);
  assert.equal(contract.publicBallad(published, show).artistLinks[0].projectKey, "ash flowers");
  const replaced = contract.archiveBallad(doc, "take-2");
  assert.equal(replaced.archivedSongs[0].artistLinks[0].projectKey, "lostmarbles");
  assert.equal(replaced.published, null);
  assert.equal(contract.publicBallad(contract.publishBallad(replaced), show).artistLinks[0].projectKey, "wittyf0x");
  assert.equal(doc.versions[0].lyrics, version.lyrics);
});

test("reviewed links follow explicit edit/restore sources but never model-generated identity guesses", () => {
  let doc = contract.saveBalladArtistLinks(draft(), "draft-1", [lostLink]);
  for (const [kind, source, id] of [["edit", "draft-1", "edit-2"], ["restore", "draft-1", "restore-3"], ["polish", "draft-1", "polish-4"], ["generate", null, "generate-5"]]) {
    const base = doc.versions.at(-1).id;
    doc.commands.push({ ...command, id, kind, baseVersion: base, sourceVersion: source, restoreVersion: source });
    doc = contract.applyBalladReceipt(doc, { commandId: id, outcome: "complete", version: { ...version, id, kind, ordinal: doc.versions.length + 1, parentId: base, artistLinks: [ashLink] } });
    const expected = ["edit", "restore"].includes(kind) ? [lostLink] : [];
    assert.equal(JSON.stringify(contract.balladArtistLinksForVersion(doc, id)), JSON.stringify(expected));
  }
  assert.equal(contract.balladArtistLinksForVersion(doc, "draft-1")[0].projectKey, "lostmarbles");
});

test("literal name rendering preserves words, escapes text and does not link partial names", () => {
  const { BalladLinkedText } = load("src/components/BalladArtistLinks.tsx");
  const text = "Ash Flowers, Ash, Ashley, LOST MARBLES and <script>keep as text</script>.";
  const links = [ashLink, { ...ashLink, name: "Ash Flowers" }, lostLink];
  const parts = artistTools.balladLinkedTextParts(text, links);
  assert.equal(parts.map(part => part.text).join(""), text);
  assert.equal(parts.filter(part => part.link).length, 3);
  const html = renderToStaticMarkup(React.createElement(BalladLinkedText, { text, artistLinks: links }));
  assert.ok(html.includes("artist=ash%20flowers"));
  assert.ok(html.includes("artist=lostmarbles"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(html.includes(">Ashley</a>"), false);
  assert.equal(artistTools.balladLinkedTextParts("A.* B", [{ name: "A.*", ...profile("Ash Flowers") }]).filter(part => part.link).length, 1);
});

test("show card artist links use only the published snapshot", async () => {
  let doc = draft(); doc.versions[0].lyrics = "Lost Marbles left the light on.";
  doc.versions[0].linerNotes = { ...notes, mentions: "Lost Marbles — the last listener." };
  doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(contract.saveBalladArtistLinks(doc, "draft-1", [lostLink, { name: "", ...profile("Ash Flowers") }]), audio.id));
  doc = contract.saveBalladArtistLinks(doc, "draft-1", [{ name: "Private Alias", ...profile("WittyF0x") }]);
  const page = load("src/components/BroadcastBallad.tsx", { "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children), "@/lib/bnl-ballads-store": { listPublicBallads: async () => [contract.publicBallad(doc, show)] } });
  const html = renderToStaticMarkup(React.createElement(page.BroadcastBallad, { ballad: contract.publicBallad(doc, show) }));
  assert.equal((html.match(/artist=lostmarbles/g) ?? []).length, 3);
  assert.ok(html.includes("Explore the artists"));
  assert.ok(html.includes("artist=ash%20flowers"));
  assert.equal(html.includes("Private Alias"), false);
  delete doc.published.artistLinks;
  assert.equal(contract.publicBallad(doc, show).artistLinks.length, 0);
});

test("reviewed names persist with the working version and empty choices are not refilled", () => {
  const doc = contract.saveBalladArtistLinks(draft(), version.id, [], ["AI/ML Music"]);
  assert.deepEqual(Array.from(doc.artistNamesReviewedByVersion[version.id]), ["AI/ML Music"]);
  assert.equal(artistTools.autofillBalladArtistLinks(["AI/ML Music"], [profile("AI/ML Music")], contract.balladArtistLinksForVersion(doc, version.id), doc.artistNamesReviewedByVersion[version.id]).length, 0);
});

test("legacy Ballad URLs preserve show destinations and discography searches", async () => {
  const page = load("src/app/radio/ballads/page.tsx", { "next/navigation": { redirect: href => { throw new Error(href); } }, "next/link": ({ href, children }) => React.createElement("a", { href }, children) });
  await assert.rejects(page.default({ searchParams: Promise.resolve({ show: "show-1" }) }), /radio\/archive\?view=shows&show=show-1#broadcast-ballad/);
  await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), /^Error: \/bnl\/music$/);
  await assert.rejects(page.default({ searchParams: Promise.resolve({ q: "AI/ML Music & light" }) }), /^Error: \/bnl\/music\?q=AI%2FML%20Music%20%26%20light$/);
});

const linkMock = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
test("discography presents released work and links to its show without exposing working drafts", async () => {
  const { store } = setup();
  let doc = draft(); doc.audio.push(audio); doc.versions[0].linerNotes = { ...notes, about: "A song about <night>" };
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  doc.versions.push({ ...version, id: "private-draft", title: "Unreleased title" });
  doc.presentation.credits = "Private credit edit";
  await store.saveBallad(doc, 0);
  const page = load("src/app/bnl/music/page.tsx", { "next/link": linkMock, "@/lib/bnl-ballads-store": store });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  for (const text of [version.title, version.style, "1 released song", "BNL-01", "A song about &lt;night&gt;", "BNL’s creative notes"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('id="release-show-1"'));
  assert.ok(html.includes('href="/radio/archive?view=shows&amp;show=show-1#broadcast-ballad"'));
  assert.equal(html.includes("<audio"), false);
  assert.equal(html.includes("Unreleased title"), false);
  assert.equal(html.includes("Private credit edit"), false);
  assert.equal(html.includes("private.blob"), false);
  assert.equal(html.includes("Original output"), false);
});

test("discography sorts publication dates and searches released names and sound", () => {
  const { BNLDiscography } = load("src/components/BNLDiscography.tsx", { "next/link": linkMock });
  let doc = draft(); doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  const older = { ...contract.publicBallad(doc, show), publishedAt: "2026-09-12T03:00:00Z" };
  const newer = { ...older, show: { ...show, sessionId: "second-show" }, version: { ...older.version, title: "Second release", style: "Industrial swing" }, artistLinks: [{ name: "AI/ML Music", ...profile("AI/ML Music") }], publishedAt: "2026-09-17T03:00:00Z" };
  const render = query => renderToStaticMarkup(React.createElement(BNLDiscography, { releases: [older, newer], query }));
  assert.ok(render("").indexOf("Second release") < render("").indexOf(version.title));
  for (const query of ["industrial", "AI/ML Music"]) {
    assert.ok(render(query).includes("Second release"));
    assert.equal(render(query).includes(version.title), false);
  }
  assert.ok(render("no such title").includes("No releases match"));
});

test("discography distinguishes unavailable catalog from no released songs", async () => {
  for (const unavailable of [false, true]) {
    const page = load("src/app/bnl/music/page.tsx", { "next/link": linkMock, "@/lib/bnl-ballads-store": { listPublicBallads: async () => { if (unavailable) throw new Error("storage unavailable"); return []; } } });
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
    assert.equal(html.includes("temporarily unavailable"), unavailable);
    assert.equal(html.includes("No songs have been published yet"), !unavailable);
    assert.equal(html.includes("0 released songs"), !unavailable);
  }
});

test("show card has a directly visible Play control for the shared player and its discography link", () => {
  let doc = draft(); doc.audio.push(audio);
  doc = contract.publishBallad(contract.selectBalladAudio(doc, audio.id));
  const { BroadcastBallad } = load("src/components/BroadcastBallad.tsx", { "next/link": linkMock });
  const html = renderToStaticMarkup(React.createElement(BroadcastBallad, { ballad: contract.publicBallad(doc, show) }));
  assert.ok(html.indexOf("Play song") < html.indexOf("<details"));
  assert.ok(html.includes('href="/bnl/music?release=show-1#release-show-1"'));
  assert.ok(html.includes(`aria-label="Play ${version.title}"`));
  assert.equal((html.match(/<audio/g) ?? []).length, 0);
});
