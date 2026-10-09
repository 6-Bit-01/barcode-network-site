import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "QUEUE_REDIS_REST_URL", "QUEUE_REDIS_REST_TOKEN", "BLOB_READ_WRITE_TOKEN", "QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN", "VERCEL"]) delete process.env[key];
process.env.BARCODE_QUEUE_PRODUCTION_ENABLED = "true";
process.env.BARCODE_QUEUE_SUBMITTER_EDITING_ENABLED = "true";
const root = path.resolve(import.meta.dirname, "..");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...args) { return resolve.call(this, request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request, parent, ...args); };
Module._extensions[".ts"] = function (module, filename) { module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename); };
const require = createRequire(import.meta.url);
const repository = require("../src/lib/queue-historical-evidence-repository.ts");
let ledgers = [];
repository.auditQueueHistoricalEvidenceChain = async () => ({ entries: ledgers.map(ledger => ({ ledger })) });
const queue = require("../src/lib/queue.ts");
let sequence = 0;
const member = "member-provenance-private", artist = "artist-provenance-private";
const context = (extra = {}) => ({ memberId: member, activeArtistIds: [artist], approvedLegacyReferences: [], ...extra });
async function fresh(purpose = "live_broadcast", extra = {}) {
  const state = await queue.getRadioQueueState();
  if (state.session.status !== "archived") await queue.archiveCurrentQueueSession();
  return (await queue.startNewQueueSession({ purpose, submissionCooldownSeconds: 0, ...extra })).session.sessionId;
}
async function add(extra = {}) {
  sequence++;
  return queue.addToQueue({ artist: `Artist ${sequence}`, title: `Song ${sequence}`, link: `https://example.test/${sequence}`, tier: "free", amount: 0, stripeSessionId: null, createdAt: new Date().toISOString(), tiktokHandle: `handle_${sequence}`, sourceType: "other", submissionMemberId: member, approvedArtistId: artist, approvedArtistLinkRevision: 4, submissionOwnerHash: "d".repeat(64), ...extra });
}

test("trusted provenance is normalized, preserved through lifecycle, isolated from browser edit authority and public/BNL DTOs", async () => {
  const sessionId = await fresh("live_broadcast", { bnlPublicationStatus: "public_copy_approved" });
  const created = await queue.createQueueTrack({ artist: "Provenance", title: "Song", tiktokHandle: "provenance", sourceType: "upload", fileUrl: "https://example.test/private", submissionMemberId: member, approvedArtistId: artist, approvedArtistLinkRevision: 4 });
  assert.equal(created.submissionMemberId, member);
  assert.equal(created.approvedArtistId, artist);
  const track = await add();
  const malformed = await add({ submissionMemberId: "bad id", approvedArtistId: "bad artist", approvedArtistLinkRevision: -1 });
  assert.equal(malformed.submissionMemberId, null);
  assert.equal(malformed.approvedArtistId, null);
  assert.equal(malformed.approvedArtistLinkRevision, null);
  const invalidApproval = await add({ approvedArtistLinkRevision: -1 });
  assert.equal(invalidApproval.approvedArtistId, null);
  const candidates = await queue.getOwnerQueueAssociationCandidates({ source: "native" });
  const reference = candidates.candidates.find(item => item.reference.trackId === track.id).reference;
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), true);
  let history = await queue.getMemberQueueHistory(context());
  assert.equal(history.tracks.filter(item => item.key.endsWith(track.id)).length, 1);
  await assert.rejects(queue.getQueueReplacementTarget({ sessionId, trackId: track.id, ownerHash: "e".repeat(64), expectedRevision: 0 }), /browser cannot edit/);
  await queue.updateRadioTrack(track.id, "remove");
  assert.equal((await queue.getMemberQueueHistory(context())).tracks.find(item => item.key.endsWith(track.id)).status, "removed");
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), true);
  await queue.updateRadioTrack(track.id, "restore");
  await queue.archiveCurrentQueueSession();
  history = await queue.getMemberQueueHistory(context());
  assert.equal(history.tracks.find(item => item.key.endsWith(track.id)).currentShow, false);
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), true);
  const readModel = require("../src/app/api/bnl/read-model/route.ts");
  const response = await readModel.GET(new Request("https://example.test/api/bnl/read-model"));
  const publicValues = [queue.toPublicQueueTrack(track), await queue.getPublicQueueSnapshot(sessionId), await queue.getPublicQueueStats(), await queue.getQueueBnlReadProjections("public"), await queue.getQueueSessionShowLog(sessionId), await response.json()];
  assert.doesNotMatch(JSON.stringify(publicValues), /member-provenance-private|artist-provenance-private|submissionMemberId|approvedArtistId|approvedArtistLinkRevision/);
});

