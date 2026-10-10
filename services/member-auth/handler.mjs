import { createHash, timingSafeEqual } from 'node:crypto';
import { allowedEndpoint, normalizeBody, memberCookies, safeRedirect, AUTH_PATH } from './contract.mjs';
const privateHeaders={'cache-control':'private, no-store','referrer-policy':'no-referrer'};
export function createMemberHandler(auth,{baseURL,serviceToken,access,artists,tools}) {
  if(!serviceToken||serviceToken.length<32)throw new Error('Private service credential required');
  const expected=createHash('sha256').update(serviceToken).digest(), origin=new URL(baseURL).origin;
  return async function handle(request) {
    const supplied=request.headers.get('x-barcode-service-token')||'';
    if(supplied.length>512||!timingSafeEqual(expected,createHash('sha256').update(supplied).digest()))return Response.json({code:'FORBIDDEN'},{status:403,headers:privateHeaders});
    const accessPath=new URL(request.url).pathname;
    if(tools&&['/api/member/tools/songs','/api/member/tools/insights','/api/member/worker/songs/claim','/api/member/worker/songs/receipt'].includes(accessPath)){
      const methods=accessPath==='/api/member/tools/songs'?['GET','POST']:accessPath==='/api/member/tools/insights'?['GET']:['POST'];
      if(!methods.includes(request.method))return Response.json({code:'NOT_FOUND'},{status:404,headers:privateHeaders});
      if(request.headers.has('origin')&&request.headers.get('origin')!==origin||request.method==='POST'&&request.headers.get('origin')!==origin)return Response.json({code:'ORIGIN_DENIED'},{status:403,headers:privateHeaders});
      return tools.handle(request);
    }
    if(artists&&['/api/member/artists','/api/member/owner/artists','/api/member/owner/artists/action'].includes(accessPath)){
      if(request.method!==(accessPath.endsWith('/action')?'POST':'GET'))return Response.json({code:'NOT_FOUND'},{status:404,headers:privateHeaders});
      if(request.method==='POST'&&request.headers.get('origin')!==origin)return Response.json({code:'ORIGIN_DENIED'},{status:403,headers:privateHeaders});
      return artists.handle(request);
    }
    if(access && ['/api/member/access','/api/member/owner/accounts','/api/member/owner/accounts/action'].includes(accessPath)){
      if(request.method!==(accessPath.endsWith('/action')?'POST':'GET'))return Response.json({code:'NOT_FOUND'},{status:404,headers:privateHeaders});
      if(request.method==='POST'&&request.headers.get('origin')!==origin)return Response.json({code:'ORIGIN_DENIED'},{status:403,headers:privateHeaders});
      return access.handle(request);
    }
    const url=new URL(request.url),path=url.pathname.slice(AUTH_PATH.length+1);
    if(!url.pathname.startsWith(`${AUTH_PATH}/`)||!allowedEndpoint(path,request.method))return Response.json({code:'NOT_FOUND'},{status:404,headers:privateHeaders});
    if(request.method==='POST'&&request.headers.get('origin')!==origin)return Response.json({code:'ORIGIN_DENIED'},{status:403,headers:privateHeaders});
    let body;
    try {
      if(request.method==='POST') {
        const text=await request.text();if(Buffer.byteLength(text)>16_384)throw new Error('size');
        body=JSON.stringify(normalizeBody(path,JSON.parse(text),origin));
      }
      for(const key of ['callbackURL','redirectTo'])if(url.searchParams.has(key)&&!safeRedirect(url.searchParams.get(key),origin))throw new Error('link');
    }catch{return Response.json({code:'INVALID_ACCOUNT_REQUEST'},{status:400,headers:privateHeaders});}
    const headers=new Headers({'content-type':'application/json','x-barcode-client-ip':request.headers.get('x-barcode-client-ip')||'0.0.0.0'});
    if(request.headers.has('origin'))headers.set('origin',origin);
    const cookie=memberCookies(request.headers.get('cookie')||'');if(cookie)headers.set('cookie',cookie);
    try {return await auth.handler(new Request(`${baseURL}/${path}${url.search}`,{method:request.method,headers,...(body?{body}:{})}));}
    catch{return Response.json({code:'ACCOUNT_UNAVAILABLE'},{status:503,headers:privateHeaders});}
  };
}
