import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createUser,request,closeTests,type TestUser} from './helpers.js';
import {execute,one} from '../server/db/index.js';

after(closeTests);
async function club(owner:TestUser){
 const c=(await one<{id:string}>("INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility) VALUES($1,'История клуба','Проверка полной истории клуба','open','public') RETURNING id",[owner.id]))!;
 await execute("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consented_at,consent_version) VALUES($1,$2,'owner','active','Владелец','владелец',now(),1)",[c.id,owner.id]);return c.id;
}
async function post(clubId:string,authorId:string,index:number){
 const p=(await one<{id:string}>("INSERT INTO posts(author_id,club_id,state,audience,created_at) VALUES($1,$2,'pending','public',$3::timestamptz) RETURNING id",[authorId,clubId,`2026-01-01T00:00:00.00000${index%3}Z`]))!;
 const r=(await one<{id:string}>("INSERT INTO post_revisions(post_id,body,status) VALUES($1,$2,'approved') RETURNING id",[p.id,'Запись '+index]))!;
 await execute("UPDATE posts SET state='published',current_revision_id=$2 WHERE id=$1",[p.id,r.id]);return p.id;
}
async function event(clubId:string,ownerId:string,title:string,start:string,state='open',audience='public'){
 return (await one<{id:string}>("INSERT INTO events(club_id,creator_id,title,description,audience,starts_at,ends_at,registration_closes_at,capacity,state,created_at) VALUES($1,$2,$3,'Встреча клуба',$4,$5::timestamptz,$5::timestamptz+interval '1 hour',$5::timestamptz-interval '1 hour',5,$6,'2026-01-01T00:00:00.000001Z') RETURNING id",[clubId,ownerId,title,audience,start,state]))!.id;
}
async function pages(path:string,user?:TestUser){
 const items:any[]=[];const url=new URL(path,'http://local');let cursor=url.searchParams.get('cursor');let count=0;
 do{if(cursor)url.searchParams.set('cursor',cursor);else url.searchParams.delete('cursor');const r=await request('GET',url.pathname+'?'+url.searchParams,user);assert.equal(r.statusCode,200,r.body);const data=r.json();items.push(...data.items);cursor=data.nextCursor;assert.ok(++count<200,'Pagination must terminate');}while(cursor);
 return items;
}

test('club feed pages beyond100 with old pin, precise ties and current ACL on every page',async()=>{
 const owner=await createUser(),reader=await createUser(),writer=await createUser();const id=await club(owner);
 const ids=[];for(let i=0;i<105;i++)ids.push(await post(id,owner.id,i));
 const pin=ids[0];await execute('UPDATE posts SET created_at=$2 WHERE id=$1',[pin,'2000-01-01T00:00:00Z']);
 await execute('UPDATE clubs SET pinned_post_id=$2 WHERE id=$1',[id,pin]);
 for(let i=0;i<4;i++)await post(id,writer.id,200+i);
 const e=await event(id,owner.id,'Смешанная встреча','2050-01-01T10:00:00Z');
 const first=await request('GET',`/clubs/${id}/feed?limit=7`,reader);assert.equal(first.statusCode,200,first.body);
 assert.equal(first.json().items[0].id,pin);assert.equal(first.json().items[0].pinned,true);assert.equal(first.json().items.length,7);assert.ok(first.json().nextCursor);
 const all=await pages(`/clubs/${id}/feed?limit=7`,reader);
 assert.equal(all.length,110);assert.equal(new Set(all.map(p=>p.kind+':'+p.id)).size,110);assert.equal(all.filter(p=>p.pinned).length,1);assert.ok(all.some(p=>p.id===e&&p.kind==='event'));
 for(const item of ids)assert.ok(all.some(p=>p.id===item));
 const cursor=first.json().nextCursor;
 assert.equal((await request('GET',`/clubs/${id}/feed?cursor=bad`,reader)).statusCode,422);
 assert.equal((await request('GET',`/clubs/${id}/feed?view=upcoming&cursor=${cursor}`,reader)).statusCode,422);
 const other=await club(reader);assert.equal((await request('GET',`/clubs/${other}/feed?cursor=${cursor}`,reader)).statusCode,422);
 await execute('UPDATE clubs SET pinned_post_id=NULL WHERE id=$1',[id]);assert.equal((await request('GET',`/clubs/${id}/feed?cursor=${cursor}`,reader)).statusCode,422);
 await execute('UPDATE clubs SET pinned_post_id=$2 WHERE id=$1',[id,pin]);
 const head=(await request('GET',`/clubs/${id}/feed?limit=1`,reader)).json();
 await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)',[writer.id,reader.id]);
 const after=await pages(`/clubs/${id}/feed?limit=7&cursor=${head.nextCursor}`,reader);assert.ok(after.every(p=>p.author_id!==writer.id));
 await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[owner.id]);
 const hidden=await pages(`/clubs/${id}/feed?limit=7&cursor=${head.nextCursor}`,reader);assert.ok(hidden.every(p=>p.kind!=='post'));
 await execute("UPDATE clubs SET feed_visibility='members_only' WHERE id=$1",[id]);
 assert.deepEqual((await request('GET',`/clubs/${id}/feed?cursor=${head.nextCursor}`,reader)).json().items,[]);
 assert.deepEqual((await request('GET',`/clubs/${id}/feed`)).json().items,[]);
});

