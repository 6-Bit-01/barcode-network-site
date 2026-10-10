import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Module,{createRequire} from 'node:module';
import ts from 'typescript';
import {createMatch,advanceMatch,getFighterView,performAction} from '../public/games/system-clash/play/fight-engine.mjs';
import * as net from '../public/games/system-clash/play/fight-network-state.mjs';
import {createOnlineRelay} from '../public/games/system-clash/play/online-connection.mjs';
const require=createRequire(import.meta.url);
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {createOnlineRooms}=require('../src/lib/system-clash-online.ts');
const roster=['6-bit','9-bit'];
const clipIds=[['idle','walk','crouch','block','punch','kick','high','low','knockdown','jump','delete-present'],['idle','walk','crouch','block','punch','kick','high','low','knockdown','jump','delete-present']];
const options={roster,clipIds,matchId:1};
const input={move:1,crouch:false,block:false};
function match(){return createMatch({mode:'local',stage:'radio-studio',start:false});}
function snapshot(value=match(),seq=1){return net.makeFightSnapshot(value,value.fighters.map((_,i)=>getFighterView(value,i)),{...options,seq,at:100});}
function controller(seat=0,extra={}){let time=0;const sent=[],starts=[],pauses=[],pauseReasons=[],states=[],events=[],actions=[],disconnected=[];const control=net.createOnlineCombatController({...options,...extra,seat,now:()=>time,send:p=>{sent.push(p);return true;},onStart:p=>starts.push(p),onPause:(value,reason)=>{pauses.push(value);pauseReasons.push(reason);},onState:s=>states.push(s),onEvents:e=>events.push(...e),onAction:a=>actions.push(a),onDisconnect:r=>disconnected.push(r)});return {control,sent,starts,pauses,pauseReasons,states,events,actions,disconnected,setTime:v=>{time=v;}};}
const start={type:'start',matchId:1,seed:77};
test('wire snapshots contain public render state without metadata, styles or credentials',()=>{const m=match();m.token='SECRET';m.fighters[0]._clips.image={};m.fighters[0]._style={...m.fighters[0]._style,secret:'PRIVATE'};const s=snapshot(m);assert.ok(s);const text=JSON.stringify(s);for(const secret of ['SECRET','PRIVATE','_clips','_style','image'])assert.ok(!text.includes(secret));assert.equal(s.state.stage.id,'radio-studio');assert.equal(s.state.fighters[0].id,'6-bit');});
test('snapshot parser rejects unknown fighter/clip, invalid health and nonfinite coordinates',()=>{const good=snapshot();assert.ok(net.readFightSnapshot(good,options));for(const change of [s=>s.state.fighters[0].id='unknown',s=>s.views[1].clip='../../image',s=>s.state.fighters[0].hp=-1,s=>s.state.fighters[0].hp=101,s=>s.views[0].x=Infinity,s=>s.state.phase='admin']){const s=structuredClone(good);change(s);assert.equal(net.readFightSnapshot(s,options),null);}});
test('snapshot limits reject oversized state and projectile spam',()=>{const s=snapshot();s.state.projectiles=Array.from({length:9},()=>({x:0,y:0}));assert.equal(net.readFightSnapshot(s,options),null);const large=snapshot();large.views[0].data='x'.repeat(70000);assert.equal(net.readFightSnapshot(large,options),null);});
test('guest consumes only newer current-match snapshots and cannot publish authority',()=>{const h=controller(1);h.control.receive(start);h.control.receive({type:'snapshot',snapshot:snapshot(match(),2)});h.control.receive({type:'snapshot',snapshot:snapshot(match(),1)});const old=snapshot(match(),3);old.matchId=2;h.control.receive({type:'snapshot',snapshot:old});assert.equal(h.states.length,1);assert.equal(h.control.publish(match(),[]),false);assert.equal(h.control.publishEvents([{type:'hit'}]),false);});
test('guest unchanged input is seat mapped with ten heartbeats per second',()=>{const h=controller(1);h.control.receive(start);for(let i=0;i<100;i++){h.setTime(i*10);h.control.input({...input,airborne:true});}assert.equal(h.sent.filter(p=>p.type==='input').length,10);assert.deepEqual(h.sent[0].input,input);h.control.action('punch',{...input,airborne:true});assert.deepEqual(h.sent.at(-1),{type:'action',action:'punch',input,inputSeq:11});assert.equal(h.actions.length,0);});
test('host maps remote actions to fighter one and neutralizes stale remote controls',()=>{const h=controller();h.control.receive(start);h.control.receive({type:'input',input});assert.deepEqual(h.control.remoteInput,input);h.control.receive({type:'action',action:'punch',input});assert.equal(h.actions[0].index,1);h.setTime(1000);h.control.tick();assert.deepEqual(h.control.remoteInput,{move:0,crouch:false,block:false});assert.equal(h.control.paused,true);assert.ok(h.sent.some(p=>p.type==='pause'&&p.paused));});
test('pause application never echoes; only host may request resume with fresh neutral peer',()=>{const host=controller(),guest=controller(1);host.control.receive(start);guest.control.receive(start);host.control.receive({type:'pause',paused:true});assert.equal(host.sent.length,0);assert.equal(host.control.requestPause(false),false);host.control.receive({type:'input',input:{move:0,crouch:false,block:false}});assert.equal(host.control.requestPause(false),true);guest.control.receive({type:'pause',paused:true});assert.equal(guest.control.requestPause(false),false);assert.equal(guest.sent.length,0);});
test('host FX batches are replayed once and old rematch events are discarded',()=>{const guest=controller(1);guest.control.receive(start);const packet={type:'events',matchId:1,seq:1,events:[{type:'hit',x:100,y:200,attacker:0,target:1}]};guest.control.receive(packet);guest.control.receive(packet);guest.control.receive({...packet,seq:2,matchId:2});assert.equal(guest.events.length,1);});
test('travel interpolation leaves changed contact clips, phases and Deletions discrete',()=>{const h=controller(1);h.control.receive(start);const first=snapshot(match(),1);first.state.phase='fight';first.views[0].poseIndex=0;first.views[0].x=500;h.control.receive({type:'snapshot',snapshot:first});h.setTime(40);const second=structuredClone(first);second.seq=2;second.views[0].x=600;h.control.receive({type:'snapshot',snapshot:second});h.setTime(60);assert.equal(h.control.views()[0].x,550);const contact=structuredClone(second);contact.seq=3;contact.views[0].clip='punch';contact.views[0].poseIndex=2;contact.views[0].x=700;h.control.receive({type:'snapshot',snapshot:contact});assert.equal(h.control.views()[0].x,700);const deletion=structuredClone(contact);deletion.seq=4;deletion.state.phase='deletion';deletion.state.winner=0;deletion.state._deletionOrigin={direction:1,target:700,victimFacing:'left',near:500,winner:500,victim:700};deletion.views[0].x=800;h.control.receive({type:'snapshot',snapshot:deletion});assert.equal(h.control.views()[0].x,800);});
test('a guest with stale snapshots pauses and cannot reset or rematch before result',()=>{const h=controller(1);h.control.receive(start);h.control.receive({type:'snapshot',snapshot:snapshot()});assert.equal(h.control.requestRematch('fight'),false);h.setTime(1200);h.control.tick();assert.equal(h.control.paused,true);assert.equal(h.control.requestRematch('over'),true);assert.equal(h.sent.at(-1).type,'rematch');assert.equal(h.starts.length,1);});
test('disconnect neutralizes controls and stops every subsequent authority action',()=>{const h=controller();h.control.receive(start);h.control.receive({type:'input',input});h.control.disconnect('Gone');h.control.disconnect('Again');assert.equal(h.disconnected.length,1);assert.deepEqual(h.control.remoteInput,{move:0,crouch:false,block:false});assert.equal(h.control.action('punch',input),false);assert.equal(h.control.publish(match(),[]),false);});
function sourceFunction(name,args){const source=readFileSync(new URL('../public/games/system-clash/play/fight.js',import.meta.url),'utf8');const body=source.match(new RegExp('function '+name+'\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}'))?.[1];assert.ok(body);return new Function('env','with(env){return function('+args+'){'+body+'}}');}
test('guest tick renders but never advances combat, including after browser focus',()=>{let advances=0,draws=0;const env={pollGamepads(){},last:0,ready:true,screenSuspended:false,paused:false,inspectTime:null,motionTime:null,accumulator:0,attackInputs:{},attackCommands(){},flushAttackInputs:()=>[],performance:{now:()=>100},windowActive:true,document:{hidden:false},onlineCombat:{seat:1,started:true,input(){},tick(){},views:()=>[],publish(){}},controls:()=>[input,{move:0,crouch:false,block:false}],match:{phase:'fight',fighters:[{},{}]},getFighterView:()=>({}),advanceMatch:()=>advances++,dispatchEvents(){},effects:{update(){}},draw:()=>draws++,requestAnimationFrame(){},tick(){},previousTravelViews:null,previousTravelPhase:null};sourceFunction('tick','now')(env)(100);assert.equal(advances,0);assert.equal(draws,1);});
test('tournament result blocking routes controller confirm away from ordinary restart',()=>{let starts=0,tournament=0;const env={ready:true,effects:{startAudio(){}},reset(){starts++;},canvas:{focus(){}},onlineCombat:null,tournamentOverlay:{active:true,blocking:true,handleAction:action=>{assert.equal(action,'confirm');tournament++;return true;}}};sourceFunction('start','')(env)();assert.equal(starts,0);assert.equal(tournament,1);});



