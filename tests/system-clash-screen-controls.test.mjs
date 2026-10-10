import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let bindGameScreenControls;
let onlineSessionScore;
try { ({bindGameScreenControls,onlineSessionScore}=await import('../public/games/system-clash/play/game-screen-controls.mjs')); } catch {}

function button(){const listeners={};return {textContent:'Fullscreen',attributes:{},addEventListener:(type,fn)=>listeners[type]=fn,removeEventListener:type=>delete listeners[type],setAttribute(name,value){this.attributes[name]=value;},click:()=>listeners.click?.()};}
test('every visible display control toggles the established host and reflects external exits',async()=>{
 assert.equal(typeof bindGameScreenControls,'function','Shared controls must exist independently of a hidden match panel');
 const toolbar=button(),pause=button(),listeners={},host={isFullscreen:false,async displayMode(){this.isFullscreen=!this.isFullscreen;}},doc={querySelectorAll:()=>[toolbar,pause],addEventListener:(type,fn)=>listeners[type]=fn,removeEventListener:type=>delete listeners[type]};
 const binding=bindGameScreenControls(host,{document:doc});
 assert.equal(toolbar.attributes['aria-pressed'],'false');await toolbar.click();assert.equal(host.isFullscreen,true);assert.equal(pause.textContent,'Exit fullscreen');assert.equal(toolbar.attributes['aria-pressed'],'true');
 host.isFullscreen=false;listeners.fullscreenchange();assert.equal(toolbar.textContent,'Fullscreen');
 host.isFullscreen=true;binding.sync();assert.equal(pause.attributes['aria-pressed'],'true');await pause.click();assert.equal(toolbar.textContent,'Fullscreen');
 binding.destroy();assert.equal(toolbar.click(),undefined);
});
test('title and fight keep fullscreen in the screen bar before loading and outside hidden gameplay controls',()=>{
 for(const [file,id]of [['index.html','demo-fullscreen'],['fight.html','fullscreen-fight'],['online.html','online-fullscreen']]){
  const html=readFileSync(new URL('../public/games/system-clash/play/'+file,import.meta.url),'utf8');
  const bar=html.match(/<(header|div)[^>]*class="[^"]*game-screen-bar[\s\S]*?<button[^>]*id="(?:demo-fullscreen|fullscreen-fight|online-fullscreen)"[^>]*>/)?.[0];
  assert(bar,file+' has an always available screen bar');assert(!bar.split('>')[0].includes('hidden'),file+' bar is visible during loading');assert(bar.includes('data-game-fullscreen'),id+' uses the shared controller');assert(html.includes('href="game-screen.css"'));
 }
});
test('the online fight carries a bounded session tally without changing local play',()=>{
 assert.equal(typeof onlineSessionScore,'function');
 assert.equal(onlineSessionScore(new URLSearchParams('online=1&name1=Host&name2=Guest&winHost=3&winGuest=2')),'Host 3 · Guest 2');
 assert.equal(onlineSessionScore(new URLSearchParams('online=1&winHost=-1&winGuest=1.5')),'Host 0 · Guest 0');
 assert.equal(onlineSessionScore(new URLSearchParams('winHost=3')),null);
});
