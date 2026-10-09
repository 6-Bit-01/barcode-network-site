import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as title from '../public/games/system-clash/play/title-fx.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
const play=new URL('../public/games/system-clash/play/',import.meta.url);
const surface=()=>{const calls=[],ctx=new Proxy({}, {get(o,k){if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}});return k in o?o[k]:(...a)=>calls.push([k,...a]);}});return {calls,width:0,height:0,clientWidth:1280,clientHeight:720,getContext:()=>ctx};};
test('live title changes lightning geometry and logo slices without moving menu layout',()=>{
 const a=title.titleSignalFrame(510),b=title.titleSignalFrame(770);
 assert.ok(a.arcs?.length>=4,'Electric paths must be articulated, not only faded');assert.notDeepEqual(a.arcs,b.arcs);
 assert.ok(a.logo?.scan>=0);assert.notDeepEqual(a.logo,b.logo);
 assert.deepEqual(title.titleSignalFrame(770,{reducedMotion:true}),title.titleSignalFrame(510,{reducedMotion:true}));
 const canvas=surface(),logoCanvas=surface(),logoImage={complete:true,naturalWidth:1024,naturalHeight:440,classList:{add(){}}};
 const fx=title.createTitleFX(canvas,{logoCanvas,logoImage,imageFactory:()=>({complete:true,width:1280,height:400})});
 fx.draw(510);assert(logoCanvas.calls.some(([k,image])=>k==='drawImage'&&image===logoImage),'Native logo pixels must reach the animated logo surface');
 const first=logoCanvas.calls.filter(c=>c[0]==='drawImage');logoCanvas.calls.length=0;fx.draw(770);assert.notDeepEqual(logoCanvas.calls.filter(c=>c[0]==='drawImage'),first);
 assert.equal(fx.ownsAnimationLoop,false);
 const html=readFileSync(new URL('index.html',play),'utf8');assert.match(html,/id="title-logo-fx"/);assert.match(html,/alt="BARCODE: SYSTEM CLASH"/);
});
test('both cold digital transmission assets decode and contain embedded glyph art',async()=>{
 const manifest=JSON.parse(readFileSync(new URL('assets/ui/manifest.json',play),'utf8'));const sharp=(await import('sharp')).default;
 for(const key of ['endTransmission','transmissionEnded']){const asset=manifest.assets[key];assert.ok(asset,key+' is registered');const bytes=readFileSync(new URL('assets/ui/'+asset.file,play));const metadata=await sharp(bytes).metadata();assert.equal(metadata.width,820);assert.equal(metadata.height,154);assert.doesNotMatch(bytes.toString(),/<(?:text|image|script|foreignObject)\b|(?:href|src)=/i);assert.match(bytes.toString(),/data-glyphs=/);}
});
test('fight finish and result use their custom art, preserve winner captions and stop motion while paused',()=>{
 const canvas=surface(),renderer=createFightRenderer(canvas),endTransmission={},transmissionEnded={};renderer.prepareInterface({images:{endTransmission,transmissionEnded}});
 const fighters=[{id:'6-bit',name:'Six',hp:100,maxHp:100},{id:'9-bit',name:'Nine',hp:0,maxHp:100}];
 for(const [phase,image]of [['finish',endTransmission],['over',transmissionEnded]]){canvas.calls.length=0;renderer.draw({match:{fighters,phase,phaseTime:450,finisherAvailable:true,winner:0,finishRemaining:6000},art:[],views:[],reducedMotion:false});assert.ok(canvas.calls.some(([k,i])=>k==='drawImage'&&i===image),phase);assert.ok(canvas.calls.some(([k,t])=>k==='fillText'&&String(t).includes('SIX')));assert.ok(!canvas.calls.some(([k,t])=>k==='fillText'&&t==='DELETE HIM!'));}
});

test('transmission art freezes under reduced motion and invalid clock input is bounded',async()=>{
 const {transmissionBannerPlan,drawTransmissionBanner}=await import('../public/games/system-clash/play/transmission-art.mjs');assert.deepEqual(transmissionBannerPlan(NaN),transmissionBannerPlan(0));assert.deepEqual(transmissionBannerPlan(0,{reducedMotion:true}),transmissionBannerPlan(9000,{reducedMotion:true}));
 const a=surface(),b=surface(),art={images:{endTransmission:{}}};drawTransmissionBanner(a.getContext(),art,'endTransmission',500,{reducedMotion:true});drawTransmissionBanner(b.getContext(),art,'endTransmission',2000,{reducedMotion:true});assert.deepEqual(a.calls,b.calls);assert.notDeepEqual(transmissionBannerPlan(500),transmissionBannerPlan(900));
});

test('a failed native logo with CSS layout dimensions never stops title or input clock',()=>{
 const canvas=surface(),logoCanvas=surface(),image={complete:true,naturalWidth:0,naturalHeight:0,width:720,height:270,classList:{add(){throw Error('Failed logo must retain its fallback');}}};
 logoCanvas.getContext().drawImage=()=>{throw Error('InvalidStateError');};const fx=title.createTitleFX(canvas,{logoCanvas,logoImage:image,imageFactory:()=>({complete:true,width:1280,height:400})});assert.doesNotThrow(()=>fx.draw(650));assert.ok(canvas.calls.length>0);assert.equal(logoCanvas.calls.length,0);
});