test('damage, attachments and host events preserve unsigned render seeds',()=>{const m=match();const mark={id:'damage-1',site:'torso',kind:'bruise',intensity:.5,amount:10,at:0,facing:'right',direction:1,heightRatio:.57,weaponType:null,seed:2654435761};m.fighters[0].damageMarks.push(mark);m.fighters[0].embeddedWeapons.push({id:'weapon-1',type:'neural-spike',site:'torso',facing:'right',direction:1,at:0,heightRatio:.57,seed:4294967295});assert.ok(snapshot(m));const host=controller();host.control.receive(start);assert.equal(host.control.publishEvents([{type:'hit',seed:4294967295}]),true);});
test('malformed projectiles, pickups and wear arrays fail closed before rendering',()=>{for(const change of [s=>s.state.projectiles=[{x:10,y:20}],s=>s.state.stagePickups=[{type:'admin',x:100,y:620}],s=>s.state.fighters[0].damageMarks=[{}],s=>s.views[0].embeddedWeapons=[{}],s=>s.state.fighters[0].damageSites.head.amount=-1]){const s=snapshot();change(s);assert.equal(net.readFightSnapshot(s,options),null);}});
test('unordered state cannot undo a newer reliable pause or replay a pre-resume pause',()=>{const guest=controller(1);guest.control.receive(start);guest.control.requestPause(true);const before=snapshot(match(),2);assert.equal(guest.control.receive({type:'snapshot',snapshot:before}),true);assert.equal(guest.control.paused,true);assert.equal(guest.states.at(-1).state.paused,true);guest.control.receive({type:'pause',paused:false,snapshotSeq:3});const stale=snapshot(match(),3);stale.state.paused=true;assert.equal(guest.control.receive({type:'snapshot',snapshot:stale}),false);assert.equal(guest.control.paused,false);});
test('host authority rejects an incoming resume but permits its own released-control resume',()=>{const host=controller();host.control.receive(start);host.control.receive({type:'pause',paused:true});assert.equal(host.control.receive({type:'pause',paused:false}),false);assert.equal(host.control.paused,true);host.control.receive({type:'input',input:{move:0,crouch:false,block:false}});assert.equal(host.control.requestPause(false),true);assert.equal(host.sent.at(-1).snapshotSeq,0);});
test('host snapshots are bounded to twenty-five publishes per second',()=>{const host=controller();host.control.receive(start);const m=match(),views=m.fighters.map((_,i)=>getFighterView(m,i));for(let i=0;i<1000;i++){host.setTime(i);host.control.publish(m,views);}assert.equal(host.sent.filter(p=>p.type==='snapshot').length,25);assert.ok(host.sent.every(p=>Buffer.byteLength(JSON.stringify(p))<=65536));});
test('a guest awaiting assets or handshake never enters autonomous combat',()=>{let advances=0;const env={pollGamepads(){},last:0,ready:true,screenSuspended:false,paused:false,motionTime:null,inspectTime:null,accumulator:0,onlineCombat:null,onlineBridge:{enabled:true},draw(){},requestAnimationFrame(){},tick(){},advanceMatch:()=>advances++};sourceFunction('tick','now')(env)(50);assert.equal(advances,0);});
test('online controls ignore P2 keyboard and hardware while preserving the own P1 controller',()=>{const env={held:new Set(['ArrowRight','ArrowDown','Digit0']),virtual:new Set(),latched:new Set(),tapMove:0,tapUntil:0,performance:{now:()=>0},onlineBridge:{enabled:true},match:{mode:'local'},gamepadPlayers:[{move:-1,crouch:true,block:true},{move:1,crouch:true,block:true}]};assert.deepEqual(sourceFunction('controls','')(env)(),[{move:-1,crouch:true,block:true},{move:0,crouch:false,block:false}]);});

