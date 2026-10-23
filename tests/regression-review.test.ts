import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import { app, closeTests, createUser, request, type TestUser } from './helpers.js';
import { execute, one, pool } from '../server/db/index.js';

after(closeTests);

async function fixture() {
  const owner = await createUser(), author = await createUser();
  const club = (await one<{ id: string }>(`INSERT INTO clubs(owner_id,name,description,join_mode,feed_visibility) VALUES($1,'Review fixture','Club for independent regression review','open','public') RETURNING id`, [owner.id]))!;
  for (const [user, role] of [[owner, 'owner'], [author, 'member']] as const) {
    await execute(`INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,joined_at) VALUES($1,$2,$3,'active',$4,$4,1,now(),now())`, [club.id, user.id, role, user.viewer.handle]);
  }
  return { owner, author, club };
}

async function image(user: TestUser) {
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#337799' } }).jpeg().toBuffer();
  const boundary = 'review-' + randomUUID();
  const payload = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="review.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const response = await app.inject({ method: 'POST', url: '/api/v1/media', headers: { cookie: user.cookie, 'x-csrf-token': user.csrf, origin: process.env.APP_ORIGIN ?? 'http://localhost:3000', 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().id as string;
}

test('club reviewers can inspect pending revision media while outsiders cannot', async () => {
  const { owner, author, club } = await fixture();
  const moderator = await createUser();
  const modMembership = (await one<{ id: string }>(`INSERT INTO club_memberships(club_id,user_id,role,state,nickname,nickname_key,consent_version,consented_at,joined_at) VALUES($1,$2,'moderator','active',$3,$3,1,now(),now()) RETURNING id`, [club.id, moderator.id, moderator.viewer.handle]))!;
  const id = await image(author);
  const pending = await request('POST', `/clubs/${club.id}/posts`, author, { body: 'Please review the attached image', images: [id] });
  assert.equal(pending.statusCode, 201, pending.body);
  const queue = await request('GET', `/clubs/${club.id}/moderation`, owner);
  assert.equal(queue.statusCode, 200, queue.body);
  assert.ok(queue.json().items.some((r: { images: string[] }) => r.images.includes(id)));
  assert.equal((await request('GET', `/media/${id}`)).statusCode, 404);
  const allowed = await request('GET', `/media/${id}`, owner);
  assert.equal(allowed.statusCode, 200, 'A reviewer who receives this pending image in the moderation queue must be able to inspect it');
  assert.equal((await request('GET', `/media/${id}`, moderator)).statusCode, 200);
  const revoke = await request('PATCH', `/clubs/${club.id}/members/${modMembership.id}/role`, owner, { role: 'member' });
  assert.equal(revoke.statusCode, 200, revoke.body);
  assert.equal((await request('GET', `/media/${id}`, moderator)).statusCode, 404);
  assert.equal((await request('GET', `/clubs/${club.id}/moderation`, moderator)).statusCode, 403);
  await execute("UPDATE users SET visibility='hidden' WHERE id=$1", [author.id]);
  assert.equal((await request('GET', `/media/${id}`, owner)).statusCode, 404);
});

test('a club owner cannot reactivate a club archived by platform moderation', async () => {
  const { owner, club } = await fixture();
  const moderator = await createUser({ platform_role: 'moderator' });
  const report = await request('POST', '/reports', owner, { target_type: 'club', target_id: club.id, reason: 'Club violates platform rules' });
  assert.equal(report.statusCode, 201, report.body);
  const removal = await request('POST', `/moderation/content/club/${club.id}/remove`, moderator, { reason: 'Confirmed platform rule violation', report_id: report.json().id });
  assert.equal(removal.statusCode, 200, removal.body);
  const reactivate = await request('PATCH', `/clubs/${club.id}`, owner, { state: 'active' });
  assert.ok(reactivate.statusCode >= 400, 'Owner must not override a platform moderation decision');
  assert.equal((await one<{ state: string }>('SELECT state FROM clubs WHERE id=$1', [club.id]))?.state, 'archived');
});

