import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createUser,request,closeTests} from './helpers.js';
import {execute,query} from '../server/db/index.js';

after(closeTests);

test('legacy role labels match canonical search and profile saves preserve unknown roles',async()=>{
 const viewer=await createUser(),legacy=await createUser(),privateRole=await createUser();
 const server='roles-'+randomUUID();
 for(const [user,visible] of [[legacy,true],[privateRole,false]] as const)await execute('UPDATE users SET game=$1::jsonb WHERE id=$2',[JSON.stringify({server:{value:server,public:true},roles:{value:['  МИД  '],public:visible}}),user.id]);
 const result=await request('GET','/players/search?server='+server+'&role=mid',viewer);
 assert.equal(result.statusCode,200,result.body);
 assert.deepEqual(result.json().items.map((p:{id:string})=>p.id),[legacy.id]);
 const profile=(await request('GET','/me/profile',legacy)).json();
 const saved=await request('PATCH','/me/profile',legacy,{version:profile.version,game:{roles:{value:['Мид','mid','SUPPORT','Особая роль'],public:false}}});
 assert.equal(saved.statusCode,200,saved.body);
 const own=(await request('GET','/me/profile',legacy)).json();
 assert.deepEqual(own.game.roles.value,['mid','support','Особая роль']);
 assert.equal(own.game.roles.public,false);
});

test('player and recommendation cursors cover tied timestamps and recheck current visibility and blocks',async()=>{
 const viewer=await createUser();const prefix='page_'+randomUUID().replaceAll('-','').slice(0,12);
 await execute('UPDATE users SET game=$1::jsonb WHERE id=$2',[JSON.stringify({roles:{value:['mid'],public:true}}),viewer.id]);
 for(let i=0;i<7;i++)await execute("INSERT INTO users(email,password_hash,handle,display_name,visibility,created_at,game) SELECT $1,password_hash,$2,$2,'public',$3::timestamptz,$4::jsonb FROM users WHERE id=$5",[`${prefix}${i}@example.com`,`${prefix}${i}`,`2026-01-01T00:00:00.00000${i%3}Z`,JSON.stringify({roles:{value:i%2?['Мид']:['support'],public:true}}),viewer.id]);
 const candidates=await query<{id:string}>('SELECT id FROM users WHERE handle LIKE $1',[prefix+'%']);
 for(const endpoint of ['/players/search','/players/recommendations']){
  let cursor:string|null=null;const seen:string[]=[];let firstCursor='';
  do{const response=await request('GET',endpoint+'?q='+prefix+'&limit=3'+(cursor?'&cursor='+encodeURIComponent(cursor):''),viewer);assert.equal(response.statusCode,200,response.body);const body=response.json();seen.push(...body.items.map((p:{id:string})=>p.id));cursor=body.nextCursor;if(!firstCursor)firstCursor=cursor??'';assert.ok(seen.length<=7,'cursor must make progress');}while(cursor);
  assert.equal(seen.length,7);assert.equal(new Set(seen).size,7);assert.deepEqual([...seen].sort(),candidates.map(p=>p.id).sort());
  const expected=await query<{id:string}>(`SELECT id FROM users WHERE handle LIKE $1 ORDER BY ${endpoint.endsWith('recommendations')?"(game->'roles'->'value'='[\"Мид\"]'::jsonb) DESC,":''}created_at DESC,id ASC`,[prefix+'%']);
  assert.deepEqual(seen,expected.map(row=>row.id));
  assert.equal((await request('GET',endpoint+'?cursor=not-a-cursor',viewer)).statusCode,422);
  assert.ok(firstCursor);
 }
 const first=(await request('GET','/players/search?q='+prefix+'&limit=3',viewer)).json();
 const rest=candidates.filter(p=>!first.items.some((shown:{id:string})=>shown.id===p.id));
 await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[rest[0]!.id]);
 for(const user of rest.slice(1))await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)',[user.id,viewer.id]);
 const next=await request('GET','/players/search?q='+prefix+'&limit=3&cursor='+encodeURIComponent(first.nextCursor),viewer);
 assert.equal(next.statusCode,200,next.body);assert.deepEqual(next.json().items,[]);assert.equal(next.json().nextCursor,null);
});

test('LFG cursors keep role aliases, expiry and visibility checks on every page',async()=>{
 const author=await createUser(),viewer=await createUser();const server='lfg-page-'+randomUUID();
 for(let i=0;i<7;i++)await execute("INSERT INTO lfg_announcements(author_id,server,roles,description,expires_at,pending_policy,created_at) VALUES($1,$2,$3::jsonb,$4,now()+interval '1 day','keep',$5::timestamptz)",[author.id,server,JSON.stringify([i%2?'Мид':'mid']),`Объявление ${i}`,`2026-01-01T00:00:00.00000${i%3}Z`]);
 let cursor:string|null=null;const seen:string[]=[];let firstCursor='';
 do{const response=await request('GET','/lfg?server='+server+'&role=mid&limit=3'+(cursor?'&cursor='+encodeURIComponent(cursor):''),viewer);assert.equal(response.statusCode,200,response.body);const body=response.json();seen.push(...body.items.map((p:{id:string})=>p.id));cursor=body.nextCursor;if(!firstCursor)firstCursor=cursor??'';assert.ok(seen.length<=7);}while(cursor);
 assert.equal(seen.length,7);assert.equal(new Set(seen).size,7);
 assert.equal((await request('GET','/lfg?cursor=not-a-cursor',viewer)).statusCode,422);
 await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)',[author.id,viewer.id]);
 const blocked=await request('GET','/lfg?server='+server+'&role=mid&limit=3&cursor='+encodeURIComponent(firstCursor),viewer);assert.deepEqual(blocked.json().items,[]);
 await execute('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',[author.id,viewer.id]);
 await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[author.id]);
 const hidden=await request('GET','/lfg?server='+server+'&role=mid&limit=3&cursor='+encodeURIComponent(firstCursor),viewer);assert.deepEqual(hidden.json().items,[]);
 await execute("UPDATE users SET visibility='public' WHERE id=$1",[author.id]);
 await execute("UPDATE lfg_announcements SET expires_at=now()-interval '1 second' WHERE server=$1",[server]);
 const expired=await request('GET','/lfg?server='+server+'&role=mid&limit=3&cursor='+encodeURIComponent(firstCursor),viewer);assert.equal(expired.statusCode,200,expired.body);assert.deepEqual(expired.json().items,[]);
});