test('host resolves remote contact and guest state receives that damage without a local simulation',()=>{const authoritative=match();authoritative.phase='fight';authoritative.fighters[0].x=1000;authoritative.fighters[1].x=1105;const guest=controller(1);guest.control.receive(start);const host=net.createOnlineCombatController({...options,seat:0,now:()=>0,onAction:c=>performAction(authoritative,c.index,c.action,c.input)});host.receive(start);host.receive({type:'action',action:'punch',input:{move:0,crouch:false,block:false}});for(let i=0;i<40;i++)advanceMatch(authoritative,1000/60,[{move:0,crouch:false,block:false},{move:0,crouch:false,block:false}]);assert.ok(authoritative.fighters[0].hp<100);assert.equal(authoritative.fighters[1].hp,authoritative.fighters[1].maxHp);const wire=snapshot(authoritative);assert.ok(wire);guest.control.receive({type:'snapshot',snapshot:wire});const local=match(),beforeClips=local.fighters[1]._clips;const rendered=net.applyFightSnapshot(local,guest.states[0]);assert.equal(rendered.fighters[0].hp,authoritative.fighters[0].hp);assert.equal(rendered.fighters[1]._clips,beforeClips);assert.deepEqual(rendered.events,[]);});
test('connected-room wall damage and cinematic origin survive public snapshots',()=>{const m=match();m.stage.wallRooms['sheila-office']={left:{damage:80,broken:true},right:{damage:20,broken:false}};m.stage.cinematicOrigin=640;m.stage.transitionSerial=1;m.stage.walls.right={damage:80,broken:true};const wire=snapshot(m);assert.ok(wire);assert.equal(wire.state.stage.wallRooms['sheila-office'].left.broken,true);assert.equal(wire.state.stage.cinematicOrigin,640);});

