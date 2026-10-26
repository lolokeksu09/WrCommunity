import {canonicalRoles} from '../../../shared/game-roles.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { execute, one, transaction } from '../../db/index.js';
import { fail, idParam, parse, requireUser } from '../../lib.js';
import { ownProfileDTO, publicProfileDTO, type ProfileRow } from './service.js';
import { countVisibleFollows } from '../social/service.js';

const text = (length: number) => z.string().trim().max(length);
const gameText = (length: number) => z.object({ value: text(length), public: z.boolean().default(false) }).strict().nullable().optional();
const gameList = z.object({ value: z.array(z.string().trim().min(1).max(60)).max(20), public: z.boolean().default(false) }).strict().nullable().optional();
const timezone = z.string().max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Укажите часовой пояс IANA');
const gameSchema = z.object({
  server: gameText(60), roles: gameList.transform(field=>field?{...field,value:canonicalRoles(field.value)}:field), rank: gameText(60), champions: gameList,
  schedule: gameText(500), timezone: z.object({ value: timezone, public: z.boolean().default(false) }).strict().nullable().optional(), languages: gameList,
}).strict();
const profileSchema = z.object({
  version: z.number().int().positive(), display_name: text(80).min(1).optional(), biography: text(2000).optional(),
  avatar_id: z.string().uuid().nullable().optional(), cover_id: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public', 'hidden']).optional(), visibility_acknowledged: z.boolean().optional(),
  online_opt_in: z.boolean().optional(), game: gameSchema.optional(),
}).strict().refine(input => Object.keys(input).some(key => !['version', 'visibility_acknowledged'].includes(key)), 'Укажите изменяемое поле');

export async function registerProfiles(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/me/profile', async (request, reply) => {
    const user = requireUser(request, false);
    reply.header('Cache-Control', 'private, no-store');
    const profile = await one<ProfileRow>('SELECT * FROM users WHERE id=$1 AND status=\'active\'', [user.id]);
    if (!profile) fail(404, 'NOT_FOUND', 'Профиль не найден');
    return ownProfileDTO(profile);
  });

  app.patch('/api/v1/me/profile', async (request, reply) => {
    const user = requireUser(request, false);
    const input = parse(profileSchema, request.body);
    reply.header('Cache-Control', 'private, no-store');
    return transaction(async tx => {
      // Club creation and transfer lock the same row before assigning ownership.
      const current = await one<ProfileRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id], tx);
      if (!current || current.status !== 'active') fail(404, 'NOT_FOUND', 'Профиль не найден');
      if (input.version !== current.version) fail(409, 'VERSION_CONFLICT', 'Профиль изменился. Сравните свой ввод с актуальной версией.');
      const nextVisibility = input.visibility ?? current.visibility;
      if (nextVisibility !== current.visibility && input.visibility_acknowledged !== true) fail(422, 'VISIBILITY_ACK_REQUIRED', 'Подтвердите предупреждение об изменении видимости');
      if (nextVisibility === 'hidden' && await one(`SELECT id FROM clubs WHERE owner_id=$1 AND state<>'deleted' LIMIT 1`, [user.id], tx)) {
        fail(409, 'CLUB_OWNER', 'Владелец клуба должен оставаться публичным. Сначала передайте владение или удалите клуб');
      }
      for (const mediaId of [input.avatar_id, input.cover_id]) {
        if (mediaId && !await one(`SELECT id FROM media_blobs WHERE id=$1 AND owner_id=$2 AND state='ready' FOR SHARE`, [mediaId, user.id], tx)) fail(422, 'INVALID_MEDIA', 'Изображение недоступно');
      }
      const game = { ...current.game };
      for (const [key, value] of Object.entries(input.game ?? {})) {
        if (value === null) delete game[key];
        else if (value !== undefined) game[key] = value;
      }
      const updated = await one<ProfileRow>(`UPDATE users SET display_name=$2,biography=$3,avatar_id=$4,cover_id=$5,visibility=$6,
        online_opt_in=$7,game=$8::jsonb,last_seen=CASE WHEN $6='hidden' OR NOT $7 THEN NULL ELSE last_seen END,
        version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [user.id, input.display_name ?? current.display_name, input.biography ?? current.biography,
          input.avatar_id === undefined ? current.avatar_id : input.avatar_id,
          input.cover_id === undefined ? current.cover_id : input.cover_id,
          nextVisibility, input.online_opt_in ?? current.online_opt_in, JSON.stringify(game)], tx);
      if (nextVisibility !== current.visibility) {
        await execute(`INSERT INTO audit_actions(actor_id,action,target_id,metadata) VALUES($1,'profile.visibility_changed',$1,$2::jsonb)`,
          [user.id, JSON.stringify({ from: current.visibility, to: nextVisibility, warning_acknowledged: true })], tx);
      }
      return ownProfileDTO(updated!);
    });
  });

  app.get('/api/v1/profiles/:id', async (request, reply) => {
    const id = idParam(request);
    const viewer = request.viewer?.id ?? null;
    reply.header('Cache-Control', 'private, no-store');
    const profile = await one<ProfileRow>(`SELECT u.*,(u.password_hash='!wrc-editorial-no-login-v1' AND u.email LIKE '%@example.invalid') AS editorial,(u.visibility='public' AND u.online_opt_in AND u.last_seen>now()-interval '2 minutes') AS online
      FROM users u WHERE u.id=$1 AND u.status='active' AND (u.visibility='public' OR u.id=$2::uuid)
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$2::uuid AND b.blocked_id=u.id) OR (b.blocked_id=$2::uuid AND b.blocker_id=u.id))`, [id, viewer]);
    if (!profile) fail(404, 'NOT_FOUND', 'Профиль не найден');
    const [followers, following, relation] = await Promise.all([
      countVisibleFollows(id, viewer, 'followers'), countVisibleFollows(id, viewer, 'following'),
      viewer ? one<{ following: boolean }>('SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id=$1 AND followee_id=$2) AS following', [viewer, id]) : undefined,
    ]);
    return publicProfileDTO(profile, { following: relation?.following ?? false, blocked_by_me: false,
      follower_count: followers.length, following_count: following.length });
  });

  app.post('/api/v1/me/heartbeat', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const user = requireUser(request, false);
    await execute(`UPDATE users SET last_seen=now() WHERE id=$1 AND status='active' AND online_opt_in=true`, [user.id]);
    return { ok: true };
  });
}
