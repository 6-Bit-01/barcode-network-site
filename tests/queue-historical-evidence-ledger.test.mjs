import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import test from "node:test";

let typescript = null;
try {
  const importedTypeScript = await import("typescript");
  typescript = importedTypeScript.default ?? importedTypeScript;
} catch {
  // Node 24's built-in type stripper keeps this incident test runnable in a
  // production-dependency-only checkout.
}
const require = createRequire(import.meta.url);

Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  let outputText;
  if (typescript) {
    outputText = typescript.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: typescript.ModuleKind.CommonJS,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText;
  } else {
    assert.equal(typeof Module.stripTypeScriptTypes, "function", "TypeScript or Node's type stripper is required");
    outputText = Module.stripTypeScriptTypes(source, { mode: "transform" })
      .replace(/^import \{ ([^}]+) \} from "([^"]+)";$/gm, 'const { $1 } = require("$2");')
      .replace(/^export const (\w+) =/gm, "const $1 =")
      .replace(/^export function (\w+)\b/gm, "function $1");
    outputText += `\nmodule.exports = {
      QUEUE_HISTORICAL_EVIDENCE_SCHEMA,
      deriveQueueHistoricalEvidenceCoverage,
      canonicalQueueHistoricalEvidenceJson,
      computeQueueHistoricalEvidenceBundleDigest,
      assertQueueRecoveryEvidenceHashes,
      sealQueueHistoricalEvidenceLedger,
      validateQueueHistoricalEvidenceLedger,
    };\n`;
  }
  module._compile(outputText, filename);
};

const ledger = require("../src/lib/queue-historical-evidence-ledger.ts");
const ZERO_HASH = "0".repeat(64);
const ONE_HASH = "1".repeat(64);

function source(overrides = {}) {
  return {
    evidenceId: "vercel-aggregate",
    kind: "vercel_log_aggregate",
    sha256: ZERO_HASH,
    recordLocator: "private/recovery/aug14-44-accepted-4-cooldown.json",
    privacy: "sanitized",
    observedAt: "2026-08-15T03:02:39.832Z",
    canonicalShowDate: "2026-08-14",
    coverage: "not_applicable",
    ...overrides,
  };
}

function track(index, overrides = {}) {
  return {
    recoveryTrackId: `recovery-track-${index}`,
    originalTrackId: `q-original-${index}`,
    acceptanceState: "candidate_only",
    identityState: "partial",
    submittedArtistName: `Artist ${index}`,
    publicArtistCredit: `Artist ${index}`,
    title: `Track ${index}`,
    tiktokHandle: null,
    submittedAt: `2026-08-15T01:${String(index).padStart(2, "0")}:00.000Z`,
    sourceType: "link",
    exactSourceUrl: `https://example.invalid/tracks/${index}`,
    privateBlobPathname: null,
    sourceHost: "example.invalid",
    uploadExtension: null,
    sourceLane: "regular",
    administrativeOutcome: "unknown",
    airplayState: "unknown",
    completionExtent: "unknown",
    evidenceIds: ["vercel-aggregate"],
    fieldEvidence: {
      acceptanceState: ["vercel-aggregate"],
      identityState: ["vercel-aggregate"],
      submittedArtistName: ["vercel-aggregate"],
      title: ["vercel-aggregate"],
    },
    ...overrides,
  };
}

function rowEvent(index, result = "accepted") {
  return {
    requestId: `aug14-request-${index}`,
    occurredAt: `2026-08-15T01:${String(index).padStart(2, "0")}:00.000Z`,
    httpStatus: result === "accepted" ? 201 : 429,
    result,
    evidenceId: "vercel-runtime-logs",
  };
}

