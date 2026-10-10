import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(relative,injections={}){const source=fs.readFileSync(new URL('../src/'+relative,import.meta.url),'utf8'),m={exports:{}};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,require:id=>injections[id]??(id==='next/link'?'a':id.startsWith('@/')?load(id.slice(2)+(id.includes('/lib/')?'.ts':'.tsx'),injections):require(id))});return m.exports;}
test('all Owner sections have a stable destination and exactly one current page',()=>{
 const {OwnerWorkspaceNavigation}=load('components/OwnerWorkspaceNavigation.tsx');
 const destinations=['/account/owner','/account/owner/radio','/account/owner/artists','/account/owner/accounts','/account/owner/bnl','/account/owner/songs','/account/owner/maintenance'];
 for(const section of ['home','radio','artists','accounts','bnl','songs','maintenance']){
  const html=renderToStaticMarkup(React.createElement(OwnerWorkspaceNavigation,{section}));
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  const nav=html.match(/<nav[^>]*aria-label="Owner workspace"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),destinations.filter((_,index)=>index!==['home','radio','artists','accounts','bnl','songs','maintenance'].indexOf(section)));
  assert.doesNotMatch(html,/dossier|Suno|system-clash/i);
  assert.match(html,/Back to Owner Home|Owner Home/);
 }
});
test('every Owner landing and account route denies before returning its workspace',async()=>{
 for(const path of ['','/accounts','/radio','/bnl','/maintenance']){
  const source=fs.readFileSync(new URL('../src/app/account/owner'+path+'/page.tsx',import.meta.url),'utf8'),m={exports:{}};let allowed=false,calls=0;
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:id=>id==='@/lib/member-access'?{requireMemberWorkspaceAccess:async role=>{calls++;assert.equal(role,'owner');if(!allowed)throw Error('denied');return {user:{id:'owner'}};}}:id.startsWith('@/components/')?new Proxy({},{get:()=>()=>null}):require(id)});
  await assert.rejects(m.exports.default(),/denied/);assert.equal(calls,1);allowed=true;assert.ok(await m.exports.default());assert.equal(calls,2);
 }
});
test('Owner Home offers existing tasks without fetching account data or starting controls',()=>{
 const {OwnerHome}=load('components/OwnerHome.tsx');const html=renderToStaticMarkup(React.createElement(OwnerHome));
 assert.match(html,/Owner Home/);assert.match(html,/Run a show/);assert.match(html,/Review Artist access/);assert.match(html,/Manage accounts/);assert.match(html,/BNL song generator/);assert.match(html,/Maintenance/);
 assert.doesNotMatch(html,/<form|<button|dossier|Member ID|email@/i);
 const {OWNER_TOOL_SECTIONS}=load('lib/owner-workspace.ts');
 const paths=Object.values(OWNER_TOOL_SECTIONS).flatMap(section=>section.tools.map(tool=>tool.href));
 for(const href of paths){const route=href.split('#')[0];assert.ok(fs.existsSync(new URL('../src/app'+route+'/page.tsx',import.meta.url)),href);}
 assert.ok(paths.includes('/admin/broadcast-settings'));assert.ok(paths.includes('/admin/relay'));assert.ok(paths.includes('/admin/storage-recovery'));
});

test('account shell remains the only main landmark on every Owner workspace',()=>{
 const injections={'next/navigation':{usePathname:()=>'/account/owner'},'@/components/Header':{},'@/components/Footer':{},'@/components/DataStream':{},'@/components/BNLNetworkRelayShell':{}};
 const {SiteChrome}=load('components/SiteChrome.tsx',injections);
 const access={user:{id:'owner',name:'Owner'},session:{expiresAt:'2099-01-01T00:00:00Z'},access:{owner:true,crew:false,permissions:[],availablePermissions:[]}};
 for(const [file,props]of [['OwnerHome',{}],['OwnerToolWorkspace',{section:'radio'}],['OwnerAccountWorkspace',{access}],['OwnerArtistWorkspace',{access}]]){
  const workspace=load('components/'+file+'.tsx')[file];
  const html=renderToStaticMarkup(React.createElement(SiteChrome,{radioSubmission:{}},React.createElement(workspace,props)));
  assert.equal((html.match(/<main(?: |>)/g)||[]).length,1,file);
  assert.match(html,/id="main-content"/);
 }
});


