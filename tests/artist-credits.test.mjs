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

const credits = require("../src/lib/artist-credits.ts");
const ballads = require("../src/lib/bnl-ballad-artists.ts");
const profile = name => ({ projectKey: name.toLowerCase(), projectLabel: name });

test("collaboration suggestions cover word and symbol markers but keep untouched full names", () => {
  for (const marker of ["feat", "FEAT.", "featuring", "ft", "ft.", "x", "X", "and", "&", "+", "×", "also", "with", "w/", "vs.", "alongside", "collab with", "/"]) {
    assert.deepEqual(credits.suggestCreditSplit(`SKELLA ${marker} EXIDA`), { primary: "SKELLA", collaborators: ["EXIDA"] }, marker);
  }
  assert.deepEqual(credits.suggestCreditSplit("SKELLA (feat. EXIDA)"), { primary: "SKELLA", collaborators: ["EXIDA"] });
  for (const name of ["AI/ML Music", "AC/DC", "The xx", "Alex", "Anderson", "SKELLA x"]) assert.equal(credits.suggestCreditSplit(name), null, name);
  assert.equal(credits.moveCreditSuggestion("SKELLA x EXIDA", "A".repeat(200)), null, "a move cannot truncate existing or added credits");
  assert.deepEqual(credits.moveCreditSuggestion("SKELLA x EXIDA", "Guest, exida"), { artist: "SKELLA", collaboratorNames: "Guest, EXIDA" });
});

test("complete names and explicit credits win; known primary evidence suggests legacy splits", () => {
  const six = { artist: "6" };
  const combined = { artist: "6 X Bit" };
  assert.equal(credits.artistCreditResolver([combined])(combined).primary, "6 X Bit");
  assert.deepEqual(credits.artistCreditResolver([six, combined])(combined), { primary: "6", collaborators: ["Bit"], original: "6 X Bit", decision: "split", source: "inferred" });
  const keep = { artist: "6 X Bit", artistCredit: { primary: "6 X Bit", original: "6 X Bit", collaborators: [], decision: "whole", source: "submitter" } };
  assert.equal(credits.artistCreditResolver([six, keep, combined])(combined).primary, "6 X Bit");
  const explicit = { artist: "6 X Bit", collaboratorNames: "Guest" };
  assert.equal(credits.artistCreditResolver([six, explicit])(explicit).primary, "6 X Bit");
});

test("AI/ML Music stays one Ballad name; autofill preserves saved tags and declined matches", () => {
  const profiles = [profile("AI/ML Music"), profile("SKELLA"), profile("LostMarbles")];
  const names = ballads.suggestedBalladNames("AI/ML Music — brought the groove; Skella — a new song.", profiles);
  assert.ok(names.includes("AI/ML Music"));
  assert.ok(!names.includes("AI") && !names.includes("ML Music"));
  const links = ballads.autofillBalladArtistLinks(names, profiles, []);
  assert.equal(links.find(link => link.name === "AI/ML Music").projectKey, "ai/ml music");
  assert.equal(ballads.autofillBalladArtistLinks(["SKELLA"], profiles, [], ["SKELLA"]).length, 0);
  const saved = [{ name: "SKELLA", ...profile("LostMarbles") }];
  assert.deepEqual(ballads.autofillBalladArtistLinks(["SKELLA"], profiles, saved), saved);
  assert.equal(ballads.autofillBalladArtistLinks(["Ash"], [profile("Ash Flowers"), profile("Ash Grey")], []).length, 0);
  assert.equal(ballads.normalizeBalladArtistLinks([{ name: "AI/ML Music", ...profile("AI/ML Music") }]).length, 1);
});

async function fresh(purpose = "live_broadcast") {
  const state = await queue.getRadioQueueState();
  if (state.session.status !== "archived") await queue.archiveCurrentQueueSession();
  await queue.startNewQueueSession({ purpose, showDate: "2026-09-17", bnlPublicationStatus: purpose === "live_broadcast" ? "public_copy_approved" : "private", submissionCooldownSeconds: 0 });
  return (await queue.getRadioQueueState()).session.sessionId;
}
let sequence = 0;
async function add(artist, extra = {}) {
  const id = `credit-test-${++sequence}`;
  return queue.addToQueue({ id, artist, title: id, sourceType: "other", link: `https://example.test/${id}`, tiktokHandle: `@test${sequence}`, lane: "regular", tier: "free", amount: 0, status: "queued", createdAt: new Date().toISOString(), ...extra });
}

test("primary acceptance creates a card; features do not; playback remains separately evidenced", async () => {
  await fresh();
  await add("SKELLA");
  await add("AI/ML Music");
  const collaboration = await add("SKELLA x EXIDA");
  await queue.updateRadioTrack(collaboration.id, "load"); await queue.updateRadioTrack(collaboration.id, "finish");
  await queue.archiveCurrentQueueSession();
  const stats = await queue.getPublicQueueStats(null, true);
  const skella = stats.artists.find(artist => artist.projectKey === "skella");
  assert.equal(skella.acceptedSubmissionCount, 2);
  assert.equal(skella.tracks.length, 1);
  assert.equal(skella.tracks[0].collaboratorNames, "EXIDA");
  assert.equal(skella.tracks[0].featuredArtists[0].projectKey, null);
  assert.ok(!stats.artists.some(artist => artist.projectKey === "exida" || artist.projectKey === "skella x exida"));
  assert.equal(stats.artists.find(artist => artist.projectKey === "ai/ml music").tracks.length, 0);
  await fresh("rehearsal"); await add("Private Artist");
  assert.ok(!(await queue.getPublicQueueStats(null, true)).artists.some(artist => artist.projectLabel === "Private Artist"));
  assert.equal(queue.buildQueuePublicStats({ revision: 1, sessions: [] }, {}).artists.length, 0);
});

