import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { execute, lockPair, lockUsers, one, query, transaction } from '../../db/index.js';
import { fail, idParam, notify, parse, requireUser } from '../../lib.js';
import { blocked } from '../policy/service.js';
import { type Announcement,type Application,announcementDTO,announcementRow,applicationDTO,applyPendingPolicy,decryptContact,encryptContact,expireAnnouncement,expireLfg,refreshAnnouncement } from './service.js';

const createSchema=z.object({server:z.string().trim().min(1).max(80),roles:z.array(z.string().trim().min(1).max(40)).min(1).max(5),description:z.string().trim().min(1).max(2000),expires_at:z.string().datetime({offset:true}),pending_policy:z.enum(['keep','reject'])}).strict();
const updateSchema=z.object({description:createSchema.shape.description,expires_at:createSchema.shape.expires_at,pending_policy:createSchema.shape.pending_policy}).partial().strict().refine(value=>Object.keys(value).length>0,'Provide an update');
const listSchema=z.object({server:z.string().max(80).optional(),role:z.string().max(40).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)});
const applySchema=z.object({message:z.string().trim().min(1).max(500),disclosure_consent:z.boolean().default(false)}).strict();
const decisionSchema=z.object({decision:z.enum(['accepted','rejected'])}).strict();
const contactSchema=z.object({game_contact:z.string().trim().min(1).max(120).refine(value=>!value.includes('@')&&!/^\+?[\d\s().-]{7,}$/.test(value),'Use a game identifier, not email or telephone'),consent:z.literal(true)}).strict();
async function visible(announcement:Announcement|undefined,viewerId:string|null,tx?:PoolClient):Promise<Announcement> {
  if(!announcement||announcement.state==='deleted'||announcement.author_status!=='active'||(announcement.visibility!=='public'&&announcement.author_id!==viewerId)||(viewerId&&await blocked(viewerId,announcement.author_id,tx)))fail(404,'not_found','Объявление не найдено');
  return announcement;
}
async function pairApplication(id:string,viewerId:string,tx:PoolClient) {
  const initial=await one<Application & {author_id:string}>('SELECT ap.*,a.author_id FROM lfg_applications ap JOIN lfg_announcements a ON a.id=ap.announcement_id WHERE ap.id=$1',[id],tx);
  if(!initial||(initial.author_id!==viewerId&&initial.applicant_id!==viewerId))fail(404,'not_found','Отклик не найден');
  await lockUsers(tx,[initial.author_id,initial.applicant_id]);
  await lockPair(tx,initial.author_id,initial.applicant_id);
  if(await blocked(initial.author_id,initial.applicant_id,tx))fail(404,'not_found','Отклик не найден');
  const announcement=await visible(await announcementRow(initial.announcement_id,tx,true),viewerId,tx);
  const applicant=await one<{status:string}>('SELECT status FROM users WHERE id=$1',[initial.applicant_id],tx);
  if(applicant?.status!=='active')fail(404,'not_found','Отклик не найден');
  const application=await one<Application>('SELECT * FROM lfg_applications WHERE id=$1 FOR UPDATE',[id],tx);
  if(!application)fail(404,'not_found','Отклик не найден');
  await expireAnnouncement(tx,announcement);
  // expiry can update the application after its initial read
  return {announcement,application:(await one<Application>('SELECT * FROM lfg_applications WHERE id=$1',[id],tx))!};
}
export async function registerLfg(app:FastifyInstance):Promise<void> {
  app.get('/api/v1/lfg',async request=>{
    const input=parse(listSchema,request.query);await expireLfg();
    const params:unknown[]=[request.viewer?.id??null];const predicates=["a.state='open'","a.expires_at>clock_timestamp()","u.status='active'","u.visibility='public'",'NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))'];
    if(input.server){params.push(input.server);predicates.push(`a.server=$${params.length}`);}
    if(input.role){params.push(input.role);predicates.push(`a.roles @> to_jsonb(ARRAY[$${params.length}::text])`);}
    params.push(input.limit);
    const rows=await query<Announcement>(`SELECT a.*,u.handle,u.display_name FROM lfg_announcements a JOIN users u ON u.id=a.author_id WHERE ${predicates.join(' AND ')} ORDER BY a.created_at DESC,a.id LIMIT $${params.length}`,params);
    return {items:rows.map(announcementDTO)};
  });
  app.post('/api/v1/lfg',async(request,reply)=>{
    const viewer=requireUser(request);const input=parse(createSchema,request.body);
    const row=await transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);
      const author=await one<{visibility:string;status:string;verified_at:Date|null}>('SELECT visibility,status,verified_at FROM users WHERE id=$1',[viewer.id],tx);
      if(author?.visibility!=='public'||author.status!=='active'||!author.verified_at)fail(403,'public_profile_required','Нужен публичный подтверждённый профиль');
      const future=await one<{valid:boolean}>('SELECT $1::timestamptz>clock_timestamp() AS valid',[input.expires_at],tx);
      if(!future?.valid)fail(422,'future_expiry_required','Укажите будущее время окончания');
      const created=await one<{id:string}>('INSERT INTO lfg_announcements(author_id,server,roles,description,expires_at,pending_policy) VALUES($1,$2,$3::jsonb,$4,$5,$6) RETURNING id',[viewer.id,input.server,JSON.stringify(input.roles),input.description,input.expires_at,input.pending_policy],tx);
      return announcementDTO((await announcementRow(created!.id,tx))!);
    });reply.code(201);return row;
  });
  app.patch('/api/v1/lfg/:id',async request=>{
    const viewer=requireUser(request);const id=idParam(request);const input=parse(updateSchema,request.body);await refreshAnnouncement(id);
    const result=await transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);const row=await visible(await announcementRow(id,tx,true),viewer.id,tx);
      if(row.author_id!==viewer.id)fail(404,'not_found','Объявление не найдено');
      await expireAnnouncement(tx,row);
      if(row.state!=='open'||row.is_expired)return {closed:true} as const;
      const author=await one<{visibility:string;status:string}>('SELECT visibility,status FROM users WHERE id=$1',[viewer.id],tx);
      if(author?.visibility!=='public'||author.status!=='active')fail(403,'public_profile_required','Нужен публичный профиль');
      if(input.expires_at){const future=await one<{valid:boolean}>('SELECT $1::timestamptz>clock_timestamp() AS valid',[input.expires_at],tx);if(!future?.valid)fail(422,'future_expiry_required','Укажите будущее время окончания');}
      await execute('UPDATE lfg_announcements SET description=$2,expires_at=$3,pending_policy=$4,updated_at=clock_timestamp() WHERE id=$1',[id,input.description??row.description,input.expires_at??row.expires_at,input.pending_policy??row.pending_policy],tx);
      return {announcement:announcementDTO((await announcementRow(id,tx))!)};
    });if('closed' in result)fail(409,'lfg_closed','Объявление завершено');return result.announcement;
  });
  app.get('/api/v1/lfg/mine',async request=>{
    const viewer=requireUser(request,false);await expireLfg();
    const rows=await query<Announcement>("SELECT a.*,u.handle,u.display_name FROM lfg_announcements a JOIN users u ON u.id=a.author_id WHERE a.author_id=$1 AND a.state<>'deleted' ORDER BY a.created_at DESC,a.id LIMIT 100",[viewer.id]);
    return {items:rows.map(announcementDTO)};
  });
  app.get('/api/v1/lfg/applications/mine',async request=>{
    const viewer=requireUser(request,false);await expireLfg();
    const rows=await query<Application>(`SELECT ap.* FROM lfg_applications ap JOIN lfg_announcements a ON a.id=ap.announcement_id JOIN users u ON u.id=a.author_id WHERE ap.applicant_id=$1 AND a.state<>'deleted' AND u.status='active' AND u.visibility='public' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=a.author_id) OR (b.blocker_id=a.author_id AND b.blocked_id=$1)) ORDER BY ap.created_at DESC LIMIT 100`,[viewer.id]);
    return {items:rows.map(applicationDTO)};
  });
  app.get('/api/v1/lfg/:id',async request=>{const id=idParam(request);await refreshAnnouncement(id);return announcementDTO(await visible(await announcementRow(id),request.viewer?.id??null));});
  for(const [method,url] of [['POST','/api/v1/lfg/:id/close'],['DELETE','/api/v1/lfg/:id']] as const) app.route({method,url,handler:async request=>{
    const viewer=requireUser(request);const id=idParam(request);await refreshAnnouncement(id);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);const row=await visible(await announcementRow(id,tx,true),viewer.id,tx);
      if(row.author_id!==viewer.id)fail(404,'not_found','Объявление не найдено');
      if(method==='DELETE') {
        await execute("UPDATE lfg_announcements SET state='deleted',updated_at=clock_timestamp() WHERE id=$1",[id],tx);
        await execute("UPDATE lfg_applications SET state='cancelled',disclosure_consent=false,disclosed_nickname=NULL,decided_at=clock_timestamp() WHERE announcement_id=$1 AND state IN ('pending','accepted')",[id],tx);
        await execute('UPDATE lfg_contacts c SET revoked_at=clock_timestamp() FROM lfg_applications ap WHERE c.application_id=ap.id AND ap.announcement_id=$1 AND c.revoked_at IS NULL',[id],tx);
        return {ok:true};
      }
      if(row.state==='open')await execute("UPDATE lfg_announcements SET state='closed',updated_at=clock_timestamp() WHERE id=$1",[id],tx);
      await applyPendingPolicy(tx,row);return announcementDTO((await announcementRow(id,tx))!);
    });
  }});
  app.post('/api/v1/lfg/:id/applications',async(request,reply)=>{
    const viewer=requireUser(request);const id=idParam(request);const input=parse(applySchema,request.body);await refreshAnnouncement(id);
    const result=await transaction(async tx=>{
      const initial=await announcementRow(id,tx);if(!initial)fail(404,'not_found','Объявление не найдено');
      await lockUsers(tx,[viewer.id,initial.author_id]);await lockPair(tx,viewer.id,initial.author_id);
      const row=await visible(await announcementRow(id,tx,true),viewer.id,tx);
      await expireAnnouncement(tx,row);
      if(row.state!=='open'||row.is_expired)return {expired:true} as const;
      if(row.author_id===viewer.id)fail(409,'own_announcement','Нельзя откликнуться на своё объявление');
      const applicant=await one<{handle:string;visibility:string;status:string;verified_at:Date|null}>('SELECT handle,visibility,status,verified_at FROM users WHERE id=$1',[viewer.id],tx);
      if(!applicant||applicant.status!=='active'||!applicant.verified_at)fail(403,'unavailable','Отклик недоступен');
      if(applicant.visibility==='hidden'&&!input.disclosure_consent)fail(422,'disclosure_required','Подтвердите раскрытие ника только автору объявления');
      const existing=await one<{id:string}>('SELECT id FROM lfg_applications WHERE announcement_id=$1 AND applicant_id=$2',[id,viewer.id],tx);
      if(existing)fail(409,'duplicate_application','Вы уже откликнулись');
      const application=await one<Application>('INSERT INTO lfg_applications(announcement_id,applicant_id,message,disclosure_consent,disclosed_nickname) VALUES($1,$2,$3,true,$4) RETURNING *',[id,viewer.id,input.message,applicant.handle],tx);
      await notify(tx,row.author_id,'lfg_application_received','lfg_application',application!.id,viewer.id);
      return {application:applicationDTO(application!)};
    });
    if('expired' in result)fail(409,'lfg_closed','Приём откликов завершён');reply.code(201);return result.application;
  });
  app.get('/api/v1/lfg/:id/applications',async request=>{
    const viewer=requireUser(request,false);const id=idParam(request);await refreshAnnouncement(id);
    const row=await visible(await announcementRow(id),viewer.id);if(row.author_id!==viewer.id)fail(404,'not_found','Объявление не найдено');
    const rows=await query<Application>(`SELECT ap.* FROM lfg_applications ap JOIN users u ON u.id=ap.applicant_id WHERE ap.announcement_id=$1 AND ap.disclosure_consent AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=ap.applicant_id) OR (b.blocker_id=ap.applicant_id AND b.blocked_id=$2)) ORDER BY ap.created_at DESC LIMIT 100`,[id,viewer.id]);
    return {items:rows.map(applicationDTO)};
  });
  app.post('/api/v1/lfg/applications/:id/decision',async request=>{
    const viewer=requireUser(request);const id=idParam(request);const input=parse(decisionSchema,request.body);await expireLfg();
    const result=await transaction(async tx=>{
      const {announcement,application}=await pairApplication(id,viewer.id,tx);
      if(announcement.author_id!==viewer.id)fail(404,'not_found','Отклик не найден');
      if(application.state!=='pending')return {conflict:true} as const;
      if(!application.disclosure_consent)fail(409,'disclosure_revoked','Согласие отозвано');
      const changed=await one<Application>('UPDATE lfg_applications SET state=$2,decided_at=clock_timestamp() WHERE id=$1 RETURNING *',[id,input.decision],tx);
      await notify(tx,application.applicant_id,'lfg_application_decided','lfg_application',id,viewer.id);
      return {application:applicationDTO(changed!)};
    });if('conflict'in result)fail(409,'already_decided','Отклик уже рассмотрен');return result.application;
  });
  app.delete('/api/v1/lfg/applications/:id',async request=>{
    const viewer=requireUser(request);const id=idParam(request);
    return transaction(async tx=>{
      const initial=await one<Application>('SELECT * FROM lfg_applications WHERE id=$1',[id],tx);
      if(!initial||initial.applicant_id!==viewer.id)fail(404,'not_found','Отклик не найдено');
      const author=await one<{author_id:string}>('SELECT author_id FROM lfg_announcements WHERE id=$1',[initial.announcement_id],tx);
      await lockUsers(tx,[viewer.id,author!.author_id]);await lockPair(tx,viewer.id,author!.author_id);
      await announcementRow(initial.announcement_id,tx,true);
      await execute("UPDATE lfg_applications SET state='cancelled',disclosure_consent=false,disclosed_nickname=NULL,decided_at=clock_timestamp() WHERE id=$1",[id],tx);
      await execute('UPDATE lfg_contacts SET revoked_at=clock_timestamp() WHERE application_id=$1 AND revoked_at IS NULL',[id],tx);return {ok:true};
    });
  });
  app.get('/api/v1/lfg/applications/:id/contacts',async request=>{
    const viewer=requireUser(request,false);const id=idParam(request);
    return transaction(async tx=>{
      const {application}=await pairApplication(id,viewer.id,tx);if(application.state!=='accepted')fail(409,'not_accepted','Контакты доступны после принятия');
      const rows=await query<{user_id:string;contact_encrypted:string}>('SELECT user_id,contact_encrypted FROM lfg_contacts WHERE application_id=$1 AND revoked_at IS NULL',[id],tx);
      const own=rows.find(row=>row.user_id===viewer.id);const partner=rows.find(row=>row.user_id!==viewer.id);
      return {own_contact:own?decryptContact(own.contact_encrypted,id,own.user_id):null,partner_contact:own&&partner?decryptContact(partner.contact_encrypted,id,partner.user_id):null,own_consented:Boolean(own),partner_consented:Boolean(partner),notice:'Отзыв прекращает дальнейший показ. Уже сохранённые получателем копии удалить невозможно.'};
    });
  });
  app.put('/api/v1/lfg/applications/:id/contacts',async request=>{
    const viewer=requireUser(request);const id=idParam(request);const input=parse(contactSchema,request.body);
    return transaction(async tx=>{
      const {announcement,application}=await pairApplication(id,viewer.id,tx);if(application.state!=='accepted'||!application.disclosure_consent)fail(409,'not_accepted','Контакты доступны после принятия');
      const encrypted=encryptContact(input.game_contact,id,viewer.id);
      await execute('INSERT INTO lfg_contacts(application_id,user_id,contact_encrypted) VALUES($1,$2,$3) ON CONFLICT(application_id,user_id) DO UPDATE SET contact_encrypted=$3,consented_at=clock_timestamp(),revoked_at=NULL',[id,viewer.id,encrypted],tx);
      await notify(tx,viewer.id===announcement.author_id?application.applicant_id:announcement.author_id,'lfg_contact_consent','lfg_application',id,viewer.id);return {ok:true};
    });
  });
  app.delete('/api/v1/lfg/applications/:id/contacts',async request=>{
    const viewer=requireUser(request);const id=idParam(request);
    return transaction(async tx=>{
      // Revocation stays possible after a block or a profile becomes hidden.
      const row=await one<Application & {author_id:string}>('SELECT ap.*,a.author_id FROM lfg_applications ap JOIN lfg_announcements a ON a.id=ap.announcement_id WHERE ap.id=$1',[id],tx);
      if(!row||(row.applicant_id!==viewer.id&&row.author_id!==viewer.id))fail(404,'not_found','Отклик не найден');
      await lockUsers(tx,[row.applicant_id,row.author_id]);await lockPair(tx,row.applicant_id,row.author_id);
      await execute('UPDATE lfg_contacts SET revoked_at=clock_timestamp() WHERE application_id=$1 AND user_id=$2 AND revoked_at IS NULL',[id,viewer.id],tx);return {ok:true};
    });
  });
}