function pad(index=0,buttons=[]){return {index,id:'DualSense-'+index,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))};}
test('online gamepad routes only the own controller and ignores the remote hardware disconnect',async()=>{const {createGamepadInput}=await import('../public/games/system-clash/play/fight-gamepad.mjs');const calls=[],env={ready:true,paused:false,inspectTime:null,motionTime:null,windowActive:true,screenSuspended:false,matchOptions:{open:false},roundMenu:{open:false},onlineBridge:{enabled:true},tournamentOverlay:null,match:{mode:'local',phase:'fight'},gamepads:createGamepadInput(),gamepadPlayers:[],controllerLabel:'',attackInputs:{pending:new Map()},attackButtons:new Set(),document:{hidden:false,body:{classList:{contains:()=>false}}},navigator:{getGamepads:()=>env.pads},$:()=>({textContent:''}),controls:()=>[{move:0,crouch:false,block:false},{move:0,crouch:false,block:false}],action:(index,name)=>calls.push({index,name}),releaseAttackInput(){},clearInput:()=>calls.push({name:'clear'}),togglePause:()=>calls.push({name:'pause'}),pads:[]};const poll=sourceFunction('pollGamepads','now')(env);env.pads=[pad(),pad(1)];poll(0);env.pads=[pad(),pad(1,[5])];poll(10);env.pads=[pad(),null];poll(20);assert.deepEqual(calls,[]);env.pads=[pad(0,[5]),null];poll(30);poll(90);assert.deepEqual(calls,[{index:0,name:'grab'}]);});
test('blocking Tournament gamepad uses overlay navigation and confirm without underlying combat',async()=>{const {createGamepadInput}=await import('../public/games/system-clash/play/fight-gamepad.mjs');const handled=[],env={ready:true,paused:false,inspectTime:null,motionTime:null,windowActive:true,screenSuspended:false,matchOptions:{open:false},roundMenu:{open:false},onlineBridge:{enabled:false},tournamentOverlay:{blocking:true,handleAction:a=>handled.push(a)},match:{mode:'cpu',phase:'over'},gamepads:createGamepadInput(),gamepadPlayers:[],controllerLabel:'',attackInputs:{pending:new Map()},document:{hidden:false,body:{classList:{contains:()=>false}}},navigator:{getGamepads:()=>env.pads},$:()=>({textContent:''}),releaseAttackInput(){},pads:[]};const poll=sourceFunction('pollGamepads','now')(env);env.pads=[pad()];poll(0);env.pads=[pad(0,[15])];poll(10);env.pads=[pad()];poll(20);env.pads=[pad(0,[0])];poll(30);assert.deepEqual(handled,['ArrowRight','confirm']);});

