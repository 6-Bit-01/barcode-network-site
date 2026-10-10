import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const sourceRoot=new URL('../src/',import.meta.url),sourceDirectory=fileURLToPath(sourceRoot);

// Render real screens; recovery-state tests also run their actual read effects with controlled HTTP responses.
function screen(relative,exportName='default',props={},initialValues=[],readResponse){
 let cursor=0;const cache=new Map(),values=[],effects=[];
 const react={...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=i<initialValues.length?initialValues[i]:typeof initial==='function'?initial():initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},useEffect(effect){if(readResponse)effects.push(effect);},useMemo:fn=>fn(),useCallback:fn=>fn,useRef:initial=>({current:initial})};
 function load(relativePath){
  const filename=fileURLToPath(new URL(relativePath.replaceAll('\\','/'),sourceRoot));
  if(cache.has(filename))return cache.get(filename).exports;
  const loadedModule={exports:{}};cache.set(filename,loadedModule);
  const source=fs.readFileSync(filename,'utf8');
  const resolveLocal=base=>['','.ts','.tsx'].map(extension=>base+extension).find(candidate=>fs.existsSync(candidate));
  vm.runInNewContext(ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:loadedModule,exports:loadedModule.exports,URLSearchParams,Date,fetch:readResponse,require:id=>id==='react'?react:id==='next/link'?'a':id.startsWith('@/')?load(id.slice(2)+(fs.existsSync(new URL(id.slice(2)+'.ts',sourceRoot))?'.ts':'.tsx')):id.startsWith('.')?load(path.relative(sourceDirectory,resolveLocal(path.resolve(path.dirname(filename),id)))):require(id)});
  return loadedModule.exports;
 }
 if(exportName===null)return load(relative);
 const component=load(relative)[exportName],render=()=>{cursor=0;return renderToStaticMarkup(React.createElement(component,props));};
 const initial=render();if(!readResponse)return initial;
 for(const effect of effects.splice(0))effect();
 return {initial,async settle(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));return render();}};
}
function links(html){return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([,href,label])=>({href,label:label.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/\s+/g,' ').trim()}));}
function returnLink(html,label,href){const found=links(html).filter(link=>link.label===label);assert.equal(found.length,1,`one visible ${label} return link`);assert.equal(found[0].href,href);}
function maintenanceParent(html,tool){const breadcrumb=html.match(/<nav[^>]*aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1];assert.ok(breadcrumb,'tool has a breadcrumb');returnLink(breadcrumb,'Maintenance','/account/owner/maintenance');const current=breadcrumb.match(/<span[^>]*aria-current="page"[^>]*>([^<]+)<\/span>/)?.[1];assert.equal(current,tool);}

test('credit corrections return to the Artists section that opened them',()=>{
 const html=screen('components/ArtistCreditReview.tsx','ArtistCreditReview');
 returnLink(html,'← Back to Artists & history','/account/owner/artists');
 assert.equal(links(html).some(link=>link.href==='/admin/ballads'),false);
});
test('Broadcast Ballads return to BNL & music',()=>{
 const html=screen('components/BNLBalladWorkspace.tsx','BNLBalladWorkspace');
 returnLink(html,'Back to BNL & music','/account/owner/bnl');
 assert.equal(links(html).some(link=>link.label==='Admin dashboard'),false);
});
test('archived shows return to Radio & shows rather than another Show management screen',()=>{
 const html=screen('components/AdminQueueArchive.tsx','AdminQueueArchive');
 returnLink(html,'Back to Radio & shows','/account/owner/radio');
});