test("admin credit corrections use revisions, preserve originals and undo without mutating playback", async () => {
  const sessionId = await fresh();
  const entry = await add("6 X Bit");
  let review = await queue.getQueueArtistCreditReview();
  const before = (await queue.getRadioQueueState()).queue.find(row => row.id === entry.id);
  const change = { revision: review.revision, sessionId, trackId: entry.id, primary: "6", collaborators: "Bit", decision: "split" };
  await queue.correctQueueArtistCredit(change);
  await assert.rejects(queue.correctQueueArtistCredit(change), /queue changed/);
  let after = (await queue.getRadioQueueState()).queue.find(row => row.id === entry.id);
  assert.equal(after.artist, before.artist);
  assert.equal(after.submittedArtistName, before.submittedArtistName);
  for (const key of ["status", "lane", "amount", "playedAt", "link", "tiktokHandle"]) assert.deepEqual(after[key], before[key], key);
  assert.equal(after.artistCredit.primary, "6");
  review = await queue.getQueueArtistCreditReview();
  await queue.correctQueueArtistCredit({ revision: review.revision, sessionId, trackId: entry.id, undo: true });
  after = (await queue.getRadioQueueState()).queue.find(row => row.id === entry.id);
  assert.equal(after.artistCredit, null);
  assert.equal(after.artistCreditHistory.length, 2);
  const privateId = await fresh("rehearsal"); const privateTrack = await add("Private correction");
  review = await queue.getQueueArtistCreditReview();
  await assert.rejects(queue.correctQueueArtistCredit({ ...change, revision: review.revision, sessionId: privateId, trackId: privateTrack.id }), /public submission/);
});

test("credit correction API is authenticated before exposing or mutating the catalog", async () => {
  const route = require("../src/app/api/admin/queue/artist-credits/route.ts");
  assert.equal((await route.GET(new Request("https://example.test/api/admin/queue/artist-credits"))).status, 401);
  assert.equal((await route.POST(new Request("https://example.test/api/admin/queue/artist-credits", { method: "POST", body: "{}" }))).status, 401);
});

test("alias corrections preserve original links and batch undo restores every affected submission", async () => {
  const sessionId = await fresh();
  const first = await add("Lost Marbles"); const second = await add("Lost Marbles");
  let review = await queue.getQueueArtistCreditReview();
  await queue.correctQueueArtistCredit({ revision: review.revision, sessionId, trackId: first.id, primary: "LostMarbles", collaborators: "", decision: "alias", applyToMatching: true });
  const stats = await queue.getPublicQueueStats(null, true);
  const artist = stats.artists.find(row => row.projectKey === "lostmarbles");
  assert.ok(artist.aliases.includes("Lost Marbles"));
  assert.equal(artist.acceptedSubmissionCount, 2);
  review = await queue.getQueueArtistCreditReview();
  const result = await queue.correctQueueArtistCredit({ revision: review.revision, sessionId, trackId: first.id, undo: true });
  assert.equal(result.changed, 2);
  const rows = (await queue.getRadioQueueState()).queue;
  for (const id of [first.id, second.id]) assert.equal(rows.find(row => row.id === id).artistCredit, null);
});

test("a keep-whole decision and conflicting alias targets prevent silent global merging", () => {
  const alias = (primary) => ({ artist: "Odd Name", artistCredit: { original: "Odd Name", primary, collaborators: [], decision: "alias", source: "admin" } });
  const untouched = { artist: "Odd Name" };
  assert.equal(credits.artistCreditResolver([alias("Other"), alias("Different"), untouched])(untouched).primary, "Odd Name");
  const keep = { artist: "Odd Name", artistCredit: { original: "Odd Name", primary: "Odd Name", collaborators: [], decision: "whole", source: "admin" } };
  assert.equal(credits.artistCreditResolver([alias("Other"), keep, untouched])(untouched).primary, "Odd Name");
});

test("artist links resolve retired labels without hijacking an existing exact card", () => {
  const { resolveArchiveArtist } = require("../src/lib/broadcast-archive.ts");
  const old = { projectKey: "old", aliases: ["New"] };
  const current = { projectKey: "new", aliases: ["Old spelling"] };
  assert.equal(resolveArchiveArtist([old, current], "New"), current);
  assert.equal(resolveArchiveArtist([old], "New"), old);
  assert.equal(resolveArchiveArtist([old, { projectKey: "different", aliases: ["New"] }], "New"), undefined);
});

test("submitted credit choices retain original wording without trusting client authority", async () => {
  const track = await queue.createQueueTrack({ artist: "SKELLA", title: "Test", tiktokHandle: "@test", sourceType: "upload", fileUrl: "https://private.test/file.mp3", fileName: "test.mp3", collaboratorNames: "EXIDA", artistCreditDecision: "split", originalArtistName: "SKELLA x EXIDA" });
  assert.equal(track.artistCredit.original, "SKELLA x EXIDA");
  assert.equal(track.artistCredit.source, "submitter");
  assert.deepEqual(track.artistCredit.collaborators, ["EXIDA"]);
  assert.equal(track.submittedArtistName, "SKELLA");
});
