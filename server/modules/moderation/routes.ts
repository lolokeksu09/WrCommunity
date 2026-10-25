import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {query,one,execute,transaction,lockUsers} from '../../db/index.js';
import {requireUser,fail,parse,idParam,notify} from '../../lib.js';
import {canReadPost} from '../policy/service.js';
import {reportEvidence} from './evidence.js';
import {decodeScopedCursor,encodeScopedCursor} from '../../listing-cursor.js';
const targetTypes=z.enum(['profile','post','comment','club','lfg','event']);
function moderator(request:FastifyRequest){const user=requireUser(request);if(!['moderator','admin'].includes(user.platform_role))fail(403,'forbidden','Недостаточно прав для модерации платформы.');return user;}
async function currentModerator(tx:PoolClient,id:string):Promise<{id:string;platform_role:string}>{
 const actor=await one<{id:string;platform_role:string}>("SELECT id,platform_role FROM users WHERE id=$1 AND status='active' AND verified_at IS NOT NULL AND platform_role IN ('moderator','admin')",[id],tx);
 if(!actor)fail(403,'forbidden','Полномочия модератора отозваны.');return actor;
}
async function reportable(type:string,id:string,user:string):Promise<boolean>{
 if(type==='profile')return !!await one('SELECT id FROM users WHERE id=$1 AND (visibility=\'public\' OR id=$2) AND status<>\'deleted\'',[id,user]);
 if(type==='club')return !!await one('SELECT id FROM clubs WHERE id=$1 AND state<>\'deleted\'',[id]);
 if(type==='post'||type==='comment'){
  const row=type==='post'?await one<{id:string;author_id:string;club_id:string|null;audience:string;visibility:string;state:string}>('SELECT p.id,p.author_id,p.club_id,p.audience,u.visibility,p.state FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=$1',[id]):await one<{id:string;author_id:string;club_id:string|null;audience:string;visibility:string;state:string}>('SELECT p.id,p.author_id,p.club_id,p.audience,u.visibility,p.state FROM comments x JOIN posts p ON p.id=x.post_id JOIN users u ON u.id=p.author_id WHERE x.id=$1',[id]);
  if(!row)return false;if(row.author_id===user)return true;if(row.visibility!=='public'||row.state!=='published')return false;
  if(!row.club_id)return true;
  const club=await one<{feed_visibility:string;member:boolean}>('SELECT c.feed_visibility,EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=c.id AND m.user_id=$2 AND m.state=\'active\' AND m.revoked_at IS NULL) member FROM clubs c WHERE c.id=$1 AND c.state<>\'deleted\'',[row.club_id,user]);
  return !!club&&(club.member||(club.feed_visibility==='public'&&row.audience==='public'));
 }
 if(type==='lfg')return !!await one('SELECT l.id FROM lfg_announcements l JOIN users u ON u.id=l.author_id WHERE l.id=$1 AND l.state<>\'deleted\' AND (u.visibility=\'public\' OR l.author_id=$2)',[id,user]);
 return !!await one("SELECT e.id FROM events e JOIN clubs c ON c.id=e.club_id WHERE e.id=$1 AND c.state<>'deleted' AND ((e.audience='public' AND c.feed_visibility='public') OR EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=e.club_id AND m.user_id=$2 AND m.state='active' AND m.revoked_at IS NULL))",[id,user]);
}
export async function registerModeration(app:FastifyInstance):Promise<void>{
 app.post('/api/v1/reports',async(request,reply)=>{const user=requireUser(request);const body=parse(z.object({target_type:targetTypes,target_id:z.string().uuid(),reason:z.string().trim().min(5).max(2000)}).strict(),request.body);if(!await reportable(body.target_type,body.target_id,user.id))fail(404,'not_found','Материал недоступен.');
  const report=await one('INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES($1,$2,$3,$4) RETURNING id,state,created_at',[user.id,body.target_type,body.target_id,body.reason]);return reply.code(201).send(report);
 });
 app.get('/api/v1/me/reports',async request=>{const user=requireUser(request,false);return {items:await query('SELECT id,target_type,target_id,reason,state,created_at,updated_at FROM reports WHERE reporter_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id])};});
 app.get('/api/v1/moderation/reports',async request=>{
  const user=moderator(request);const q=parse(z.object({state:z.enum(['open','reviewing','resolved','dismissed']).optional(),limit:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().max(600).optional()}).passthrough(),request.query);
  const scope='moderation-reports:'+user.id+':'+(q.state??'all');const cursor=decodeScopedCursor(q.cursor,scope);
  const rows=await query<{id:string;cursor_at:string;[key:string]:unknown}>(`SELECT id,target_type,target_id,reason,state,created_at,updated_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM reports
   WHERE ($1::text IS NULL OR state=$1) AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $2`,[q.state??null,q.limit+1,cursor?.at??null,cursor?.id??null]);
  const page=rows.slice(0,q.limit);return {items:page.map(({cursor_at,...row})=>row),nextCursor:rows.length>q.limit?encodeScopedCursor(page.at(-1)!,scope):null};
 });
 app.get('/api/v1/moderation/reports/:id',async request=>{const user=moderator(request);const report=await one<{id:string;target_type:string;target_id:string;state:string;reason:string}>('SELECT id,target_type,target_id,state,reason FROM reports WHERE id=$1',[idParam(request)]);if(!report)fail(404,'not_found','Жалоба не найдена.');
  const evidence=await reportEvidence(report.target_type,report.target_id,user.id);
  await execute('INSERT INTO audit_actions(actor_id,action,target_id,reason) VALUES($1,\'review_report\',$2,\'Report-bound moderation read\')',[user.id,report.id]);return {...report,evidence,evidence_status:evidence?'available':'unavailable',actions:await query('SELECT action,reason,created_at FROM moderation_actions WHERE report_id=$1 ORDER BY created_at',[report.id])};
 });
 app.patch('/api/v1/moderation/reports/:id',async request=>{const user=moderator(request);const id=idParam(request);const body=parse(z.object({state:z.enum(['reviewing','resolved','dismissed']),reason:z.string().trim().min(5).max(2000)}).strict(),request.body);
  return transaction(async tx=>{await lockUsers(tx,[user.id]);await currentModerator(tx,user.id);const r=await one<{target_type:string;target_id:string}>('UPDATE reports SET state=$2,updated_at=now() WHERE id=$1 RETURNING target_type,target_id',[id,body.state],tx);if(!r)fail(404,'not_found','Жалоба не найдена.');await execute('INSERT INTO moderation_actions(actor_id,target_type,target_id,action,reason,report_id) VALUES($1,$2,$3,$4,$5,$6)',[user.id,r.target_type,r.target_id,body.state,body.reason,id],tx);return {ok:true};});
 });
 app.post('/api/v1/moderation/content/:type/:id/remove',async request=>{const user=moderator(request);const params=parse(z.object({type:z.enum(['post','comment','club','lfg','event']),id:z.string().uuid()}),request.params);const body=parse(z.object({reason:z.string().trim().min(5).max(2000),report_id:z.string().uuid()}).strict(),request.body);
  return transaction(async tx=>{await lockUsers(tx,[user.id]);await currentModerator(tx,user.id);const report=await one('SELECT id FROM reports WHERE id=$1 AND target_type=$2 AND target_id=$3',[body.report_id,params.type,params.id],tx);if(!report)fail(409,'report_required','Нужна жалоба на этот материал.');const tables={post:['posts','removed'],comment:['comments','removed'],club:['clubs','archived'],lfg:['lfg_announcements','deleted'],event:['events','cancelled']} as const;const [table,state]=tables[params.type];const row=await one(`UPDATE ${table} SET state=$2 WHERE id=$1 AND state NOT IN ('deleted','removed') RETURNING id`,[params.id,state],tx);if(!row)fail(404,'not_found','Материал не найден.');
   if(params.type==='club')await execute('UPDATE clubs SET platform_restricted=true WHERE id=$1',[params.id],tx);
   await execute('INSERT INTO moderation_actions(actor_id,target_type,target_id,action,reason,report_id) VALUES($1,$2,$3,\'remove\',$4,$5)',[user.id,params.type,params.id,body.reason,body.report_id],tx);await execute("UPDATE reports SET state='resolved',updated_at=now() WHERE id=$1",[body.report_id],tx);return {ok:true};});
 });
 app.post('/api/v1/moderation/content/club/:id/restore',async request=>{
  const user=moderator(request),id=idParam(request);const body=parse(z.object({reason:z.string().trim().min(5).max(2000)}).strict(),request.body);
  return transaction(async tx=>{await lockUsers(tx,[user.id]);await currentModerator(tx,user.id);
   const club=await one("UPDATE clubs SET platform_restricted=false,state='active',updated_at=now() WHERE id=$1 AND state='archived' AND platform_restricted RETURNING id",[id],tx);if(!club)fail(404,'not_found','Ограниченный клуб не найден.');
   await execute("INSERT INTO moderation_actions(actor_id,target_type,target_id,action,reason) VALUES($1,'club',$2,'restore',$3)",[user.id,id,body.reason],tx);return {ok:true};
  });
 });
 app.post('/api/v1/moderation/sanctions',async request=>{const user=moderator(request);const body=parse(z.object({user_id:z.string().uuid(),kind:z.enum(['warning','suspension']),reason:z.string().trim().min(5).max(2000),expires_at:z.string().datetime().optional(),report_id:z.string().uuid().optional()}).strict(),request.body);
  return transaction(async tx=>{await lockUsers(tx,[user.id,body.user_id]);const actor=await currentModerator(tx,user.id);const target=await one<{platform_role:string}>('SELECT platform_role FROM users WHERE id=$1 AND status<>\'deleted\'',[body.user_id],tx);if(!target)fail(404,'not_found','Аккаунт недоступен.');if(body.user_id===user.id||target.platform_role==='admin'||(target.platform_role==='moderator'&&actor.platform_role!=='admin'))fail(403,'hierarchy','Нельзя применить санкцию к этому аккаунту.');
   if(body.kind==='suspension'&&(!body.expires_at||!await one('SELECT 1 WHERE $1::timestamptz>now()',[body.expires_at],tx)))fail(422,'expiry_required','Выберите будущую дату окончания.');
   const result=await one('INSERT INTO sanctions(user_id,actor_id,kind,reason,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[body.user_id,user.id,body.kind,body.reason,body.expires_at??null],tx);
   if(body.kind==='suspension'){await execute("UPDATE users SET status='suspended' WHERE id=$1",[body.user_id],tx);await execute('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[body.user_id],tx);}
   await execute('INSERT INTO moderation_actions(actor_id,target_type,target_id,action,reason,report_id) VALUES($1,\'profile\',$2,$3,$4,$5)',[user.id,body.user_id,body.kind,body.reason,body.report_id??null],tx);await notify(tx,body.user_id,'security_sanction','profile',body.user_id,user.id);return result;
  });
 });
 app.get('/api/v1/moderation/sanctions',async request=>{moderator(request);return {items:await query('SELECT id,user_id,kind,reason,expires_at,revoked_at,created_at FROM sanctions ORDER BY created_at DESC LIMIT 100')};});
 app.post('/api/v1/moderation/sanctions/:id/revoke',async request=>{
  const user=moderator(request);const body=parse(z.object({reason:z.string().min(5).max(2000)}).strict(),request.body);const id=idParam(request);
  return transaction(async tx=>{
   const initial=await one<{user_id:string;actor_id:string}>('SELECT user_id,actor_id FROM sanctions WHERE id=$1 AND revoked_at IS NULL',[id],tx);if(!initial)fail(404,'not_found','Санкция не найдена.');
   await lockUsers(tx,[user.id,initial.user_id]);const actor=await currentModerator(tx,user.id);
   const target=await one<{platform_role:string}>('SELECT platform_role FROM users WHERE id=$1',[initial.user_id],tx);
   if(initial.user_id===user.id||target?.platform_role==='admin'||(target?.platform_role==='moderator'&&actor.platform_role!=='admin'))fail(403,'hierarchy','Недостаточно полномочий для отмены санкции.');
   const original=await one<{platform_role:string}>('SELECT platform_role FROM users WHERE id=$1',[initial.actor_id],tx);
   if(original?.platform_role==='admin'&&actor.platform_role!=='admin')fail(403,'hierarchy','Только администратор отменяет это решение.');
   const sanction=await one<{user_id:string}>('UPDATE sanctions SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING user_id',[id],tx);if(!sanction)fail(409,'conflict','Санкция уже изменена.');
   await execute("UPDATE users SET status='active' WHERE id=$1 AND status='suspended' AND NOT EXISTS(SELECT 1 FROM sanctions WHERE user_id=$1 AND kind='suspension' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()))",[sanction.user_id],tx);
   await execute("INSERT INTO moderation_actions(actor_id,target_type,target_id,action,reason) VALUES($1,'profile',$2,'revoke_sanction',$3)",[user.id,sanction.user_id,body.reason],tx);return {ok:true};
  });
 });
 app.get('/api/v1/moderation/audit',async request=>{moderator(request);return {items:await query('SELECT id,target_type,target_id,action,reason,report_id,created_at FROM moderation_actions ORDER BY created_at DESC LIMIT 200')};});
 app.get('/api/v1/me/sanctions',async request=>{const user=requireUser(request,false);return {items:await query('SELECT id,kind,reason,expires_at,revoked_at,created_at FROM sanctions WHERE user_id=$1 ORDER BY created_at DESC',[user.id])};});
}
