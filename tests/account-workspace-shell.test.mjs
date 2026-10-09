import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),React=require("react"),server=require("react-dom/server");
const read=path=>fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
function compile(path,dependencies,globals={}) {
 const sandboxModule={exports:{}};
 vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:sandboxModule,exports:sandboxModule.exports,...globals,require:id=>Object.hasOwn(dependencies,id)?dependencies[id]:require(id)});
 return sandboxModule.exports;
}
const workspace=compile("src/lib/account-workspace.ts",{});
function chrome(path) {
 const sentinel=text=>function Sentinel() { return React.createElement("span",null,text); };
 const {SiteChrome}=compile("src/components/SiteChrome.tsx",{
  "next/navigation":{usePathname:()=>path},"next/link":function MockLink({children,...props}) { return React.createElement("a",props,children); },
  "@/lib/account-workspace":workspace,
  "@/components/Header":{Header:sentinel("Public header")},"@/components/Footer":{Footer:sentinel("Public footer")},
  "@/components/DataStream":{DataStream:sentinel("Animated stream")},"@/components/BNLNetworkRelayShell":{BNLNetworkRelayShell:sentinel("Public relay")},
 });
 return server.renderToStaticMarkup(React.createElement(SiteChrome,{radioSubmission:{},accountEnabled:true},React.createElement("p",null,"Workspace content")));
}
test("Owner and Crew workspace chrome removes public navigation, relay and animation while retaining account return",()=>{
 for(const path of ["/account/owner","/account/owner/accounts","/account/crew"]){
  const html=chrome(path);
  assert.match(html,/href="\/account"/);assert.match(html,/id="main-content"/);assert.match(html,/Workspace content/);
  assert.doesNotMatch(html,/Public header|Public footer|Public relay|Animated stream|animate-interference/);
 }
});
test("ordinary account and similar prefixes retain public chrome; existing overlays stay bare",()=>{
 for(const path of ["/account","/account/reset-password","/account/ownership","/account/crewnecks"]){
  const html=chrome(path);assert.match(html,/Public header/);assert.match(html,/Public footer/);assert.match(html,/Public relay/);
 }
 for(const path of ["/overlay/foreground","/world/playtest"]) assert.equal(chrome(path),"<p>Workspace content</p>");
});
function providerEffects(path) {
 const calls=[],effects=[];
 const react={...React,useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useMemo:fn=>fn()};
 const hooks={"react":react,"next/navigation":{usePathname:()=>path},"@/lib/account-workspace":workspace};
 const fetcher=async url=>{calls.push("fetch:"+url);return Response.json({});};
 const {LiveStatusProvider}=compile("src/components/LiveStatusProvider.tsx",{
  ...hooks,"@/lib/live-status-public":{derivePublicShowState:()=>({}),deriveRadioQueueEntryState:()=>({status:"loading",href:null}),isPublicTikTokBroadcastLive:()=>false},
  "@/lib/redis-polling-budget":{SITE_LIVE_STATUS_POLL_INTERVAL_MS:30000},
  "@/lib/session-bound-polling":{hasActiveQueueSession:()=>false,notifyQueueSessionChanged:()=>{},startSessionBoundPolling:()=>{calls.push("live-poll-start");return ()=>{};}},
 },{fetch:fetcher});
 LiveStatusProvider({children:null});
 const {BNLStatusProvider}=compile("src/components/BNLStatusProvider.tsx",{
  ...hooks,"@/components/bnl-status-controller":{BNLStatusController:class{start(){calls.push("bnl-poll-start");}stop(){}}},
  "@/components/bnl-status":{FALLBACK_STATUS:{}},
 },{globalThis:{fetch:fetcher}});
 BNLStatusProvider({children:null});
 for(const effect of effects)effect();
 return calls;
}
test("account workspaces start no BNL/live polling or legacy-admin verification; public routes keep polling",()=>{
 for(const path of ["/account/owner","/account/crew","/account/owner/accounts"]) assert.deepEqual(providerEffects(path),[]);
 const publicCalls=providerEffects("/account");
 assert.ok(publicCalls.includes("bnl-poll-start"));assert.ok(publicCalls.includes("live-poll-start"));assert.ok(publicCalls.includes("fetch:/api/admin/verify"));
});
