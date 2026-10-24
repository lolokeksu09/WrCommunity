import type { PoolClient } from 'pg';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { execute, one, query, transaction } from '../../db/index.js';
import { notify } from '../../lib.js';

export type Announcement = {id:string;author_id:string;server:string;roles:string[];description:string;expires_at:Date;pending_policy:'keep'|'reject';state:'open'|'closed'|'expired'|'deleted';created_at:Date;updated_at:Date;handle:string;display_name:string;visibility:string;author_status:string;is_expired:boolean};
export type Application = {id:string;announcement_id:string;applicant_id:string;message:string;disclosure_consent:boolean;disclosed_nickname:string|null;state:string;created_at:Date;decided_at:Date|null};
export async function announcementRow(id:string,tx?:PoolClient,lock=false) {
  return one<Announcement>(`SELECT a.*,u.handle,u.display_name,u.visibility,u.status AS author_status,a.expires_at<=clock_timestamp() AS is_expired FROM lfg_announcements a JOIN users u ON u.id=a.author_id WHERE a.id=$1${lock?' FOR UPDATE OF a':''}`,[id],tx);
}
export async function applyPendingPolicy(tx:PoolClient,announcement:Pick<Announcement,'id'|'pending_policy'|'author_id'>) {
  if(announcement.pending_policy!=='reject') return;
  const changed=await query<{id:string;applicant_id:string}>("UPDATE lfg_applications SET state='auto_rejected',decided_at=clock_timestamp() WHERE announcement_id=$1 AND state='pending' RETURNING id,applicant_id",[announcement.id],tx);
  for(const application of changed) await notify(tx,application.applicant_id,'lfg_application_decided','lfg_application',application.id,announcement.author_id);
}
export async function expireAnnouncement(tx:PoolClient,announcement:Announcement):Promise<boolean> {
  if(announcement.state!=='open'||!announcement.is_expired) return false;
  await execute("UPDATE lfg_announcements SET state='expired',updated_at=clock_timestamp() WHERE id=$1",[announcement.id],tx);
  await applyPendingPolicy(tx,announcement);
  announcement.state='expired';
  return true;
}
/** Idempotent worker entry point. Lazy route checks use the same DB-clock policy. */
export async function expireLfg(tx?:PoolClient):Promise<number> {
  const expire=async(client:PoolClient)=>{
    const announcements=await query<Announcement>("SELECT a.*,true AS is_expired FROM lfg_announcements a WHERE state='open' AND expires_at<=clock_timestamp() ORDER BY expires_at,id FOR UPDATE SKIP LOCKED LIMIT 500",[],client);
    for(const announcement of announcements) await expireAnnouncement(client,announcement);
    return announcements.length;
  };
  return tx?expire(tx):transaction(expire);
}
export async function refreshAnnouncement(id:string):Promise<void> {
  await transaction(async tx=>{const row=await announcementRow(id,tx,true);if(row)await expireAnnouncement(tx,row);});
}
export function announcementDTO(row:Announcement) {
  return {id:row.id,server:row.server,roles:row.roles,description:row.description,expires_at:row.expires_at,pending_policy:row.pending_policy,state:row.state,created_at:row.created_at,author:{id:row.author_id,handle:row.handle,display_name:row.display_name}};
}
export function applicationDTO(row:Application) {
  return {id:row.id,announcement_id:row.announcement_id,nickname:row.disclosed_nickname,message:row.message,state:row.state,created_at:row.created_at,decided_at:row.decided_at};
}
function contactKey():Buffer {
  const value=process.env.LFG_CONTACT_KEY??'';
  if(!/^[a-f0-9]{64}$/i.test(value)) throw new Error('LFG_CONTACT_KEY must be a 32-byte hex secret');
  return Buffer.from(value,'hex');
}
export function encryptContact(value:string,applicationId:string,userId:string):string {
  const nonce=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',contactKey(),nonce);
  cipher.setAAD(Buffer.from(`${applicationId}:${userId}`));
  const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return ['v1',nonce.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
export function decryptContact(value:string,applicationId:string,userId:string):string {
  const [version,nonce,tag,encrypted]=value.split('.');
  if(version!=='v1'||!nonce||!tag||!encrypted)throw new Error('Invalid encrypted contact');
  const decipher=createDecipheriv('aes-256-gcm',contactKey(),Buffer.from(nonce,'base64'));
  decipher.setAAD(Buffer.from(`${applicationId}:${userId}`));decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted,'base64')),decipher.final()]).toString('utf8');
}
