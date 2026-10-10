import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url), React=require('react');
const owner={user:{id:'founder-id',name:'Founder'},session:{expiresAt:'2099-01-01T00:00:00Z'},access:{owner:true,crew:false,permissions:[],availablePermissions:['song.generate','show.overview','insights.read']}};
const account={id:'member-id',name:'Member',email:'member@example.test',emailVerified:true,suspended:false,owner:false,crew:false,permissions:[],revision:2,createdAt:'2026-10-01T00:00:00Z'};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function harness(file,props={},fetcher=async()=>response(owner),injections={}) {
 const slots=[],dependencies=[],effects=[],listeners=new Map();let cursor=0,tree;
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots)) slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!dependencies[i]||deps?.some((v,j)=>v!==dependencies[i][j])) {dependencies[i]=deps;effects.push(fn);}},useCallback(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j]))slots[i]={fn,deps};return slots[i].fn;}};
 const modules=new Map();
 function load(relative){if(modules.has(relative))return modules.get(relative);const path=new URL('../src/'+relative+(relative.startsWith('lib/')?'.ts':'.tsx'),import.meta.url);assert.ok(fs.existsSync(path),`Missing required UI module: ${relative}`);const source=fs.readFileSync(path,'utf8'),m={exports:{}};modules.set(relative,m.exports);vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,AbortController,URLSearchParams,crypto:{randomUUID:injections.randomUUID??(()=> 'fresh-request-id')},fetch:fetcher,navigator:{clipboard:{writeText:async value=>{injections.copied?.(value);}}},window:{setTimeout:fn=>{injections.timer?.(fn);return 1;},clearTimeout:()=>{},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),location:{assign:injections.redirect??(()=>{})}},require:id=>id==='react'?hooks:id==='next/link'?'a':injections[id]??(id.startsWith('@/')?load(id.replace('@/','')):require(id))});return m.exports;}
 const component=load(`components/${file}`)[file];
 function render(){cursor=0;tree=component(props);return tree;}
 function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
 function text(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
 async function settle(){for(let i=0;i<4;i++){render();for(const effect of effects.splice(0))effect();await new Promise(resolve=>setImmediate(resolve));}render();}
 render();return {settle,render,nodes:()=>nodes(tree),text:()=>text(tree),find:(type,label)=>nodes(tree).find(n=>n.type===type&&text(n).includes(label)),listeners};
}

const song=(changes={})=>({revision:0,title:"A title",lyrics:"Original lyrics",style:"Original style",previous:null,pending:null,errorCode:null,...changes});
test("blank directions generate; edited components are submitted exactly and copy works",async()=>{
 const requests=[],copies=[];let current=song();
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(options?.method==="POST"){requests.push(JSON.parse(options.body));current=song({revision:1,pending:{id:"command-one",status:"queued"}});}return response({draft:current});},{randomUUID:()=>"123e4567-e89b-42d3-a456-426614174000",copied:value=>copies.push(value)});
 await ui.settle();assert.equal(ui.nodes().filter(n=>n.type==="textarea"&&n.props.placeholder).length,5);
 assert.ok(ui.nodes().filter(n=>n.type==="textarea"&&n.props.placeholder).every(n=>n.props.value===""));
 const style=ui.nodes().find(n=>n.type==="textarea"&&n.props.rows===5);style.props.onChange({target:{value:"Keep this style exactly\nline two"}});await ui.settle();
 await ui.find("button","Copy style prompt").props.onClick();assert.deepEqual(copies,["Keep this style exactly\nline two"]);
 await ui.find("button","Regenerate lyrics").props.onClick();await ui.settle();
 assert.equal(requests.length,1);assert.equal(requests[0].kind,"lyrics");assert.deepEqual(requests[0].options,{});assert.equal(requests[0].base.style,"Keep this style exactly\nline two");assert.equal(requests[0].base.title,"A title");assert.equal(ui.find("button","Generate song").props.disabled,true);
});
test("whole generation works on an empty result, and Undo uses no model direction fields",async()=>{
 const requests=[];let current=song({title:"",lyrics:"",style:""});const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(options?.method==="POST"){const body=JSON.parse(options.body);requests.push(body);current=song({revision:2,previous:{title:"Old",lyrics:"Old words",style:"Old style"}});}return response({draft:current});});
 await ui.settle();await ui.find("button","Generate song").props.onClick();await ui.settle();assert.equal(requests[0].kind,"generate");assert.deepEqual(requests[0].options,{});
 await ui.find("button","Undo previous result").props.onClick();await ui.settle();assert.equal(requests[1].kind,"undo");assert.equal("options" in requests[1],false);assert.equal("base" in requests[1],false);
});
test("lost response retries exact operation; access loss hides draft and cancels retry",async()=>{
 let denied=false;const requests=[];const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(path==="/api/member/access")return response({...owner,access:{...owner.access,owner:!denied}});if(options?.method==="POST"){requests.push(options.body);throw Error("lost");}return response({draft:song()});});
 await ui.settle();await ui.find("button","Generate song").props.onClick();await ui.settle();await ui.find("button","Retry unconfirmed request").props.onClick();await ui.settle();assert.equal(requests[0],requests[1]);assert.equal(ui.find("button","Generate song").props.disabled,true);
 denied=true;await ui.listeners.get("focus")();await ui.settle();assert.equal(ui.find("button","Retry unconfirmed request"),undefined);assert.equal(ui.nodes().some(n=>n.type==="textarea"),false);
});
test("Crew sees only assigned available tools and loses links when grant changes",async()=>{
 let current={...owner,access:{owner:false,crew:true,permissions:["song.generate"],availablePermissions:["show.overview","song.generate","insights.read"]}};
 const ui=harness("CrewWorkspace",{access:current},async()=>response(current));await ui.settle();
 assert.ok(ui.find("a","BARCODE song generator"));assert.equal(ui.find("a","Live show overview"),undefined);assert.equal(ui.find("a","Show & community insights"),undefined);
 current={...current,access:{...current.access,permissions:[]}};await ui.listeners.get("focus")();await ui.settle();assert.equal(ui.find("a","BARCODE song generator"),undefined);
});



