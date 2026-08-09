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
  const { outputText } = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename });
  module._compile(outputText, filename);
};

const require = createRequire(import.meta.url);
const events = require("../src/lib/queue-time-bank-events.ts");

function observation(overrides = {}) {
  return {
    sessionId: "session-1",
    bankSeconds: 3600,
    activePlayableCount: 10,
    completedPlayableCount: 0,
    removedCount: 0,
    knownDurationCount: 5,
    wheelSpinsOwed: 0,
    wheelSecondsBudgeted: 600,
    sponsorStatus: "not_due",
    isLive: true,
    ...overrides,
  };
}

test("new submissions report committed minutes from the shared bank delta", () => {
  const event = events.deriveQueueTimeBankEvent(observation(), observation({ activePlayableCount: 11, bankSeconds: 3225 }));
  assert.equal(event?.kind, "submission");
  assert.equal(event?.label, "NEW SUBMISSION");
  assert.equal(event?.bankDeltaSeconds, -375);
});

test("resolved short duration reports bank gained and small churn stays quiet", () => {
  const gained = events.deriveQueueTimeBankEvent(observation(), observation({ knownDurationCount: 6, bankSeconds: 3720 }));
  assert.equal(gained?.kind, "duration");
  assert.equal(gained?.bankDeltaSeconds, 120);
  assert.equal(events.deriveQueueTimeBankEvent(observation(), observation({ knownDurationCount: 6, bankSeconds: 3615 })), null);
});

test("pace drift waits for a meaningful minute instead of producing permanent dashboard chatter", () => {
  assert.equal(events.deriveQueuePaceBankEvent(3600, observation({ bankSeconds: 3560 })), null);
  const overrun = events.deriveQueuePaceBankEvent(3600, observation({ bankSeconds: 3535 }));
  assert.equal(overrun?.kind, "pace");
  assert.equal(overrun?.label, "TRANSITION OVERRUN");
  assert.equal(overrun?.bankDeltaSeconds, -65);
});

test("events never cross session boundaries", () => {
  assert.equal(events.deriveQueueTimeBankEvent(observation(), observation({ sessionId: "session-2", activePlayableCount: 11, bankSeconds: 3200 })), null);
});
