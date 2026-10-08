import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale} from '../public/games/system-clash/play/fight-attachments.mjs';

function screen(){
 const calls=[],stack=[],state={globalAlpha:1,strokeStyle:'',transform:[1,0,0,1,0,0]};
 const ctx=new Proxy(state,{get(t,key){
  if(key in t)return t[key];
  if(key==='save')return ()=>stack.push({...state,transform:[...state.transform]});
  if(key==='restore')return ()=>Object.assign(state,stack.pop());
  if(key==='setTransform')return (...args)=>{state.transform=args;calls.push({key,args});};
  if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
  if(key==='beginPath')return ()=>{state.path=[];};
  if(key==='moveTo'||key==='lineTo')return (...args)=>{state.path?.push(args);};
  return (...args)=>calls.push({key,args,alpha:state.globalAlpha,style:state.strokeStyle,path:state.path?.map(p=>p.slice()),transform:state.transform.slice()});
 }});
 const canvas={calls,width:0,height:0,getContext:()=>ctx};ctx.canvas=canvas;return canvas;
}
function native(id,clip){
 const folder=new URL('../public/games/system-clash/play/assets/arcade/'+id+'/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('manifest.json',folder),'utf8'));
 // Ordinary reaction banks live with the original fighter atlas.
 if(!manifest.clips[clip]){
  const bank=clip.startsWith('delete-')?'deletions':'fighters';
  const original=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/'+bank+'/'+id+'/manifest.json',import.meta.url),'utf8'));
  manifest.clips[clip]=original.clips[clip.replace(/^delete-/,'')];
 }
 const data=manifest.clips[clip],frames=Object.values(data.frames).flat();
 const size=data.sourceSize??[Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))];
 const image={width:size[0],height:size[1],id},asset=compileFightClip(data,image,manifest,clip),art={manifest,clips:{[clip]:asset}},metadata=combatMetadata([art])[0];
 const match={phase:'fight',combatTime:0,fighters:[{id,name:manifest.character,height:manifest.height,hp:100,maxHp:100,action:clip,actionTime:0,_clips:metadata},{id:'9-bit',name:'Nine',hp:100,maxHp:100}],stagePickups:[],projectiles:[],roundRemaining:90000};
 return {art,asset,metadata,match};
}
function render(renderer,fixture,elapsed,y,time,flags={},extra={}){
 fixture.match.combatTime=elapsed;fixture.match.fighters[0].actionTime=elapsed;
 const view={clip:fixture.match.fighters[0].action,elapsed,x:480,y,facing:'right',opacity:1,airborne:true,...extra};
 renderer.draw({match:fixture.match,views:[view,...(fixture.other?[fixture.other.view]:[])],art:[fixture.art,...(fixture.other?[fixture.other.art]:[])],presentationTimeMs:time,...flags});return view;
}
const images=(canvas,image)=>canvas.calls.filter(c=>c.key==='drawImage'&&c.args[0]===image);
const wind=canvas=>canvas.calls.filter(c=>c.key==='stroke'&&c.style==='#dbe5ef');

