import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url), React=require('react');
const owner={user:{id:'founder-id',name:'Founder'},session:{expiresAt:'2099-01-01T00:00:00Z'},access:{owner:true,crew:false,permissions:[],availablePermissions:['song.generate','show.overview','insights.read']}};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function harness(file,props={},fetcher=async()=>response(owner),injections={}) {
 const slots=[],dependencies=[],effects=[],cleanups=[],listeners=new Map();let cursor=0,tree;
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots)) slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!dependencies[i]||deps?.some((v,j)=>v!==dependencies[i][j])) {dependencies[i]=deps;effects.push({index:i,fn});}},useCallback(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i].deps[j]))slots[i]={fn,deps};return slots[i].fn;}};
 const modules=new Map();
 function load(relative){if(modules.has(relative))return modules.get(relative);const path=new URL('../src/'+relative+(relative.startsWith('lib/')?'.ts':'.tsx'),import.meta.url);assert.ok(fs.existsSync(path),`Missing required UI module: ${relative}`);const source=fs.readFileSync(path,'utf8'),m={exports:{}};modules.set(relative,m.exports);vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,AbortController,URLSearchParams,crypto:{randomUUID:injections.randomUUID??(()=> 'fresh-request-id')},fetch:fetcher,navigator:injections.navigator??{clipboard:{writeText:async value=>{injections.copied?.(value);}}},document:injections.document,window:{setTimeout:fn=>{injections.timer?.(fn);return 1;},clearTimeout:()=>{},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),location:{assign:injections.redirect??(()=>{})}},require:id=>id==='react'?hooks:id==='next/link'?'a':injections[id]??(id.startsWith('@/')?load(id.replace('@/','')):require(id))});return m.exports;}
 const component=load(`components/${file}`)[file];
 function render(){cursor=0;tree=component(props);return tree;}
 function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
 function text(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
 async function settle(){for(let i=0;i<4;i++){render();for(const effect of effects.splice(0)){cleanups[effect.index]?.();cleanups[effect.index]=effect.fn();}await new Promise(resolve=>setImmediate(resolve));}render();}
 render();return {settle,render,nodes:()=>nodes(tree),text:()=>text(tree),find:(type,label)=>nodes(tree).find(n=>n.type===type&&(text(n).includes(label)||n.props?.['aria-label']===label)),textOf:text,unmount:()=>{for(const cleanup of cleanups)cleanup?.();},listeners};
}

const song=(changes={})=>({revision:0,title:"A title",lyrics:"Original lyrics",style:"Original style",previous:null,pending:null,errorCode:null,selectedTrackId:null,options:{},tracks:[],...changes});
test("song output is read-only, optional directions reach BNL, and copy keeps saved text",async()=>{
 const requests=[],copies=[];let current=song();
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(options?.method==="POST"){requests.push(JSON.parse(options.body));current=song({revision:1,pending:{id:"command-one",status:"queued"},options:requests[0].options});}return response({draft:current});},{randomUUID:()=>"123e4567-e89b-42d3-a456-426614174000",copied:value=>copies.push(value)});
 await ui.settle();const directionFields=ui.nodes().filter(n=>n.type==="textarea"&&n.props.placeholder);assert.equal(directionFields.length,5);assert.ok(directionFields.every(n=>n.props.value===""));
 const output=ui.nodes().filter(n=>n.type==="input"||(n.type==="textarea"&&!n.props.placeholder));assert.equal(output.length,3);assert.ok(output.every(n=>n.props.readOnly===true&&n.props.onChange===undefined));
 directionFields.at(-1).props.onChange({target:{value:"Keep the original style, shorten the chorus."}});await ui.settle();
 await ui.find("button","Copy style prompt").props.onClick();assert.deepEqual(copies,["Original style"]);
 await ui.find("button","Regenerate lyrics").props.onClick();await ui.settle();
 assert.equal(requests.length,1);assert.equal(requests[0].kind,"lyrics");assert.equal(requests[0].options.revisionInstructions,"Keep the original style, shorten the chorus.");assert.equal(requests[0].base.style,"Original style");assert.equal(requests[0].base.lyrics,"Original lyrics");assert.equal(requests[0].base.title,"A title");assert.equal(ui.find("button","Generate song").props.disabled,true);
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
 await timer();await ui.settle();assert.equal(reads,3);assert.ok(ui.nodes().some(n=>n.props?.role==='progressbar'));assert.match(ui.text(),/BNL is working|request is queued/);
});