const session={sessionId:'finished / exact',title:'Navigation test show',status:'archived',purpose:'internal_test',bnlPublicationStatus:'private',provenanceRevision:0,showDate:'2026-10-10',createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T01:00:00Z',queueOpen:false,description:'',trackLimitPerArtist:1,queueCapacity:25,skipGameTapTarget:1,submissionCooldownSeconds:0,activeCount:0,completedCount:0,removedCount:0,spotlightCount:0,estimatedActiveRuntimeSeconds:0,completedRuntimeSeconds:0,nextNonPriorityLane:'regular',priorityUpgradesEnabled:false,priorityUpgradeLabel:'',priorityUpgradeInstructions:'',priorityUpgradePriceCents:0,priorityUpgradeCurrency:'usd',priorityUpgradePaymentsEnabled:false,signalHoldEnabled:false,signalHoldLabel:'',signalHoldInstructions:'',signalHoldPriceCents:0,signalHoldCurrency:'usd',signalHoldPaymentsEnabled:false,queue:[],spotlight:[],completed:[],removed:[],showLog:[],publicStatus:'closed'};
const emptyReport=screen('lib/queue-show-report.ts',null).buildQueueShowReport(session,[]);
test('finished session returns to Archived shows and keeps its exact queue as a separate action',()=>{
 const state={nowPlaying:null,queue:[],history:[],totalPlayed:0,streamStatus:'offline',session,sessions:[session]};
 const html=screen('components/AdminFinishedSessionReview.tsx','AdminFinishedSessionReview',{sessionId:session.sessionId},[state,[],emptyReport,null]);
 returnLink(html,'Back to Archived shows','/admin/show-management/archive');
 returnLink(html,'Review queue for this session','/admin/queue?sessionId=finished%20%2F%20exact');
});

const inventories=[
 ['uploads',{readOnly:true,complete:true,truncated:false,prefix:'navigation-test/',listCalls:1,windows:[],count:0,uploads:[]},'Upload recovery'],
 ['priority-checkouts',{readOnly:true,complete:true,truncated:false,source:'barcode-radio-priority-signal',window:{startInclusive:'2026-10-10T00:00:00Z',endInclusive:'2026-10-10T01:00:00Z'},sessionListCalls:1,lineItemListCalls:0,count:0,sessions:[]},'Priority checkout recovery'],
];
for(const [route,inventory,tool]of inventories){
 test(`${tool} returns to Maintenance`,()=>{const html=screen(`app/admin/queue/recovery-${route}/page.tsx`,'default',{},[inventory,false,false,null]);maintenanceParent(html,tool);});
 test(`${tool} keeps the existing Admin Login path when unauthorized`,()=>{const html=screen(`app/admin/queue/recovery-${route}/page.tsx`,'default',{},[null,false,true,null]);returnLink(html,'Open Admin Login','/admin');});
}
test('storage recovery returns to Maintenance before any recovery action',()=>{
 const html=screen('app/admin/storage-recovery/page.tsx');
 maintenanceParent(html,'Storage recovery');
});
for(const [route,,tool]of inventories){
 test(`${tool} keeps Maintenance navigation while its read is loading`,()=>{
  const ui=screen(`app/admin/queue/recovery-${route}/page.tsx`,'default',{},[],()=>new Promise(()=>{}));
  assert.match(ui.initial,/Loading .*inventory/);maintenanceParent(ui.initial,tool);
 });
 for(const status of [401,503]){
  test(`${tool} keeps Maintenance navigation after HTTP ${status} without exposing failed inventory`,async()=>{
   const ui=screen(`app/admin/queue/recovery-${route}/page.tsx`,'default',{},[],async url=>{assert.equal(url,`/api/admin/queue/recovery/${route}`);return Response.json({error:'Inventory request failed',privateInventory:'PRIVATE_INVENTORY_MARKER'},{status});});
   const html=await ui.settle();
   assert.match(html,status===401?/Admin access required/:/Inventory unavailable/);maintenanceParent(html,tool);
   assert.doesNotMatch(html,/PRIVATE_INVENTORY_MARKER|Machine-readable inventory/);
   if(status===401)returnLink(html,'Open Admin Login','/admin');
  });
 }
}
