import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { query, one, execute, transaction, lockUsers, lockPair } from '../../db/index.js';
import { requireUser, fail, idParam, parse, notify } from '../../lib.js';
import { blocked } from '../policy/service.js';
import { membership, canManageClub, canReadClubContent, requireClub, requireManager, checkedText, nicknameIdentity, assertIdentityAvailable, assertMedia, audit, ownershipGate, endMembership, assertActiveUser, releaseUnusedNames } from './service.js';
import type { Club, ClubMembership, ClubRole } from './service.js';

const uuid=z.string().uuid();
const role=z.enum(['owner','admin','moderator','member']);
const identitySchema=z.object({nickname:z.string(),avatar_id:uuid.nullable().optional(),roles:z.array(z.string().trim().min(1).max(40)).max(8).default([]),consent:z.literal(true),consent_version:z.literal(1),history_acknowledged:z.literal(true)}).strict();
const fields={name:z.string(),description:z.string(),join_mode:z.enum(['open','approval']),feed_visibility:z.enum(['public','members_only']),rules:z.string().max(10000).optional(),avatar_id:uuid.nullable().optional(),cover_id:uuid.nullable().optional(),event_roles:z.array(role).max(4).optional()};
const createSchema=z.object(fields).strict();
const updateSchema=z.object({...fields,name:fields.name.optional(),description:fields.description.optional(),join_mode:fields.join_mode.optional(),feed_visibility:fields.feed_visibility.optional(),visibility_change_acknowledged:z.literal(true).optional(),state:z.enum(['active','archived']).optional()}).strict();
const visibleClub=(c:Club)=>({id:c.id,name:c.name,description:c.description,rules:c.rules,join_mode:c.join_mode,feed_visibility:c.feed_visibility,avatar_id:c.avatar_id,cover_id:c.cover_id,event_roles:c.event_roles,state:c.state,pinned_post_id:c.pinned_post_id,created_at:c.created_at,updated_at:c.updated_at,version:c.version});
const memberIdentity=(m:any)=>({membership_id:m.id,nickname:m.nickname,avatar_id:m.avatar_id,roles:m.roles,role:m.role,state:m.state,joined_at:m.joined_at,...(m.visibility==='public'?{profile:{id:m.user_id,handle:m.handle,display_name:m.display_name}}:{})});
const rank:Record<ClubRole,number>={owner:4,admin:3,moderator:2,member:1};