function draft(overrides = {}) {
  const tracks = overrides.tracks ?? [];
  const acceptance = overrides.acceptance ?? {
    mode: "aggregate",
    acceptedRequestCount: 44,
    rejectedCooldownRequestCount: 4,
    acceptedEvidenceIds: ["vercel-aggregate"],
    rejectedCooldownEvidenceIds: ["vercel-aggregate"],
    events: [],
  };
  return {
    schema: ledger.QUEUE_HISTORICAL_EVIDENCE_SCHEMA,
    previousBundleDigest: null,
    canonicalShowDate: "2026-08-14",
    sourceSessionId: null,
    completeness: "partial",
    visibility: "admin_only",
    acceptance,
    sources: overrides.sources ?? [source()],
    tracks,
    candidates: overrides.candidates ?? [],
    coverage: overrides.coverage ?? ledger.deriveQueueHistoricalEvidenceCoverage(acceptance, tracks),
    ...overrides,
  };
}

function clone(value) {
  return structuredClone(value);
}

test("seals the partial August 7 aggregate recovery without inventing row events or airplay", () => {
  const tracks = Array.from({ length: 41 }, (_, index) => track(index, {
    acceptanceState: "accepted_confirmed",
    submittedArtistName: index === 40 ? "MagicSZN" : `Artist ${index}`,
    publicArtistCredit: index === 40 ? "MagicSZN" : `Artist ${index}`,
    title: index === 40 ? "HighFive" : `Track ${index}`,
    identityState: "verified",
    submittedAt: `2026-08-08T01:${String(index).padStart(2, "0")}:00.000Z`,
    administrativeOutcome: index === 40 ? "removed" : "marked_played",
    evidenceIds: ["aug7-sanitized-csv"],
    fieldEvidence: {
      acceptanceState: ["aug7-sanitized-csv"],
      administrativeOutcome: ["aug7-sanitized-csv"],
      identityState: ["aug7-sanitized-csv"],
      submittedArtistName: ["aug7-sanitized-csv"],
      title: ["aug7-sanitized-csv"],
    },
  }));
  const acceptance = {
    mode: "aggregate",
    acceptedRequestCount: 41,
    rejectedCooldownRequestCount: 0,
    acceptedEvidenceIds: ["aug7-owner-export-digest", "aug7-sanitized-csv"],
    rejectedCooldownEvidenceIds: [],
    events: [],
  };
  const sealed = ledger.sealQueueHistoricalEvidenceLedger(draft({
    canonicalShowDate: "2026-08-07",
    sourceSessionId: "session_msjmzqjk_w1rkj",
    completeness: "partial",
    acceptance,
    sources: [
      source({
        evidenceId: "aug7-owner-export-digest",
        kind: "owner_export_digest",
        sha256: "49c950556a9662f98fa402beb84a7e579120afff8da9cc5c70077f4b46cd6c2e",
        recordLocator: "private/recovery/aug7-owner-export.sha256",
        canonicalShowDate: "2026-08-07",
      }),
      source({
        evidenceId: "aug7-sanitized-csv",
        kind: "sanitized_owner_export",
        sha256: "88f179aa453dec4bcb2e1101582b77f41ed63c6fda6bf94ac4e470518db216f4",
        recordLocator: "private/recovery/aug7-submissions-sanitized.csv",
        canonicalShowDate: "2026-08-07",
      }),
    ],
    tracks,
  }));
  const validated = ledger.validateQueueHistoricalEvidenceLedger(sealed);

  assert.match(validated.bundleDigest, /^[a-f0-9]{64}$/);
  assert.equal(validated.coverage.acceptedConfirmed, 41);
  assert.equal(validated.coverage.markedPlayed, 40);
  assert.equal(validated.coverage.removed, 1);
  assert.equal(validated.coverage.airplayPlayedConfirmed, 0);
  assert.equal(validated.coverage.airplayUnknown, 41);
  assert.equal(validated.coverage.completionFullConfirmed, 0);
  assert.equal(validated.coverage.completionPartialConfirmed, 0);
  assert.equal(validated.coverage.completionUnknown, 0);
  assert.equal(validated.tracks.every((item) => item.airplayState === "unknown"), true);
  assert.deepEqual(
    validated.tracks.filter((item) => item.administrativeOutcome === "removed").map((item) => [item.submittedArtistName, item.title]),
    [["MagicSZN", "HighFive"]],
  );
  assert.equal(validated.acceptance.mode, "aggregate");
  assert.equal(validated.acceptance.events.length, 0);
  assert.equal(validated.completeness, "partial");
});

