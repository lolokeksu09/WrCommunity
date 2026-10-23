# WrCommunity — Technical Architecture v1

**Дата:** 23 октября 2026 г.  
**Статус:** рабочее техническое решение для самостоятельного ревью, **не развёрнутая система**.  
**Предпосылки:** `Functional-Specification-v1.md`, `Screen-Map-v1.md`, `Product-Decisions-v1.1.md`; действующий Social Core v1 остаётся исходным контрактом.  
**Применимость:** новый `lolokeksu09/WrCommunity`. Старый `wild-rift-community` не используется; предпочтения его стека не переносятся автоматически.

## 1. Цель и альтернативы

Создать mobile-first социальную платформу с надёжными транзакциями: скрытые аккаунты, клубные исключения приватности, согласия, премодерация, LFG, вместимость мероприятий, уведомления и журнал действий. Первый пилот рассчитан на одну инфраструктурную площадку; достоверные показатели нагрузки пока не известны.

| Архитектура | Сильные стороны | Риски | Решение |
|---|---|---|---|
| Модульный монолит TypeScript + PostgreSQL | Общие транзакции, быстрые интеграционные тесты, меньше движущихся частей | Важно соблюдать модульные границы | **Выбрана** |
| SPA + serverless BaaS | Быстрый старт | Трудно выразить сложные согласованные ACL/транзакции и аудит | Не выбрана |
| Разделённые микросервисы + брокер | Независимое масштабирование | Высокая эксплуатационная сложность без доказанной нужды | Отложена |

### 1.1. Базовый стек

- **Runtime:** Node.js 24 LTS; фиксировать конкретный security-patch образ при сборке, регулярно обновлять. **Не** брать Node 26 Current для продакшена пилота лишь ради новизны.
- **API:** Fastify 5, TypeScript strict, JSON Schema валидация и документирование OpenAPI.
- **Web:** React 19, TypeScript, Vite, React Router в **Data mode** для маршрутов/ожидающих состояний; SSR не нужен на старте. Публичные метаданные SEO/OG генерировать отдельным безопасным серверным обработчиком при необходимости.
- **Data:** PostgreSQL 18 с регулярными security minors; SQL миграции с версионированием, типизированный query layer (например, Kysely). Не фиксировать точную patch-версию пакета до lockfile и CI.
- **Edge:** Caddy с TLS, gzip/zstd where supported и безопасными HTTP заголовками. Docker Compose для `web-api`, `worker`, `postgres`, `caddy`; сервисы приложения используют один набор domain modules.
- **Media:** локальное приватное файловое хранилище через адаптер `MediaStorage` с возможностью будущего перехода на S3-compatible; метаданные в PostgreSQL. Публичная отдача изображений всё равно проходит отдельный ACL-check при требуемых ограничениях; не сохранять закрытые материалы под необратимо публичным URL.
- **Mail:** внешний SMTP-провайдер для одноразовых сообщений верификации и восстановления; социальные уведомления по email не отправлять на старте.
- **Background:** один worker, выполняющий записи из транзакционной очереди/outbox PostgreSQL. **Без Redis, Kafka, Elasticsearch** на этапе пилота.

**Внешняя сверка выбора (проверено 23.10.2026):**
- Node.js: https://github.com/nodejs/Release/blob/main/README.md, https://github.com/nodejs/node/releases
- PostgreSQL: https://www.postgresql.org/support/versioning/
- Fastify: https://fastify.dev/docs/v5.10.x/Reference/LTS/
- React Router Data mode: https://reactrouter.com/start/modes

## 2. Границы модулей и зависимости

```text
Browser SPA ── HTTPS / same-site ── Caddy ── Fastify API ── PostgreSQL
                                        │                  │
                                        │                  └── Outbox / Jobs ── Worker ── SMTP
                                        └── Media ACL gateway ── Private Filesystem
```

