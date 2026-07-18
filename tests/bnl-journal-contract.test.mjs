import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const source = fs.readFileSync(full, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(full); cache.set(full, mod); mod.filename = full; mod.paths = Module._nodeModulePaths(path.dirname(full));
  const req = (id) => {
    if (id.startsWith('@/')) return load(path.join('src', id.slice(2)) + (path.extname(id) ? '' : fs.existsSync(path.join('src', id.slice(2)) + '.tsx') ? '.tsx' : '.ts'));
    if (id === 'next/link') { const MockLink = ({ href, children, ...props }) => React.createElement('a', { href: String(href), ...props }, children); MockLink.displayName = 'MockLink'; return MockLink; }
    if (id === 'next/navigation') return { notFound: () => { const e = new Error('NEXT_NOT_FOUND'); e.digest = 'NEXT_NOT_FOUND'; throw e; } };
    if (id === 'next/server') return { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }) } };
    return nodeRequire(id);
  };
  mod.require = req; mod._compile(js, full); return mod.exports;
}

const contract = load('src/lib/bnl-journal-contract.ts');
const store = load('src/lib/bnl-journal-store.ts');
const route = load('src/app/api/bnl/journal/route.ts');
const article = load('src/components/journal/JournalArticle.tsx');
const journalPage = load('src/app/journal/page.tsx');

