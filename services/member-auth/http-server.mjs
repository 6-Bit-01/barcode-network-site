import { createServer } from 'node:http';
export function createMemberHttpServer(handle,baseURL) {
 const server=createServer(async(incoming,outgoing)=>{
  try {
    const url=new URL(incoming.url||'/',baseURL);
    if(url.origin!==new URL(baseURL).origin){outgoing.writeHead(400);outgoing.end();return;}
    const songBody=incoming.method==='POST'&&['/api/member/tools/songs','/api/member/worker/songs/receipt'].includes(url.pathname),bodyLimit=songBody?262144:16384;
    const chunks=[];let total=0;
    for await(const chunk of incoming){total+=chunk.length;if(total>bodyLimit){outgoing.writeHead(413,{'cache-control':'private, no-store'});outgoing.end();return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value]of Object.entries(incoming.headers))if(typeof value==='string')headers.set(key,value);
    const request=new Request(url,{method:incoming.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request);
    for(const [key,value]of response.headers)if(key!=='set-cookie')outgoing.setHeader(key,value);
    outgoing.setHeader('cache-control','private, no-store');outgoing.setHeader('referrer-policy','no-referrer');
    const cookies=response.headers.getSetCookie();if(cookies.length)outgoing.setHeader('set-cookie',cookies);
    outgoing.statusCode=response.status;outgoing.end(Buffer.from(await response.arrayBuffer()));
  }catch{outgoing.writeHead(503,{'cache-control':'private, no-store','content-type':'application/json'});outgoing.end('{"code":"ACCOUNT_UNAVAILABLE"}');}
 });
 server.requestTimeout=20_000;server.headersTimeout=10_000;
 return server;
}