test("focus during a submitted request recovers persisted pending state without another operation",async()=>{
 let finishPost,timer,stored=song(),posts=0;
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{
  if(path==="/api/member/access")return response(owner);
  if(options?.method==="POST"){posts++;stored=song({revision:1,pending:{id:"persisted-job",status:"queued"}});return new Promise(resolve=>{finishPost=resolve;});}
  return response({draft:stored});
 },{timer:fn=>{timer=fn;}});
 await ui.settle();const pending=ui.find("button","Generate song").props.onClick();await ui.settle();
 await ui.listeners.get("focus")();await ui.settle();assert.ok(ui.nodes().some(n=>n.props?.role==='progressbar'));assert.match(ui.text(),/BNL is working|request is queued/);
 finishPost(response({draft:stored}));await pending;await ui.settle();assert.equal(posts,1);assert.equal(ui.find("button","Generate song").props.disabled,true);assert.equal(ui.find("button","Generate song").props["aria-busy"],true);assert.match(ui.textOf(ui.find("button","Generate song")),/Generating/);
 stored=song({revision:2,lyrics:"Finished after focus"});await timer();await ui.settle();assert.equal(ui.find("button","Generate song").props["aria-busy"],false);assert.equal(progress(ui),undefined);
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
 finishPost();await pending;await ui.settle();assert.equal(posts,1);assert.ok(reads>=3);assert.ok(ui.nodes().some(n=>n.props?.role==='progressbar'));assert.match(ui.text(),/BNL is working|request is queued/);assert.equal(ui.find("button","Generate song").props.disabled,true);
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
 finishPost();await post;await ui.settle();assert.ok(ui.nodes().some(n=>n.props?.role==='progressbar'));assert.match(ui.text(),/BNL is working|request is queued/);
 finishOldRead();await ui.settle();assert.ok(ui.nodes().some(n=>n.props?.role==='progressbar'));assert.match(ui.text(),/BNL is working|request is queued/);assert.equal(ui.find("button","Generate song").props.disabled,true);
});

