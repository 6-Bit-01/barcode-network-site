import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
function screen(){const calls=[],state={globalAlpha:1,strokeStyle:''},stack=[];const ctx=new Proxy(state,{get(t,key){if(key in t)return t[key];if(key==='save')return ()=>stack.push({...state});if(key==='restore')return ()=>Object.assign(state,stack.pop());if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});return (...args)=>calls.push({key,args,alpha:state.globalAlpha,style:state.strokeStyle});}});const canvas={calls,getContext:()=>ctx};ctx.canvas=canvas;return canvas;}
for(const id of ['lyra','papa-oak'])for(const clip of ['low-kick','crouch-kick','jump-kick','crouch-high-kick','power-kick'])for(const facing of ['right','left'])test(`${id} ${clip} ${facing} never draws hand-to-paw connector FX`,()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/games/system-clash/play/assets/arcade/'+id+'/manifest.json',import.meta.url),'utf8')),data=manifest.clips[clip],frames=Object.values(data.frames).flat(),dimensions=data.sourceSize??[Math.max(...frames.map(f=>f.rect[0]+f.rect[2])),Math.max(...frames.map(f=>f.rect[1]+f.rect[3]))];
 const image={width:dimensions[0],height:dimensions[1]},asset=compileFightClip(data,image,manifest,clip),art={manifest:{...manifest,id},clips:{[clip]:asset}},metadata=combatMetadata([art])[0],canvas=screen(),renderer=createFightRenderer(canvas),before=JSON.stringify(metadata);
 const match={phase:'fight',combatTime:0,fighters:[{id,hp:100,maxHp:100,action:clip,actionTime:0,height:manifest.height,_clips:metadata}],stagePickups:[],projectiles:[],roundRemaining:90000};
 for(let elapsed=0;elapsed<asset.timeline.duration;elapsed+=16){canvas.calls.length=0;match.combatTime=elapsed;match.fighters[0].actionTime=elapsed;renderer.draw({match,art:[art],views:[{clip,elapsed,x:480,y:0,facing,airborne:false,opacity:1}],presentationTimeMs:elapsed});assert.equal(canvas.calls.filter(c=>c.key==='stroke'&&c.style==='#dbe5ef').length,0,'Only contact key2 is a paw; surrounding keys are measured guard hands');assert(canvas.calls.some(c=>c.key==='drawImage'&&c.args[0]===image&&c.alpha===1),'The unchanged native body remains visible');}
 assert.equal(JSON.stringify(metadata),before,'Visual repair does not rewrite physical contact geometry');
});