export async function registerClubs(app:FastifyInstance):Promise<void> {
  app.get('/api/v1/clubs',async req=>{
    const {search}=parse(z.object({search:z.string().max(100).optional()}),req.query);
    const rows=await query<Club>("SELECT * FROM clubs WHERE state<>'deleted' AND ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR description ILIKE '%'||$1||'%') ORDER BY created_at DESC,id LIMIT 100",[search??null]);
    return {items:rows.map(visibleClub)};
  });
  app.post('/api/v1/clubs',async(req,reply)=>{
    const viewer=requireUser(req),body=parse(createSchema,req.body);
    const key=parse(z.string().min(8).max(128).optional(),req.headers['idempotency-key']);
    const hash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);
      if(key){const saved=await one<{response:unknown;request_hash:string}>("SELECT response,request_hash FROM idempotency_keys WHERE user_id=$1 AND key=$2 AND operation='club_create'",[viewer.id,key],tx);if(saved){if(saved.request_hash!==hash)fail(409,'IDEMPOTENCY_CONFLICT','Этот ключ запроса уже использован для других данных');return saved.response;}}
      await ownershipGate(viewer.id,tx);
      await assertMedia(viewer.id,body.avatar_id,5*1024*1024,tx);await assertMedia(viewer.id,body.cover_id,10*1024*1024,tx);
      const c=(await one<Club>(`INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility,rules,avatar_id,cover_id,event_roles)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,[viewer.id,checkedText(body.name,3,60,'Название клуба'),checkedText(body.description,10,1000,'Описание'),body.join_mode,body.feed_visibility,body.rules??'',body.avatar_id??null,body.cover_id??null,JSON.stringify(body.event_roles??['owner','admin','moderator'])],tx))!;
      const identity=nicknameIdentity(viewer.handle);
      await execute(`INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,joined_at)
        VALUES($1,$2,'owner','active',$3,$4,1,now(),now())`,[c.id,viewer.id,identity.nickname,identity.nickname_key],tx);
      await execute('INSERT INTO club_name_reservations(club_id,nickname_key,user_id) VALUES($1,$2,$3)',[c.id,identity.nickname_key,viewer.id],tx);
      await audit(tx,viewer.id,c.id,'club_create',c.id);
      const result={...visibleClub(c),membership:await membership(viewer.id,c.id,tx)};
      if(key)await execute("INSERT INTO idempotency_keys(user_id,key,operation,response,request_hash) VALUES($1,$2,'club_create',$3::jsonb,$4)",[viewer.id,key,JSON.stringify(result),hash],tx);
      reply.code(201);return result;
    });
  });
  app.get('/api/v1/clubs/:id',async req=>{
    const c=await requireClub(idParam(req));const me=req.viewer?await membership(req.viewer.id,c.id):undefined;
    let owner=await one('SELECT id,handle,display_name FROM users WHERE id=$1 AND visibility=\'public\' AND status=\'active\'',[c.owner_id]);
    if(req.viewer&&await blocked(req.viewer.id,c.owner_id))owner=undefined;
    const transfer=req.viewer?await one<any>("SELECT id,to_id FROM club_transfers WHERE club_id=$1 AND state='pending' AND (to_id=$2 OR from_id=$2) ORDER BY created_at DESC LIMIT 1",[c.id,req.viewer.id]):undefined;
    return {...visibleClub(c),owner,membership:me??null,pending_transfer:transfer?{id:transfer.id,to_user_id:transfer.to_id}:null,incoming_transfer_id:transfer?.to_id===req.viewer?.id?transfer.id:null,permissions:{manage:req.viewer?await canManageClub(req.viewer.id,c.id):false,read_content:await canReadClubContent(req.viewer?.id??null,c.id,c.feed_visibility),owner:me?.state==='active'&&me.role==='owner'}};
  });
  app.patch('/api/v1/clubs/:id',async req=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(updateSchema,req.body);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);const c=await requireClub(id,tx,true);
      // Archived clubs still have an owner, who may reactivate them.
      if(c.owner_id!==viewer.id)fail(403,'CLUB_PERMISSION','Изменять настройки может только владелец клуба');
      if(body.feed_visibility && body.feed_visibility!==c.feed_visibility && !body.visibility_change_acknowledged)fail(422,'VISIBILITY_ACK_REQUIRED','Подтвердите изменение аудитории и правила сохранения закрытой истории');
      await assertMedia(viewer.id,body.avatar_id,5*1024*1024,tx);await assertMedia(viewer.id,body.cover_id,10*1024*1024,tx);
      if(body.feed_visibility==='members_only'&&c.feed_visibility==='public'){
        // Narrow existing object scopes as well: reopening must never expose the closed archive.
        await execute("UPDATE posts SET audience='members_only' WHERE club_id=$1",[id],tx);
        await execute("UPDATE events SET audience='members_only' WHERE club_id=$1",[id],tx);
      }
      const updated=(await one<Club>(`UPDATE clubs SET name=$2,description=$3,join_mode=$4,feed_visibility=$5,rules=$6,avatar_id=$7,cover_id=$8,event_roles=$9::jsonb,state=$10,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *`,[id,body.name===undefined?c.name:checkedText(body.name,3,60,'Название клуба'),body.description===undefined?c.description:checkedText(body.description,10,1000,'Описание'),body.join_mode??c.join_mode,body.feed_visibility??c.feed_visibility,body.rules??c.rules,body.avatar_id===undefined?c.avatar_id:body.avatar_id,body.cover_id===undefined?c.cover_id:body.cover_id,JSON.stringify(body.event_roles??c.event_roles),body.state??c.state],tx))!;
      await audit(tx,viewer.id,id,'club_settings',id,'',{before:{feed_visibility:c.feed_visibility,state:c.state},after:{feed_visibility:updated.feed_visibility,state:updated.state}});
      return visibleClub(updated);
    });
  });
  app.get('/api/v1/clubs/:id/members',async req=>{
    const c=await requireClub(idParam(req)),viewer=req.viewer?.id??null;
    const me=viewer?await membership(viewer,c.id):undefined;
    const insider=me?.state==='active'&&!!me.consented_at&&!me.revoked_at;
    if(c.feed_visibility==='members_only'&&!insider)fail(404,'CLUB_MEMBERS_UNAVAILABLE','Состав клуба недоступен');
    const rows=await query(`SELECT m.*,u.visibility,u.handle,u.display_name FROM club_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.club_id=$1 AND m.state='active' AND m.revoked_at IS NULL AND m.consented_at IS NOT NULL AND u.status='active'
      AND ($2::boolean OR u.visibility='public') AND ($3::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id)))
      ORDER BY m.joined_at,m.id LIMIT 200`,[c.id,!!insider,viewer]);
    return {items:rows.map(memberIdentity)};
  });
  for(const [route,mode] of [['join','open'],['requests','approval']] as const) {
    app.post(`/api/v1/clubs/:id/${route}`,async(req,reply)=>{
      const viewer=requireUser(req),id=idParam(req),body=parse(identitySchema,req.body),identity=nicknameIdentity(body.nickname);
      return transaction(async tx=>{
        await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);
        const initial=await requireClub(id,tx);await lockPair(tx,viewer.id,initial.owner_id);
        const c=await requireClub(id,tx,true);
        if(c.state!=='active')fail(409,'CLUB_ARCHIVED','В архивный клуб нельзя вступить');
        if(c.join_mode!==mode)fail(409,'JOIN_MODE','Используйте выбранный для клуба способ вступления');
        if(await blocked(viewer.id,c.owner_id,tx))fail(403,'INTERACTION_UNAVAILABLE','Взаимодействие недоступно');
        const current=await membership(viewer.id,id,tx);
        if(current && ['pending','active'].includes(current.state))fail(409,'ALREADY_JOINED','Вы уже состоите в клубе или отправили заявку');
        if(current?.state==='rejected' && await one("SELECT id FROM club_memberships WHERE id=$1 AND updated_at>now()-interval '48 hours'",[current.id],tx))fail(429,'JOIN_COOLDOWN','Подождите перед повторной заявкой');
        if(current?.state==='kicked' && await one("SELECT id FROM club_memberships WHERE id=$1 AND updated_at>now()-interval '7 days'",[current.id],tx))fail(429,'JOIN_COOLDOWN','Подождите перед повторной заявкой');
        await assertIdentityAvailable(id,viewer.id,identity.nickname_key,tx);await assertMedia(viewer.id,body.avatar_id,5*1024*1024,tx);
        const state=mode==='open'?'active':'pending';
        const m=(await one<ClubMembership>(`INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,avatar_id,roles,consent_version,consented_at,joined_at)
          VALUES($1,$2,'member',$3,$4,$5,$6,$7::jsonb,1,now(),CASE WHEN $3='active' THEN now() END)
          ON CONFLICT(club_id,user_id) DO UPDATE SET role='member',state=EXCLUDED.state,nickname=EXCLUDED.nickname,nickname_key=EXCLUDED.nickname_key,avatar_id=EXCLUDED.avatar_id,roles=EXCLUDED.roles,consent_version=1,consented_at=now(),revoked_at=NULL,reason=NULL,joined_at=EXCLUDED.joined_at,updated_at=now() RETURNING *`,[id,viewer.id,state,identity.nickname,identity.nickname_key,body.avatar_id??null,JSON.stringify(body.roles)],tx))!;
        await execute('INSERT INTO club_name_reservations(club_id,nickname_key,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,identity.nickname_key,viewer.id],tx);
        await audit(tx,viewer.id,id,mode==='open'?'club_join':'club_join_request',m.id,'',{consent_version:1,history_acknowledged:true});
        reply.code(201);return m;
      });
    });
  }
  app.get('/api/v1/clubs/:id/requests',async req=>{
    const viewer=requireUser(req),id=idParam(req);await requireManager(viewer.id,id,['owner','admin']);
    const rows=await query(`SELECT m.*,u.visibility,u.handle,u.display_name FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND m.state='pending'
      AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocked_id=$2 AND b.blocker_id=u.id)) ORDER BY m.created_at LIMIT 100`,[id,viewer.id]);
    return {items:rows.map(memberIdentity)};
  });
  app.post('/api/v1/clubs/requests/:id/decision',async req=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(z.object({decision:z.enum(['approve','reject']),reason:z.string().max(2000).optional()}).strict(),req.body);
    return transaction(async tx=>{
      const initial=await one<ClubMembership>('SELECT * FROM club_memberships WHERE id=$1',[id],tx);if(!initial)fail(404,'REQUEST_NOT_FOUND','Заявка не найдена');
      await lockUsers(tx,[viewer.id,initial.user_id]);await assertActiveUser(viewer.id,tx);await lockPair(tx,viewer.id,initial.user_id);await requireClub(initial.club_id,tx,true);
      await requireManager(viewer.id,initial.club_id,['owner','admin'],tx);
      const m=await membership(initial.user_id,initial.club_id,tx);
      if(!m || m.state!=='pending' || !m.consented_at || m.revoked_at)fail(409,'REQUEST_NOT_PENDING','Заявка больше не ожидает решения');
      if(await blocked(viewer.id,m.user_id,tx))fail(403,'INTERACTION_UNAVAILABLE','Взаимодействие недоступно');
      const user=await one<{status:string;verified_at:Date|null}>('SELECT status,verified_at FROM users WHERE id=$1',[m.user_id],tx);
      if(!user || user.status!=='active' || !user.verified_at)fail(409,'MEMBERSHIP_UNAVAILABLE','Заявитель больше не соответствует условиям вступления');
      const updated=(await one<ClubMembership>("UPDATE club_memberships SET state=$2,reason=$3,joined_at=CASE WHEN $2='active' THEN now() ELSE joined_at END,revoked_at=CASE WHEN $2='rejected' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING *",[id,body.decision==='approve'?'active':'rejected',body.reason??null],tx))!;
      if(body.decision==='reject')await releaseUnusedNames(m.club_id,m.user_id,tx);
      await audit(tx,viewer.id,m.club_id,'club_request_'+body.decision,id,body.reason??'');await notify(tx,m.user_id,'club_request_decision','club',m.club_id,viewer.id);
      return {membership_id:updated.id,state:updated.state,reason:updated.reason};
    });
  });
  app.patch('/api/v1/clubs/:id/identity',async req=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(identitySchema,req.body),identity=nicknameIdentity(body.nickname);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);await requireClub(id,tx,true);const m=await membership(viewer.id,id,tx);
      if(!m || !['active','pending'].includes(m.state)||m.revoked_at)fail(403,'MEMBERSHIP_REQUIRED','Нужно действующее членство или заявка в этот клуб');
      await assertIdentityAvailable(id,viewer.id,identity.nickname_key,tx);await assertMedia(viewer.id,body.avatar_id,5*1024*1024,tx);
      await execute('INSERT INTO club_name_reservations(club_id,nickname_key,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,identity.nickname_key,viewer.id],tx);
      await audit(tx,viewer.id,id,'club_identity_change',m.id,'',{before:{nickname:m.nickname,avatar_id:m.avatar_id,roles:m.roles},after:{nickname:identity.nickname,avatar_id:body.avatar_id??null,roles:body.roles}});
      const updated=(await one('UPDATE club_memberships SET nickname=$2,nickname_key=$3,avatar_id=$4,roles=$5::jsonb,consent_version=1,consented_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[m.id,identity.nickname,identity.nickname_key,body.avatar_id??null,JSON.stringify(body.roles)],tx))!;
      await releaseUnusedNames(id,viewer.id,tx);return updated;
    });
  });
  for(const route of ['leave','consent/revoke']) {
    app.post(`/api/v1/clubs/:id/${route}`,async req=>{
      const viewer=requireUser(req),id=idParam(req);parse(z.object({history_acknowledged:z.literal(true)}).strict(),req.body);
      return transaction(async tx=>{
        await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);const c=await requireClub(id,tx,true);const m=await membership(viewer.id,id,tx);
        if(c.owner_id===viewer.id)fail(409,'OWNER_CANNOT_LEAVE','Перед выходом или отзывом согласия передайте владение клубом');
        if(!m || !['active','pending'].includes(m.state))return {ok:true};
        await endMembership(tx,viewer.id,m,'left',route==='leave'?'Выход из клуба':'Согласие отозвано');return {ok:true};
      });
    });
  }
  app.patch('/api/v1/clubs/:id/members/:membershipId/role',async req=>{
    const viewer=requireUser(req),id=idParam(req),target=idParam(req,'membershipId'),body=parse(z.object({role:z.enum(['admin','moderator','member'])}).strict(),req.body);
    return transaction(async tx=>{
      const initial=await one<ClubMembership>('SELECT * FROM club_memberships WHERE id=$1 AND club_id=$2',[target,id],tx);if(!initial)fail(404,'MEMBER_NOT_FOUND','Участник не найден');
      await lockUsers(tx,[viewer.id,initial.user_id]);await assertActiveUser(viewer.id,tx);await lockPair(tx,viewer.id,initial.user_id);await requireClub(id,tx,true);const actor=await requireManager(viewer.id,id,['owner','admin'],tx);const m=(await membership(initial.user_id,id,tx))!;
      if(m.state!=='active'||m.revoked_at||!m.consented_at)fail(409,'MEMBER_NOT_ACTIVE','Членство больше не действует');
      if(m.user_id===viewer.id || rank[actor.role]<=rank[m.role] || rank[actor.role]<=rank[body.role])fail(403,'ROLE_HIERARCHY','Нельзя менять собственную, равную или более высокую роль');
      if(await blocked(viewer.id,m.user_id,tx))fail(403,'INTERACTION_UNAVAILABLE','Взаимодействие недоступно');
      await execute('UPDATE club_memberships SET role=$2,updated_at=now() WHERE id=$1',[m.id,body.role],tx);await audit(tx,viewer.id,id,'club_role_change',m.id,'',{before:m.role,after:body.role});return {membership_id:m.id,role:body.role};
    });
  });
  app.post('/api/v1/clubs/:id/members/:membershipId/kick',async req=>{
    const viewer=requireUser(req),id=idParam(req),target=idParam(req,'membershipId'),body=parse(z.object({reason:z.string().trim().min(1).max(2000)}).strict(),req.body);
    return transaction(async tx=>{
      const initial=await one<ClubMembership>('SELECT * FROM club_memberships WHERE id=$1 AND club_id=$2',[target,id],tx);if(!initial)fail(404,'MEMBER_NOT_FOUND','Участник не найден');
      await lockUsers(tx,[viewer.id,initial.user_id]);await assertActiveUser(viewer.id,tx);await requireClub(id,tx,true);const actor=await requireManager(viewer.id,id,['owner','admin'],tx),m=(await membership(initial.user_id,id,tx))!;
      if(m.state!=='active')fail(409,'MEMBER_NOT_ACTIVE','Членство больше не действует');
      if(rank[actor.role]<=rank[m.role])fail(403,'ROLE_HIERARCHY','Нельзя исключать участника с равной или более высокой ролью');
      // Kicking is a management action and is permitted despite a personal block.
      await endMembership(tx,viewer.id,m,'kicked',body.reason);return {ok:true};
    });
  });
  app.post('/api/v1/clubs/:id/transfers',async(req,reply)=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(z.object({to_user_id:uuid}).strict(),req.body);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id,body.to_user_id]);await assertActiveUser(viewer.id,tx);await lockPair(tx,viewer.id,body.to_user_id);const c=await requireClub(id,tx,true);
      if(c.owner_id!==viewer.id)fail(403,'CLUB_PERMISSION','Передать владение может только владелец клуба');
      if(body.to_user_id===viewer.id)fail(422,'INVALID_TARGET','Выберите другого участника клуба');
      const m=await membership(body.to_user_id,id,tx);
      if(!m||m.state!=='active'||m.revoked_at||!m.consented_at)fail(409,'MEMBER_NOT_ACTIVE','Будущий владелец должен состоять в клубе');
      if(await blocked(viewer.id,body.to_user_id,tx))fail(403,'INTERACTION_UNAVAILABLE','Взаимодействие недоступно');
      await ownershipGate(body.to_user_id,tx);
      await execute("UPDATE club_transfers SET state='cancelled' WHERE club_id=$1 AND state='pending'",[id],tx);
      const transfer=(await one("INSERT INTO club_transfers(club_id,from_id,to_id) VALUES($1,$2,$3) RETURNING *",[id,viewer.id,body.to_user_id],tx))!;
      await audit(tx,viewer.id,id,'club_transfer_initiate',(transfer as any).id);await notify(tx,body.to_user_id,'club_transfer_requested','club',id,viewer.id);reply.code(201);return transfer;
    });
  });
  app.post('/api/v1/clubs/transfers/:id/accept',async req=>{
    const viewer=requireUser(req),id=idParam(req);
    return transaction(async tx=>{
      const initial=await one<any>('SELECT * FROM club_transfers WHERE id=$1',[id],tx);if(!initial||initial.to_id!==viewer.id)fail(404,'TRANSFER_NOT_FOUND','Передача владения не найдена');
      await lockUsers(tx,[initial.from_id,viewer.id]);await assertActiveUser(viewer.id,tx);await lockPair(tx,initial.from_id,viewer.id);const c=await requireClub(initial.club_id,tx,true);
      const transfer=await one<any>('SELECT * FROM club_transfers WHERE id=$1 FOR UPDATE',[id],tx);
      if(transfer.state!=='pending'||c.owner_id!==transfer.from_id)fail(409,'TRANSFER_UNAVAILABLE','Передача владения больше не ожидает принятия');
      if(await blocked(viewer.id,transfer.from_id,tx))fail(403,'INTERACTION_UNAVAILABLE','Взаимодействие недоступно');
      const m=await membership(viewer.id,c.id,tx);if(!m||m.state!=='active'||m.revoked_at||!m.consented_at)fail(409,'MEMBER_NOT_ACTIVE','Нужны действующее членство и клубное согласие');
      await ownershipGate(viewer.id,tx);
      await execute("UPDATE club_memberships SET role=CASE WHEN user_id=$2 THEN 'owner' ELSE 'admin' END,updated_at=now() WHERE club_id=$1 AND user_id IN ($2,$3)",[c.id,viewer.id,transfer.from_id],tx);
      await execute('UPDATE clubs SET owner_id=$2,version=version+1,updated_at=now() WHERE id=$1',[c.id,viewer.id],tx);
      await execute("UPDATE club_transfers SET state=CASE WHEN id=$2 THEN 'accepted' ELSE 'cancelled' END WHERE club_id=$1 AND state='pending'",[c.id,id],tx);
      await audit(tx,viewer.id,c.id,'club_transfer_accept',id,'',{from_id:transfer.from_id});await notify(tx,transfer.from_id,'club_transfer_accepted','club',c.id,viewer.id);return {ok:true,club_id:c.id};
    });
  });
  app.get('/api/v1/clubs/:id/audit',async req=>{
    const viewer=requireUser(req),id=idParam(req);await requireManager(viewer.id,id);
    return {items:await query('SELECT id,action,target_id,reason,metadata,created_at FROM audit_actions WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[id])};
  });
}
