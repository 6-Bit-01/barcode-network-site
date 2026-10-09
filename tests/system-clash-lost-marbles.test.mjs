import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import sharp from 'sharp';
import {demoRoster} from '../public/games/system-clash/play/demo-flow.mjs';
import {compileFightClip} from '../public/games/system-clash/play/fight-assets.mjs';
import {fightStatProfile,fightStatScalars,FIGHT_STAT_BUDGET} from '../public/games/system-clash/play/fight-stats.mjs';
import {FIGHT_AUDIO_PROFILES,FIGHT_VOCAL_BANKS,renderFightVocal} from '../public/games/system-clash/play/fight-audio.mjs';
import {planCharacterFoley} from '../public/games/system-clash/play/fight-audio-palettes.mjs';
const id='lost-marbles',hash=wave=>createHash('sha256').update(new Uint8Array(wave.buffer)).digest('hex');
test('Lost Marbles earns mobile pressure with the shared budget and gives up neutral health',()=>{
 const stats=fightStatProfile(id),scalars=fightStatScalars(id);assert.equal(Object.values(stats).reduce((a,b)=>a+b,0),FIGHT_STAT_BUDGET);assert(scalars.speedScale>1);assert(scalars.maxHealth<100);assert(scalars.powerScale<=1);
});
test('Lost Marbles has sixteen audible original effort takes and an independent articulation family',()=>{
 assert(FIGHT_AUDIO_PROFILES[id]);assert(FIGHT_VOCAL_BANKS[id]);const waves=new Set();
 for(const mode of ['attack','hurt','big-hurt','scream'])for(let variant=0;variant<4;variant++){
  const wave=renderFightVocal(id,mode,22050,variant);assert(wave.length>1500);assert(wave.every(Number.isFinite));assert(wave.some(sample=>Math.abs(sample)>.01));const digest=hash(wave);assert.notEqual(digest,hash(renderFightVocal('6-bit',mode,22050,variant)));waves.add(digest);
 }assert.equal(waves.size,16);assert.notEqual(FIGHT_VOCAL_BANKS[id].family,FIGHT_VOCAL_BANKS['6-bit'].family);
});
test('Lost Marbles produces four distinct bounded native chain-and-marble Foley gestures',()=>{
 const plans=[];for(let variant=0;variant<4;variant++){const plan=planCharacterFoley({type:'attack',attackerId:id},{variant,strength:1});assert(plan);assert(plan.layers?.length);assert(plan.layers.every(layer=>Number.isFinite(layer.gain)&&layer.gain>=0));plans.push(JSON.stringify(plan.layers));}assert.equal(new Set(plans).size,4);
});
test('Lost Marbles owns complete four-key native banks for every base and arcade action in both facings',async()=>{
 const root=new URL('../public/games/system-clash/play/assets/',import.meta.url);
 const required={fighters:['idle','walk','crouch','block','punch','kick','high','low','grabbed','thrown','knockdown','getup'],arcade:['low-punch','low-kick','jump','uppercut','crouch-punch','crouch-kick','jump-punch','jump-kick','pickup','crouch-high-kick','double-punch','power-kick']};
 for(const [bank,names] of Object.entries(required)){
  const base=new URL(`${bank}/${id}/`,root),manifestPath=new URL('manifest.json',base);assert(existsSync(manifestPath),`${bank} manifest is present`);const manifest=JSON.parse(readFileSync(manifestPath));assert.equal(manifest.height,320);
  for(const name of names){const data=manifest.clips[name];assert(data,`${bank}/${name}`);const imagePath=new URL(data.file,base);assert(existsSync(imagePath));const buffer=readFileSync(imagePath),meta=await sharp(buffer).metadata();assert.equal(createHash('sha256').update(buffer).digest('hex'),data.sourceSha256);assert(compileFightClip(data,{width:meta.width,height:meta.height},manifest,name));
   for(const facing of ['right','left']){const frames=data.frames[facing];assert.equal(frames.length,4,`${name}/${facing} four genuine keys`);assert.equal(new Set(frames.map(frame=>frame.canonicalPixelSha256)).size,4,'No duplicate padding keys');for(const frame of frames){assert(frame.poseSource?.sourceSha256);assert(frame.poseSource.sourceFile.includes(facing),'Facings have independently authored source sheets');assert(!frame.poseSource.sourceFile.includes('rejected'));const [left,top,width,height]=frame.rect,pixels=await sharp(buffer).extract({left,top,width,height}).ensureAlpha().raw().toBuffer();assert.equal(createHash('sha256').update(pixels).digest('hex'),frame.pixelSha256,'Atlas crop matches its native source receipt');for(const site of ['head','torso','legs','grip'])assert(frame.attachments[site]?.every(Number.isFinite));}
   }
  }
 }
});
test('Lost Marbles utilities remain his intact native identity and release marbles from the authored contact glove',async()=>{
 const base=new URL('../public/games/system-clash/play/assets/deletions/lost-marbles/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
 for(const name of ['front','rip-front','suspended','brace','compressed','shove','pull','stomp','crumpled','marble','present']){
  const data=manifest.clips[name];assert(data,name);const buffer=readFileSync(new URL(data.file,base)),meta=await sharp(buffer).metadata();const asset=compileFightClip(data,{width:meta.width,height:meta.height},manifest,'delete-'+name);
  for(const facing of ['right','left'])for(const frame of data.frames[facing]){assert(frame.poseSource.sourceFile.endsWith('.png'));assert(!frame.poseSource.sourceFile.includes('rejected'));assert(frame.attachments.grip?.every(Number.isFinite));assert(frame.anchor.every(Number.isFinite));}
  if(name==='marble'){assert.equal(data.contactMs,190);assert.equal(data.activeEndMs,280);assert.equal(asset.timeline.entries.find(entry=>190>=entry.start&&190<entry.end).index,2);for(const facing of ['right','left']){const frame=data.frames[facing][2],tip=frame.attachments.strike,grip=frame.attachments.grip;assert(Math.hypot(tip[0]-grip[0],tip[1]-grip[1])<2,'Projectile originates in the actual release glove');}}
  if(['rip-front','suspended'].includes(name))for(const facing of ['right','left']){assert.equal(data.frames[facing].length,4);assert(data.frames[facing].every(frame=>frame.poseSource.sourceFile==='front-'+facing+'.png'),'Front dangling victim keeps intact Lost clothing, hair and boots');}
 }
});
test('Lost Marbles occupies the requested enabled 18-fighter roster and previews his authored idle bank',()=>{
 const base=new URL('../public/games/system-clash/play/assets/',import.meta.url),roster=JSON.parse(readFileSync(new URL('menu/roster.json',base))),selection=demoRoster(roster.fighters??roster.mains);
 assert.deepEqual(selection.map(fighter=>fighter.id),['6-bit','cache-back','dj-floppydisc','mac-modem','cliff','mr-nice-guy','lost-marbles','ash-flowers','wittyf0x','lyra','papa-oak','ms-mayhem','stolz','kaveman-brown','dr3wbaby','doofnoobler','mutilator','9-bit']);assert(selection.every(fighter=>fighter.enabled),'Every registered fighter is playable');
 const manifest=JSON.parse(readFileSync(new URL('fighters/lost-marbles/manifest.json',base))),idle=manifest.clips.idle,menu=JSON.parse(readFileSync(new URL('menu/lost-marbles-idle.json',base)));
 // Collision bands belong to gameplay; every source, crop, root and attachment still matches the menu.
 const menuFrames=frames=>Object.fromEntries(Object.entries(frames).map(([facing,keys])=>[facing,keys.map(({combatHurt,combatProfile,combatPush,...frame})=>frame)]));
 assert.deepEqual(menuFrames(menu.frames),menuFrames(idle.frames));assert.deepEqual(menu.frameMs,idle.frameMs);assert.deepEqual(menu.order,idle.order);assert.equal(menu.heightScale,1);assert.deepEqual(readFileSync(new URL('menu/'+menu.file,base)),readFileSync(new URL('fighters/lost-marbles/'+idle.file,base)));
 for(const facing of ['right','left'])for(const frame of idle.frames[facing])assert(Math.abs(frame.anchor[0]-frame.attachments.legs[0])<.002,'A common body root prevents alternating lower boots from sliding the idle');
});