import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const source = fs.readFileSync(new URL("../src/lib/broadcastSchedule.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const times = { queueOpens: "6:40 PM PT", showBegins: "7:00 PM PT", firstTrack: "7:05 PM PT" };
for (const [now, expected] of [
  ["2026-09-25T17:00:00Z", "2026-09-26T02:00:00.000Z"],
  ["2026-09-26T01:59:59Z", "2026-09-26T02:00:00.000Z"],
  ["2026-09-26T02:00:00Z", "2026-10-03T02:00:00.000Z"],
  ["2026-10-31T04:00:00Z", "2026-11-07T03:00:00.000Z"],
  ["2026-03-07T04:00:00Z", "2026-03-14T02:00:00.000Z"],
]) test(`next Pacific Friday resolves correctly from ${now}`, () => {
  const next = exports.nextBroadcastSchedule(new Date(now), times);
  assert.equal(next.show.toISOString(), expected);
  assert.equal(next.show - next.queue, 20 * 60_000);
  assert.equal(next.first - next.show, 5 * 60_000);
});
test("countdown uses rounded minutes without becoming negative", () => {
  assert.equal(exports.broadcastCountdown(61_000), "0h 2m");
  assert.equal(exports.broadcastCountdown(-1), "0h 0m");
  assert.equal(exports.broadcastCountdown(25 * 3600_000), "1d 1h 0m");
});
