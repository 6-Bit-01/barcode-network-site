import test from 'node:test';
import assert from 'node:assert/strict';
import Module,{createRequire} from 'node:module';
import fs from 'node:fs';
import ts from 'typescript';
const require=createRequire(import.meta.url),original=Module._load;
Module._extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const route=new URL('../src/app/api/games/system-clash/tournaments/route.ts',import.meta.url);
if(!fs.existsSync(route))test('signed-in live tournament API exists',()=>assert.ok(fs.existsSync(route),'Missing live tournament API'));
else {
let denied=false,offline=false,operations=0,authCalls=0,rate=false;const rows=new Map(),evidence=new Map();
const store={async allow(){return !rate;},async read(code){operations++;return rows.get(code)??null;},async list(){operations++;return [...rows.values()];},async cas(code,old,next){operations++;if((rows.get(code)??null)!==old)return false;rows.set(code,next);return true;}};
class MemberError extends Error{constructor(message,status=401,code='SIGN_IN_REQUIRED'){super(message);this.status=status;this.code=code;}}
Module._load=function(id,parent,main){if(id==='@/lib/system-clash-member')return{SystemClashMemberError:MemberError,requireSystemClashMember:async()=>{authCalls++;if(denied)throw new MemberError('Sign in to play online.');if(offline)throw new MemberError('Account unavailable.',503,'ACCOUNT_UNAVAILABLE');return{id:'private-member-host',name:'Host',sessionExpiresAt:'2099-01-01T00:00:00Z'};}};if(id==='@/lib/system-clash-tournament')return require('../src/lib/system-clash-tournament.ts');if(id==='@/lib/system-clash-tournament-store')return{systemClashTournamentStore:()=>store};if(id==='@/lib/system-clash-online')return{...require('../src/lib/system-clash-online.ts'),getOnlineMatchEvidence:async value=>evidence.get(value.code)};if(id==='@/lib/system-clash-online-store')return{onlineRoomStore:()=>store};return original.call(this,id,parent,main);};
const {GET,POST}=require(route.pathname.replace(/^\/([A-Za-z]:)/,'$1'));Module._load=original;
const url='https://www.barcode-network.com/api/games/system-clash/tournaments';
const request=(body,headers={})=>new Request(url,{method:'POST',headers:{origin:'https://www.barcode-network.com','content-type':'application/json',...headers},body:JSON.stringify(body)});
const create={action:'create',title:'Private domain fixture',requestId:'12345678-1234-4123-8123-123456789012',settings:{maxPlayers:16,strikes:2,time:60,rounds:1,preset:'custom'}};
test('anonymous and unavailable account fail closed before any tournament storage',async()=>{const before=operations;denied=true;assert.equal((await GET(new Request(url))).status,401);assert.equal((await POST(request(create))).status,401);denied=false;offline=true;assert.equal((await GET(new Request(url))).status,503);offline=false;assert.equal(operations,before);});
test('foreign origins, MIME, chunked bytes and malformed fields fail before storage',async()=>{const before=operations;assert.equal((await POST(request(create,{origin:'https://evil.example'}))).status,403);assert.equal((await POST(request(create,{'content-type':'text/plain'}))).status,415);assert.equal((await POST(request({...create,requestId:'forged'}))).status,400);assert.equal((await POST(new Request(url,{method:'POST',headers:{origin:'https://www.barcode-network.com','content-type':'application/json'},body:'x'.repeat(17000)}))).status,413);assert.equal((await GET(new Request(url+'?memberId=forged'))).status,400);assert.equal(operations,before);});
test('create retries retain one event and the private audience excludes internal Member IDs',async()=>{rows.clear();const a=await POST(request(create)),event=await a.json();assert.equal(a.status,200);assert.equal(event.role,'host');assert.equal(event.settings.maxPlayers,16);assert.equal(a.headers.get('cache-control'),'private, no-store');assert.equal(a.headers.get('vary'),'Cookie');assert.ok(!JSON.stringify(event).includes('private-member'));const retry=await(await POST(request(create))).json();assert.equal(retry.code,event.code);assert.equal(rows.size,1);const details=await GET(new Request(url+'?code='+event.code));assert.equal(details.status,200);assert.ok(!(await details.text()).includes('private-member'));});
test('rate failure retains authentication and cannot create a second event',async()=>{const before=operations,count=authCalls;rate=true;assert.equal((await POST(request({...create,requestId:'12345678-1234-4123-8123-123456789013'}))).status,429);assert.equal(authCalls,count+1);rate=false;assert.equal(operations,before);});
}