test('club event views sort by start, split ongoing/history/cancellation and preserve consent privacy',async()=>{
 const owner=await createUser(),member=await createUser({visibility:'hidden'});const id=await club(owner);
 await execute("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consented_at,consent_version) VALUES($1,$2,'member','active','Скрытый участник','скрытый участник',now(),1)",[id,member.id]);
 const late=await event(id,owner.id,'Позже','2050-01-01T10:00:00.000002Z');
 const early=await event(id,owner.id,'Раньше','2050-01-01T10:00:00.000000Z');
 const middle=await event(id,owner.id,'Между','2050-01-01T10:00:00.000001Z');
 const secret=await event(id,owner.id,'Закрытая встреча','2050-01-01T09:00:00Z','open','members_only');
 const past=await event(id,owner.id,'Истёкшая','2001-01-01T00:00:00Z');
 const cancelled=await event(id,owner.id,'Отмена','2050-01-01T11:00:00Z','cancelled');
 const ongoing=await event(id,owner.id,'Сейчас',new Date(Date.now()-1800000).toISOString());
 await execute('INSERT INTO event_registrations(event_id,user_id) VALUES($1,$2)',[early,member.id]);
 const publicItems=await pages(`/clubs/${id}/feed?view=upcoming&limit=1`);
 assert.deepEqual(publicItems.map(e=>e.id),[ongoing,early,middle,late]);
 const publicEarly=publicItems.find(e=>e.id===early);assert.equal(publicEarly.my_registration,null);assert.equal(publicEarly.registered_count,undefined);assert.equal(publicEarly.visible_registered_count,0);
 const own=await pages(`/clubs/${id}/feed?view=upcoming&limit=2`,member);assert.deepEqual(own.map(e=>e.id),[ongoing,secret,early,middle,late]);assert.equal(own.find(e=>e.id===early).my_registration,'active');
 assert.deepEqual((await pages(`/clubs/${id}/feed?view=past&limit=1`)).map(e=>[e.id,e.state]),[[past,'completed']]);
 assert.deepEqual((await pages(`/clubs/${id}/feed?view=cancelled&limit=1`)).map(e=>e.id),[cancelled]);
 const initial=(await request('GET',`/clubs/${id}/feed?view=upcoming&limit=1`,member)).json();
 await execute("UPDATE club_memberships SET state='left',revoked_at=now() WHERE club_id=$1 AND user_id=$2",[id,member.id]);
 const after=await request('GET',`/clubs/${id}/feed?view=upcoming&limit=1&cursor=${initial.nextCursor}`,member);assert.equal(after.statusCode,200,after.body);assert.equal(after.json().items[0].id,early);
 assert.equal((await request('GET',`/clubs/${id}/feed?limit=0`)).statusCode,422);assert.equal((await request('GET',`/clubs/${id}/feed?view=unknown`)).statusCode,422);
});
