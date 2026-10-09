import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMemberAuth } from '../auth.mjs';

const origin = 'https://www.barcode-network.com';
const baseURL = `${origin}/api/member/auth`;
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'barcode-member-test-'));
  const delivered = []; const errors=[];
  const app = createMemberAuth({databasePath:join(directory,'member.sqlite'),baseURL,secret:'test-only-member-secret-not-production-123456789',sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',onError:(...data)=>errors.push(data),transport:async (mail)=>{ delivered.push(mail); return {id:`mail-${delivered.length}`}; }});
  await app.migrate();
  t.after(async()=>{await app.close();assert.deepEqual(errors.filter(([message])=>!message.startsWith("Database schema mismatch") && !message.startsWith("Invalid origin:")),[]);});
  const request = async (path, body, cookie='') => app.auth.handler(new Request(`${baseURL}${path}`, {method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json','x-barcode-client-ip':'192.0.2.10',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  return {...app,request,delivered};
}
const cookies = (response) => response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
const emailLink = (mail) => mail.text.match(/https:\/\/[^\s]+/)[0];
const register = (app,email='member@example.com',name='Same Name') => app.request('/sign-up/email',{email,password:'Private-password-43!',name,callbackURL:`${origin}/account`});
async function activate(app,email) {
  await register(app,email);
  await app.outbox.flushOne();
  const response = await app.auth.handler(new Request(emailLink(app.delivered.at(-1))));
  assert.equal(response.status,302);
  return cookies(response);
}

test('verification activates Member; raw password and mail tokens stay out of durable mail payloads',async(t)=>{
  const app=await fixture(t);
  const signup=await register(app);
  assert.equal(signup.status,200);
  assert.equal(cookies(signup),'');
  const blocked=await app.request('/sign-in/email',{email:'member@example.com',password:'Private-password-43!'});
  assert.equal(blocked.status,403);
  await app.outbox.flushOne();
  const stored=JSON.stringify(app.database.prepare('SELECT * FROM member_mail_outbox').all());
  assert.ok(!stored.includes('member@example.com'));
  assert.ok(!stored.includes(emailLink(app.delivered[0])));
  const verified=await app.auth.handler(new Request(emailLink(app.delivered[0])));
  const session=await app.request('/get-session',undefined,cookies(verified));
  const payload=await session.json();
  assert.equal(payload.user.emailVerified,true);
  assert.equal(payload.user.name,'Same Name');
  assert.match(verified.headers.get('set-cookie'),/__Secure-barcode_id\.session_token=/);
  assert.match(verified.headers.get('set-cookie'),/HttpOnly/i);
  assert.match(verified.headers.get('set-cookie'),/Secure/);
  assert.ok(!JSON.stringify(app.database.prepare('SELECT * FROM account').all()).includes('Private-password-43!'));
});

test('display names can match and change without changing identity or acquiring staff authority',async(t)=>{
  const app=await fixture(t);
  const first=await activate(app,'first@example.com');
  const second=await activate(app,'second@example.com');
  const before=await (await app.request('/get-session',undefined,first)).json();
  const other=await (await app.request('/get-session',undefined,second)).json();
  assert.notEqual(before.user.id,other.user.id);
  assert.equal(before.user.name,other.user.name);
  await app.request('/update-user',{name:'New Name',role:'owner',id:other.user.id},first);
  const after=await (await app.request('/get-session',undefined,first)).json();
  assert.equal(after.user.id,before.user.id);
  assert.equal(after.user.role,undefined);
  assert.equal(after.user.name,'New Name');
});

test('password recovery is one-use and revokes existing sessions; logout revokes its session',async(t)=>{
  const app=await fixture(t);
  const active=await activate(app,'recovery@example.com');
  const reset=await app.request('/request-password-reset',{email:'recovery@example.com',redirectTo:`${origin}/account/reset-password`});
  assert.equal(reset.status,200);
  await app.outbox.flushOne();
  const link=await app.auth.handler(new Request(emailLink(app.delivered.at(-1))));
  const token=new URL(link.headers.get('location')).searchParams.get('token');
  assert.ok(token);
  assert.ok(!JSON.stringify(app.database.prepare('SELECT * FROM verification').all()).includes(token),'Recovery credentials must be hashed in SQLite');
  const changed=await app.request('/reset-password',{token,newPassword:'Another-password-83!'});
  assert.equal(changed.status,200);
  assert.equal(await (await app.request('/get-session',undefined,active)).json(),null);
  assert.equal((await app.request('/reset-password',{token,newPassword:'Third-password-93!'})).status,400);
  assert.equal((await app.request('/sign-in/email',{email:'recovery@example.com',password:'Private-password-43!'})).status,401);
  const login=await app.request('/sign-in/email',{email:'recovery@example.com',password:'Another-password-83!'});
  assert.equal(login.status,200);
  await app.request('/sign-out',{},cookies(login));
  assert.equal(await (await app.request('/get-session',undefined,cookies(login))).json(),null);
});

test('unrecognized password-recovery email receives the same response without sending mail',async(t)=>{
  const app=await fixture(t);
  const result=await app.request('/request-password-reset',{email:'missing@example.com',redirectTo:`${origin}/account/reset-password`});
  assert.equal(result.status,200);
  assert.equal(await app.outbox.flushOne(),false);
  assert.equal(app.delivered.length,0);
});


test('verification replay cannot create another session and session revocation applies across devices',async(t)=>{
 const app=await fixture(t);const first=await activate(app,'devices@example.com');
 const replay=await app.auth.handler(new Request(emailLink(app.delivered[0])));assert.equal(cookies(replay),'');
 const login=await app.request('/sign-in/email',{email:'devices@example.com',password:'Private-password-43!'});const second=cookies(login);
 assert.ok((await (await app.request('/get-session',undefined,second)).json())?.user);
 assert.equal((await app.request('/revoke-sessions',{},first)).status,200);
 assert.equal(await (await app.request('/get-session',undefined,second)).json(),null);
 assert.equal(await (await app.request('/get-session',undefined,first)).json(),null);
});

test('rate limits reject repeated sign-in and foreign-origin signup without creating sessions',async(t)=>{
 const app=await fixture(t);
 for(let i=0;i<5;i++)await app.request('/sign-in/email',{email:'missing@example.com',password:'Private-password-43!'});
 assert.equal((await app.request('/sign-in/email',{email:'missing@example.com',password:'Private-password-43!'})).status,429);
 const foreign=await app.auth.handler(new Request(`${baseURL}/sign-up/email`,{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({email:'foreign@example.com',name:'Member',password:'Private-password-43!'})}));
 assert.equal(foreign.status,403);assert.equal(app.database.prepare('SELECT count(*) AS total FROM session').get().total,0);
});


test('an online backup is usable and pending mail survives service restart',async(t)=>{
 const directory=mkdtempSync(join(tmpdir(),'barcode-member-restore-test-')),databasePath=join(directory,'member.sqlite'),delivered=[];
 const configuration={databasePath,baseURL,secret:'test-only-restart-secret-12345678901234567890123',sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',transport:async(mail)=>{delivered.push(mail);return {id:'accepted'};}};
 const first=createMemberAuth(configuration);await first.migrate();await first.auth.handler(new Request(`${baseURL}/sign-up/email`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:'restart@example.com',name:'Member',password:'Private-password-43!',callbackURL:`${origin}/account`})}));
 const backupPath=join(directory,'backup.sqlite');await first.database.backup(backupPath);await first.close();
 const backup=createMemberAuth({...configuration,databasePath:backupPath});await backup.assertReady();assert.equal(backup.database.pragma('integrity_check',{simple:true}),'ok');await backup.close();
 const second=createMemberAuth(configuration);t.after(()=>second.close());await second.assertReady();await second.outbox.flushOne();assert.equal(delivered.length,1);assert.equal(second.database.prepare('SELECT status FROM member_mail_outbox').get().status,'sent');
});
