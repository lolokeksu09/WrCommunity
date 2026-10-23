import test from 'node:test';
import assert from 'node:assert/strict';
import {app,createUser,request,closeTests,type TestUser} from './helpers.js';
import {execute,one,query} from '../server/db/index.js';

test.after(closeTests);
const identity=(nickname='Игрок клуба')=>({nickname,roles:['support'],consent:true,consent_version:1,history_acknowledged:true});
const clubBody={name:'Клуб совместной игры',description:'Встречаемся, чтобы играть вместе',join_mode:'open',feed_visibility:'public'};
async function fixture(options:{join?:'open'|'approval';feed?:'public'|'members_only';owner?:TestUser}={}) {
  const owner=options.owner??await createUser();
  const c=(await one<{id:string}>("INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility) VALUES($1,'Тестовый клуб','Клуб для проверки правил',$2,$3) RETURNING id",[owner.id,options.join??'open',options.feed??'public']))!;
  const m=(await one<{id:string}>("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,joined_at) VALUES($1,$2,'owner','active',$3,$3,1,now(),now()) RETURNING id",[c.id,owner.id,owner.viewer.handle]))!;
  return {owner,id:c.id,ownerMembership:m.id};
}
async function addMember(clubId:string,user:TestUser,role='member',nickname='Участник клуба') {
  return (await one<{id:string}>("INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,joined_at) VALUES($1,$2,$3,'active',$4,$4,1,now(),now()) RETURNING id",[clubId,user.id,role,nickname]))!;
}
async function submit(clubId:string,user:TestUser,body='Первая клубная редакция') {
  const r=await request('POST',`/clubs/${clubId}/posts`,user,{body});assert.equal(r.statusCode,201,r.body);return r.json();
}
async function decide(post:any,reviewer:TestUser,reason?:string) {
  return request('POST',`/clubs/posts/${post.id}/revisions/${post.revision.id}/decision`,reviewer,{decision:'approve',...(reason?{reason}:{})});
}

test('club creation has explicit modes, verified public gating, rate gates and idempotent retries',async()=>{
  const hidden=await createUser({visibility:'hidden'}),unverified=await createUser({verified:false}),owner=await createUser();
  assert.equal((await request('POST','/clubs',owner,{name:clubBody.name,description:clubBody.description})).statusCode,422);
  assert.equal((await request('POST','/clubs',hidden,clubBody)).statusCode,403);
  assert.equal((await request('POST','/clubs',unverified,clubBody)).statusCode,403);
  const key='club-create-retry-key';
  const send=()=>app.inject({method:'POST',url:'/api/v1/clubs',headers:{cookie:owner.cookie,'x-csrf-token':owner.csrf,origin:'http://localhost:3000','idempotency-key':key},payload:clubBody});
  const first=await send();assert.equal(first.statusCode,201,first.body);
  const retry=await send();assert.equal(retry.statusCode,200,retry.body);assert.equal(retry.json().id,first.json().id);
  assert.equal((await request('POST','/clubs',owner,clubBody)).statusCode,429);
  assert.equal((await request('POST',`/clubs/${first.json().id}/leave`,owner,{history_acknowledged:true})).statusCode,409);
  const hiding=await request('PATCH','/me/profile',owner,{version:1,visibility:'hidden',visibility_acknowledged:true});assert.equal(hiding.statusCode,409,hiding.body);
});

test('parallel creation cannot exceed three active or archived ownerships',async()=>{
  const owner=await createUser();await fixture({owner});const archived=await fixture({owner});await execute("UPDATE clubs SET state='archived' WHERE id=$1",[archived.id]);
  const results=await Promise.all([request('POST','/clubs',owner,clubBody),request('POST','/clubs',owner,clubBody)]);
  assert.deepEqual(results.map(r=>r.statusCode).sort(),[201,409]);
  const total=await one<{count:string}>("SELECT count(*) FROM clubs WHERE owner_id=$1 AND state IN ('active','archived')",[owner.id]);assert.equal(Number(total?.count),3);
});

test('hidden club identity is consent-gated and limited to members or pending reviewers',async()=>{
  const f=await fixture({join:'approval',feed:'members_only'}),hidden=await createUser({visibility:'hidden'}),outsider=await createUser();
  const invalid=await request('POST',`/clubs/${f.id}/requests`,hidden,{nickname:'Закрытое имя'});assert.equal(invalid.statusCode,422);
  const joined=await request('POST',`/clubs/${f.id}/requests`,hidden,identity('Закрытое имя'));assert.equal(joined.statusCode,201,joined.body);
  assert.equal((await request('GET',`/clubs/${f.id}/members`,outsider)).statusCode,404);
  const queue=await request('GET',`/clubs/${f.id}/requests`,f.owner);assert.equal(queue.statusCode,200);assert.equal(queue.json().items[0].nickname,'Закрытое имя');assert.equal(queue.json().items[0].profile,undefined);assert.equal(queue.json().items[0].user_id,undefined);
  assert.equal((await request('GET',`/clubs/${f.id}/requests`,outsider)).statusCode,403);
  const approval=await request('POST',`/clubs/requests/${joined.json().id}/decision`,f.owner,{decision:'approve'});assert.equal(approval.statusCode,200,approval.body);
  const roster=await request('GET',`/clubs/${f.id}/members`,f.owner);const row=roster.json().items.find((x:any)=>x.nickname==='Закрытое имя');assert.equal(row.profile,undefined);assert.equal(row.user_id,undefined);
  assert.equal((await request('GET',`/profiles/${hidden.id}`,f.owner)).statusCode,404);
});

