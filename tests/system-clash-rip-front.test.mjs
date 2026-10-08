import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {compileFightClip,combatMetadata} from '../public/games/system-clash/play/fight-assets.mjs';
import {poseFrameIndex,poseScale} from '../public/games/system-clash/play/fight-attachments.mjs';
import {createMatch,performAction,getFighterView} from '../public/games/system-clash/play/fight-engine.mjs';
import {createFightRenderer} from '../public/games/system-clash/play/fight-renderer.mjs';
import {registerNewDeletionViews} from '../public/games/system-clash/play/new-deletion-renderer.mjs';
import {deletionDefinition} from '../public/games/system-clash/play/deletion-library.mjs';
const ROOT=new URL('../public/games/system-clash/play/',import.meta.url);
const json=url=>JSON.parse(readFileSync(url,'utf8'));
const APPROVED=[
 {
  "id": "6-bit",
  "height": 308.55,
  "scale": 0.51,
  "axisX": 374,
  "region": [
   0,
   0,
   627,
   627
  ],
  "originalFile": "lift-four-airborne-approved-v1.png",
  "bytes": 1022936,
  "size": [
   1254,
   1254
  ],
  "sha256": "a8995f0dd42e5812d14852b0c839054439f30bc8d184c347e2d1b8ba881f5c73",
  "rgbaSha256": "74d65651c974ba0b75140bb261b26fa1d1524c65ba550eb13abc486432eca16c",
  "alphaSha256": "ccef9eae9b705fed8c8b6d79e8b99788f520702f283cf64672180fff73cc0d6e",
  "regionRgbaSha256": "465ec0972241a8d1b74bddb7cc0302fe0d62ad53cac562db8feb2ff1dec3891c"
 },
 {
  "id": "9-bit",
  "height": 363.0,
  "scale": 0.6,
  "axisX": 295,
  "region": [
   627,
   0,
   1254,
   627
  ],
  "originalFile": "lift-four-airborne-approved-v1.png",
  "bytes": 1022936,
  "size": [
   1254,
   1254
  ],
  "sha256": "a8995f0dd42e5812d14852b0c839054439f30bc8d184c347e2d1b8ba881f5c73",
  "rgbaSha256": "c771e0d18e49cb1b0c1d237c225ef62844ba8af0bc31b379c53043a61941496a",
  "alphaSha256": "3490a20154ac2dec9e560bc95089ed247495372c1fe95bd48b2fae66f0712649",
  "regionRgbaSha256": "6262e53e2dd9ced2d9ba866afc90783536ee2967f2d7e59d7bf24d85fe64ae62"
 },
 {
  "id": "cache-back",
  "height": 292.53,
  "scale": 0.49,
  "axisX": 355,
  "region": [
   0,
   627,
   627,
   1254
  ],
  "originalFile": "lift-four-airborne-approved-v1.png",
  "bytes": 1022936,
  "size": [
   1254,
   1254
  ],
  "sha256": "a8995f0dd42e5812d14852b0c839054439f30bc8d184c347e2d1b8ba881f5c73",
  "rgbaSha256": "607e284c8031669057b0ece70a7504021e776195dd0b96217196857e45260400",
  "alphaSha256": "a389c2e9623f38f5fa8a05a2fe498c34dbb210fd85d02e8b0b39213b3ca84ac0",
  "regionRgbaSha256": "7be017b91c8b3d9853e8a9bf8ba7ed9d647c53710e26c7f271220c1cdfac5883"
 },
 {
  "id": "cliff",
  "height": 281.53,
  "scale": 0.47,
  "axisX": 290,
  "region": [
   627,
   627,
   1254,
   1254
  ],
  "originalFile": "lift-four-airborne-approved-v1.png",
  "bytes": 1022936,
  "size": [
   1254,
   1254
  ],
  "sha256": "a8995f0dd42e5812d14852b0c839054439f30bc8d184c347e2d1b8ba881f5c73",
  "rgbaSha256": "d80cfd8d74d01bdfa1e36a953f5852f62a840059752427c9f1bbc6046bbb5262",
  "alphaSha256": "4ec6c148060c906d7d190c425a6751d741523c17b1f91fd39edc611d98f35d5a",
  "regionRgbaSha256": "543a73cfc1f20fdfe09f4b9e9f67f78b5ca7178348c1a3a0a1a3cfa7c6e282ac"
 },
 {
  "id": "dj-floppydisc",
  "height": 271.46,
  "scale": 0.49,
  "axisX": 346,
  "region": [
   0,
   0,
   623,
   574
  ],
  "originalFile": "lift-four-airborne-approved-sheet-2-v1.png",
  "bytes": 1175836,
  "size": [
   1247,
   1261
  ],
  "sha256": "433088b698f8fc3b7771f47c8dce3d7e3928a85a5b8e8ab920c389fa29867748",
  "rgbaSha256": "c95660116c71b6aa7c74ff2aaed2e789036db130e4202e0cb64cd4018f25dd07",
  "alphaSha256": "abf559c5b649cd3e614a50a1b2a580d942cd3437c34e77ef990ab3777f05983e",
  "regionRgbaSha256": "f40982c4f0582a850acf069fb4a572233f7d27e340e7d1ad55e3d15d54ae1553"
 },
 {
  "id": "mac-modem",
  "height": 300.9,
  "scale": 0.51,
  "axisX": 285,
  "region": [
   623,
   0,
   1247,
   603
  ],
  "originalFile": "lift-four-airborne-approved-sheet-2-v1.png",
  "bytes": 1175836,
  "size": [
   1247,
   1261
  ],
  "sha256": "433088b698f8fc3b7771f47c8dce3d7e3928a85a5b8e8ab920c389fa29867748",
  "rgbaSha256": "5f46657d5d4904fbfab9f12b804e6edba930e799e5cc692263ca9d4303efcb25",
  "alphaSha256": "22bf8d321e9696711859fb421b4656fd5f2c5b138c1e6bfeaf04a8d6824d07d7",
  "regionRgbaSha256": "51d703fbb50e41c6578cfded253b2a34a9844ed16494038206c84f184bbb6728"
 },
 {
  "id": "mr-nice-guy",
  "height": 318.5,
  "scale": 0.5,
  "axisX": 348,
  "region": [
   0,
   574,
   623,
   1261
  ],
  "originalFile": "lift-four-airborne-approved-sheet-2-v1.png",
  "bytes": 1175836,
  "size": [
   1247,
   1261
  ],
  "sha256": "433088b698f8fc3b7771f47c8dce3d7e3928a85a5b8e8ab920c389fa29867748",
  "rgbaSha256": "a9a5148c6400538abfeda182b71fe81ddc5815babfc112278e2128893a1261a9",
  "alphaSha256": "ad52a019a3a73c4cfdd4e8e22532e110ccd90c0490c5bd0f191dd464fba0c346",
  "regionRgbaSha256": "4e230337e7da8ff81a8f2e0c87c9700f151b10eec688c9b5c7989db4d9800e29"
 },
 {
  "id": "ms-mayhem",
  "height": 288.58,
  "scale": 0.47,
  "axisX": 270,
  "region": [
   623,
   603,
   1247,
   1261
  ],
  "originalFile": "lift-four-airborne-approved-sheet-2-v1.png",
  "bytes": 1175836,
  "size": [
   1247,
   1261
  ],
  "sha256": "433088b698f8fc3b7771f47c8dce3d7e3928a85a5b8e8ab920c389fa29867748",
  "rgbaSha256": "2cd627825634ead265c9025e4262852abffc6dcdb3f35148c3f59aac926ad728",
  "alphaSha256": "25ca38bd62200d12dd4b00ebd1c31da60f442f50292654692323182c6cd2a135",
  "regionRgbaSha256": "7e5a0ab9e54a940a9d351f0649c0aa79bf61559ec90fc6b31d7fac965121479f"
 },
 {
  "id": "stolz",
  "height": 293.02,
  "scale": 0.49,
  "axisX": 363,
  "region": [
   0,
   0,
   623,
   634
  ],
  "originalFile": "lift-four-airborne-approved-sheet-3-v1.png",
  "bytes": 1148232,
  "size": [
   1247,
   1261
  ],
  "sha256": "890267f651571bf80523a21baaa9e93804310606883d38a7e460505221391a1b",
  "rgbaSha256": "21f879e0537d3dfd3e28390b68994826e40ff05bd65c9c7ddbc2abd90c111565",
  "alphaSha256": "e4af298b8ada2bf864710ea0858e0523d756945c3d3374f41d6ac6d428331372",
  "regionRgbaSha256": "c7ac3ab7c619dde0b879be0ed75c943b2c71b02f4057993abed1ec836f91d626"
 },
 {
  "id": "kaveman-brown",
  "height": 299.37,
  "scale": 0.51,
  "axisX": 290,
  "region": [
   623,
   0,
   1247,
   634
  ],
  "originalFile": "lift-four-airborne-approved-sheet-3-v1.png",
  "bytes": 1148232,
  "size": [
   1247,
   1261
  ],
  "sha256": "890267f651571bf80523a21baaa9e93804310606883d38a7e460505221391a1b",
  "rgbaSha256": "7da67f368643ac4e9f084a2c7647248ad359688744caab1346500e60a3769f53",
  "alphaSha256": "c862856423ede7a2b9efda1635422f2e389f19dcfc01f5c6d1c5da0e22915eeb",
  "regionRgbaSha256": "8a7469ac5844cb4fcee6482b3fff6e11993583c79f57dd2def09100f23c60ac8"
 },
 {
  "id": "dr3wbaby",
  "height": 281.28,
  "scale": 0.48,
  "axisX": 374,
  "region": [
   0,
   634,
   623,
   1261
  ],
  "originalFile": "lift-four-airborne-approved-sheet-3-v1.png",
  "bytes": 1148232,
  "size": [
   1247,
   1261
  ],
  "sha256": "890267f651571bf80523a21baaa9e93804310606883d38a7e460505221391a1b",
  "rgbaSha256": "507c0da5973296237e1df167b20d7de88daa72331d078aa5e7d7a7fdff9263a4",
  "alphaSha256": "d551238c2f385b3473ae0dfd41593a9319c482012363c07c8473db61007851bf",
  "regionRgbaSha256": "284d2a294fbdddc085bc289d7951e2fed32d332c93748a7d3fb8e3f190455759"
 },
 {
  "id": "ash-flowers",
  "height": 282.24,
  "scale": 0.49,
  "axisX": 300,
  "region": [
   623,
   634,
   1247,
   1261
  ],
  "originalFile": "lift-four-airborne-approved-sheet-3-v1.png",
  "bytes": 1148232,
  "size": [
   1247,
   1261
  ],
  "sha256": "890267f651571bf80523a21baaa9e93804310606883d38a7e460505221391a1b",
  "rgbaSha256": "77b1a649e9e70d2f275e0872055be80def385eda282296b1277fd1c7644d17a0",
  "alphaSha256": "4be4d707398276c785dec9249191a3b8f86d93e148e4b4ce4d0dc4fd28e8ffa0",
  "regionRgbaSha256": "6bf6b443b93d4c6b2d91085f41fef1c553ab05ee7532b28d8158c16330446ae2"
 },
 {
  "id": "wittyf0x",
  "height": 269.1,
  "scale": 0.39,
  "axisX": 314,
  "region": [
   0,
   0,
   512,
   719
  ],
  "originalFile": "lift-four-airborne-approved-sheet-4-v1.png",
  "bytes": 2599121,
  "size": [
   1024,
   1536
  ],
  "sha256": "0d294672aeba9df840ebb6f04375c22268e9f8085cfd03078c252c1c2ba79978",
  "rgbaSha256": "849a99a42ef2bb274c193d24b19f095efd2f25e191c88924cafa14333e18bf6a",
  "alphaSha256": "12726673088455dfc0a199df9063b5cdfea459355fe9be21082811eba57f35e5",
  "regionRgbaSha256": "4fd3ce6be57e09d2afcfcba91d3d4f96f0bead5e88f53752f8f6eeab3cf9ed30"
 },
 {
  "id": "doofnoobler",
  "height": 213.35999999999999,
  "scale": 0.42,
  "axisX": 264,
  "region": [
   512,
   0,
   1024,
   672
  ],
  "originalFile": "lift-four-airborne-approved-sheet-4-v1.png",
  "bytes": 2599121,
  "size": [
   1024,
   1536
  ],
  "sha256": "0d294672aeba9df840ebb6f04375c22268e9f8085cfd03078c252c1c2ba79978",
  "rgbaSha256": "8516220b884b953617a1d7307a2fd197e7363e73f23e046c8b71c8d8b7065c30",
  "alphaSha256": "7d8e6899b14b847b438f9dde198bb0295232ce7e782ff9d435cefd80df9f6fe0",
  "regionRgbaSha256": "d176c5072744b624d1d80bc7f8fdae0789d0857c18a118eadd3d9d9236e036ba"
 },
 {
  "id": "lyra",
  "height": 316.05,
  "scale": 0.43,
  "axisX": 300,
  "region": [
   0,
   719,
   480,
   1536
  ],
  "originalFile": "lift-four-airborne-approved-sheet-4-v1.png",
  "bytes": 2599121,
  "size": [
   1024,
   1536
  ],
  "sha256": "0d294672aeba9df840ebb6f04375c22268e9f8085cfd03078c252c1c2ba79978",
  "rgbaSha256": "9b18dfc5716d64868dbb26d86047eea74e19650b5754422f1c04958f1734a8d4",
  "alphaSha256": "ad97a2e9d9649acbd7df5c048b747079b994871d145cdd7232d351642afcd340",
  "regionRgbaSha256": "c7ac128ffb07ec466b61b1d4120645bb54b686ce233a2422308bda68b7a278bb"
 },
 {
  "id": "papa-oak",
  "height": 378.12,
  "scale": 0.46,
  "axisX": 292,
  "region": [
   480,
   672,
   1024,
   1536
  ],
  "originalFile": "lift-four-airborne-approved-sheet-4-v1.png",
  "bytes": 2599121,
  "size": [
   1024,
   1536
  ],
  "sha256": "0d294672aeba9df840ebb6f04375c22268e9f8085cfd03078c252c1c2ba79978",
  "rgbaSha256": "aff7c2c601684e82c0bc80b6dd00d402f735083497a1684460a3e525fb46eddd",
  "alphaSha256": "6f2a87d01dfe2f2e1b6481309793eaf740d67119f4c39c3847968402890d19fd",
  "regionRgbaSha256": "403727c5aa410122c0ff729418f7eef4dc9564070ea1a947ac75986526630d30"
 }
];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const cache=new Map();
async function imageFor(url){if(!cache.has(url.href))cache.set(url.href,sharp(readFileSync(url)).metadata().then(info=>({width:info.width,height:info.height,path:url.href})));return cache.get(url.href);}
async function source(id){const manifest=json(new URL(`assets/fighters/${id}/manifest.json`,ROOT)),clips={};for(const bank of ['fighters','arcade','deletions']){const path=new URL(`assets/${bank}/${id}/manifest.json`,ROOT),data=json(path);for(const [name,value]of Object.entries(data.clips)){const key=bank==='deletions'?'delete-'+name:name;clips[key]=compileFightClip(value,await imageFor(new URL(value.file,path)),data,key);}}return {manifest,clips};}
function screen(){const calls=[],ctx=new Proxy({}, {get(target,key){if(key in target)return target[key];if(String(key).startsWith('create')&&String(key).endsWith('Gradient'))return ()=>({addColorStop(){}});return (...args)=>calls.push([key,...args]);}});return {calls,getContext(){return ctx;}};}