| Модуль | Владеет | Не должен делать |
|---|---|---|
| `auth` | users, sessions, credentials, email verification/reset | Раскрывать email публичным API |
| `profiles` | visibility, handle, display_name, game fields, presence policy | Делать hidden доступным через поиск |
| `social` | posts, post revisions, comments, follows, blocks, likes/bookmarks | Обходить общий PolicyEngine |
| `discovery` | фильтры игроков, безопасные рекомендации | Кэшировать hidden-профили как публичные |
| `lfg` | объявления, срок, заявки, согласие на адресный отклик, contact exchange | Предполагать наличие чатов |
| `clubs` | клубы, роли, членство, заявки, псевдонимы, club consent | Открывать основной hidden-профиль |
| `club-content` | клубные посты, премодерация, закрепление, ветки ответов | Публиковать нерассмотренные редакции |
| `events` | события, регистрация, лимит мест, отмена | Превышать лимит при параллельных запросах |
| `notifications` | in-app события, предпочтения, read/unread | Хранить развернутый секретный контент в push/email |
| `moderation` | жалобы, санкции, audited actions | Автоматически выдавать всем модераторам полный доступ к hidden |
| `media` | приватные загрузки, преобразование, выдача по правам | Публиковать постоянную ссылку на приватный объект |
| `policy` | сервисный набор проверок прав, blocked, read/write audience | Доверять UI или флагу, присланному клиентом |

Подсистемы вызывают `policy` и используют транзакционные операции общего репозитория. Обычный user object не несёт полного набора прав: каждое действие проверяется в контексте `(viewer, object, relation, consent, object_state, revision)`.

## 3. Типизированные политические предикаты

Проектируемые API сервиса (вместо путаницы с разными клиентскими флагами):

```ts
type Principal = { id: string; platformRole: 'member'|'moderator'|'admin' } | null;
type AccessDecision = { allowed: boolean; reason: 'ok'|'unauthenticated'|'hidden'|'blocked'|'not_member'|'no_permission'|'removed'|'consent_missing' };
canViewProfile(viewer: Principal, profileId: string): Promise<AccessDecision>;
canViewPost(viewer: Principal, postId: string): Promise<AccessDecision>;
canReadClubMembership(viewer: Principal, clubId: string, memberId: string): Promise<AccessDecision>;
canCommentClubPost(viewer: Principal, postId: string): Promise<AccessDecision>;
canApplyToLfg(viewer: Principal, announcementId: string): Promise<AccessDecision>;
canSeeEventRegistration(viewer: Principal, registrationId: string): Promise<AccessDecision>;
canReadMedia(viewer: Principal, blobId: string): Promise<AccessDecision>;
isEffectivelyBlocked(a: string, b: string): Promise<boolean>;
```

**Инварианты:** `blocked(A,B) = block(A,B) OR block(B,A)`; hidden-профиль запрещён публичному `ProfileDTO`; club identity — отдельное представление только в контексте действующего клуба/исторического комментария согласно прежней ACL; заявки hidden в LFG имеют явный получатель и подтверждённый набор полей; отзыв согласия прекращает дальнейшее раскрытие кроме исторической подписи в ранее дозволенном обсуждении.

**Фильтрация до выдачи:** сначала серверный ACL и query predicate, потом пагинация/кэш. Не формировать общий counts и отдельный filtered list, если разность раскрывает скрытых участников. Для недоступного hidden объекта внешний ответ не должен подтверждать существование: безопасный `404`. Для собственной авторизованной операции допустим ясный `403`/`409`.

**Права на клуб:** `owner`, `admin`, `moderator`, `member` — независимы от глобальных ролей; более низкая роль не повышает себя; право `approve_post` не равно праву `view_private_profile`; проверять полномочие *после* загрузки текущей роли и статуса клуба.

## 4. Модель данных (логическая; таблицы будущих миграций)

### 4.1. Accounts and Social Core

