export const VISIBILITY_WARNINGS = {
  public: 'Публичный профиль, выбранные публичные игровые поля и ранее опубликованные собственные записи станут доступны всем. Черновики и удалённые записи не открываются.',
  hidden: 'Скрытие не означает анонимность: комментарии с вашим ником под чужими публичными записями остаются видны. Ранее сохранённые другими людьми копии нельзя отозвать.',
};

export interface ProfileRow {
  id: string; handle: string; display_name: string; visibility: 'public' | 'hidden'; biography: string;
  avatar_id: string | null; cover_id: string | null; game: Record<string, { value: unknown; public: boolean }>;
  online_opt_in: boolean; created_at: Date; updated_at: Date; version: number;
  status: string; online?: boolean;
}

export function publicGame(game: ProfileRow['game']): ProfileRow['game'] {
  const allowed = new Set(['server', 'roles', 'rank', 'champions', 'schedule', 'timezone', 'languages']);
  return Object.fromEntries(Object.entries(game).filter(([key, field]) => allowed.has(key) && field && field.public === true));
}

export function ownProfileDTO(row: ProfileRow): object {
  return { id: row.id, handle: row.handle, display_name: row.display_name, visibility: row.visibility,
    biography: row.biography, avatar_id: row.avatar_id, cover_id: row.cover_id, game: row.game,
    online_opt_in: row.online_opt_in, created_at: row.created_at, updated_at: row.updated_at,
    version: row.version, visibility_warnings: VISIBILITY_WARNINGS };
}

export function publicProfileDTO(row: ProfileRow, social: { following: boolean; blocked_by_me: boolean; follower_count: number; following_count: number } = { following: false, blocked_by_me: false, follower_count: 0, following_count: 0 }): object {
  return { id: row.id, handle: row.handle, display_name: row.display_name, visibility: row.visibility,
    biography: row.biography, avatar_id: row.avatar_id, cover_id: row.cover_id, game: publicGame(row.game),
    game_data_source: 'self_reported', online: row.visibility === 'public' && !!row.online, created_at: row.created_at, ...social };
}
