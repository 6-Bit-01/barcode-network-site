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
  assert.equal(view.relay, null);
  assert.equal(JSON.stringify(mod.serializePublicCurrentView(view)).includes('private'), false);
});

test('v1-only storage produces flat response and safe combined view without stable legacy relay ID', () => {
  const view = mod.buildCurrentView({ v1: mod.parseV1Write({ ...v1Body, source: 'relay' }, now), persisted: false });
  assert.equal(view.status, 'ONLINE');
  assert.equal(view.relay, null);
  assert.equal(view.contractVersion, 2);
});

test('v2 presence writes cannot change relay speech timestamp or history', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  const presence = mod.parseV2PresenceWrite(presenceBody, '2026-07-15T00:01:00.000Z');
  const view = mod.buildCurrentView({ presence, relay, persisted: true });
  assert.equal(view.message, relay.message);
  assert.equal(view.lastSeen, now);
  assert.deepEqual(mod.decideRelayStorage({ current: relay, history: [relay], relay: { ...relay, publishedAt: 'retry-time' } }).history, [relay]);
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
  const retry = { ...relay, publishedAt: 'retry-time' };
  const second = mod.decideRelayStorage({ current: relay, history: first.history, relay: retry });
  assert.equal(second.history.length, 1);
  assert.equal(second.action, 'idempotent');
  assert.equal(second.relay.publishedAt, now);
});

test('conflicting relay-ID reuse is rejected', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  assert.equal(mod.decideRelayStorage({ current: relay, history: [relay], relay: { ...relay, message: 'changed' } }).action, 'conflict');
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
  assert.equal(mixed.relay, null);
});

test('only approved source classes and strict object keys are accepted', () => {
  assert.doesNotThrow(() => mod.parseV2RelayWrite(relayBody, now));
  assert.throws(() => mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, sourceClass: 'queue' } }, now));
  assert.throws(() => mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, extra: true } }, now));
});

test('public serialization excludes injected admin notes, force-pull internals, Redis information, and unknown fields', () => {
  const relay = mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, trigger: 'force_pull' } }, now);
  const serialized = mod.serializePublicCurrentView({ ...mod.buildCurrentView({ relay, persisted: true }), adminNote: 'private', statusPath: '/force-pull/status/r1', redisKey: 'bnl:relay:history:v2', secret: 'secret' });
  const json = JSON.stringify(serialized);
  assert.deepEqual(Object.keys(serialized), ['status', 'mode', 'message', 'currentDirective', 'source', 'lastSeen', 'persisted', 'contractVersion', 'presence', 'relay']);
  assert.equal(json.includes('private'), false);
  assert.equal(json.includes('statusPath'), false);
  assert.equal(json.includes('bnl:'), false);
  assert.equal(json.includes('secret'), false);
});

test('every legacy v1 source retains exact flat source and never becomes structured relay provenance', () => {
  for (const source of ['bot', 'startup', 'relay', 'heartbeat', 'showday', 'showtest', 'admin', 'reset', 'forcePull', 'unknown']) {
    const view = mod.buildCurrentView({ v1: mod.parseV1Write({ ...v1Body, source }, `${source}-time`), persisted: false });
    assert.equal(view.source, source);
    assert.equal(view.relay, null);
    assert.equal(JSON.stringify(view).includes('grounded_reflection'), false);
    assert.equal(JSON.stringify(view).includes('scheduled'), false);
  }
});

test('older archived identical relay retry cannot roll current relay backward', () => {
  const older = mod.parseV2RelayWrite(relayBody, 'older-time');
  const newer = mod.parseV2RelayWrite({ ...relayBody, relay: { ...relayBody.relay, relayId: 'relay-002', message: 'newer' } }, 'newer-time');
  const decision = mod.decideRelayStorage({ current: newer, history: [newer, older], relay: { ...older, publishedAt: 'retry-time' } });
  assert.equal(decision.action, 'idempotent');
  assert.equal(decision.relay.publishedAt, 'older-time');
});

test('new relay decision produces coordinated current/history persistence payload', () => {
  const relay = mod.parseV2RelayWrite(relayBody, now);
  const decision = mod.decideRelayStorage({ current: null, history: [], relay });
  assert.equal(decision.action, 'insert');
  assert.equal(decision.relay, relay);
  assert.deepEqual(decision.history, [relay]);
  const store = readFileSync(resolve('src/lib/bnl-status-store.ts'), 'utf8');
  assert.match(store, /redis\.multi\(\)\.set\(BNL_V2_RELAY_CURRENT_KEY, decision\.relay\)\.set\(BNL_V2_RELAY_HISTORY_KEY, decision\.history\)\.exec\(\)/);
  assert.match(store, /await redis\.multi\(\)\.set[\s\S]+memoryRelay = decision\.relay/);
});



