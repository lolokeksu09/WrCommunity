import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {} from '@fastify/cookie';
import type { PoolClient } from 'pg';
import { execute, one } from '../../db/index.js';
import type { Viewer } from '../../types.js';

export const SESSION_COOKIE = 'wr_session';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const PASSWORD_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');
export const opaqueToken = (): string => randomBytes(32).toString('base64url');
export const hashPassword = (password: string): Promise<string> => argon2.hash(password, PASSWORD_OPTIONS);
let dummyPassword: Promise<string> | undefined;

export async function checkPassword(hash: string | undefined, password: string): Promise<boolean> {
  if (!hash) {
    dummyPassword ??= hashPassword(opaqueToken());
    await argon2.verify(await dummyPassword, password);
    return false;
  }
  try { return await argon2.verify(hash, password); } catch { return false; }
}

export interface AccountRow {
  id: string; email: string; password_hash: string; handle: string; display_name: string;
  visibility: 'public' | 'hidden'; platform_role: 'member' | 'moderator' | 'admin';
  status: 'active' | 'suspended' | 'deleted'; verified_at: Date | null;
}

export function viewerDTO(user: AccountRow): Viewer {
  return { id: user.id, email: user.email, handle: user.handle, display_name: user.display_name,
    visibility: user.visibility, platform_role: user.platform_role, status: user.status,
    verified: !!user.verified_at };
}

export async function resolveSession(request: FastifyRequest): Promise<void> {
  request.viewer = null;
  request.sessionId = null;
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  const row = await one<AccountRow & { session_id: string; csrf_token: string }>(
    `SELECT u.*,s.id AS session_id,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status<>'deleted'`,
    [hashSecret(token)]);
  if (!row) return;
  request.viewer = viewerDTO(row);
  request.sessionId = row.session_id;
  request.csrfToken = row.csrf_token;
  // Session activity is deliberately separate from opt-in website presence.
  await execute(`UPDATE sessions SET last_seen=now() WHERE id=$1 AND last_seen<now()-interval '1 minute'`, [row.session_id]);
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || (process.env.APP_ORIGIN ?? '').startsWith('https://'),
    maxAge: SESSION_SECONDS });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || (process.env.APP_ORIGIN ?? '').startsWith('https://') });
}

export async function createSession(tx: PoolClient, userId: string, oldSessionId?: string | null): Promise<string> {
  if (oldSessionId) await execute(`UPDATE sessions SET revoked_at=now() WHERE id=$1`, [oldSessionId], tx);
  const token = opaqueToken();
  await execute(`INSERT INTO sessions(user_id,token_hash,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '30 days')`,
    [userId, hashSecret(token), opaqueToken()], tx);
  return token;
}

export async function queueAuthEmail(tx: PoolClient, user: Pick<AccountRow, 'id' | 'email'>, purpose: 'verify' | 'reset'): Promise<void> {
  const token = opaqueToken();
  // A resend invalidates previous links; consumed hashes stay available for audit.
  await execute(`UPDATE auth_tokens SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL`, [user.id, purpose], tx);
  await execute(`INSERT INTO auth_tokens(user_id,purpose,token_hash,expires_at) VALUES($1,$2,$3,now()+$4::interval)`,
    [user.id, purpose, hashSecret(token), purpose === 'verify' ? '24 hours' : '1 hour'], tx);
  const url = new URL(purpose === 'verify' ? '/auth/verify' : '/auth/reset', process.env.APP_ORIGIN ?? 'http://localhost:3000');
  url.searchParams.set('token', token);
  const subject = purpose === 'verify' ? 'Подтвердите email WrCommunity' : 'Сброс пароля WrCommunity';
  const text = purpose === 'verify'
    ? `Для подтверждения email откройте ${url.toString()}\nСсылка действует 24 часа. Если вы не создавали аккаунт, проигнорируйте письмо.`
    : `Для сброса пароля откройте ${url.toString()}\nСсылка действует 1 час. Если вы не запрашивали сброс, проигнорируйте письмо.`;
  await execute(`INSERT INTO outbox(type,payload) VALUES('email',$1::jsonb)`, [JSON.stringify({ to: user.email, subject, text })], tx);
}