for(const id of ['6-bit','9-bit','lyra','papa-oak'])for(const facing of ['left','right'])test('renderer echoes the exact intact native fall before its sharp body: '+id+' '+facing,()=>{
 const f=native(id,'thrown'),canvas=screen(),renderer=createFightRenderer(canvas),elapsed=f.asset.timeline.entries[1].start;
 const first=render(renderer,f,elapsed,-140,0,{}, {facing});const original=images(canvas,f.asset.image).at(-1);
 canvas.calls.length=0;render(renderer,f,elapsed+16,-124,16,{}, {facing});
 const body=images(canvas,f.asset.image),echo=body.filter(c=>c.alpha>0&&c.alpha<=.12);
 assert.equal(echo.length,1);assert.deepEqual(echo[0].args,original.args,'Previous full crop and destination are unchanged');
 assert.equal(body.at(-1).alpha,1);assert(canvas.calls.indexOf(echo[0])<canvas.calls.indexOf(body.at(-1)));
 const frame=f.asset.data.frames[facing][poseFrameIndex(f.asset,first)],scale=poseScale(f.asset,frame);
 assert.equal(echo[0].args[7]/frame.rect[2],echo[0].args[8]/frame.rect[3]);assert.equal(echo[0].args[7],frame.rect[2]*scale);
});
test('native crop offsets alone and grounded movement never masquerade as falling feet',()=>{
 const f=native('9-bit','thrown'),canvas=screen(),renderer=createFightRenderer(canvas);
 const first=f.asset.timeline.entries[1].start,next=f.asset.timeline.entries[2].start;
 render(renderer,f,first,0,0);const firstCrop=images(canvas,f.asset.image).at(-1);canvas.calls.length=0;render(renderer,f,next,0,16);
 assert.notDeepEqual(images(canvas,f.asset.image).at(-1).args.slice(1),firstCrop.args.slice(1),'Actual native crop changes while feet stay still');
 assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,0);
 canvas.calls.length=0;render(renderer,f,next+16,16,32,{}, {airborne:false});
 assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,0);
});
for(const id of ['6-bit','9-bit','lyra','papa-oak'])for(const facing of ['left','right'])test('renderer wind follows compiled native uppercut without style reach: '+id+' '+facing,()=>{
 const f=native(id,'uppercut'),canvas=screen(),renderer=createFightRenderer(canvas);f.match.fighters[0]._style={reach:999};
 let previous=null,seen=0;
 for(let elapsed=0;elapsed<f.asset.timeline.duration;elapsed+=16){
  canvas.calls.length=0;const view=render(renderer,f,elapsed,0,elapsed,{}, {facing,airborne:false});
  const index=poseFrameIndex(f.asset,view),pose=f.metadata.uppercut.combatPoses.frames[facing][index],to=[480+pose.strike.x,620+pose.strike.y];
  const lines=wind(canvas);
  if(lines.length){seen++;assert.deepEqual(lines.at(-1).path.at(-1),to,'Native strike ends the line');assert(Math.hypot(...lines.at(-1).path[1].map((v,i)=>v-lines.at(-1).path[0][i]))<=130.00001);}
  previous=to;
 }
 assert(seen>0,'Real native arm motion produces wind');assert(previous);
});
test('pause, both review modes, reduced motion and new match identity clear motion before resuming',()=>{
 for(const flags of [{paused:true},{reducedMotion:true},{motionReview:true},{deletionReview:true},{matchReset:true}]){
  const f=native('9-bit','thrown'),canvas=screen(),renderer=createFightRenderer(canvas),elapsed=f.asset.timeline.entries[1].start;
  render(renderer,f,elapsed,-160,0);render(renderer,f,elapsed+16,-144,16);
  canvas.calls.length=0;if(flags.matchReset)f.match={...f.match};
  render(renderer,f,elapsed+32,-128,32,flags);
  const postReset=images(canvas,f.asset.image).at(-1);
  assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,0,JSON.stringify(flags));
  canvas.calls.length=0;render(renderer,f,elapsed+48,-112,48);
  const resumed=images(canvas,f.asset.image).filter(c=>c.alpha<1);
  assert.equal(resumed.length,flags.matchReset?1:0,'Resume uses only post-reset observations');
  if(flags.matchReset)assert.deepEqual(resumed[0].args,postReset.args,'Echo comes from the new match only');
  canvas.calls.length=0;render(renderer,f,elapsed+64,-96,64);
  assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,flags.matchReset?2:1,'Fresh fall can resume');
 }
});
test('masked, erased, split, rotated, aftermath and source-excluded bodies discard old echoes',()=>{
 const cases=[{halfMask:1},{eraseProgress:.1},{splitBody:{gap:8}},{rotation:.1},{aftermath:{region:{x:80,y:90,rx:8,ry:9}}},{sourceExcluded:true}];
 for(const view of cases){
  const f=native('9-bit','thrown'),canvas=screen(),renderer=createFightRenderer(canvas),elapsed=f.asset.timeline.entries[1].start;
  render(renderer,f,elapsed,-160,0);render(renderer,f,elapsed+16,-144,16);
  assert(images(canvas,f.asset.image).some(c=>c.alpha<1),'Control fall produces an echo before exclusion');
  if(view.sourceExcluded)for(const frame of Object.values(f.asset.data.frames).flat())frame.sourceExclusions=[[0,0,2,2]];
  canvas.calls.length=0;render(renderer,f,elapsed+32,-128,32,{},view);
  assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,0,JSON.stringify(view));
 }
});
test('peaceful Doof finish suppresses motion through its ending, ordinary Doof combat still falls',()=>{
 const f=native('doofnoobler','thrown'),canvas=screen(),renderer=createFightRenderer(canvas),elapsed=f.asset.timeline.entries[1].start;
 render(renderer,f,elapsed,-160,0);canvas.calls.length=0;render(renderer,f,elapsed+16,-144,16);assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,1);
 // A completed peaceful scene still carries its winner/elapsed identity.
 f.match.phase='over';f.match.winner=0;f.match.deletionElapsed=5900;
 f.match._deletionOrigin={direction:1,victimFacing:'left',attacker:480,victim:800,target:750};f.match.deletionTargetX=750;
 // Retained ending needs its native presentation bank, separate from the fall fixture.
 const hug=native('doofnoobler','delete-hug');f.art.clips['delete-hug']=hug.asset;Object.assign(f.match.fighters[0]._clips,hug.metadata);
 const victim=native('9-bit','high');f.other={art:victim.art,view:{clip:'high',elapsed:210,x:800,y:0,facing:'left',opacity:1}};f.match.fighters[1]=victim.match.fighters[0];
 canvas.calls.length=0;assert.doesNotThrow(()=>render(renderer,f,elapsed+32,-128,32));assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,0);
});
test('motion world drawing leaves interface furniture fixed to the identity transform',()=>{
 const f=native('9-bit','thrown'),canvas=screen(),renderer=createFightRenderer(canvas),elapsed=f.asset.timeline.entries[1].start;
 const spec=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/ui/manifest.json',import.meta.url),'utf8'));
 const ui=Object.fromEntries(Object.entries(spec.assets).map(([key,a])=>[key,{key,width:a.width,height:a.height}]));renderer.prepareInterface({manifest:spec,images:ui});
 render(renderer,f,elapsed,-160,0,{effects:{camera:{x:8,y:-4}}});canvas.calls.length=0;
 f.match.mode='weapons';
 render(renderer,f,elapsed+16,-144,16,{effects:{camera:{x:8,y:-4}}});
 assert(canvas.calls.some(c=>c.key==='fillText'&&c.args[0]==='∞'),'Weapons timer retains its literal infinity glyph');
 const reset=canvas.calls.findLastIndex(c=>c.key==='setTransform'&&c.args.join(',')==='1,0,0,1,0,0');
 assert(images(canvas,f.asset.image).some(c=>c.alpha<1));
 const furniture=canvas.calls.map((c,index)=>({c,index})).filter(({c})=>c.key==='drawImage'&&c.args[0]?.key);
 assert(furniture.length>0);assert(furniture.every(({c,index})=>index>reset&&c.transform.join(',')==='1,0,0,1,0,0'));
});
test('guest snapshots preserve one presentation epoch, while a real reset discards it',()=>{
 const f=native('9-bit','thrown'),canvas=screen(),renderer=createFightRenderer(canvas),elapsed=f.asset.timeline.entries[1].start;
 render(renderer,f,elapsed,-160,0,{motionResetKey:1});f.match={...f.match};
 canvas.calls.length=0;render(renderer,f,elapsed+16,-144,16,{motionResetKey:1});
 assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,1,'A new snapshot object does not erase the same run');
 f.match={...f.match};canvas.calls.length=0;render(renderer,f,elapsed+32,-128,32,{motionResetKey:2});
 assert.equal(images(canvas,f.asset.image).filter(c=>c.alpha<1).length,0,'A new presentation epoch erases the previous run');
});
