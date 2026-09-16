import assert from "node:assert/strict";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) return path.join(projectRoot, "src", request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const contract = require("../src/lib/sponsor-break-contract.ts");

function state(status, sponsorBreakStartedAt = "2026-08-27T19:00:00.000Z") {
  return { session: { sessionId: "show-1", sponsorBreakStatus: status, sponsorBreakStartedAt } };
}

test("website sponsor duration matches the exact 11-minute local-player contract", () => {
  assert.equal(contract.SPONSOR_BREAK_DURATION_SECONDS, 11 * 60);
});

test("commercial-player preflight blocks the website timer when the separate process is unavailable", async () => {
  await contract.requireLocalCommercialPlayer(async () => reply(200, { protocol: "barcode_commercial_start_v1", ready: true, playerConnected: true }));
  await assert.rejects(
    () => contract.requireLocalCommercialPlayer(async () => reply(503, { protocol: "barcode_commercial_start_v1", ready: false, message: "Missing START.mp4 in Fixed." })),
    /Missing START.mp4/,
  );
});

test("only an authoritative running state with a valid start time acknowledges local playback", () => {
  assert.equal(contract.isSponsorBreakStartAcknowledged(state("running")), true);
  assert.equal(contract.isSponsorBreakStartAcknowledged(state("running", null)), false);
  assert.equal(contract.isSponsorBreakStartAcknowledged(state("running", "not-a-date")), false);
  for (const status of ["not_due", "due", "completed", "skipped"]) {
    assert.equal(contract.isSponsorBreakStartAcknowledged(state(status)), false, status);
  }
});

test("stale and rejected website responses never launch the local commercial player", async () => {
  let launchCount = 0;
  const launch = async () => {
    launchCount += 1;
    return reply(200, { started: true });
  };

  for (const status of ["not_due", "due", "completed", "skipped"]) {
    const result = await contract.launchLocalCommercialBreakIfAcknowledged(state(status), launch);
    assert.equal(result, "not_acknowledged", status);
  }
  assert.equal(launchCount, 0);

  const result = await contract.launchLocalCommercialBreakIfAcknowledged(state("running"), launch);
  assert.equal(result, "started");
  assert.equal(launchCount, 1);
});

test("acknowledged local commercial-player failures remain visible to the admin caller", async () => {
  await assert.rejects(
    () => contract.launchLocalCommercialBreakIfAcknowledged(state("running"), async () => reply(409, { started: false, message: "No playable Active media." })),
    /No playable Active media/,
  );
});

function reply(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
const ready = () => reply(200, { protocol: "barcode_commercial_start_v1", ready: true, playerConnected: true });

function startup(overrides = {}) {
  const calls = [];
  return { calls, input: {
    probe: async () => { calls.push("probe"); return ready(); },
    startWebsite: async () => { calls.push("website"); return state("running"); },
    launch: async () => { calls.push("launch"); return reply(200, { started: true }); },
    cancelRejectedStart: async (attempt) => { calls.push(["cancel", attempt]); return state("due", null); },
    ...overrides,
  } };
}

test("preflight validates protocol, source heartbeat and library before a website timer can start", async () => {
  for (const response of [reply(204, {}), reply(404, {}), reply(409, { protocol: "barcode_commercial_start_v1", ready: false, playerConnected: true, message: "Missing START.mp4" }), reply(200, { protocol: "barcode_commercial_start_v1", ready: true, playerConnected: false })]) {
    const h = startup({ probe: async () => response });
    await assert.rejects(() => contract.startSponsorBreakWithLocalPlayer(h.input), /No sponsor timer was started/);
    assert.deepEqual(h.calls, []);
  }
});

test("one validated, freshly acknowledged start launches once in the required order", async () => {
  const h = startup();
  assert.equal(await contract.startSponsorBreakWithLocalPlayer(h.input), "started");
  assert.deepEqual(h.calls, ["probe", "website", "launch"]);
  const denied = startup({ startWebsite: async () => state("not_due") });
  assert.equal(await contract.startSponsorBreakWithLocalPlayer(denied.input), "not_acknowledged");
  assert.deepEqual(denied.calls, ["probe"]);
});

test("an explicit local rejection requests cancellation only for the exact acknowledged timer", async () => {
  const h = startup({ launch: async () => reply(409, { started: false, message: "Active file became unreadable." }) });
  await assert.rejects(() => contract.startSponsorBreakWithLocalPlayer(h.input), /Active file became unreadable.*timer was cancelled/);
  assert.deepEqual(h.calls.at(-1), ["cancel", { sessionId: "show-1", startedAt: "2026-08-27T19:00:00.000Z" }]);
});

test("timeouts and ambiguous responses never undo a timer when local playback might have started", async () => {
  for (const launch of [async () => { throw new Error("network timeout"); }, async () => reply(200, {}), async () => reply(502, {})]) {
    const h = startup({ launch });
    await assert.rejects(() => contract.startSponsorBreakWithLocalPlayer(h.input), /still running or its state is uncertain/);
    assert.deepEqual(h.calls, ["probe", "website"]);
  }
});

test("a concurrent new timer or failed cancellation remains an explicit uncertain outcome", async () => {
  const h = startup({ launch: async () => reply(409, { started: false }), cancelRejectedStart: async () => state("running", "2026-08-27T19:05:00.000Z") });
  await assert.rejects(() => contract.startSponsorBreakWithLocalPlayer(h.input), /still running or its state is uncertain/);
});
