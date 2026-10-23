import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { one, query } from '../../db/index.js';
import { fail } from '../../lib.js';
import { blocked, canReadPost, canReadProfile } from '../policy/service.js';

export const mediaDirectory=()=>resolve(process.env.MEDIA_STORAGE_DIR||'data/media');
export async function assertOwnedMedia(ownerId:string,ids:string[],tx?:PoolClient):Promise<void>{
 if(ids.length>4||new Set(ids).size!==ids.length)fail(422,'invalid_images','Не более четырёх разных изображений');
 if(!ids.length)return;
 const rows=await query<{id:string}>('SELECT id FROM media_blobs WHERE id=ANY($1::uuid[]) AND owner_id=$2 AND state=\'ready\' AND size_bytes<=10485760'+(tx?' FOR SHARE':''),[ids,ownerId],tx);
 if(rows.length!==ids.length)fail(422,'invalid_images','Изображение недоступно');
}
export async function canReadMedia(viewerId:string|null,mediaId:string,tx?:PoolClient):Promise<boolean>{
 const media=await one<{owner_id:string;state:string;status:string}>('SELECT m.owner_id,m.state,u.status FROM media_blobs m JOIN users u ON u.id=m.owner_id WHERE m.id=$1',[mediaId],tx);
 if(!media||media.state!=='ready'||media.status!=='active')return false;
 if(viewerId===media.owner_id)return true;
 if(viewerId&&await blocked(viewerId,media.owner_id,tx))return false;
 const profiles=await query<{id:string}>('SELECT id FROM users WHERE avatar_id=$1 OR cover_id=$1',[mediaId],tx);
 for(const p of profiles)if(await canReadProfile(viewerId,p.id,tx))return true;
 // Catalogue artwork is deliberately public; no member identity is included.
 if(await one('SELECT 1 FROM clubs WHERE state<>\'deleted\' AND (avatar_id=$1 OR cover_id=$1)',[mediaId],tx))return true;
 // Only the current visible revision grants access. Pending, rejected, old and removed media stay private.
 const posts=await query<{id:string}>('SELECT p.id FROM posts p JOIN post_revisions r ON r.id=p.current_revision_id WHERE r.images ? $1',[mediaId],tx);
 for(const p of posts)if(await canReadPost(viewerId,p.id,tx))return true;
 if(viewerId){
  const memberships=await query<{club_id:string;user_id:string}>(`SELECT m.club_id,m.user_id FROM club_memberships m JOIN clubs c ON c.id=m.club_id JOIN users u ON u.id=m.user_id WHERE m.avatar_id=$1 AND m.state IN ('active','pending') AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND u.status='active' AND c.state<>'deleted'`,[mediaId],tx);
  for(const m of memberships){
   if(await blocked(viewerId,m.user_id,tx))continue;
   const allowed=await one(`SELECT 1 FROM club_memberships WHERE club_id=$1 AND user_id=$2 AND state='active' AND consented_at IS NOT NULL AND revoked_at IS NULL AND ($3::boolean OR role IN ('owner','admin'))`,[m.club_id,viewerId,!!await one('SELECT 1 FROM club_memberships WHERE club_id=$1 AND user_id=$2 AND state=\'active\'',[m.club_id,m.user_id],tx)],tx);
   if(allowed)return true;
  }
 }
 // Historical private-club avatar snapshots inherit their original discussion's audience.
 const comments=await query<{post_id:string;author_id:string}>(`SELECT c.post_id,c.author_id FROM comments c JOIN users u ON u.id=c.author_id WHERE c.snapshot_avatar_id=$1 AND c.state='published' AND u.status='active'`,[mediaId],tx);
 for(const c of comments){if(viewerId&&await blocked(viewerId,c.author_id,tx))continue;if(await canReadPost(viewerId,c.post_id,tx))return true;}
 return false;
}
