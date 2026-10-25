import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {one,query,execute} from '../../db/index.js';
import {requireUser,idParam,parse,fail} from '../../lib.js';
import {categories,notificationPage,notificationUnreadCount} from './service.js';
const listing=z.object({limit:z.coerce.number().int().min(1).max(50).default(30),cursor:z.string().max(600).optional()});
export async function registerNotifications(app:FastifyInstance):Promise<void>{
 app.get('/api/v1/me/notifications',async request=>{
  const user=requireUser(request,false);return notificationPage(user.id,parse(listing,request.query));
 });
 app.get('/api/v1/me/notifications/unread-count',async request=>{
  const user=requireUser(request,false);return {unread_count:await notificationUnreadCount(user.id)};
 });
 app.patch('/api/v1/me/notifications/:id',async request=>{const user=requireUser(request,false);const id=idParam(request);const updated=await one('UPDATE notifications SET read_at=now() WHERE id=$1 AND recipient_id=$2 RETURNING id',[id,user.id]);if(!updated)fail(404,'not_found','Уведомление не найдено.');return {ok:true};});
 app.post('/api/v1/me/notifications/read-all',async request=>{const user=requireUser(request,false);await execute('UPDATE notifications SET read_at=now() WHERE recipient_id=$1 AND read_at IS NULL',[user.id]);return {ok:true};});
 app.get('/api/v1/me/notification-preferences',async request=>{const user=requireUser(request,false);const rows=await query<{event_type:string;enabled:boolean}>('SELECT event_type,enabled FROM notification_preferences WHERE user_id=$1',[user.id]);return {preferences:Object.fromEntries(categories.map(c=>[c,rows.find(r=>r.event_type===c)?.enabled??true]))};});
 app.patch('/api/v1/me/notification-preferences',async request=>{const user=requireUser(request,false);const body=parse(z.partialRecord(z.enum(categories),z.boolean()),request.body);
  for(const [key,value] of Object.entries(body))await execute('INSERT INTO notification_preferences(user_id,event_type,enabled) VALUES($1,$2,$3) ON CONFLICT(user_id,event_type) DO UPDATE SET enabled=EXCLUDED.enabled',[user.id,key,value]);return {ok:true};
 });
}
export {notificationCategory} from './service.js';