test('Lost Marbles snapshots preserve selected seats, hidden local data and eight-key walk timing',()=>{
 for(const seat of [0,1]){
  const fighters=[{id:'6-bit'},{id:'6-bit'}];fighters[seat]={id:'lost-marbles'};
  const authoritative=createMatch({mode:'local',stage:'radio-studio',start:false,fighters});
  const schema={roster:['6-bit','lost-marbles'],fighterIds:fighters.map(f=>f.id),clipIds,matchId:1};
  const views=authoritative.fighters.map((_,index)=>getFighterView(authoritative,index));
  views[seat]={...views[seat],clip:'walk',elapsed:550,poseIndex:7};
  const wire=net.makeFightSnapshot(authoritative,views,{...schema,seq:1,at:100});assert.ok(wire);
  const received=[],guest=net.createOnlineCombatController({...schema,seat:1,onState:value=>received.push(value)});
  guest.receive(start);assert.equal(guest.receive({type:'snapshot',snapshot:wire}),true);
  assert.equal(guest.views()[seat].elapsed,550);assert.equal(guest.views()[seat].poseIndex,7);
  const local=createMatch({mode:'local',start:false,fighters});
  const rendered=net.applyFightSnapshot(local,received[0]);
  assert.equal(rendered.fighters[seat].id,'lost-marbles');assert.equal(rendered.fighters[seat].maxHp,authoritative.fighters[seat].maxHp);
  for(const key of ['_clips','_style','_statProfile','_statScalars'])assert.equal(rendered.fighters[seat][key],local.fighters[seat][key]);
  const swapped=structuredClone(wire);swapped.state.fighters[seat].id='6-bit';swapped.views[seat].id='6-bit';assert.equal(net.readFightSnapshot(swapped,schema),null);
  guest.destroy();
 }
});
test('Mutilator snapshots preserve selected seats, hidden local data and native walk timing',()=>{
 for(const seat of [0,1]){
  const fighters=[{id:'6-bit'},{id:'6-bit'}];fighters[seat]={id:'mutilator'};
  const authoritative=createMatch({mode:'local',stage:'radio-studio',start:false,fighters});
  const schema={roster:['6-bit','mutilator'],fighterIds:fighters.map(f=>f.id),clipIds,matchId:1};
  const views=authoritative.fighters.map((_,index)=>getFighterView(authoritative,index));
  views[seat]={...views[seat],clip:'walk',elapsed:450,poseIndex:3};
  const wire=net.makeFightSnapshot(authoritative,views,{...schema,seq:1,at:100});assert.ok(wire);
  const received=[],guest=net.createOnlineCombatController({...schema,seat:1,onState:value=>received.push(value)});
  guest.receive(start);assert.equal(guest.receive({type:'snapshot',snapshot:wire}),true);
  assert.equal(guest.views()[seat].elapsed,450);assert.equal(guest.views()[seat].poseIndex,3);
  const local=createMatch({mode:'local',start:false,fighters});
  const rendered=net.applyFightSnapshot(local,received[0]);
  assert.equal(rendered.fighters[seat].id,'mutilator');assert.equal(rendered.fighters[seat].maxHp,authoritative.fighters[seat].maxHp);
  for(const key of ['_clips','_style','_statProfile','_statScalars'])assert.equal(rendered.fighters[seat][key],local.fighters[seat][key]);
  const swapped=structuredClone(wire);swapped.state.fighters[seat].id='6-bit';swapped.views[seat].id='6-bit';assert.equal(net.readFightSnapshot(swapped,schema),null);
  guest.destroy();
 }
});test('station portal snapshots snap at the exit instead of interpolating across the arena',()=>{
 const h=controller(1);h.control.receive(start);const first=snapshot(match(),1);first.state.phase='fight';first.state.stage.id='interdimensional-station';first.state.stage.portalSerial=0;first.views[0].poseIndex=0;first.views[0].x=150;
 h.control.receive({type:'snapshot',snapshot:first});h.setTime(40);
 const second=structuredClone(first);second.seq=2;second.state.stage.portalSerial=1;second.state.stage.lastPortalTransit={serial:1,at:40,transits:[{target:0,from:'left',to:'right',fromX:150,toX:1650,exitX:1650,y:620}]};second.views[0].x=1650;
 h.control.receive({type:'snapshot',snapshot:second});h.setTime(60);assert.equal(h.control.views()[0].x,1650);
 const third=structuredClone(second);third.seq=3;third.views[0].x=1610;h.setTime(80);h.control.receive({type:'snapshot',snapshot:third});h.setTime(100);assert.equal(h.control.views()[0].x,1630);
});
test('guest waits for its first authoritative snapshot then enforces the ordinary stale-state limit',()=>{
 const h=controller(1);h.control.receive(start);h.setTime(1200);h.control.tick();assert.equal(h.control.paused,false);
 h.control.receive({type:'snapshot',snapshot:snapshot()});h.setTime(2199);h.control.tick();assert.equal(h.control.paused,false);h.setTime(2200);h.control.tick();assert.equal(h.control.paused,true);
 const missing=controller(1);missing.control.receive(start);missing.setTime(5000);missing.control.tick();assert.equal(missing.control.paused,true);
});

test('freshness starts after slow synchronous frame initialization and keeps the exact one-second rule',()=>{
 for(const seat of [0,1]){
  let time=0;const pauses=[];const control=net.createOnlineCombatController({...options,seat,now:()=>time,send:()=>true,onStart:()=>{time=1200;},onPause:value=>pauses.push(value)});
  control.receive(start);control.tick();assert.equal(control.paused,false);
  if(seat===1)control.receive({type:'snapshot',snapshot:snapshot()});
  time=2199;control.tick();assert.equal(control.paused,false);time=2200;control.tick();assert.equal(control.paused,true);assert.deepEqual(pauses,[true]);
 }
});
test('guest frame acknowledges and releases controls only after reset and focus finish',()=>{
 const order=[];let time=0;const env={reset:(active,seed)=>{assert.equal(active,true);assert.equal(seed,77);time=1200;order.push('reset');},effects:{startAudio:()=>order.push('audio')},canvas:{focus:()=>order.push('focus')},onlineBridge:{seat:1,send:packet=>{assert.equal(time,1200);assert.deepEqual(packet,{type:'started',matchId:1});order.push('started');}},onlineCombat:{input:value=>{assert.deepEqual(value,{move:0,crouch:false,block:false});order.push('neutral');}}};
 sourceFunction('startOnlineFight','packet')(env)(start);assert.deepEqual(order,['reset','audio','focus','started','neutral']);
 order.length=0;env.onlineBridge.seat=0;sourceFunction('startOnlineFight','packet')(env)(start);assert.deepEqual(order,['reset','audio','focus']);
});