const track=(id,title,createdAt)=>({id,title,createdAt,updatedAt:createdAt});
const archivedA="123e4567-e89b-42d3-a456-426614174001",archivedB="123e4567-e89b-42d3-a456-426614174002",archivedC="123e4567-e89b-42d3-a456-426614174003";
const archiveRows=ui=>ui.nodes().filter(n=>n.type==="li").map(n=>ui.textOf(n));
const openTrack=(ui,title)=>ui.nodes().find(n=>n.type==="button"&&n.props["aria-label"]==="Open track: "+title);
test("song archive displays its count and sorts by newest, oldest, and title",async()=>{
 const tracks=[track(archivedA,"Zulu",1000),track(archivedB,"Alpha",3000),track(archivedC,"Middle",2000)];
 const ui=harness("BarcodeSongWorkspace",{access:owner},async()=>response({draft:song({tracks})}));await ui.settle();
 assert.ok(ui.text().includes("3 / 40"));assert.match(ui.text(),/newest 40/i);assert.match(ui.text(),/oldest/i);
 assert.deepEqual(archiveRows(ui).map(row=>row.split("Saved")[0].trim()),["Alpha","Middle","Zulu"]);
 const sort=ui.nodes().find(n=>n.type==="select"&&n.props["aria-label"]==="Sort saved songs");assert.ok(sort);
 sort.props.onChange({target:{value:"oldest"}});await ui.settle();assert.deepEqual(archiveRows(ui).map(row=>row.split("Saved")[0].trim()),["Zulu","Middle","Alpha"]);
 sort.props.onChange({target:{value:"title"}});await ui.settle();assert.deepEqual(archiveRows(ui).map(row=>row.split("Saved")[0].trim()),["Alpha","Middle","Zulu"]);
});
test("Open track restores saved text and directions using one revisioned selection request",async()=>{
 const requests=[],tracks=[track(archivedA,"Saved song",1000)];let current=song({revision:7,tracks,options:{idea:"Current direction"}});
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(options?.method==="POST"){requests.push(JSON.parse(options.body));current=song({revision:8,selectedTrackId:archivedA,title:"Saved song",lyrics:"Saved lyrics",style:"Saved style",options:{idea:"Saved idea",mood:"Saved mood"},tracks});}return response({draft:current});},{randomUUID:()=>"123e4567-e89b-42d3-a456-426614174000"});
 await ui.settle();await openTrack(ui,"Saved song").props.onClick();await ui.settle();
 assert.deepEqual(requests,[{requestId:"123e4567-e89b-42d3-a456-426614174000",expectedRevision:7,kind:"select",trackId:archivedA}]);
 assert.equal(ui.nodes().find(n=>n.type==="input").props.value,"Saved song");assert.equal(ui.nodes().find(n=>n.type==="textarea"&&n.props.rows===18).props.value,"Saved lyrics");assert.equal(ui.nodes().find(n=>n.type==="textarea"&&n.props.rows===5).props.value,"Saved style");
 const directions=ui.nodes().filter(n=>n.type==="textarea"&&n.props.placeholder);assert.equal(directions[0].props.value,"Saved idea");assert.equal(directions[2].props.value,"Saved mood");assert.equal(directions[4].props.value,"");
});
test("pending generation keeps saved song copying available and prevents archive selection",async()=>{
 const copies=[],ui=harness("BarcodeSongWorkspace",{access:owner},async()=>response({draft:song({pending:{id:"pending-song",status:"queued"},tracks:[track(archivedA,"Saved song",1000)]})}),{copied:value=>copies.push(value)});await ui.settle();
 assert.equal(openTrack(ui,"Saved song").props.disabled,true);const output=ui.nodes().find(n=>n.type==="fieldset"&&ui.textOf(n).includes("Your song"));assert.notEqual(output.props.disabled,true);
 await ui.find("button","Copy lyrics").props.onClick();assert.deepEqual(copies,["Original lyrics"]);
});
test("a lost archive selection response retries the same request without replacing displayed text",async()=>{
 const requests=[],ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(options?.method==="POST"){requests.push(options.body);throw Error("lost selection");}return response({draft:song({revision:5,tracks:[track(archivedA,"Saved song",1000)]})});});await ui.settle();
 await openTrack(ui,"Saved song").props.onClick();await ui.settle();assert.equal(ui.nodes().find(n=>n.type==="textarea"&&n.props.rows===18).props.value,"Original lyrics");assert.equal(openTrack(ui,"Saved song").props.disabled,true);
 await ui.find("button","Retry unconfirmed request").props.onClick();await ui.settle();assert.equal(requests.length,2);assert.equal(requests[0],requests[1]);assert.equal(JSON.parse(requests[0]).kind,"select");
});
test("late reads cannot replace a newly opened track",async()=>{
 let reads=0,finishRead,current=song({revision:5,tracks:[track(archivedA,"Saved song",1000)]});
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(options?.method==="POST"){current=song({revision:6,selectedTrackId:archivedA,title:"Saved song",lyrics:"Saved lyrics",style:"Saved style",tracks:current.tracks});return response({draft:current});}reads++;if(reads===2)return new Promise(resolve=>{finishRead=()=>resolve(response({draft:song({revision:5,tracks:current.tracks})}));});return response({draft:current});});await ui.settle();
 ui.find("button","Refresh draft").props.onClick();await ui.settle();await openTrack(ui,"Saved song").props.onClick();await ui.settle();finishRead();await ui.settle();assert.equal(ui.nodes().find(n=>n.type==="textarea"&&n.props.rows===18).props.value,"Saved lyrics");
});
test("fresh access revocation clears the archive, text, directions and stale selection result",async()=>{
 let finishPost,denied=false;
 const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>{if(path==="/api/member/access")return response({...owner,access:{...owner.access,owner:!denied}});if(options?.method==="POST")return new Promise(resolve=>{finishPost=()=>resolve(response({draft:song({revision:2,title:"Late private title",lyrics:"Late private lyrics",options:{idea:"Late private idea"},tracks:[track(archivedA,"Late private title",1000)]})}));});return response({draft:song({tracks:[track(archivedA,"Saved private title",1000)],options:{idea:"Saved private idea"}})});});
 await ui.settle();openTrack(ui,"Saved private title").props.onClick();await ui.settle();denied=true;await ui.listeners.get("focus")();await ui.settle();finishPost();await ui.settle();
 assert.equal(ui.nodes().some(n=>n.type==="textarea"||n.type==="input"||n.type==="li"),false);assert.doesNotMatch(ui.text(),/Saved private|Late private/);assert.equal(ui.find("button","Retry unconfirmed request"),undefined);
});
test("an archive read finishing after unmount does not populate private results",async()=>{
 let finishRead;const ui=harness("BarcodeSongWorkspace",{access:owner},async()=>new Promise(resolve=>{finishRead=()=>resolve(response({draft:song({tracks:[track(archivedA,"Late private title",1000)]})}));}));await ui.settle();ui.unmount();finishRead();await ui.settle();assert.equal(ui.nodes().some(n=>n.type==="li"),false);assert.doesNotMatch(ui.text(),/Late private title/);
});

