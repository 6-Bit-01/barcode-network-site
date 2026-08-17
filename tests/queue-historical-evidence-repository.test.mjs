import assert from "node:assert/strict";
import test from "node:test";

import {
  FakeHistoricalEvidenceBlobStore,
  digestMapForLedger,
  loadHistoricalEvidenceModules,
  makeLedger,
  withDedicatedToken,
} from "./queue-historical-evidence-test-helpers.mjs";

const { ledger, repository } = loadHistoricalEvidenceModules();

test("requires only the dedicated token and never reuses the ordinary Blob token", async () => {
  const previousDedicated = process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  const previousOrdinary = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "must-not-be-used";
  let listCalls = 0;
  try {
    await assert.rejects(
      repository.auditQueueHistoricalEvidenceChain({
        listBlobs: async () => { listCalls += 1; throw new Error("must not run"); },
      }),
      (error) => error?.code === "historical_evidence_storage_not_configured"
        && error?.status === 503,
    );
    assert.equal(listCalls, 0);
  } finally {
    if (previousDedicated === undefined) delete process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN;
    else process.env.QUEUE_HISTORICAL_EVIDENCE_BLOB_READ_WRITE_TOKEN = previousDedicated;
    if (previousOrdinary === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousOrdinary;
  }
});

test("audits a complete predecessor-keyed chain and returns a redacted summary", () => withDedicatedToken(async () => {
  const root = makeLedger(ledger);
  const successor = makeLedger(ledger, {
    previousBundleDigest: root.bundleDigest,
    canonicalShowDate: "2026-08-14",
    sourceSessionId: "another-private-session",
    sources: [{
      evidenceId: "unhashed-private-source",
      kind: "vercel_blob_inventory",
      sha256: null,
      recordLocator: "private/recovery/secret-inventory.json",
      privacy: "private",
      observedAt: "2026-08-15T01:00:00.000Z",
      canonicalShowDate: "2026-08-14",
      coverage: "not_applicable",
    }],
  });
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.addLedger(ledger, root);
  store.addLedger(ledger, successor);

  const audit = await repository.auditQueueHistoricalEvidenceChain(store.readDependencies());
  assert.equal(audit.chainLength, 2);
  assert.equal(audit.headBundleDigest, successor.bundleDigest);
  assert.deepEqual(audit.entries.map((entry) => entry.ledger.bundleDigest), [
    root.bundleDigest,
    successor.bundleDigest,
  ]);

  const summary = repository.summarizeQueueHistoricalEvidenceChain(audit);
  assert.equal(summary.chainLength, 2);
  assert.equal(summary.bundles[1].unhashedSourceCount, 1);
  const serialized = JSON.stringify(summary);
  for (const privateValue of [
    "another-private-session",
    "unhashed-private-source",
    "private/recovery/secret-inventory.json",
    "recordLocator",
    "sourceSessionId",
    "privateBlobPathname",
    "exactSourceUrl",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(privateValue));
  }
}));

test("dry-run matches exact operator-attested digests and produces the deterministic confirmation", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  const request = {
    ledger: value,
    operatorAttestedEvidenceSha256ById: digestMapForLedger(value),
  };
  const first = await repository.buildQueueHistoricalEvidenceImportPlan(request, store.readDependencies());
  const second = await repository.buildQueueHistoricalEvidenceImportPlan(request, store.readDependencies());
  assert.deepEqual(first, second);
  assert.equal(first.schema, "barcode_queue_historical_evidence_import_plan_v1");
  assert.equal(first.dryRun, true);
  assert.equal(first.canApply, true);
  assert.equal(first.alreadyPresent, false);
  assert.equal(first.observedHeadBundleDigest, null);
  assert.equal(first.operatorAttestedHashedSourceCount, 1);
  assert.deepEqual(first.unhashedSourceEvidenceIds, []);
  assert.equal(
    first.requiredConfirmation,
    `APPEND QUEUE HISTORICAL EVIDENCE 2026-08-07 ${value.bundleDigest} AFTER ROOT`,
  );
  assert.equal(store.putCalls.length, 0);
}));

