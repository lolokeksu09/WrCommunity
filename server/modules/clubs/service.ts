import type { PoolClient } from 'pg';
import { query, one, execute } from '../../db/index.js';
import { fail, notify } from '../../lib.js';

export type ClubRole = 'owner'|'admin'|'moderator'|'member';
export interface ClubMembership {
  id:string;club_id:string;user_id:string;role:ClubRole;state:string;nickname:string;nickname_key:string;
  avatar_id:string|null;roles:string[];consent_version:number|null;consented_at:Date|null;revoked_at:Date|null;
  reason:string|null;joined_at:Date|null;updated_at:Date;created_at:Date;
}
export interface Club { id:string;owner_id:string;name:string;description:string;join_mode:'open'|'approval';feed_visibility:'public'|'members_only';avatar_id:string|null;cover_id:string|null;rules:string;event_roles:ClubRole[];state:string;pinned_post_id:string|null;version:number;created_at:Date;updated_at:Date }
export async function membership(userId:string,clubId:string,tx?:PoolClient):Promise<ClubMembership|undefined> {
  return one<ClubMembership>('SELECT * FROM club_memberships WHERE user_id=$1 AND club_id=$2',[userId,clubId],tx);
}
export async function canManageClub(userId:string,clubId:string,roles:ClubRole[]=['owner','admin','moderator'],tx?:PoolClient):Promise<boolean> {
  return !!await one(`SELECT m.id FROM club_memberships m JOIN clubs c ON c.id=m.club_id JOIN users u ON u.id=m.user_id
    WHERE m.user_id=$1 AND m.club_id=$2 AND m.state='active' AND m.role=ANY($3::text[]) AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL
    AND c.state='active' AND u.status='active' AND u.verified_at IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM sanctions s WHERE s.user_id=u.id AND s.kind='suspension' AND s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at>now()))`,[userId,clubId,roles],tx);
}
export async function canReadClubContent(userId:string|null,clubId:string,audience:string,tx?:PoolClient):Promise<boolean> {
  const club=await one<Club>('SELECT * FROM clubs WHERE id=$1 AND state<>\'deleted\'',[clubId],tx);
  if(!club) return false;
  if(club.feed_visibility==='public' && audience==='public') return true;
  if(!userId) return false;
  return !!await one(`SELECT m.id FROM club_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.club_id=$2
    AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active'`,[userId,clubId],tx);
}
export async function requireClub(clubId:string,tx?:PoolClient,lock=false):Promise<Club> {
  const club=await one<Club>(`SELECT * FROM clubs WHERE id=$1 AND state<>'deleted' ${lock?'FOR UPDATE':''}`,[clubId],tx);
  if(!club) fail(404,'CLUB_NOT_FOUND','Клуб не найден');
  return club;
}
export async function requireManager(userId:string,clubId:string,roles:ClubRole[]=['owner','admin','moderator'],tx?:PoolClient):Promise<ClubMembership> {
  if(!await canManageClub(userId,clubId,roles,tx)) fail(403,'CLUB_PERMISSION','Недостаточно клубных полномочий');
  return (await membership(userId,clubId,tx))!;
}
export function normalized(value:string):string { return value.normalize('NFC').trim().replace(/\s+/gu,' '); }
export function graphemes(value:string):number { return [...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)].length; }
export function checkedText(value:string,min:number,max:number,label:string):string {
  const result=normalized(value);
  if(graphemes(result)<min || graphemes(result)>max || /[\p{Cc}\p{Cf}]/u.test(result)) fail(422,'INVALID_TEXT',`${label}: от ${min} до ${max} символов`);
  return result;
}
export function nicknameIdentity(value:string):{nickname:string;nickname_key:string} {
  const nickname=checkedText(value,3,32,'Клубный псевдоним');
  const nickname_key=nickname.normalize('NFKC').toLowerCase();
  const service=nickname_key.replace(/^@/,'').replace(/[^\p{L}\p{N}]/gu,'');
  if(['admin','administrator','moderator','owner','support','system','wrcommunity','администратор','модератор','владелец','поддержка','система'].includes(service)) fail(422,'RESERVED_NICKNAME','Выберите псевдоним без служебных названий');
  return {nickname,nickname_key};
}
export async function assertIdentityAvailable(clubId:string,userId:string,key:string,tx:PoolClient):Promise<void> {
  if(await one('SELECT user_id FROM club_name_reservations WHERE club_id=$1 AND nickname_key=$2 AND user_id<>$3',[clubId,key,userId],tx)
    || await one("SELECT id FROM club_memberships WHERE club_id=$1 AND nickname_key=$2 AND user_id<>$3 AND state IN ('pending','active')",[clubId,key,userId],tx)) fail(409,'NICKNAME_TAKEN','Клубный псевдоним уже занят');
}
export async function releaseUnusedNames(clubId:string,userId:string,tx:PoolClient):Promise<void> {
  const snapshots=await query<{snapshot_nickname:string}>(`SELECT DISTINCT c.snapshot_nickname FROM comments c JOIN posts p ON p.id=c.post_id
    WHERE p.club_id=$1 AND c.author_id=$2 AND c.snapshot_nickname IS NOT NULL`,[clubId,userId],tx);
  const retained=snapshots.map(c=>c.snapshot_nickname.normalize('NFKC').toLowerCase());
  const m=await membership(userId,clubId,tx);if(m&&['active','pending'].includes(m.state))retained.push(m.nickname_key);
  await execute('DELETE FROM club_name_reservations WHERE club_id=$1 AND user_id=$2 AND NOT(nickname_key=ANY($3::text[]))',[clubId,userId,retained],tx);
}
export async function assertMedia(userId:string,id:string|null|undefined,maxBytes:number,tx:PoolClient):Promise<void> {
  if(!id)return;
  if(!await one("SELECT id FROM media_blobs WHERE id=$1 AND owner_id=$2 AND state='ready' AND mime IN ('image/jpeg','image/png','image/webp','image/avif','image/gif') AND size_bytes<=$3 FOR SHARE",[id,userId,maxBytes],tx)) fail(422,'INVALID_MEDIA','Выберите своё доступное изображение в пределах допустимого размера');
}
export async function audit(tx:PoolClient,actorId:string,clubId:string,action:string,targetId:string|null=null,reason='',metadata:unknown={}):Promise<void> {
  await execute('INSERT INTO audit_actions(actor_id,club_id,action,target_id,reason,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[actorId,clubId,action,targetId,reason,JSON.stringify(metadata)],tx);
}
export async function assertActiveUser(userId:string,tx:PoolClient):Promise<void> {
  if(!await one("SELECT id FROM users WHERE id=$1 AND status='active' AND verified_at IS NOT NULL",[userId],tx)) fail(403,'ACCOUNT_RESTRICTED','Нужен действующий аккаунт с подтверждённой почтой');
  if(await one("SELECT id FROM sanctions WHERE user_id=$1 AND kind='suspension' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",[userId],tx)) fail(403,'ACCOUNT_RESTRICTED','Действия аккаунта ограничены');
}
export async function ownershipGate(userId:string,tx:PoolClient):Promise<void> {
  const user=await one<{visibility:string;verified_at:Date|null;status:string}>('SELECT visibility,verified_at,status FROM users WHERE id=$1',[userId],tx);
  if(!user || user.visibility!=='public' || !user.verified_at || user.status!=='active') fail(403,'PUBLIC_OWNER_REQUIRED','Нужен действующий публичный профиль с подтверждённой почтой');
  const count=await one<{count:string}>("SELECT count(*) FROM clubs WHERE owner_id=$1 AND state IN ('active','archived')",[userId],tx);
  if(Number(count?.count)>=3) fail(409,'OWNERSHIP_LIMIT','Достигнут лимит клубов в текущем владении');
  if(await one("SELECT id FROM audit_actions WHERE actor_id=$1 AND action IN ('club_create','club_transfer_accept') AND created_at>now()-interval '24 hours' LIMIT 1",[userId],tx)) fail(429,'CLUB_CREATION_LIMIT','Создание и передача клубов временно ограничены');
  const recent=await one<{count:string}>("SELECT count(*) FROM audit_actions WHERE actor_id=$1 AND action IN ('club_create','club_transfer_accept') AND created_at>now()-interval '30 days'",[userId],tx);
  if(Number(recent?.count)>=3) fail(429,'CLUB_CREATION_LIMIT','Создание и передача клубов временно ограничены');
  if(await one("SELECT id FROM sanctions WHERE user_id=$1 AND kind='suspension' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",[userId],tx)) fail(403,'ACCOUNT_RESTRICTED','Действия аккаунта ограничены');
}
export async function endMembership(tx:PoolClient,actorId:string,member:ClubMembership,state:'left'|'kicked',reason:string):Promise<void> {
  await execute('UPDATE club_memberships SET state=$2,revoked_at=now(),reason=$3,updated_at=now() WHERE id=$1',[member.id,state,reason],tx);
  await releaseUnusedNames(member.club_id,member.user_id,tx);
  // Do not modify comments: their signatures intentionally describe historical context.
  const cancelled=await query<{id:string;creator_id:string}>(`UPDATE event_registrations r SET state='cancelled' FROM events e WHERE r.event_id=e.id AND r.user_id=$1
    AND e.club_id=$2 AND r.state='active' AND e.starts_at>now() RETURNING e.id,e.creator_id`,[member.user_id,member.club_id],tx);
  for(const event of cancelled) {
    await notify(tx,event.creator_id,'event_membership_cancelled','event',event.id);
  }
  await audit(tx,actorId,member.club_id,state==='kicked'?'club_member_kick':'club_member_leave',member.id,reason,{cancelled_registrations:cancelled.length});
}
