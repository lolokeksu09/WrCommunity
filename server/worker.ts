import nodemailer from 'nodemailer';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execute,one,query,transaction,pool} from './db/index.js';
import {notificationCategory} from './modules/notifications/routes.js';
import {expireLfg} from './modules/lfg/service.js';
import {blocked} from './modules/policy/service.js';
interface Job {id:string;type:string;payload:Record<string,unknown>;attempts:number}
interface NotificationPayload {recipient:string;eventType:string;objectType:string;objectId:string;actorId:string|null}
export async function processOutbox(limit=50):Promise<number>{
 let processed=0;
 for(let i=0;i<limit;i++){
  const found=await transaction(async tx=>{
   const job=await one<Job>('SELECT * FROM outbox WHERE completed_at IS NULL AND attempts<8 AND available_at<=now() ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1',[],tx);if(!job)return false;
   await execute('SAVEPOINT job_work',[],tx);
   try{
    if(job.type==='email'){
     if(!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw new Error('smtp_configuration');
     const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}:{}),connectionTimeout:10000,socketTimeout:15000,requireTLS:process.env.SMTP_REQUIRE_TLS==='true'});
     try{await transport.sendMail({from:process.env.SMTP_FROM,to:String(job.payload.to),subject:String(job.payload.subject),text:String(job.payload.text),disableFileAccess:true,disableUrlAccess:true});}finally{transport.close();}
    }else if(job.type==='notification'){
     const p=job.payload as unknown as NotificationPayload;
     const recipient=await one<{id:string}>('SELECT id FROM users WHERE id=$1 AND status<>\'deleted\'',[p.recipient],tx);
     const actor=p.actorId?await one<{visibility:string;status:string}>('SELECT visibility,status FROM users WHERE id=$1',[p.actorId],tx):null;
     const effectiveBlock=p.actorId?await blocked(p.recipient,p.actorId,tx):false;
     const pref=await one<{enabled:boolean}>('SELECT enabled FROM notification_preferences WHERE user_id=$1 AND event_type=$2',[p.recipient,notificationCategory(p.eventType)],tx);
     const identityHidden=!!actor&&actor.visibility!=='public';
     const skipHidden=/follow|like|reaction/.test(p.eventType)&&identityHidden;
     const enabled=p.eventType.startsWith('security_')||pref?.enabled!==false;
     if(recipient&&!effectiveBlock&&!skipHidden&&(!actor||actor.status==='active')&&enabled)await execute('INSERT INTO notifications(recipient_id,event_type,object_type,object_id,actor_id,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING',[p.recipient,p.eventType,p.objectType,p.objectId,p.actorId,job.id],tx);
    }else throw new Error('unknown_job');
    await execute("UPDATE outbox SET completed_at=now(),attempts=attempts+1,payload=CASE WHEN type='email' THEN '{}'::jsonb ELSE payload END,last_error=NULL WHERE id=$1",[job.id],tx);
   }catch{
    await execute('ROLLBACK TO SAVEPOINT job_work',[],tx);
    await execute("UPDATE outbox SET attempts=attempts+1,available_at=now()+make_interval(secs=>LEAST(3600,30*power(2,attempts))::integer),last_error='delivery_failed' WHERE id=$1",[job.id],tx);
   }
   return true;
  });
  if(!found)break;processed++;
 }
 return processed;
}
export async function periodic():Promise<void>{
 await expireLfg();
 await transaction(async tx=>{
  const rows=await query<{id:string}>("SELECT id FROM users u WHERE status='suspended' AND NOT EXISTS(SELECT 1 FROM sanctions s WHERE s.user_id=u.id AND s.kind='suspension' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now())) FOR UPDATE",[],tx);
  for(const row of rows)await execute("UPDATE users SET status='active' WHERE id=$1 AND status='suspended' AND NOT EXISTS(SELECT 1 FROM sanctions s WHERE s.user_id=$1 AND s.kind='suspension' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()))",[row.id],tx);
 });
 await writeFile(process.env.WORKER_HEARTBEAT_FILE??'/tmp/wrc-worker-heartbeat',String(Date.now()),{mode:0o600});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;});
 while(!stopping){try{await periodic();await processOutbox();}catch{process.stderr.write('Background processing failed; retry scheduled.\n');}if(!stopping)await new Promise(resolve=>setTimeout(resolve,3000));}
 await pool.end();
}
