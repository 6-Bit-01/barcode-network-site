import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/client-action.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { createClientActionRunner } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const description = { label: "Saving…", success: "Saved.", metric: "host_save" };

test("synchronous duplicate clicks cannot repeat a mutation or its follow-up effects", async () => {
  const changes = [], timings = [];
  let clock = 10, calls = 0, finish;
  const run = createClientActionRunner((key, state) => changes.push({ key, ...state }), (timing) => timings.push(timing), () => clock);
  const first = run("private-track-id", description, () => { calls++; return new Promise((resolve) => { finish = resolve; }); });
  assert.equal(changes[0].phase, "pending", "feedback happens before the request resolves");
  const duplicate = await run("private-track-id", description, async () => { calls++; return true; });
  assert.equal(duplicate, null);
  assert.equal(calls, 1);
  clock = 1710;
  finish({ confirmed: true });
  assert.deepEqual(await first, { confirmed: true });
  assert.equal(changes.at(-1).label, "Saved.");
  assert.deepEqual(timings, [{ action: "host_save", durationMs: 1700, outcome: "success" }]);
  assert.doesNotMatch(JSON.stringify(timings), /private-track-id/);
});

test("failed and rejected requests unlock without automatic retries or false success", async () => {
  const changes = [];
  let calls = 0;
  const run = createClientActionRunner((_key, state) => changes.push(state), () => {});
  assert.equal(await run("save", description, async () => { calls++; return null; }), null);
  assert.equal(changes.at(-1).phase, "error");
  await assert.rejects(run("save", description, async () => { calls++; throw new Error("offline"); }), /offline/);
  assert.equal(changes.at(-1).phase, "error");
  assert.equal(calls, 2);
  assert.equal(await run("save", description, async () => { calls++; return true; }), true);
  assert.equal(calls, 3);
});

test("unrelated controls remain available while another action is pending", async () => {
  const run = createClientActionRunner(() => {}, () => {});
  let finish;
  const first = run("track-a", description, () => new Promise((resolve) => { finish = resolve; }));
  assert.equal(await run("track-b", description, async () => "confirmed-b"), "confirmed-b");
  finish("confirmed-a");
  assert.equal(await first, "confirmed-a");
});
