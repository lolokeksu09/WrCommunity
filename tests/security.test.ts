import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { app, closeTests, createUser, request } from './helpers.js';
import { execute, one, pool } from '../server/db/index.js';
import { periodic, processOutbox } from '../server/worker.js';

after(closeTests);

test('encoded static API paths enforce the same session and CSRF hooks as canonical paths', async () => {
  const user = await createUser();
  for (const url of ['/api/v1/auth/logout', '/api/%761/auth/logout', '/%61pi/v1/auth/logout', '/api/v%31/auth/logout']) {
    const response = await app.inject({ method: 'POST', url, headers: { cookie: user.cookie }, payload: {} });
    assert.equal(response.statusCode, 403, `${url}: ${response.body}`);
  }
  const session = await app.inject({ method: 'GET', url: '/api/%761/auth/session', headers: { cookie: user.cookie } });
  assert.equal(session.statusCode, 200, session.body);
  assert.equal(session.json().user?.id, user.id);
});

test('delivered hidden-author comment notifications retain internal block enforcement without exposing identity', async () => {
  const recipient = await createUser();
  const commenter = await createUser({ visibility: 'hidden' });
  const post = await request('POST', '/api/v1/posts', recipient, { body: 'Public discussion for notification ACL' });
  assert.ok(post.statusCode < 300, post.body);
  const comment = await request('POST', `/api/v1/posts/${post.json().id}/comments`, commenter, { body: 'Hidden author reply' });
  assert.ok(comment.statusCode < 300, comment.body);
  const job = await one<{ id: string }>(`SELECT id FROM outbox WHERE type='notification' AND payload->>'recipient'=$1 AND payload->>'actorId'=$2 AND payload->>'objectId'=$3 AND completed_at IS NULL`, [recipient.id, commenter.id, post.json().id]);
  assert.ok(job);
  // Prioritize this genuine emitted job without depending on unrelated SMTP work.
  await execute(`UPDATE outbox SET available_at=now()-interval '1 year' WHERE id=$1`, [job.id]);
  assert.equal(await processOutbox(1), 1);
  const notification = await one<{ id: string; actor_id: string | null }>('SELECT id,actor_id FROM notifications WHERE dedupe_key=$1', [job.id]);
  assert.ok(notification);
  assert.equal(notification.actor_id, commenter.id);
  const before = await request('GET', '/api/v1/me/notifications', recipient);
  const item = before.json().items.find((n: { id: string }) => n.id === notification.id);
  assert.ok(item);
  assert.equal(item.actor, null);
  assert.ok(!JSON.stringify(item).includes(commenter.id));
  const block = await request('PUT', `/api/v1/profiles/${commenter.id}/block`, recipient, {});
  assert.equal(block.statusCode, 200, block.body);
  const afterBlock = await request('GET', '/api/v1/me/notifications', recipient);
  assert.ok(!afterBlock.json().items.some((n: { id: string }) => n.id === notification.id));
});

test('moderator cannot revoke an administrator sanction against a peer moderator', async () => {
  const admin = await createUser({ platform_role: 'admin' });
  const actor = await createUser({ platform_role: 'moderator' });
  const peer = await createUser({ platform_role: 'moderator' });
  const sanction = await request('POST', '/api/v1/moderation/sanctions', admin, { user_id: peer.id, kind: 'suspension', reason: 'Administrator investigation', expires_at: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(sanction.statusCode, 200, sanction.body);
  const revoked = await request('POST', `/api/v1/moderation/sanctions/${sanction.json().id}/revoke`, actor, { reason: 'Attempt to override administrator' });
  assert.equal(revoked.statusCode, 403, revoked.body);
  assert.equal((await one<{ status: string }>('SELECT status FROM users WHERE id=$1', [peer.id]))?.status, 'suspended');
  assert.equal((await one<{ revoked_at: Date | null }>('SELECT revoked_at FROM sanctions WHERE id=$1', [sanction.json().id]))?.revoked_at, null);
});

test('moderation removal cannot revive a deleted club after its owner becomes hidden', async () => {
  const owner = await createUser();
  const moderator = await createUser({ platform_role: 'moderator' });
  const club = await one<{ id: string }>(`INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility) VALUES($1,'Terminal state test','Club for terminal state security','open','public') RETURNING id`, [owner.id]);
  assert.ok(club);
  const report = await request('POST', '/api/v1/reports', owner, { target_type: 'club', target_id: club.id, reason: 'Reported before owner deletion' });
  assert.equal(report.statusCode, 201, report.body);
  await execute(`UPDATE clubs SET state='deleted' WHERE id=$1`, [club.id]);
  const profile = (await request('GET', '/api/v1/me/profile', owner)).json();
  assert.equal((await request('PATCH', '/api/v1/me/profile', owner, { version: profile.version, visibility: 'hidden', visibility_acknowledged: true })).statusCode, 200);
  const removed = await request('POST', `/api/v1/moderation/content/club/${club.id}/remove`, moderator, { reason: 'Late decision on prior report', report_id: report.json().id });
  assert.ok(removed.statusCode < 500, removed.body);
  assert.equal((await one<{ state: string }>('SELECT state FROM clubs WHERE id=$1', [club.id]))?.state, 'deleted');
  assert.equal((await app.inject({ method: 'GET', url: `/api/v1/clubs/${club.id}` })).statusCode, 404);
});

test('expired-sanction cleanup cannot undo a concurrent new suspension after waiting for a user lock', async () => {
  const admin = await createUser({ platform_role: 'admin' });
  const user = await createUser();
  await execute(`INSERT INTO sanctions(user_id,actor_id,kind,reason,expires_at) VALUES($1,$2,'suspension','Expired suspension test',now()-interval '1 hour')`, [user.id, admin.id]);
  await execute(`UPDATE users SET status='suspended' WHERE id=$1`, [user.id]);
  const blocker = await pool.connect();
  let cleanup: Promise<void> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    cleanup = periodic();
    let waiting = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      waiting = !!(await one<{ waiting: boolean }>(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%SELECT id FROM users u%') AS waiting`))?.waiting;
      if (waiting) break;
      await delay(25);
    }
    assert.equal(waiting, true, 'periodic cleanup must be waiting on the locked suspended account');
    await blocker.query(`INSERT INTO sanctions(user_id,actor_id,kind,reason,expires_at) VALUES($1,$2,'suspension','Fresh concurrent suspension',now()+interval '1 day')`, [user.id, admin.id]);
    await blocker.query(`UPDATE users SET status='suspended' WHERE id=$1`, [user.id]);
    await blocker.query('COMMIT');
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (cleanup) await cleanup;
  }
  assert.equal((await one<{ status: string }>('SELECT status FROM users WHERE id=$1', [user.id]))?.status, 'suspended');
});
