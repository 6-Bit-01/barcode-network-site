import assert from "node:assert/strict";
import test from "node:test";

import {
  FakeHistoricalEvidenceBlobStore,
  digestMapForLedger,
  loadHistoricalEvidenceModules,
  makeLedger,
  withDedicatedToken,
} from "./queue-historical-evidence-test-helpers.mjs";

const { ledger, repository, importer } = loadHistoricalEvidenceModules();

function applyRequest(value) {
  return {
    ledger: value,
    operatorAttestedEvidenceSha256ById: digestMapForLedger(value),
    confirmation: repository.queueHistoricalEvidenceRequiredConfirmation(value),
  };
}

test("apply revalidates and re-reads before one exact create-only private write", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  const result = await importer.appendQueueHistoricalEvidence(
    applyRequest(value),
    store.writeDependencies(),
  );

  assert.equal(result.dryRun, false);
  assert.equal(result.appended, true);
  assert.equal(result.alreadyPresent, false);
  assert.equal(result.canApply, true);
  assert.equal(store.listCalls, 3, "initial plan, pre-write revalidation, and outcome audit");
  assert.equal(store.putCalls.length, 1);
  const write = store.putCalls[0];
  assert.equal(write.pathname, repository.QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME);
  assert.equal(write.body, ledger.canonicalQueueHistoricalEvidenceJson(value));
  assert.deepEqual(write.options, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    token: "test-dedicated-private-token",
  });
}));

test("wrong confirmation performs no write and does not reach pre-write revalidation", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  await assert.rejects(
    importer.appendQueueHistoricalEvidence({
      ...applyRequest(value),
      confirmation: "APPEND SOMETHING ELSE",
    }, store.writeDependencies()),
    (error) => error?.code === "historical_evidence_confirmation_required" && error?.status === 400,
  );
  assert.equal(store.listCalls, 1);
  assert.equal(store.putCalls.length, 0);
}));

test("identical retry is idempotent and performs no write", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.addLedger(ledger, value);
  const result = await importer.appendQueueHistoricalEvidence(
    applyRequest(value),
    store.writeDependencies(),
  );
  assert.equal(result.appended, false);
  assert.equal(result.alreadyPresent, true);
  assert.equal(store.putCalls.length, 0);
}));

test("same-date refinement appends behind the head without replacing the original bundle", () => withDedicatedToken(async () => {
  const original = makeLedger(ledger);
  const originalJson = ledger.canonicalQueueHistoricalEvidenceJson(original);
  const refinement = makeLedger(ledger, {
    previousBundleDigest: original.bundleDigest,
    sourceSessionId: "same-show-refinement",
  });
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.addLedger(ledger, original);

  const result = await importer.appendQueueHistoricalEvidence(
    applyRequest(refinement),
    store.writeDependencies(),
  );
  assert.equal(result.appended, true);
  const audit = await repository.auditQueueHistoricalEvidenceChain(store.readDependencies());
  assert.equal(audit.chainLength, 2);
  assert.deepEqual(audit.entries.map((entry) => entry.ledger.canonicalShowDate), [
    original.canonicalShowDate,
    original.canonicalShowDate,
  ]);
  assert.equal(
    store.objects.get(repository.QUEUE_HISTORICAL_EVIDENCE_ROOT_PATHNAME),
    originalJson,
  );
}));

test("input tampering during the first audit is detected before write", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const request = applyRequest(value);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.beforeList = async (call) => {
    if (call === 1) request.ledger.sourceSessionId = "tampered-after-validation";
  };
  await assert.rejects(
    importer.appendQueueHistoricalEvidence(request, store.writeDependencies()),
    (error) => error?.code === "historical_evidence_ledger_invalid" && error?.status === 400,
  );
  assert.equal(store.putCalls.length, 0);
}));

test("a head change during pre-write revalidation returns a stale conflict", () => withDedicatedToken(async () => {
  const intended = makeLedger(ledger);
  const competitor = makeLedger(ledger, { canonicalShowDate: "2026-08-01" });
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  store.beforeList = async (call, _options, currentStore) => {
    if (call === 2) currentStore.addLedger(ledger, competitor);
  };
  await assert.rejects(
    importer.appendQueueHistoricalEvidence(
      applyRequest(intended),
      store.writeDependencies(),
    ),
    (error) => error?.code === "historical_evidence_stale_predecessor" && error?.status === 409,
  );
  assert.equal(store.putCalls.length, 0);
}));

test("two concurrent successors result in one append and one conflict", () => withDedicatedToken(async () => {
  const first = makeLedger(ledger, { canonicalShowDate: "2026-08-07" });
  const second = makeLedger(ledger, { canonicalShowDate: "2026-08-14" });
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  const dependencies = store.writeDependencies();

  const settled = await Promise.allSettled([
    importer.appendQueueHistoricalEvidence(applyRequest(first), dependencies),
    importer.appendQueueHistoricalEvidence(applyRequest(second), dependencies),
  ]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = settled.find((item) => item.status === "rejected");
  assert.equal(rejected?.reason?.code, "historical_evidence_successor_conflict");
  assert.equal(rejected?.reason?.status, 409);
  assert.equal(store.objects.size, 1);
  assert.equal(store.putCalls.length, 2);
}));

test("ambiguous write that stored identical bytes reconciles as already present", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  const dependencies = store.writeDependencies(async (pathname, body, _options, currentStore) => {
    currentStore.objects.set(pathname, body);
    throw new Error("connection reset after request was accepted");
  });
  const result = await importer.appendQueueHistoricalEvidence(applyRequest(value), dependencies);
  assert.equal(result.appended, false);
  assert.equal(result.alreadyPresent, true);
  assert.equal(store.putCalls.length, 1);
}));

test("ambiguous write reconciles a different successor as conflict", () => withDedicatedToken(async () => {
  const intended = makeLedger(ledger, { canonicalShowDate: "2026-08-07" });
  const competitor = makeLedger(ledger, { canonicalShowDate: "2026-08-14" });
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  const dependencies = store.writeDependencies(async (pathname, _body, _options, currentStore) => {
    currentStore.objects.set(pathname, ledger.canonicalQueueHistoricalEvidenceJson(competitor));
    throw new Error("ambiguous concurrent write");
  });
  await assert.rejects(
    importer.appendQueueHistoricalEvidence(applyRequest(intended), dependencies),
    (error) => error?.code === "historical_evidence_successor_conflict" && error?.status === 409,
  );
}));

test("unreadable ambiguous outcome remains unknown and never rolls back", () => withDedicatedToken(async () => {
  const value = makeLedger(ledger);
  const store = new FakeHistoricalEvidenceBlobStore(repository);
  const dependencies = store.writeDependencies(async (pathname, body, _options, currentStore) => {
    currentStore.objects.set(pathname, body);
    currentStore.failList = new Error("list unavailable after ambiguous write");
    throw new Error("connection lost");
  });
  await assert.rejects(
    importer.appendQueueHistoricalEvidence(applyRequest(value), dependencies),
    (error) => error?.code === "historical_evidence_append_outcome_unknown" && error?.status === 503,
  );
  assert.equal(store.objects.size, 1, "ambiguous data is retained; there is no rollback delete");
  assert.equal(store.putCalls.length, 1);
}));
