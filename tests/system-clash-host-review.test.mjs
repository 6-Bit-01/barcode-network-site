import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createGameScreenHost} from '../public/games/system-clash/play/game-screen-host.mjs';
import {withMatchRules,matchRulesFromURL} from '../public/games/system-clash/play/fight-rules.mjs';
import {parseDemoLaunch,withControllerSeats} from '../public/games/system-clash/play/demo-flow.mjs';
import {FIGHTER_STYLES} from '../public/games/system-clash/play/fight-engine.mjs';
const fightSource=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');
const demoSource=readFileSync(new URL('../public/games/system-clash/play/demo.mjs',import.meta.url),'utf8');
const base='https://game.test/games/system-clash/play/';
const priorRules={rounds:1,time:99,difficulty:'normal',musicStyle:'stage'},nextRules={rounds:5,time:60,difficulty:'hard',musicStyle:'fighter'};

function element(tag='div'){
 const classes=new Set(),events={};return {tagName:tag.toUpperCase(),dataset:{},style:{},children:[],events,
  classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),toggle(name,on){const value=on??!classes.has(name);if(value)classes.add(name);else classes.delete(name);return value;}},
  addEventListener(type,fn){events[type]=fn;},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},focus(){}};
}
function navigationContext(){
 const items=new Map(),navigations=[],context={URL,location:{href:base+'fight.html?demo=1&mode=cpu&p1=lyra&p2=9-bit'},muted:false,
  clearInput(){},onlineBridge:{enabled:false},tournamentOverlay:null,match:{stage:{id:'radio-studio'}},demoLaunch:{stage:'radio-studio'},
  roundSet:{rules:priorRules},matchRules:nextRules,gamepads:{seatIndices:()=>[2,3]},screenHost:{navigate:url=>navigations.push(url.href)},
  withControllerSeats,withMatchRules,$(id){if(!items.has(id))items.set(id,element());return items.get(id);}};
 context.$('motion-toggle').checked=false;context.$('demo-select').href=base+'index.html?screen=select&mode=cpu';return {context,items,navigations};
}
function hostWindow(name,parent){
 const children=[],messages=[],listeners={},docListeners={},doc={body:element('body'),documentElement:element('html'),fullscreenElement:null,
  addEventListener:(type,fn)=>docListeners[type]=fn,querySelectorAll:()=>children,createElement:()=>{throw Error('Test must supply the concrete iframe surface.');}};
 const win={name,document:doc,location:{href:base+name+'.html'},messages,listeners,docListeners,parent:null,
  addEventListener:(type,fn)=>listeners[type]=fn,postMessage:(data,origin)=>messages.push({data,origin})};win.parent=parent??win;
 doc.body.appendChild=child=>{children.push(child);return child;};return win;
}
function iframe(win){const frame=element('iframe');frame.contentWindow=win;return frame;}
function nestedHost(){
 const top=hostWindow('index'),lobby=hostWindow('online',top),fight=hostWindow('fight',lobby),topFrame=iframe(lobby),fightFrame=iframe(fight);
 top.document.createElement=()=>topFrame;lobby.document.body.appendChild(fightFrame);
 let suspended=0;const observed=[];
 const topHost=createGameScreenHost({window:top,document:top.document,onSuspend:()=>suspended++});topHost.navigate(base+'online.html');
 const lobbyHost=createGameScreenHost({window:lobby,document:lobby.document});
 const fightHost=createGameScreenHost({window:fight,document:fight.document,onDisplayChange:value=>observed.push(value)});
 return {top,lobby,fight,topFrame,fightFrame,topHost,lobbyHost,fightHost,observed,get suspended(){return suspended;}};
}

test('initializing a selected demo fight prepares the selected fighters without navigating back to selection',async()=>{
 const {context,items,navigations}=navigationContext();context.location.href=base+'fight.html?demo=1&mode=cpu&p1=lyra&p2=9-bit';
 let boots=0;const errors=[];Object.assign(context,{window:{SYSTEM_CLASH_FIGHT_BUNDLE:{roster:[{id:'lyra',name:'Lyra'},{id:'9-bit',name:'Nine'}]}},
  document:{body:element('body'),createElement:element},FIGHTER_STYLES,parseDemoLaunch,launchParams:new URL(context.location.href).searchParams,
  effects:{setMuted(){},setReducedMotion(){}},deletionDefinition:()=>null,boot:async()=>boots++,loading:error=>errors.push(error)});
 const start=fightSource.indexOf('async function initializeRoster()'),end=fightSource.indexOf('\n}',start)+2;
 await vm.runInNewContext('('+fightSource.slice(start,end)+')()',context);
 assert.deepEqual(errors,[]);assert.deepEqual(navigations,[],'Preparing the link cannot activate navigation');
 assert.equal(items.get('fighter-one').value,'lyra');assert.equal(items.get('fighter-two').value,'9-bit');assert.equal(boots,1);
 assert.equal(new URL(items.get('demo-select').href).searchParams.get('screen'),'select');
});