test('club leadership can postmoderate another member club comment', async () => {
  const { owner, author, club } = await fixture();
  const pending = await request('POST', `/clubs/${club.id}/posts`, author, { body: 'Club discussion for comment moderation' });
  assert.equal(pending.statusCode, 201, pending.body);
  const approval = await request('POST', `/clubs/posts/${pending.json().id}/revisions/${pending.json().revision.id}/decision`, owner, { decision: 'approve' });
  assert.equal(approval.statusCode, 200, approval.body);
  const comment = await request('POST', `/posts/${pending.json().id}/comments`, author, { body: 'Comment requiring club moderation' });
  assert.equal(comment.statusCode, 200, comment.body);
  const outsider = await createUser();
  assert.equal((await request('DELETE', `/clubs/comments/${comment.json().id}`, outsider, { reason: 'Attempt without club role' })).statusCode, 403);
  const remove = await request('DELETE', `/clubs/comments/${comment.json().id}`, owner, { reason: 'Confirmed club rule violation' });
  assert.equal(remove.statusCode, 200, remove.body);
  assert.equal((await one<{ state: string }>('SELECT state FROM comments WHERE id=$1', [comment.json().id]))?.state, 'removed', 'A club owner needs an effective club comment moderation operation');
});

test('club report management is scoped to current club leadership and omits reporter identity', async () => {
  const { owner, author, club } = await fixture();
  const foreign = await fixture();
  const pending = await request('POST', `/clubs/${club.id}/posts`, author, { body: 'Reported club content' });
  assert.equal(pending.statusCode, 201, pending.body);
  assert.equal((await request('POST', `/clubs/posts/${pending.json().id}/revisions/${pending.json().revision.id}/decision`, owner, { decision: 'approve' })).statusCode, 200);
  const report = await request('POST', '/reports', author, { target_type: 'post', target_id: pending.json().id, reason: 'Content requires club review' });
  assert.equal(report.statusCode, 201, report.body);
  const queue = await request('GET', `/clubs/${club.id}/reports`, owner);
  assert.equal(queue.statusCode, 200, queue.body);
  const item = queue.json().items.find((r: { id: string }) => r.id === report.json().id);
  assert.ok(item);
  assert.equal(item.reporter_id, undefined);
  assert.equal((await request('GET', `/clubs/${club.id}/reports`, author)).statusCode, 403);
  const wrongScope = await request('PATCH', `/clubs/${foreign.club.id}/reports/${report.json().id}`, foreign.owner, { state: 'dismissed', reason: 'Unrelated club management' });
  assert.equal(wrongScope.statusCode, 404, wrongScope.body);
  const decision = await request('PATCH', `/clubs/${club.id}/reports/${report.json().id}`, owner, { state: 'resolved', reason: 'Scoped leadership review complete' });
  assert.equal(decision.statusCode, 200, decision.body);
  assert.ok(await one("SELECT id FROM audit_actions WHERE club_id=$1 AND target_id=$2 AND action='club_report_resolved'", [club.id, report.json().id]));
});

test('confirmed owner deletion revokes club access, cancels participation, and permits account deletion', async () => {
  const { owner, author, club } = await fixture();
  const event = await request('POST', `/clubs/${club.id}/events`, owner, { title: 'Club deletion review', description: 'Future participation must be cancelled atomically', audience: 'public', starts_at: new Date(Date.now() + 172800000).toISOString(), ends_at: new Date(Date.now() + 180000000).toISOString(), registration_closes_at: new Date(Date.now() + 86400000).toISOString(), capacity: 10 });
  assert.equal(event.statusCode, 201, event.body);
  const registration = await request('POST', `/events/${event.json().id}/registration`, author);
  assert.equal(registration.statusCode, 200, registration.body);
  const transfer = await request('POST', `/clubs/${club.id}/transfers`, owner, { to_user_id: author.id });
  assert.equal(transfer.statusCode, 201, transfer.body);
  const mediaId = await image(author);
  const pending = await request('POST', `/clubs/${club.id}/posts`, author, { body: 'Published material removed with its club', images: [mediaId] });
  assert.equal(pending.statusCode, 201, pending.body);
  assert.equal((await request('POST', `/clubs/posts/${pending.json().id}/revisions/${pending.json().revision.id}/decision`, owner, { decision: 'approve' })).statusCode, 200);
  assert.equal((await request('GET', `/media/${mediaId}`)).statusCode, 200);
  const blockedAccountDeletion = await request('DELETE', '/me/account', owner, { password: owner.password, confirmation: 'DELETE' });
  assert.equal(blockedAccountDeletion.statusCode, 409, blockedAccountDeletion.body);
  const nonowner = await request('DELETE', `/clubs/${club.id}`, author, { password: author.password, confirmation: 'DELETE' });
  assert.equal(nonowner.statusCode, 403, nonowner.body);
  const wrongPassword = await request('DELETE', `/clubs/${club.id}`, owner, { password: 'This-is-not-the-right-password', confirmation: 'DELETE' });
  assert.equal(wrongPassword.statusCode, 401, wrongPassword.body);
  const unconfirmed = await request('DELETE', `/clubs/${club.id}`, owner, { password: owner.password });
  assert.equal(unconfirmed.statusCode, 422, unconfirmed.body);
  assert.equal((await one<{ state: string }>('SELECT state FROM clubs WHERE id=$1', [club.id]))?.state, 'active');
  const deleted = await request('DELETE', `/clubs/${club.id}`, owner, { password: owner.password, confirmation: 'DELETE' });
  assert.equal(deleted.statusCode, 200, deleted.body);
  assert.equal((await one<{ state: string }>('SELECT state FROM clubs WHERE id=$1', [club.id]))?.state, 'deleted');
  assert.equal(await one("SELECT id FROM club_memberships WHERE club_id=$1 AND (state IN ('active','pending') OR revoked_at IS NULL)", [club.id]), undefined);
  assert.equal((await one<{ state: string }>('SELECT state FROM event_registrations WHERE id=$1', [registration.json().id]))?.state, 'cancelled');
  assert.equal((await one<{ state: string }>('SELECT state FROM events WHERE id=$1', [event.json().id]))?.state, 'cancelled');
  assert.equal((await one<{ state: string }>('SELECT state FROM club_transfers WHERE id=$1', [transfer.json().id]))?.state, 'cancelled');
  for (const url of [`/clubs/${club.id}`, `/posts/${pending.json().id}`, `/events/${event.json().id}`, `/media/${mediaId}`]) {
    const hidden = await request('GET', url);
    assert.equal(hidden.statusCode, 404, `${url}: ${hidden.body}`);
  }
  const acceptDeletedTransfer = await request('POST', `/clubs/transfers/${transfer.json().id}/accept`, author);
  assert.equal(acceptDeletedTransfer.statusCode, 404, acceptDeletedTransfer.body);
  const accountDeletion = await request('DELETE', '/me/account', owner, { password: owner.password, confirmation: 'DELETE' });
  assert.equal(accountDeletion.statusCode, 200, accountDeletion.body);
  assert.equal((await one<{ status: string }>('SELECT status FROM users WHERE id=$1', [owner.id]))?.status, 'deleted');
});