test("pending updates continue after a temporary network failure",async()=>{
 let reads=0,timer;const ui=harness("BarcodeSongWorkspace",{access:owner},async()=>{reads++;if(reads===2)throw Error("offline once");return response({draft:song({pending:{id:"same-job",status:"claimed"}})});},{timer:fn=>{timer=fn;}});
 await ui.settle();assert.equal(reads,1);assert.equal(typeof timer,"function");
 const first=timer;await first();await ui.settle();assert.match(ui.text(),/temporarily unavailable/);assert.notEqual(timer,first);
 await timer();await ui.settle();assert.equal(reads,3);assert.match(ui.text(),/BNL is working/);
});


test("focus during a submitted request recovers persisted pending state without another operation",async()=>{
 let finishPost,stored=song(),posts=0;
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{
  if(path==="/api/member/access")return response(owner);
  if(options?.method==="POST"){posts++;stored=song({revision:1,pending:{id:"persisted-job",status:"queued"}});return new Promise(resolve=>{finishPost=resolve;});}
  return response({draft:stored});
 });
 await ui.settle();const pending=ui.find("button","Generate song").props.onClick();await ui.settle();
 await ui.listeners.get("focus")();await ui.settle();assert.match(ui.text(),/BNL is working/);
 finishPost(response({draft:stored}));await pending;await ui.settle();assert.equal(posts,1);assert.equal(ui.find("button","Generate song").props.disabled,true);
});


test("focus read cannot permanently hide a POST that commits after that read",async()=>{
 let finishPost,stored=song(),posts=0,reads=0;
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{
  if(path==="/api/member/access")return response(owner);
  if(options?.method==="POST"){posts++;return new Promise(resolve=>{finishPost=()=>{stored=song({revision:1,pending:{id:"late-persisted-job",status:"queued"}});resolve(response({draft:stored}));};});}
  reads++;return response({draft:stored});
 });
 await ui.settle();const pending=ui.find("button","Generate song").props.onClick();await ui.settle();
 await ui.listeners.get("focus")();await ui.settle();assert.doesNotMatch(ui.text(),/BNL is working/);
 finishPost();await pending;await ui.settle();assert.equal(posts,1);assert.ok(reads>=3);assert.match(ui.text(),/BNL is working/);assert.equal(ui.find("button","Generate song").props.disabled,true);
});


test("late precommit read cannot overwrite newer pending state",async()=>{
 let finishPost,finishOldRead,stored=song(),reads=0;
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{
  if(path==="/api/member/access")return response(owner);
  if(options?.method==="POST")return new Promise(resolve=>{finishPost=()=>{stored=song({revision:1,pending:{id:"latest-job",status:"queued"}});resolve(response({draft:stored}));};});
  reads++;if(reads===2)return new Promise(resolve=>{finishOldRead=()=>resolve(response({draft:song()}));});
  return response({draft:stored});
 });
 await ui.settle();const post=ui.find("button","Generate song").props.onClick();await ui.settle();await ui.listeners.get("focus")();await ui.settle();
 finishPost();await post;await ui.settle();assert.match(ui.text(),/BNL is working/);
 finishOldRead();await ui.settle();assert.match(ui.text(),/BNL is working/);assert.equal(ui.find("button","Generate song").props.disabled,true);
});
