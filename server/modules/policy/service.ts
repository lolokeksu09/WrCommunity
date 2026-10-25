import type { PoolClient } from 'pg';
import { one } from '../../db/index.js';

export async function blocked(a: string, b: string, tx?: PoolClient): Promise<boolean> {
 if(a===b) return false;
 return !!(await one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[a,b],tx));
}
export async function canReadProfile(viewerId: string|null, profileId: string, tx?: PoolClient): Promise<boolean> {
 const row=await one<{allowed:boolean}>(`SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1 AND ${profileReadSql('$2::uuid')}) AS allowed`,[profileId,viewerId],tx);
 return row?.allowed??false;
}
export async function canReadPost(viewerId: string|null, postId: string, tx?: PoolClient): Promise<boolean> {
 const row=await one<{allowed:boolean}>(`SELECT EXISTS(SELECT 1 FROM posts p JOIN users u ON u.id=p.author_id LEFT JOIN clubs c ON c.id=p.club_id LEFT JOIN post_revisions r ON r.id=p.current_revision_id WHERE p.id=$1 AND ${postReadSql('$2::uuid')}) AS allowed`,[postId,viewerId],tx);
 return row?.allowed??false;
}

// Only internal SQL parameter/alias literals are accepted, never request values.
// The same predicates serve individual reads and set-based notification queries.
export function unblockedSql(viewer:string,other:string):string{
 return `NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=${viewer} AND b.blocked_id=${other}) OR (b.blocked_id=${viewer} AND b.blocker_id=${other}))`;
}
export function profileReadSql(viewer:string,alias='u'):string{
 return `(${alias}.status='active' AND (${alias}.id=${viewer} OR (${alias}.visibility='public' AND ${unblockedSql(viewer,alias+'.id')})))`;
}
export function postReadSql(viewer:string):string{
 return `(u.status='active' AND p.state<>'removed' AND ${unblockedSql(viewer,'p.author_id')}
  AND (u.visibility='public' OR p.author_id=${viewer}) AND (p.state='published' OR p.author_id=${viewer})
  AND (p.state<>'published' OR r.status='approved')
  AND (p.club_id IS NULL OR (c.state<>'deleted' AND ((p.audience<>'members_only' AND c.feed_visibility<>'members_only') OR EXISTS(
   SELECT 1 FROM club_memberships m WHERE m.club_id=p.club_id AND m.user_id=${viewer} AND m.state='active' AND m.consented_at IS NOT NULL AND m.revoked_at IS NULL)))))`;
}