test("supports the August 14 44/4 aggregate while keeping Blob uploads candidate-only", () => {
  const emptyCoverage = ledger.deriveQueueHistoricalEvidenceCoverage(
    { acceptedRequestCount: 44, rejectedCooldownRequestCount: 4 },
    [],
  );
  assert.deepEqual(emptyCoverage, {
    acceptedConfirmed: 0,
    rejectedCooldownRequests: 4,
    identitiesResolved: 0,
    identitiesUnresolved: 44,
    markedPlayed: 0,
    removed: 0,
    stillActive: 0,
    administrativeOutcomeUnknown: 44,
    airplayPlayedConfirmed: 0,
    airplayNotPlayedConfirmed: 0,
    airplayUnknown: 44,
    completionFullConfirmed: 0,
    completionPartialConfirmed: 0,
    completionUnknown: 0,
  });

  const sources = [
    source({ evidenceId: "vercel-aggregate", kind: "vercel_log_aggregate" }),
    source({ evidenceId: "blob-inventory", kind: "vercel_blob_inventory", privacy: "private" }),
  ];
  const tracks = [track(1, {
    recoveryTrackId: "candidate-track-1",
    originalTrackId: null,
    acceptanceState: "candidate_only",
    identityState: "partial",
    submittedArtistName: null,
    publicArtistCredit: null,
    title: "Filename-derived candidate",
    submittedAt: "2026-08-15T01:42:00.000Z",
    sourceType: "upload",
    exactSourceUrl: null,
    privateBlobPathname: "barcode-radio-queue/1786758120000-demo.mp3",
    sourceHost: null,
    uploadExtension: "mp3",
    administrativeOutcome: "unknown",
    evidenceIds: ["blob-inventory"],
    fieldEvidence: { privateBlobPathname: ["blob-inventory"] },
  })];
  const candidates = [{
    candidateId: "blob-candidate-1",
    kind: "blob_upload",
    observedAt: "2026-08-15T01:42:00.000Z",
    privateBlobPathname: "barcode-radio-queue/1786758120000-demo.mp3",
    candidateLabel: "demo.mp3",
    matchState: "unmatched",
    matchedRecoveryTrackId: null,
    evidenceIds: ["blob-inventory"],
  }];
  const sealed = ledger.sealQueueHistoricalEvidenceLedger(draft({ sources, tracks, candidates }));
  const validated = ledger.validateQueueHistoricalEvidenceLedger(sealed);

  assert.equal(validated.acceptance.acceptedRequestCount, 44);
  assert.equal(validated.acceptance.rejectedCooldownRequestCount, 4);
  assert.equal(validated.coverage.acceptedConfirmed, 0, "candidate_only records never count as accepted");
  assert.equal(validated.coverage.identitiesResolved, 0);
  assert.equal(validated.coverage.identitiesUnresolved, 44);
  assert.equal(validated.coverage.administrativeOutcomeUnknown, 44);
  assert.equal(validated.coverage.airplayUnknown, 44);

  const candidateOnlyCoverage = ledger.deriveQueueHistoricalEvidenceCoverage(
    { acceptedRequestCount: 44, rejectedCooldownRequestCount: 4 },
    [track(2, {
      acceptanceState: "candidate_only",
      administrativeOutcome: "marked_played",
      airplayState: "played_confirmed",
      completionExtent: "unknown",
    })],
  );
  assert.equal(candidateOnlyCoverage.acceptedConfirmed, 0);
  assert.equal(candidateOnlyCoverage.identitiesResolved, 0);
  assert.equal(candidateOnlyCoverage.identitiesUnresolved, 44);
  assert.equal(candidateOnlyCoverage.markedPlayed, 0);
  assert.equal(candidateOnlyCoverage.stillActive, 0);
  assert.equal(candidateOnlyCoverage.administrativeOutcomeUnknown, 44);
  assert.equal(candidateOnlyCoverage.airplayPlayedConfirmed, 0);
  assert.equal(candidateOnlyCoverage.airplayUnknown, 44);
  assert.equal(candidateOnlyCoverage.completionUnknown, 0);

  const falselyCounted = clone(sealed);
  falselyCounted.coverage.acceptedConfirmed = 1;
  assert.throws(() => ledger.validateQueueHistoricalEvidenceLedger(falselyCounted), /candidate_only|records prove 0/);
});

