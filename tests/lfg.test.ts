import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUser, request, closeTests } from './helpers.js';
import { execute, one } from '../server/db/index.js';

after(closeTests);

const future = () => new Date(Date.now() + 86400000).toISOString();
const announcement = { server: 'EU', roles: ['support'], description: 'Ищу команду для спокойных матчей', expires_at: '2099-01-01T00:00:00Z', pending_policy: 'keep' };

test('LFG requires public verified authors and explicit recipient disclosure from hidden applicants', async () => {
  const author = await createUser({ visibility: 'public' });
  const hidden = await createUser({ visibility: 'hidden' });
  const stranger = await createUser({ visibility: 'public' });
  assert.equal((await request('POST', '/api/v1/lfg', hidden, announcement)).statusCode, 403);
  const created = await request('POST', '/api/v1/lfg', author, announcement);
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id;
  assert.equal((await request('POST', `/api/v1/lfg/${id}/applications`, hidden, { message: 'Готов играть' })).statusCode, 422);
  const applied = await request('POST', `/api/v1/lfg/${id}/applications`, hidden, { message: 'Готов играть', disclosure_consent: true });
  assert.equal(applied.statusCode, 201, applied.body);
  assert.equal((await request('GET', `/api/v1/lfg/${id}/applications`, stranger)).statusCode, 404);
  const list = await request('GET', `/api/v1/lfg/${id}/applications`, author);
  assert.equal(list.json().items[0].nickname, hidden.viewer.handle);
  assert.equal(list.json().items[0].applicant_id, undefined);
  assert.equal(list.json().items[0].profile, undefined);
});

test('lazy DB-time expiry rejects pending according to policy and preserves keep for late decisions', async () => {
  const author = await createUser({ visibility: 'public' });
  const applicant = await createUser({ visibility: 'hidden' });
  for (const policy of ['keep', 'reject']) {
    const created = await request('POST', '/api/v1/lfg', author, { ...announcement, expires_at: future(), pending_policy: policy });
    const id = created.json().id;
    const applied = await request('POST', `/api/v1/lfg/${id}/applications`, applicant, { message: 'Готов играть', disclosure_consent: true });
    const applicationId = applied.json().id;
    await execute("UPDATE lfg_announcements SET expires_at=now()-interval '1 second' WHERE id=$1", [id]);
    const late = await request('POST', `/api/v1/lfg/${id}/applications`, await createUser({ visibility: 'public' }), { message: 'Поздний отклик' });
    assert.equal(late.statusCode, 409, late.body);
    const row = await one<{state:string}>('SELECT state FROM lfg_applications WHERE id=$1', [applicationId]);
    assert.equal(row?.state, policy === 'reject' ? 'auto_rejected' : 'pending');
    const decision = await request('POST', `/api/v1/lfg/applications/${applicationId}/decision`, author, { decision: 'accepted' });
    assert.equal(decision.statusCode, policy === 'keep' ? 200 : 409, decision.body);
  }
});

test('accepted LFG game contacts need consent on both sides, encrypted storage, revoke and block checks', async () => {
  const author = await createUser({ visibility: 'public' });
  const applicant = await createUser({ visibility: 'hidden' });
  const id = (await request('POST', '/api/v1/lfg', author, announcement)).json().id;
  const applicationId = (await request('POST', `/api/v1/lfg/${id}/applications`, applicant, { message: 'Привет', disclosure_consent: true })).json().id;
  assert.equal((await request('PUT', `/api/v1/lfg/applications/${applicationId}/contacts`, author, { game_contact: 'Player#EU', consent: true })).statusCode, 409);
  assert.equal((await request('POST', `/api/v1/lfg/applications/${applicationId}/decision`, author, { decision: 'accepted' })).statusCode, 200);
  assert.equal((await request('PUT', `/api/v1/lfg/applications/${applicationId}/contacts`, author, { game_contact: 'Player#EU', consent: true })).statusCode, 200);
  let contacts = (await request('GET', `/api/v1/lfg/applications/${applicationId}/contacts`, applicant)).json();
  assert.equal(contacts.partner_contact, null);
  assert.equal((await request('PUT', `/api/v1/lfg/applications/${applicationId}/contacts`, applicant, { game_contact: 'Friend#EU', consent: true })).statusCode, 200);
  contacts = (await request('GET', `/api/v1/lfg/applications/${applicationId}/contacts`, applicant)).json();
  assert.equal(contacts.partner_contact, 'Player#EU');
  const saved = await one<{contact_encrypted:string}>('SELECT contact_encrypted FROM lfg_contacts WHERE application_id=$1 AND user_id=$2', [applicationId, author.id]);
  assert.ok(saved?.contact_encrypted && !saved.contact_encrypted.includes('Player#EU'));
  await request('DELETE', `/api/v1/lfg/applications/${applicationId}/contacts`, author);
  assert.equal((await request('GET', `/api/v1/lfg/applications/${applicationId}/contacts`, applicant)).json().partner_contact, null);
  await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)', [author.id, applicant.id]);
  assert.equal((await request('GET', `/api/v1/lfg/applications/${applicationId}/contacts`, applicant)).statusCode, 404);
});

