import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { app, closeTests, createUser, request } from './helpers.js';
import { execute, one } from '../server/db/index.js';
import { hashSecret } from '../server/modules/auth/service.js';

after(closeTests);

test('registration is hidden, stores Argon2id and hashes emailed verification token', async () => {
  const name = randomUUID().replaceAll('-', '').slice(0, 20);
  const anonymous = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register',
    headers: { cookie: anonymous.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': anonymous.json().csrfToken, origin: process.env.APP_ORIGIN ?? 'http://localhost:3000' },
    payload: { email: `${name}@example.test`, password: 'test password with length', handle: name, display_name: 'Игрок' } });
  assert.equal(response.statusCode, 201, response.body);
  const user = response.json().user;
  assert.equal(user.visibility, 'hidden');
  assert.equal(user.verified, false);
  assert.equal(response.json().token, undefined);
  const account = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [user.id]);
  assert.ok(account?.password_hash.startsWith('$argon2id$'));
  const mail = await one<{ payload: { text: string } }>(`SELECT payload FROM outbox WHERE type='email' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1`, [`${name}@example.test`]);
  const raw = /token=([A-Za-z0-9_-]+)/.exec(mail?.payload.text ?? '')?.[1];
  assert.ok(raw);
  const token = await one<{ token_hash: string }>('SELECT token_hash FROM auth_tokens WHERE user_id=$1', [user.id]);
  assert.equal(token?.token_hash, hashSecret(raw));
  assert.ok(!response.body.includes(raw));
});

test('reset is one use and revokes every session without disclosing tokens', async () => {
  const user = await createUser();
  const reset = await request('POST', '/api/v1/auth/reset-request', user, { email: user.viewer.email });
  assert.equal(reset.statusCode, 200, reset.body);
  assert.deepEqual(reset.json(), { ok: true });
  const mail = await one<{ payload: { text: string } }>(`SELECT payload FROM outbox WHERE type='email' AND payload->>'to'=$1 AND payload->>'subject' LIKE '%пароля%' ORDER BY created_at DESC LIMIT 1`, [user.viewer.email]);
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail?.payload.text ?? '')?.[1];
  assert.ok(token);
  const response = await request('POST', '/api/v1/auth/reset-confirm', user, { token, password: 'new test password long' });
  assert.equal(response.statusCode, 200, response.body);
  const session = await request('GET', '/api/v1/auth/session', user);
  assert.equal(session.json().user, null);
  const anonymous = await app.inject({ method: 'GET', url: '/api/v1/auth/session' });
  const replay = await app.inject({ method: 'POST', url: '/api/v1/auth/reset-confirm',
    headers: { cookie: anonymous.cookies.map(c => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': anonymous.json().csrfToken, origin: process.env.APP_ORIGIN ?? 'http://localhost:3000' },
    payload: { token, password: 'other test password long' } });
  assert.equal(replay.statusCode, 422);
});

test('profile public fields, acknowledgments, optimistic edits and opt-in heartbeat', async () => {
  const user = await createUser({ visibility: 'hidden' });
  let own = (await request('GET', '/api/v1/me/profile', user)).json();
  const unacknowledged = await request('PATCH', '/api/v1/me/profile', user, { version: own.version, visibility: 'public' });
  assert.equal(unacknowledged.statusCode, 422);
  const published = await request('PATCH', '/api/v1/me/profile', user, { version: own.version, visibility: 'public', visibility_acknowledged: true,
    game: { server: { value: 'EU', public: true }, rank: { value: 'diamond' } }, online_opt_in: true });
  assert.equal(published.statusCode, 200, published.body);
  own = published.json();
  assert.equal(own.game.rank.public, false);
  const publicProfile = await app.inject({ method: 'GET', url: `/api/v1/profiles/${user.id}` });
  assert.equal(publicProfile.statusCode, 200);
  assert.equal(publicProfile.json().game.server.value, 'EU');
  assert.equal(publicProfile.json().game.rank, undefined);
  assert.equal(publicProfile.json().email, undefined);
  assert.equal(publicProfile.json().online, false);
  assert.equal((await request('POST', '/api/v1/me/heartbeat', user, {})).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/profiles/${user.id}` })).json().online, true);
  assert.equal((await request('PATCH', '/api/v1/me/profile', user, { version: own.version - 1, biography: 'stale' })).statusCode, 409);
  const hidden = await request('PATCH', '/api/v1/me/profile', user, { version: own.version, visibility: 'hidden', visibility_acknowledged: true });
  assert.equal(hidden.statusCode, 200, hidden.body);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/profiles/${user.id}` })).statusCode, 404);
});

