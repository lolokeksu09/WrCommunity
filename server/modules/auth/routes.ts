import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { execute, one, query, transaction } from '../../db/index.js';
import { fail, idParam, parse, requireUser } from '../../lib.js';
import { checkPassword, clearSessionCookie, createSession, hashPassword, hashSecret, queueAuthEmail, setSessionCookie, viewerDTO, type AccountRow } from './service.js';

export { resolveSession } from './service.js';
const password = z.string().min(12).max(128);
const email = z.string().trim().toLowerCase().email().max(254);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const registerSchema = z.object({ email, password, handle: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/,'Используйте 3–32 латинские буквы, цифры или знак подчёркивания.'), display_name: z.string().trim().min(1).max(80) }).strict();
const securitySchema = z.object({ current_password: z.string().min(1).max(128), password: password.optional(), email: email.optional() }).strict().refine(v => v.password || v.email, 'Укажите новое значение');
const limited = (max: number) => ({ config: { rateLimit: { max, timeWindow: '15 minutes' } } });

function duplicate(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'; }

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/auth/session', async (request, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return { user: request.viewer, csrfToken: request.csrfToken };
  });

  app.post('/api/v1/auth/register', limited(10), async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const passwordHash = await hashPassword(input.password);
    try {
      const result = await transaction(async tx => {
        const user = await one<AccountRow>(`INSERT INTO users(email,password_hash,handle,display_name) VALUES($1,$2,$3,$4) RETURNING *`,
          [input.email, passwordHash, input.handle, input.display_name], tx);
        await queueAuthEmail(tx, user!, 'verify');
        return { user: viewerDTO(user!), token: await createSession(tx, user!.id, request.sessionId) };
      });
      setSessionCookie(reply, result.token);
      return reply.code(201).send({ user: result.user });
    } catch (error) {
      if (duplicate(error)) fail(409, 'ACCOUNT_UNAVAILABLE', 'Email или имя пользователя уже используется');
      throw error;
    }
  });

  app.post('/api/v1/auth/login', limited(20), async (request, reply) => {
    const input = parse(z.object({ email, password: z.string().min(1).max(128) }).strict(), request.body);
    const user = await one<AccountRow>('SELECT * FROM users WHERE email=$1', [input.email]);
    const valid = await checkPassword(user?.password_hash, input.password);
    if (!valid || !user || user.status !== 'active') fail(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
    const session = await transaction(async tx => {
      const current = await one<AccountRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id], tx);
      if (!current || current.status !== 'active' || current.password_hash !== user.password_hash) fail(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
      return { user: viewerDTO(current), token: await createSession(tx, current.id, request.sessionId) };
    });
    setSessionCookie(reply, session.token);
    return { user: session.user };
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    if (request.sessionId) await execute('UPDATE sessions SET revoked_at=now() WHERE id=$1', [request.sessionId]);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.post('/api/v1/auth/verify-request', limited(5), async request => {
    const user = requireUser(request, false);
    await transaction(async tx => {
      const current = await one<AccountRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id], tx);
      if (current?.status === 'active' && !current.verified_at) await queueAuthEmail(tx, current, 'verify');
    });
    return { ok: true };
  });

  app.post('/api/v1/auth/verify-email', limited(20), async request => {
    const { token } = parse(z.object({ token: tokenSchema }).strict(), request.body);
    const candidate = await one<{ user_id: string }>(`SELECT user_id FROM auth_tokens WHERE token_hash=$1 AND purpose='verify'`, [hashSecret(token)]);
    if (!candidate) fail(422, 'INVALID_TOKEN', 'Ссылка недействительна или истекла');
    await transaction(async tx => {
      const user = await one<AccountRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id], tx);
      if (!user || user.status !== 'active') fail(422, 'INVALID_TOKEN', 'Ссылка недействительна или истекла');
      const consumed = await one(`UPDATE auth_tokens SET consumed_at=now() WHERE token_hash=$1 AND purpose='verify' AND user_id=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING id`, [hashSecret(token), user.id], tx);
      if (!consumed) fail(422, 'INVALID_TOKEN', 'Ссылка недействительна или истекла');
      await execute('UPDATE users SET verified_at=now(),updated_at=now() WHERE id=$1', [user.id], tx);
    });
    return { ok: true };
  });

  app.post('/api/v1/auth/reset-request', limited(5), async request => {
    const input = parse(z.object({ email }).strict(), request.body);
    await transaction(async tx => {
      const user = await one<AccountRow>(`SELECT * FROM users WHERE email=$1 AND status='active' FOR UPDATE`, [input.email], tx);
      if (user) await queueAuthEmail(tx, user, 'reset');
    });
    return { ok: true };
  });

  app.post('/api/v1/auth/reset-confirm', limited(15), async (request, reply) => {
    const input = parse(z.object({ token: tokenSchema, password }).strict(), request.body);
    const candidate = await one<{ user_id: string }>(`SELECT user_id FROM auth_tokens WHERE token_hash=$1 AND purpose='reset'`, [hashSecret(input.token)]);
    if (!candidate) fail(422, 'INVALID_TOKEN', 'Ссылка недействительна или истекла');
    const passwordHash = await hashPassword(input.password);
    await transaction(async tx => {
      const user = await one<AccountRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [candidate.user_id], tx);
      if (!user || user.status !== 'active') fail(422, 'INVALID_TOKEN', 'Ссылка недействительна или истекла');
      const consumed = await one(`UPDATE auth_tokens SET consumed_at=now() WHERE token_hash=$1 AND purpose='reset' AND user_id=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING id`, [hashSecret(input.token), user.id], tx);
      if (!consumed) fail(422, 'INVALID_TOKEN', 'Ссылка недействительна или истекла');
      await execute('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [passwordHash, user.id], tx);
      await execute('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id], tx);
      await execute(`UPDATE auth_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose='reset' AND consumed_at IS NULL`, [user.id], tx);
    });
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/v1/me/sessions', async request => {
    const user = requireUser(request, false);
    return { items: await query(`SELECT id,created_at,expires_at,last_seen,(id=$2::uuid) AS current FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC,id`, [user.id, request.sessionId]) };
  });

  app.delete('/api/v1/me/sessions/:id', async (request, reply) => {
    const user = requireUser(request, false);
    const id = idParam(request);
    const session = await one('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 RETURNING id', [id, user.id]);
    if (!session) fail(404, 'NOT_FOUND', 'Сессия не найдена');
    if (id === request.sessionId) clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/v1/me/settings', async request => {
    const user = requireUser(request, false);
    return one('SELECT email,(verified_at IS NOT NULL) AS verified,online_opt_in FROM users WHERE id=$1', [user.id]);
  });

  app.patch('/api/v1/me/settings', limited(10), async (request, reply) => {
    const user = requireUser(request, false);
    const input = parse(securitySchema, request.body);
    const current = await one<AccountRow>('SELECT * FROM users WHERE id=$1', [user.id]);
    if (!await checkPassword(current?.password_hash, input.current_password)) fail(401, 'INVALID_CREDENTIALS', 'Неверный пароль');
    const nextHash = input.password ? await hashPassword(input.password) : current!.password_hash;
    try {
      await transaction(async tx => {
        const locked = await one<AccountRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id], tx);
        if (!locked || locked.status !== 'active' || locked.password_hash !== current!.password_hash) fail(409, 'ACCOUNT_CHANGED', 'Повторите действие после входа');
        const changedEmail = !!input.email && input.email !== locked.email;
        await execute(`UPDATE users SET email=$2,password_hash=$3,verified_at=CASE WHEN $4 THEN NULL ELSE verified_at END,updated_at=now() WHERE id=$1`, [user.id, input.email ?? locked.email, nextHash, changedEmail], tx);
        await execute('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id], tx);
        await execute('UPDATE auth_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL', [user.id], tx);
        if (changedEmail) await queueAuthEmail(tx, { id: user.id, email: input.email! }, 'verify');
        await execute(`INSERT INTO audit_actions(actor_id,action,target_id) VALUES($1,'account.security_changed',$1)`, [user.id], tx);
      });
    } catch (error) {
      if (duplicate(error)) fail(409, 'ACCOUNT_UNAVAILABLE', 'Email недоступен');
      throw error;
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.delete('/api/v1/me/account', limited(5), async (request, reply) => {
    const user = requireUser(request, false);
    const input = parse(z.object({ password: z.string().min(1).max(128), confirmation: z.literal('DELETE') }).strict(), request.body);
    const current = await one<AccountRow>('SELECT * FROM users WHERE id=$1', [user.id]);
    if (!await checkPassword(current?.password_hash, input.password)) fail(401, 'INVALID_CREDENTIALS', 'Неверный пароль');
    await transaction(async tx => {
      const locked = await one<AccountRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id], tx);
      if (!locked || locked.status !== 'active' || locked.password_hash !== current!.password_hash) fail(409, 'ACCOUNT_CHANGED', 'Повторите действие после входа');
      if (await one(`SELECT id FROM clubs WHERE owner_id=$1 AND state<>'deleted' LIMIT 1`, [user.id], tx)) fail(409, 'CLUB_OWNER', 'Передайте владение или удалите свои клубы перед удалением аккаунта');
      await execute(`UPDATE users SET email=$2,password_hash='',handle=$3,display_name='Удалённый участник',visibility='hidden',biography='',avatar_id=NULL,cover_id=NULL,game='{}',online_opt_in=false,last_seen=NULL,status='deleted',verified_at=NULL,deleted_at=now(),updated_at=now(),version=version+1 WHERE id=$1`,
        [user.id, `deleted+${user.id}@invalid.local`, `deleted_${user.id.replaceAll('-', '').slice(0, 24)}`], tx);
      await execute('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [user.id], tx);
      await execute('DELETE FROM auth_tokens WHERE user_id=$1', [user.id], tx);
      await execute('UPDATE comments SET author_id=NULL,snapshot_nickname=NULL,snapshot_avatar_id=NULL,updated_at=now() WHERE author_id=$1', [user.id], tx);
      await execute(`UPDATE posts SET state='removed',updated_at=now() WHERE author_id=$1`, [user.id], tx);
      await execute('DELETE FROM follows WHERE follower_id=$1 OR followee_id=$1', [user.id], tx);
      await execute('DELETE FROM blocks WHERE blocker_id=$1 OR blocked_id=$1', [user.id], tx);
      await execute('DELETE FROM reactions WHERE user_id=$1', [user.id], tx);
      await execute('DELETE FROM bookmarks WHERE user_id=$1', [user.id], tx);
      await execute('DELETE FROM mentions WHERE user_id=$1', [user.id], tx);
      await execute(`UPDATE club_memberships SET state='left',nickname='Удалённый участник',nickname_key=$2,avatar_id=NULL,roles='[]',consent_version=NULL,consented_at=NULL,revoked_at=now(),reason=NULL,updated_at=now() WHERE user_id=$1`, [user.id, `deleted_${user.id}`], tx);
      await execute('DELETE FROM club_name_reservations WHERE user_id=$1', [user.id], tx);
      await execute(`UPDATE club_transfers SET state='cancelled' WHERE (from_id=$1 OR to_id=$1) AND state='pending'`, [user.id], tx);
      await execute(`UPDATE event_registrations SET state='cancelled' WHERE user_id=$1 AND state='active'`, [user.id], tx);
      await execute(`UPDATE lfg_announcements SET state='deleted',description='',updated_at=now() WHERE author_id=$1`, [user.id], tx);
      await execute(`UPDATE lfg_applications SET state='cancelled',message='',disclosed_nickname=NULL,disclosure_consent=false,decided_at=now() WHERE applicant_id=$1`, [user.id], tx);
      await execute('DELETE FROM lfg_contacts WHERE user_id=$1', [user.id], tx);
      await execute('DELETE FROM notifications WHERE recipient_id=$1', [user.id], tx);
      await execute('UPDATE notifications SET actor_id=NULL WHERE actor_id=$1', [user.id], tx);
      await execute('DELETE FROM notification_preferences WHERE user_id=$1', [user.id], tx);
      await execute(`UPDATE media_blobs SET state='deleted' WHERE owner_id=$1`, [user.id], tx);
      await execute(`DELETE FROM outbox WHERE type='email' AND payload->>'to'=$1 AND completed_at IS NULL`, [locked.email], tx);
      await execute(`INSERT INTO audit_actions(actor_id,action,target_id) VALUES($1,'account.deleted',$1)`, [user.id], tx);
    });
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/v1/me/export', async (request, reply) => {
    const user = requireUser(request, false);
    reply.header('Cache-Control', 'private, no-store');
    reply.header('Content-Disposition', 'attachment; filename="wrcommunity-account.json"');
    const profile = await one(`SELECT id,email,handle,display_name,visibility,biography,avatar_id,cover_id,game,online_opt_in,created_at,updated_at FROM users WHERE id=$1`, [user.id]);
    const [posts, comments, memberships, registrations, preferences, sessions] = await Promise.all([
      query(`SELECT p.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'images',r.images,'tags',r.tags,'status',r.status,'created_at',r.created_at)) FROM post_revisions r WHERE r.post_id=p.id),'[]'::jsonb) AS revisions FROM posts p WHERE p.author_id=$1`, [user.id]),
      query('SELECT id,post_id,parent_id,body,state,created_at,updated_at FROM comments WHERE author_id=$1', [user.id]),
      query('SELECT club_id,role,state,nickname,roles,consented_at,revoked_at,joined_at FROM club_memberships WHERE user_id=$1', [user.id]),
      query('SELECT event_id,state,created_at FROM event_registrations WHERE user_id=$1', [user.id]),
      query('SELECT event_type,enabled FROM notification_preferences WHERE user_id=$1', [user.id]),
      query('SELECT id,created_at,expires_at,revoked_at,last_seen FROM sessions WHERE user_id=$1', [user.id]),
    ]);
    return { exported_at: new Date().toISOString(), profile, posts, comments, memberships, registrations, notification_preferences: preferences, sessions };
  });
}
