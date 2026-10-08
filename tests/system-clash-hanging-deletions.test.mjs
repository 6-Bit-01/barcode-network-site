import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionPose} from '../public/games/system-clash/play/deletion-library.mjs';
import {newDeletionPositions,NEW_DELETIONS} from '../public/games/system-clash/play/new-deletion-library.mjs';

const hanging={nativeDuration:1100,combatPoses:{duration:1100,entries:[{start:0,end:1100,index:0}],frames:Object.fromEntries(['left','right'].map(facing=>[facing,[{bounds:{top:-360,bottom:0},sites:{head:{x:0,y:-300},torso:{x:0,y:-200}},hurt:[]}]]))}};
const legacy={thrown:{nativeDuration:640,airborneStartMs:100,airborneExtendedMs:260,airborneEndMs:420},knockdown:{nativeDuration:630},'delete-crumpled':{nativeDuration:700}};
const packed={...legacy,'delete-rip-front':hanging};
// Literal phase samples distinguish lifted/flying bodies from grounded or
// machine-specific outcomes. A wrong interval or an omitted branch fails these.
const airborne=[
 {id:'6-bit',times:[1100,1500,1799],fallback:'thrown',sample:1500,grounded:[1800,'delete-brace']},
 {id:'9-bit',times:[800,1100,1439],fallback:'thrown',sample:1100,grounded:[1440,'knockdown']},
 {id:'cache-back',times:[1650,1900,2199],fallback:'thrown',sample:1900,grounded:[2200,'delete-crumpled']},
 {id:'mac-modem',times:[1700,2400,3299],fallback:'delete-suspended',sample:2400,grounded:[3300,'delete-crumpled']},
 {id:'wittyf0x',times:[1750,2600,4299],fallback:'delete-suspended',sample:2600},
 {id:'mr-nice-guy',times:[1250,2500,3600,4239],fallback:'thrown',sample:3900,grounded:[4240,'knockdown']},
 {id:'kaveman-brown',times:[840,1100,1479],fallback:'thrown',sample:1100,grounded:[1480,'knockdown']},
 {id:'stolz',times:[850,1250,1699],fallback:'grabbed',sample:1250,grounded:[1700,'delete-brace']},
 {id:'dr3wbaby',times:[1750,2200,3250,3879],fallback:'delete-suspended',sample:2000,grounded:[3880,'knockdown']},
 {id:'dj-floppydisc',times:[2150,2500,2780,3500,3899],fallback:'delete-suspended',sample:3000},
 {id:'lyra',times:[850,1500,1850,2349],fallback:'thrown',sample:2100,grounded:[2350,'delete-crumpled']},
];
for(const example of airborne){
 test(example.id+' uses one native hanging frame throughout lifted/airborne victim phases',()=>{
  for(const time of example.times)assert.deepEqual(deletionPose('victim',time,example.id,packed,368),{clip:'delete-rip-front',elapsed:0});
  if(example.grounded)assert.equal(deletionPose('victim',example.grounded[0],example.id,packed,368).clip,example.grounded[1],'Contact restores the existing grounded/trapped outcome');
 });
 test(example.id+' preserves its existing victim fallback until the hanging source is packed',()=>{
  const result=deletionPose('victim',example.sample,example.id,legacy,368);assert.equal(result.clip,example.fallback);assert(Number.isFinite(result.elapsed)&&result.elapsed>=0);
 });
}
test('Oak retains the same hanging frame through closed grip, vertical tear and the frozen source ending',()=>{
 for(const time of [600,1000,1750,2400,2850,3500,5900])assert.deepEqual(deletionPose('victim',time,'papa-oak',packed,368),{clip:'delete-rip-front',elapsed:0});
 assert.equal(deletionPose('victim',500,'papa-oak',packed,368).clip,'high');
});
test('grounded falls, Mayhem head-only corpse, TV vise and Doof upright escape retain their native poses',()=>{
 for(const [id,time,expected]of [
  ['ash-flowers',2000,'low'],['ash-flowers',3400,'knockdown'],['ash-flowers',3630,'knockdown'],
  ['cliff',3300,'knockdown'],['cliff',3630,'knockdown'],
  ['ms-mayhem',1400,'knockdown'],['ms-mayhem',3000,'knockdown'],
  ['doofnoobler',1500,'high'],['doofnoobler',2300,'delete-shove'],['doofnoobler',2900,'walk'],
  ['6-bit',1800,'delete-brace'],['6-bit',3200,'delete-compressed'],
  ['dj-floppydisc',2000,'grabbed'],['dj-floppydisc',4000,'delete-suspended'],
 ])assert.equal(deletionPose('victim',time,id,packed,368).clip,expected,id+' '+time);
});
test('hanging availability never changes the attacker choreography or mutates body metadata',()=>{
 const before=JSON.stringify(packed);
 for(const id of ['6-bit','9-bit','cache-back','mac-modem','dj-floppydisc','ash-flowers','wittyf0x','cliff','kaveman-brown','stolz','dr3wbaby','mr-nice-guy','ms-mayhem','doofnoobler','lyra','papa-oak'])
  for(const time of [0,850,1500,2400,3600,4800])assert.deepEqual(deletionPose('attacker',time,id,packed,368),deletionPose('attacker',time,id,legacy,368));
 assert.equal(JSON.stringify(packed),before);
});
function pose(sites,bounds){return {combatPoses:{duration:1100,entries:[{start:0,end:1100,index:0}],frames:{left:[{sites,bounds}],right:[{sites,bounds}]}}};}
test('Lyra registers the new hanging torso continuously from lifted scratches to the unchanged basin floor',()=>{
 const clips={...packed,'delete-brace':pose({head:{x:0,y:-220},torso:{x:0,y:-100}},{top:-270,bottom:0}),'delete-crumpled':pose({head:{x:0,y:-70},torso:{x:0,y:-60}},{top:-100,bottom:0})};
 const match={winner:0,_deletionOrigin:{winner:300,near:400,target:700,originalVictim:700,direction:1,victimFacing:'left'},fighters:[{height:320,_clips:{'delete-claw':{contactStrikeOrigins:{right:{x:0,y:-350}}}}},{height:368,_clips:clips}]};
 const def=NEW_DELETIONS.lyra,before=newDeletionPositions(match,1849.999,def),release=newDeletionPositions(match,1850,def);
 assert(Math.abs(before.victimY-release.victimY)<.01,'Releasing one intact source does not jump its torso');
 assert.equal(release.victimY,-50,'Native hanging head aligns to the actual scratch height');
 const body=newDeletionPositions(match,2350,def);assert.equal(body.victimY,-35,'The original grounded body bottom reaches the retained litter plane');
});
