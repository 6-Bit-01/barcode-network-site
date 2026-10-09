import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawRemainsVictim,drawRemainsParticle} from '../public/games/system-clash/play/fight-remains.mjs';
import {createFightEffects} from '../public/games/system-clash/play/fight-effects.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
const manifest=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/remains/manifest.json',import.meta.url),'utf8'));
const bank={manifest,images:Object.fromEntries(Object.entries(manifest.frames).map(([key,f])=>[key,{key,width:f.size[0],height:f.size[1]}]))};
function context(){let matrix=[1,0,0,1,0,0];const stack=[],draws=[];const ctx=new Proxy({draws,save(){stack.push([...matrix]);},restore(){matrix=stack.pop();},translate(x,y){matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;},rotate(angle){const [a,b,c,d]=matrix,cos=Math.cos(angle),sin=Math.sin(angle);matrix[0]=a*cos+c*sin;matrix[1]=b*cos+d*sin;matrix[2]=c*cos-a*sin;matrix[3]=d*cos-b*sin;},scale(x,y){matrix[0]*=x;matrix[1]*=x;matrix[2]*=y;matrix[3]*=y;},drawImage(image,x,y,w,h){draws.push({key:image.key,image,x,y,w,h,matrix:[...matrix]});}}, {get:(target,key)=>key in target?target[key]:()=>{}});return ctx;}
const audio=()=>({emit(){},getStats:()=>({}),clear(){},setMuted(){},setReducedMotion(){},setPaused(){}});
function effect(seed=42){return createFightEffects({seed,audio:audio(),getRemainsArt:()=>bank});}
function render(fx){const ctx=context();fx.drawBehind(ctx);fx.drawFront(ctx);return ctx.draws;}
function opaqueBottom(draw){const f=manifest.frames[draw.key],b=f.opaqueBounds,[a,c,d,e,_x,y]=draw.matrix;return Math.max(...[[b[0],b[1]],[b[2],b[1]],[b[0],b[3]],[b[2],b[3]]].map(([u,v])=>y+c*(draw.x+u*draw.w/f.size[0])+e*(draw.y+v*draw.h/f.size[1])));}
for(const direction of [-1,1])for(const height of [200,420])test(`the exact last bare key and whole-body transform survive landing (${direction}, ${height})`,()=>{
 const falling=context(),settled=context();
 drawRemainsVictim(falling,bank,{x:640,height,progress:1,pose:'standing',fall:1,direction});
 drawRemainsVictim(settled,bank,{x:640,height,progress:1,pose:'lying',fall:1,direction});
 assert.equal(falling.draws[0].key,'standing-bare');assert.equal(settled.draws[0].key,'standing-bare','A separate lying source must not replace the deteriorated body');
 assert.deepEqual(settled.draws,falling.draws,'Settling retains the exact source, uniform scale, rotation and root');assert(Math.abs(opaqueBottom(settled.draws[0])-620)<1e-8);
});
test('native bone selection follows the struck region instead of turning torso fragments into skulls',()=>{
 const body=context();assert(drawRemainsParticle(body,bank,{material:'bone',region:'body',width:20,originX:641}));assert.equal(body.draws[0].key,'splinter');
 const head=context();assert(drawRemainsParticle(head,bank,{material:'bone',region:'head',nativeSprite:'skull',width:20,originX:640}));assert.equal(head.draws[0].key,'skull');
});
test('an explicitly seeded tissue cue is independent of its stage x coordinate',()=>{
 for(const originX of [640,641,642]){const ctx=context();assert(drawRemainsParticle(ctx,bank,{material:'organic',nativeSprite:'meat-shred',width:18,originX}));assert.equal(ctx.draws[0].key,'meat-shred');}
});
for(const direction of [-1,1])test(`settled native debris uses its rendered alpha geometry at the floor (${direction})`,()=>{
 const fx=effect();fx.emit({type:'deletion-impact',cue:'speaker-burial',site:'torso',strength:3.2,x:640,y:300,direction,victimId:'9-bit',victimHeight:420,aftermath:'body-rupture'});fx.update(10000);
 const draws=render(fx);assert(draws.length>12);for(const draw of draws){const bottom=opaqueBottom(draw);assert(bottom>=619.99&&bottom<=628.01,`${draw.key} must rest at its actual opaque bottom, received ${bottom}`);}assert(!draws.some(d=>d.key==='skull'),'Body compression sheds bone fragments, not unrelated whole skulls');
});
test('puncturing Deletions shed a restrained native tissue cue without a full-body rupture',()=>{
 for(const cue of ['arrow-hit','nail-strike']){const fx=effect();fx.emit({type:'deletion-impact',cue,x:640,y:300,strength:2.8,victimId:'9-bit',victimHeight:320});const stats=fx.getStats();assert(stats.organicChunks>0&&stats.organicChunks<=4);assert.equal(stats.rupturePileChunks,0);assert.equal(stats.boneChunks,0);assert(render(fx).every(d=>['meat-shred','meat-gristle'].includes(d.key)));}
});
test('Ash energy and Doof peaceful contact keep gore out of their signature effects',()=>{
 for(const event of [{cue:'heart-burst',attackerId:'ash-flowers'},{cue:'hug-contact',attackerId:'doofnoobler',peaceful:true}]){const fx=effect();fx.emit({type:'deletion-impact',x:640,y:300,strength:3.2,...event});assert.equal(fx.getStats().bloodParticles,0);assert.equal(fx.getStats().organicChunks,0);assert.equal(fx.getStats().chunks,0);assert.equal(fx.getStats().decals,0);assert.equal(fx.flash,0);if(!event.peaceful)assert(fx.getStats().energyParticles>0);}
});
test('native cue choice and trajectories reproduce independently of camera update cadence',()=>{
 const event={type:'deletion-impact',cue:'oak-rip',at:2100,site:'torso',strength:3.2,x:640,y:300,victimId:'9-bit',victimHeight:320};const a=effect(),b=effect();a.update(16);b.update(16);b.update(16);b.update(16);a.emit(event);b.emit(event);assert.deepEqual(render(a),render(b),'The same network event and seed must not depend on local animation frames');assert(render(a).some(d=>d.key==='meat-shred'));assert(render(a).some(d=>d.key==='meat-gristle'));
});
test('repeated physical Deletions retain bounded pools and clear their native cues',()=>{
 const fx=effect();for(let n=0;n<80;n++)fx.emit({type:'deletion-impact',cue:'compactor-crush',at:n*500,x:640,y:580,strength:3.4,victimId:'9-bit',aftermath:'body-rupture'});const s=fx.getStats();assert(s.chunks<=96);assert(s.particles<=420);assert(s.decals<=64);assert(s.smears<=14);fx.clear();assert.equal(fx.getStats().chunks,0);assert.equal(render(fx).length,0);
});