- `users(id uuid PK, state, created_at, deleted_at)`; `credentials(user_id PK, email_normalized unique, password_hash, verified_at)`; `sessions(id, user_id, secret_hash, expires_at, revoked_at)`; `auth_tokens(id, user_id, purpose, token_hash, expires_at, consumed_at)`.
- `profiles(user_id PK, handle_key unique, handle, display_name, visibility, biography, online_opt_in, updated_at)`; `game_profiles(user_id PK, server_code, role_codes, rank_declared, champions_declared, schedule_json, timezone, field_visibility_json)`; `presence_heartbeats(user_id PK, seen_at)` — только для opt-in публичных пользователей.
- `blocks(blocker_id, blocked_id, created_at, PK(blocker_id,blocked_id))`; `follows(follower_id, followee_id, PK(follower_id,followee_id))`.
- `posts(id, author_id, context_type, club_id?, state, audience, audience_epoch, created_at, approved_at, current_revision_id)`; `post_revisions(id, post_id, body, image_manifest, review_status, submitted_at, reviewer_id, review_at, approval_reason?)` — предыдущее одобренное `current_revision_id` до решения по правке.
- `comments(id, parent_post_id, parent_comment_id?, author_id?, body, state, club_historic_identity_id?, created_at)`; `reactions(user_id, target_type, target_id, PK(user_id,target_type,target_id))`; `bookmarks(user_id, post_id, PK(user_id,post_id))`.
- `topics(id,name,slug)`, `post_topics(post_id,topic_id)`, `mentions(post_id,mentioned_user_id)` — политика блокировок применяется при публикации и доставке.

### 4.2. Club Identity and Moderation

- `clubs(id uuid PK, owner_id, name, description, join_mode, feed_visibility, settings_revision, state, created_at, updated_at)`.
- `club_memberships(id, club_id, user_id, role, state, joined_at, left_at, unique_active(club_id,user_id))`; `club_join_requests(id, club_id, applicant_id, identity_payload_id?, state, decision_by?, reason?, created_at)`.
- `club_identities(id, club_id, user_id, display_name, display_name_key, avatar_blob_id?, role_set, active, updated_at)`; для одного активного имени в клубе — уникальный индекс `(club_id,display_name_key)` с reservation table для исторических имён.
- `club_consents(id, club_id, user_id, policy_version, allowed_fields_json, accepted_at, revoked_at)`.
- `club_identity_snapshots(id, club_id, author_id_internal, visible_nick, archived_avatar_blob_id?, audience_scope, created_at)` — отображение старых комментариев **только в прежнем контексте**; персональные поля удаляются/обезличиваются при удалении аккаунта по согласованной политике.
- `club_permissions(club_id, role, permission, enabled)`; `club_moderation_queue(post_revision_id, club_id, requested_at, state, reviewer_id, decision_at)`; `club_membership_audit`, `audit_actions`.

### 4.3. Events, LFG, Notifications

- `events(id, club_id, actor_id_internal, title, body, audience, starts_at, ends_at, registration_closes_at, capacity, state, created_at)`; `event_registrations(id, event_id, member_id, state, created_at, UNIQUE(event_id,member_id))`.
- `lfg_announcements(id, author_id, server_code, roles_json, description, expires_at, pending_policy, state, created_at)`; `lfg_applications(id, announcement_id, applicant_id, message, nickname_disclosure_id?, state, decision_at, UNIQUE(announcement_id,applicant_id))`.
- `disclosure_consents(id, source_user_id, target_user_id, scope, fields_json, accepted_at, revoked_at, policy_version)`; `lfg_contact_offers(id, application_id, source_user_id, target_user_id, contact_encrypted, confirmed_at, revoked_at)`; never include email or phone in DTO unless explicitly opt-in by separate future policy.
- `notifications(id, recipient_id, event_type, object_type, object_id, actor_id_internal?, created_at, read_at)`; `notification_preferences(user_id,event_type,enabled)`; `outbox(id, type, payload_minimal, available_at, locked_until, attempts, completed_at)`; `idempotency_keys(user_id, key, operation, request_hash, response_status, response_body_minimal, expires_at)`.
- `media_blobs(id, owner_id, storage_key, sha256, mime_sanitized, size_bytes, visibility_scope, state, created_at)`; `reports(id, reporter_id, target_type, target_id, state)`; `moderation_actions(id, actor_id, target_type, target_id, action, created_at, reason, audit_metadata)`.

**Unique constraints + FK** обязательны. Динамические permission snapshots не являются источником истины: при чтении контента требуется актуальная проверка membership/ACL. Исключение — историческая подпись, которая намеренно фиксирует допустимое авторство и scope в момент создания.

## 5. Критичные транзакции