test('withdrawal racing approval never leaves active membership after consent revocation',async()=>{
  const f=await fixture({join:'approval'}),hidden=await createUser({visibility:'hidden'});
  const joined=await request('POST',`/clubs/${f.id}/requests`,hidden,identity('Гоночное имя'));assert.equal(joined.statusCode,201,joined.body);
  const results=await Promise.all([request('POST',`/clubs/requests/${joined.json().id}/decision`,f.owner,{decision:'approve'}),request('POST',`/clubs/${f.id}/consent/revoke`,hidden,{history_acknowledged:true})]);
  assert.equal(results[1].statusCode,200,results[1].body);assert.ok([200,409].includes(results[0].statusCode),results[0].body);
  const m=await one<any>('SELECT * FROM club_memberships WHERE id=$1',[joined.json().id]);assert.equal(m.state,'left');assert.ok(m.revoked_at);
});

test('role hierarchy forbids self/equal promotion and moderators cannot process membership',async()=>{
  const f=await fixture(),admin=await createUser(),mod=await createUser(),member=await createUser();
  const a=await addMember(f.id,admin,'admin','Админ клуба'),m=await addMember(f.id,mod,'moderator','Модер клуба'),ordinary=await addMember(f.id,member,'member','Обычный игрок');
  assert.equal((await request('PATCH',`/clubs/${f.id}/members/${a.id}/role`,admin,{role:'member'})).statusCode,403);
  assert.equal((await request('PATCH',`/clubs/${f.id}/members/${ordinary.id}/role`,admin,{role:'admin'})).statusCode,403);
  assert.equal((await request('PATCH',`/clubs/${f.id}/members/${ordinary.id}/role`,admin,{role:'moderator'})).statusCode,200);
  assert.equal((await request('POST',`/clubs/${f.id}/members/${a.id}/kick`,mod,{reason:'Недопустимая попытка'})).statusCode,403);
  assert.equal((await request('GET',`/clubs/${f.id}/requests`,mod)).statusCode,403);
  assert.equal((await request('PATCH',`/clubs/${f.id}/members/${m.id}/role`,f.owner,{role:'admin'})).statusCode,200);
});

test('leaving cancels future registrations atomically and preserves historical signatures and nickname reservation',async()=>{
  const f=await fixture({feed:'members_only'}),member=await createUser({visibility:'hidden'});
  assert.equal((await request('POST',`/clubs/${f.id}/join`,member,identity('Историческое имя'))).statusCode,201);
  const event=(await one<{id:string}>("INSERT INTO events(club_id,creator_id,title,description,audience,starts_at,ends_at,registration_closes_at,capacity) VALUES($1,$2,'Событие','Описание','members_only',now()+interval '2 days',now()+interval '3 days',now()+interval '1 day',10) RETURNING id",[f.id,f.owner.id]))!;
  await execute('INSERT INTO event_registrations(event_id,user_id) VALUES($1,$2)',[event.id,member.id]);
  const p=(await one<{id:string}>("INSERT INTO posts(author_id,club_id,state,audience) VALUES($1,$2,'pending','members_only') RETURNING id",[f.owner.id,f.id]))!;
  const comment=(await one<{id:string}>("INSERT INTO comments(post_id,author_id,body,snapshot_nickname) VALUES($1,$2,'Исторический комментарий','Историческое имя') RETURNING id",[p.id,member.id]))!;
  const leave=await request('POST',`/clubs/${f.id}/leave`,member,{history_acknowledged:true});assert.equal(leave.statusCode,200,leave.body);
  assert.equal((await one<any>('SELECT state FROM event_registrations WHERE event_id=$1 AND user_id=$2',[event.id,member.id]))?.state,'cancelled');
  assert.equal((await one<any>('SELECT snapshot_nickname FROM comments WHERE id=$1',[comment.id]))?.snapshot_nickname,'Историческое имя');
  const other=await createUser();
  assert.equal((await request('POST',`/clubs/${f.id}/join`,other,identity('Историческое имя'))).statusCode,409);
});