test("supports the August 14 44/4 row-level ledger and fails closed on count, status, and duplicate inconsistencies", () => {
  const acceptance = {
    mode: "row_level",
    acceptedRequestCount: 44,
    rejectedCooldownRequestCount: 4,
    acceptedEvidenceIds: ["vercel-runtime-logs"],
    rejectedCooldownEvidenceIds: ["vercel-runtime-logs"],
    events: [
      ...Array.from({ length: 44 }, (_, index) => rowEvent(index)),
      ...Array.from({ length: 4 }, (_, index) => rowEvent(index + 44, "rejected_cooldown")),
    ],
  };
  const valid = draft({
    acceptance,
    sources: [source({
      evidenceId: "vercel-runtime-logs",
      kind: "vercel_runtime_logs",
      recordLocator: "private/recovery/aug14-queue-posts-chronological.csv",
    })],
  });
  assert.doesNotThrow(() => ledger.sealQueueHistoricalEvidenceLedger(valid));

  const wrongCount = clone(valid);
  wrongCount.acceptance.acceptedRequestCount = 45;
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(wrongCount), /events prove 44/);

  const wrongStatus = clone(valid);
  wrongStatus.acceptance.events[0].httpStatus = 429;
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(wrongStatus), /inconsistent with result/);

  const duplicateRequest = clone(valid);
  duplicateRequest.acceptance.events[1].requestId = duplicateRequest.acceptance.events[0].requestId;
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(duplicateRequest), /duplicate identifier/);

  const noRows = clone(valid);
  noRows.acceptance.events = [];
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(noRows), /row_level accounting requires events/);
});

