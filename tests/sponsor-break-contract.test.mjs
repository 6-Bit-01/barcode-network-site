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
  return { session: { sponsorBreakStatus: status, sponsorBreakStartedAt } };
}

test("website sponsor duration matches the exact 11-minute local-player contract", () => {
  assert.equal(contract.SPONSOR_BREAK_DURATION_SECONDS, 11 * 60);
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
    return { ok: true, status: 200 };
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

test("acknowledged local bridge failures remain visible to the admin caller", async () => {
  await assert.rejects(
    () => contract.launchLocalCommercialBreakIfAcknowledged(state("running"), async () => ({ ok: false, status: 409 })),
    /Audio Bridge returned 409/,
  );
});
