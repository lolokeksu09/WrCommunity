import type { PoolClient } from 'pg';
import { one, query } from '../../db/index.js';

export type EventRow={id:string;club_id:string;creator_id:string;title:string;description:string;audience:'public'|'members_only';starts_at:Date;ends_at:Date;registration_closes_at:Date;capacity:number;state:'open'|'cancelled'|'completed';created_at:Date;updated_at:Date;club_name:string;club_state:string;feed_visibility:string;event_roles:string[];owner_id:string;before_start:boolean;before_deadline:boolean;ended:boolean};
export type Member={user_id:string;role:string;state:string;nickname:string;avatar_id:string|null;roles:string[];consented_at:Date|null;revoked_at:Date|null;consent_version:number|null};
export async function eventRow(id:string,tx?:PoolClient,lock=false) {
  return one<EventRow>(`SELECT e.*,c.name AS club_name,c.state AS club_state,c.feed_visibility,c.event_roles,c.owner_id,e.starts_at>clock_timestamp() AS before_start,e.registration_closes_at>clock_timestamp() AS before_deadline,e.ends_at<=clock_timestamp() AS ended FROM events e JOIN clubs c ON c.id=e.club_id WHERE e.id=$1${lock?' FOR UPDATE OF e':''}`,[id],tx);
}
export async function eventMember(userId:string|null,clubId:string,tx?:PoolClient):Promise<Member|undefined> {
  if(!userId)return undefined;
  return one<Member>("SELECT m.* FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.club_id=$1 AND m.user_id=$2 AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active'",[clubId,userId],tx);
}
export async function canReadEvent(row:EventRow|undefined,userId:string|null,tx?:PoolClient):Promise<boolean> {
  if(!row||row.club_state==='deleted')return false;
  if(row.audience==='public'&&row.feed_visibility==='public')return true;
  return Boolean(await eventMember(userId,row.club_id,tx));
}
export function canManageEvent(row:EventRow,member:Member|undefined,userId:string|null):boolean {
  if(!member||member.state!=='active'||member.revoked_at||!member.consented_at)return false;
  return member.role==='owner'||(member.role==='admin'&&row.event_roles.includes('admin'))||(row.creator_id===userId&&row.event_roles.includes(member.role));
}
export async function eventDTO(row:EventRow,viewerId:string|null,tx?:PoolClient) {
  const member=await eventMember(viewerId,row.club_id,tx);const canManage=canManageEvent(row,member,viewerId);
  const total=await one<{count:string}>("SELECT count(*) FROM event_registrations WHERE event_id=$1 AND state='active'",[row.id],tx);
  const count=Number(total?.count??0);
  const visible=await one<{count:string}>(`SELECT count(*) FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE r.event_id=$1 AND r.state='active' AND u.visibility='public' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$2))`,[row.id,viewerId],tx);
  const own=viewerId?await one<{state:string}>("SELECT state FROM event_registrations WHERE event_id=$1 AND user_id=$2",[row.id,viewerId],tx):undefined;
  return {id:row.id,club_id:row.club_id,organizer:{id:row.club_id,name:row.club_name},title:row.title,description:row.description,audience:row.audience,starts_at:row.starts_at,ends_at:row.ends_at,registration_closes_at:row.registration_closes_at,capacity:row.capacity,state:row.ended&&row.state==='open'?'completed':row.state,created_at:row.created_at,registration_status:row.state!=='open'||row.ended?'closed':!row.before_start||!row.before_deadline?'closed':count>=row.capacity?'full':'open',my_registration:own?.state??null,can_manage:canManage,...(canManage?{registered_count:count}:{visible_registered_count:Number(visible?.count??0)})};
}
export async function registrationDTOs(row:EventRow,viewerId:string|null,tx?:PoolClient) {
  const member=await eventMember(viewerId,row.club_id,tx);const manage=canManageEvent(row,member,viewerId);
  type Registration={id:string;created_at:Date;user_id:string;nickname:string;avatar_id:string|null;roles:string[];visibility:string;handle:string;display_name:string};
  const rows=await query<Registration>(`SELECT r.id,r.created_at,r.user_id,m.nickname,m.avatar_id,m.roles,u.visibility,u.handle,u.display_name FROM event_registrations r JOIN users u ON u.id=r.user_id JOIN club_memberships m ON m.club_id=$2 AND m.user_id=r.user_id WHERE r.event_id=$1 AND r.state='active' AND u.status='active' AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND ($3::boolean OR u.visibility='public') AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$4 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$4)) ORDER BY r.created_at,r.id LIMIT 500`,[row.id,row.club_id,manage,viewerId],tx);
  return rows.map(reg=>manage?{id:reg.id,nickname:reg.nickname,avatar:reg.avatar_id?`/api/v1/media/${reg.avatar_id}`:null,roles:reg.roles,created_at:reg.created_at,...(reg.visibility==='public'?{profile_id:reg.user_id}:{} )}:{id:reg.id,nickname:reg.handle,display_name:reg.display_name,profile_id:reg.user_id,created_at:reg.created_at});
}