test('nested online fights delegate fullscreen to the established title host',async()=>{
 const n=nestedHost();let nestedRequests=0;n.fight.document.documentElement.requestFullscreen=async()=>nestedRequests++;
 n.top.document.fullscreenElement=n.top.document.documentElement;
 assert.equal(n.fightHost.isFullscreen,true,'The nested document reads the actual owning display state');
 assert.equal(await n.fightHost.displayMode(),'host');assert.equal(nestedRequests,0);
 assert.equal(n.top.messages.at(-1).data.type,'system-clash:display');
 assert.equal(n.fight.document.documentElement.dataset.systemClashHost,undefined,'A nested fight cannot create a competing fullscreen owner');
});

test('the persistent host accepts active nested fight navigation and ignores unrelated windows',()=>{
 const n=nestedHost(),initial=n.topFrame.src;
 const route={type:'system-clash:navigate',url:base+'index.html?screen=select'};
 const unrelated=hostWindow('fight',n.top);
 n.top.listeners.message({source:unrelated,origin:'https://game.test',data:route});assert.equal(n.topFrame.src,initial);
 n.top.listeners.message({source:n.fight,origin:'https://evil.test',data:route});assert.equal(n.topFrame.src,initial);
 n.top.listeners.message({source:n.fight,origin:'https://game.test',data:route});
 assert.equal(n.topFrame.src,route.url);assert.equal(n.suspended,1,'The existing host stays suspended across all child routes');
});

test('fullscreen state changes cross the lobby iframe boundary to update the nested fight',()=>{
 const n=nestedHost();n.top.document.fullscreenElement=n.top.document.documentElement;n.top.docListeners.fullscreenchange();
 const lobbyPacket=n.lobby.messages.at(-1);assert.equal(lobbyPacket.data.type,'system-clash:display-state');
 n.lobby.listeners.message({source:n.top,origin:'https://game.test',data:lobbyPacket.data});
 const fightPacket=n.fight.messages.at(-1);assert.equal(fightPacket.data.type,'system-clash:display-state');
 n.fight.listeners.message({source:n.lobby,origin:'https://game.test',data:fightPacket.data});assert.deepEqual(n.observed,[true]);
 n.top.document.fullscreenElement=null;n.top.docListeners.fullscreenchange();
 n.lobby.listeners.message({source:n.top,origin:'https://game.test',data:n.lobby.messages.at(-1).data});
 n.fight.listeners.message({source:n.lobby,origin:'https://game.test',data:n.fight.messages.at(-1).data});assert.deepEqual(n.observed,[true,false]);
});

test('returning to title retains newly applied next-match rules instead of the completed set rules',()=>{
 const {context,navigations}=navigationContext(),line=fightSource.split('\n').find(value=>value.includes('function goTitle(){'));
 const fn=line.slice(line.indexOf('function goTitle(){'));vm.runInNewContext('('+fn+')()',context);
 assert.deepEqual(matchRulesFromURL(navigations[0]),nextRules);assert.deepEqual(context.roundSet.rules,priorRules,'The active set retains its existing contract');
});

test('choosing another fighter retains newly applied options and controller seats',()=>{
 const {context,items,navigations}=navigationContext();
 const source=fightSource.split('\n').find(value=>value.startsWith("$('demo-select')?.addEventListener('click'"));vm.runInNewContext(source,context);
 items.get('demo-select').events.click({preventDefault(){}});assert.deepEqual(matchRulesFromURL(navigations[0]),nextRules);
 const params=new URL(navigations[0]).searchParams;assert.equal(params.get('pad1'),'2');assert.equal(params.get('pad2'),'3');
});

