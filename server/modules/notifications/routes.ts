import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {one,query,execute} from '../../db/index.js';
import {requireUser,idParam,parse,fail} from '../../lib.js';
import {blocked,canReadPost,canReadProfile} from '../policy/service.js';
interface Notification {id:string;recipient_id:string;event_type:string;object_type:string;object_id:string;actor_id:string|null;created_at:Date;read_at:Date|null}
const categories=['comments','reactions','mentions','follows','clubs','events','lfg'] as const;
function category(type:string):string {if(/like|reaction/.test(type))return 'reactions';if(/mention/.test(type))return 'mentions';if(/follow/.test(type))return 'follows';if(/comment|reply/.test(type))return 'comments';if(/lfg|application/.test(type))return 'lfg';if(/event|registration/.test(type))return 'events';return 'clubs';}
const labels:Record<string,string>={comments:'Новый ответ в обсуждении',reactions:'Новая отметка «Нравится»',mentions:'Вас упомянули в публикации',follows:'Новая подписка',clubs:'Обновление в вашем клубе',events:'Изменение клубного мероприятия',lfg:'Обновление поиска команды'};
async function visible(n:Notification,userId:string):Promise<{href:string}|undefined>{
 if(n.actor_id&&n.actor_id!==userId&&await blocked(userId,n.actor_id))return;
 if(n.object_type==='post'){if(await canReadPost(userId,n.object_id))return {href:`/posts/${n.object_id}`};return;}
 if(n.object_type==='comment'){const c=await one<{post_id:string}>('SELECT post_id FROM comments WHERE id=$1 AND state=\'published\'',[n.object_id]);if(c&&await canReadPost(userId,c.post_id))return {href:`/posts/${c.post_id}`};return;}
 if(n.object_type==='profile'||n.object_type==='user'){if(await canReadProfile(userId,n.object_id))return {href:`/users/${n.object_id}`};return;}
 if(n.object_type==='event'){
  const e=await one<{club_id:string;audience:string;feed_visibility:string;member:boolean}>('SELECT e.club_id,e.audience,c.feed_visibility,EXISTS(SELECT 1 FROM club_memberships m WHERE m.club_id=e.club_id AND m.user_id=$2 AND m.state=\'active\' AND m.revoked_at IS NULL) AS member FROM events e JOIN clubs c ON c.id=e.club_id WHERE e.id=$1 AND c.state<>\'deleted\'',[n.object_id,userId]);
  if(e&&(e.member||(e.audience==='public'&&e.feed_visibility==='public')))return {href:`/events/${n.object_id}`};return;
 }
 if(n.object_type==='lfg'||n.object_type==='lfg_announcement'){
  const l=await one<{author_id:string;visibility:string}>('SELECT l.author_id,u.visibility FROM lfg_announcements l JOIN users u ON u.id=l.author_id WHERE l.id=$1 AND l.state<>\'deleted\' AND u.status=\'active\'',[n.object_id]);
  if(l&&(l.author_id===userId||(l.visibility==='public'&&!await blocked(userId,l.author_id))))return {href:`/lfg/${n.object_id}`};return;
 }
 if(n.object_type==='lfg_application'||n.object_type==='application'){
  const a=await one<{announcement_id:string;author_id:string;applicant_id:string;visibility:string;disclosure_consent:boolean}>('SELECT a.announcement_id,a.applicant_id,l.author_id,u.visibility,a.disclosure_consent FROM lfg_applications a JOIN lfg_announcements l ON l.id=a.announcement_id JOIN users u ON u.id=l.author_id JOIN users p ON p.id=a.applicant_id WHERE a.id=$1 AND l.state<>\'deleted\' AND a.state<>\'cancelled\' AND u.status=\'active\' AND p.status=\'active\'',[n.object_id]);
  if(a&&[a.author_id,a.applicant_id].includes(userId)&&(a.author_id===userId||a.visibility==='public')&&a.disclosure_consent&&!await blocked(a.author_id,a.applicant_id))return {href:`/lfg/${a.announcement_id}`};return;
 }
 if(n.object_type==='club'||n.object_type==='club_membership'){
  const c=n.object_type==='club'?await one<{id:string}>('SELECT id FROM clubs WHERE id=$1 AND state<>\'deleted\'',[n.object_id]):await one<{id:string}>('SELECT club_id AS id FROM club_memberships WHERE id=$1 AND user_id=$2',[n.object_id,userId]);
  if(c)return {href:`/clubs/${c.id}`};return;
 }
 return;
}
export async function registerNotifications(app:FastifyInstance):Promise<void>{
 app.get('/api/v1/me/notifications',async request=>{
  const user=requireUser(request,false);const rows=await query<Notification>('SELECT * FROM notifications WHERE recipient_id=$1 ORDER BY created_at DESC,id DESC LIMIT 200',[user.id]);
  const items=[];
  for(const n of rows){const access=await visible(n,user.id);if(!access)continue;let actor=null;
   if(n.actor_id&&await canReadProfile(user.id,n.actor_id))actor=await one('SELECT id,handle,display_name FROM users WHERE id=$1 AND visibility=\'public\' AND status=\'active\'',[n.actor_id]);
   items.push({id:n.id,event_type:n.event_type,category:category(n.event_type),label:labels[category(n.event_type)],href:access.href,actor:actor??null,created_at:n.created_at,read_at:n.read_at});
  }
  return {items};
 });
 app.patch('/api/v1/me/notifications/:id',async request=>{const user=requireUser(request,false);const id=idParam(request);const updated=await one('UPDATE notifications SET read_at=now() WHERE id=$1 AND recipient_id=$2 RETURNING id',[id,user.id]);if(!updated)fail(404,'not_found','Уведомление не найдено.');return {ok:true};});
 app.post('/api/v1/me/notifications/read-all',async request=>{const user=requireUser(request,false);await execute('UPDATE notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL',[user.id]);return {ok:true};});
 app.get('/api/v1/me/notification-preferences',async request=>{const user=requireUser(request,false);const rows=await query<{event_type:string;enabled:boolean}>('SELECT event_type,enabled FROM notification_preferences WHERE user_id=$1',[user.id]);return {preferences:Object.fromEntries(categories.map(c=>[c,rows.find(r=>r.event_type===c)?.enabled??true]))};});
 app.patch('/api/v1/me/notification-preferences',async request=>{const user=requireUser(request,false);const body=parse(z.partialRecord(z.enum(categories),z.boolean()),request.body);
  for(const [key,value] of Object.entries(body))await execute('INSERT INTO notification_preferences(user_id,event_type,enabled) VALUES($1,$2,$3) ON CONFLICT(user_id,event_type) DO UPDATE SET enabled=EXCLUDED.enabled',[user.id,key,value]);return {ok:true};
 });
}
export {category as notificationCategory};
