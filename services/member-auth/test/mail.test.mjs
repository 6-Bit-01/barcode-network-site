import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync as Database } from 'node:sqlite';
import { createMailOutbox } from '../mail.mjs';
const configuration = {secret:'test-only-outbox-secret-12345678901234567890',sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',baseURL:'https://www.barcode-network.com/api/member/auth'};
const notice={kind:'verification',email:'member@example.com',url:'https://www.barcode-network.com/api/member/auth/verify-email?token=private'};

test('a transient delivery failure retries the same idempotency key; permanent failures stop',async(t)=>{
 const db=new Database(':memory:'); t.after(()=>db.close()); let clock=Date.now(); const seen=[];
 const outbox=createMailOutbox(db,{...configuration,now:()=>clock,transport:async(mail)=>{seen.push(mail.idempotencyKey); if(seen.length===1)throw Object.assign(new Error('unavailable'),{retryable:true,retryAfter:2}); return {id:'accepted'};}});
 await outbox.enqueue(notice);
 await outbox.flushOne(); assert.equal(db.prepare('SELECT status FROM member_mail_outbox').get().status,'pending');
 clock+=3000; await outbox.flushOne(); assert.equal(seen.length,2); assert.equal(seen[0],seen[1]);
 assert.equal(db.prepare('SELECT status FROM member_mail_outbox').get().status,'sent');
 assert.equal(await outbox.flushOne(),false);
});

test('expired notices never send and recipient throttling bounds repeated auth emails',async(t)=>{
 const db=new Database(':memory:'); t.after(()=>db.close()); let clock=Date.now(); let count=0;
 const outbox=createMailOutbox(db,{...configuration,now:()=>clock,transport:async()=>{count++;return {id:'accepted'};}});
 await outbox.enqueue(notice); await outbox.enqueue(notice); await outbox.enqueue(notice);
 assert.equal(await outbox.enqueue(notice),false);
 clock+=3601_000; await outbox.flushOne(); assert.equal(count,0);
 assert.equal(db.prepare("SELECT count(*) AS total FROM member_mail_outbox WHERE status='expired'").get().total,3);
});

test('unsafe mail destinations and link origins are rejected before queueing',async(t)=>{
 const db=new Database(':memory:');t.after(()=>db.close());const outbox=createMailOutbox(db,{...configuration,transport:async()=>({id:'accepted'})});
 await assert.rejects(outbox.enqueue({...notice,url:'https://evil.example/steal'}),/link/i);
 await assert.rejects(outbox.enqueue({...notice,email:'member@example.com\nBcc:someone@example.com'}),/email/i);
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_outbox').get().total,0);
});


test('shutdown waits for in-flight delivery; permanent provider failure discards token payload',async(t)=>{
 const db=new Database(':memory:');t.after(()=>db.close());let release;const transport=()=>new Promise(resolve=>{release=()=>resolve({id:'accepted'});});
 const outbox=createMailOutbox(db,{...configuration,transport});await outbox.enqueue(notice);const send=outbox.flushOne();let idle=false;const shutdown=outbox.waitForIdle().then(()=>{idle=true;});assert.equal(idle,false);release();await send;await shutdown;assert.equal(idle,true);
 const failed=createMailOutbox(db,{...configuration,transport:async()=>{throw Object.assign(new Error('bad request'),{status:422,retryable:false});}});await failed.enqueue({...notice,email:'failed@example.com'});await failed.flushOne();
 const row=db.prepare("SELECT status,payload FROM member_mail_outbox WHERE status='failed'").get();assert.deepEqual({...row},{status:'failed',payload:''});
});

test('Free daily sending budget is durable and resets at UTC midnight',async(t)=>{
 const db=new Database(':memory:');t.after(()=>db.close());let clock=Date.parse('2026-10-09T23:59:00Z'),sent=0;
 const outbox=createMailOutbox(db,{...configuration,now:()=>clock,transport:async()=>({id:`accepted-${++sent}`})});
 for(let i=0;i<101;i++)await outbox.enqueue({...notice,email:`member${i}@example.com`});
 for(let i=0;i<100;i++)await outbox.flushOne();assert.equal(sent,100);assert.equal(await outbox.flushOne(),false);
 const restarted=createMailOutbox(db,{...configuration,now:()=>clock,transport:async()=>({id:`accepted-${++sent}`})});assert.equal(await restarted.flushOne(),false);
 clock+=120_000;await restarted.flushOne();assert.equal(sent,101);
});

test('mail enqueue stays inside an outer transaction and recovers after rollback',async(t)=>{
 const db=new Database(':memory:');t.after(()=>db.close());
 const outbox=createMailOutbox(db,{...configuration,transport:async()=>({id:'accepted'})});
 db.exec('BEGIN');
 await outbox.enqueue(notice);
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_outbox').get().total,1);
 db.exec('ROLLBACK');
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_outbox').get().total,0);
 await outbox.enqueue(notice);
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_outbox').get().total,1);
});

test('failed mail enqueue rolls back its savepoint without losing the outer transaction',async(t)=>{
 const db=new Database(':memory:');t.after(()=>db.close());
 const outbox=createMailOutbox(db,{...configuration,transport:async()=>({id:'accepted'})});
 db.exec("CREATE TABLE outer_marker(value INTEGER); CREATE TEMP TRIGGER reject_notice BEFORE INSERT ON member_mail_outbox BEGIN SELECT RAISE(ABORT,'fixture rejection'); END; BEGIN; INSERT INTO outer_marker VALUES(1)");
 await assert.rejects(outbox.enqueue(notice),/fixture rejection/);
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_outbox').get().total,0);
 assert.equal(db.prepare('SELECT count(*) AS total FROM outer_marker').get().total,1);
 db.exec('DROP TRIGGER reject_notice');
 await outbox.enqueue(notice);
 db.exec('COMMIT');
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_outbox').get().total,1);
 assert.equal(db.prepare('SELECT count(*) AS total FROM outer_marker').get().total,1);
});
test('failed mail-budget reservation consumes neither quota nor a delivery attempt',async(t)=>{
 const db=new Database(':memory:');t.after(()=>db.close());let sends=0;
 const outbox=createMailOutbox(db,{...configuration,transport:async()=>{sends++;return {id:'accepted'}}});
 await outbox.enqueue(notice);
 db.exec("CREATE TEMP TRIGGER reject_budget BEFORE UPDATE ON member_mail_budget BEGIN SELECT RAISE(ABORT,'fixture budget rejection'); END");
 await assert.rejects(outbox.flushOne(),/fixture budget rejection/);
 assert.equal(db.prepare('SELECT count(*) AS total FROM member_mail_budget').get().total,0);
 assert.equal(db.prepare('SELECT attempts FROM member_mail_outbox').get().attempts,0);
 assert.equal(sends,0);
 db.exec('DROP TRIGGER reject_budget');
 await outbox.flushOne();
 assert.equal(sends,1);
 assert.equal(db.prepare('SELECT attempts FROM member_mail_budget').get().attempts,1);
});