async function revokeVerificationDuringWrite(user: TestUser, write: () => ReturnType<typeof request>) {
  const blocker = await pool.connect();
  let writing: ReturnType<typeof request> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    writing = write();
    let waiting = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      waiting = !!(await one<{ waiting: boolean }>(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT id FROM users WHERE id = ANY%') AS waiting`))?.waiting;
      if (waiting) break;
      await delay(25);
    }
    assert.equal(waiting, true, 'The write must have passed session resolution and reached the user lock');
    await blocker.query('UPDATE users SET verified_at=NULL WHERE id=$1', [user.id]);
    await blocker.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
    await blocker.query('COMMIT');
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
  return await writing!;
}

test('event registration rechecks verified status after waiting for an account change', async () => {
  const { owner, author, club } = await fixture();
  const event = await request('POST', `/clubs/${club.id}/events`, owner, { title: 'Event verification review', description: 'Account state must be checked after locks', audience: 'public', starts_at: new Date(Date.now() + 172800000).toISOString(), ends_at: new Date(Date.now() + 180000000).toISOString(), registration_closes_at: new Date(Date.now() + 86400000).toISOString(), capacity: 10 });
  assert.equal(event.statusCode, 201, event.body);
  const response = await revokeVerificationDuringWrite(author, () => request('POST', `/events/${event.json().id}/registration`, author));
  assert.equal(response.statusCode, 403, response.body);
  assert.equal(await one('SELECT 1 FROM event_registrations WHERE event_id=$1 AND user_id=$2', [event.json().id, author.id]), undefined);
});

test('LFG decisions recheck verified status after waiting for an account change', async () => {
  const owner = await createUser(), applicant = await createUser({ visibility: 'hidden' });
  const announcement = await request('POST', '/lfg', owner, { server: 'EU', roles: ['support'], description: 'Verification race review', expires_at: new Date(Date.now() + 86400000).toISOString(), pending_policy: 'keep' });
  assert.equal(announcement.statusCode, 201, announcement.body);
  const application = await request('POST', `/lfg/${announcement.json().id}/applications`, applicant, { message: 'A short explicit application', disclosure_consent: true });
  assert.equal(application.statusCode, 201, application.body);
  const response = await revokeVerificationDuringWrite(owner, () => request('POST', `/lfg/applications/${application.json().id}/decision`, owner, { decision: 'accepted' }));
  assert.equal(response.statusCode, 403, response.body);
  assert.equal((await one<{ state: string }>('SELECT state FROM lfg_applications WHERE id=$1', [application.json().id]))?.state, 'pending');
});