test('player search excludes hidden, private game fields and either block direction', async () => {
  const viewer = await createUser({visibility:'public'});
  const publicPlayer = await createUser({visibility:'public'});
  const privatePlayer = await createUser({visibility:'public'});
  const hidden = await createUser({visibility:'hidden'});
  const server=`TEST-${randomUUID()}`;
  const game = {server:{value:server,public:true},roles:{value:['support'],public:true},rank:{value:'secret',public:false}};
  await execute('UPDATE users SET game=$1::jsonb WHERE id=ANY($2::uuid[])', [JSON.stringify(game), [publicPlayer.id, hidden.id]]);
  await execute('UPDATE users SET game=$1::jsonb WHERE id=$2', [JSON.stringify({...game,server:{value:server,public:false}}), privatePlayer.id]);
  let result = await request('GET',`/api/v1/players/search?server=${server}&role=support`,viewer);
  assert.deepEqual(result.json().items.map((x:{id:string}) => x.id), [publicPlayer.id]);
  assert.equal(result.json().items[0].game.rank, undefined);
  await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)',[publicPlayer.id,viewer.id]);
  result = await request('GET',`/api/v1/players/search?server=${server}`,viewer);
  assert.equal(result.json().items.length,0);
});

test('LFG owner edits only open announcements and sees closed history in own list',async()=>{
  const author=await createUser({visibility:'public'});
  const id=(await request('POST','/api/v1/lfg',author,{...announcement,expires_at:future()})).json().id;
  const changed=await request('PATCH',`/api/v1/lfg/${id}`,author,{description:'Ищу вечернюю команду',expires_at:'2100-01-01T00:00:00Z',pending_policy:'reject'});
  assert.equal(changed.statusCode,200,changed.body);
  assert.equal(changed.json().pending_policy,'reject');
  await request('POST',`/api/v1/lfg/${id}/close`,author);
  const mine=await request('GET','/api/v1/lfg/mine',author);
  assert.equal(mine.statusCode,200,mine.body);
  assert.equal(mine.json().items.find((row:{id:string})=>row.id===id)?.state,'closed');
  assert.equal((await request('PATCH',`/api/v1/lfg/${id}`,author,{description:'Поздняя правка'})).statusCode,409);
});

test('recommendations explain public matches without private candidate fields affecting score',async()=>{
  const viewer=await createUser({visibility:'hidden'});
  const matched=await createUser({visibility:'public'});
  const privateMatch=await createUser({visibility:'public'});
  const server=`RECOMMENDATION-${randomUUID()}`;
  const game={server:{value:server,public:true},roles:{value:['support'],public:true},languages:{value:['Русский'],public:true}};
  await execute('UPDATE users SET game=$1::jsonb WHERE id=ANY($2::uuid[])',[JSON.stringify(game),[viewer.id,matched.id]]);
  await execute('UPDATE users SET game=$1::jsonb WHERE id=$2',[JSON.stringify({server:{value:server,public:false},roles:{value:['support'],public:false}}),privateMatch.id]);
  const response=await request('GET','/api/v1/players/recommendations',viewer);
  assert.equal(response.statusCode,200,response.body);
  assert.equal(response.json().items[0].id,matched.id);
  assert.ok(response.json().items[0].reasons.includes('Тот же сервер'));
  assert.ok(response.json().items[0].reasons.includes('Совпадает игровая роль'));
  const privateCard=response.json().items.find((row:{id:string})=>row.id===privateMatch.id);
  if(privateCard)assert.deepEqual(privateCard.game,{});
});
