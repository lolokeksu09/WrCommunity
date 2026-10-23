import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { execute, lockUsers, one, query, transaction } from '../../db/index.js';
import { assertCurrentActor, fail,idParam,notify,parse,requireUser } from '../../lib.js';
import { canManageEvent,canReadEvent,eventDTO,eventMember,eventRow,registrationDTOs,type EventRow } from './service.js';

const fields={title:z.string().trim().min(3).max(160),description:z.string().trim().min(1).max(5000),audience:z.enum(['public','members_only']),starts_at:z.string().datetime({offset:true}),ends_at:z.string().datetime({offset:true}),registration_closes_at:z.string().datetime({offset:true}),capacity:z.number().int().min(1).max(100000)};
const createSchema=z.object(fields).strict();const updateSchema=z.object(fields).partial().strict().refine(value=>Object.keys(value).length>0,'Provide an update');
const listSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(30)});
type Club={id:string;name:string;state:string;feed_visibility:string;event_roles:string[];owner_id:string};
async function lockClub(tx:PoolClient,id:string):Promise<Club> {
  const club=await one<Club>('SELECT id,name,state,feed_visibility,event_roles,owner_id FROM clubs WHERE id=$1 FOR UPDATE',[id],tx);
  if(!club||club.state==='deleted')fail(404,'not_found','Клуб не найден');
  return club;
}
async function lockEventContext(tx:PoolClient,eventId:string,userId:string):Promise<EventRow> {
  await lockUsers(tx,[userId]);await assertCurrentActor(tx,userId);
  const initial=await eventRow(eventId,tx);if(!initial)fail(404,'not_found','Мероприятие не найдено');
  const club=await lockClub(tx,initial.club_id);
  const event=await eventRow(eventId,tx,true);
  if(!await canReadEvent(event,userId,tx))fail(404,'not_found','Мероприятие не найдено');
  if(club.state!=='active')fail(409,'club_archived','Клуб находится в архиве');
  return event!;
}
async function assertManage(row:EventRow,userId:string,tx:PoolClient) {
  if(!canManageEvent(row,await eventMember(userId,row.club_id,tx),userId))fail(403,'event_permission_required','Нет права управлять мероприятием');
}
async function validateDates(input:{starts_at:string|Date;ends_at:string|Date;registration_closes_at:string|Date},tx:PoolClient,requireFuture:boolean) {
  const row=await one<{valid:boolean}>('SELECT ($2::timestamptz>$1::timestamptz AND $3::timestamptz<=$1::timestamptz AND (NOT $4::boolean OR ($1::timestamptz>clock_timestamp() AND $3::timestamptz>clock_timestamp()))) AS valid',[input.starts_at,input.ends_at,input.registration_closes_at,requireFuture],tx);
  if(!row?.valid)fail(422,'invalid_event_dates','Проверьте время начала, окончания и закрытия регистрации');
}
async function notifyRegistered(tx:PoolClient,row:EventRow,eventType:string) {
  const recipients=await query<{user_id:string}>("SELECT r.user_id FROM event_registrations r JOIN club_memberships m ON m.user_id=r.user_id AND m.club_id=$2 JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 AND r.state='active' AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active'",[row.id,row.club_id],tx);
  for(const recipient of recipients) await notify(tx,recipient.user_id,eventType,'event',row.id);
}
export async function registerEvents(app:FastifyInstance):Promise<void> {
  app.get('/api/v1/clubs/:id/events',async request=>{
    const id=idParam(request);const {limit}=parse(listSchema,request.query);const viewerId=request.viewer?.id??null;
    const club=await one<Club>('SELECT id,name,state,feed_visibility,event_roles,owner_id FROM clubs WHERE id=$1',[id]);
    if(!club||club.state==='deleted')fail(404,'not_found','Клуб не найден');
    const member=await eventMember(viewerId,id);
    if(club.feed_visibility==='members_only'&&!member)fail(404,'not_found','Мероприятия недоступны');
    const rows=await query<{id:string}>('SELECT id FROM events WHERE club_id=$1 AND ($2::boolean OR (audience=\'public\' AND $3=\'public\')) ORDER BY starts_at DESC,id LIMIT $4',[id,Boolean(member),club.feed_visibility,limit]);
    const items=[];for(const row of rows){const event=(await eventRow(row.id))!;if(await canReadEvent(event,viewerId))items.push(await eventDTO(event,viewerId));}return {items};
  });
  app.post('/api/v1/clubs/:id/events',async(request,reply)=>{
    const viewer=requireUser(request);const clubId=idParam(request);const input=parse(createSchema,request.body);
    const created=await transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertCurrentActor(tx,viewer.id);const club=await lockClub(tx,clubId);
      if(club.state!=='active')fail(409,'club_archived','Клуб находится в архиве');
      const member=await eventMember(viewer.id,clubId,tx);
      if(!member||!club.event_roles.includes(member.role))fail(403,'event_permission_required','Эта роль не может создавать мероприятия');
      if(input.audience==='public'&&club.feed_visibility!=='public')fail(422,'club_audience','В закрытом клубе допустима только закрытая аудитория');
      await validateDates(input,tx,true);
      const row=await one<{id:string}>('INSERT INTO events(club_id,creator_id,title,description,audience,starts_at,ends_at,registration_closes_at,capacity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[clubId,viewer.id,input.title,input.description,input.audience,input.starts_at,input.ends_at,input.registration_closes_at,input.capacity],tx);
      await execute("INSERT INTO audit_actions(actor_id,club_id,action,target_id) VALUES($1,$2,'event_created',$3)",[viewer.id,clubId,row!.id],tx);
      return eventDTO((await eventRow(row!.id,tx))!,viewer.id,tx);
    });reply.code(201);return created;
  });
  app.get('/api/v1/events/:id',async request=>{
    const row=await eventRow(idParam(request));const viewerId=request.viewer?.id??null;
    if(!await canReadEvent(row,viewerId))fail(404,'not_found','Мероприятие не найдено');return eventDTO(row!,viewerId);
  });
  app.patch('/api/v1/events/:id',async request=>{
    const viewer=requireUser(request);const id=idParam(request);const input=parse(updateSchema,request.body);
    return transaction(async tx=>{
      const row=await lockEventContext(tx,id,viewer.id);await assertManage(row,viewer.id,tx);
      if(row.state!=='open'||row.ended)fail(409,'event_closed','Мероприятие завершено или отменено');
      const next={...row,...input};
      if(next.audience==='public'&&(row.feed_visibility!=='public'||row.audience==='members_only'))fail(422,'audience_expansion','Закрытый анонс нельзя переводить в публичный');
      await validateDates(next,tx,Boolean(input.starts_at||input.registration_closes_at));
      const active=await one<{count:string}>("SELECT count(*) FROM event_registrations WHERE event_id=$1 AND state='active'",[id],tx);
      if(next.capacity<Number(active?.count??0))fail(409,'capacity_below_registrations','Лимит меньше числа действующих регистраций');
      await execute('UPDATE events SET title=$2,description=$3,audience=$4,starts_at=$5,ends_at=$6,registration_closes_at=$7,capacity=$8,updated_at=clock_timestamp() WHERE id=$1',[id,next.title,next.description,next.audience,next.starts_at,next.ends_at,next.registration_closes_at,next.capacity],tx);
      await execute("INSERT INTO audit_actions(actor_id,club_id,action,target_id) VALUES($1,$2,'event_updated',$3)",[viewer.id,row.club_id,id],tx);
      await notifyRegistered(tx,row,'event_updated');return eventDTO((await eventRow(id,tx))!,viewer.id,tx);
    });
  });
  app.post('/api/v1/events/:id/cancel',async request=>{
    const viewer=requireUser(request);const id=idParam(request);
    return transaction(async tx=>{
      const row=await lockEventContext(tx,id,viewer.id);await assertManage(row,viewer.id,tx);
      if(row.state==='cancelled')return {ok:true};if(row.ended||row.state==='completed')fail(409,'event_completed','Мероприятие завершено');
      await execute("UPDATE events SET state='cancelled',updated_at=clock_timestamp() WHERE id=$1",[id],tx);
      await notifyRegistered(tx,row,'event_cancelled');
      await execute("INSERT INTO audit_actions(actor_id,club_id,action,target_id) VALUES($1,$2,'event_cancelled',$3)",[viewer.id,row.club_id,id],tx);return {ok:true};
    });
  });
  app.post('/api/v1/events/:id/registration',async request=>{
    const viewer=requireUser(request);const id=idParam(request);
    return transaction(async tx=>{
      const row=await lockEventContext(tx,id,viewer.id);
      const member=await eventMember(viewer.id,row.club_id,tx);if(!member)fail(403,'club_membership_required','Участвовать могут только действующие участники клуба');
      if(row.state!=='open'||!row.before_start||!row.before_deadline||row.ended)fail(409,'registration_closed','Регистрация закрыта');
      const own=await one<{id:string;state:string}>("SELECT id,state FROM event_registrations WHERE event_id=$1 AND user_id=$2",[id,viewer.id],tx);
      if(own?.state==='active')return {id:own.id,event_id:id,state:'active'};
      const count=await one<{count:string}>("SELECT count(*) FROM event_registrations WHERE event_id=$1 AND state='active'",[id],tx);
      if(Number(count?.count??0)>=row.capacity)fail(409,'event_full','Мест нет');
      const reg=await one<{id:string}>('INSERT INTO event_registrations(event_id,user_id) VALUES($1,$2) ON CONFLICT(event_id,user_id) DO UPDATE SET state=\'active\',created_at=clock_timestamp() RETURNING id',[id,viewer.id],tx);
      await notify(tx,viewer.id,'event_registration_confirmed','event',id);return {id:reg!.id,event_id:id,state:'active'};
    });
  });
  app.delete('/api/v1/events/:id/registration',async request=>{
    const viewer=requireUser(request);const id=idParam(request);
    return transaction(async tx=>{
      const row=await lockEventContext(tx,id,viewer.id);
      if(row.state!=='open'||row.ended||!row.before_start)fail(409,'event_closed','Участие больше нельзя изменить');
      await execute("UPDATE event_registrations SET state='cancelled' WHERE event_id=$1 AND user_id=$2 AND state='active'",[id,viewer.id],tx);return {ok:true};
    });
  });
  app.get('/api/v1/events/:id/registrations',async request=>{
    const viewerId=request.viewer?.id??null;const row=await eventRow(idParam(request));
    if(!await canReadEvent(row,viewerId))fail(404,'not_found','Мероприятие не найдено');return {items:await registrationDTOs(row!,viewerId)};
  });
}