test("archive and saved-text conflicts show the service code without replacing current text",async()=>{
 for(const [code,message] of [["TRACK_NOT_FOUND","This saved track is no longer available"],["SONG_BASE_CONFLICT","Your saved song changed"]]){
  const ui=harness("BarcodeSongWorkspace",{access:owner},async(path,options)=>options?.method==="POST"?response({code},409):response({draft:song({tracks:[track(archivedA,"Saved song",1000)]})}));await ui.settle();
  await openTrack(ui,"Saved song").props.onClick();await ui.settle();assert.ok(ui.text().includes(message));assert.equal(ui.nodes().find(n=>n.type==="textarea"&&n.props.rows===18).props.value,"Original lyrics");assert.equal(ui.find("button","Retry unconfirmed request"),undefined);
 }
});

test("Owner and Crew can open Suno beside the copy controls before or after generating a song",async()=>{
 const crew={...owner,access:{...owner.access,owner:false,crew:true,permissions:["song.generate"]}};
 for(const access of [owner,crew])for(const empty of [true,false]){
  const ui=harness("BarcodeSongWorkspace",{access},async()=>response({draft:song(empty?{title:"",lyrics:"",style:""}:{})}));await ui.settle();
  const link=ui.find("a","Open Suno");assert.ok(link,"Open Suno should be available without requiring generated text");assert.equal(link.props.href,"https://suno.com/create");assert.equal(link.props.target,"_blank");assert.equal(link.props.rel,"noopener noreferrer");
  const controls=ui.nodes().find(n=>n.type==="div"&&Array.isArray(n.props.children)&&n.props.children.includes(link));assert.ok(controls);assert.match(ui.textOf(controls),/Copy style prompt/);assert.match(ui.textOf(controls),/Copy whole song/);
 }
});


// Browser clipboard methods are external boundaries; these fixtures preserve their selection/focus side effects.
function clipboardDocument({accepted=true,throws=false}={}) {
 const state={copied:null,removed:0,restored:0,selected:null,calls:0};
 const previous={focus:()=>state.restored++};let selected;
 const document={activeElement:previous,body:{appendChild:()=>{}},createElement:()=>({value:'',style:{},setAttribute:()=>{},focus:()=>{},select(){selected=this.value;state.selected=this.value;},setSelectionRange:()=>{},remove:()=>state.removed++}),execCommand:command=>{assert.equal(command,'copy');state.calls++;if(throws)throw Error('denied');if(accepted)state.copied=selected;return accepted;}};
 return {document,state};
}
const copyButton=(ui,label)=>ui.nodes().find(n=>n.type==='button'&&n.props['aria-label']===label)||ui.find('button',label);
const copyStatus=(ui,label)=>{const button=copyButton(ui,label);return ui.nodes().find(n=>n.props?.id===button.props['aria-describedby']);};
const draftOutput=ui=>ui.nodes().find(n=>n.type==='fieldset'&&ui.textOf(n).includes('Your song'));
const progress=ui=>ui.nodes().find(n=>n.props?.role==='progressbar');

test('copy acknowledges the pressed control immediately and keeps nearby success through polling',async()=>{
 let finishCopy,timer;const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song({pending:{id:'copy-job',status:'running'}})}),{navigator:{clipboard:{writeText:()=>new Promise(resolve=>{finishCopy=resolve;})}},timer:fn=>{timer=fn;}});await ui.settle();
 copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();assert.equal(copyButton(ui,'Copy lyrics').props['aria-busy'],true);assert.match(ui.textOf(copyButton(ui,'Copy lyrics')),/Copying/);assert.equal(copyButton(ui,'Copy lyrics').props.disabled,true);
 finishCopy();await ui.settle();assert.match(ui.textOf(copyButton(ui,'Copy lyrics')),/Copied/);assert.match(ui.textOf(copyStatus(ui,'Copy lyrics')),/Lyrics copied/);assert.equal(copyStatus(ui,'Copy lyrics').props.role,'status');
 await timer();await ui.settle();assert.match(ui.textOf(copyStatus(ui,'Copy lyrics')),/Lyrics copied/);assert.doesNotMatch(ui.textOf(copyStatus(ui,'Copy style prompt')),/copied/i);
});