test('v1 history sanitizer preserves original strict legacy history contract', () => {
  const valid = { timestamp: 't1', status: 'ONLINE', mode: 'OBSERVATION', currentDirective: 'listen', message: 'hello', source: 'showday', adminNote: 'operator' };
  const out = mod.sanitizeV1History([
    { timestamp: 'only' },
    { ...valid, status: 'BAD' },
    { ...valid, mode: 'BAD' },
    valid,
    { ...valid, source: 'bad-source', timestamp: 't2', message: 'fallback source' },
  ]);
  assert.deepEqual(out, [valid, { ...valid, source: 'unknown', timestamp: 't2', message: 'fallback source' }]);
});

test('v1 history append uses explicit original entry shape without lastSeen and preserves dedupe', () => {
  const status = mod.parseV1Write(v1Body, now);
  const entry = mod.v1HistoryEntryFromStatus(status, now, true);
  assert.equal('lastSeen' in entry, false);
  assert.deepEqual(Object.keys(entry), ['timestamp', 'status', 'mode', 'currentDirective', 'message', 'source', 'adminNote', 'persisted']);
  const first = mod.appendV1HistoryEntry([], entry);
  const second = mod.appendV1HistoryEntry(first, { ...entry, timestamp: 'later' });
  assert.equal(second.length, 1);
  assert.equal(second[0].timestamp, now);
});

test('malformed JSON path is classified as validation while infrastructure stays 500', () => {
  assert.equal(mod.errorStatus(new mod.BNLContractValidationError()), 400);
  assert.equal(mod.errorStatus(new Error('redis unavailable')), 500);
  const route = readFileSync(resolve('src/app/api/bnl/status/route.ts'), 'utf8');
  assert.match(route, /req\.json\(\)\.catch\(\(\) => \{ throw new BNLContractValidationError\(\); \}\)/);
  assert.match(route, /status === 400 \? "Invalid payload" : "Failed to update status"/);
});

test('error classification distinguishes validation conflict and infrastructure failures', () => {
  assert.equal(mod.errorStatus(new Error('redis failed')), 500);
  assert.equal(mod.errorStatus(new mod.BNLContractConflictError()), 409);
  try { mod.parseV2PresenceWrite({ contractVersion: 2, kind: 'presence', presence: {} }, now); } catch (error) { assert.equal(mod.errorStatus(error), 400); }
  const relay = mod.parseV2RelayWrite(relayBody, now);
  assert.equal(mod.decideRelayStorage({ current: relay, history: [relay], relay: { ...relay, message: 'changed' } }).action, 'conflict');
});

test('public and admin BNL routes use shared canonical resolver and no-store headers', () => {
  const publicRoute = readFileSync(resolve('src/app/api/bnl/status/route.ts'), 'utf8');
  const adminRoute = readFileSync(resolve('src/app/api/admin/bnl/route.ts'), 'utf8');
  const store = readFileSync(resolve('src/lib/bnl-status-store.ts'), 'utf8');
  assert.match(publicRoute, /resolveBNLCurrentView\(\)/);
  assert.match(adminRoute, /readBNLAdminState\(redis\)/);
  assert.match(store, /Cache-Control": "no-store, no-cache, must-revalidate"/);
  assert.match(publicRoute, /headers: BNL_NO_STORE_HEADERS/);
  assert.match(adminRoute, /headers: BNL_NO_STORE_HEADERS/);
});

test('admin manual relay writes v2 relay and standby reset only writes presence', () => {
  const adminRoute = readFileSync(resolve('src/app/api/admin/bnl/route.ts'), 'utf8');
  assert.match(adminRoute, /relayId: `admin-/);
  assert.match(adminRoute, /sourceClass: "approved_canon", trigger: "manual"/);
  assert.match(adminRoute, /await writeBNLRelay\(relay, redis\)/);
  const resetBlock = adminRoute.slice(adminRoute.indexOf('if (action === "updateStatus" || action === "resetStandby")'), adminRoute.indexOf('if (action === "clearHistory")'));
  assert.match(resetBlock, /await writeBNLPresence\(presence, redis\)/);
  assert.match(resetBlock, /if \(action === "updateStatus"\)/);
});
