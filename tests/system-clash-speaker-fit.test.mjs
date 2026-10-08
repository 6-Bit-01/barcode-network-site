import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale,resolvePoseAttachments} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
const rendererURL=new URL('../public/games/system-clash/play/fight-renderer.mjs',import.meta.url);
const rendererSource=fs.readFileSync(rendererURL,'utf8').replace(new RegExp("from '([.]/[^']+)'","g"),(_,relative)=>"from '"+new URL(relative,rendererURL).href+"'");
const {speakerGeometry,speakerRockGeometry,machineViews,fittedSignatureCamera,additionalDeletionScene}=await import('data:text/javascript;base64,'+Buffer.from(rendererSource+'\nexport {speakerGeometry,speakerRockGeometry,machineViews,fittedSignatureCamera,additionalDeletionScene};').toString('base64'));
const root=fileURLToPath(new URL('../public/games/system-clash/play/assets/',import.meta.url));
function size(file){const bytes=Buffer.alloc(64),fd=fs.openSync(file,'r');try{fs.readSync(fd,bytes,0,64,0);}finally{fs.closeSync(fd);}if(bytes[0]===137)return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};assert.equal(bytes.toString('ascii',12,16),'VP8X');return {width:1+bytes.readUIntLE(24,3),height:1+bytes.readUIntLE(27,3)};}
function native(id){const clips={};let manifest;for(const bank of ['fighters','arcade','deletions']){const folder=path.join(root,bank,id),data=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));if(bank==='fighters')manifest=data;for(const [name,clip]of Object.entries(data.clips)){const key=bank==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(clip,size(path.join(folder,clip.file)),data,key);}}return {manifest,clips};}
const ids=['6-bit','9-bit','ash-flowers','cache-back','cliff','dj-floppydisc','doofnoobler','dr3wbaby','kaveman-brown','lyra','mac-modem','mr-nice-guy','ms-mayhem','papa-oak','stolz','wittyf0x'];
const arts=Object.fromEntries(ids.map(id=>[id,native(id)]));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'deletions/speaker-burial/atlas.json'),'utf8')),bank={manifest,image:size(path.join(root,'deletions/speaker-burial',manifest.file))},prop={additional:{'speaker-burial':bank}};
const sharp=(await import('sharp')).default,pixels=await sharp(path.join(root,'deletions/speaker-burial',manifest.file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function point(v,a,site){const c=a.clips[v.clip],i=poseFrameIndex(c,v),f=c.data.frames[v.facing][i],offset=f.offset??[0,0],raw=f.attachments?.[site],p=raw?{x:raw[0],y:raw[1]}:resolvePoseAttachments(f,v.clip,i,v.facing,a.manifest.id)[site],s=poseScale(c,f);return {x:v.x+(p.x+offset[0]-f.anchor[0])*s,y:620+(v.y??0)+(p.y+offset[1]-f.anchor[1])*s};}
function bounds(v,a){const c=a.clips[v.clip],f=c.data.frames[v.facing][poseFrameIndex(c,v)],o=f.offset??[0,0],b=f.opaqueBounds,s=poseScale(c,f);return {left:v.x+(b[0]+o[0]-f.anchor[0])*s,right:v.x+(b[2]+o[0]-f.anchor[0])*s,top:620+(v.y??0)+(b[1]+o[1]-f.anchor[1])*s,bottom:620+(v.y??0)+(b[3]+o[1]-f.anchor[1])*s};}
function scene(victim,facing){const source=[arts['kaveman-brown'],arts[victim]],match=createMatch({mode:'practice',fighters:source.map(a=>({id:a.manifest.id,height:a.manifest.height})),clips:combatMetadata(source)});match.fighters[0].x=facing==='right'?210:2350;match.fighters[1].x=match.fighters[0].x+(facing==='right'?1:-1)*75;assert(performAction(match,0,'deletion'));return {match,source};}
function views(match,source,time){match.deletionElapsed=time;return machineViews(match,prop,match.fighters.map((_,i)=>getFighterView(match,i)),source);}
function multiply(m,n){return [m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];}
function context(){const calls=[],stack=[];let matrix=[1,0,0,1,0,0];return new Proxy({calls},{get(target,key){
 if(key in target)return target[key];if(key==='save')return ()=>stack.push(matrix.slice());if(key==='restore')return ()=>{matrix=stack.pop();};
 if(key==='translate')return (x,y)=>{matrix=multiply(matrix,[1,0,0,1,x,y]);};if(key==='scale')return (x,y)=>{matrix=multiply(matrix,[x,0,0,y,0,0]);};if(key==='rotate')return a=>{matrix=multiply(matrix,[Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);};
 if(key==='drawImage')return (...args)=>calls.push({args,matrix:matrix.slice()});return ()=>{};
}});}
function drawBounds(match,source,time){const v=views(match,source,time),ctx=context();additionalDeletionScene(ctx,match,prop,v,source,false);additionalDeletionScene(ctx,match,prop,v,source,true);const draw=ctx.calls.find(c=>c.args[0]===bank.image);assert(draw,'Native whole speaker sprite is drawn');const frame=time>=deletionDefinition('kaveman-brown').beats.burial?manifest.frames.dead:manifest.frames.open,[sx,sy,sw,sh,dx,dy,dw,dh]=draw.args.slice(1),m=draw.matrix,b=frame.opaqueBounds;assert.deepEqual([sx,sy,sw,sh],frame.rect);assert(Math.abs(dw/sw-dh/sh)<1e-12);const corners=[b[0],b[2]].flatMap(x=>[b[1],b[3]].map(y=>{const localX=dx+x*dw/sw,localY=dy+y*dh/sh;return {x:m[0]*localX+m[2]*localY+m[4],y:m[1]*localX+m[3]*localY+m[5]};}));return {v,draw,corners,left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))};}
function cabinetAlpha(localX,localY){const f=manifest.frames.open,x=Math.round(f.rect[0]+localX),y=Math.round(f.rect[1]+localY);return pixels.data[(y*pixels.info.width+x)*4+3];}

for(const facing of ['left','right'])for(const id of ids)test('speaker native fit/contact/landing: '+id+' '+facing,()=>{
 const {match,source}=scene(id,facing),b=deletionDefinition('kaveman-brown').beats,atReach=views(match,source,b.stackReach),g=speakerGeometry(match,bank,atReach,source),body=bounds(atReach[1],source[1]);
 const expected=Math.max(source[0].manifest.height/(manifest.frames.open.opaqueBounds[3]-manifest.frames.open.opaqueBounds[1]),(body.right-body.left+16)/(manifest.frames.dead.opaqueBounds[2]-manifest.frames.dead.opaqueBounds[0]),(620-body.top+8)/(manifest.frames.dead.opaqueBounds[3]-manifest.frames.dead.opaqueBounds[1]));
 assert(Math.abs(g.scale-expected)<1e-9,'One minimum scale is justified by standing height and floor coverage');
 for(const time of [0,b.landed,b.stackReach,b.push,b.topple,b.topple+225,b.burial,b.present,b.complete])assert.equal(speakerGeometry(match,bank,views(match,source,time),source),g,'The identical fitted geometry is reused throughout the scene');
 for(let time=b.stackReach;time<b.topple;time+=25){
  const v=views(match,source,time),current=speakerGeometry(match,bank,v,source),rock=speakerRockGeometry(match,bank,v,source,current),hand=point(v[0],source[0],'grip'),dir=match._deletionOrigin.direction;
  assert(Math.hypot(hand.x-rock.grip.x,hand.y-rock.grip.y)<1e-6,'A whole native hand meets the cabinet before the stack follows');
  const c=Math.cos(rock.angle),s=Math.sin(rock.angle),wx=(hand.x-rock.x)*dir,wy=hand.y-rock.y,localX=rock.pivot[0]+(wx*c+wy*s)/g.scale,localY=rock.pivot[1]+(-wx*s+wy*c)/g.scale;
  assert(Math.abs(localX-manifest.frames.open.attachments.pushGrip[0])<1e-5,'Contact stays on the authored cabinet side');
  assert(cabinetAlpha(localX,localY)>=150,'Real source pixels support the native palm');
  assert.equal(v[0].y,0,'Contact does not stretch or lift the operator');assert.equal(rock.x,g.x,'The actual floor corner never moves during contact');assert.equal(rock.y,620);
 }
 for(let time=b.stackReach;time<=b.burial;time+=25){const rendered=drawBounds(match,source,time);assert(Math.abs(rendered.bottom-620)<1e-6,'Every intact rotated state touches the floor without sinking');}
 const dead=drawBounds(match,source,b.burial),fallen=bounds(dead.v[1],source[1]);
 assert(dead.left<=fallen.left-8+1e-6&&dead.right>=fallen.right+8-1e-6,'Final native pile covers both body edges with 8px clearance');
 assert(dead.top<=fallen.top-8+1e-6,'Final pile clears the full native floor height');assert.equal(dead.bottom,620);
 const fixedCamera=fittedSignatureCamera(match,prop,views(match,source,b.stackReach),source);
 for(const time of [b.stackReach,b.topple+225,b.burial,b.present]){
  const rendered=drawBounds(match,source,time),camera=fittedSignatureCamera(match,prop,rendered.v,source);assert.deepEqual(camera,fixedCamera,'One camera envelope is selected for the matchup');
  for(const p of rendered.corners){const x=640+(p.x-camera.x)*camera.zoom,y=380+(p.y-camera.y)*camera.zoom;assert(x>=40&&x<=1240&&y>=100&&y<=675,'Fixed scene camera includes the real cabinet and fall sweep');}
 }
});