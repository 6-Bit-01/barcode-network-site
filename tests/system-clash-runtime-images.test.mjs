import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assetPath,loadFightArt,loadArcadeArt} from '../public/games/system-clash/play/fight-assets.mjs';
const root=fileURLToPath(new URL('../public/games/system-clash/play/',import.meta.url));
function data(bank){return JSON.parse(fs.readFileSync(path.join(root,'assets',bank,'6-bit','manifest.json'),'utf8'));}
function withImage(loader){const previous=globalThis.Image,requested=[];globalThis.Image=class{set src(value){requested.push(value);const relative=new URL(value,'https://game.example/').pathname.slice(1),bytes=fs.readFileSync(path.join(root,relative));if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){this.width=bytes.readUInt32BE(16);this.height=bytes.readUInt32BE(20);}else{let at=12;while(at+8<=bytes.length){const kind=bytes.toString('ascii',at,at+4),n=bytes.readUInt32LE(at+4),p=at+8;if(kind==='VP8X'){this.width=1+bytes.readUIntLE(p+4,3);this.height=1+bytes.readUIntLE(p+7,3);break;}if(kind==='VP8L'){const v=bytes.readUInt32LE(p+1);this.width=1+(v&0x3fff);this.height=1+((v>>>14)&0x3fff);break;}if(kind==='VP8 '){this.width=bytes.readUInt16LE(p+6)&0x3fff;this.height=bytes.readUInt16LE(p+8)&0x3fff;break;}at=p+n+(n&1);}}queueMicrotask(()=>this.onload());}};return loader(requested).finally(()=>{globalThis.Image=previous;});}
function selected(bank,action){const manifest=data(bank),clip=manifest.clips[action];assert(clip.file.endsWith('.png'),'fixture uses an approved original PNG');for(const entry of Object.values(manifest.clips))if(entry.file===clip.file)entry.runtimeFile=entry.file.replace(/\.png$/,'.runtime.webp');return manifest;}
for(const bank of ['fighters','arcade'])test(`${bank} hosted loading prefers the selected clarity or optional served file using real native manifest geometry`,()=>withImage(async requested=>{
 const action=bank==='fighters'?'idle':'low-punch',manifest=selected(bank,action),rel=`assets/${bank}/6-bit/manifest.json`;
 // A nonbundled manifest fetch preserves the actual native data and clip contract.
 const previousFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>manifest});try{if(bank==='fighters')await loadFightArt({baseURL:'https://game.example/',ids:['6-bit']});else await loadArcadeArt({baseURL:'https://game.example/',art:[{manifest:{id:'6-bit',character:'6 Bit'},clips:{}}]});}finally{globalThis.fetch=previousFetch;}
 assert(requested.includes(new URL(assetPath(rel,(manifest.clips[action].clarityFile??manifest.clips[action].runtimeFile)),'https://game.example/').href));assert(!requested.includes(new URL(assetPath(rel,manifest.clips[action].file),'https://game.example/').href));
}));
for(const bank of ['fighters','arcade'])test(`${bank} a portable bundle with only original images remains usable`,()=>withImage(async requested=>{
 const action=bank==='fighters'?'idle':'low-punch',manifest=selected(bank,action),rel=`assets/${bank}/6-bit/manifest.json`,images=Object.fromEntries(Object.values(manifest.clips).map(c=>[assetPath(rel,c.file),new URL(assetPath(rel,c.file),'https://game.example/').href])),bundle={manifests:{'6-bit':manifest},arcade:{'6-bit':manifest},images};
 if(bank==='fighters')await loadFightArt({bundle,baseURL:'https://game.example/',ids:['6-bit']});else await loadArcadeArt({bundle,baseURL:'https://game.example/',art:[{manifest:{id:'6-bit',character:'6 Bit'},clips:{}}]});
 assert(requested.includes(images[assetPath(rel,manifest.clips[action].file)]));assert(!requested.some(value=>value.endsWith('.runtime.webp')));
}));
