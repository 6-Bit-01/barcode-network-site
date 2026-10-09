import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberHandler } from '../handler.mjs';
const baseURL='https://www.barcode-network.com/api/member/auth',serviceToken='private-test-service-token-1234567890123456789';
const request=(path,body,token=serviceToken)=>new Request(`${baseURL}/${path}`,{method:body===undefined?'GET':'POST',headers:{origin:'https://www.barcode-network.com','content-type':'application/json','x-barcode-service-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('private service credential is mandatory and staff fields/routes cannot reach auth',async()=>{
 let count=0;const handle=createMemberHandler({handler:async()=>{count++;return Response.json({ok:true});}},{baseURL,serviceToken});
 assert.equal((await handle(request('get-session',undefined,'wrong'))).status,403);
 assert.equal((await handle(request('admin/list-users',{}))).status,404);
 assert.equal((await handle(request('sign-up/email',{email:'x@y.test',password:'password',name:'X',role:'owner'}))).status,400);
 assert.equal(count,0);
 assert.equal((await handle(request('get-session'))).status,200);
});