test("operator-attested digest map must equal exactly the hashed source identifiers", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger, {
    sources: [{
      evidenceId: "unhashed",
      kind: "owner_attestation",
      sha256: null,
      recordLocator: "private/unhashed",
      privacy: "private",
      observedAt: null,
      canonicalShowDate: "2026-08-07",
      coverage: "not_applicable",
    }],
  });
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  await assert.rejects(
    repository.buildQueueHistoricalEvidenceImportPlan({
      ledger: value,
      operatorAttestedEvidenceSha256ById: { unhashed: "0".repeat(64) },
    }, store.readDependencies()),
    (error) => error?.code === "historical_evidence_digest_map_mismatch" && error?.status === 400,
  );
  assert.equal(store.listCalls, 0, "invalid digest maps are rejected before storage access");
}));

test("operator-attested digest mismatch fails before storage and is not called server verification", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  let listCalls = 0;
  await assert.rejects(
    repository.buildQueueHistoricalEvidenceImportPlan({
      ledger: value,
      operatorAttestedEvidenceSha256ById: { "owner-attestation": "1".repeat(64) },
    }, {
      listBlobs: async () => { listCalls += 1; return { blobs: [], hasMore: false }; },
    }),
    (error) => error?.code === "historical_evidence_digest_attestation_mismatch"
      && error?.status === 400,
  );
  assert.equal(listCalls, 0);
}));

test("rejects an oversized canonical ledger before storage access", () => withDedicatedToken(async () => {
  const oversized = makeLedger(ledger, {
    sources: [{
      evidenceId: "oversized-source",
      kind: "owner_attestation",
      sha256: "0".repeat(64),
      recordLocator: `private/${"x".repeat(repository.QUEUE_HISTORICAL_EVIDENCE_MAX_BLOB_BYTES)}`,
      privacy: "private",
      observedAt: null,
      canonicalShowDate: "2026-08-07",
      coverage: "not_applicable",
    }],
  });
  let listCalls = 0;
  await assert.rejects(
    repository.buildQueueHistoricalEvidenceImportPlan({
      ledger: oversized,
      operatorAttestedEvidenceSha256ById: digestMapForLedger(oversized),
    }, {
      listBlobs: async () => { listCalls += 1; return { blobs: [], hasMore: false }; },
    }),
    (error) => error?.code === "historical_evidence_ledger_too_large" && error?.status === 413,
  );
  assert.equal(listCalls, 0);
}));

test("identical replay is already present while a stale predecessor cannot apply", () => withDedicatedToken(async () => {
  const root = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.addLedger(ledger, root);

  const replay = await repository.buildQueueHistoricalEvidenceImportPlan({
    ledger: root,
    operatorAttestedEvidenceSha256ById: digestMapForLedger(root),
  }, store.readDependencies());
  assert.equal(replay.alreadyPresent, true);
  assert.equal(replay.canApply, true);

  const stale = makeLedger(ledger, {
    previousBundleDigest: null,
    canonicalShowDate: "2026-08-21",
  });
  const stalePlan = await repository.buildQueueHistoricalEvidenceImportPlan({
    ledger: stale,
    operatorAttestedEvidenceSha256ById: digestMapForLedger(stale),
  }, store.readDependencies());
  assert.equal(stalePlan.alreadyPresent, false);
  assert.equal(stalePlan.canApply, false);
  assert.equal(stalePlan.observedHeadBundleDigest, root.bundleDigest);
}));

test("same-date evidence refinement can append only behind the current head", () => withDedicatedToken(async () => {
  const root = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.addLedger(ledger, root);
  const refinement = makeLedger(ledger, {
    previousBundleDigest: root.bundleDigest,
    sourceSessionId: "different-private-session",
  });
  const plan = await repository.buildQueueHistoricalEvidenceImportPlan({
    ledger: refinement,
    operatorAttestedEvidenceSha256ById: digestMapForLedger(refinement),
  }, store.readDependencies());
  assert.equal(plan.canonicalShowDate, root.canonicalShowDate);
  assert.equal(plan.previousBundleDigest, root.bundleDigest);
  assert.equal(plan.canApply, true);
  assert.equal(plan.alreadyPresent, false);
}));

