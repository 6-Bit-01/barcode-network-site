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
  const originalConsoleError = console.error;
  console.error = () => {};
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
  console.error = originalConsoleError;
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

test('production-shaped v2 JSON replaces fallback with relay and presence', async () => {
  const production = {
    status: 'ONLINE', mode: 'OBSERVATION', message: 'Canonical relay message', currentDirective: 'Canonical directive', source: 'relay', lastSeen: '2026-07-16T00:20:32.865Z', persisted: true, contractVersion: 2,
    presence: { contractVersion: 2, status: 'ONLINE', mode: 'OBSERVATION', source: 'heartbeat', receivedAt: '2026-07-16T00:25:25.083Z' },
    relay: { contractVersion: 2, relayId: 'bnl-0c3bfdb539281d78f934287f2c536746', message: 'Canonical relay message', currentDirective: 'Canonical directive', sourceClass: 'fresh_public_event', trigger: 'scheduled', publishedAt: '2026-07-16T00:20:32.865Z' },
  };
  const controller = new BNLStatusController(async () => ({ ok: true, status: 200, json: async () => production }));
  await controller.refresh();
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.data.message, 'Canonical relay message');
  assert.equal(snapshot.data.relay.relayId, 'bnl-0c3bfdb539281d78f934287f2c536746');
  assert.equal(snapshot.data.presence.source, 'heartbeat');
  assert.equal(snapshot.synchronized, true);
});

test('failed initial refresh reports sync failure instead of confirmed fallback', async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  const controller = new BNLStatusController(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  await controller.refresh();
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.data.message, 'fallback');
  assert.equal(snapshot.loading, false);
  assert.equal(snapshot.synchronized, false);
  assert.match(snapshot.error, /503/);
  console.error = originalConsoleError;
});

test('client requests use no-store semantics', async () => {
  let init;
  const controller = new BNLStatusController(async (_url, requestInit) => { init = requestInit; return { ok: true, status: 200, json: async () => good }; });
  await controller.refresh();
  assert.equal(init.cache, 'no-store');
  assert.equal(Object.hasOwn(init, 'headers'), false);
});


test('provider-style browser fetch wrapper avoids controller receiver binding', async () => {
  const providerSource = readFileSync(resolve('src/components/BNLStatusProvider.tsx'), 'utf8');
  assert.match(providerSource, /new BNLStatusController\(\(input, init\) => globalThis\.fetch\(input, init\)\)/);
  const originalFetch = globalThis.fetch;
  const production = {
    status: 'ONLINE', mode: 'OBSERVATION', message: 'Receiver-safe relay', currentDirective: 'Receiver-safe directive', source: 'relay', lastSeen: '2026-07-16T00:20:32.865Z', persisted: true, contractVersion: 2,
    presence: { contractVersion: 2, status: 'ONLINE', mode: 'OBSERVATION', source: 'heartbeat', receivedAt: '2026-07-16T00:25:25.083Z' },
    relay: { contractVersion: 2, relayId: 'bnl-0c3bfdb539281d78f934287f2c536746', message: 'Receiver-safe relay', currentDirective: 'Receiver-safe directive', sourceClass: 'fresh_public_event', trigger: 'scheduled', publishedAt: '2026-07-16T00:20:32.865Z' },
  };
  let init;
  globalThis.fetch = function (_input, requestInit) {
    assert.equal(this, globalThis);
    init = requestInit;
    return Promise.resolve({ ok: true, status: 200, json: async () => production });
  };
  try {
    const controller = new BNLStatusController((input, requestInit) => globalThis.fetch(input, requestInit));
    await controller.refresh();
    assert.equal(controller.getSnapshot().data.message, 'Receiver-safe relay');
    assert.equal(init.cache, 'no-store');
    assert.equal(Object.hasOwn(init, 'headers'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
