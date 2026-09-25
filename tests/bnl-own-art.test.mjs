import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
class TestDate extends Date { static now() { return Date.parse("2026-09-26T02:00:00Z"); } }
function load(file, mocks) {
  const cjsModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: cjsModule, exports: cjsModule.exports, require: id => mocks[id] ?? require(id), Buffer, process: { env: { BNL_OWN_ART_ENABLED: 'true' } }, Date: TestDate, Intl, URL, Request, Response, console });
  return cjsModule.exports;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN7sAAAAASUVORK5CYII=', 'base64');
const original = { artId: 'bnl-art-2026-09-25', title: 'Space Between', meaning: 'An imagined room made of rhythm.', createdAt: '2026-09-25T23:00:00Z', sha256: crypto.createHash('sha256').update(png).digest('hex'), journal: null, sourceJournals: [] };
const payload = art => ({ contractVersion: 1, kind: 'bnl_own_art', art, pngBase64: png.toString('base64') });
const canonicalJSON = x => x && typeof x === 'object' ? Array.isArray(x) ? '[' + x.map(canonicalJSON).join(',') + ']' : '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + canonicalJSON(x[k])).join(',') + '}' : JSON.stringify(x);
function fixture() {
  const state = { art: null, visible: true, reusable: true, put: 0, eval: 0, get: 0, afterUpload: null, afterGet: null };
  const redis = { get: async () => state.art, zrange: async () => state.art ? [state.art.artId] : [], eval: async (_s, _keys, args) => { state.eval++; state.art = JSON.parse(args[0]); return 'ok'; } };
  const journal = { entryId: 'daily-2026-09-25', revision: 1, contentHash: 'a'.repeat(64) };
  const lib = load('src/lib/bnl-own-art.ts', {
    '@/lib/bnl-journal-contract': { canonicalJSON },
    '@/lib/bnl-journal-store': {
      getBNLJournalRedis: () => redis,
      getBNLJournalEntry: async () => ({ ok: true, value: state.visible ? journal : null }),
      listJournalEntryControls: async () => [{ entryId: journal.entryId, memoryEligible: state.reusable }],
    },
    '@vercel/blob': {
      put: async (_path, _bytes, opts) => { state.put++; assert.equal(opts.access, 'private'); state.afterUpload?.(); },
      get: async () => { state.get++; state.afterGet?.(); return { statusCode: 200, stream: new Response(png).body }; },
    },
  });
  return { state, lib, journal };
}
test('bounded PNG packet verifies decoded original hash and Pacific creation day', () => {
  const { lib } = fixture();
  assert.ok(lib.validateOwnArt(payload(original), Date.parse('2026-09-26T00:00:00Z')));
  for (const mutated of [ { ...original, sha256: 'f'.repeat(64) }, { ...original, artId: 'bnl-art-2026-09-26' }, { ...original, privateNotes: 'secret' }, { ...original, journal: { entryId: 'bad' } } ]) assert.equal(lib.validateOwnArt(payload(mutated)), null);
  assert.equal(lib.validateOwnArt({ ...payload(original), pngBase64: 'a'.repeat(2_800_001) }), null);
  assert.equal(lib.validateOwnArt({ ...payload(original), pngBase64: Buffer.from('<svg/>').toString('base64') }), null);
});
test('UTC midnight still belongs to previous Pacific day', () => {
  const { lib } = fixture();
  const art = { ...original, createdAt: '2026-09-26T01:00:00Z' };
  assert.ok(lib.validateOwnArt(payload(art), Date.parse('2026-09-26T02:00:00Z')));
});
test('immutable published metadata rejects replacing daily image before blob writes', async () => {
  const { state, lib } = fixture();
  assert.equal((await lib.publishOwnArt(original, png)).ok, true);
  assert.equal((await lib.publishOwnArt({ ...original, title: 'Replacement' }, png)).conflict, true);
  assert.equal(state.put, 1);
});
test('Journal visibility withdrawn during upload prevents publication', async () => {
  const { state, lib, journal } = fixture();
  state.afterUpload = () => { state.visible = false; };
  assert.equal((await lib.publishOwnArt({ ...original, journal, sourceJournals: [journal] }, png)).conflict, true);
  assert.equal(state.eval, 0);
});
test('memory exclusion blocks new Journal-inspired publication without hiding existing public art', async () => {
  const { state, lib, journal } = fixture();
  state.reusable = false;
  assert.equal((await lib.publishOwnArt({ ...original, journal, sourceJournals: [journal] }, png)).conflict, true);
  assert.equal(state.put, 0);
  state.art = { ...original, journal, sourceJournals: [journal] };
  assert.ok(await lib.readOwnArt(original.artId));
});
test('hidden/revised Journal removes associated gallery and image access', async () => {
  const { state, lib, journal } = fixture();
  state.art = { ...original, journal, sourceJournals: [journal] };
  state.visible = false;
  assert.equal(await lib.readOwnArt(original.artId), null);
  assert.equal((await lib.listOwnArt()).length, 0);
  assert.equal(await lib.readOwnArtImage(original.artId), null);
  assert.equal(state.get, 0);
  state.visible = true;
  state.art.sourceJournals = [{ ...journal, revision: 2 }];
  assert.equal(await lib.readOwnArt(original.artId), null);
});
test('media rechecks Journal visibility after asynchronous blob access', async () => {
  const { state, lib, journal } = fixture();
  state.art = { ...original, journal, sourceJournals: [journal] };
  state.afterGet = () => { state.visible = false; };
  assert.equal(await lib.readOwnArtImage(original.artId), null);
});
test('authenticated endpoint rejects unauthorized, disabled, oversized and invalid packets', async () => {
  let enabled = true, published = 0;
  const { lib } = fixture();
  const route = load('src/app/api/bnl/art/route.ts', {
    '@/lib/bnl-journal-contract': { authenticateBNLJournalRequest: k => k === 'test-key' },
    '@/lib/bnl-own-art': { ...lib, ownArtEnabled: () => enabled, publishOwnArt: async art => { published++; return { ok: true, artId: art.artId, sha256: art.sha256 }; } },
  });
  const request = (body, key = 'test-key') => new Request('https://example.test/api/bnl/art', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body });
  assert.equal((await route.POST(request(JSON.stringify(payload(original)), 'wrong'))).status, 401);
  enabled = false;
  assert.equal((await route.POST(request(JSON.stringify(payload(original))))).status, 409);
  enabled = true;
  assert.equal((await route.POST(request(' '.repeat(2_850_001)))).status, 413);
  assert.equal((await route.POST(request('{}'))).status, 400);
  assert.equal(published, 0);
  assert.equal((await route.POST(request(JSON.stringify(payload(original))))).status, 200);
  assert.equal(published, 1);
});
test('empty art stays out of the Hub and a published piece has description plus Journal link', async () => {
  let pieces = [];
  const ui = load('src/components/BNLOwnArt.tsx', {
    '@/lib/bnl-own-art': { listOwnArt: async () => pieces },
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  });
  assert.equal(await ui.BNLOwnArtGallery(), null);
  pieces = [{ ...original, journal: { entryId: 'daily-2026-09-25' } }];
  const markup = renderToStaticMarkup(await ui.BNLOwnArtGallery());
  assert.match(markup, /Space Between/);
  assert.match(markup, /loading="lazy"/);
  assert.match(markup, /\/journal\/daily-2026-09-25/);
  assert.doesNotMatch(markup, /blob\.vercel/);
});

test('unlinked artwork still respects every Journal provided as creative input', async () => {
  const { state, lib, journal } = fixture();
  state.art = { ...original, journal: null, sourceJournals: [journal] };
  assert.ok(await lib.readOwnArt(original.artId));
  state.visible = false;
  assert.equal(await lib.readOwnArt(original.artId), null);
});