test('unavailable modern clipboard uses exact text legacy copy and restores focus',async()=>{
 const {document,state}=clipboardDocument();const lyrics='A long line 🌟\n'+ 'full text '.repeat(200);const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song({lyrics})}),{navigator:{},document});await ui.settle();
 copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();assert.equal(state.copied,lyrics);assert.equal(state.removed,1);assert.equal(state.restored,1);assert.match(ui.textOf(copyStatus(ui,'Copy lyrics')),/Lyrics copied/);
});

test('modern clipboard rejection tries legacy copy without falsely reporting failure',async()=>{
 const {document,state}=clipboardDocument();const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song()}),{navigator:{clipboard:{writeText:async()=>{throw Error('NotAllowedError');}}},document});await ui.settle();
 copyButton(ui,'Copy style prompt').props.onClick();await ui.settle();assert.equal(state.copied,'Original style');assert.match(ui.textOf(copyStatus(ui,'Copy style prompt')),/Style prompt copied/);
});

test('both clipboard methods denied show nearby failure and an explicit read-only manual selection',async()=>{
 const {document,state}=clipboardDocument({accepted:false});const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song()}),{navigator:{clipboard:{writeText:async()=>{throw Error('NotAllowedError');}}},document});await ui.settle();
 copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();assert.match(ui.textOf(copyButton(ui,'Copy lyrics')),/Copy failed/);assert.doesNotMatch(ui.textOf(copyStatus(ui,'Copy lyrics')),/copied/i);assert.match(ui.textOf(copyStatus(ui,'Copy lyrics')),/Select text/);assert.equal(state.copied,null);
 const selection=ui.find('button','Select lyrics');assert.ok(selection);const output=ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18);let selected=0;output.props.ref.current={focus:()=>{},select:()=>selected++};selection.props.onClick();assert.equal(selected,1);assert.equal(output.props.readOnly,true);
});

test('whole-song manual copying retains the exact complete text when clipboard throws',async()=>{
 const {document}=clipboardDocument({throws:true});const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song()}),{navigator:{},document});await ui.settle();
 copyButton(ui,'Copy whole song').props.onClick();await ui.settle();const output=ui.nodes().find(n=>n.type==='textarea'&&n.props['aria-label']==='Whole song for manual copying');assert.ok(output);assert.equal(output.props.value,'A title\n\nOriginal lyrics\n\nSuno style prompt\nOriginal style');assert.equal(output.props.readOnly,true);assert.equal(output.props.onChange,undefined);assert.ok(ui.find('button','Select whole song'));
});

test('empty copy controls are disabled while existing text remains copyable during generation',async()=>{
 const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song({title:'',lyrics:'',style:''})}));await ui.settle();for(const label of ['Copy lyrics','Copy style prompt','Copy whole song'])assert.equal(copyButton(ui,label).props.disabled,true);
});

test('clipboard completion after access revocation or unmount neither copies fallback nor restores private feedback',async()=>{
 for(const revoke of [false,true]){
  let finishCopy;const {document,state}=clipboardDocument();const ui=harness('BarcodeSongWorkspace',{access:owner},async path=>path==='/api/member/access'?response({...owner,access:{...owner.access,owner:false}}):response({draft:song()}),{document,navigator:{clipboard:{writeText:()=>new Promise((resolve,reject)=>{finishCopy=()=>reject(Error('denied'));})}}});await ui.settle();copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();
  if(revoke){await ui.listeners.get('focus')();await ui.settle();}else ui.unmount();finishCopy();await ui.settle();assert.equal(state.calls,0);assert.doesNotMatch(ui.text(),/Lyrics copied|Copy failed/);
 }
});

test('an old clipboard outcome cannot overwrite a newer copy after the saved text changes',async()=>{
 const pending=[];let current=song();const {document,state}=clipboardDocument();const ui=harness('BarcodeSongWorkspace',{access:owner},async(path,options)=>{if(options?.method==='POST')current=song({revision:1,lyrics:'New lyrics'});return response({draft:current});},{document,navigator:{clipboard:{writeText:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))}}});await ui.settle();copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();ui.find('button','Generate song').props.onClick();await ui.settle();assert.equal(copyButton(ui,'Copy lyrics').props.disabled,false);copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();pending[0].reject(Error('old denial'));await ui.settle();assert.equal(state.calls,0);assert.match(ui.textOf(copyButton(ui,'Copy lyrics')),/Copying/);pending[1].resolve();await ui.settle();assert.match(ui.textOf(copyStatus(ui,'Copy lyrics')),/Lyrics copied/);
});

