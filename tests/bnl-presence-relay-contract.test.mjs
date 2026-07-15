import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

let source = readFileSync(resolve('src/lib/bnl-presence-relay-contract.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);

const now = '2026-07-15T00:00:00.000Z';
const v1Body = { status: 'ONLINE', mode: 'OBSERVATION', message: 'relay speech', currentDirective: 'listen', source: 'forcePull', adminNote: 'private' };
const relayBody = { contractVersion: 2, kind: 'relay', relay: { relayId: 'relay-001', message: 'Substantive public relay speech.', currentDirective: 'A grounded line of inquiry.', sourceClass: 'approved_canon', trigger: 'scheduled' } };
const presenceBody = { contractVersion: 2, kind: 'presence', presence: { status: 'ONLINE', mode: 'OBSERVATION', source: 'heartbeat' } };

test('existing v1 POST payloads remain accepted and public view excludes adminNote', () => {
  const v1 = mod.parseV1Write(v1Body, now);
  assert.equal(v1.message, 'relay speech');
  const view = mod.buildCurrentView({ v1, persisted: true });
  assert.equal(view.message, 'relay speech');
  assert.equal(view.lastSeen, now);
  assert.equal(view.source, 'forcePull');
  assert.equal(JSON.stringify(mod.serializePublicCurrentView(view)).includes('private'), false);
});

test('v1-only storage produces flat response and safe combined view without stable legacy relay ID', () => {
  const view = mod.buildCurrentView({ v1: mod.parseV1Write({ ...v1Body, source: 'relay' }, now), persisted: false });
  assert.equal(view.status, 'ONLINE');
  assert.equal(view.relay.relayId, '');
  assert.equal(view.contractVersion, 2);
});

test('v2 presence writes cannot change relay speech timestamp or history', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  const presence = mod.parseV2PresenceWrite(presenceBody, '2026-07-15T00:01:00.000Z');
  const view = mod.buildCurrentView({ presence, relay, persisted: true });
  assert.equal(view.message, relay.message);
  assert.equal(view.lastSeen, now);
  assert.deepEqual(mod.upsertRelayHistory([relay], relay).history, [relay]);
});

test('repeated heartbeat/startup presence writes never create relay-history entries', () => {
  mod.parseV2PresenceWrite(presenceBody, now);
  mod.parseV2PresenceWrite({ ...presenceBody, presence: { ...presenceBody.presence, source: 'startup' } }, now);
  assert.deepEqual(mod.sanitizeRelayHistory([]), []);
});

test('v2 relay writes append exactly one accepted record and identical retries are idempotent', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  const first = mod.upsertRelayHistory([], relay);
  assert.equal(first.history.length, 1);
  const second = mod.upsertRelayHistory(first.history, relay);
  assert.equal(second.history.length, 1);
  assert.equal(second.changed, false);
});

test('conflicting relay-ID reuse is rejected', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  assert.throws(() => mod.upsertRelayHistory([relay], { ...relay, message: 'changed' }), /Relay ID conflict/);
});

test('malformed presence or relay envelopes cannot destroy last valid records', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  assert.throws(() => mod.parseV2PresenceWrite({ ...presenceBody, presence: { status: 'ONLINE' } }, now));
  assert.throws(() => mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, sourceClass: 'queue' } }, now));
  const view = mod.buildCurrentView({ relay, persisted: true });
  assert.equal(view.message, relay.message);
});

test('v1-only v2-only and mixed partial-cutover states resolve correctly and lastSeen tracks relay publication', () => {
  const v1 = mod.parseV1Write({ ...v1Body, source: 'relay' }, 'legacy-time');
  const presence = mod.parseV2PresenceWrite(presenceBody, 'heartbeat-time');
  const relay = mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, trigger: 'force_pull' } }, 'relay-time');
  assert.equal(mod.buildCurrentView({ v1, persisted: false }).lastSeen, 'legacy-time');
  const mixed = mod.buildCurrentView({ v1, presence, persisted: true });
  assert.equal(mixed.status, 'ONLINE');
  assert.equal(mixed.message, 'relay speech');
  const mixed2 = mod.buildCurrentView({ v1, relay, persisted: true });
  assert.equal(mixed2.mode, 'OBSERVATION');
  assert.equal(mixed2.lastSeen, 'relay-time');
  assert.equal(mixed2.source, 'forcePull');
});

test('only approved source classes and strict object keys are accepted', () => {
  assert.doesNotThrow(() => mod.parseV2RelayWrite(relayBody, now));
  assert.throws(() => mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, sourceClass: 'queue' } }, now));
  assert.throws(() => mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, extra: true } }, now));
});

test('public serialization excludes force-pull internals and Redis information', () => {
  const relay = mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, trigger: 'force_pull' } }, now);
  const json = JSON.stringify(mod.serializePublicCurrentView(mod.buildCurrentView({ relay, persisted: true })));
  assert.equal(json.includes('statusPath'), false);
  assert.equal(json.includes('bnl:'), false);
  assert.equal(json.includes('secret'), false);
});
