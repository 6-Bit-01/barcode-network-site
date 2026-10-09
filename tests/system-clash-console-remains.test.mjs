import test from 'node:test';
import assert from 'node:assert/strict';
const base='../public/games/system-clash/play/';
test('console intro progresses across original company marks and always permits skip',async()=>{
 const {consoleBootFrame,CONSOLE_BOOT_DURATION}=await import(base+'console-boot.mjs');
 assert.equal(consoleBootFrame(0).asset,'barcode-circuit-works');
 assert.equal(consoleBootFrame(1300).asset,'soft-signal-systems');
 assert.equal(consoleBootFrame(2400).asset,'channel-06-entertainment');
 assert.equal(consoleBootFrame(CONSOLE_BOOT_DURATION).complete,true);
 assert.equal(consoleBootFrame(1300,{reducedMotion:true}).offset,0);
});
test('shared anonymous remains preserve victim identity until impacts and use a standing skeleton before collapse',async()=>{
 const {marbleVictimState,remainsLayerPlan}=await import(base+'fight-remains.mjs');
 assert.equal(marbleVictimState(800).exposure,0);
 const a=marbleVictimState(2600),b=marbleVictimState(4200);
 assert.ok(a.exposure>0&&a.exposure<1);assert.equal(b.pose,'standing');assert.equal(b.exposure,1);
 assert.equal(marbleVictimState(5200).pose,'lying');
 const layers=remainsLayerPlan({height:385,progress:.5,pose:'hanging',seed:7});
 assert.equal(layers.pose,'hanging');assert.ok(layers.patches.length>8);
 assert.ok(layers.patches.every(f=>f.ragged&&Number.isFinite(f.x)&&Number.isFinite(f.y)));
 assert.deepEqual(remainsLayerPlan({height:385,progress:.5,pose:'hanging',seed:7}),layers);
 assert.equal(remainsLayerPlan({height:320,progress:1}).patches.length,0);
});
test('Lost Marbles has a spaced, timed barrage and retains bare skeletal aftermath',async()=>{
 const {deletionDefinition,deletionPose}=await import(base+'deletion-library.mjs');
 const {newDeletionPositions}=await import(base+'new-deletion-library.mjs');
 const d=deletionDefinition('lost-marbles');assert.equal(d?.mechanism,'marbles');assert.equal(d.retainFloorBody,true);
 assert.equal(deletionPose('attacker',1700,'lost-marbles',{'delete-marble':{nativeDuration:620,nativeContactMs:300}}).clip,'delete-marble');
 for(const direction of [-1,1]){const pos=newDeletionPositions({_deletionOrigin:{winner:640-direction*120,near:640-direction*170,target:640,originalVictim:640,winnerFacing:direction>0?'right':'left',direction}},900,d);assert.ok(direction*(pos.victimX-pos.winnerX)>=360);assert.equal(pos.victimY,0);}
});

test('torn body halves share a deterministic irregular seam instead of a straight surgical edge',async()=>{
 const {raggedSeam}=await import(base+'fight-remains.mjs');
 const seam=raggedSeam({x:100,top:0,bottom:450,scale:1});
 assert.deepEqual(seam,raggedSeam({x:100,top:0,bottom:450,scale:1}));
 assert.ok(Math.max(...seam.map(p=>p.x))-Math.min(...seam.map(p=>p.x))>12);
 assert.ok(seam.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.equal(seam[0].y,0);assert.equal(seam.at(-1).y,450);
});

test('anonymous anatomy loads only complete registered source crops',async()=>{const {readFileSync,existsSync}=await import('node:fs');const manifest=JSON.parse(readFileSync(new URL(base+'assets/remains/manifest.json',import.meta.url),'utf8'));assert.equal(manifest.anonymous,true);assert.equal(manifest.standingStages.length,4);for(const name of ['standing','hanging','lying',...manifest.standingStages]){const frame=manifest.frames[name];assert.ok(existsSync(new URL(base+'assets/remains/'+frame.file,import.meta.url)));assert.ok(frame.opaqueBounds[0]>=0&&frame.opaqueBounds[1]>=0);assert.ok(frame.opaqueBounds[2]<=frame.size[0]&&frame.opaqueBounds[3]<=frame.size[1]);if(frame.standingHeight)assert.equal(frame.opaqueBounds[3]-frame.opaqueBounds[1],frame.standingHeight);}const {loadRemainsArt}=await import(base+'fight-remains.mjs');await assert.rejects(()=>loadRemainsArt({bundle:{remains:{...manifest,anonymous:false}}}),/registration is invalid/);});
