import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path=new URL('../public/games/system-clash/play/online-tournament-session.mjs',import.meta.url);
async function module(){assert.equal(fs.existsSync(path),true,'The online tournament handoff must validate its saved event before creating rooms');return import(path);}
const event={code:'EVENT1',status:'running',expiresAt:Date.now()+3600000,settings:{rounds:3,time:60,strikes:2},selfEntrantId:'entrant-one',entrants:[{id:'entrant-one',fighter:'cliff',status:'active',ready:true},{id:'entrant-two',fighter:'lyra',status:'active',ready:true}],currentBoutId:'bout-one',currentBout:{id:'bout-one',p1:'entrant-one',p2:'entrant-two',status:'ready',roomCode:null,roomMatchId:null},bouts:[{id:'bout-one',p1:'entrant-one',p2:'entrant-two',status:'ready',roomCode:null,roomMatchId:null}]};
test('tournament launch rejects malformed or foreign assignments before creating a game session',async()=>{
 const {readTournamentLaunch,createTournamentRoomHandoff}=await module();assert.equal(readTournamentLaunch('https://game.test/online.html'),null);
 for(const query of ['event=EVENT1','event=EVENT1&bout=bout-one&role=other','event=EV&bout=bout-one&role=host','event=EVENT1&bout=bout-one&role=host&room=wrong'])assert.throws(()=>readTournamentLaunch('https://game.test/online.html?'+query));
 const intent=readTournamentLaunch('https://game.test/online.html?event=EVENT1&bout=bout-one&role=guest');const handoff=createTournamentRoomHandoff({intent,fetch:async()=>Response.json(event)});await assert.rejects(()=>handoff.refresh(),/assigned|player/i);
});
test('host and guest receive the saved distinct fighters and exact rules without trusting URL fields',async()=>{
 const {readTournamentLaunch,createTournamentRoomHandoff}=await module();const intent=readTournamentLaunch('https://game.test/online.html?event=EVENT1&bout=bout-one&role=host&time=0&rounds=5');const h=createTournamentRoomHandoff({intent,fetch:async()=>Response.json(event)});const current=await h.refresh();assert.equal(current.own.fighter,'cliff');assert.equal(current.other.fighter,'lyra');assert.deepEqual(current.rules,{rounds:3,time:60});
 const invalid=createTournamentRoomHandoff({intent:{...intent,room:'OTHER1'},fetch:async()=>Response.json({...event,currentBout:{...event.currentBout,roomCode:'ROOM01'}})});await assert.rejects(()=>invalid.refresh(),/session|room|changed/i);
});
test('offer bind and advance retries retain their exact request ID and never submit a winner',async()=>{
 const {createTournamentRoomHandoff}=await module();const calls=[];let failed=false,serial=0;const h=createTournamentRoomHandoff({intent:{event:'EVENT1',bout:'bout-one',role:'host',room:null},requestId:()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`,fetch:async(url,options={})=>{const body=options.body&&JSON.parse(options.body);calls.push({url,body,options});if(body?.action==='offer'&&!failed){failed=true;throw new Error('Lost response');}return Response.json(event);}});
 await h.refresh();await assert.rejects(()=>h.offer('ROOM01'));await h.offer('ROOM01');await h.bind('ROOM01',1);await h.advance();const writes=calls.filter(c=>c.body);assert.equal(writes[0].body.requestId,writes[1].body.requestId);assert.deepEqual(writes.map(c=>c.body.action),['offer','offer','bind','advance']);assert.equal(writes.some(c=>'winner' in c.body||'memberId' in c.body),false);assert.equal(writes[2].body.roomMatchId,1);assert.ok(calls.every(c=>c.options.credentials==='same-origin'));
});
