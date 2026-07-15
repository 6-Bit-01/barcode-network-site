import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const source = readFileSync(resolve('src/components/bnl-status-controller.ts'), 'utf8')
  .replace(/import \{ BNLStatus, FALLBACK_STATUS \} from "@\/components\/bnl-status";/, 'const FALLBACK_STATUS = { status: "OFFLINE", mode: "STANDBY", message: "fallback", currentDirective: "fallback", source: "unknown", lastSeen: null };');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const { BNLStatusController } = mod;
const good = { status: 'ONLINE', mode: 'OBSERVATION', message: 'live', currentDirective: 'look alive', source: 'forcePull', lastSeen: 'now' };

test('start performs initial fetch and interval actually refreshes', async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let intervalCallback;
  globalThis.setInterval = (cb) => { intervalCallback = cb; return 7; };
  globalThis.clearInterval = () => {};
  let calls = 0;
  const controller = new BNLStatusController(async () => ({ ok: true, status: 200, json: async () => ({ ...good, message: String(++calls) }) }));
  controller.start();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  await intervalCallback();
  assert.equal(calls, 2);
  controller.stop();
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
});

test('focus and visible-document refresh work while hidden-document event does not', async () => {
  let calls = 0;
  const controller = new BNLStatusController(async () => ({ ok: true, status: 200, json: async () => ({ ...good, message: String(++calls) }) }));
  await controller.refreshOnEvent();
  globalThis.document = { visibilityState: 'hidden' };
  await controller.refreshOnVisible();
  assert.equal(calls, 1);
  globalThis.document = { visibilityState: 'visible' };
  await controller.refreshOnVisible();
  delete globalThis.document;
  assert.equal(calls, 2);
});

test('overlapping requests are prevented and last good status survives later error', async () => {
  let release;
  let calls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const controller = new BNLStatusController(async () => { calls++; if (calls === 1) { await gate; return { ok: true, status: 200, json: async () => good }; } return { ok: false, status: 500, json: async () => ({}) }; });
  const a = controller.refresh();
  const b = controller.refresh();
  assert.equal(calls, 1);
  release();
  await Promise.all([a, b]);
  await controller.refresh();
  assert.equal(controller.getSnapshot().data.message, 'live');
  assert.match(controller.getSnapshot().error, /failed/i);
});

test('interval listeners and pending requests are cleaned up', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const events = [];
  globalThis.window = { addEventListener: (name) => events.push(`add:${name}`), removeEventListener: (name) => events.push(`remove:${name}`) };
  globalThis.document = { visibilityState: 'visible', addEventListener: (name) => events.push(`add:${name}`), removeEventListener: (name) => events.push(`remove:${name}`) };
  globalThis.setInterval = () => 9;
  globalThis.clearInterval = (id) => events.push(`clear:${id}`);
  let aborted = false;
  const controller = new BNLStatusController((_url, init) => new Promise(() => init.signal.addEventListener('abort', () => { aborted = true; })));
  controller.start();
  controller.stop();
  assert.equal(aborted, true);
  assert.deepEqual(events, ['add:focus', 'add:visibilitychange', 'clear:9', 'remove:focus', 'remove:visibilitychange']);
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
});
