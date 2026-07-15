import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

let source = readFileSync(resolve('src/lib/bnl-force-pull.ts'), 'utf8')
  .replace(/import \{ Redis \} from "@upstash\/redis";\n/, '');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const { pollForcePullStatus, serializeForcePullAttempt, resolveSafeStatusPath, resumeForcePullAttempt, isPendingForcePull, normalizePendingForcePullStatus } = mod;
const webhookUrl = 'https://bot.example.com/force-pull';
const base = { webhookUrl, sharedSecret: 'secret', statusPath: '/force-pull/status/r1', requestedAt: 'now', requestId: 'r1', intervalMs: 0, requestTimeoutMs: 25, now: () => 'checked' };
function res(status, body) { return { status, ok: status >= 200 && status < 300, json: async () => body }; }

test('initial 404 is retried and later published terminates', async () => {
  const statuses = [res(404, {}), res(200, { request_id: 'r1', status: 'published', accepted_relay_id: 'relay-1' })];
  const calls = [];
  const out = await pollForcePullStatus({ ...base, fetcher: async (url, init) => { calls.push({ url: String(url), secret: init.headers['x-bnl-secret'] }); return statuses.shift(); } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].secret, 'secret');
  assert.equal(out.status, 'published');
  assert.equal(out.acceptedRelayId, 'relay-1');
});

test('repeated 404 reaches unconfirmed rather than permanent processing', async () => {
  const out = await pollForcePullStatus({ ...base, windowMs: 1, fetcher: async () => res(404, {}) });
  assert.equal(out.status, 'unconfirmed');
  assert.match(out.warning, /Still processing/);
});

test('queued accepted running processing and already_running continue polling exact request id', async () => {
  const chain = ['queued', 'accepted', 'running', 'processing', 'already_running', 'published'];
  const out = await pollForcePullStatus({ ...base, requestId: 'exact', fetcher: async () => res(200, { request_id: 'exact', status: chain.shift() }) });
  assert.equal(out.status, 'published');
  assert.equal(out.requestId, 'exact');
});



test('every supported pending webhook acknowledgement is accepted and normalized', () => {
  for (const status of ['accepted', 'queued', 'already_running', 'running', 'processing']) assert.equal(isPendingForcePull(status), true);
  assert.equal(normalizePendingForcePullStatus('accepted'), 'processing');
  assert.equal(normalizePendingForcePullStatus('running'), 'processing');
  assert.equal(normalizePendingForcePullStatus('processing'), 'processing');
  assert.equal(normalizePendingForcePullStatus('queued'), 'queued');
  assert.equal(normalizePendingForcePullStatus('already_running'), 'already_running');
});

for (const status of ['disabled', 'no_safe_source', 'rejected', 'provider_failed', 'delivery_failed']) {
  test(`${status} terminates correctly`, async () => {
    const out = await pollForcePullStatus({ ...base, fetcher: async () => res(200, { request_id: 'r1', status, reason: status }) });
    assert.equal(out.status, status);
    assert.equal(out.reason, status);
  });
}

test('individual status fetch timeout returns unconfirmed', async () => {
  const out = await pollForcePullStatus({ ...base, fetcher: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  assert.equal(out.status, 'unconfirmed');
  assert.match(out.warning, /timed out/);
});

test('malformed JSON returns unconfirmed', async () => {
  const out = await pollForcePullStatus({ ...base, fetcher: async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }) });
  assert.equal(out.status, 'unconfirmed');
  assert.match(out.warning, /Malformed/);
});

test('unsafe cross-origin status path is rejected', async () => {
  assert.equal(resolveSafeStatusPath('https://evil.example/status', webhookUrl), null);
  const out = await pollForcePullStatus({ ...base, statusPath: 'https://evil.example/status', fetcher: async () => { throw new Error('should not fetch'); } });
  assert.equal(out.status, 'unconfirmed');
  assert.match(out.warning, /Unsafe/);
});

test('later admin refresh resumes a pending exact request without public path leakage', async () => {
  const stored = { requestedAt: 'now', requestId: 'r9', status: 'processing', statusPath: '/force-pull/status/r9' };
  const out = await resumeForcePullAttempt(null, 'key', stored, { webhookUrl, sharedSecret: 'secret', windowMs: 20, fetcher: async () => res(200, { request_id: 'r9', status: 'published' }) }, () => {});
  assert.equal(out.status, 'published');
  assert.equal(out.requestId, 'r9');
  assert.equal('statusPath' in out, false);
});

test('legacy and public serialization remove server-only fields and secrets', () => {
  const out = serializeForcePullAttempt({ requestedAt: 'now', requestId: null, status: 'legacy', statusPath: '/secret', webhookUrl, sharedSecret: 'secret', headers: { a: 1 }, raw: { ok: true }, delivered: true, httpStatus: 202 }, true);
  assert.deepEqual(out, { requestedAt: 'now', requestId: null, status: 'legacy', persisted: true, sourceClass: undefined, reason: undefined, acceptedRelayId: undefined, warning: undefined });
  assert.equal(JSON.stringify(out).includes('secret'), false);
  assert.equal(JSON.stringify(out).includes('force-pull'), false);
});

test('admin route centralizes webhook acknowledgement validation through pending predicate', () => {
  const route = readFileSync(resolve('src/app/api/admin/bnl/route.ts'), 'utf8');
  assert.match(route, /if \(!isPendingForcePull\(rawStatus\)\)/);
  assert.doesNotMatch(route, /rawStatus !== "queued" && rawStatus !== "already_running"/);
});
