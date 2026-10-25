import {one,query} from '../../db/index.js';
import {decodeScopedCursor,encodeScopedCursor} from '../../listing-cursor.js';
import {postReadSql,profileReadSql,unblockedSql} from '../policy/service.js';

export const categories=['comments','reactions','mentions','follows','clubs','events','lfg'] as const;
export function notificationCategory(type:string):string{
 if(/like|reaction/.test(type))return 'reactions';
 if(/mention/.test(type))return 'mentions';
 if(/follow/.test(type))return 'follows';
 if(/comment|reply/.test(type))return 'comments';
 if(/lfg|application/.test(type))return 'lfg';
 if(/event|registration/.test(type))return 'events';
 return 'clubs';
}
const labels:Record<string,string>={comments:'Новый ответ в обсуждении',reactions:'Новая отметка «Нравится»',mentions:'Вас упомянули в публикации',follows:'Новая подписка',clubs:'Обновление в вашем клубе',events:'Изменение клубного мероприятия',lfg:'Обновление поиска команды'};
const viewer='$1::uuid';
const postJoins='JOIN users u ON u.id=p.author_id LEFT JOIN clubs c ON c.id=p.club_id LEFT JOIN post_revisions r ON r.id=p.current_revision_id';
const visible=`(n.actor_id IS NULL OR ${unblockedSql(viewer,'n.actor_id')})
 AND (n.actor_id IS NULL OR n.event_type !~ 'follow|like|reaction' OR EXISTS(SELECT 1 FROM users u WHERE u.id=n.actor_id AND ${profileReadSql(viewer)}))
 AND CASE
  WHEN n.object_type='post' THEN EXISTS(SELECT 1 FROM posts p ${postJoins} WHERE p.id=n.object_id AND ${postReadSql(viewer)})
  WHEN n.object_type='comment' THEN EXISTS(SELECT 1 FROM comments cm JOIN posts p ON p.id=cm.post_id ${postJoins} WHERE cm.id=n.object_id AND cm.state='published' AND ${postReadSql(viewer)})
  WHEN n.object_type IN ('profile','user') THEN EXISTS(SELECT 1 FROM users u WHERE u.id=n.object_id AND ${profileReadSql(viewer)})
  WHEN n.object_type='event' THEN EXISTS(SELECT 1 FROM events e JOIN clubs c ON c.id=e.club_id WHERE e.id=n.object_id AND c.state<>'deleted' AND ((e.audience='public' AND c.feed_visibility='public') OR EXISTS(
   SELECT 1 FROM club_memberships m JOIN users mu ON mu.id=m.user_id WHERE m.club_id=e.club_id AND m.user_id=${viewer} AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND mu.status='active')))
  WHEN n.object_type IN ('lfg','lfg_announcement') THEN EXISTS(SELECT 1 FROM lfg_announcements l JOIN users u ON u.id=l.author_id WHERE l.id=n.object_id AND l.state<>'deleted' AND u.status='active' AND (l.author_id=${viewer} OR (u.visibility='public' AND ${unblockedSql(viewer,'l.author_id')})))
  WHEN n.object_type IN ('lfg_application','application') THEN EXISTS(SELECT 1 FROM lfg_applications a JOIN lfg_announcements l ON l.id=a.announcement_id JOIN users u ON u.id=l.author_id JOIN users p ON p.id=a.applicant_id
   WHERE a.id=n.object_id AND l.state<>'deleted' AND a.state<>'cancelled' AND u.status='active' AND p.status='active' AND a.disclosure_consent
   AND (a.applicant_id=${viewer} OR l.author_id=${viewer}) AND (l.author_id=${viewer} OR u.visibility='public') AND ${unblockedSql('l.author_id','a.applicant_id')})
  WHEN n.object_type='club' THEN EXISTS(SELECT 1 FROM clubs c WHERE c.id=n.object_id AND c.state<>'deleted')
  WHEN n.object_type='club_membership' THEN EXISTS(SELECT 1 FROM club_memberships m JOIN clubs c ON c.id=m.club_id WHERE m.id=n.object_id AND m.user_id=${viewer} AND c.state<>'deleted')
  ELSE false END`;
type NotificationRow={id:string;event_type:string;created_at:Date;read_at:Date|null;href:string;actor:{id:string;handle:string;display_name:string}|null;cursor_at:string};

export async function notificationPage(userId:string,input:{limit:number;cursor?:string}){
 const scope='notifications:'+userId;const cursor=decodeScopedCursor(input.cursor,scope);
 const rows=await query<NotificationRow>(`SELECT n.id,n.event_type,n.created_at,n.read_at,
  to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
  CASE WHEN n.object_type='post' THEN '/posts/'||n.object_id
   WHEN n.object_type='comment' THEN '/posts/'||(SELECT post_id FROM comments WHERE id=n.object_id)
   WHEN n.object_type IN ('profile','user') THEN '/users/'||n.object_id
   WHEN n.object_type='event' THEN '/events/'||n.object_id
   WHEN n.object_type IN ('lfg','lfg_announcement') THEN '/lfg/'||n.object_id
   WHEN n.object_type IN ('lfg_application','application') THEN '/lfg/'||(SELECT announcement_id FROM lfg_applications WHERE id=n.object_id)
   WHEN n.object_type='club' THEN '/clubs/'||n.object_id
   ELSE '/clubs/'||(SELECT club_id FROM club_memberships WHERE id=n.object_id) END AS href,
  CASE WHEN actor.visibility='public' AND ${profileReadSql(viewer,'actor')} THEN jsonb_build_object('id',actor.id,'handle',actor.handle,'display_name',actor.display_name) ELSE NULL END AS actor
  FROM notifications n LEFT JOIN users actor ON actor.id=n.actor_id
  WHERE n.recipient_id=$1 AND ${visible} AND ($3::timestamptz IS NULL OR (n.created_at,n.id)<($3::timestamptz,$4::uuid))
  ORDER BY n.created_at DESC,n.id DESC LIMIT $2`,[userId,input.limit+1,cursor?.at??null,cursor?.id??null]);
 const page=rows.slice(0,input.limit);
 return {items:page.map(({cursor_at,...row})=>{const category=notificationCategory(row.event_type);return {...row,category,label:labels[category]};}),nextCursor:rows.length>input.limit?encodeScopedCursor(page.at(-1)!,scope):null};
}
export async function notificationUnreadCount(userId:string):Promise<number>{
 const row=await one<{count:string}>(`SELECT count(*) AS count FROM notifications n WHERE n.recipient_id=$1 AND n.read_at IS NULL AND ${visible}`,[userId]);
 return Number(row?.count??0);
}
