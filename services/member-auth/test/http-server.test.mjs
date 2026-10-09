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
