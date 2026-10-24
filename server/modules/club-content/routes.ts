import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { query, one, execute, transaction, lockUsers } from '../../db/index.js';
import { requireUser, fail, idParam, parse, notify } from '../../lib.js';
import { blocked, canReadPost } from '../policy/service.js';
import { postDTO, lockPairs, authorDTO } from '../social/service.js';
import { eventRow, canReadEvent, eventDTO } from '../events/service.js';
import { membership, requireClub, requireManager, assertMedia, audit, assertActiveUser } from '../clubs/service.js';

const contentSchema=z.object({body:z.string().trim().min(1).refine(value=>Array.from(value).length<=5000,'Не более 5000 символов'),images:z.array(z.string().uuid()).max(4).refine(ids=>new Set(ids).size===ids.length,'Изображения не должны повторяться').default([]),tags:z.array(z.string().trim().min(1).max(32)).max(10).default([])}).strict();
interface Post {id:string;author_id:string;club_id:string;state:string;audience:string;current_revision_id:string|null;created_at:Date;updated_at:Date}
async function eligibleAuthor(userId:string,clubId:string,tx:PoolClient):Promise<void> {
  const user=await one("SELECT id FROM users WHERE id=$1 AND visibility='public' AND status='active' AND verified_at IS NOT NULL",[userId],tx);
  const m=await membership(userId,clubId,tx);
  if(!user)fail(403,'PUBLIC_AUTHOR_REQUIRED','Для клубной публикации нужен действующий публичный профиль с подтверждённой почтой');
  if(!m||m.state!=='active'||m.revoked_at||!m.consented_at)fail(403,'MEMBERSHIP_REQUIRED','Нужны действующее членство и клубное согласие');
  if(await one("SELECT id FROM sanctions WHERE user_id=$1 AND kind='suspension' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",[userId],tx))fail(403,'ACCOUNT_RESTRICTED','Действия аккаунта ограничены');
}
async function publicPost(postId:string,viewerId:string|null,tx?:PoolClient):Promise<any|undefined> {
  const dto=await postDTO(postId,viewerId,tx);
  return dto?{...dto,can_edit:viewerId===dto.author_id}:undefined;
}
async function mentions(tx:PoolClient,postId:string,actorId:string,clubId:string,body:string):Promise<void> {
  await execute('DELETE FROM mentions WHERE post_id=$1',[postId],tx);
  const handles=[...new Set([...body.matchAll(/(?:^|\s)@([a-z0-9_]{3,32})\b/g)].map(m=>m[1]))];
  if(!handles.length)return;
  const users=await query<{id:string}>(`SELECT u.id FROM users u JOIN club_memberships m ON m.user_id=u.id WHERE u.handle=ANY($1::text[]) AND u.visibility='public' AND u.status='active'
    AND m.club_id=$2 AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL`,[handles,clubId],tx);
  await lockPairs(tx,users.map(user=>[actorId,user.id]));
  for(const user of users) {
    if(user.id===actorId)continue;
    if(await blocked(actorId,user.id,tx))continue;
    await execute('INSERT INTO mentions(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[postId,user.id],tx);
    await notify(tx,user.id,'mention','post',postId,actorId);
  }
}
export async function registerClubContent(app:FastifyInstance):Promise<void> {
  app.delete('/api/v1/clubs/comments/:id',async req=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(z.object({reason:z.string().trim().min(5).max(2000)}).strict(),req.body);
    return transaction(async tx=>{
      const initial=await one<{author_id:string|null;club_id:string}>("SELECT c.author_id,p.club_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=$1 AND p.club_id IS NOT NULL AND c.state='published'",[id],tx);
      if(!initial)fail(404,'not_found','Комментарий не найден.');
      await lockUsers(tx,[viewer.id,...(initial.author_id?[initial.author_id]:[])]);await assertActiveUser(viewer.id,tx);
      const club=await requireClub(initial.club_id,tx,true);if(club.state!=='active')fail(409,'club_archived','Клуб находится в архиве.');
      await requireManager(viewer.id,initial.club_id,undefined,tx);
      const changed=await one("UPDATE comments SET state='removed',updated_at=now() WHERE id=$1 AND state='published' RETURNING id",[id],tx);
      if(!changed)fail(409,'conflict','Комментарий уже изменён.');
      await audit(tx,viewer.id,initial.club_id,'club_comment_remove',id,body.reason);return {ok:true};
    });
  });
  const reportScope=`((r.target_type='post' AND EXISTS(SELECT 1 FROM posts p WHERE p.id=r.target_id AND p.club_id=$1)) OR (r.target_type='comment' AND EXISTS(SELECT 1 FROM comments x JOIN posts p ON p.id=x.post_id WHERE x.id=r.target_id AND p.club_id=$1)) OR (r.target_type='event' AND EXISTS(SELECT 1 FROM events e WHERE e.id=r.target_id AND e.club_id=$1)))`;
  app.get('/api/v1/clubs/:id/reports',async req=>{
    const viewer=requireUser(req),id=idParam(req);await requireManager(viewer.id,id);
    return {items:await query(`SELECT r.id,r.target_type,r.target_id,r.reason,r.state,r.created_at,r.updated_at FROM reports r WHERE ${reportScope} ORDER BY r.created_at DESC,r.id LIMIT 100`,[id])};
  });
  app.patch('/api/v1/clubs/:id/reports/:reportId',async req=>{
    const viewer=requireUser(req),id=idParam(req),reportId=idParam(req,'reportId');
    const body=parse(z.object({state:z.enum(['reviewing','resolved','dismissed']),reason:z.string().trim().min(5).max(2000)}).strict(),req.body);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);const club=await requireClub(id,tx,true);if(club.state!=='active')fail(409,'club_archived','Клуб находится в архиве.');await requireManager(viewer.id,id,undefined,tx);
      const report=await one(`UPDATE reports r SET state=$3,updated_at=now() WHERE r.id=$2 AND ${reportScope} RETURNING r.id`,[id,reportId,body.state],tx);
      if(!report)fail(404,'not_found','Жалоба не найдена.');
      await audit(tx,viewer.id,id,'club_report_'+body.state,reportId,body.reason);return {ok:true};
    });
  });

  app.get('/api/v1/clubs/:id/my-posts',async req=>{
    const viewer=requireUser(req),id=idParam(req);await requireClub(id);
    const rows=await query<any>(`SELECT p.*,r.id AS revision_id,r.status AS revision_status,r.body,r.images,r.tags,r.reason FROM posts p
      JOIN LATERAL (SELECT * FROM post_revisions x WHERE x.post_id=p.id ORDER BY (x.status='pending') DESC,x.created_at DESC,x.id DESC LIMIT 1) r ON true
      WHERE p.club_id=$1 AND p.author_id=$2 AND p.state<>'removed' ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,[id,viewer.id]);
    const author=await authorDTO(viewer.id,viewer.id);
    return {items:rows.map(p=>({...p,author,images:p.images.map((id:string)=>({id,url:`/api/v1/media/${id}`})),can_edit:true}))};
  });
  app.get('/api/v1/clubs/posts/:id/edit',async req=>{
    const viewer=requireUser(req),id=idParam(req);
    const post=await one<any>(`SELECT p.*,r.id AS revision_id,r.status AS revision_status,r.body,r.images,r.tags,r.reason FROM posts p
      JOIN LATERAL (SELECT * FROM post_revisions x WHERE x.post_id=p.id ORDER BY (x.status='pending') DESC,x.created_at DESC,x.id DESC LIMIT 1) r ON true
      WHERE p.id=$1 AND p.author_id=$2 AND p.club_id IS NOT NULL AND p.state<>'removed'`,[id,viewer.id]);
    if(!post)fail(404,'POST_NOT_FOUND','Публикация не найдена');return {...post,author:await authorDTO(viewer.id,viewer.id),images:post.images.map((id:string)=>({id,url:`/api/v1/media/${id}`})),can_edit:true};
  });
  app.get('/api/v1/clubs/:id/posts',async req=>{
    const id=idParam(req);await requireClub(id);const viewer=req.viewer?.id??null;
    const rows=await query<{id:string}>("SELECT id FROM posts WHERE club_id=$1 AND state='published' ORDER BY created_at DESC,id DESC LIMIT 100",[id]);
    const items=[];for(const row of rows){const post=await publicPost(row.id,viewer);if(post)items.push(post);}return {items};
  });
  app.get('/api/v1/clubs/:id/feed',async req=>{
    const id=idParam(req);const c=await requireClub(id),viewer=req.viewer?.id??null;
    const rows=await query<{id:string}>("SELECT id FROM posts WHERE club_id=$1 AND state='published' ORDER BY created_at DESC,id DESC LIMIT 100",[id]);
    const items:any[]=[];for(const row of rows){const p=await publicPost(row.id,viewer);if(p)items.push({kind:'post',...p,pinned:p.id===c.pinned_post_id});}
    const events=await query<{id:string}>("SELECT id FROM events WHERE club_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",[id]);
    for(const event of events){const row=await eventRow(event.id);if(row&&await canReadEvent(row,viewer))items.push({kind:'event',...await eventDTO(row,viewer)});}
    items.sort((a,b)=>Number(b.pinned??false)-Number(a.pinned??false)||new Date(b.created_at).getTime()-new Date(a.created_at).getTime()||b.id.localeCompare(a.id));return {items:items.slice(0,100)};
  });
  app.post('/api/v1/clubs/:id/posts',async(req,reply)=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(contentSchema,req.body);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);const c=await requireClub(id,tx,true);if(c.state!=='active')fail(409,'CLUB_ARCHIVED','В архивном клубе нельзя публиковать записи');
      await eligibleAuthor(viewer.id,id,tx);for(const image of body.images)await assertMedia(viewer.id,image,10*1024*1024,tx);
      const post=(await one<Post>("INSERT INTO posts(author_id,club_id,state,audience) VALUES($1,$2,'pending',$3) RETURNING *",[viewer.id,id,c.feed_visibility],tx))!;
      const revision=(await one("INSERT INTO post_revisions(post_id,body,images,tags) VALUES($1,$2,$3::jsonb,$4::jsonb) RETURNING *",[post.id,body.body,JSON.stringify(body.images),JSON.stringify(body.tags)],tx))!;
      await audit(tx,viewer.id,id,'club_post_submit',post.id);reply.code(201);return {...post,revision};
    });
  });
  app.patch('/api/v1/clubs/posts/:id',async req=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(contentSchema,req.body);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);const initial=await one<Post>('SELECT * FROM posts WHERE id=$1 AND club_id IS NOT NULL',[id],tx);if(!initial||initial.author_id!==viewer.id)fail(404,'POST_NOT_FOUND','Публикация не найдена');
      const c=await requireClub(initial.club_id,tx,true);if(c.state!=='active')fail(409,'CLUB_ARCHIVED','В архивном клубе нельзя редактировать записи');
      const p=(await one<Post>('SELECT * FROM posts WHERE id=$1 FOR UPDATE',[id],tx))!;if(p.state==='removed')fail(404,'POST_NOT_FOUND','Публикация не найдена');
      await eligibleAuthor(viewer.id,p.club_id,tx);for(const image of body.images)await assertMedia(viewer.id,image,10*1024*1024,tx);
      await execute("UPDATE post_revisions SET status='rejected',reason='Заменена новой отправленной редакцией',reviewed_at=now() WHERE post_id=$1 AND status='pending'",[id],tx);
      const revision=(await one("INSERT INTO post_revisions(post_id,body,images,tags) VALUES($1,$2,$3::jsonb,$4::jsonb) RETURNING *",[id,body.body,JSON.stringify(body.images),JSON.stringify(body.tags)],tx))!;
      if(!p.current_revision_id)await execute("UPDATE posts SET state='pending',updated_at=now() WHERE id=$1",[id],tx);
      await audit(tx,viewer.id,p.club_id,'club_post_revision_submit',id);return {post_id:id,state:p.current_revision_id?'published':'pending',current_revision_id:p.current_revision_id,revision};
    });
  });
  app.get('/api/v1/clubs/:id/moderation',async req=>{
    const viewer=requireUser(req),id=idParam(req);await requireManager(viewer.id,id);
    const rows=await query(`SELECT r.id AS revision_id,r.post_id,r.body,r.images,r.tags,r.created_at,p.state,p.current_revision_id,p.audience,
      jsonb_build_object('nickname',m.nickname,'avatar_id',m.avatar_id,'roles',m.roles,'membership_id',m.id) AS author,
      (p.author_id=$2) AS is_own FROM post_revisions r JOIN posts p ON p.id=r.post_id JOIN club_memberships m ON m.club_id=p.club_id AND m.user_id=p.author_id JOIN users u ON u.id=p.author_id
      WHERE m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active' AND u.visibility='public' AND p.club_id=$1 AND r.status='pending' AND p.state IN ('pending','published') ORDER BY r.created_at,r.id LIMIT 100`,[id,viewer.id]);
    return {items:rows};
  });
  app.post('/api/v1/clubs/posts/:id/revisions/:rid/decision',async req=>{
    const viewer=requireUser(req),id=idParam(req),rid=idParam(req,'rid'),body=parse(z.object({decision:z.enum(['approve','reject']),reason:z.string().trim().max(2000).optional()}).strict(),req.body);
    return transaction(async tx=>{
      const initial=await one<Post>('SELECT * FROM posts WHERE id=$1 AND club_id IS NOT NULL',[id],tx);if(!initial)fail(404,'POST_NOT_FOUND','Публикация не найдена');
      const potentialReviewers=viewer.id===initial.author_id?await query<{user_id:string}>("SELECT user_id FROM club_memberships WHERE club_id=$1 AND role IN ('owner','admin','moderator') AND state='active'",[initial.club_id],tx):[];
      await lockUsers(tx,[viewer.id,initial.author_id,...potentialReviewers.map(m=>m.user_id)]);await assertActiveUser(viewer.id,tx);await requireClub(initial.club_id,tx,true);
      const reviewer=await requireManager(viewer.id,initial.club_id,undefined,tx);
      const p=(await one<Post>('SELECT * FROM posts WHERE id=$1 FOR UPDATE',[id],tx))!;
      if(p.state==='removed')fail(404,'POST_NOT_FOUND','Публикация не найдена');
      const revision=await one<any>('SELECT * FROM post_revisions WHERE id=$1 AND post_id=$2 FOR UPDATE',[rid,id],tx);
      if(!revision)fail(404,'REVISION_NOT_FOUND','Редакция не найдена');if(revision.status!=='pending')fail(409,'REVISION_DECIDED','Редакция больше не ожидает проверки');
      if(viewer.id===p.author_id) {
        if(reviewer.role!=='owner')fail(403,'SELF_REVIEW_FORBIDDEN','Администраторы и модераторы не могут проверять собственные публикации');
        const other=await one(`SELECT m.id FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND m.user_id<>$2 AND m.role IN ('owner','admin','moderator')
          AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active' AND u.verified_at IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM sanctions s WHERE s.user_id=u.id AND s.kind='suspension' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()))
          LIMIT 1`,[p.club_id,viewer.id],tx);
        if(other)fail(403,'INDEPENDENT_REVIEW_REQUIRED','Публикацию должен проверить другой доступный руководитель клуба');
        if(!body.reason)fail(422,'REVIEW_REASON_REQUIRED','Укажите причину самостоятельной проверки для журнала действий');
      }
      if(body.decision==='approve') {
        await eligibleAuthor(p.author_id,p.club_id,tx);
        for(const image of revision.images)await assertMedia(p.author_id,image,10*1024*1024,tx);
        await execute("UPDATE post_revisions SET status='approved',reviewer_id=$2,reason=$3,reviewed_at=now() WHERE id=$1",[rid,viewer.id,body.reason??null],tx);
        await execute("UPDATE posts SET current_revision_id=$2,state='published',updated_at=now() WHERE id=$1",[id,rid],tx);
        await mentions(tx,id,p.author_id,p.club_id,revision.body);
      } else {
        await execute("UPDATE post_revisions SET status='rejected',reviewer_id=$2,reason=$3,reviewed_at=now() WHERE id=$1",[rid,viewer.id,body.reason??null],tx);
        if(!p.current_revision_id)await execute("UPDATE posts SET state='rejected',updated_at=now() WHERE id=$1",[id],tx);
      }
      await audit(tx,viewer.id,p.club_id,'club_post_'+body.decision,rid,body.reason??'',{post_id:id,self_review:viewer.id===p.author_id});
      if(viewer.id!==p.author_id)await notify(tx,p.author_id,'club_post_decision','post',id,viewer.id);
      return {post_id:id,revision_id:rid,status:body.decision==='approve'?'approved':'rejected',state:body.decision==='approve'||p.current_revision_id?'published':'rejected'};
    });
  });
  app.delete('/api/v1/clubs/posts/:id',async req=>{
    const viewer=requireUser(req),id=idParam(req);
    return transaction(async tx=>{
      const initial=await one<Post>('SELECT * FROM posts WHERE id=$1 AND club_id IS NOT NULL',[id],tx);if(!initial)fail(404,'POST_NOT_FOUND','Публикация не найдена');
      await lockUsers(tx,[viewer.id,initial.author_id]);await assertActiveUser(viewer.id,tx);await requireClub(initial.club_id,tx,true);
      if(viewer.id!==initial.author_id)await requireManager(viewer.id,initial.club_id,undefined,tx);
      await execute("UPDATE posts SET state='removed',updated_at=now() WHERE id=$1",[id],tx);
      await execute('UPDATE clubs SET pinned_post_id=NULL WHERE id=$1 AND pinned_post_id=$2',[initial.club_id,id],tx);await audit(tx,viewer.id,initial.club_id,'club_post_remove',id);return {ok:true};
    });
  });
  app.post('/api/v1/clubs/:id/pin',async req=>{
    const viewer=requireUser(req),id=idParam(req),body=parse(z.object({post_id:z.string().uuid().nullable()}).strict(),req.body);
    return transaction(async tx=>{
      await lockUsers(tx,[viewer.id]);await assertActiveUser(viewer.id,tx);await requireClub(id,tx,true);await requireManager(viewer.id,id,undefined,tx);
      if(body.post_id) {
        const post=await one<Post>("SELECT * FROM posts WHERE id=$1 AND club_id=$2 AND state='published'",[body.post_id,id],tx);
        if(!post||!await canReadPost(viewer.id,post.id,tx))fail(404,'POST_NOT_FOUND','Нужна одобренная и доступная клубная публикация');
      }
      await execute('UPDATE clubs SET pinned_post_id=$2,version=version+1,updated_at=now() WHERE id=$1',[id,body.post_id],tx);await audit(tx,viewer.id,id,'club_pin',body.post_id);return {ok:true,pinned_post_id:body.post_id};
    });
  });
}
