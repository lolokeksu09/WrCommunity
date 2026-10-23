import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { one, query } from '../../db/index.js';
import { parse, requireUser } from '../../lib.js';

type GameField = {value: unknown; public: boolean};
type Player = {id:string;handle:string;display_name:string;game:Record<string,GameField>};
const filters = z.object({q:z.string().max(100).optional(),server:z.string().max(80).optional(),role:z.string().max(40).optional(),rank:z.string().max(80).optional(),language:z.string().max(80).optional(),champion:z.string().max(80).optional(),schedule:z.string().max(200).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)});
const gameKeys = ['server','roles','rank','champions','schedule','timezone','languages'];
export function publicGame(game:Record<string,GameField>) {
  return Object.fromEntries(gameKeys.filter(key=>game?.[key]?.public===true).map(key=>[key,{value:game[key]!.value,public:true}]));
}

export async function registerDiscovery(app:FastifyInstance):Promise<void> {
  async function players(viewerId:string|null, values:z.infer<typeof filters>, own?:Player['game']) {
    const params:unknown[]=[viewerId];
    const where=["u.status='active'", "u.visibility='public'", '($1::uuid IS NULL OR u.id<>$1)', 'NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))'];
    function add(sql:string,value:unknown) { params.push(value);where.push(sql.replaceAll('?',`$${params.length}`)); }
    if(values.q) add("(u.handle ILIKE '%' || ? || '%' OR u.display_name ILIKE '%' || ? || '%')",values.q);
    for(const [field,value,array] of [['server',values.server,false],['roles',values.role,true],['rank',values.rank,false],['languages',values.language,true],['champions',values.champion,true],['schedule',values.schedule,false]] as const) {
      if(value) add(array ? `(u.game->'${field}'->>'public'='true' AND u.game->'${field}'->'value' @> to_jsonb(ARRAY[?::text]))` : `(u.game->'${field}'->>'public'='true' AND lower(u.game->'${field}'->>'value')=lower(?::text))`,value);
    }
    const recommendations=Boolean(own);
    // Scoring uses only candidate fields individually published by their owner.
    const preferredServer=values.server??(typeof own?.server?.value==='string'?own.server.value:undefined);
    const preferredRoles=values.role?[values.role]:Array.isArray(own?.roles?.value)?own.roles.value as string[]:[];
    const preferredLanguages=Array.isArray(own?.languages?.value)?own.languages.value as string[]:[];
    const preferredSchedule=typeof own?.schedule?.value==='string'?own.schedule.value:undefined;
    if(!recommendations) {
      params.push(values.limit);
      const rows=await query<Player>(`SELECT u.id,u.handle,u.display_name,u.game FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC,u.id LIMIT $${params.length}`,params);
      return rows.map(row=>({...row,game:publicGame(row.game)}));
    }
    params.push(preferredServer??null,preferredRoles,preferredLanguages,preferredSchedule??null,values.limit);
    const n=params.length;
    const rows=await query<Player & {reasons:string[]}>(`SELECT u.id,u.handle,u.display_name,u.game,
      array_remove(ARRAY[
      CASE WHEN u.game->'server'->>'public'='true' AND u.game->'server'->>'value'=$${n-4} THEN 'Тот же сервер' END,
      CASE WHEN u.game->'roles'->>'public'='true' AND (u.game->'roles'->'value') ?| $${n-3}::text[] THEN 'Совпадает игровая роль' END,
      CASE WHEN u.game->'languages'->>'public'='true' AND (u.game->'languages'->'value') ?| $${n-2}::text[] THEN 'Общий язык' END,
      CASE WHEN u.game->'schedule'->>'public'='true' AND u.game->'schedule'->>'value'=$${n-1} THEN 'Совпадает расписание' END],NULL) AS reasons
      FROM users u WHERE ${where.join(' AND ')} ORDER BY
      (CASE WHEN u.game->'server'->>'public'='true' AND u.game->'server'->>'value'=$${n-4} THEN 4 ELSE 0 END +
       CASE WHEN u.game->'roles'->>'public'='true' AND (u.game->'roles'->'value') ?| $${n-3}::text[] THEN 3 ELSE 0 END +
       CASE WHEN u.game->'languages'->>'public'='true' AND (u.game->'languages'->'value') ?| $${n-2}::text[] THEN 1 ELSE 0 END +
       CASE WHEN u.game->'schedule'->>'public'='true' AND u.game->'schedule'->>'value'=$${n-1} THEN 1 ELSE 0 END) DESC,u.created_at DESC,u.id LIMIT $${n}`,params);
    return rows.map(row=>({...row,game:publicGame(row.game),reasons:row.reasons.length?row.reasons:['Открытый профиль игрока']}));
  }
  for(const url of ['/api/v1/players','/api/v1/players/search']) app.get(url,async request=>({items:await players(request.viewer?.id??null,parse(filters,request.query))}));
  app.get('/api/v1/players/recommendations',async request=>{
    const viewer=requireUser(request,false);
    const own=await one<{game:Player['game']}>('SELECT game FROM users WHERE id=$1',[viewer.id]);
    return {items:await players(viewer.id,parse(filters,request.query),own?.game??{})};
  });
}
