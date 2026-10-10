import test from 'node:test';
import assert from 'node:assert/strict';
import {keyFor,signatureFor,normalizeReviewEntries,reviewSummary,feedbackDocument} from '../public/games/system-clash/play/animation-review-feedback.mjs';

const index={gameRevision:'revision-7',runtimeSignature:'runtime-2',items:[
  {id:'lost/fighters/walk',fighterId:'lost-marbles',clipName:'walk',bank:'fighters',bankSignature:'walk-source-3'},
  {id:'scene/lost-deletion',fighterId:'lost-marbles',clipName:'delete-lost',bank:'scene',bankSignature:'scene-source-4'}
]};
const item=index.items[0], scene=index.items[1], stamp='2026-10-10T23:00:00.000Z';
const entry=(face,decision='approved',extra={})=>({id:item.id,facing:face,decision,notes:'',updatedAt:stamp,signature:signatureFor(item,index),...extra});

test('import rejects stale bank/runtime and foreign approvals without leaking prototype keys',()=>{
  const result=normalizeReviewEntries(index,[
    entry('right','approved',{notes:'Keep this facing'}),
    entry('left','approved',{signature:'old-source:'+index.runtimeSignature}),
    entry('left','approved',{signature:item.bankSignature+':old-runtime'}),
    entry('left','approved',{id:'foreign/fighters/walk'}),
    entry('up','approved'), null,
    JSON.parse('{"id":"__proto__","facing":"right","decision":"approved","notes":"","updatedAt":"","signature":"walk-source-3:runtime-2"}')
  ]);
  assert.equal(Object.getPrototypeOf(result.accepted),null);
  assert.deepEqual(Object.keys(result.accepted),[keyFor(item,'right')]);
  assert.equal(result.accepted[keyFor(item,'right')].decision,'approved');
  assert.equal(result.ignored,6);
  assert.equal({}.decision,undefined);
});

test('right and left decisions stay distinct and summary ignores stale records',()=>{
  const records={
    [keyFor(item,'right')]:entry('right','approved'),
    [keyFor(item,'left')]:entry('left','rejected',{notes:'Boot slides'}),
    [keyFor(scene,'right')]:{decision:'approved',notes:'old scene',updatedAt:stamp,signature:'old-scene:'+index.runtimeSignature}
  };
  const normalized=normalizeReviewEntries(index,records);
  assert.equal(normalized.accepted[keyFor(item,'right')].decision,'approved');
  assert.equal(normalized.accepted[keyFor(item,'left')].decision,'rejected');
  assert.deepEqual(reviewSummary(index,records),{total:4,approved:1,rejected:1,noted:1,unreviewed:2});
});

test('plain-container guard and known-key checks reject inherited or malformed entries',()=>{
  const inherited=Object.create({[keyFor(item,'right')]:entry('right')});
  for(const invalid of [inherited,new Date(),null,'approval']){
    assert.equal(Object.keys(normalizeReviewEntries(index,invalid).accepted).length,0);
  }
  const result=normalizeReviewEntries(index,{
    [keyFor(item,'right')]:entry('left'),
    [keyFor(item,'left')]:entry('left','unknown'),
    'foreign/right':entry('right')
  });
  assert.equal(result.ignored,3);
  assert.deepEqual(Object.keys(result.accepted),[]);
});

test('export keeps touched notes and cleared decisions, caps notes, and round-trips scene signatures',()=>{
  const records={
    [keyFor(item,'right')]:entry('right','unreviewed',{notes:'x'.repeat(9000)}),
    [keyFor(item,'left')]:entry('left','unreviewed'),
    [keyFor(scene,'right')]:{decision:'unreviewed',notes:'',updatedAt:'',signature:signatureFor(scene,index)},
    [keyFor(scene,'left')]:{decision:'approved',notes:'Scene approved',updatedAt:stamp,signature:signatureFor(scene,index)}
  };
  const doc=feedbackDocument(index,records);
  assert.equal(doc.schemaVersion,1);
  assert.equal(doc.gameRevision,index.gameRevision);
  assert.equal(doc.runtimeSignature,index.runtimeSignature);
  assert.ok(Number.isFinite(Date.parse(doc.exportedAt)));
  assert.equal(doc.entries.length,3);
  assert.equal(doc.entries[0].notes.length,8000);
  const sceneEntry=doc.entries.find(e=>e.id===scene.id);
  assert.equal(sceneEntry.signature,'scene-source-4:runtime-2');
  assert.equal(sceneEntry.bank,'scene');
  assert.deepEqual(reviewSummary(index,normalizeReviewEntries(index,doc.entries).accepted),doc.summary);
  assert.deepEqual(doc.summary,{total:4,approved:1,rejected:0,noted:2,unreviewed:3});
});
