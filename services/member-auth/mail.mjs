import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';


let transactionSequence=0;
function sqliteTransaction(database,operation) {
  return (...args)=>{
    const savepoint='member_mail_'+(++transactionSequence);
    database.exec('SAVEPOINT '+savepoint);
    try {
      const result=operation(...args);
      database.exec('RELEASE SAVEPOINT '+savepoint);
      return result;
    } catch(error) {
      database.exec('ROLLBACK TO SAVEPOINT '+savepoint);
      database.exec('RELEASE SAVEPOINT '+savepoint);
      throw error;
    }
  };
}

export function createResendTransport(apiKey, fetcher=fetch) {
  if (!apiKey) throw new Error('RESEND_API_KEY is required');
  return async (mail) => {
    let response;
    try { response = await fetcher('https://api.resend.com/emails', {method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json','idempotency-key':mail.idempotencyKey},body:JSON.stringify({from:mail.from,to:[mail.to],reply_to:mail.replyTo,subject:mail.subject,text:mail.text}),signal:AbortSignal.timeout(15_000)}); }
    catch { throw Object.assign(new Error('delivery unavailable'),{retryable:true}); }
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      throw Object.assign(new Error('delivery rejected'),{retryable:[429,500,502,503,504].includes(response.status),retryAfter:Number.isFinite(retryAfter)&&retryAfter>0?retryAfter:undefined,status:response.status});
    }
    const result=await response.json();
    if (typeof result.id !== 'string') throw Object.assign(new Error('delivery response invalid'),{retryable:true});
    return {id:result.id};
  };
}

export function createMailOutbox(database,{secret,sender,replyTo,baseURL,transport,now=Date.now}) {
  const origin=new URL(baseURL).origin;
  if (!/^BARCODE Network <[a-z-]+@mail\.barcode-network\.com>$/.test(sender)) throw new Error('Invalid account sender');
  const key=createHash('sha256').update(`barcode-member-mail:${secret}`).digest();
  database.exec(`CREATE TABLE IF NOT EXISTS member_mail_outbox (id TEXT PRIMARY KEY,recipient_hash TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,next_attempt INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,provider_id TEXT,error_code TEXT);
    CREATE INDEX IF NOT EXISTS member_mail_due ON member_mail_outbox(status,next_attempt);
    CREATE INDEX IF NOT EXISTS member_mail_recipient ON member_mail_outbox(recipient_hash,created_at);
    CREATE TABLE IF NOT EXISTS member_mail_budget (day TEXT PRIMARY KEY,attempts INTEGER NOT NULL);`);
  function encrypt(payload) {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
    const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
    return [iv,cipher.getAuthTag(),data].map(value=>value.toString('base64')).join('.');
  }
  function decrypt(payload) {
    const [iv,tag,data]=payload.split('.').map(value=>Buffer.from(value,'base64'));
    const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8'));
  }
  const enqueueTransaction=sqliteTransaction(database,(notice)=>{
    const time=now();
    const hash=createHmac('sha256',key).update(notice.email.toLowerCase()).digest('hex');
    const count=database.prepare('SELECT count(*) AS total FROM member_mail_outbox WHERE recipient_hash=? AND created_at>?').get(hash,time-3600_000).total;
    if(count>=3)return false;
    const id=randomUUID();
    database.prepare("INSERT INTO member_mail_outbox (id,recipient_hash,payload,status,created_at,expires_at,next_attempt) VALUES (?,?,?,'pending',?,?,?)").run(id,hash,encrypt(notice),time,time+3600_000,time);
    return id;
  });
  let flushing=false;const idleWaiters=[];
  return {
    async enqueue(notice) {
      if(!['verification','recovery'].includes(notice.kind))throw new Error('Invalid mail kind');
      if(typeof notice.email!=='string'||notice.email.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(notice.email))throw new Error('Invalid email');
      const link=new URL(notice.url);
      if(link.origin!==origin||!link.pathname.startsWith('/api/member/auth/'))throw new Error('Invalid account link');
      return enqueueTransaction(notice);
    },
    waitForIdle(){return flushing?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();},
    async flushOne() {
      if(flushing)return false;
      flushing=true;
      try {
        const time=now();
        database.prepare("UPDATE member_mail_outbox SET status='expired',payload='' WHERE status='pending' AND expires_at<=?").run(time);
        const row=database.prepare("SELECT * FROM member_mail_outbox WHERE status='pending' AND next_attempt<=? ORDER BY created_at,id LIMIT 1").get(time);
        if(!row)return false;
        const day=new Date(time).toISOString().slice(0,10);
        const reserved=sqliteTransaction(database,()=>{
          database.prepare('INSERT OR IGNORE INTO member_mail_budget(day,attempts) VALUES (?,0)').run(day);
          if(database.prepare('SELECT attempts FROM member_mail_budget WHERE day=?').get(day).attempts>=100)return false;
          database.prepare('UPDATE member_mail_budget SET attempts=attempts+1 WHERE day=?').run(day);return true;
        })();
        if(!reserved)return false;
        try {
          const notice=decrypt(row.payload);
          const verification=notice.kind==='verification';
          const result=await transport({idempotencyKey:`barcode-member/${row.id}`,from:sender,to:notice.email,replyTo,subject:verification?'Verify your BARCODE account':'Reset your BARCODE password',text:`${verification?'Verify your email to activate your BARCODE Member account.':'Use this link to reset your BARCODE password.'}\n\n${notice.url}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.\n\nBARCODE Network`});
          database.prepare("UPDATE member_mail_outbox SET status='sent',payload='',provider_id=?,attempts=attempts+1 WHERE id=?").run(result.id,row.id);
        } catch(error) {
          const attempts=row.attempts+1;
          const retry=error.retryable===true&&attempts<6;
          const delay=Math.max(Number(error.retryAfter)||0,Math.min(300,2**attempts))*1000;
          database.prepare('UPDATE member_mail_outbox SET status=?,payload=?,next_attempt=?,attempts=?,error_code=? WHERE id=?').run(retry?'pending':'failed',retry?row.payload:'',time+delay,attempts,`delivery_${Number(error.status)||'unavailable'}`,row.id);
        }
        return true;
      } finally {flushing=false;for(const resolve of idleWaiters.splice(0))resolve();}
    },
  };
}
