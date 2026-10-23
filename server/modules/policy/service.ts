import type { PoolClient } from 'pg';
import { one } from '../../db/index.js';

export async function blocked(a: string, b: string, tx?: PoolClient): Promise<boolean> {
 if(a===b) return false;
 return !!(await one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[a,b],tx));
}
export async function canReadProfile(viewerId: string|null, profileId: string, tx?: PoolClient): Promise<boolean> {
 const user=await one<{status:string;visibility:string}>('SELECT status,visibility FROM users WHERE id=$1',[profileId],tx);
 if(!user || user.status!=='active') return false;
 if(viewerId===profileId) return true;
 return user.visibility==='public' && (!viewerId || !await blocked(viewerId,profileId,tx));
}
export async function canReadPost(viewerId: string|null, postId: string, tx?: PoolClient): Promise<boolean> {
 const p=await one<{author_id:string;state:string;club_id:string|null;audience:string;status:string;visibility:string;club_state:string|null;feed_visibility:string|null;revision_status:string|null}>(`SELECT p.author_id,p.state,p.club_id,p.audience,u.status,u.visibility,c.state club_state,c.feed_visibility,r.status revision_status FROM posts p JOIN users u ON u.id=p.author_id LEFT JOIN clubs c ON c.id=p.club_id LEFT JOIN post_revisions r ON r.id=p.current_revision_id WHERE p.id=$1`,[postId],tx);
 if(!p || p.status!=='active' || p.state==='removed') return false;
 if(viewerId && await blocked(viewerId,p.author_id,tx)) return false;
 if(p.visibility!=='public' && viewerId!==p.author_id) return false;
 if(p.state!=='published' && viewerId!==p.author_id) return false;
 if(p.state==='published' && p.revision_status!=='approved') return false;
 if(p.club_id){
  if(p.club_state==='deleted') return false;
  if(p.audience==='members_only' || p.feed_visibility==='members_only'){
   if(!viewerId) return false;
   const m=await one(`SELECT 1 FROM club_memberships WHERE club_id=$1 AND user_id=$2 AND state='active' AND consented_at IS NOT NULL AND revoked_at IS NULL`,[p.club_id,viewerId],tx);
   if(!m) return false;
  }
 }
 return true;
}