test("credit corrections and reclassification invalidate exact legacy proofs and Artist catalog labels stay current", async () => {
  const sessionId = await fresh();
  const track = await add({ submissionMemberId: null, approvedArtistId: null, approvedArtistLinkRevision: null });
  const candidates = await queue.getOwnerQueueAssociationCandidates({ source: "native" });
  const reference = candidates.candidates.find(item => item.reference.trackId === track.id).reference;
  assert.equal((await queue.getMemberQueueHistory(context({ approvedLegacyReferences: [{ id: "legacy", artistId: artist, reference }] }))).tracks.some(item => item.key.endsWith(track.id)), true);
  const review = await queue.getQueueArtistCreditReview();
  await queue.correctQueueArtistCredit({ revision: review.revision, sessionId, trackId: track.id, primary: "Renamed project", collaborators: "", decision: "alias" });
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), false);
  assert.equal(await queue.validateMemberQueueArtistProjectKey("renamed project"), true);
  assert.equal(await queue.validateMemberQueueArtistProjectKey("RENAMED PROJECT"), false);
  assert.deepEqual(await queue.getMemberQueueArtistLabels(["renamed project", "absent"]), [{ projectKey: "renamed project", projectLabel: "Renamed project", archiveAvailable: true }, { projectKey: "absent", projectLabel: null, archiveAvailable: false }]);
  const revised = (await queue.getOwnerQueueAssociationCandidates({ source: "native" })).candidates.find(item => item.reference.trackId === track.id).reference;
  await queue.updateQueueSessionProvenance({ sessionId, purpose: "rehearsal", bnlPublicationStatus: "private" });
  assert.equal(await queue.validateMemberQueueHistoryReference(revised), false);
  assert.equal((await queue.getMemberQueueHistory(context())).tracks.some(item => item.key.endsWith(track.id)), false);
});

test("historical history requires exact Owner approval, accepted verified evidence and preserves partial/unknown outcomes", async () => {
  await fresh("rehearsal");
  await add();
  const bundleDigest = "a".repeat(64);
  ledgers = [{ bundleDigest, canonicalShowDate: "2026-08-07", sourceSessionId: "legacy-show", completeness: "partial", tracks: [
    { recoveryTrackId: "verified", acceptanceState: "accepted_confirmed", identityState: "verified", publicArtistCredit: "Historical Artist", title: "Historical Song", administrativeOutcome: "marked_played", airplayState: "unknown", completionExtent: "unknown", originalTrackId: null },
    { recoveryTrackId: "partial", acceptanceState: "accepted_confirmed", identityState: "partial", submittedArtistName: "Do not guess", title: "Unresolved" },
    { recoveryTrackId: "candidate", acceptanceState: "candidate_only", identityState: "verified", submittedArtistName: "Unaccepted", title: "Candidate" },
  ] }];
  const candidateRows = await queue.getOwnerQueueAssociationCandidates({ source: "historical" });
  assert.equal(candidateRows.candidates.length, 1);
  const reference = candidateRows.candidates[0].reference;
  process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN = "synthetic-history-token";
  const publicBefore = await queue.getPublicQueueStats();
  assert.equal(await queue.validateMemberQueueArtistProjectKey("historical artist"), true);
  assert.deepEqual((await queue.getOwnerQueueArtistCatalog({ query: "historical artist" })).artists, [{ projectKey: "historical artist", projectLabel: "Historical Artist" }]);
  assert.deepEqual(await queue.getMemberQueueArtistLabels(["historical artist"]), [{ projectKey: "historical artist", projectLabel: "Historical Artist", archiveAvailable: false }]);
  assert.deepEqual((await queue.getPublicQueueStats()).artists, publicBefore.artists);
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), true);
  assert.equal((await queue.getMemberQueueHistory(context())).tracks.some(item => item.source === "historical"), false);
  const result = await queue.getMemberQueueHistory(context({ approvedLegacyReferences: [{ id: "owner-approval", artistId: artist, reference }] }));
  const historical = result.tracks.filter(item => item.source === "historical");
  assert.equal(historical.length, 1);
  assert.equal(historical[0].showDate, "2026-08-07");
  assert.equal(historical[0].status, "unknown");
  assert.equal(historical[0].airplay, "unknown");
  assert.equal(historical[0].completion, "unknown");
  assert.equal(historical[0].coverage, "partial");
  assert.equal((await queue.getMemberQueueHistory(context({ activeArtistIds: [], approvedLegacyReferences: [{ id: "owner-approval", artistId: artist, reference }] }))).tracks.some(item => item.source === "historical"), false);
  ledgers.push({ ...ledgers[0], bundleDigest: "b".repeat(64), tracks: [{ ...ledgers[0].tracks[0], identityState: "partial" }] });
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), false);
  assert.equal(await queue.validateMemberQueueArtistProjectKey("historical artist"), false);
  assert.equal((await queue.getMemberQueueHistory(context({ approvedLegacyReferences: [{ id: "owner-approval", artistId: artist, reference }] }))).tracks.some(item => item.source === "historical"), false);
  ledgers = [];
  delete process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  assert.equal(await queue.validateMemberQueueHistoryReference(reference), false);
});