test('generation acknowledges a click before POST resolves then tracks queued, working and complete',async()=>{
 let finishPost,timer,posts=0,current=song();const ui=harness('BarcodeSongWorkspace',{access:owner},async(path,options)=>{if(options?.method==='POST'){posts++;return new Promise(resolve=>{finishPost=()=>{current=song({revision:1,pending:{id:'progress-job',status:'queued'}});resolve(response({draft:current}));};});}return response({draft:current});},{timer:fn=>{timer=fn;}});await ui.settle();
 ui.find('button','Generate song').props.onClick();await ui.settle();assert.match(ui.text(),/Sending your request/);assert.match(ui.textOf(ui.find('button','Generate song')),/Generating/);assert.equal(ui.find('button','Generate song').props['aria-busy'],true);assert.ok(progress(ui));assert.equal(progress(ui).props['aria-valuenow'],undefined);assert.equal(ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18).props['aria-busy'],true);assert.match(ui.textOf(draftOutput(ui)),/Previous result/);assert.equal(ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18).props.value,'Original lyrics');assert.equal(copyButton(ui,'Copy lyrics').props.disabled,false);
 ui.find('button','Generate song').props.onClick();assert.equal(posts,1);finishPost();await ui.settle();assert.match(ui.text(),/queued/i);assert.ok(progress(ui));
 for(const status of ['claimed','running']){current=song({revision:2,pending:{id:'progress-job',status}});await timer();await ui.settle();assert.ok(ui.nodes().some(n=>n.props?.role==='progressbar'));assert.match(ui.text(),/BNL is working|request is queued/);assert.ok(progress(ui));}
 current=song({revision:3,title:'Finished',lyrics:'Finished lyrics',style:'Finished style'});await timer();await ui.settle();assert.equal(progress(ui),undefined);assert.equal(ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18).props['aria-busy'],false);assert.doesNotMatch(ui.textOf(draftOutput(ui)),/Previous result/);assert.equal(ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18).props.value,'Finished lyrics');assert.equal(ui.find('button','Generate song').props.disabled,false);
});

test('a failed generation stops progress and preserves the previous saved result with its error',async()=>{
 let timer,current=song({pending:{id:'failing-job',status:'running'}});const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:current}),{timer:fn=>{timer=fn;}});await ui.settle();assert.ok(progress(ui));current=song({revision:1,errorCode:'GENERATION_INTERRUPTED'});await timer();await ui.settle();assert.equal(progress(ui),undefined);assert.match(ui.text(),/Generation was interrupted/);assert.equal(ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18).props.value,'Original lyrics');assert.equal(ui.find('button','Generate song').props.disabled,false);
});

test('Refresh draft shows its own immediate activity and releases after a read failure',async()=>{
 let reads=0,fail;const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>{if(++reads===2)return new Promise((resolve,reject)=>{fail=()=>reject(Error('offline'));});return response({draft:song()});});await ui.settle();ui.find('button','Refresh draft').props.onClick();await ui.settle();assert.equal(ui.find('button','Refresh draft').props['aria-busy'],true);assert.match(ui.textOf(ui.find('button','Refresh draft')),/Refreshing/);fail();await ui.settle();assert.equal(ui.find('button','Refresh draft').props['aria-busy'],false);assert.equal(ui.find('button','Refresh draft').props.disabled,false);assert.match(ui.text(),/temporarily unavailable/);
});


test('focus revalidation during copying releases its indicator without stale fallback',async()=>{
 let finishCopy,calls=0;const {document,state}=clipboardDocument();const ui=harness('BarcodeSongWorkspace',{access:owner},async path=>path==='/api/member/access'?response(owner):response({draft:song()}),{document,navigator:{clipboard:{writeText:()=>++calls===1?new Promise((resolve,reject)=>{finishCopy=()=>reject(Error('denied'));}):Promise.resolve()}}});await ui.settle();copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();await ui.listeners.get('focus')();await ui.settle();finishCopy();await ui.settle();assert.equal(copyButton(ui,'Copy lyrics').props.disabled,false);assert.equal(copyButton(ui,'Copy lyrics').props['aria-busy'],false);assert.equal(state.calls,0);copyButton(ui,'Copy lyrics').props.onClick();await ui.settle();assert.match(ui.textOf(copyStatus(ui,'Copy lyrics')),/Lyrics copied/);assert.equal(calls,2);
});