test("binds accepted and cooldown-rejected counts to distinct, capable evidence", () => {
  const unboundAccepted = draft();
  unboundAccepted.acceptance.acceptedEvidenceIds = [];
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(unboundAccepted), /acceptedEvidenceIds.*nonempty/);

  const unboundRejected = draft();
  unboundRejected.acceptance.rejectedCooldownEvidenceIds = [];
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(unboundRejected), /rejectedCooldownEvidenceIds.*nonempty/);

  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(draft({ sources: [] })), /references missing evidence/);

  const blobSource = source({
    evidenceId: "blob-inventory",
    kind: "vercel_blob_inventory",
    privacy: "private",
    recordLocator: "private/recovery/aug14-owned-blob-inventory.json",
  });
  const blobBackedCounts = draft({
    acceptance: {
      mode: "aggregate",
      acceptedRequestCount: 44,
      rejectedCooldownRequestCount: 4,
      acceptedEvidenceIds: ["blob-inventory"],
      rejectedCooldownEvidenceIds: ["blob-inventory"],
      events: [],
    },
    sources: [blobSource],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(blobBackedCounts), /cannot prove accepted-request accounting/);

  const stripeSource = source({
    evidenceId: "stripe-record",
    kind: "stripe_record",
    privacy: "private",
    recordLocator: "private/recovery/aug14-stripe-checkout-record.json",
  });
  const stripeOnlyAccepted = draft({
    acceptance: {
      mode: "aggregate",
      acceptedRequestCount: 44,
      rejectedCooldownRequestCount: 0,
      acceptedEvidenceIds: ["stripe-record"],
      rejectedCooldownEvidenceIds: [],
      events: [],
    },
    sources: [stripeSource],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(stripeOnlyAccepted), /cannot prove accepted-request accounting/);

  const stripeOnlyRejected = draft({
    acceptance: {
      mode: "aggregate",
      acceptedRequestCount: 44,
      rejectedCooldownRequestCount: 4,
      acceptedEvidenceIds: ["vercel-aggregate"],
      rejectedCooldownEvidenceIds: ["stripe-record"],
      events: [],
    },
    sources: [source(), stripeSource],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(stripeOnlyRejected), /cannot prove rejected-cooldown accounting/);

  const unhashedRootEvidence = draft({
    sources: [source({ sha256: null })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(unhashedRootEvidence), /must reference evidence with a non-null SHA-256 digest/);

  const nullOwnerDigest = draft({
    acceptance: {
      mode: "aggregate",
      acceptedRequestCount: 44,
      rejectedCooldownRequestCount: 0,
      acceptedEvidenceIds: ["owner-export-digest"],
      rejectedCooldownEvidenceIds: [],
      events: [],
    },
    sources: [source({
      evidenceId: "owner-export-digest",
      kind: "owner_export_digest",
      sha256: null,
      recordLocator: "private/recovery/aug14-owner-export.sha256",
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(nullOwnerDigest), /owner_export_digest requires a non-null SHA-256 digest/);

  const eventOutsideMatchingEvidence = draft({
    acceptance: {
      mode: "row_level",
      acceptedRequestCount: 1,
      rejectedCooldownRequestCount: 0,
      acceptedEvidenceIds: ["vercel-aggregate"],
      rejectedCooldownEvidenceIds: [],
      events: [rowEvent(0)],
    },
    sources: [
      source(),
      source({
        evidenceId: "vercel-runtime-logs",
        kind: "vercel_runtime_logs",
        recordLocator: "private/recovery/aug14-queue-posts-chronological.csv",
      }),
    ],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(eventOutsideMatchingEvidence), /must also appear in acceptance\.acceptedEvidenceIds/);

  const aggregateWithRowEvent = draft();
  aggregateWithRowEvent.acceptance.events = [rowEvent(0)];
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(aggregateWithRowEvent), /aggregate accounting must not contain row-level events/);

  const emptyAcceptance = {
    mode: "aggregate",
    acceptedRequestCount: 0,
    rejectedCooldownRequestCount: 0,
    acceptedEvidenceIds: [],
    rejectedCooldownEvidenceIds: [],
    events: [],
  };
  assert.doesNotThrow(() => ledger.sealQueueHistoricalEvidenceLedger(draft({
    acceptance: emptyAcceptance,
    sources: [],
  })));
});

test("rejects cross-show evidence and invalid VOD coverage declarations", () => {
  const crossShow = draft({
    sources: [source({ canonicalShowDate: "2026-08-07" })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(crossShow), /must equal ledger canonicalShowDate 2026-08-14/);

  const vodWithoutObservationCoverage = draft({
    sources: [
      source(),
      source({
        evidenceId: "bad-vod",
        kind: "vod_observation",
        recordLocator: "private/recovery/aug14-vod-observation.json",
        coverage: "not_applicable",
      }),
    ],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(vodWithoutObservationCoverage), /VOD observations require/);

  const nonVodWithObservationCoverage = draft({
    sources: [source({ coverage: "partial_show" })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(nonVodWithObservationCoverage), /not_applicable for non-VOD/);
});

test("fails closed on duplicate IDs and unresolved or internally inconsistent evidence references", () => {
  const duplicateSources = draft({ sources: [source(), source()] });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(duplicateSources), /sources\.evidenceId.*duplicate identifier/);

  const missingEvidence = draft({
    tracks: [track(1, {
      acceptanceState: "candidate_only",
      evidenceIds: ["missing-source"],
      fieldEvidence: { title: ["missing-source"] },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(missingEvidence), /references missing evidence/);

  const fieldOutsideTrack = draft({
    sources: [source({ evidenceId: "vercel-aggregate", kind: "vercel_log_aggregate" }), source({ evidenceId: "second-source" })],
    tracks: [track(1, {
      acceptanceState: "candidate_only",
      evidenceIds: ["vercel-aggregate"],
      fieldEvidence: { title: ["second-source"] },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(fieldOutsideTrack), /must also appear in the track evidenceIds list/);
});

test("prevents aggregate, digest, and Blob evidence from promoting a candidate track", () => {
  const aggregatePromoted = draft({
    tracks: [track(1, {
      acceptanceState: "accepted_confirmed",
      evidenceIds: ["vercel-aggregate"],
      fieldEvidence: { acceptanceState: ["vercel-aggregate"] },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(aggregatePromoted), /count aggregates, digests, and Blob evidence are insufficient/);

  const blobSource = source({
    evidenceId: "blob-inventory",
    kind: "vercel_blob_inventory",
    privacy: "private",
    recordLocator: "private/recovery/aug14-owned-blob-inventory.json",
  });
  const blobPromoted = draft({
    sources: [source(), blobSource],
    tracks: [track(1, {
      acceptanceState: "accepted_confirmed",
      evidenceIds: ["blob-inventory"],
      fieldEvidence: { acceptanceState: ["blob-inventory"] },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(blobPromoted), /count aggregates, digests, and Blob evidence are insufficient/);

  const blobVerifiedIdentity = draft({
    sources: [source(), blobSource],
    tracks: [track(1, {
      acceptanceState: "candidate_only",
      identityState: "verified",
      evidenceIds: ["blob-inventory"],
      fieldEvidence: {
        identityState: ["blob-inventory"],
        submittedArtistName: ["blob-inventory"],
        title: ["blob-inventory"],
      },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(blobVerifiedIdentity), /verified identity requires/);

  const digestSource = source({
    evidenceId: "owner-export-digest",
    kind: "owner_export_digest",
    recordLocator: "private/recovery/aug14-owner-export.sha256",
  });
  const digestBackedOutcome = draft({
    sources: [source(), digestSource],
    tracks: [track(1, {
      administrativeOutcome: "marked_played",
      evidenceIds: ["owner-export-digest"],
      fieldEvidence: { administrativeOutcome: ["owner-export-digest"] },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(digestBackedOutcome), /known administrative outcome requires/);

  const stripeSource = source({
    evidenceId: "stripe-record",
    kind: "stripe_record",
    privacy: "private",
    recordLocator: "private/recovery/aug14-stripe-checkout-record.json",
  });
  const stripeBackedOutcome = draft({
    sources: [source(), stripeSource],
    tracks: [track(1, {
      administrativeOutcome: "removed",
      evidenceIds: ["stripe-record"],
      fieldEvidence: { administrativeOutcome: ["stripe-record"] },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(stripeBackedOutcome), /known administrative outcome requires/);
});

test("does not convert an administrative marked-played result into confirmed airplay", () => {
  const unsupported = draft({
    sources: [
      source(),
      source({
        evidenceId: "admin-attestation",
        kind: "owner_attestation",
        sha256: null,
        privacy: "private",
        recordLocator: "private/recovery/aug14-admin-attestation.json",
      }),
    ],
    tracks: [track(1, {
      acceptanceState: "candidate_only",
      administrativeOutcome: "marked_played",
      airplayState: "played_confirmed",
      completionExtent: "full_confirmed",
      evidenceIds: ["vercel-aggregate", "admin-attestation"],
      fieldEvidence: {
        administrativeOutcome: ["admin-attestation"],
        airplayState: ["vercel-aggregate"],
      },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(unsupported), /not backed by a playback event or VOD observation/);

  const unknownWithInventedExtent = draft({
    tracks: [track(1, {
      acceptanceState: "candidate_only",
      administrativeOutcome: "marked_played",
      airplayState: "unknown",
      completionExtent: "partial_confirmed",
      evidenceIds: ["vercel-aggregate"],
      fieldEvidence: {},
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(unknownWithInventedExtent), /must remain unknown/);
});

test("allows a confirmed playback start with unknown completion extent when direct evidence exists", () => {
  const playedTrack = track(1, {
    acceptanceState: "accepted_confirmed",
    airplayState: "played_confirmed",
    completionExtent: "unknown",
    evidenceIds: ["vercel-runtime-logs", "vod-evidence"],
    fieldEvidence: {
      acceptanceState: ["vercel-runtime-logs"],
      airplayState: ["vod-evidence"],
    },
  });
  const sealed = ledger.sealQueueHistoricalEvidenceLedger(draft({
    sources: [
      source(),
      source({
        evidenceId: "vercel-runtime-logs",
        kind: "vercel_runtime_logs",
        recordLocator: "private/recovery/aug14-queue-posts-chronological.csv",
      }),
      source({
        evidenceId: "vod-evidence",
        kind: "vod_observation",
        sha256: ONE_HASH,
        privacy: "private",
        recordLocator: "private/recovery/aug14-vod-observation.json",
        coverage: "point_observation",
      }),
    ],
    tracks: [playedTrack],
  }));
  const validated = ledger.validateQueueHistoricalEvidenceLedger(sealed);
  assert.equal(validated.tracks[0].completionExtent, "unknown");
  assert.equal(validated.coverage.airplayPlayedConfirmed, 1);
  assert.equal(validated.coverage.airplayUnknown, 43);
  assert.equal(validated.coverage.completionUnknown, 1);
});

test("requires scoped VOD evidence for completion extent and not-played conclusions", () => {
  const runtimeSource = source({
    evidenceId: "vercel-runtime-logs",
    kind: "vercel_runtime_logs",
    recordLocator: "private/recovery/aug14-queue-posts-chronological.csv",
  });
  const playbackSource = source({
    evidenceId: "playback-event",
    kind: "playback_event",
    privacy: "private",
    recordLocator: "private/recovery/aug14-playback-event.json",
  });
  const playbackOnlyFull = draft({
    sources: [source(), runtimeSource, playbackSource],
    tracks: [track(1, {
      acceptanceState: "accepted_confirmed",
      airplayState: "played_confirmed",
      completionExtent: "full_confirmed",
      evidenceIds: ["vercel-runtime-logs", "playback-event"],
      fieldEvidence: {
        acceptanceState: ["vercel-runtime-logs"],
        airplayState: ["playback-event"],
      },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(playbackOnlyFull), /completion extent requires field-specific VOD evidence/);

  const pointVod = source({
    evidenceId: "point-vod",
    kind: "vod_observation",
    privacy: "private",
    recordLocator: "private/recovery/aug14-point-vod-observation.json",
    coverage: "point_observation",
  });
  const pointVodFull = draft({
    sources: [source(), runtimeSource, pointVod],
    tracks: [track(1, {
      acceptanceState: "accepted_confirmed",
      airplayState: "played_confirmed",
      completionExtent: "full_confirmed",
      evidenceIds: ["vercel-runtime-logs", "point-vod"],
      fieldEvidence: {
        acceptanceState: ["vercel-runtime-logs"],
        airplayState: ["point-vod"],
        completionExtent: ["point-vod"],
      },
    })],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(pointVodFull), /completionExtent.*not backed by a VOD observation/);

  const pointVodPartial = clone(pointVodFull);
  pointVodPartial.tracks[0].completionExtent = "partial_confirmed";
  pointVodPartial.coverage = ledger.deriveQueueHistoricalEvidenceCoverage(
    pointVodPartial.acceptance,
    pointVodPartial.tracks,
  );
  assert.doesNotThrow(() => ledger.sealQueueHistoricalEvidenceLedger(pointVodPartial));

  for (const coverage of ["point_observation", "partial_show"]) {
    const vodId = `${coverage}-vod`;
    const insufficientVod = source({
      evidenceId: vodId,
      kind: "vod_observation",
      privacy: "private",
      recordLocator: `private/recovery/aug14-${coverage}-vod-observation.json`,
      coverage,
    });
    const notPlayed = draft({
      sources: [source(), runtimeSource, insufficientVod],
      tracks: [track(1, {
        acceptanceState: "accepted_confirmed",
        airplayState: "not_played_confirmed",
        completionExtent: "unknown",
        evidenceIds: ["vercel-runtime-logs", vodId],
        fieldEvidence: {
          acceptanceState: ["vercel-runtime-logs"],
          airplayState: [vodId],
        },
      })],
    });
    assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(notPlayed), /not backed by a full-show VOD observation/);
  }

  const fullVod = source({
    evidenceId: "full-show-vod",
    kind: "vod_observation",
    privacy: "private",
    recordLocator: "private/recovery/aug14-full-show-vod-observation.json",
    coverage: "full_show",
  });
  const fullyObservedNotPlayed = draft({
    sources: [source(), runtimeSource, fullVod],
    tracks: [track(1, {
      acceptanceState: "accepted_confirmed",
      airplayState: "not_played_confirmed",
      completionExtent: "unknown",
      evidenceIds: ["vercel-runtime-logs", "full-show-vod"],
      fieldEvidence: {
        acceptanceState: ["vercel-runtime-logs"],
        airplayState: ["full-show-vod"],
      },
    })],
  });
  assert.doesNotThrow(() => ledger.sealQueueHistoricalEvidenceLedger(fullyObservedNotPlayed));
});

test("owner attestation alone cannot upgrade airplay to played or not-played", () => {
  const attestationSource = source({
    evidenceId: "owner-attestation",
    kind: "owner_attestation",
    sha256: null,
    privacy: "private",
  });
  const baseTrack = track(1, {
    acceptanceState: "candidate_only",
    identityState: "partial",
    evidenceIds: ["owner-attestation"],
    fieldEvidence: { airplayState: ["owner-attestation"] },
  });
  const played = draft({
    sources: [source(), attestationSource],
    tracks: [{ ...baseTrack, airplayState: "played_confirmed", completionExtent: "unknown" }],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(played), /not backed by a playback event or VOD observation/);

  const notPlayed = draft({
    sources: [source(), attestationSource],
    tracks: [{ ...baseTrack, airplayState: "not_played_confirmed", completionExtent: "unknown" }],
  });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(notPlayed), /not backed by a full-show VOD observation/);
});

test("canonical digest is stable, detects bundle tampering, and can verify external evidence hashes", () => {
  const sealed = ledger.sealQueueHistoricalEvidenceLedger(draft());
  const reordered = Object.fromEntries(Object.entries(sealed).reverse());
  assert.equal(ledger.computeQueueHistoricalEvidenceBundleDigest(reordered), sealed.bundleDigest);
  assert.equal(ledger.canonicalQueueHistoricalEvidenceJson({ z: 1, a: { y: 2, b: 3 } }), '{"a":{"b":3,"y":2},"z":1}');

  const tampered = clone(sealed);
  tampered.sourceSessionId = "tampered-session";
  assert.throws(() => ledger.validateQueueHistoricalEvidenceLedger(tampered), /bundleDigest.*does not match/);

  assert.doesNotThrow(() => ledger.validateQueueHistoricalEvidenceLedger(sealed, {
    actualEvidenceSha256ById: { "vercel-aggregate": ZERO_HASH },
  }));
  assert.throws(() => ledger.validateQueueHistoricalEvidenceLedger(sealed, {
    actualEvidenceSha256ById: { "vercel-aggregate": ONE_HASH },
  }), /does not match the independently computed digest/);
  assert.throws(() => ledger.validateQueueHistoricalEvidenceLedger(sealed, {
    actualEvidenceSha256ById: {},
  }), /independently computed digest is missing/);
});

test("privacy is permanently admin-only and unknown v1 fields fail closed", () => {
  const falselyComplete = draft({ completeness: "complete" });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(falselyComplete), /complete requires every accepted request/);

  const publicLedger = draft({ visibility: "public" });
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(publicLedger), /visibility.*admin_only/);

  const extra = draft();
  extra.sources[0].secretToken = "must never be accepted";
  assert.throws(() => ledger.sealQueueHistoricalEvidenceLedger(extra), /is not part of the v1 schema/);
});