test("Member identity resolves after metadata creation and non-live admission clears provenance", async () => {
  let calls = 0;
  const options = { resolveMemberIdentity: async () => { calls++; return { submissionMemberId: member, approvedArtistId: artist, approvedArtistLinkRevision: 9 }; } };
  await assert.rejects(queue.submitRadioTrack({ artist: "Invalid", title: "Song", tiktokHandle: "", sourceType: "upload" }, options), /TikTok handle/);
  assert.equal(calls, 0);
  const sessionId = await fresh();
  await queue.setQueueOpen(true);
  const accepted = await queue.submitRadioTrack({ sessionId, artist: "Hook Artist", title: "Hook Song", tiktokHandle: "hook_artist", sourceType: "upload", fileUrl: "https://example.test/hook-file", submissionMemberId: "stale-member" }, options);
  assert.equal(calls, 1);
  assert.equal(accepted.submissionMemberId, member);
  assert.equal(accepted.approvedArtistLinkRevision, 9);
  const rehearsalId = await fresh();
  await queue.setQueueOpen(true);
  const rehearsal = await queue.submitRadioTrack({ sessionId: rehearsalId, artist: "Private Hook Artist", title: "Private Hook Song", tiktokHandle: "private_hook", sourceType: "upload", fileUrl: "https://example.test/private-hook" }, {
    resolveMemberIdentity: async () => { await queue.updateQueueSessionProvenance({ sessionId: rehearsalId, purpose: "rehearsal", bnlPublicationStatus: "private" }); return { submissionMemberId: member, approvedArtistId: artist, approvedArtistLinkRevision: 9 }; },
  });
  assert.equal(rehearsal.submissionMemberId, null);
  assert.equal(rehearsal.approvedArtistId, null);
  assert.equal(rehearsal.approvedArtistLinkRevision, null);
});

test("review pagination is bounded and tied to the filtered exact source set", async () => {
  await fresh();
  const before = await queue.getMemberQueueHistory({ memberId: "empty-member", activeArtistIds: [], approvedLegacyReferences: [] });
  assert.equal(before.currentShow.submitted, 0);
  await add({ title: "Paged proof one" });
  await add({ title: "Paged proof two" });
  const first = await queue.getOwnerQueueAssociationCandidates({ source: "all", query: "Paged proof", limit: 1 });
  assert.equal(first.candidates.length, 1);
  assert.ok(first.nextCursor);
  const second = await queue.getOwnerQueueAssociationCandidates({ source: "all", query: "Paged proof", limit: 1, cursor: first.nextCursor });
  assert.equal(second.candidates.length, 1);
  assert.notDeepEqual(second.candidates[0].reference, first.candidates[0].reference);
  assert.equal(second.nextCursor, null);
  await assert.rejects(queue.getOwnerQueueAssociationCandidates({ source: "all", query: "another query", limit: 1, cursor: first.nextCursor }), /review changed/);
  await assert.rejects(queue.getOwnerQueueAssociationCandidates({ limit: 51 }), /Invalid history review query/);
});