test('focus revalidation during refresh releases its indicator and ignores the stale read',async()=>{
 let finishRead,reads=0;const ui=harness('BarcodeSongWorkspace',{access:owner},async path=>{if(path==='/api/member/access')return response(owner);if(++reads===2)return new Promise(resolve=>{finishRead=()=>resolve(response({draft:song({revision:1,lyrics:'Stale focus read'})}));});return response({draft:song()});});await ui.settle();ui.find('button','Refresh draft').props.onClick();await ui.settle();await ui.listeners.get('focus')();await ui.settle();finishRead();await ui.settle();assert.equal(ui.find('button','Refresh draft').props.disabled,false);assert.equal(ui.find('button','Refresh draft').props['aria-busy'],false);assert.equal(ui.nodes().find(n=>n.type==='textarea'&&n.props.rows===18).props.value,'Original lyrics');
});


test('each requested action identifies only its pressed control while awaiting the server',async()=>{
 for(const [label,kind] of [['Generate song','generate'],['Regenerate lyrics','lyrics'],['Regenerate style prompt','style'],['Undo previous result','undo']]){
  let finishPost;const requests=[];const ui=harness('BarcodeSongWorkspace',{access:owner},async(path,options)=>{if(options?.method==='POST'){requests.push(JSON.parse(options.body));return new Promise(resolve=>{finishPost=()=>resolve(response({draft:song({revision:1})}));});}return response({draft:song({previous:{title:'Previous',lyrics:'Previous lyrics',style:'Previous style'}})});});await ui.settle();ui.find('button',label).props.onClick();await ui.settle();assert.equal(requests[0].kind,kind);assert.equal(ui.find('button',label).props['aria-busy'],true);assert.equal(ui.nodes().filter(n=>n.type==='button'&&n.props['aria-busy']===true).length,1);assert.ok(progress(ui));finishPost();await ui.settle();assert.equal(ui.find('button',label).props['aria-busy'],false);
 }
});

test('opening a saved track marks only that track as active and clears after the response',async()=>{
 let finishPost;const tracks=[track(archivedA,'First saved',1000),track(archivedB,'Second saved',2000)];const ui=harness('BarcodeSongWorkspace',{access:owner},async(path,options)=>options?.method==='POST'?new Promise(resolve=>{finishPost=()=>resolve(response({draft:song({revision:1,tracks})}));}):response({draft:song({tracks})}));await ui.settle();openTrack(ui,'First saved').props.onClick();await ui.settle();assert.equal(openTrack(ui,'First saved').props['aria-busy'],true);assert.match(openTrack(ui,'First saved').props.className,/ring-1/);assert.equal(openTrack(ui,'Second saved').props['aria-busy'],false);assert.doesNotMatch(openTrack(ui,'Second saved').props.className,/ring-1|cursor-wait/);assert.match(ui.textOf(openTrack(ui,'First saved')),/Opening/);finishPost();await ui.settle();assert.equal(openTrack(ui,'First saved').props['aria-busy'],false);
});


// aria-busy on an ancestor may defer live announcements; copying a previous result stays immediate.
function busyAncestor(root,target,busy=false) {
 if(!root||typeof root!=='object')return null;
 if(Array.isArray(root)){for(const child of root){const found=busyAncestor(child,target,busy);if(found!==null)return found;}return null;}
 if(root===target)return busy;
 return busyAncestor(root.props?.children,target,busy||root.props?.['aria-busy']===true);
}
test('previous-result copy announcements have no busy ancestor during a queued generation',async()=>{
 const ui=harness('BarcodeSongWorkspace',{access:owner},async()=>response({draft:song({pending:{id:'copy-announcement-job',status:'queued'}})}));await ui.settle();assert.ok(progress(ui));
 for(const label of ['Copy lyrics','Copy style prompt','Copy whole song']){copyButton(ui,label).props.onClick();await ui.settle();const status=copyStatus(ui,label);assert.match(ui.textOf(status),/copied/);assert.equal(busyAncestor(ui.nodes()[0],status),false);}
});
