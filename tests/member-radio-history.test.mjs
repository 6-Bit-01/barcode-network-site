import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

Module._extensions[".ts"] = function (module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename }).outputText, filename);
};
const history = createRequire(import.meta.url)("../src/lib/member-radio-history.ts");
const ref = (trackId) => ({ kind: "native", sessionId: "show", trackId, fingerprint: "a".repeat(64) });
const row = (trackId, extra = {}) => ({ reference: ref(trackId), key: `native:show:${trackId}`, source: "native", showLabel: "Radio", showDate: "2026-10-09", title: "Song", artist: "Same name", status: "active", airplay: "unknown", completion: "unknown", coverage: "native_show_record", currentShow: true, sessionId: "show", submissionMemberId: null, approvedArtistId: null, ...extra });
const context = (extra = {}) => ({ memberId: "member-one", activeArtistIds: ["artist-one"], approvedLegacyReferences: [], ...extra });

test("private history selects exact Member, approved Artist and exact current legacy proofs only", () => {
  const selected = row("legacy");
  const result = history.buildMemberQueueHistory(context({ approvedLegacyReferences: [{ id: "grant", artistId: "artist-one", reference: selected.reference }, { id: "stale", artistId: "artist-one", reference: { ...ref("changed"), fingerprint: "b".repeat(64) } }] }), [row("own", { submissionMemberId: "member-one" }), row("artist", { approvedArtistId: "artist-one" }), selected, row("other", { submissionMemberId: "member-two" }), row("changed"), row("revoked", { approvedArtistId: "artist-two" })]);
  assert.deepEqual(result.tracks.map(x => x.key).sort(), ["native:show:artist", "native:show:legacy", "native:show:own"]);
  assert.equal(result.totals.submitted, 3);
  assert.equal(result.currentShow.submitted, 3);
  assert.doesNotMatch(JSON.stringify(result), /member-one|artist-one|fingerprint|submissionMemberId|approvedArtistId/);
  assert.equal(history.buildMemberQueueHistory(context({ activeArtistIds: [] }), [row("revoked", { approvedArtistId: "artist-one" })]).tracks.length, 0);
});

test("history bounds only display rows, retains full totals and deduplicates proven native/historical identity", () => {
  const rows = Array.from({ length: 105 }, (_, i) => row(String(i), { submissionMemberId: "member-one", currentShow: false, status: i === 0 ? "unknown" : "finished" }));
  rows.push(row("duplicate", { source: "historical", reference: { kind: "historical", bundleDigest: "c".repeat(64), recoveryTrackId: "recovered" }, key: "historical:proof", dedupKey: "native:show:0", approvedArtistId: "artist-one", currentShow: false }));
  const result = history.buildMemberQueueHistory(context(), rows);
  assert.equal(result.totals.submitted, 105);
  assert.equal(result.totals.finished, 104);
  assert.equal(result.totals.unknown, 1);
  assert.equal(result.tracks.length, 100);
  assert.equal(result.truncated, true);
  assert.equal(result.currentShow, null);
});

test("fingerprint survives lifecycle and restore but invalidates source, credit and session reclassification", () => {
  const session = { sessionId: "show", showDate: "2026-10-09", purpose: "live_broadcast" };
  const entry = { id: "track", artist: "Artist", title: "Song", link: "https://example.test/a", sourceType: "other" };
  const digest = history.memberNativeReferenceFingerprint(session, entry);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(history.memberNativeReferenceFingerprint({ ...session, status: "archived" }, { ...entry, playedAt: "now", status: "completed", playbackOutcome: "finished", createdAt: "restore-time" }), digest);
  for (const changed of [{ ...entry, link: "https://example.test/b" }, { ...entry, artistCredit: { primary: "Renamed", collaborators: [], original: "Artist", decision: "alias", source: "admin" } }]) assert.notEqual(history.memberNativeReferenceFingerprint(session, changed), digest);
  assert.notEqual(history.memberNativeReferenceFingerprint({ ...session, purpose: "rehearsal" }, entry), digest);
  assert.notEqual(history.memberNativeReferenceFingerprint({ ...session, showDate: "2026-10-08" }, entry), digest);
  assert.notEqual(history.memberNativeReferenceFingerprint({ ...session, historicalRecoveryProvenance: { sourceSessionId: "original", canonicalShowDate: session.showDate, sourceResponseSha256: "a".repeat(64), sourceDigest: "b".repeat(64) } }, entry), digest);
});

test("references reject malformed, extra-key, uppercase and ambiguous proofs", () => {
  assert.equal(history.isMemberArtistReference(ref("one")), true);
  assert.equal(history.isMemberArtistReference({ kind: "historical", bundleDigest: "b".repeat(64), recoveryTrackId: "legacy.show:track-1" }), true);
  for (const candidate of [{ ...ref("one"), memberId: "forged" }, { ...ref("one"), fingerprint: "A".repeat(64) }, { kind: "native", sessionId: "show", trackId: "one" }, { kind: "historical", bundleDigest: "b".repeat(64), recoveryTrackId: "" }]) assert.equal(history.isMemberArtistReference(candidate), false);
});

test("an eligible current broadcast shows zero private counts before the Member submits", () => {
  const currentShow = { sessionId: "active-show", label: "Current Radio", date: "2026-10-09" };
  const result = history.buildMemberQueueHistory(context(), [], currentShow);
  assert.deepEqual(result.currentShow, { ...currentShow, submitted: 0, finished: 0, skipped: 0, removed: 0, active: 0, unknown: 0 });
  assert.equal(history.buildMemberQueueHistory(context(), [], null).currentShow, null);
});
