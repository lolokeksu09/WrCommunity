import {z} from 'zod';
import {query} from '../../db/index.js';
import {fail} from '../../lib.js';
import {canReadClubContent,requireClub} from '../clubs/service.js';
import {postDTO} from '../social/service.js';
import {canReadEvent,eventDTO,eventRow} from '../events/service.js';

const views=['feed','upcoming','past','cancelled'] as const;
export type ClubListingView=typeof views[number];
export const clubListingQuery=z.object({view:z.enum(views).default('feed'),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(900).optional()});
const cursorSchema=z.object({version:z.literal(1),club:z.string().uuid(),view:z.enum(views),pin:z.string().uuid().nullable(),rank:z.union([z.literal(0),z.literal(1)]),at:z.string().datetime({offset:true}),id:z.string().uuid(),kind:z.enum(['post','event'])}).strict();
type Cursor=z.infer<typeof cursorSchema>;
type Candidate={id:string;kind:'post'|'event';rank:0|1;cursor_at:string};
const invalid=()=>fail(422,'invalid_cursor','Порядок ленты изменился или курсор недействителен. Открой клуб заново.');
function decode(value:string|undefined,club:string,view:ClubListingView,pin:string|null):Cursor|null{
 if(value===undefined)return null;
 try{
  if(!/^[A-Za-z0-9_-]+$/.test(value))return invalid();
  const c=cursorSchema.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')));
  if(c.club!==club||c.view!==view||c.pin!==pin||(view!=='feed'&&(c.rank!==1||c.kind!=='event')))return invalid();
  return c;
 }catch{return invalid();}
}
function encode(row:Candidate,club:string,view:ClubListingView,pin:string|null){return Buffer.from(JSON.stringify({version:1,club,view,pin,rank:row.rank,at:row.cursor_at,id:row.id,kind:row.kind})).toString('base64url');}

export async function clubListing(clubId:string,viewerId:string|null,input:{view:ClubListingView;limit:number;cursor?:string}){
 const club=await requireClub(clubId);const pin=input.view==='feed'?club.pinned_post_id:null;
 let cursor=decode(input.cursor,clubId,input.view,pin);
 if(!await canReadClubContent(viewerId,clubId,club.feed_visibility))return {items:[],nextCursor:null};
 const member=await canReadClubContent(viewerId,clubId,'members_only');
 const ascending=input.view==='upcoming';
 const eventFilter=input.view==='upcoming'?"e.state='open' AND e.ends_at>clock_timestamp()":input.view==='past'?"e.state<>'cancelled' AND (e.state='completed' OR e.ends_at<=clock_timestamp())":input.view==='cancelled'?"e.state='cancelled'":'true';
 const eventTime=input.view==='feed'?'e.created_at':'e.starts_at';
 const sources=[...(input.view==='feed'?[`SELECT p.id,'post'::text AS kind,p.created_at AS at,CASE WHEN p.id=$2::uuid THEN 0 ELSE 1 END AS rank
  FROM posts p JOIN users u ON u.id=p.author_id WHERE p.club_id=$1 AND p.state='published' AND (p.audience='public' OR $4::boolean)
  AND u.status='active' AND (u.visibility='public' OR u.id=$3::uuid)
  AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id))`]:[]),
  `SELECT e.id,'event'::text AS kind,${eventTime} AS at,1 AS rank FROM events e WHERE e.club_id=$1 AND ${eventFilter} AND (e.audience='public' OR $4::boolean)`];
 const items:Record<string,unknown>[]=[];let last:Candidate|undefined;
 // Candidate batches are bounded, but invisible candidates never truncate history.
 while(true){
  const params:unknown[]=[clubId,pin,viewerId,member];let after='';
  if(cursor){params.push(cursor.rank,cursor.at,cursor.id,cursor.kind);after=`WHERE rank>$5 OR (rank=$5 AND (at${ascending?'>':'<'}$6::timestamptz OR (at=$6::timestamptz AND (id<$7::uuid OR (id=$7::uuid AND kind>$8::text)))))`;}
  // Event-only views still bind the shared pin/viewer slots with explicit types.
  const rows=await query<Candidate>(`WITH context AS (SELECT $2::uuid AS pin,$3::uuid AS viewer),entries AS (${sources.join(' UNION ALL ')})
   SELECT id,kind,rank,to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM entries ${after}
   ORDER BY rank ASC,at ${ascending?'ASC':'DESC'},id DESC,kind ASC LIMIT 100`,params);
  for(const row of rows){
   let item:Record<string,unknown>|undefined;
   if(row.kind==='post'){const post=await postDTO(row.id,viewerId);if(post)item={kind:'post',...post,pinned:row.rank===0};}
   else{const event=await eventRow(row.id);if(event&&await canReadEvent(event,viewerId))item={kind:'event',...await eventDTO(event,viewerId)};}
   if(!item)continue;
   if(items.length===input.limit)return {items,nextCursor:encode(last!,clubId,input.view,pin)};
   items.push(item);last=row;
  }
  if(rows.length<100)return {items,nextCursor:null};
  const tail=rows.at(-1)!;cursor={version:1,club:clubId,view:input.view,pin,rank:tail.rank,at:tail.cursor_at,id:tail.id,kind:tail.kind};
 }
}