test('a one-second network stall freezes the host then fresh neutral peer input recovers it',()=>{
 const h=controller();h.control.receive(start);h.control.receive({type:'input',input,inputSeq:1});h.setTime(1000);h.control.tick();
 assert.equal(h.control.paused,true);assert.equal(h.control.pauseReason,'network');assert.deepEqual(h.control.remoteInput,{move:0,crouch:false,block:false});
 assert.equal(h.sent.at(-1).reason,'network');h.setTime(1100);h.control.receive({type:'input',input,inputSeq:2});assert.equal(h.control.paused,true);
 h.control.receive({type:'action',action:'punch',input:{move:0,crouch:false,block:false},inputSeq:3});assert.equal(h.actions.length,0);assert.equal(h.control.paused,true);
 h.setTime(1200);h.control.receive({type:'input',input:{move:0,crouch:false,block:false},inputSeq:4});assert.equal(h.control.paused,false);
 assert.equal(h.control.pauseReason,null);assert.deepEqual(h.pauseReasons,['network','network']);assert.equal(h.sent.at(-1).paused,false);assert.equal(h.sent.at(-1).reason,'network');assert.equal(h.actions.length,0);
});
test('manual pause takes precedence over a network stall and never automatically resumes',()=>{
 const h=controller();h.control.receive(start);h.control.requestPause(true,'network');h.control.receive({type:'pause',paused:true,reason:'manual'});
 h.control.receive({type:'pause',paused:true,reason:'network'});h.control.receive({type:'input',input:{move:0,crouch:false,block:false},inputSeq:1});h.control.tick();
 assert.equal(h.control.paused,true);assert.equal(h.control.pauseReason,'manual');assert.equal(h.sent.filter(p=>p.type==='pause'&&!p.paused).length,0);
 assert.equal(h.control.requestPause(false),true);assert.equal(h.control.paused,false);
});
test('a newer guest manual pause rejects an in-flight automatic resume without advancing the state barrier',()=>{
 const g=controller(1);g.control.receive(start);g.control.receive({type:'pause',paused:true,reason:'network'});g.setTime(100);g.control.requestPause(true,'manual');
 assert.equal(g.control.receive({type:'pause',paused:false,reason:'network',snapshotSeq:10}),false);assert.equal(g.control.paused,true);assert.equal(g.control.pauseReason,'manual');
 const state=snapshot(match(),1);assert.equal(g.control.receive({type:'snapshot',snapshot:state}),true);assert.equal(g.states.at(-1).state.paused,true);assert.equal(g.states.at(-1).state.pauseReason,'manual');
 assert.equal(g.control.receive({type:'pause',paused:false,reason:'manual',snapshotSeq:1}),true);assert.equal(g.control.paused,false);
 g.control.requestPause(true,'network');assert.equal(g.control.receive({type:'pause',paused:false,reason:'network',snapshotSeq:1}),true);assert.equal(g.control.paused,false);
});
test('automatic host resume requests cannot clear a manual pause with fresh neutral controls',()=>{
 const h=controller();h.control.receive(start);h.control.requestPause(true,'manual');h.control.receive({type:'input',input:{move:0,crouch:false,block:false},inputSeq:1});
 const sent=h.sent.length;assert.equal(h.control.requestPause(false,'network'),false);assert.equal(h.control.paused,true);assert.equal(h.control.pauseReason,'manual');assert.equal(h.sent.length,sent);
 assert.equal(h.control.requestPause(false,'manual'),true);assert.equal(h.control.paused,false);
});
test('authoritative resume waits for its next state without replaying an old pause or immediately stalling',()=>{
 const g=controller(1);g.control.receive(start);g.control.receive({type:'snapshot',snapshot:snapshot(match(),1)});g.setTime(1000);g.control.tick();assert.equal(g.control.paused,true);
 g.setTime(2000);g.control.receive({type:'pause',paused:false,reason:'network',snapshotSeq:2});g.control.tick();assert.equal(g.control.paused,false);
 const stale=snapshot(match(),2);stale.state.paused=true;assert.equal(g.control.receive({type:'snapshot',snapshot:stale}),false);
 g.setTime(3000);g.control.tick();assert.equal(g.control.paused,false);g.control.receive({type:'snapshot',snapshot:snapshot(match(),3)});
 g.setTime(3999);g.control.tick();assert.equal(g.control.paused,false);g.setTime(4000);g.control.tick();assert.equal(g.control.paused,true);
 const missing=controller(1);missing.control.receive(start);missing.control.receive({type:'pause',paused:true,reason:'network'});missing.setTime(2000);missing.control.receive({type:'pause',paused:false,reason:'network',snapshotSeq:0});missing.setTime(6999);missing.control.tick();assert.equal(missing.control.paused,false);missing.setTime(7000);missing.control.tick();assert.equal(missing.control.paused,true);
});
test('new movement sends immediately and input plus actions share a monotonic sequence',()=>{
 const g=controller(1);g.control.receive(start);assert.equal(g.control.input(input),true);g.setTime(20);assert.equal(g.control.input({move:0,crouch:false,block:false}),true);
 g.setTime(30);assert.equal(g.control.action('punch',{move:0,crouch:false,block:false}),true);g.setTime(119);assert.equal(g.control.input({move:0,crouch:false,block:false}),false);g.setTime(120);assert.equal(g.control.input({move:0,crouch:false,block:false}),true);
 assert.deepEqual(g.sent.map(p=>[p.type,p.inputSeq]),[['input',1],['input',2],['action',3],['input',4]]);
});
test('real neutral input immediately replaces movement carried by a just-sent action',()=>{
 const g=controller(1);g.control.receive(start);g.control.input({move:0,crouch:false,block:false});g.setTime(20);g.control.action('punch',input);g.setTime(30);
 assert.equal(g.control.input({move:0,crouch:false,block:false}),true);assert.deepEqual(g.sent.at(-1),{type:'input',input:{move:0,crouch:false,block:false},inputSeq:3});
 const h=controller();h.control.receive(start);for(const packet of g.sent)h.control.receive(packet);assert.deepEqual(h.control.remoteInput,{move:0,crouch:false,block:false});assert.equal(h.actions.length,1);
});
test('an older reliable action uses its command input without rewinding newer held controls or freshness',()=>{
 const h=controller();h.control.receive(start);h.control.receive({type:'input',input:{move:0,crouch:false,block:false},inputSeq:10});h.setTime(500);
 h.control.receive({type:'action',action:'punch',input,inputSeq:9});assert.equal(h.actions.length,1);assert.deepEqual(h.actions[0].input,input);assert.deepEqual(h.control.remoteInput,{move:0,crouch:false,block:false});
 assert.equal(h.control.receive({type:'input',input,inputSeq:8}),false);assert.equal(h.control.receive({type:'input',input}),false);h.setTime(1000);h.control.tick();assert.equal(h.control.paused,true);
});
const visualTimings=[0,1].map(()=>({idle:{duration:400,loop:true,frames:[{index:0,start:0,end:200},{index:1,start:200,end:400}]},punch:{duration:500,loop:false,frames:[{index:0,start:0,end:250},{index:1,start:250,end:500}]}}));
test('slow snapshots keep travel smooth across pose changes and advance only local visual timing',()=>{
 const g=controller(1,{clipTimings:visualTimings});g.control.receive(start);const first=snapshot(match(),1);first.state.phase='fight';first.views[0].x=500;first.views[0].elapsed=0;first.views[0].poseIndex=0;g.control.receive({type:'snapshot',snapshot:first});
 g.setTime(750);const next=structuredClone(first);next.seq=2;next.at=850;next.views[0].x=800;next.views[0].elapsed=100;next.views[0].poseIndex=1;g.control.receive({type:'snapshot',snapshot:next});
 g.setTime(1125);const view=g.control.views()[0];assert.equal(view.x,650);assert.equal(view.elapsed,75);assert.equal(view.poseIndex,undefined);assert.equal(view.frameIndex,undefined);
 g.setTime(1375);assert.equal(g.control.views()[0].x,750);assert.equal(g.states.at(-1).views[0].elapsed,100);assert.equal(g.states.at(-1).state.fighters[0].hp,100);assert.equal(g.states.at(-1).state.combatTime,0);
});
test('non-loop visual actions stop on their final pose while paused and fixed contact poses stay frozen',()=>{
 const g=controller(1,{clipTimings:visualTimings});g.control.receive(start);const state=snapshot(match(),1);state.state.phase='fight';state.views[0].clip='punch';state.views[0].elapsed=400;g.control.receive({type:'snapshot',snapshot:state});g.setTime(300);assert.equal(g.control.views()[0].elapsed,499.999);
 g.control.receive({type:'pause',paused:true,reason:'manual'});const frozen=g.control.views()[0].elapsed;g.setTime(600);assert.equal(g.control.views()[0].elapsed,frozen);
 const contact=controller(1,{clipTimings:visualTimings});contact.control.receive(start);state.views[0].frameIndex=1;contact.control.receive({type:'snapshot',snapshot:state});contact.setTime(300);assert.equal(contact.control.views()[0].elapsed,400);assert.equal(contact.control.views()[0].frameIndex,1);
 const deletion=controller(1,{clipTimings:visualTimings});deletion.control.receive(start);const cinematic=snapshot(match(),1);cinematic.state.phase='finish';cinematic.views[0].elapsed=100;deletion.control.receive({type:'snapshot',snapshot:cinematic});deletion.setTime(300);assert.equal(deletion.control.views()[0].elapsed,100);
});
class CombatTimers{
 now=0;id=0;jobs=new Map();setTimeout=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{fn,at:this.now+ms});return id;};clearTimeout=id=>this.jobs.delete(id);
 setInterval=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{fn,at:this.now+ms,ms});return id;};clearInterval=id=>this.jobs.delete(id);
 async advance(ms){for(let elapsed=0;elapsed<ms;elapsed+=10){this.now+=10;for(const [id,j]of [...this.jobs])if(j.at<=this.now){if(j.ms)j.at=this.now+j.ms;else this.jobs.delete(id);j.fn();}for(let i=0;i<24;i++)await Promise.resolve();}}
}
for(const [label,profile]of [['800ms',()=>800],['jitter',(at,seat)=>seat===1&&at%4000<300?1600:800]])test(`actual cloud ${label} controls recover transient stalls without changing manual pause authority`,async t=>{
 const timers=new CombatTimers(),rows=new Map(),store={async read(id){return rows.get(id)??null;},async cas(id,old,next){if((rows.get(id)??null)!==old)return false;if(next===null)rows.delete(id);else rows.set(id,next);return true;},async list(){return [...rows.values()];}};
 const rooms=createOnlineRooms({store,now:()=>timers.now}),hostSeat=await rooms.create('Host'),guestSeat=await rooms.join(hostSeat.code,'Guest');await rooms.select(hostSeat.code,hostSeat.token,{fighter:'6-bit',ready:true});await rooms.select(guestSeat.code,guestSeat.token,{fighter:'9-bit',ready:true});
 const pauses=[[],[]],ended=[[],[]],errors=[];let impaired=false,combats=[];
 const clients=[hostSeat,guestSeat].map((seat,index)=>createOnlineRelay({role:seat.role,room:seat.code,timers,now:()=>timers.now,onPacket:p=>index===0&&p.type==='started'?combats[0]?.receive(start):combats[index]?.receive(p),onDisconnect:r=>ended[index].push(r),relayRequest:async value=>{
  const delay=impaired?profile(timers.now,index):50,wait=ms=>new Promise(resolve=>timers.setTimeout(resolve,ms));try{await wait(delay/2);const result=await rooms.relay(seat.code,seat.token,value);await wait(delay/2);return result;}catch(error){errors.push(error.message);throw error;}
 }}));
 try{
  clients.forEach(c=>c.start());await timers.advance(1500);assert.ok(clients.every(c=>c.connected));impaired=true;
  combats=[0,1].map(seat=>net.createOnlineCombatController({...options,seat,now:()=>timers.now,send:p=>clients[seat].send(p),onStart:seat===1?()=>{clients[1].send({type:'started',matchId:1});combats[1].input({move:0,crouch:false,block:false});}:undefined,onPause:(value,reason)=>pauses[seat].push({value,reason,at:timers.now})}));combats[1].receive(start);
  const current=match(),views=current.fighters.map((_,i)=>getFighterView(current,i));current.phase='fight';
  for(let elapsed=0;elapsed<16000;elapsed+=20){combats[1].input({move:elapsed%4000<1000?1:0,crouch:false,block:false});if(elapsed%1000===0)combats[1].action('punch',input);combats.forEach(c=>c.tick());combats[0].publish(current,views);await timers.advance(20);}
  impaired=false;for(let elapsed=0;elapsed<5000;elapsed+=20){combats[1].input({move:0,crouch:false,block:false});combats.forEach(c=>c.tick());combats[0].publish(current,views);await timers.advance(20);}
  assert.deepEqual(ended,[[],[]]);assert.deepEqual(errors,[]);assert.ok(combats.every(c=>!c.paused));assert.deepEqual(combats[0].remoteInput,{move:0,crouch:false,block:false});
  const summary=pauses.map(values=>{let stalledAt=null;const recovered=[];for(const pause of values){assert.equal(pause.reason,'network');if(pause.value)stalledAt=pause.at;else if(stalledAt!==null){recovered.push(pause.at-stalledAt);stalledAt=null;}}assert.equal(stalledAt,null);assert.ok(recovered.every(ms=>ms<=4000));return {stalls:values.filter(p=>p.value).length,maxRecoveryMs:Math.max(0,...recovered)};});
  t.diagnostic(JSON.stringify({profile:label,seats:summary,disconnects:ended.map(v=>v.length),errors:errors.length}));if(label==='jitter')assert.ok(summary[0].stalls>0);else assert.ok(summary.every(seat=>seat.stalls===0));
  combats[0].requestPause(true,'manual');for(let elapsed=0;elapsed<2000;elapsed+=20){combats[1].input({move:0,crouch:false,block:false});combats.forEach(c=>c.tick());combats[0].publish(current,views);await timers.advance(20);}assert.ok(combats.every(c=>c.paused&&c.pauseReason==='manual'));assert.equal(combats[0].requestPause(false),true);
 }finally{clients.forEach(c=>c.close());await rooms.leave(guestSeat.code,guestSeat.token);await rooms.leave(hostSeat.code,hostSeat.token);}
});
