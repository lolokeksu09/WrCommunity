import type { PoolClient } from 'pg';
import { query, one, lockPair } from '../../db/index.js';
import { blocked, canReadPost } from '../policy/service.js';

export const mediaURL=(id:string|null)=>id?`/api/v1/media/${id}`:null;
export async function lockPairs(tx:PoolClient, pairs:Array<[string,string]>):Promise<void>{
 const keys=[...new Set(pairs.filter(([a,b])=>a!==b).map(([a,b])=>[a,b].sort().join(':')))].sort();
 for(const key of keys){const [a,b]=key.split(':');await lockPair(tx,a!,b!);}
}
export async function authorDTO(authorId:string|null,viewerId:string|null,tx?:PoolClient){
 if(!authorId) return {id:null,handle:null,display_name:'Удалённый участник',avatar_url:null,profile_url:null};
 const a=await one<{id:string;handle:string;display_name:string;visibility:string;status:string;avatar_id:string|null;editorial:boolean}>("SELECT id,handle,display_name,visibility,status,avatar_id,(password_hash='!wrc-editorial-no-login-v1' AND email LIKE '%@example.invalid') AS editorial FROM users WHERE id=$1",[authorId],tx);
 if(!a || a.status==='deleted') return {id:null,handle:null,display_name:'Удалённый участник',avatar_url:null,profile_url:null};
 if(a.visibility!=='public' && viewerId!==a.id) return {id:null,handle:a.handle,display_name:a.display_name,avatar_url:null,profile_url:null};
 return {id:a.id,handle:a.handle,display_name:a.display_name,avatar_url:mediaURL(a.avatar_id),profile_url:`/profiles/${a.id}`,editorial:a.editorial};
}
const commentVisibility=`c.state='published' AND (c.author_id IS NULL OR u.status IN ('active','deleted')) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=c.author_id) OR (b.blocked_id=$2 AND b.blocker_id=c.author_id)))`;
export async function visibleComments(postId:string,viewerId:string|null,tx?:PoolClient,options:{limit?:number;cursor?:[string,string]|null;id?:string}={}){
 if(!await canReadPost(viewerId,postId,tx)) return [];
 const params:unknown[]=[postId,viewerId];let extra='';
 if(options.cursor){params.push(...options.cursor);extra+=` AND (c.created_at,c.id)>($${params.length-1}::timestamptz,$${params.length}::uuid)`;}
 if(options.id){params.push(options.id);extra+=` AND c.id=$${params.length}`;}
 params.push(options.limit||50);
 const rows=await query<any>(`SELECT c.*,to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_created_at,u.status author_status,p.club_id,CASE WHEN parent.state='published' AND (parent.author_id IS NULL OR parent_user.status IN ('active','deleted')) AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=parent.author_id) OR (b.blocked_id=$2 AND b.blocker_id=parent.author_id))) THEN c.parent_id ELSE NULL END visible_parent_id FROM comments c LEFT JOIN users u ON u.id=c.author_id JOIN posts p ON p.id=c.post_id LEFT JOIN comments parent ON parent.id=c.parent_id LEFT JOIN users parent_user ON parent_user.id=parent.author_id WHERE c.post_id=$1 AND ${commentVisibility}${extra} ORDER BY c.created_at,c.id LIMIT $${params.length}`,params,tx);
 return Promise.all(rows.map(async c=>({id:c.id,post_id:c.post_id,parent_id:c.visible_parent_id,body:c.body,created_at:c.cursor_created_at,updated_at:c.updated_at,can_edit:viewerId===c.author_id,can_block:!!viewerId&&viewerId!==c.author_id&&c.author_status==='active',can_moderate:!!(c.club_id&&viewerId&&await one("SELECT m.id FROM club_memberships m JOIN users u ON u.id=m.user_id JOIN clubs k ON k.id=m.club_id WHERE m.club_id=$1 AND m.user_id=$2 AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL AND m.role IN ('owner','admin','moderator') AND u.status='active' AND u.verified_at IS NOT NULL AND k.state='active'",[c.club_id,viewerId],tx)),author:c.author_status==='deleted'||!c.author_id?await authorDTO(null,viewerId,tx):c.club_id&&c.snapshot_nickname?{id:null,handle:null,display_name:c.snapshot_nickname,avatar_url:mediaURL(c.snapshot_avatar_id),profile_url:null}:await authorDTO(c.author_id,viewerId,tx)})));
}
export async function visibleCommentCount(postId:string,viewerId:string|null,tx?:PoolClient){
 const result=await one<{count:string}>(`SELECT count(*) count FROM comments c LEFT JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 AND ${commentVisibility}`,[postId,viewerId],tx);return Number(result?.count||0);
}
export async function postDTO(postId:string,viewerId:string|null,tx?:PoolClient):Promise<any|null>{
 if(!await canReadPost(viewerId,postId,tx)) return null;
 const p=await one<any>(`SELECT p.*,r.body,r.images,r.tags FROM posts p JOIN post_revisions r ON r.id=p.current_revision_id WHERE p.id=$1`,[postId],tx);
 if(!p) return null;
 const reaction=await one<{count:string}>(`SELECT count(*) count FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.post_id=$1 AND u.status='active' AND u.visibility='public' AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=r.user_id) OR (b.blocked_id=$2 AND b.blocker_id=r.user_id)))`,[postId,viewerId],tx);
 const flags=viewerId?await one<any>('SELECT EXISTS(SELECT 1 FROM reactions WHERE user_id=$1 AND post_id=$2) liked,EXISTS(SELECT 1 FROM bookmarks WHERE user_id=$1 AND post_id=$2) bookmarked',[viewerId,postId],tx):{liked:false,bookmarked:false};
 return {id:p.id,author_id:p.author_id,club_id:p.club_id,state:p.state,audience:p.audience,body:p.body,images:p.images.map((id:string)=>({id,url:mediaURL(id)})),tags:p.tags,created_at:p.created_at,updated_at:p.updated_at,revision_id:p.current_revision_id,can_edit:viewerId===p.author_id&&!p.club_id,author:await authorDTO(p.author_id,viewerId,tx),like_count:Number(reaction?.count||0),comment_count:await visibleCommentCount(postId,viewerId,tx),...flags};
}
export async function countVisibleFollows(profileId:string,viewerId:string|null,direction:'followers'|'following',tx?:PoolClient){
 const from=direction==='followers'?'followee_id':'follower_id';
 const to=direction==='followers'?'follower_id':'followee_id';
 const rows=await query<{id:string}>(`SELECT u.id FROM follows f JOIN users u ON u.id=f.${to} WHERE f.${from}=$1 AND u.visibility='public' AND u.status='active' AND ($2::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2 AND b.blocked_id=u.id) OR (b.blocked_id=$2 AND b.blocker_id=u.id))) ORDER BY f.created_at DESC,u.id`,[profileId,viewerId],tx);
 return rows;
}
export async function assertUnblocked(a:string,b:string,tx?:PoolClient){return !await blocked(a,b,tx);}