test('the title keyboard cannot activate underlying menus while static assets are still loading',()=>{
 const start=demoSource.indexOf("window.addEventListener('keydown',event=>{"),end=demoSource.indexOf('\n});',start)+4;
 let listener,activated=0;const context={window:{addEventListener:(_,fn)=>listener=fn},menuReady:false,state:{screen:'title'},matchOptions:{open:false},
  $:()=>({open:false}),titleChoices:()=>[{click:()=>activated++}],document:{activeElement:{}},nextMenuIndex:()=>0};
 vm.runInNewContext(demoSource.slice(start,end),context);
 listener({code:'Enter',key:'Enter',repeat:false,preventDefault(){},target:{closest:()=>false}});assert.equal(activated,0);
 context.menuReady=true;listener({code:'Enter',key:'Enter',repeat:false,preventDefault(){},target:{closest:()=>false}});assert.equal(activated,1,'The same action works once assets are ready');
});

for(const button of ['options-open','controls-open'])test(`the static loader blocks native ${button} button activation until assets are ready`,()=>{
 const items=new Map();let opened=0;const context={menuReady:false,matchRules:priorRules,gamepads:{reset(){}},matchOptions:{show:()=>opened++},closeControls(){},
  $(id){if(!items.has(id))items.set(id,{...element(),showModal:()=>opened++});return items.get(id);}};
 const source=demoSource.split('\n').find(value=>value.startsWith(`$('${button}').addEventListener('click'`));
 vm.runInNewContext(source,context);const activate=items.get(button).events.click;
 activate();assert.equal(opened,0,'Native keyboard activation cannot put a dialog above the loader');
 context.menuReady=true;activate();assert.equal(opened,1,'The same button is usable once loading succeeds');
});

test('a failed menu asset retains the reachable Retry button when other image requests finish later',async()=>{
 const pending=[],items=new Map(),context={URL,URLSearchParams,location:{href:base+'index.html'},menuReady:false,params:new URLSearchParams(),FIGHTER_STYLES,catalog:null,state:null,
  document:{querySelectorAll:()=>[]},createDemoSelection:()=>({}),
  $(id){if(!items.has(id))items.set(id,element());return items.get(id);},
  fetch:async()=>({ok:true,json:async()=>({fighters:[{id:'lyra',portrait:'assets/menu/lyra-portrait.webp',standing:'assets/menu/lyra-standing.webp'}]})}),
  menuImage:path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject}))};
 vm.createContext(context);vm.runInContext(demoSource.split('\n').find(value=>value.startsWith('function loading(')),context);
 const start=demoSource.indexOf('async function load(){'),end=demoSource.indexOf('\n}',start)+2;
 const run=vm.runInContext('('+demoSource.slice(start,end)+')()',context);
 for(let i=0;i<10&&!pending.length;i++)await Promise.resolve();assert.ok(pending.length>1,'Multiple image requests are active');
 pending[0].reject(Error('Missing menu image'));
 for(let i=0;i<8;i++)await Promise.resolve();
 for(const request of pending.slice(1))request.resolve();await run;
 assert.equal(context.menuReady,false);assert.equal(context.$('asset-loading').hidden,false);
 assert.equal(context.$('asset-loading-retry').hidden,false,'Late successes cannot hide recovery from a failed asset');
 assert.equal(context.$('asset-loading-text').textContent,'Missing menu image');
});

test('a failed fighter sheet keeps Retry visible when another in-flight sheet reports progress',async()=>{
 const items=new Map();let reportProgress;const context={URL,location:{href:base+'fight.html'},window:{},document:{querySelectorAll:()=>[]},loadRevision:0,motionPresentationEpoch:0,
  ready:false,paused:false,pauseDialog:{open:false},inspectTime:null,motionTime:null,interfaceArtPending:null,
  clearInput(){},effects:{clear(){}},roundMenu:{reset(){}},
  $(id){if(!items.has(id))items.set(id,element());return items.get(id);},
  loadInterfaceArt:async()=>({}),loadFightArt:async options=>{reportProgress=options.onProgress;throw Error('Missing fighter sheet');}};
 vm.createContext(context);vm.runInContext(fightSource.split('\n').find(value=>value.startsWith('function loading(')),context);
 const start=fightSource.indexOf('async function boot()'),end=fightSource.indexOf('\n}',start)+2;
 await vm.runInContext('('+fightSource.slice(start,end)+')()',context);
 assert.equal(context.$('asset-loading-retry').hidden,false,'A failed sheet exposes recovery');
 reportProgress(1,24);
 assert.equal(context.$('asset-loading-retry').hidden,false,'Late successful sheets cannot hide recovery');
 assert.equal(context.$('asset-loading-text').textContent,'Missing fighter sheet');assert.equal(context.ready,false);
});