test("rejects noncanonical bytes, pathname/body mismatches, gaps, and unexpected keys", () => withDedicatedToken(async () => {
  const root = makeLedger(ledger);
  const rootPath = repository.QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME;
  const canonical = ledger.canonicalQueueHistoricalEvidenceJson(root);

  const noncanonical = new FakeHistoricalEvidenceBlobStore(repository, [[rootPath, `${canonical}\n`]]);
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain(noncanonical.readDependencies()),
    (error) => error?.code === "historical_evidence_noncanonical_bytes",
  );

  const gapPredecessor = "f".repeat(64);
  const unreachable = makeLedger(ledger, {
    previousBundleDigest: gapPredecessor,
    canonicalShowDate: "2026-08-14",
  });
  const gap = new FakeHistoricalEvidenceBlobStore(repository);
  gap.addLedger(ledger, unreachable);
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain(gap.readDependencies()),
    (error) => error?.code === "historical_evidence_chain_gap",
  );

  const mismatch = new FakeHistoricalEvidenceBlobStore(repository, [[
    `${repository.QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}${"e".repeat(64)}.json`,
    canonical,
  ]]);
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain(mismatch.readDependencies()),
    (error) => error?.code === "historical_evidence_predecessor_path_mismatch",
  );

  let getCalls = 0;
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain({
      listBlobs: async () => ({
        blobs: [{ pathname: `${repository.QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}notes.txt`, size: 1 }],
        hasMore: false,
      }),
      getBlob: async () => { getCalls += 1; return null; },
    }),
    (error) => error?.code === "historical_evidence_unexpected_key",
  );
  assert.equal(getCalls, 0);
}));

test("rejects a valid JSON stream when SDK metadata proves the body was truncated", () => withDedicatedToken(async () => {
  const root = makeLedger(ledger);
  const pathname = repository.QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME;
  const bytes = new TextEncoder().encode(ledger.canonicalQueueHistoricalEvidenceJson(root));
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain({
      listBlobs: async () => ({
        blobs: [{ pathname, size: bytes.byteLength + 7 }],
        hasMore: false,
      }),
      getBlob: async () => ({
        statusCode: 200,
        blob: { size: bytes.byteLength + 7 },
        stream: new Response(bytes).body,
      }),
    }),
    (error) => error?.code === "historical_evidence_blob_unreadable" && error?.status === 503,
  );
}));

test("fails closed on duplicate keys and incomplete or repeated pagination", () => withDedicatedToken(async () => {
  const rootPath = repository.QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME;
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain({
      listBlobs: async () => ({
        blobs: [{ pathname: rootPath }, { pathname: rootPath }],
        hasMore: false,
      }),
    }),
    (error) => error?.code === "historical_evidence_duplicate_key",
  );

  let calls = 0;
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain({
      listBlobs: async () => {
        calls += 1;
        return {
          blobs: [{
            pathname: calls === 1
              ? rootPath
              : `${repository.QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}${"a".repeat(64)}.json`,
          }],
          cursor: "same",
          hasMore: true,
        };
      },
    }),
    (error) => error?.code === "historical_evidence_listing_incomplete",
  );
  assert.equal(calls, 2);
}));

test("fails closed before reads when the paginated namespace exceeds the chain bound", () => withDedicatedToken(async () => {
  const firstPage = [repository.QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME];
  for (let index = 0; index < repository.QUEUE_HISTORICAL_EVIDENCE_MAX_CHAIN_LENGTH - 1; index += 1) {
    firstPage.push(
      `${repository.QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}${index.toString(16).padStart(64, "0")}.json`,
    );
  }
  let getCalls = 0;
  await assert.rejects(
    repository.auditQueueHistoricalEvidenceChain({
      listBlobs: async ({ cursor }) => cursor
        ? {
            blobs: [{
              pathname: `${repository.QUEUE_HISTORICAL_EVIDENCE_CHAIN_PREFIX}${"f".repeat(64)}.json`,
            }],
            hasMore: false,
          }
        : {
            blobs: firstPage.map((pathname) => ({ pathname })),
            cursor: "second-page",
            hasMore: true,
          },
      getBlob: async () => { getCalls += 1; return null; },
    }),
    (error) => error?.code === "historical_evidence_chain_too_long" && error?.status === 503,
  );
  assert.equal(getCalls, 0);
}));
