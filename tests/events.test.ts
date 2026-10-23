import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createUser, request, closeTests } from './helpers.js';
import { execute, one } from '../server/db/index.js';

after(closeTests);

async function fixture(capacity=1) {
  const owner = await createUser({visibility:'public'});
  const hidden = await createUser({visibility:'hidden'});
  const member = await createUser({visibility:'public'});
  const club = await one<{id:string}>("INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility,event_roles) VALUES($1,'События','Тестовый клуб для событий','open','public','[\"owner\",\"admin\"]') RETURNING id",[owner.id]);
  for(const [user,role,nickname] of [[owner,'owner','Организатор'],[hidden,'admin','Клубный псевдоним'],[member,'member','Участник']] as const) {
    await execute("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,roles) VALUES($1,$2,$3,'active',$4,$4,1,now(),'[\"support\"]')",[club!.id,user.id,role,nickname]);
  }
  const event = {title:'Вечер совместной игры',description:'Играем вместе в клубе',audience:'public',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+90000000).toISOString(),registration_closes_at:new Date(Date.now()+80000000).toISOString(),capacity};
  return {owner,hidden,member,clubId:club!.id,event};
}

test('event final seat is race safe, cancellation releases seat and nonmembers cannot register',async()=>{
  const f=await fixture();
  const created=await request('POST',`/api/v1/clubs/${f.clubId}/events`,f.owner,f.event);
  assert.equal(created.statusCode,201,created.body);
  const id=created.json().id;
  const results=await Promise.all([request('POST',`/api/v1/events/${id}/registration`,f.hidden),request('POST',`/api/v1/events/${id}/registration`,f.member)]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const winner=results[0].statusCode===200?f.hidden:f.member;
  const loser=results[0].statusCode===200?f.member:f.hidden;
  assert.equal((await request('DELETE',`/api/v1/events/${id}/registration`,winner)).statusCode,200);
  assert.equal((await request('POST',`/api/v1/events/${id}/registration`,loser)).statusCode,200);
  const outside=await createUser({visibility:'public'});
  assert.equal((await request('POST',`/api/v1/events/${id}/registration`,outside)).statusCode,403);
});

test('hidden creator acts as club and hidden registrations have no public identity or differential count',async()=>{
  const f=await fixture(2);
  const response=await request('POST',`/api/v1/clubs/${f.clubId}/events`,f.hidden,f.event);
  assert.equal(response.statusCode,201,response.body);
  const id=response.json().id;
  await request('POST',`/api/v1/events/${id}/registration`,f.hidden);
  const guest=(await request('GET',`/api/v1/events/${id}`)).json();
  assert.equal(guest.creator_id,undefined);
  assert.equal(guest.registered_count,undefined);
  assert.equal(guest.visible_registered_count,0);
  assert.equal(guest.organizer.id,f.clubId);
  assert.equal((await request('GET',`/api/v1/events/${id}/registrations`)).json().items.length,0);
  const roster=(await request('GET',`/api/v1/events/${id}/registrations`,f.owner)).json();
  assert.equal(roster.items[0].nickname,'Клубный псевдоним');
  assert.equal(roster.items[0].profile_id,undefined);
});

test('event audience archive and permission checks and update/cancel outbox',async()=>{
  const f=await fixture(2);
  assert.equal((await request('POST',`/api/v1/clubs/${f.clubId}/events`,f.member,f.event)).statusCode,403);
  const id=(await request('POST',`/api/v1/clubs/${f.clubId}/events`,f.owner,{...f.event,audience:'members_only'})).json().id;
  assert.equal((await request('GET',`/api/v1/events/${id}`)).statusCode,404);
  await request('POST',`/api/v1/events/${id}/registration`,f.hidden);
  const update=await request('PATCH',`/api/v1/events/${id}`,f.owner,{title:'Обновлённый вечер игры'});
  assert.equal(update.statusCode,200,update.body);
  let outbox=await one<{count:string}>("SELECT count(*) FROM outbox WHERE payload->>'objectId'=$1 OR payload->>'object_id'=$1",[id]);
  assert.ok(Number(outbox?.count)>0);
  assert.equal((await request('POST',`/api/v1/events/${id}/cancel`,f.owner)).statusCode,200);
  assert.equal((await request('POST',`/api/v1/events/${id}/registration`,f.member)).statusCode,409);
  await execute("UPDATE clubs SET state='archived' WHERE id=$1",[f.clubId]);
  assert.equal((await request('GET',`/api/v1/events/${id}`,f.member)).statusCode,200);
  assert.equal((await request('PATCH',`/api/v1/events/${id}`,f.owner,{title:'Архивная правка'})).statusCode,409);
});

test('revoked organizer event permission and registration deadlines are checked from DB each time',async()=>{
  const f=await fixture(2);
  const id=(await request('POST',`/api/v1/clubs/${f.clubId}/events`,f.hidden,f.event)).json().id;
  await execute('UPDATE clubs SET event_roles=$2::jsonb WHERE id=$1',[f.clubId,'["owner"]']);
  assert.equal((await request('PATCH',`/api/v1/events/${id}`,f.hidden,{title:'Нет больше права'})).statusCode,403);
  assert.equal((await request('POST',`/api/v1/events/${id}/cancel`,f.hidden)).statusCode,403);
  await execute("UPDATE events SET registration_closes_at=clock_timestamp()-interval '1 second' WHERE id=$1",[id]);
  assert.equal((await request('POST',`/api/v1/events/${id}/registration`,f.member)).statusCode,409);
});

test('club feed visibility changes do not publish a members-only event archive',async()=>{
  const f=await fixture(2);
  await execute("UPDATE clubs SET feed_visibility='members_only' WHERE id=$1",[f.clubId]);
  const id=(await request('POST',`/api/v1/clubs/${f.clubId}/events`,f.hidden,{...f.event,audience:'members_only'})).json().id;
  await execute("UPDATE clubs SET feed_visibility='public' WHERE id=$1",[f.clubId]);
  assert.equal((await request('GET',`/api/v1/events/${id}`)).statusCode,404);
  const list=(await request('GET',`/api/v1/clubs/${f.clubId}/events`)).json();
  assert.equal(list.items.some((event:{id:string})=>event.id===id),false);
  assert.equal((await request('GET',`/api/v1/events/${id}`,f.member)).statusCode,200);
});