test("the historical capture import boundary strips forged account provenance without touching durable normalization", () => {
  // Exercise the real private parser used by projectionEntries/optionalProjectionEntry.
  // Export it only inside this in-memory test module; no source/runtime API is added.
  const filename = path.join(root, "src/lib/queue.ts");
  const parserModule = new Module(filename);
  parserModule.filename = filename;
  parserModule.paths = Module._nodeModulePaths(path.dirname(filename));
  parserModule._compile(ts.transpileModule(fs.readFileSync(filename, "utf8") + "\nexport { projectionEntry };", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
  const result = parserModule.exports.projectionEntry({ id: "imported", artist: "Old Artist", title: "Old Song", link: "https://example.test/old", createdAt: "2026-08-07T20:00:00.000Z", submissionMemberId: member, approvedArtistId: artist, approvedArtistLinkRevision: 99 }, "capture.queue[0]");
  assert.equal(result.submissionMemberId, null);
  assert.equal(result.approvedArtistId, null);
  assert.equal(result.approvedArtistLinkRevision, null);
  assert.equal(result.id, "imported");
  assert.equal(result.link, "https://example.test/old");
});

test("optional historical display labels cannot block native Member history, while historical authority fails closed", async () => {
  await fresh();
  const track = await add({ artist: "Native label during outage" });
  const auditBefore = repository.auditQueueHistoricalEvidenceChain;
  let audits = 0;
  repository.auditQueueHistoricalEvidenceChain = async () => { audits++; throw new Error("Synthetic ledger outage"); };
  process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN = "synthetic-history-token";
  try {
    assert.deepEqual(await queue.getMemberQueueArtistLabels([]), []);
    assert.equal(audits, 0);
    assert.deepEqual(await queue.getMemberQueueArtistLabels(["native label during outage"]), [{ projectKey: "native label during outage", projectLabel: "Native label during outage", archiveAvailable: true }]);
    assert.equal(audits, 0);
    assert.deepEqual(await queue.getMemberQueueArtistLabels(["native label during outage", "missing historical label"]), [{ projectKey: "native label during outage", projectLabel: "Native label during outage", archiveAvailable: true }, { projectKey: "missing historical label", projectLabel: null, archiveAvailable: false }]);
    assert.equal(audits, 1);
    assert.ok((await queue.getMemberQueueHistory(context())).tracks.some(row => row.key.endsWith(track.id)));
    await assert.rejects(queue.getOwnerQueueArtistCatalog(), /Synthetic ledger outage/);
    await assert.rejects(queue.getMemberQueueHistory(context({ approvedLegacyReferences: [{ id: "legacy", artistId: artist, reference: { kind: "historical", bundleDigest: "a".repeat(64), recoveryTrackId: "legacy-track" } }] })), /Synthetic ledger outage/);
  } finally {
    repository.auditQueueHistoricalEvidenceChain = auditBefore;
    delete process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  }
});

test("existing long whole Artist labels use the shared 512-character project-key contract", async () => {
  await fresh();
  const label = `Long whole ${"a".repeat(250)}`;
  const key = label.toLowerCase();
  await add({ artist: label });
  assert.equal(await queue.validateMemberQueueArtistProjectKey(key), true);
  assert.deepEqual(await queue.getMemberQueueArtistLabels([key]), [{ projectKey: key, projectLabel: label, archiveAvailable: true }]);
  await assert.rejects(queue.getMemberQueueArtistLabels(["x".repeat(513)]), /Invalid Artist label request/);
  assert.equal(await queue.validateMemberQueueArtistProjectKey("x".repeat(513)), false);
});
