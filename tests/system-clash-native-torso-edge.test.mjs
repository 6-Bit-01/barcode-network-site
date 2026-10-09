import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeTorsoContactEdge,nativeTorsoBandEdge} from '../public/games/system-clash/play/new-deletion-renderer.mjs';

function nativeBody() {
 const width=24,height=30,alpha=new Uint8Array(width*height);
 for(let y=13;y<=18;y++)for(let x=8;x<=15;x++)alpha[y*width+x]=255;
 // A separate arm at the same height must not become the torso's left edge.
 for(let y=13;y<=18;y++)for(let x=1;x<=3;x++)alpha[y*width+x]=255;
 const frame={attachments:{torso:[12,15]},anchor:[0,0]};
 const pose={hurt:[
  {site:'torso',left:0,right:5,top:2,bottom:5},
  {site:'torso',left:1,right:4,top:13,bottom:19},
  {site:'torso',left:8,right:16,top:13,bottom:19}
 ]};
 return {frame,pose,mask:{width,height,alpha}};
}
test('native capture edge uses the actual torso row rather than the first alpha band',()=>{
 const {frame,pose,mask}=nativeBody();
 assert.equal(nativeTorsoContactEdge(frame,pose,mask,1,1),3);
 assert.equal(nativeTorsoContactEdge(frame,pose,mask,-1,1),-4);
});
test('native torso edge remains registered with authored anchor, offset and uniform scale',()=>{
 const {frame,pose,mask}=nativeBody();
 frame.anchor=[10,28];frame.offset=[2,-1];
 pose.hurt=pose.hurt.map(r=>({...r,left:(r.left-8)*2,right:(r.right-8)*2,top:(r.top-29)*2,bottom:(r.bottom-29)*2}));
 assert.equal(nativeTorsoContactEdge(frame,pose,mask,1,2),6);
 assert.equal(nativeTorsoContactEdge(frame,pose,mask,-1,2),-8);
});
test('missing or transparent torso rows never fabricate a contact edge',()=>{
 const {frame,pose,mask}=nativeBody();mask.alpha.fill(0);
 assert.equal(nativeTorsoContactEdge(frame,pose,mask,1,1),null);
});


test('maskless capture uses the measured trunk band beside the authored torso',()=>{
 const {frame,pose}=nativeBody();
 assert.equal(nativeTorsoBandEdge(frame,pose,1,1),4);
 assert.equal(nativeTorsoBandEdge(frame,pose,-1,1),-4);
 frame.anchor=[10,28];frame.offset=[2,-1];
 pose.hurt=pose.hurt.map(r=>({...r,left:(r.left-8)*2,right:(r.right-8)*2,top:(r.top-29)*2,bottom:(r.bottom-29)*2}));
 assert.equal(nativeTorsoBandEdge(frame,pose,1,2),8);
 assert.equal(nativeTorsoBandEdge(frame,pose,-1,2),-8);
});
test('a missing torso band does not substitute an arm or an unrelated height',()=>{
 const {frame,pose}=nativeBody();pose.hurt=pose.hurt.slice(0,1);
 assert.equal(nativeTorsoBandEdge(frame,pose,1,1),null);
});