for(const expected of APPROVED){
const deletionURL=new URL(`assets/deletions/${expected.id}/manifest.json`,ROOT),deletion=json(deletionURL);
const front=()=>{assert.ok(deletion.clips['rip-front'],`Approved original-reference ${expected.id} front pose is required`);return deletion.clips['rip-front'];};
test(`${expected.id}: original-reference front body is one frozen native pose shared exactly by both facings`,async()=>{
 const data=front(),image=await imageFor(new URL(data.file,deletionURL));
 assert.ok(data.frontPoseSource.identityReferences.length>=1,'Actual original identity references are retained');for(const reference of data.frontPoseSource.identityReferences){assert.ok(reference.size[0]>0&&reference.size[1]>0);assert.ok(!reference.path.includes('gallery-assets'));assert.match(reference.sha256,/^[a-f0-9]{64}$/);}
 assert.deepEqual(data.order,[0]);assert.equal(data.frameMs,1100);assert.equal(data.contactMs,300);assert.equal(data.loop,false);
 assert.deepEqual(data.frames.left,data.frames.right);assert.equal(data.frames.left.length,1);
 const frame=data.frames.right[0];assert.deepEqual(frame.rect,[0,0,image.width,image.height]);assert.equal(frame.attachments.ripCut[0],image.width/2);assert.equal(frame.anchor[0],image.width/2);
 assert.deepEqual(frame.attachments.ripCut,frame.attachments.torso);
 assert.ok(frame.attachments.armLeft[0]<frame.attachments.ripCut[0]&&frame.attachments.armRight[0]>frame.attachments.ripCut[0]);
 assert.equal(frame.attachments.torso[0],frame.attachments.ripCut[0]);assert.equal(data.poseRole,'airborne');
 const clip=compileFightClip(data,image,{...deletion,scale:99},'delete-rip-front');
 for(const facing of ['left','right'])for(const elapsed of [0,300,1099,1100,9000])assert.equal(poseFrameIndex(clip,{facing,elapsed,clip:'delete-rip-front'}),0);
});

test(`${expected.id}: front pose decoded pixels and alpha retain their accepted native source hashes and native anatomy scale without a second manifest scale`,async()=>{
 const data=front(),image=await imageFor(new URL(data.file,deletionURL)),frame=data.frames.right[0],clip=compileFightClip(data,image,{...deletion,scale:99},'delete-rip-front');
 const rgba=await sharp(readFileSync(new URL(data.file,deletionURL))).ensureAlpha().raw().toBuffer();const alpha=Buffer.alloc(image.width*image.height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
 assert.equal(hash(rgba),expected.rgbaSha256);assert.equal(hash(rgba),data.frontPoseSource.nativeRgbaSha256);assert.equal(hash(alpha),expected.alphaSha256);assert.equal(hash(alpha),data.frontPoseSource.nativeAlphaSha256);
 const crop=data.frontPoseSource.crop,region=expected.region;const sourceRegion=await sharp(rgba,{raw:{width:image.width,height:image.height,channels:4}}).extract({left:-crop[0],top:-crop[1],width:region[2]-region[0],height:region[3]-region[1]}).raw().toBuffer();assert.equal(hash(sourceRegion),expected.regionRgbaSha256,'Every selected region pixel and alpha channel survives exact cropping and lossless packing');assert.equal(hash(sourceRegion),data.frontPoseSource.regionRgbaSha256);
 for(const index of [0,image.width-1,(image.height-1)*image.width,alpha.length-1])assert.equal(alpha[index],0,'Native transparent crop corners cannot become opaque glow rectangles');
 assert.ok(alpha.filter(value=>value>16).length<alpha.length*0.75,'Alpha body occupancy preserves transparent space around the complete body');
 assert.equal(hash(readFileSync(new URL(data.file,deletionURL))),data.sourceSha256);
 assert.equal(data.frontPoseSource.originalFile,expected.originalFile);assert.equal(data.frontPoseSource.originalBytes,expected.bytes);
 assert.deepEqual(data.frontPoseSource.originalSize,expected.size);assert.equal(data.frontPoseSource.alphaThreshold,16);
 assert.equal(data.frontPoseSource.originalSha256,expected.sha256,'Only the owner-selected original-reference four-character sheet is accepted');
 const [left,top,right,bottom]=frame.opaqueBounds;assert.ok(Math.abs((bottom-top)*poseScale(clip,frame)-expected.height)<1e-8);assert.equal(frame.bodyCalibration,1);
 assert.equal(data.frontPoseSource.crop[0]+frame.anchor[0],expected.axisX,'Measured torso seam retains the separate bowed skull/leg coordinates');assert.equal(data.frontPoseSource.originalBodyAxisX,expected.axisX);assert.ok(left<frame.anchor[0]&&frame.anchor[0]<right);
 assert.deepEqual(data.frontPoseSource.sourceRegion,expected.region);assert.equal(data.frontPoseSource.sourceKind,'approved-four-character-airborne-sheet');
 const anatomy=data.frontPoseSource.nativeAnatomy;assert.equal(data.scale,expected.scale);assert.equal(anatomy.resultScale,expected.scale);assert.match(anatomy.method,/skull, chest and limb widths/);assert.equal(anatomy.nativeWorldHeadTorsoSpan,undefined,'Bowing does not become a vertical-span or full-standing-height calibration');assert.match(anatomy.reviewSha256,/^[a-f0-9]{64}$/);assert.equal(poseScale(clip,frame),expected.scale,'Explicit reviewed uniform anatomy scale overrides a second manifest scale');
 assert.equal(bottom,frame.anchor[1]);
 for(const [x,y]of [frame.attachments.head,frame.attachments.torso,frame.attachments.armLeft,frame.attachments.armRight])assert.ok(alpha[Math.round(y)*image.width+Math.round(x)]>128,'Measured upper-body/arm contact lies on intact native pixels');
});

for(const direction of [1,-1])test(`${expected.id}: real Oak lift/tear rendering freezes the native front source, central seam and body height (${direction})`,async()=>{
 front();const art=[await source('papa-oak'),await source(expected.id)],clips=combatMetadata(art),match=createMatch({mode:'practice',fighters:art.map(({manifest})=>({id:manifest.id,height:manifest.height})),clips});
 if(direction===-1){match.fighters[0].x=900;match.fighters[1].x=700;}
 assert.equal(performAction(match,0,'deletion'),true);assert.equal(match._deletionOrigin.ripPose.clip,'delete-rip-front');
 const definition=deletionDefinition('papa-oak'),native=art[1].clips['delete-rip-front'],frame=native.data.frames.right[0],canvas=screen(),renderer=createFightRenderer(canvas);
 const point=(view,fighter,site)=>{const asset=fighter.clips[view.clip],f=asset.data.frames[view.facing][poseFrameIndex(asset,view)],p=f.attachments[site],scale=poseScale(asset,f),offset=f.offset??[0,0];return {x:view.x+(p[0]+offset[0]-f.anchor[0])*scale,y:620+(view.y??0)+(p[1]+offset[1]-f.anchor[1])*scale};};
 for(const time of [definition.beats.gripContact+1,definition.beats.strain,definition.beats.rip+1,definition.beats.separated,definition.beats.settled]){
  match.deletionElapsed=time;const views=match.fighters.map((_,index)=>getFighterView(match,index)),saved=JSON.stringify(views);canvas.calls.length=0;renderer.draw({match,art,views});assert.equal(JSON.stringify(views),saved);
  const draws=canvas.calls.filter(([key,image])=>key==='drawImage'&&image===native.image);assert.equal(draws.length,time<definition.beats.rip?1:2);
  for(const draw of draws){if(time===definition.beats.strain){const feetY=draw[7]+frame.opaqueBounds[3]*draw[9]/frame.rect[3];assert.ok(feetY<620,`Captured feet ${feetY.toFixed(3)} must hang above the actual floor 620`);}assert.deepEqual(draw.slice(2,6),frame.rect);assert.ok(Math.abs(draw[9]/frame.rect[3]*(frame.opaqueBounds[3]-frame.opaqueBounds[1])-expected.height)<1e-8,'Actual canvas draw preserves approved whole-body height');}
  if(time>=definition.beats.rip){const registered=registerNewDeletionViews(match,views,art,point);for(const piece of registered[1].splitPieces){assert.equal(piece.clip,'delete-rip-front');assert.equal(piece.elapsed,0);assert.equal(piece.cutX,frame.rect[2]/2);assert.deepEqual(piece.rotationPivotPoint,{x:frame.attachments.ripCut[0],y:frame.attachments.ripCut[1]});}}
 }
});

}

test('All approved hanging banks replace release hooks and locally retained rejected art remains usable',async()=>{
 for(const id of ['6-bit','9-bit','cache-back','cliff','dj-floppydisc','mac-modem','mr-nice-guy']){const url=new URL(`assets/deletions/${id}/manifest.json`,ROOT),manifest=json(url);assert.equal(manifest.clips['rip-front'].file,'victim-front-lift-airborne-sheet-v1.webp');assert.ok(manifest.clips.suspended);const image=await imageFor(new URL(manifest.clips.suspended.file,url));assert.ok(image.width>0&&image.height>0);const retained=new URL('victim-front-lift-original-v1.webp',url);if(existsSync(retained))assert.ok(readFileSync(retained).length>0,'Locally retained rejected art remains usable for recovery without release hookup');}
});
