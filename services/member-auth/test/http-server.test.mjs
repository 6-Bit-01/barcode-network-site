import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemberHttpServer } from '../http-server.mjs';
test('HTTP entry point bounds body size and reconstructs the fixed canonical origin',async(t)=>{
 const seen=[];const server=createMemberHttpServer(async(request)=>{seen.push(request.url);return Response.json({ok:true});},'https://www.barcode-network.com/api/member/auth');
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const local=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(`${local}/api/member/auth/get-session`)).status,200);
 assert.equal(seen[0],'https://www.barcode-network.com/api/member/auth/get-session');
 assert.equal((await fetch(`${local}/api/member/auth/update-user`,{method:'POST',body:'x'.repeat(20_000)})).status,413);
 assert.equal(seen.length,1);
});
test('HTTP song boundaries accept large bounded editable lyrics and reject oversized song bodies while auth retains its smaller bound',async t=>{
 const seen=[];const server=createMemberHttpServer(async(request)=>{seen.push(request.url);await request.text();return Response.json({ok:true});},'https://www.barcode-network.com/api/member/auth');
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));const local=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/api/member/tools/songs','/api/member/worker/songs/receipt'])assert.equal((await fetch(local+path,{method:'POST',body:'x'.repeat(50000)})).status,200);
 assert.equal((await fetch(local+'/api/member/tools/songs',{method:'POST',body:'x'.repeat(262145)})).status,413);
 assert.equal((await fetch(local+'/api/member/worker/songs/claim',{method:'POST',body:'x'.repeat(20000)})).status,413);
 assert.equal((await fetch(local+'/api/member/auth/update-user',{method:'POST',body:'x'.repeat(20000)})).status,413);assert.equal(seen.length,2);
});