test('named Home shortcuts enter their actual tools rather than another menu',()=>{
 const {OwnerHome}=load('components/OwnerHome.tsx');const html=renderToStaticMarkup(React.createElement(OwnerHome));
 const links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({href:m[1],text:m[2].replace(/<[^>]+>/g,'').trim()}));
 for(const [action,href] of [['Run a show','/admin/show-management'],['BNL song generator','/account/owner/songs']]){
  assert.equal(links.find(link=>link.text.startsWith(action))?.href,href,action);
 }
});

test('Relay and live settings enter focused tools without returning to the mixed dashboard',()=>{
 const {OwnerToolWorkspace}=load('components/OwnerToolWorkspace.tsx');
 for(const [section,label,href] of [['bnl','Relay controls','/admin/relay'],['radio','Live status &amp; stream','/admin/broadcast-settings']]){
  const html=renderToStaticMarkup(React.createElement(OwnerToolWorkspace,{section}));
  const match=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].find(m=>m[2].includes(label));
  assert.equal(match?.[1],href,label);assert.doesNotMatch(html,/href="\/admin#/);
 }
});

test('tool navigation distinguishes its parent section and does not link its active tab back to a menu',()=>{
 const {OwnerWorkspaceNavigation}=load('components/OwnerWorkspaceNavigation.tsx');
 const html=renderToStaticMarkup(React.createElement(OwnerWorkspaceNavigation,{section:'artists',tool:'Artist credit corrections'}));
 const nav=html.match(/<nav[^>]*aria-label="Owner workspace"[\s\S]*?<\/nav>/)[0];
 assert.doesNotMatch(nav,/<a[^>]*href="\/account\/owner\/artists"/);
 assert.match(html,/<nav[^>]*aria-label="Breadcrumb"/);
 assert.match(html,/<a[^>]*href="\/account\/owner\/artists"[^>]*>Artists &amp; history<\/a>/);
 assert.match(html,/<span[^>]*aria-current="page"[^>]*>Artist credit corrections<\/span>/);
});

test('Owner Home opens the general song generator directly and keeps episode Ballads distinct',()=>{
 const {OwnerHome}=load('components/OwnerHome.tsx');const html=renderToStaticMarkup(React.createElement(OwnerHome));
 const card=[...html.matchAll(/<section\b[\s\S]*?<\/section>/g)].map(m=>m[0]).find(section=>/<h2\b[\s\S]*?BNL &amp; music/.test(section));
 assert.ok(card,'Owner Home retains the BNL & music card');
 const links=[...card.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m=>({href:m[1],text:m[2].replace(/<[^>]+>/g,'').trim()}));
 assert.equal(links.find(link=>link.text.startsWith('BNL song generator'))?.href,'/account/owner/songs');
 assert.equal(links.find(link=>link.text==='Broadcast Ballads')?.href,'/admin/ballads');
 assert.equal(links.find(link=>link.text.startsWith('Write with BNL')),undefined);
});

test('Owner song generator shows its current Owner section while Crew only gets its own return path',()=>{
 const {BarcodeSongWorkspace}=load('components/BarcodeSongWorkspace.tsx');
 for(const owner of [true,false]){
  const access={user:{id:owner?'owner':'crew',name:owner?'Owner':'Crew'},session:{expiresAt:'2099-01-01T00:00:00Z'},access:{owner,crew:!owner,permissions:owner?[]:['song.generate'],availablePermissions:['song.generate']}};
  const html=renderToStaticMarkup(React.createElement(BarcodeSongWorkspace,{access}));
  if(owner){
   const nav=html.match(/<nav[^>]*aria-label="Owner workspace"[\s\S]*?<\/nav>/)?.[0];assert.ok(nav);
   assert.match(nav,/<span[^>]*aria-current="location"[^>]*>BNL song generator<\/span>/);
   assert.doesNotMatch(nav,/href="\/account\/owner\/songs"/);
   assert.match(html,/<a[^>]*href="\/account\/owner"[^>]*>Owner Home<\/a>/);
   assert.match(html,/<span[^>]*aria-current="page"[^>]*>BNL song generator<\/span>/);
  }else{
   assert.match(html,/<a[^>]*href="\/account\/crew"[^>]*>Back to Crew workspace<\/a>/);
   assert.doesNotMatch(html,/aria-label="Owner workspace"|href="\/account\/owner(?:\/|"|#)/);
  }
 }
});