| Сценарий | Атомарная граница | Конкурентная проверка |
|---|---|---|
| Создать клуб | Lock user owner row + проверить `public`, verified, антиспам, текущие владения; создать club + owner membership + audit + outbox | Параллельный четвёртый клуб запрещён. Idempotency key не создаёт повтор |
| Владелец скрывает профиль | Lock owner row + проверить число клубов во владении перед `profiles.visibility=hidden` | Параллельная передача/создание клуба не оставляет hidden владельца |
| Вступление hidden | Lock membership/user, проверить конкретный действующий consent/identity, вставить membership или request | Отзыв consent и одобрение заявки не образуют активное членство без согласия |
| Выход/исключение | Завершить membership + consent + будущие регистрации на мероприятия + outbox | Освобождение мест без двойной отмены; историческая подпись сохраняется по ACL |
| Заблокировать | Lock пару в каноническом порядке + записать block + удалить обе follows и взаимные reactions + событие для пересчёта counters | Подписка/реакция после блокировки запрещена независимо от гонки |
| Публикация/редакция | Создать новую revision `pending`; approval подтверждает авторскую публичность и разрешения заново | Старое approved содержимое остаётся до нового решения; нельзя публиковать hidden |
| Последнее место в событии | `SELECT ... FOR UPDATE` event row + подсчёт/обновление счетчика регистрации в одной transaction + unique registration | При capacity=1 и двух запросах ровно одна регистрация |
| LFG expiry/decisions | Lock announcement row + check expires_at DB clock + apply pending_policy + outbox | Параллельное принятие/закрытие приводит к одному допустимому исходу |
| Доставка уведомления | Outbox event + preferences + повторная policy-check при чтении | At-least-once worker, уникальный dedupe key для idempotent обработки |

**Проверять время по серверной БД** (в UTC). Клиентские часы — исключительно отображение. Объявление без максимального срока может быть длинным, но обязательно имеет явное `expires_at` позже момента создания. Не путать локальные часовые пояса с длительностью срока.

## 6. HTTP API v1 — предлагаемый контракт

Префикс `/api/v1`; JSON DTO с явной версией. Сокращённый реестр для планирования, не существующие рабочие эндпоинты:

| Метод | Маршрут | Операция | Политика |
|---|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | Регистрация/вход/выход | rate limit, csrf/session |
| POST | `/auth/verify-email`, `/auth/reset-request`, `/auth/reset-confirm` | Верификация и восстановление | одноразовые hashed tokens |
| GET/PATCH | `/me/profile` | Личные настройки, игровые поля, online opt-in | владелец, optimistic version |
| GET | `/profiles/:id`, `/feed`, `/feed/following` | Чтение доступного публичного/подписного контента | PolicyEngine |
| POST/PATCH/DELETE | `/posts`, `/posts/:id`, `/posts/:id` | Создать/изменить/удалить свой пост | limits, current ACL |
| GET/POST | `/posts/:id/comments` | Читать/оставить комментарий | context ACL, blocked, actor state |
| GET | `/players/search` | Только публично разрешённые игровые карточки | no hidden |
| GET/POST | `/lfg`, `/lfg` | Поиск/создать объявление | public author, idempotency |
| POST | `/lfg/:id/applications` | Подать отклик | hidden disclosure consent, recipient-only |
| POST | `/lfg/applications/:id/decision` | Принять/отклонить | объявление принадлежит principal |
| POST | `/lfg/applications/:id/contact-offer` | Согласованный контакт | accepted application + opt-in |
| GET/POST | `/clubs`, `/clubs` | Каталог/создать клуб | discoverability vs permission |
| GET/PATCH | `/clubs/:id`, `/clubs/:id` | Информация/настройки | owner modifies visibility |
| POST | `/clubs/:id/join`, `/clubs/:id/requests` | Свободное вступление/заявка | consent, verified membership |
| POST | `/clubs/requests/:id/decision` | Решение по заявке | owner/admin |
| POST | `/clubs/:id/leave` | Выход/отзыв | transaction revoke + registration cancel |
| GET/POST | `/clubs/:id/posts` | Лента/отправка поста на проверку | audience + membership + moderation |
| POST | `/clubs/posts/:id/revisions/:rid/decision` | Одобрить/отклонить редакцию | conflict-of-interest rules |
| POST/GET | `/clubs/:id/events` | Создать/посмотреть события | role permission + ACL |
| POST/DELETE | `/events/:id/registration` | Участие/отмена | membership + capacity lock |
| GET/PATCH | `/me/notifications`, `/me/notification-preferences` | Уведомления, категории | только recipient; policy re-check |
| POST | `/reports` | Жалоба | доступность процедуры даже при block |
| GET | `/media/:id` | Отдать обработанное медиа | `canReadMedia` и no-store для private |

