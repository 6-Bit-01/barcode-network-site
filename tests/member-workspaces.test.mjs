import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url), React=require('react');
const owner={user:{id:'founder-id',name:'Founder'},session:{expiresAt:'2099-01-01T00:00:00Z'},access:{owner:true,crew:false,permissions:[],availablePermissions:[]}};
const account={id:'member-id',name:'Member',email:'member@example.test',emailVerified:true,suspended:false,owner:false,crew:false,permissions:[],revision:2,createdAt:'2026-10-01T00:00:00Z'};
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
function harness(file,props={},fetcher=async()=>response(owner),injections={}) {
 const slots=[],dependencies=[],effects=[],listeners=new Map();let cursor=0,tree;
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial){const i=cursor++;if(!(i in slots)) slots[i]={current:initial};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!dependencies[i]||deps?.some((v,j)=>v!==dependencies[i][j])) {dependencies[i]=deps;effects.push(fn);}},useCallback:fn=>{cursor++;return fn;}};
 const modules=new Map();
 function load(relative){if(modules.has(relative))return modules.get(relative);const path=new URL(`../src/${relative}.tsx`,import.meta.url);assert.ok(fs.existsSync(path),`Missing required UI module: ${relative}`);const source=fs.readFileSync(path,'utf8'),m={exports:{}};modules.set(relative,m.exports);vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:m,exports:m.exports,AbortController,URLSearchParams,crypto:{randomUUID:injections.randomUUID??(()=> 'fresh-request-id')},fetch:fetcher,window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),location:{assign:injections.redirect??(()=>{})}},require:id=>id==='react'?hooks:id==='next/link'?'a':injections[id]??(id.startsWith('@/components/')?load(id.replace('@/','')):require(id))});return m.exports;}
 const component=load(`components/${file}`)[file];
 function render(){cursor=0;tree=component(props);return tree;}
 function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
 function text(node){if(node===null||node===undefined||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
 async function settle(){for(let i=0;i<4;i++){render();for(const effect of effects.splice(0))effect();await new Promise(resolve=>setImmediate(resolve));}render();}
 render();return {settle,render,nodes:()=>nodes(tree),text:()=>text(tree),find:(type,label)=>nodes(tree).find(n=>n.type===type&&text(n).includes(label)),listeners};
}
test('account access navigation follows genuine assigned roles and clears on revoked access',async()=>{
 let access=owner;const ui=harness('MemberAccessNavigation',{memberId:'founder-id'},async()=>response(access));await ui.settle();assert.ok(ui.find('a','Owner access'));assert.equal(ui.find('a','Crew access'),undefined);
 access={...owner,access:{...owner.access,owner:false,crew:true}};await ui.listeners.get('focus')();await ui.settle();assert.equal(ui.find('a','Owner access'),undefined);assert.ok(ui.find('a','Crew access'));
 access=null;await ui.listeners.get('focus')();await ui.settle();assert.equal(ui.find('a','Crew access'),undefined);
});
test('Crew assignment has an honest empty state and no future tool links',()=>{
 const ui=harness('CrewWorkspace',{access:{...owner,access:{...owner.access,owner:false,crew:true,permissions:['song.generate']}}});assert.match(ui.text(),/Your Crew access is assigned\. Tools will become available here as they are ready\./);assert.deepEqual(ui.nodes().filter(n=>n.type==='a').map(n=>n.props.href),['/account']);
});
test('protected page wrappers deny before creating private workspace HTML and pass the guarded access',async()=>{
 for(const role of ['owner','crew']) {
  const path=new URL(`../src/app/account/${role}/page.tsx`,import.meta.url);assert.ok(fs.existsSync(path),`Missing protected ${role} page`);const source=fs.readFileSync(path,'utf8');let allowed=false,calledRole;const m={exports:{}};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:m,exports:m.exports,require:id=>id==='@/lib/member-access'?{requireMemberWorkspaceAccess:async requested=>{calledRole=requested;if(!allowed)throw new Error('denied');return owner;}}:id.startsWith('@/components/')?{OwnerAccountWorkspace:()=>null,CrewWorkspace:()=>null}:require(id)});
  await assert.rejects(m.exports.default(),/denied/);assert.equal(calledRole,role);allowed=true;const rendered=await m.exports.default();assert.equal(rendered.props.access,owner);
 }
});
test('Owner mutations use target revision and fresh id and wait for confirmed success',async()=>{
 const requests=[];let resolveAction;const ui=harness('OwnerAccountWorkspace',{access:owner},async(path,options)=>{requests.push({path,options});if(path.includes('/action'))return new Promise(resolve=>{resolveAction=resolve;});return response({accounts:[account],nextCursor:null});});await ui.settle();ui.find('button','View account').props.onClick();await ui.settle();const pending=ui.find('button','Suspend account').props.onClick();await ui.settle();assert.doesNotMatch(ui.text(),/Account suspended\./);assert.equal(ui.find('button','Suspend account').props.disabled,true);const body=JSON.parse(requests.find(r=>r.path.includes('/action')).options.body);assert.deepEqual(body,{requestId:'fresh-request-id',targetId:'member-id',expectedRevision:2,action:'suspend'});resolveAction(response({ok:true,account:{...account,suspended:true,revision:3}}));await pending;await ui.settle();assert.match(ui.text(),/Account suspended\./);
});
test('Owner cannot suspend themselves; empty available permissions offer no future capability',async()=>{
 const ui=harness('OwnerAccountWorkspace',{access:owner},async()=>response({accounts:[{...account,id:'founder-id',owner:true}],nextCursor:null}));await ui.settle();ui.find('button','View account').props.onClick();await ui.settle();assert.equal(ui.find('button','Suspend account').props.disabled,true);assert.doesNotMatch(ui.text(),/song\.generate|support\.conversations|quality\.reports|insights\.read/);assert.ok(ui.find('a','Existing admin workspace — separate access during transition'));
});
test('stale Owner revision reports a conflict and refreshes the directory without success',async()=>{
 let reads=0;const ui=harness('OwnerAccountWorkspace',{access:owner},async(path)=>path.includes('/action')?response({code:'REVISION_CONFLICT'},409):(reads++,response({accounts:[account],nextCursor:null})));await ui.settle();ui.find('button','View account').props.onClick();await ui.settle();await ui.find('button','Suspend account').props.onClick();await ui.settle();assert.ok(reads>=2);assert.match(ui.text(),/changed|refresh/i);assert.doesNotMatch(ui.text(),/Account suspended\./);assert.equal(ui.find('button','Retry unconfirmed action'),undefined);
});
test('directory sends bounded filtering and supports the next cursor without exposing raw cursor fields',async()=>{
 const requests=[];const ui=harness('OwnerAccountWorkspace',{access:owner},async(path)=>{requests.push(path);return response({accounts:[account],nextCursor:'cursor-next'});});await ui.settle();assert.match(requests[0],/limit=25/);ui.find('button','Next page').props.onClick();await ui.settle();assert.match(requests.at(-1),/cursor=cursor-next/);assert.doesNotMatch(ui.text(),/cursor-next/);
});
test('ordinary account explains unique renameable names and keeps prior name on rejected rename',async()=>{
 for(const [code,expected] of [['NAME_UNAVAILABLE',/display name is unavailable/],['INVALID_NAME',/visible characters/]]) {
  const ui=harness('MemberAccount',{},async(path)=>path.endsWith('update-user')?response({code},400):response({user:{id:'member-id',name:'Original',email:'member@example.test',emailVerified:true}}));await ui.settle();assert.match(ui.text(),/Display names are unique/);const input=ui.nodes().find(n=>n.type==='input'&&n.props.autoComplete==='nickname');input.props.onChange({target:{value:'Rejected'}});ui.render();const form=ui.nodes().find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});await ui.settle();assert.match(ui.text(),expected);assert.equal(ui.nodes().find(n=>n.type==='input'&&n.props.autoComplete==='nickname').props.value,'Rejected');assert.doesNotMatch(ui.text(),/Display name saved/);
 }
});
test('account auth denial clears the signed-in account and its access navigation',async()=>{
 const ui=harness('MemberAccount',{},async(path)=>path.endsWith('update-user')?response({code:'UNAUTHORIZED'},401):response({user:{id:'member-id',name:'Original',email:'member@example.test',emailVerified:true}}));await ui.settle();assert.match(ui.text(),/BARCODE ID: member-id/);ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await ui.settle();assert.doesNotMatch(ui.text(),/BARCODE ID: member-id|member@example.test/);assert.equal(ui.nodes().some(n=>n.props?.memberId==='member-id'),false);
});
test('Owner auth denial clears private directory data and returns to the account',async()=>{
 let denied=false,redirect;const ui=harness('OwnerAccountWorkspace',{access:owner},async()=>denied?response({code:'FORBIDDEN'},403):response({accounts:[account],nextCursor:null}),{redirect:path=>{redirect=path;}});await ui.settle();assert.match(ui.text(),/member@example.test/);denied=true;await ui.find('button','Refresh directory').props.onClick();await ui.settle();assert.equal(redirect,'/account');assert.doesNotMatch(ui.text(),/member@example.test|Owner workspace/);
});
test('search and verification/access filters are applied to the directory request',async()=>{
 const requests=[];const ui=harness('OwnerAccountWorkspace',{access:owner},async(path)=>{requests.push(path);return response({accounts:[],nextCursor:null});});await ui.settle();const search=ui.nodes().find(n=>n.type==='input'&&n.props.type==='search');search.props.onChange({target:{value:'  Artist  '}});ui.render();ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await ui.settle();assert.equal(new URL(requests.at(-1),'https://www.barcode-network.com').searchParams.get('query'),'Artist');const select=ui.nodes().filter(n=>n.type==='select');select[1].props.onChange({target:{value:'verified'}});await ui.settle();ui.nodes().filter(n=>n.type==='select')[3].props.onChange({target:{value:'crew'}});await ui.settle();const params=new URL(requests.at(-1),'https://www.barcode-network.com').searchParams;assert.equal(params.get('verification'),'verified');assert.equal(params.get('role'),'crew');assert.equal(params.get('limit'),'25');
});
test('directory search limits names and emails to the supported 100 characters',async()=>{
 const requests=[];const ui=harness('OwnerAccountWorkspace',{access:owner},async(path)=>{requests.push(path);return response({accounts:[],nextCursor:null});});await ui.settle();const search=ui.nodes().find(n=>n.type==='input'&&n.props.type==='search');assert.equal(search.props.maxLength,100);const count=requests.length;search.props.onChange({target:{value:'x'.repeat(101)}});ui.render();ui.nodes().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await ui.settle();assert.equal(requests.length,count);assert.match(ui.text(),/100 characters/);
});
test('unconfirmed recovery retries the exact committed request after a lost response or server failure',async()=>{
 for(const failure of ['network','server']) {
  let current=account,logicalRecoveries=0,nonce=0;const requests=[],committed=new Map();
  const ui=harness('OwnerAccountWorkspace',{access:owner},async(path,options)=>{
   if(path==='/api/member/access')return response(owner);if(!path.includes('/action'))return response({accounts:[current],nextCursor:null});
   requests.push(options.body);const body=JSON.parse(options.body);if(committed.has(body.requestId))return response(committed.get(body.requestId));
   logicalRecoveries++;current={...account,revision:3};const result={ok:true,account:current};committed.set(body.requestId,result);if(failure==='network')throw new Error('response lost');return response({code:'SERVICE_UNAVAILABLE'},503);
  },{randomUUID:()=>`operation-${++nonce}`});
  await ui.settle();ui.find('button','View account').props.onClick();await ui.settle();await ui.find('button','Send recovery email').props.onClick();await ui.settle();assert.doesNotMatch(ui.text(),/Recovery email requested through/);assert.ok(ui.find('button','Retry unconfirmed action'),'The committed operation must remain retryable');assert.equal(ui.find('button','Send recovery email').props.disabled,true);await ui.listeners.get('focus')();await ui.settle();const retry=ui.find('button','Retry unconfirmed action');assert.ok(retry,'Successful authority refresh must preserve the unconfirmed logical operation');await retry.props.onClick();await ui.settle();assert.equal(requests.length,2);assert.equal(requests[1],requests[0]);assert.equal(JSON.parse(requests[1]).expectedRevision,2);assert.equal(nonce,1);assert.equal(logicalRecoveries,1);assert.match(ui.text(),/Recovery email requested through/);assert.equal(ui.find('button','Retry unconfirmed action'),undefined);
 }
});
test('role loss clears an unconfirmed operation and prevents late mutation success from restoring private state',async()=>{
 for(const late of [false,true]) {
  let complete,redirect;const ui=harness('OwnerAccountWorkspace',{access:owner},async(path)=>{
   if(path==='/api/member/access')return response({...owner,access:{...owner.access,owner:false}});
   if(path.includes('/action')){if(late)return new Promise(resolve=>{complete=resolve;});throw new Error('lost response');}
   return response({accounts:[account],nextCursor:null});
  },{redirect:path=>{redirect=path;}});
  await ui.settle();ui.find('button','View account').props.onClick();await ui.settle();const action=ui.find('button','Send recovery email').props.onClick();await ui.settle();if(!late)assert.ok(ui.find('button','Retry unconfirmed action'));await ui.listeners.get('focus')();await ui.settle();assert.equal(redirect,'/account');if(late){complete(response({ok:true,account:{...account,revision:3}}));await action;await ui.settle();}assert.equal(ui.find('button','Retry unconfirmed action'),undefined);assert.doesNotMatch(ui.text(),/member@example.test|Recovery email requested through/);
 }
});
test('a pending directory refresh pauses account changes and settles before a confirmed action',async()=>{
 let reads=0,finishRefresh;const actions=[];const ui=harness('OwnerAccountWorkspace',{access:owner},async(path,options)=>{
  if(path.includes('/action')){actions.push(JSON.parse(options.body));return response({ok:true,account:{...account,revision:4}});}
  reads++;if(reads===2)return new Promise(resolve=>{finishRefresh=resolve;});return response({accounts:[account],nextCursor:null});
 });await ui.settle();ui.find('button','View account').props.onClick();await ui.settle();ui.find('button','Refresh directory').props.onClick();await ui.settle();assert.match(ui.text(),/Loading accounts/);assert.equal(ui.find('button','Send recovery email').props.disabled,true);await ui.find('button','Send recovery email').props.onClick();await ui.settle();assert.equal(actions.length,0);finishRefresh(response({accounts:[{...account,revision:3}],nextCursor:null}));await ui.settle();assert.equal(ui.find('button','Send recovery email').props.disabled,false);await ui.find('button','Send recovery email').props.onClick();await ui.settle();assert.equal(actions[0].expectedRevision,3);assert.match(ui.text(),/Recovery email requested through/);assert.doesNotMatch(ui.text(),/Loading accounts/);assert.equal(ui.find('button','Refresh directory').props.disabled,false);assert.equal(ui.find('button','Search').props.disabled,false);
});