test('victim size uniformly scales native debris rather than stretching individual axes',()=>{
 const small=effect(),large=effect(),event={type:'deletion-impact',cue:'speaker-burial',at:2200,site:'torso',strength:3.2,x:640,y:300,victimId:'9-bit'};small.emit({...event,victimHeight:200});large.emit({...event,victimHeight:420});
 const a=render(small),b=render(large);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){assert.equal(a[i].key,b[i].key);assert(Math.abs(b[i].w/a[i].w-2.1)<1e-10);assert(Math.abs(b[i].h/a[i].h-2.1)<1e-10);}
});
const nativeBanks=new Map();
function nativeArt(id){if(nativeBanks.has(id))return nativeBanks.get(id);let manifest;const clips={};for(const folder of ['fighters','arcade','deletions']){const base=new URL(`../public/games/system-clash/play/assets/${folder}/${id}/`,import.meta.url),m=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));if(folder==='fighters')manifest=m;for(const [name,data]of Object.entries(m.clips)){const frames=Object.values(data.frames).flat(),size={width:Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),height:Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))},key=folder==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(data,size,m,key);}}const art={manifest,clips};nativeBanks.set(id,art);return art;}
const roster=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/fight-roster.json',import.meta.url),'utf8')).fighters.filter(f=>f.enabled);
for(const {id}of roster)test(`${id} routes its actual Deletion cues to appropriate bounded native effects`,async()=>{
 const {createMatch,advanceMatch,performAction,consumeEvents}=await import('../public/games/system-clash/play/fight-engine.mjs');const {deletionDefinition}=await import('../public/games/system-clash/play/deletion-library.mjs');const definition=deletionDefinition(id);assert(definition);
 const art=[nativeArt(id),nativeArt('9-bit')],match=createMatch({mode:'local',start:false,fighters:art.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata(art)});Object.assign(match,{phase:'finish',winner:0,finishRemaining:7000});match.fighters[0].x=500;match.fighters[1].x=660;match.fighters[1].hp=0;assert(performAction(match,0,'deletion'));consumeEvents(match);
 const fx=effect();for(let time=0;time<definition.duration+200;time+=50){advanceMatch(match,50);for(const event of consumeEvents(match))fx.emit({...event,victimHeight:368});}
 const stats=fx.getStats();assert(stats.chunks<=96);assert(stats.particles<=420);
 if(definition.peaceful||definition.mechanism==='positivity'){assert.equal(stats.bloodParticles,0);assert.equal(stats.organicChunks,0);assert.equal(stats.decals,0);}else{assert(stats.organicChunks>0,'Physical rupture or material dissolve retains a native remains cue');assert(render(fx).some(d=>['meat-shred','meat-gristle','splinter','skull'].includes(d.key)));}
});
