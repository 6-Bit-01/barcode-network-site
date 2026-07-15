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

test('BNLStatusController fetches initially and preserves last good data after failure', async () => {
  let calls = 0;
  const controller = new BNLStatusController(async () => ({ ok: ++calls === 1, status: calls === 1 ? 200 : 500, json: async () => good }), 50, () => 't1');
  await controller.refresh();
  assert.equal(controller.getSnapshot().data.message, 'live');
  await controller.refresh();
  assert.equal(controller.getSnapshot().data.message, 'live');
  assert.match(controller.getSnapshot().error, /failed/i);
});

test('BNLStatusController prevents overlapping requests', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const controller = new BNLStatusController(async () => { calls++; await gate; return { ok: true, status: 200, json: async () => good }; });
  const a = controller.refresh();
  const b = controller.refresh();
  assert.equal(calls, 1);
  release();
  await Promise.all([a, b]);
});

test('BNLStatusController focus and visible refresh handlers refresh', async () => {
  let calls = 0;
  const controller = new BNLStatusController(async () => ({ ok: true, status: 200, json: async () => ({ ...good, message: String(++calls) }) }));
  await controller.refreshOnEvent();
  globalThis.document = { visibilityState: 'visible' };
  await controller.refreshOnVisible();
  delete globalThis.document;
  assert.equal(calls, 2);
});

test('BNLStatusController cleanup aborts a pending request', async () => {
  let aborted = false;
  const controller = new BNLStatusController((_url, init) => new Promise(() => init.signal.addEventListener('abort', () => { aborted = true; })), 10);
  controller.start();
  controller.stop();
  assert.equal(aborted, true);
});