**Формат ошибок:** `{ error: { code, message, fields?, requestId } }`. Не превращать `hidden` в `403` с текстом «объект существует, но закрыт» для постороннего запроса. `409` для конфликтов текущего состояния, `422` для полей формы, `429` для ограничений частоты.

**Кэш:** public assets immutable с hash; разрешённые общие публичные ленты с коротким TTL и инвалидацией ACL; private media/posts/notifications `Cache-Control: private, no-store`. ETag для частного ресурса тоже может раскрывать состояние, если не фильтровать доступ до условного GET.

## 7. Безопасность и данные

- Cookie сессии: `HttpOnly; Secure; SameSite=Lax`, rotation on login/security events, expiry and revoke in database; отдельная защита state-changing запросов CSRF token + Origin verification (вместе с SameSite, а не вместо него). Полноценные `Content-Security-Policy` и другие заголовки задать в Caddy/API.
- Пароли: Argon2id, лимит попыток, безопасный сброс через хешированные одноразовые токены, не раскрывающие существование email. Не логировать токены, контакты, адреса и приватные комментарии.
- Все пользовательские HTML/Markdown вводы либо выводятся как plain text, либо проходят явно разрешённый sanitizer; не выполнять HTML в контенте и не давать inline script из UGC.
- Upload: MIME sniffing, запрет SVG/исполняемых файлов, серверная перекодировка изображений, сброс EXIF/GPS, размер/пиксели/timeout guard, metadata table; антивирус по оценке угроз для сторонних вложений. Медиа bucket/local storage не отдаётся Caddy как общедоступная папка.
- Sensitive LFG contacts: never default; шифрование на уровне приложения/KMS-compatible secret, ограничение чтения по конкретному recipient; это не полноценное E2E-шифрование и так не рекламируется.
- Модерация: каждый privileged read приватных данных должен иметь обоснование, ограниченную роль, уникальный audit action. Жалобы не блокируются взаимной block-связью. Журнал append-only на уровне приложения, с резервным сохранением от подмены.
- Онлайн: heartbeat только при активной сессии и opt-in; статус рассчитывать по свежему heartbeat (например, окно 2 минуты), не по «последнему HTTP запросу»; hidden выключает публичную отдачу сразу.
- Data rights: удаление и экспорт персональных данных, retention, backups, законное хранение данных для жалоб определяются под правовым gate до публичного запуска. Тестируемые операции анонимизации должны существовать до пилота.

## 8. Background jobs / outbox

В PostgreSQL одна очередь с транзакционной записью события одновременно с исходной операцией. Worker забирает готовые записи через `FOR UPDATE SKIP LOCKED`, ограничивает число повторов, использует lease и уникальный dedupe key. Повторы безопасны.

Стартовые задачи: подтверждение/reset email, истечение LFG и применение политики pending, напоминания/изменения мероприятий, очистка временных загрузок и отзыв access, доставка in-app событий, retention по утверждённой политике. Неисполненный job виден в метриках и доступен для безопасного retry; dead-letter обрабатывается ограниченными администраторскими инструментами.

Для истечения LFG и иных проверок критичен **ленивый серверный запрет по DB current time** даже если worker отстал: новые заявки нельзя принять после `expires_at` из-за задержки задачи.

## 9. Поиск, SEO, дизайн и клиентские состояния