test('club ownership blocks hiding and deletion; deletion removes historical comment identity', async () => {
  const user = await createUser({ visibility: 'public' });
  const club = await one<{ id: string }>(`INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility) VALUES($1,'test','test','open','members_only') RETURNING id`, [user.id]);
  const own = (await request('GET', '/api/v1/me/profile', user)).json();
  assert.equal((await request('PATCH', '/api/v1/me/profile', user, { version: own.version, visibility: 'hidden', visibility_acknowledged: true })).statusCode, 409);
  assert.equal((await request('DELETE', '/api/v1/me/account', user, { password: user.password, confirmation: 'DELETE' })).statusCode, 409);
  await execute(`UPDATE clubs SET state='deleted' WHERE id=$1`, [club!.id]);
  const post = await one<{ id: string }>(`INSERT INTO posts(author_id,club_id,state,audience) VALUES($1,$2,'published','members_only') RETURNING id`, [user.id, club!.id]);
  const comment = await one<{ id: string }>(`INSERT INTO comments(post_id,author_id,body,snapshot_nickname) VALUES($1,$2,'kept text','Historical nickname') RETURNING id`, [post!.id, user.id]);
  const deleted = await request('DELETE', '/api/v1/me/account', user, { password: user.password, confirmation: 'DELETE' });
  assert.equal(deleted.statusCode, 200, deleted.body);
  const retained = await one<{ author_id: string | null; snapshot_nickname: string | null; snapshot_avatar_id: string | null }>('SELECT author_id,snapshot_nickname,snapshot_avatar_id FROM comments WHERE id=$1', [comment!.id]);
  assert.deepEqual(retained, { author_id: null, snapshot_nickname: null, snapshot_avatar_id: null });
  assert.equal((await request('GET', '/api/v1/auth/session', user)).json().user, null);
});

test('verification is one use and expired reset tokens are rejected', async () => {
  const user = await createUser({ verified: false });
  const mail = await one<{ payload: { text: string } }>(`SELECT payload FROM outbox WHERE type='email' AND payload->>'to'=$1 ORDER BY created_at DESC LIMIT 1`, [user.email]);
  const token = /token=([A-Za-z0-9_-]+)/.exec(mail?.payload.text ?? '')?.[1];
  assert.ok(token);
  assert.equal((await request('POST', '/api/v1/auth/verify-email', user, { token })).statusCode, 200);
  assert.equal((await request('GET', '/api/v1/auth/session', user)).json().user.verified, true);
  assert.equal((await request('POST', '/api/v1/auth/verify-email', user, { token })).statusCode, 422);
  await request('POST', '/api/v1/auth/reset-request', user, { email: user.email });
  const reset = await one<{ payload: { text: string } }>(`SELECT payload FROM outbox WHERE type='email' AND payload->>'to'=$1 AND payload->>'subject' LIKE '%пароля%' ORDER BY created_at DESC LIMIT 1`, [user.email]);
  const resetToken = /token=([A-Za-z0-9_-]+)/.exec(reset?.payload.text ?? '')?.[1];
  assert.ok(resetToken);
  await execute(`UPDATE auth_tokens SET expires_at=now()-interval '1 minute' WHERE user_id=$1 AND purpose='reset'`, [user.id]);
  assert.equal((await request('POST', '/api/v1/auth/reset-confirm', user, { token: resetToken, password: 'a long replacement password' })).statusCode, 422);
  assert.deepEqual((await request('POST', '/api/v1/auth/reset-request', user, { email: `${randomUUID()}@example.test` })).json(), { ok: true });
});

test('session list omits credentials and a user cannot revoke another user session', async () => {
  const user = await createUser();
  const other = await createUser();
  const response = await request('GET', '/api/v1/me/sessions', user);
  assert.equal(response.statusCode, 200, response.body);
  const sessions = response.json().items;
  assert.ok(sessions.some((session: { current: boolean }) => session.current));
  assert.ok(!response.body.includes('token_hash'));
  assert.ok(!response.body.includes('csrf_token'));
  const own = sessions.find((session: { current: boolean }) => session.current);
  assert.equal((await request('DELETE', `/api/v1/me/sessions/${own.id}`, other)).statusCode, 404);
  assert.equal((await request('DELETE', `/api/v1/me/sessions/${own.id}`, user)).statusCode, 200);
  assert.equal((await request('GET', '/api/v1/auth/session', user)).json().user, null);
  assert.equal((await request('POST', '/api/v1/auth/logout', other, {})).statusCode, 200);
  assert.equal((await request('GET', '/api/v1/auth/session', other)).json().user, null);
});

test('security settings require password, clear verification and revoke existing sessions', async () => {
  const user = await createUser();
  const nextEmail = `${randomUUID()}@example.test`;
  assert.equal((await request('PATCH', '/api/v1/me/settings', user, { current_password: 'wrong', email: nextEmail })).statusCode, 401);
  const changed = await request('PATCH', '/api/v1/me/settings', user, { current_password: user.password, email: nextEmail });
  assert.equal(changed.statusCode, 200, changed.body);
  assert.equal((await request('GET', '/api/v1/auth/session', user)).json().user, null);
  const account = await one<{ email: string; verified_at: Date | null }>('SELECT email,verified_at FROM users WHERE id=$1', [user.id]);
  assert.deepEqual(account, { email: nextEmail, verified_at: null });
  assert.ok(await one(`SELECT id FROM outbox WHERE type='email' AND payload->>'to'=$1`, [nextEmail]));
});

test('profile ACL respects effective blocks and ordinary requests do not enable online presence', async () => {
  const user = await createUser();
  const other = await createUser();
  await request('POST', '/api/v1/me/heartbeat', user, {});
  assert.equal((await one<{ last_seen: Date | null }>('SELECT last_seen FROM users WHERE id=$1', [user.id]))?.last_seen, null);
  await execute('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)', [other.id, user.id]);
  assert.equal((await request('GET', `/api/v1/profiles/${other.id}`, user)).statusCode, 404);
  assert.equal((await request('GET', `/api/v1/profiles/${user.id}`, other)).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/profiles/${user.id}` })).statusCode, 200);
});