test('club posts require premoderation, independent reviews and retain old approved edits',async()=>{
  const f=await fixture(),admin=await createUser(),author=await createUser(),hidden=await createUser({visibility:'hidden'});
  await addMember(f.id,admin,'admin','Первый проверяющий');await addMember(f.id,author,'member','Автор публикации');await addMember(f.id,hidden,'member','Скрытый участник');
  assert.equal((await request('POST',`/clubs/${f.id}/posts`,hidden,{body:'Запрещённая запись'})).statusCode,403);
  const pending=await submit(f.id,author);assert.equal((await request('GET',`/clubs/${f.id}/posts`)).json().items.length,0);
  assert.equal((await decide(pending,admin)).statusCode,200);
  const edit=await request('PATCH',`/clubs/posts/${pending.id}`,author,{body:'Вторая редакция ожидает проверки'});assert.equal(edit.statusCode,200,edit.body);
  let live=(await request('GET',`/posts/${pending.id}`)).json();assert.equal(live.body,'Первая клубная редакция');
  const self=await submit(f.id,admin,'Собственная запись администратора');assert.equal((await decide(self,admin)).statusCode,403);
  const ownerPost=await submit(f.id,f.owner,'Собственная запись владельца');assert.equal((await decide(ownerPost,f.owner,'Другой проверяющий существует')).statusCode,403);
  const approved=await request('POST',`/clubs/posts/${pending.id}/revisions/${edit.json().revision.id}/decision`,admin,{decision:'approve'});assert.equal(approved.statusCode,200,approved.body);
  live=(await request('GET',`/posts/${pending.id}`)).json();assert.equal(live.body,'Вторая редакция ожидает проверки');
  await execute("UPDATE users SET visibility='hidden' WHERE id=$1",[author.id]);assert.equal((await request('GET',`/posts/${pending.id}`)).statusCode,404);
});

test('lone owner exception is audited; opening club preserves archive and pin is unique',async()=>{
  const f=await fixture({feed:'members_only'});const old=await submit(f.id,f.owner,'Старая закрытая запись');
  assert.equal((await decide(old,f.owner)).statusCode,422);
  assert.equal((await decide(old,f.owner,'Другие проверяющие отсутствуют')).statusCode,200);
  const changed=await request('PATCH',`/clubs/${f.id}`,f.owner,{feed_visibility:'public',visibility_change_acknowledged:true});assert.equal(changed.statusCode,200,changed.body);
  assert.equal((await request('GET',`/posts/${old.id}`)).statusCode,404);
  const fresh=await submit(f.id,f.owner,'Новая открытая запись');assert.equal((await decide(fresh,f.owner,'Другие проверяющие отсутствуют')).statusCode,200);
  assert.equal((await request('GET',`/posts/${fresh.id}`)).statusCode,200);
  await request('PATCH',`/clubs/${f.id}`,f.owner,{feed_visibility:'members_only',visibility_change_acknowledged:true});
  await request('PATCH',`/clubs/${f.id}`,f.owner,{feed_visibility:'public',visibility_change_acknowledged:true});
  assert.equal((await request('GET',`/posts/${fresh.id}`)).statusCode,404);
  const pins=await Promise.all([request('POST',`/clubs/${f.id}/pin`,f.owner,{post_id:old.id}),request('POST',`/clubs/${f.id}/pin`,f.owner,{post_id:fresh.id})]);assert.ok(pins.every(p=>p.statusCode===200));
  const club=await one<any>('SELECT pinned_post_id FROM clubs WHERE id=$1',[f.id]);assert.ok([old.id,fresh.id].includes(club.pinned_post_id));
  const history=await query<any>("SELECT metadata FROM audit_actions WHERE club_id=$1 AND action='club_post_approve'",[f.id]);assert.ok(history.some(x=>x.metadata.self_review));
});

test('ownership transfer requires target acceptance and cannot race target profile hiding into hidden ownership',async()=>{
  const f=await fixture(),target=await createUser();await addMember(f.id,target,'member','Будущий владелец');
  const transfer=await request('POST',`/clubs/${f.id}/transfers`,f.owner,{to_user_id:target.id});assert.equal(transfer.statusCode,201,transfer.body);
  assert.equal((await request('GET',`/clubs/${f.id}`,target)).json().incoming_transfer_id,transfer.json().id);
  const results=await Promise.all([request('POST',`/clubs/transfers/${transfer.json().id}/accept`,target),request('PATCH','/me/profile',target,{version:1,visibility:'hidden',visibility_acknowledged:true})]);
  assert.ok(results.some(r=>r.statusCode===200));
  const state=await one<any>('SELECT c.owner_id,u.visibility FROM clubs c JOIN users u ON u.id=c.owner_id WHERE c.id=$1',[f.id]);assert.equal(state.visibility,'public');
  if(state.owner_id===target.id)assert.equal(results[1].statusCode,409);
  else assert.equal(results[0].statusCode,403);
});
