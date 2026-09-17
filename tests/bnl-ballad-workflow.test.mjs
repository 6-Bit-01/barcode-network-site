import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(readFileSync("src/lib/bnl-ballad-workflow.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports });
const { balladPublishTasks } = exports;
const ready = { pending: false, dirtySections: [], hasVersion: true, pendingUpload: false, hasWorkingTakes: false, hasConfirmedRecording: true };
const ids = tasks => Array.from(tasks, task => task.id);

test("the reported Publish screen explains unsaved details and missing audio in order", () => {
  const tasks = balladPublishTasks({ ...ready, dirtySections: ["presentation"], hasConfirmedRecording: false });
  assert.deepEqual(ids(tasks), ["presentation", "recording"]);
  assert.equal(tasks[0].action, "Save release details");
  assert.equal(tasks[1].stage, "Recording");
  assert.match(tasks[1].detail, /Suno link alone does not attach audio/);
  assert.deepEqual(ids(balladPublishTasks({ ...ready, hasConfirmedRecording: false })), ["recording"]);
});

test("a saved take still needs explicit selection; the guide never publishes for the user", () => {
  const tasks = balladPublishTasks({ ...ready, hasWorkingTakes: true, hasConfirmedRecording: false });
  assert.equal(tasks[0].action, "Choose recording");
  assert.match(tasks[0].detail, /Use this recording/);
  assert.equal(balladPublishTasks(ready).length, 0);
});

test("story and other edits save before canonical song edits can be queued", () => {
  const tasks = balladPublishTasks({ ...ready, dirtySections: ["draft", "presentation", "linerNotes", "options", "automation"] });
  assert.deepEqual(ids(tasks), ["options", "automation", "linerNotes", "presentation", "draft"]);
  assert.equal(tasks.at(-1).action, "Save song edits");
  assert.deepEqual(ids(balladPublishTasks({ ...ready, pending: true, dirtySections: ["draft"] })), ["pending"]);
  assert.equal(balladPublishTasks({ ...ready, pending: true })[0].action, undefined);
});

test("an uploaded file is not confused with an attached or chosen recording", () => {
  assert.deepEqual(ids(balladPublishTasks({ ...ready, pendingUpload: true, hasConfirmedRecording: false })), ["upload", "recording"]);
  assert.deepEqual(ids(balladPublishTasks({ ...ready, pendingUpload: true })), ["upload"]);
});

test("a new workspace starts at Song; an existing confirmed release needs no new upload", () => {
  assert.equal(balladPublishTasks({ ...ready, hasVersion: false, hasConfirmedRecording: false })[0].action, "Go to Song");
  assert.equal(balladPublishTasks({ ...ready, hasWorkingTakes: false }).length, 0);
});
