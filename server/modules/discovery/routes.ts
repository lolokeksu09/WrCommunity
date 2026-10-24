import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {one,query} from '../../db/index.js';
import {parse,requireUser} from '../../lib.js';
import {decodeListingCursor,encodeListingCursor} from '../../listing-cursor.js';
import {roleAliases} from '../../../shared/game-roles.js';

type GameField={value:unknown;public:boolean};
type Player={id:string;handle:string;display_name:string;game:Record<string,GameField>};
type PlayerRow=Player&{cursor_at:string;score:number;reasons:string[]};
const filters=z.object({q:z.string().max(100).optional(),server:z.string().max(80).optional(),role:z.string().max(40).optional(),rank:z.string().max(80).optional(),language:z.string().max(80).optional(),champion:z.string().max(80).optional(),schedule:z.string().max(200).optional(),limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(300).optional()});
const gameKeys=['server','roles','rank','champions','schedule','timezone','languages'];
export function publicGame(game:Record<string,GameField>){return Object.fromEntries(gameKeys.filter(key=>game?.[key]?.public===true).map(key=>[key,{value:game[key]!.value,public:true}]));}

export async function registerDiscovery(app:FastifyInstance):Promise<void>{
 async function players(viewerId:string|null,values:z.infer<typeof filters>,own?:Player['game']){
  const ranked=own!==undefined,cursor=decodeListingCursor(values.cursor,ranked);
  const params:unknown[]=[viewerId];
  const bind=(value:unknown)=>{params.push(value);return '$'+params.length;};
  const where=["u.status='active'","u.visibility='public'",'($1::uuid IS NULL OR u.id<>$1)','NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))'];
  const roleMatch=(aliases:string[])=>`(u.game->'roles'->>'public'='true' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(u.game->'roles'->'value') AS role(value) WHERE lower(btrim(role.value))=ANY(${bind(aliases)}::text[])))`;
  if(values.q){const q=bind(values.q);where.push(`(u.handle ILIKE '%'||${q}||'%' OR u.display_name ILIKE '%'||${q}||'%')`);}
  if(values.role)where.push(roleMatch(roleAliases(values.role)));
  for(const [field,value,array] of [['server',values.server,false],['rank',values.rank,false],['languages',values.language,true],['champions',values.champion,true],['schedule',values.schedule,false]] as const){
   if(value){const p=bind(value);where.push(array?`(u.game->'${field}'->>'public'='true' AND u.game->'${field}'->'value' @> to_jsonb(ARRAY[${p}::text]))`:`(u.game->'${field}'->>'public'='true' AND lower(u.game->'${field}'->>'value')=lower(${p}::text))`);}
  }
  const matches:{sql:string;label:string;weight:number}[]=[];
  if(ranked){
   const preferredServer=values.server??(typeof own?.server?.value==='string'?own.server.value:null);
   const preferredRoles=values.role?[values.role]:Array.isArray(own?.roles?.value)?own.roles.value as string[]:[];
   const preferredLanguages=Array.isArray(own?.languages?.value)?own.languages.value as string[]:[];
   const preferredSchedule=typeof own?.schedule?.value==='string'?own.schedule.value:null;
   matches.push(
    {sql:`(u.game->'server'->>'public'='true' AND u.game->'server'->>'value'=${bind(preferredServer)}::text)`,label:'Тот же сервер',weight:4},
    {sql:roleMatch([...new Set(preferredRoles.flatMap(roleAliases))]),label:'Совпадает игровая роль',weight:3},
    {sql:`(u.game->'languages'->>'public'='true' AND (u.game->'languages'->'value') ?| ${bind(preferredLanguages)}::text[])`,label:'Общий язык',weight:1},
    {sql:`(u.game->'schedule'->>'public'='true' AND u.game->'schedule'->>'value'=${bind(preferredSchedule)}::text)`,label:'Совпадает расписание',weight:1},
   );
  }
  const score=matches.length?matches.map(m=>`CASE WHEN ${m.sql} THEN ${m.weight} ELSE 0 END`).join('+'):'0';
  const reasons=matches.length?`array_remove(ARRAY[${matches.map(m=>`CASE WHEN ${m.sql} THEN '${m.label}' END`).join(',')}],NULL)`:'ARRAY[]::text[]';
  let after='';
  if(cursor){const at=bind(cursor.at),id=bind(cursor.id);const chronological=`(created_at<${at}::timestamptz OR (created_at=${at}::timestamptz AND id>${id}::uuid))`;const s=ranked?bind(cursor.score):null;after='WHERE '+(s?`(score<${s} OR (score=${s} AND ${chronological}))`:chronological);}
  const limit=bind(values.limit+1);
  const rows=await query<PlayerRow>(`WITH candidates AS (
   SELECT u.id,u.handle,u.display_name,u.game,u.created_at,
   to_char(u.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
   (${score}) AS score,${reasons} AS reasons FROM users u WHERE ${where.join(' AND ')}
  ) SELECT * FROM candidates ${after} ORDER BY ${ranked?'score DESC,':''}created_at DESC,id ASC LIMIT ${limit}`,params);
  const page=rows.slice(0,values.limit);
  return {items:page.map(row=>({id:row.id,handle:row.handle,display_name:row.display_name,game:publicGame(row.game),...(ranked?{reasons:row.reasons.length?row.reasons:['Открытый профиль игрока']}:{})})),nextCursor:rows.length>values.limit?encodeListingCursor(page.at(-1)!,ranked):null};
 }
 for(const url of ['/api/v1/players','/api/v1/players/search'])app.get(url,async request=>players(request.viewer?.id??null,parse(filters,request.query)));
 app.get('/api/v1/players/recommendations',async request=>{const viewer=requireUser(request,false);const own=await one<{game:Player['game']}>('SELECT game FROM users WHERE id=$1',[viewer.id]);return players(viewer.id,parse(filters,request.query),own?.game??{});});
}