function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k)=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`; return JSON.stringify(value); }
function hash(entry) { return crypto.createHash('sha256').update(`${entry.title}|${entry.excerpt}|${canonical(entry.sections)}`, 'utf8').digest('hex'); }
function words(n) { return Array.from({ length: n }, (_, i) => `word${i}`).join(' '); }
function payload(overrides = {}) { const entry = { entryId: 'entry-001', revision: 1, title: 'BNL-01 signal', excerpt: 'can\'t stop hyphen-word under_score déjà vu 中 文 line\nbreak\ttab.', sections: [{ heading: 'Public note', body: words(285) + ' extra words here now' }], authoredAt: '2026-07-18T12:00:00Z', sourceWindowStart: '2026-07-11T00:00:00Z', sourceWindowEnd: '2026-07-18T11:00:00Z', ...overrides }; entry.contentHash = overrides.contentHash ?? hash(entry); return { contractVersion: 1, kind: 'journal_entry', entry }; }

class FakeRedis {
  constructor({ failEval = false } = {}) { this.kv = new Map(); this.z = new Map(); this.failEval = failEval; this.unrelated = new Map([['other:key', 'leave-me']]); }
  async get(key) { return this.kv.get(key) ?? null; }
  async zcard(key) { return this.z.get(key)?.size ?? 0; }
  async zrank(key, member) { const arr = this.sorted(key); const i = arr.findIndex(([m]) => m === member); return i < 0 ? null : i; }
  async zrange(key, start, stop, opts = {}) { const arr = this.sorted(key); const selected = opts.rev ? [...arr].reverse() : arr; const a = start < 0 ? Math.max(selected.length + start, 0) : start; const b = stop < 0 ? selected.length + stop : stop; return selected.slice(a, b + 1).map(([m]) => m); }
  sorted(key) { return [...(this.z.get(key) ?? new Map()).entries()].sort((a, b) => a[1] - b[1]); }
  async eval(_script, keys, args) { if (this.failEval) throw new Error('write failed'); const [entryKey, latestKey, indexKey] = keys; const [entryId, revision, contentHash, publishedAt, recordJson, score] = args; const existingJson = this.kv.get(entryKey); if (existingJson) { const existing = JSON.parse(existingJson); if (existing.contentHash !== contentHash) return ['conflict', existing.publishedAt]; this.kv.set(latestKey, existingJson); if (!this.z.has(indexKey)) this.z.set(indexKey, new Map()); this.z.get(indexKey).set(entryId, Number(score)); return ['idempotent', existing.publishedAt]; } this.kv.set(entryKey, recordJson); const latest = this.kv.get(latestKey); if (!latest || JSON.parse(latest).revision < Number(revision)) { this.kv.set(latestKey, recordJson); if (!this.z.has(indexKey)) this.z.set(indexKey, new Map()); this.z.get(indexKey).set(entryId, Number(score)); } return ['created', publishedAt]; }
}

test('bot-compatible word counts and fixed hash fixture execute through validator', () => {
  const p = payload();
  const expectedHash = '4792e8940d1d68b6d6e2e3c04db72ff431c9d1def8c33d0bbc05795326e99ad3';
  assert.equal(contract.countJournalWords(p.entry), 307);
  assert.equal(hash(p.entry), expectedHash);
  assert.equal(p.entry.contentHash, expectedHash);
  assert.equal(contract.validateBNLJournalPayload(p).ok, true);
  for (const n of [250, 500]) { const exact = payload({ title: 'a', excerpt: 'b', sections: [{ heading: 'c', body: words(n - 3) }] }); exact.entry.contentHash = hash(exact.entry); assert.equal(contract.countJournalWords(exact.entry), n); assert.equal(contract.validateBNLJournalPayload(exact).ok, true); }
  for (const n of [249, 501]) { const bad = payload({ title: 'a', excerpt: 'b', sections: [{ heading: 'c', body: words(n - 3) }] }); bad.entry.contentHash = hash(bad.entry); assert.equal(contract.countJournalWords(bad.entry), n); assert.equal(contract.validateBNLJournalPayload(bad).ok, false); }
});

test('validator covers malformed envelopes, unknown fields, timestamp ordering, internal whitespace, and unsafe controls', () => {
  assert.equal(contract.validateBNLJournalPayload(payload()).ok, true);
  assert.equal(contract.validateBNLJournalPayload({ ...payload(), private: true }).ok, false);
  assert.equal(contract.validateBNLJournalPayload(payload({ sourceWindowEnd: '2026-07-19T00:00:00Z' })).ok, false);
  assert.equal(contract.validateBNLJournalPayload(payload({ title: 'bad\u0001title' })).ok, false);
  assert.equal(contract.validateBNLJournalPayload(payload({ sections: [] })).ok, false);
  const withTabs = payload({ excerpt: 'tabs\tand\nnewlines are allowed in public article text' });
  assert.equal(contract.validateBNLJournalPayload(withTabs).ok, true);
});

test('authentication and route raw byte limit behavior execute', async () => {
  assert.equal(contract.authenticateBNLJournalRequest('secret', 'secret'), true);
  assert.equal(contract.authenticateBNLJournalRequest('wrong', 'secret'), false);
  process.env.BNL_API_KEY = 'secret';
  const good = await route.POST(new Request('https://x.test/api/bnl/journal', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'secret' }, body: JSON.stringify(payload()) }));
  assert.equal(good.status, 503);
  const unauth = await route.POST(new Request('https://x.test/api/bnl/journal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(unauth.status, 401);
  const padded = ' '.repeat(contract.BNL_JOURNAL_MAX_PAYLOAD_BYTES + 1) + '{}';
  const tooLarge = await route.POST(new Request('https://x.test/api/bnl/journal', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'secret' }, body: padded }));
  assert.equal(tooLarge.status, 400);
});

test('atomic publication handles first insert, idempotency, conflict, failure, recovery, revisions, and unrelated keys', async () => {
  const redis = new FakeRedis(); const p = payload().entry;
  const first = await store.publishBNLJournalEntry(p, redis); assert.equal(first.ok, true); assert.equal(first.persisted, true); assert.equal(first.idempotent, false);
  const retry = await store.publishBNLJournalEntry(p, redis); assert.equal(retry.ok, true); assert.equal(retry.idempotent, true); assert.equal(retry.entry.publishedAt, first.entry.publishedAt);
  const changed = { ...p, title: 'Changed title' }; changed.contentHash = hash(changed); const conflict = await store.publishBNLJournalEntry(changed, redis); assert.deepEqual(conflict, { ok: false, conflict: true });
  const [a, b] = await Promise.all([store.publishBNLJournalEntry({ ...p, entryId: 'entry-002' }, redis), store.publishBNLJournalEntry({ ...p, entryId: 'entry-002' }, redis)]); assert.equal([a, b].filter((r) => r.ok && !r.idempotent).length, 1); assert.equal([a, b].filter((r) => r.ok && r.idempotent).length, 1);
  const c1 = { ...p, entryId: 'entry-003' }; const c2 = { ...p, entryId: 'entry-003', title: 'Conflict title' }; c2.contentHash = hash(c2); const both = await Promise.all([store.publishBNLJournalEntry(c1, redis), store.publishBNLJournalEntry(c2, redis)]); assert.equal(both.some((r) => !r.ok && r.conflict), true);
  const failing = new FakeRedis({ failEval: true }); assert.deepEqual(await store.publishBNLJournalEntry({ ...p, entryId: 'entry-fail' }, failing), { ok: false, unavailable: true }); assert.equal(failing.kv.size, 0);
  const recovered = await store.publishBNLJournalEntry({ ...p, entryId: 'entry-fail' }, new FakeRedis()); assert.equal(recovered.ok, true);
  const rev2 = { ...p, revision: 2, title: 'Revision two title' }; rev2.contentHash = hash(rev2); assert.equal((await store.publishBNLJournalEntry(rev2, redis)).ok, true); assert.equal((await store.getBNLJournalEntry(p.entryId, redis)).value.revision, 2); assert.equal(redis.unrelated.get('other:key'), 'leave-me');
});

test('archive pagination, direct lookup, oldest neighbors, invalid pages, empty and unavailable states execute', async () => {
  const redis = new FakeRedis(); const base = payload().entry;
  assert.deepEqual((await store.listBNLJournalArchive(1, redis)).value.entries, []);
  for (let i = 1; i <= 120; i++) await store.publishBNLJournalEntry({ ...base, entryId: `many-${String(i).padStart(3, '0')}`, revision: 1, title: `Entry ${i}` , contentHash: hash({ ...base, entryId: `many-${String(i).padStart(3, '0')}`, revision: 1, title: `Entry ${i}` }) }, redis);
  for (let r = 2; r <= 20; r++) { const e = { ...base, entryId: 'revision-heavy', revision: r, title: `Revision ${r}` }; e.contentHash = hash(e); await store.publishBNLJournalEntry(e, redis); }
  assert.equal((await store.listBNLJournalArchive(1, redis)).value.entries.length, 9);
  assert.equal((await store.listBNLJournalArchive(14, redis)).value.hasOlder, false);
  const old = await store.getBNLJournalEntry('many-001', redis); assert.equal(old.ok, true); assert.equal(old.value.entryId, 'many-001');
  const neighbors = await store.getBNLJournalNeighbors('many-001', redis); assert.equal(neighbors.ok, true); assert.equal(Boolean(neighbors.value.newer), true);
  assert.equal(store.parseBNLJournalPage('Infinity'), null); assert.equal(store.parseBNLJournalPage('99999999999999999999'), null); assert.equal(store.parseBNLJournalPage('2'), 2);
  assert.deepEqual(await store.listBNLJournalArchive(1, null), { ok: false, unavailable: true });
});

test('React rendering escapes hostile article text and omits private/internal metadata', async () => {
  const entry = payload({ title: '<script>alert(1)</script>', excerpt: '**not markdown**', sections: [{ heading: '<b>head</b>', body: 'line <img src=x onerror=alert(1)>\nnext' }] }).entry;
  const stored = { ...entry, publishedAt: '2026-07-18T13:00:00Z', secret: 'hidden', sourceWindowStart: 'private' };
  const html = renderToStaticMarkup(React.createElement(article.JournalArticle, { entry: stored }));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /contentHash|sourceWindow|hidden|<script>|<img/);
  const empty = await journalPage.default({ searchParams: Promise.resolve({}) });
  assert.match(renderToStaticMarkup(empty), /Journal signal unavailable|No journal entries have been published yet\./);
});