- Каталог профилей ищет **только `public` + разрешённые поля**; основной match: сервер и игровая роль, вторичный: ранг и совпадение расписания. Простые объяснимые сортировки PostgreSQL indexes/`pg_trgm`; без ML.
- Каталог клубов показывает name/cover/description и для закрытых клубов; посты и состав закрытых клубов не индексируются. Скрытый аккаунт не становится индексируемым из-за одноклубников.
- Навигация v6: `Лента / Поиск / Клубы / Профиль`, уведомления из шапки. Состояния: guest, hidden/public, pending member, club owner/admin/mod/member, blocked, loading/empty/error.
- Запросы отменяются при переходе страницы; 320/360/390/430 CSS px; target ≥44px; контраст ≥4.5:1; поддержка reduced motion, клавиатуры, фокуса и reflow без горизонтального overflow.
- Без фальшивых пользователей, fake live, fake rankings. Непостроенные функции не показывать как рабочие кнопки.

## 10. Инфраструктура и эксплуатация

**Pilot topology:** 1 VDS с Caddy + API + worker + PostgreSQL + отдельными персистентными volumes для БД и приватных медиа. DB/API слушают только приватную сеть Docker, публичные порты только 80/443 у Caddy. Secrets через окружение/защищённый секретный механизм, не коммитить `.env` и production credentials.

**Backups:** ежедневные тестируемые logical backups PostgreSQL + защищённые копии приватных media, versioned/шифрованное хранение вне единственной площадки. Частота и целевые RPO/RTO после оценки нагрузки, объёма и требований; не утверждать произвольный численный SLA. Восстановление проверять на отдельном окружении регулярно.

**Release:** CI → lint/typecheck/unit → интеграционные тесты против Postgres → E2E браузера → security checks → контейнерный digest → staging smoke → manual approval → production rollout. Миграции обратимо и совместимо, отложенное удаление столбцов, резервная копия перед рисковой миграцией.

**Observability:** структурированные request_id logs с PII redaction, метрики latency/error, размер очереди и возраст oldest pending, ошибки media ACL и rate limits, аудит privileged operations. Логи с IP и email — минимизированные и с правовым retention-гейтом.

**Health checks:** `/health/live` = процесс отвечает, `/health/ready` = DB доступна и миграции согласованы, worker heartbeat и job lag отдельные метрики. Не публиковать внутренние диагностические данные через health endpoints.

## 11. Проверки безопасности/конкурентности перед пилотом

1. Гость и чужой пользователь не читают `hidden` profile, owner posts, club member identity, LFG hidden application и медиавложения через разные API, CDN, cache, conditional GET, search, notifications.
2. После смены клубного `members_only→public` исторический архив не раскрывается и старые медиа-URL не позволяют его обойти.
3. Два конкурирующих запроса не создают четвёртый клуб; скрытие профиля владельца и передача клуба не создают `hidden` owner.
4. Отзыв club consent и одобрение заявки не оставляют active hidden membership без согласия.
5. При блокировке двусторонние подписки/реакции прекращаются; адресный LFG и комментарии между сторонами отклоняются; исторические комментарии фильтруются.
6. При вместимости 1 из двух конкурентных event registrations разрешается одна, остальные получают `full` без раскрытия участников.
7. При истёкшем LFG сервер отклоняет новые заявки и применяет pending_policy idempotently даже при отставшем worker.
8. Редактирование одобренного club post не меняет публичный body до нового approval; собственные публикации hidden-author не открываются через модерацию.
9. При выходе hidden члена клуба historical identity действует только по прежней ACL, но при account deletion обезличивается, в том числе avatar/media.
10. Восстановление бэкапа не возвращает публичную выдачу давно скрытого/удалённого контента: для этого тестировать replay tombstones и переисполнение политики удаления после restore.

## 12. Decision gates и статус

**Можно начать разработку после принятия этой архитектуры:** миграции, формальная модель ACL, authentication, интеграционный тестовый каркас, экранная навигация. Не нужно ждать решений о турнирах и AI-рекомендациях.

**До реальных внешних пользователей обязательно:** правовые документы и минимальный возраст (юрисдикция/аудит), сроки хранения/удаления, права на изображения/UGC и takedown, SMTP/deliverability, privacy/security regression, проверенное восстановление backup, эксплуатационные сценарии жалоб и модерации.

**Не заявлять:** что это продакшн, что тесты проходят без запуска, что работа выполнена в GitHub. Это технический проект без прикладного кода.