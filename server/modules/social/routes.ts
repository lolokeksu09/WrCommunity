import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { query, one, execute, transaction, lockUsers, lockPair } from '../../db/index.js';
import { requireUser, fail, idParam, parse, notify } from '../../lib.js';
import { blocked, canReadPost, canReadProfile } from '../policy/service.js';
import { assertOwnedMedia } from '../media/service.js';
import { postDTO, visibleComments, authorDTO, lockPairs, countVisibleFollows } from './service.js';
import type { PoolClient } from 'pg';

const text=z.string().refine(v=>Array.from(v).length<=5000,'Максимум 5000 символов');
const postInput=z.object({body:text.optional(),images:z.array(z.string().uuid()).max(4).optional(),tags:z.array(z.string().trim().min(1).max(32)).max(10).optional(),state:z.enum(['draft','published']).optional()}).strict();
const commentInput=z.object({body:text.refine(v=>v.trim().length>0,'Введите текст'),parent_id:z.string().uuid().optional()}).strict();
const listInput=z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(300).optional()});
function cursorFor(row:{created_at:Date|string;id:string}){return Buffer.from(JSON.stringify([typeof row.created_at==='string'?row.created_at:new Date(row.created_at).toISOString(),row.id])).toString('base64url');}
function cursorFrom(value:string|undefined):[string,string]|null{
 if(!value)return null;
 try{return parse(z.tuple([z.string().datetime(),z.string().uuid()]),JSON.parse(Buffer.from(value,'base64url').toString()));}catch{fail(422,'invalid_cursor','Некорректный курсор');}
}
const acl=`u.status='active' AND (u.visibility='public' OR p.author_id=$1) AND (p.state='published' OR (p.author_id=$1 AND p.state IN ('draft','pending','rejected'))) AND (p.state<>'published' OR r.status='approved') AND ($1::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=p.author_id) OR (b.blocked_id=$1 AND b.blocker_id=p.author_id))) AND (p.club_id IS NULL OR (c.state<>'deleted' AND ((p.audience='public' AND c.feed_visibility='public') OR EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=p.club_id AND m.user_id=$1 AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL))))`;
const joins=`FROM posts p JOIN users u ON u.id=p.author_id JOIN post_revisions r ON r.id=p.current_revision_id LEFT JOIN clubs c ON c.id=p.club_id`;
async function postPage(request:FastifyRequest,extra:string,values:unknown[]){
 const input=parse(listInput,request.query);const cursor=cursorFrom(input.cursor);
 const params:unknown[]=[request.viewer?.id||null,...values];
 let condition=`${acl} AND (${extra})`;
 if(cursor){params.push(...cursor);condition+=` AND (p.created_at,p.id)<($${params.length-1}::timestamptz,$${params.length}::uuid)`;}
 params.push(input.limit+1);
 const rows=await query<{id:string;created_at:string}>(`SELECT p.id,to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') created_at ${joins} WHERE ${condition} ORDER BY p.created_at DESC,p.id DESC LIMIT $${params.length}`,params);
 const visible=rows.slice(0,input.limit);const items=[];
 for(const row of visible){const dto=await postDTO(row.id,request.viewer?.id||null);if(dto)items.push(dto);}
 return {items,nextCursor:rows.length>input.limit&&visible.length?cursorFor(visible.at(-1)!):null};
}
async function activeActor(tx:PoolClient,userId:string){
 const actor=await one<{visibility:string}>("SELECT visibility FROM users WHERE id=$1 AND status='active' AND verified_at IS NOT NULL",[userId],tx);
 if(!actor)fail(403,'account_unavailable','Подтвердите адрес электронной почты и проверьте доступ к аккаунту');
 return actor;
}
async function ownOrdinary(tx:PoolClient,id:string,userId:string){
 const p=await one<any>('SELECT * FROM posts WHERE id=$1 FOR UPDATE',[id],tx);
 if(!p||p.author_id!==userId||p.club_id||p.state==='removed')fail(404,'not_found','Публикация не найдена');
 return p;
}
async function mentionsIn(body:string,authorId:string,tx:PoolClient){
 const handles=[...new Set([...body.matchAll(/(?:^|[^\p{L}\p{N}_])@([a-z0-9_]{3,32})(?![a-z0-9_])/gu)].map(m=>m[1]))];
 if(!handles.length)return [];
 return query<{id:string}>('SELECT id FROM users WHERE handle=ANY($1::text[]) AND status=\'active\' AND visibility=\'public\' AND id<>$2',[handles,authorId],tx);
}
async function saveMentions(tx:PoolClient,postId:string,authorId:string,targets:Array<{id:string}>){
 await lockPairs(tx,targets.map(t=>[authorId,t.id]));
 const previous=await query<{user_id:string}>('SELECT user_id FROM mentions WHERE post_id=$1',[postId],tx);
 await execute('DELETE FROM mentions WHERE post_id=$1',[postId],tx);
 for(const t of targets){
  if(await blocked(authorId,t.id,tx)||!await canReadPost(t.id,postId,tx))continue;
  await execute('INSERT INTO mentions(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[postId,t.id],tx);
  if(!previous.some(p=>p.user_id===t.id))await notify(tx,t.id,'mention','post',postId,authorId);
 }
}
async function createBlock(tx:PoolClient,actorId:string,targetId:string){
   await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[actorId,targetId],tx);
   await execute('DELETE FROM follows WHERE (follower_id=$1 AND followee_id=$2) OR (follower_id=$2 AND followee_id=$1)',[actorId,targetId],tx);
   await execute('DELETE FROM reactions r USING posts p WHERE p.id=r.post_id AND ((r.user_id=$1 AND p.author_id=$2) OR (r.user_id=$2 AND p.author_id=$1))',[actorId,targetId],tx);
   await execute('DELETE FROM notifications WHERE (recipient_id=$1 AND actor_id=$2) OR (recipient_id=$2 AND actor_id=$1)',[actorId,targetId],tx);
   await execute("DELETE FROM outbox WHERE type='notification' AND completed_at IS NULL AND ((payload->>'recipient'=$1 AND payload->>'actorId'=$2) OR (payload->>'recipient'=$2 AND payload->>'actorId'=$1))",[actorId,targetId],tx);
   await execute('DELETE FROM mentions m USING posts p WHERE p.id=m.post_id AND ((m.user_id=$1 AND p.author_id=$2) OR (m.user_id=$2 AND p.author_id=$1))',[actorId,targetId],tx);
}
export async function registerSocial(app:FastifyInstance):Promise<void>{
 app.get('/api/v1/feed',async request=>{
  const q=parse(z.object({mode:z.enum(['all','following']).default('all'),tag:z.string().max(32).optional()}),request.query);
  const viewer=q.mode==='following'?requireUser(request,false):request.viewer;
  const extra=[`p.state='published'`,`u.visibility='public'`,`(p.club_id IS NULL OR (p.audience='public' AND c.feed_visibility='public'))`];const args:unknown[]=[];
  if(q.mode==='following'){args.push(viewer!.id);extra.push(`EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$2 AND f.followee_id=p.author_id)`);}
  if(q.tag){args.push(q.tag.toLocaleLowerCase('ru'));extra.push(`r.tags ? $${args.length+1}`);}
  return postPage(request,extra.join(' AND '),args);
 });
 app.get('/api/v1/posts',async request=>{
  const q=parse(z.object({authorId:z.string().uuid().optional(),state:z.enum(['published','draft']).default('published')}),request.query);
  const author=q.authorId||requireUser(request,false).id;
  if(q.state==='draft'&&request.viewer?.id!==author)fail(404,'not_found','Публикации не найдены');
  if(!await canReadProfile(request.viewer?.id||null,author))fail(404,'not_found','Профиль не найден');
  return postPage(request,`p.author_id=$2 AND p.state=$3`,[author,q.state]);
 });
 app.get('/api/v1/posts/:id',async request=>{
  const result=await postDTO(idParam(request),request.viewer?.id||null);if(!result)fail(404,'not_found','Публикация не найдена');return result;
 });
 app.post('/api/v1/posts',async request=>{
  const user=requireUser(request);const input=parse(postInput,request.body);
  if(!(input.body||'').trim()&&!input.images?.length)fail(422,'empty_post','Добавьте текст или изображение');
  const id=await transaction(async tx=>{
   const mentionTargets=await mentionsIn(input.body||'',user.id,tx);
   await lockUsers(tx,[user.id,...mentionTargets.map(t=>t.id)]);const actor=await activeActor(tx,user.id);await assertOwnedMedia(user.id,input.images||[],tx);
   const post=await one<{id:string}>('INSERT INTO posts(author_id,state) VALUES($1,$2) RETURNING id',[user.id,input.state||'published'],tx);
   const revision=await one<{id:string}>('INSERT INTO post_revisions(post_id,body,images,tags,status,reviewed_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5=\'approved\' THEN now() ELSE NULL END) RETURNING id',[post!.id,input.body||'',JSON.stringify(input.images||[]),JSON.stringify([...new Set((input.tags||[]).map(t=>t.toLocaleLowerCase('ru')))]),input.state==='draft'?'draft':'approved'],tx);
   await execute('UPDATE posts SET current_revision_id=$2 WHERE id=$1',[post!.id,revision!.id],tx);
   if(input.state!=='draft')await saveMentions(tx,post!.id,user.id,mentionTargets);
   return post!.id;
  });return postDTO(id,user.id);
 });
 app.patch('/api/v1/posts/:id',async request=>{
  const user=requireUser(request);const id=idParam(request);const input=parse(postInput,request.body);
  await transaction(async tx=>{
   const before=await one<any>('SELECT p.*,r.body FROM posts p JOIN post_revisions r ON r.id=p.current_revision_id WHERE p.id=$1',[id],tx);
   if(!before||before.author_id!==user.id||before.club_id||before.state==='removed')fail(404,'not_found','Публикация не найдена');
   const mentionTargets=await mentionsIn(input.body??before.body,user.id,tx);
   await lockUsers(tx,[user.id,...mentionTargets.map(t=>t.id)]);const actor=await activeActor(tx,user.id);const p=await ownOrdinary(tx,id,user.id);
   if(p.current_revision_id!==before.current_revision_id)fail(409,'post_changed','Публикация изменилась. Повторите правку.');
   const old=await one<any>('SELECT * FROM post_revisions WHERE id=$1',[p.current_revision_id],tx);
   const body=input.body??old.body,images=input.images??old.images,tags=[...new Set((input.tags??old.tags).map((t:string)=>t.toLocaleLowerCase('ru')))];
   if(!body.trim()&&!images.length)fail(422,'empty_post','Добавьте текст или изображение');
   await assertOwnedMedia(user.id,images,tx);const state=input.state??p.state;
   const r=await one<{id:string}>('INSERT INTO post_revisions(post_id,body,images,tags,status,reviewed_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5=\'approved\' THEN now() ELSE NULL END) RETURNING id',[id,body,JSON.stringify(images),JSON.stringify(tags),state==='draft'?'draft':'approved'],tx);
   await execute('UPDATE posts SET state=$2,current_revision_id=$3,updated_at=now() WHERE id=$1',[id,state,r!.id],tx);
   if(state==='published')await saveMentions(tx,id,user.id,mentionTargets);else await execute('DELETE FROM mentions WHERE post_id=$1',[id],tx);
  });return postDTO(id,user.id);
 });
 app.delete('/api/v1/posts/:id',async request=>{
  const user=requireUser(request);const id=idParam(request);await transaction(async tx=>{await lockUsers(tx,[user.id]);const actor=await activeActor(tx,user.id);await ownOrdinary(tx,id,user.id);await execute('UPDATE posts SET state=\'removed\',updated_at=now() WHERE id=$1',[id],tx);await execute('DELETE FROM mentions WHERE post_id=$1',[id],tx);});return {ok:true};
 });
 app.get('/api/v1/posts/:id/revisions',async request=>{
  const user=requireUser(request,false);const id=idParam(request);const p=await one<any>('SELECT * FROM posts WHERE id=$1',[id]);if(!p||p.author_id!==user.id||p.club_id||p.state==='removed')fail(404,'not_found','Публикация не найдена');
  return {items:await query('SELECT id,post_id,body,images,tags,status,created_at FROM post_revisions WHERE post_id=$1 ORDER BY created_at DESC,id DESC',[id])};
 });
 app.get('/api/v1/posts/:id/comments',async request=>{
  const id=idParam(request);if(!await canReadPost(request.viewer?.id||null,id))fail(404,'not_found','Публикация не найдена');
  const input=parse(listInput,request.query);const cursor=cursorFrom(input.cursor);const rows=await visibleComments(id,request.viewer?.id||null,undefined,{limit:input.limit+1,cursor});
  const items=rows.slice(0,input.limit);return {items,nextCursor:rows.length>input.limit?cursorFor(items.at(-1)!):null};
 });
 app.post('/api/v1/posts/:id/comments',async request=>{
  const user=requireUser(request);const postId=idParam(request);const input=parse(commentInput,request.body);
  const commentId=await transaction(async tx=>{
   const p=await one<any>('SELECT p.*,c.state club_state,c.feed_visibility FROM posts p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.id=$1',[postId],tx);
   if(!p||p.state!=='published')fail(404,'not_found','Публикация не найдена');
   const ancestors=input.parent_id?await query<any>(`WITH RECURSIVE chain AS(SELECT id,parent_id,author_id,post_id,state FROM comments WHERE id=$1 UNION ALL SELECT c.id,c.parent_id,c.author_id,c.post_id,c.state FROM comments c JOIN chain x ON c.id=x.parent_id) SELECT * FROM chain`,[input.parent_id],tx):[];
   await lockUsers(tx,[user.id,p.author_id,...ancestors.filter(a=>a.author_id).map(a=>a.author_id)]);const actor=await activeActor(tx,user.id);
   await lockPairs(tx,[[user.id,p.author_id],...ancestors.filter(a=>a.author_id).map(a=>[user.id,a.author_id] as [string,string])]);
   if(!await canReadPost(user.id,postId,tx))fail(404,'not_found','Публикация не найдена');
   if(input.parent_id&&(!ancestors.length||ancestors.some(a=>a.post_id!==postId||a.state!=='published')))fail(404,'not_found','Комментарий не найден');
   for(const a of ancestors)if(a.author_id&&await blocked(user.id,a.author_id,tx))fail(404,'not_found','Комментарий не найден');
   let snapshot:string|null=null,avatar:string|null=null;
   if(p.club_id){
    if(p.club_state!=='active')fail(409,'club_archived','Клуб находится в архиве');
    const member=await one<any>('SELECT m.*,u.visibility FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND m.user_id=$2 AND m.state=\'active\' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL FOR UPDATE OF m',[p.club_id,user.id],tx);
    if(!member)fail(403,'membership_required','Нужно действующее членство в клубе');
    if(p.audience==='public'&&p.feed_visibility==='public'&&member.visibility!=='public')fail(403,'public_profile_required','Для комментария в публичном клубе нужен публичный профиль');
    if(p.audience==='members_only'||p.feed_visibility==='members_only'){snapshot=member.nickname;avatar=member.avatar_id;}
   }
   const c=await one<{id:string}>('INSERT INTO comments(post_id,parent_id,author_id,body,snapshot_nickname,snapshot_avatar_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[postId,input.parent_id||null,user.id,input.body,snapshot,avatar],tx);
   const recipient=input.parent_id?ancestors[0].author_id:p.author_id;
   if(recipient&&recipient!==user.id)await notify(tx,recipient,input.parent_id?'reply':'comment','post',postId,user.id);
   return c!.id;
  });return (await visibleComments(postId,user.id,undefined,{id:commentId}))[0];
 });
 app.patch('/api/v1/comments/:id',async request=>{
  const user=requireUser(request);const id=idParam(request);const input=parse(commentInput.pick({body:true}),request.body);
  await transaction(async tx=>{
   const c=await one<any>('SELECT c.*,p.author_id post_author FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=$1',[id],tx);
   if(!c||c.author_id!==user.id||c.state!=='published')fail(404,'not_found','Комментарий не найден');
   const chain=await query<any>(`WITH RECURSIVE chain AS(SELECT id,parent_id,author_id FROM comments WHERE id=$1 UNION ALL SELECT c.id,c.parent_id,c.author_id FROM comments c JOIN chain x ON c.id=x.parent_id) SELECT * FROM chain`,[id],tx);
   await lockUsers(tx,[user.id,c.post_author,...chain.filter(a=>a.author_id).map(a=>a.author_id)]);const actor=await activeActor(tx,user.id);
   await lockPairs(tx,[[user.id,c.post_author],...chain.filter(a=>a.author_id).map(a=>[user.id,a.author_id] as [string,string])]);
   if(!await canReadPost(user.id,c.post_id,tx))fail(404,'not_found','Комментарий не найден');
   for(const ancestor of chain)if(ancestor.author_id&&await blocked(user.id,ancestor.author_id,tx))fail(404,'not_found','Комментарий не найден');
   const club=await one<any>('SELECT p.club_id,p.audience,c.state,c.feed_visibility FROM posts p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.id=$1',[c.post_id],tx);
   if(club?.club_id){
    const member=await one<any>("SELECT m.id,u.visibility FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND m.user_id=$2 AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL FOR UPDATE OF m",[club.club_id,user.id],tx);
    if(club.state!=='active'||!member)fail(403,'membership_required','Нужно действующее членство в активном клубе');
    if(club.audience==='public'&&club.feed_visibility==='public'&&member.visibility!=='public')fail(403,'public_profile_required','Для комментария в публичном клубе нужен публичный профиль');
   }
   await execute('UPDATE comments SET body=$2,updated_at=now() WHERE id=$1',[id,input.body],tx);
  });return {ok:true};
 });
 app.delete('/api/v1/comments/:id',async request=>{
  const user=requireUser(request);const id=idParam(request);await transaction(async tx=>{await lockUsers(tx,[user.id]);await activeActor(tx,user.id);await execute('UPDATE comments SET state=\'removed\',updated_at=now() WHERE id=$1 AND author_id=$2',[id,user.id],tx);});return {ok:true};
 });
 for(const kind of ['like','bookmark'] as const){
  for(const method of ['PUT','DELETE'] as const){app.route({method,url:`/api/v1/posts/:id/${kind}`,handler:async request=>{
   const user=requireUser(request);const id=idParam(request);await transaction(async tx=>{
    const p=await one<{author_id:string}>('SELECT author_id FROM posts WHERE id=$1',[id],tx);if(!p)fail(404,'not_found','Публикация не найдена');
    await lockUsers(tx,[user.id,p.author_id]);const actor=await activeActor(tx,user.id);await lockPair(tx,user.id,p.author_id);if(!await canReadPost(user.id,id,tx))fail(404,'not_found','Публикация не найдена');
    const table=kind==='like'?'reactions':'bookmarks';
    if(method==='PUT'){const inserted=await query(`INSERT INTO ${table}(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id`,[user.id,id],tx);if(inserted.length&&kind==='like'&&user.id!==p.author_id&&actor.visibility==='public')await notify(tx,p.author_id,'like','post',id,user.id);}
    else await execute(`DELETE FROM ${table} WHERE user_id=$1 AND post_id=$2`,[user.id,id],tx);
   });return {ok:true};
  }});}
 }
 app.get('/api/v1/bookmarks',async request=>{const user=requireUser(request,false);return postPage(request,'EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id AND b.user_id=$2)',[user.id]);});
 app.get('/api/v1/mentions',async request=>{const user=requireUser(request,false);return postPage(request,'EXISTS(SELECT 1 FROM mentions m WHERE m.post_id=p.id AND m.user_id=$2)',[user.id]);});
 app.get('/api/v1/tags',async request=>{
  const input=parse(z.object({q:z.string().max(32).default('')}),request.query);const posts=await query<{id:string;tags:string[]}>(`SELECT p.id,r.tags ${joins} WHERE ${acl} AND p.state='published' AND u.visibility='public' AND (p.club_id IS NULL OR (p.audience='public' AND c.feed_visibility='public'))`,[request.viewer?.id||null]);
  return {items:[...new Set(posts.flatMap(p=>p.tags))].filter(t=>t.startsWith(input.q.toLocaleLowerCase('ru'))).sort().slice(0,50)};
 });
 app.put('/api/v1/profiles/:id/follow',async request=>{
  const user=requireUser(request);const target=idParam(request);if(target===user.id)fail(422,'self_follow','Нельзя подписаться на себя');
  await transaction(async tx=>{await lockUsers(tx,[user.id,target]);const actor=await activeActor(tx,user.id);await lockPair(tx,user.id,target);if(!await canReadProfile(user.id,target,tx))fail(404,'not_found','Профиль не найден');const insert=await query('INSERT INTO follows(follower_id,followee_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING follower_id',[user.id,target],tx);if(insert.length&&actor.visibility==='public')await notify(tx,target,'follow','profile',user.id,user.id);});return {ok:true};
 });
 app.delete('/api/v1/profiles/:id/follow',async request=>{const user=requireUser(request);const target=idParam(request);await transaction(async tx=>{await lockUsers(tx,[user.id,target]);const actor=await activeActor(tx,user.id);await lockPair(tx,user.id,target);await execute('DELETE FROM follows WHERE follower_id=$1 AND followee_id=$2',[user.id,target],tx);});return {ok:true};});
 for(const direction of ['followers','following'] as const){app.get(`/api/v1/profiles/:id/${direction}`,async request=>{
  const id=idParam(request);if(!await canReadProfile(request.viewer?.id||null,id))fail(404,'not_found','Профиль не найден');
  const rows=await countVisibleFollows(id,request.viewer?.id||null,direction);const items=[];for(const row of rows)items.push(await authorDTO(row.id,request.viewer?.id||null));
  return {items,count:items.length};
 });}
 app.put('/api/v1/comments/:id/block-author',async request=>{
  const user=requireUser(request);const id=idParam(request);
  await transaction(async tx=>{
   const c=await one<{post_id:string;author_id:string|null;state:string}>('SELECT post_id,author_id,state FROM comments WHERE id=$1',[id],tx);
   if(!c?.author_id||c.state!=='published'||c.author_id===user.id)fail(404,'not_found','Комментарий не найден');
   await lockUsers(tx,[user.id,c.author_id]);await activeActor(tx,user.id);await lockPair(tx,user.id,c.author_id);
   if(!await canReadPost(user.id,c.post_id,tx)||await blocked(user.id,c.author_id,tx)||!await one("SELECT 1 FROM users WHERE id=$1 AND status='active'",[c.author_id],tx))fail(404,'not_found','Комментарий не найден');
   await createBlock(tx,user.id,c.author_id);
  });return {ok:true};
 });
 app.put('/api/v1/profiles/:id/block',async request=>{
  const user=requireUser(request);const target=idParam(request);if(user.id===target)fail(422,'self_block','Нельзя заблокировать себя');
  await transaction(async tx=>{
   await lockUsers(tx,[user.id,target]);const actor=await activeActor(tx,user.id);await lockPair(tx,user.id,target);if(!await one('SELECT 1 FROM users WHERE id=$1 AND status=\'active\'',[target],tx))fail(404,'not_found','Участник не найден');
   await createBlock(tx,user.id,target);
  });return {ok:true};
 });
 app.delete('/api/v1/profiles/:id/block',async request=>{const user=requireUser(request);const target=idParam(request);await transaction(async tx=>{await lockUsers(tx,[user.id,target]);const actor=await activeActor(tx,user.id);await lockPair(tx,user.id,target);await execute('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',[user.id,target],tx);});return {ok:true};});
 app.get('/api/v1/blocks',async request=>{const user=requireUser(request,false);return {items:await query(`SELECT b.blocked_id id,CASE WHEN u.visibility='public' AND u.status='active' THEN u.handle ELSE NULL END handle,CASE WHEN u.status='deleted' THEN 'Удалённый участник' WHEN u.visibility='hidden' OR u.status<>'active' THEN 'Скрытый участник' ELSE u.display_name END display_name,b.created_at FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1 ORDER BY b.created_at DESC`,[user.id])};});
}
