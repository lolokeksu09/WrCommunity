# Auth and profile API

Prefix every path below with `/api/v1`. Fetch `GET /auth/session` first and send its `csrfToken` in `X-CSRF-Token` on every write, including register/login/reset. Use same-origin credentials; the `wr_session` cookie is HTTP-only. Auth responses never contain email verification, reset, or session bearer tokens. Refetch `/auth/session` after login/register because login rotates the CSRF token.

## Authentication

| Method | Path | JSON body / response |
|---|---|---|
| GET | `/auth/session` | `{user: Viewer|null, csrfToken: string}` |
| POST | `/auth/register` | `{email,password,handle,display_name}` → `201 {user: Viewer}`; hidden by default, logged in, email confirmation queued |
| POST | `/auth/login` | `{email,password}` → `{user: Viewer}` |
| POST | `/auth/logout` | `{}` → `{ok:true}`; revokes current session |
| POST | `/auth/verify-email` | `{token}` → `{ok:true}`; one-use email link token |
| POST | `/auth/verify-request` | `{}` → `{ok:true}`; logged in, resend confirmation |
| POST | `/auth/reset-request` | `{email}` → `{ok:true}` regardless of account existence |
| POST | `/auth/reset-confirm` | `{token,password}` → `{ok:true}`; one-use token; revokes all sessions |
| GET | `/me/sessions` | `{items:[{id,created_at,expires_at,last_seen,current}]}` |
| DELETE | `/me/sessions/:id` | → `{ok:true}`; own session only |
| GET | `/me/settings` | `{email,verified,online_opt_in}` |
| PATCH | `/me/settings` | `{current_password,password? ,email?}` → `{ok:true}`; password/email change revokes all sessions; email change clears email confirmation and queues new confirmation |
| DELETE | `/me/account` | `{password,confirmation:"DELETE"}` → `{ok:true}`; refuses while owning a non-deleted club, anonymizes retained comments including historical club identity |
| GET | `/me/export` | Private JSON export of own profile, posts/revisions, comments, memberships, registrations and settings |

`Viewer` is `{id,email,verified,handle,display_name,visibility,platform_role,status}` and is only returned for the signed-in principal. Password is 12–128 characters. Handle is 3–32 lowercase Latin letters/digits/underscores. Display name is 1–80 characters. Verification/reset links land at `/auth/verify?token=…` and `/auth/reset?token=…`; frontend posts the token to the respective endpoint.

## Profiles

| Method | Path | JSON body / response |
|---|---|---|
| GET | `/me/profile` | Complete own profile including `version`, all game fields, `online_opt_in` and `visibility_warnings` |
| PATCH | `/me/profile` | `{version,display_name?,biography?,avatar_id?,cover_id?,visibility?,visibility_acknowledged?,online_opt_in?,game?}` → complete own profile; `version` is required |
| GET | `/profiles/:id` | Public DTO; owner may read own hidden profile. Unavailable/blocked/hidden return 404. No email/security fields. |
| GET | `/players/search` | `?q=&server=&role=&rank=&limit=20&offset=0` → `{items:[public profile DTO]}`; game matching uses public fields only |
| POST | `/me/heartbeat` | `{}` → `{ok:true}`; records website presence only when online opt-in is enabled |

Own profile: `{id,handle,display_name,visibility,biography,avatar_id,cover_id,game,online_opt_in,created_at,updated_at,version,visibility_warnings}`. Public profile contains `{id,handle,display_name,visibility,biography,avatar_id,cover_id,game,game_data_source:"self_reported",online,created_at,following,blocked_by_me,follower_count,following_count}`. Public follow counts include only active public identities visible to the viewer. `game` contains only fields explicitly marked public; online is true only for public opt-in users whose heartbeat is under 2 minutes old. A blocked target returns 404, so returned `blocked_by_me` is always false.

Game fields are optional `{value,public}` objects. Allowed keys: `server` (string), `roles` (string array), `rank` (string), `champions` (string array), `schedule` (string), `timezone` (IANA timezone string), `languages` (string array). `public` defaults to false. A PATCH `game` merges supplied keys; `null` removes that field. Fields are manually supplied, never Riot-verified.

Visibility changes require `visibility_acknowledged:true` for both directions. Render the returned warning before submission: public profiles expose selected game fields and previously published own posts; hiding does not anonymize comments already left in public discussions. Club owners must transfer/delete ownership before hiding or deleting their account. Updates use optimistic versions (`409 VERSION_CONFLICT`). Media IDs must reference ready media owned by the user. Unverified users can edit their profile/settings; social actions require verified email.

Errors use `{error:{code,message,requestId}}`; invalid input 422, authentication 401, state conflict 409, rate limit 429. All own/auth responses are private/no-store.
