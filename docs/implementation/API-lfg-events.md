# Discovery, LFG and club events API

All URLs below use `/api/v1`; writes require the authenticated session and CSRF token. Player search/recommendation and public LFG lists return `{items:[],nextCursor:string|null}`; other lists retain `{items:[]}`. All date fields use ISO timestamps with an explicit UTC offset. Social writes require verified active accounts. Errors are structured `{error:{code,message,requestId}}`.

## Players

`GET /players/search` (also `/players`) accepts `q`, `server`, `role`, `rank`, `language`, `champion`, `schedule`, `limit` (1–50, default 20), and `cursor` (max 300 characters). Only active public profiles and individually public game fields participate in filtering or output. Hidden/blocked players are omitted. Cards are `{id,handle,display_name,game}`; `game` retains the public `{value,public:true}` entries.

`GET /players/recommendations` requires login. Accepts the same filters. Explicit `server`/`role` or the viewer's own saved values produce explainable scoring. Cards include `reasons:string[]` (same server, matching role, language or schedule); no ML or invented players.

Pass the returned opaque `nextCursor` with the same filters and account to load the next page; null means the end. Sorting remains newest first with ascending UUID as tie-breaker; recommendations first sort by their public match score. Cursors preserve timestamp microseconds. Reset pagination when filters or account change. The server rechecks current visibility, public game fields and both block directions on every page; invalid cursors return 422 `invalid_cursor`. Results are live, not a frozen snapshot: changes to profiles/preferences may change recommendation ordering.

Game roles share identifiers `baron`, `jungle`, `mid`, `dragon`, `support` and Russian labels Барон, Лес, Мид, Дракон, Поддержка. Profile/LFG writes canonicalize known identifiers/labels case-insensitively and remove duplicate roles. Existing rows are not migrated; search/scoring also recognize their trimmed Russian labels. Unknown stored/custom role strings remain supported and are displayed unchanged; unknown filters still use exact case-insensitive role matching. Candidate private role fields never affect matching or scoring.

## LFG

- `GET /lfg/mine`: authenticated author's own announcements, including closed/expired history (excluding deleted).
- `GET /lfg?server=&role=&limit=&cursor=`: currently open public announcements.
- `POST /lfg`: `{server,roles:string[],description,expires_at,pending_policy:'keep'|'reject'}`; author must currently be public. No maximum future expiry.
- `GET /lfg/:id`: announcement `{id,server,roles,description,expires_at,pending_policy,state,created_at,author:{id,handle,display_name}}`.
- `PATCH /lfg/:id`: author may edit `{description?,expires_at?,pending_policy?}` while still open and before expiry; expiry remains future with no maximum.
- `POST /lfg/:id/close`: author closes; chosen pending policy is applied.
- `DELETE /lfg/:id`: author removes it and cancels outstanding requests.
- `POST /lfg/:id/applications`: `{message,disclosure_consent?:boolean}`. A hidden applicant must explicitly pass `true`; only this announcement's author can read the disclosed nickname and message. No profile is opened.
- `GET /lfg/:id/applications`: author only; `{items:[{id,announcement_id,nickname,message,state,created_at,decided_at}]}`. No personal applicant ID/profile for hidden applicants.
- `GET /lfg/applications/mine`: viewer's own applications with announcement ID and state.
- `POST /lfg/applications/:id/decision`: author only, `{decision:'accepted'|'rejected'}`. Pending `keep` applications can be decided after expiry/close.
- `DELETE /lfg/applications/:id`: applicant cancels; nickname disclosure and contact display cease.
- `GET /lfg/applications/:id/contacts`: accepted pair only, `{own_contact,partner_contact,own_consented,partner_consented,notice}`. Partner contact appears only after both have separately consented. The stored contact is encrypted.
- `PUT /lfg/applications/:id/contacts`: accepted pair only, `{game_contact,consent:true}`. Contact is a voluntary game identifier (max 120 chars); never auto-filled email/phone/profile data.
- `DELETE /lfg/applications/:id/contacts`: revoke the caller's consent; subsequent partner reads hide the contact. Recipient copies cannot be recalled.

Expiry uses the database clock on every relevant read/write; `expireLfg(tx?)` is exported from `lfg/service.ts` for worker use.

## Events

- `GET /clubs/:id/events`: accessible events; public visibility also depends on the club's current feed policy. Earlier members-only events stay members-only after a club becomes public.
- `POST /clubs/:id/events`: permitted role in club `event_roles`; `{title,description,audience:'public'|'members_only',starts_at,ends_at,registration_closes_at,capacity}`. An event in a members-only club must use members-only audience.
- `GET /events/:id`: `{id,club_id,organizer:{id,name},title,description,audience,starts_at,ends_at,registration_closes_at,capacity,state,registration_status,my_registration,can_manage}`. The club is the organizer; personal creator identity is never in public DTOs. Exact `registered_count` appears only for organizers; others receive `visible_registered_count` and availability status without total occupancy.
- `PATCH /events/:id`: creator with current event permission, owner, or enabled admin; same editable fields. Cannot lower capacity below active registrations; active registrations receive an internal change notification.
- `POST /events/:id/cancel`: same management permissions; preserves history, notifies active registrations.
- `POST /events/:id/registration`: current consenting club members only, before start/registration deadline; event row lock protects the final seat. Repeated active registration is idempotent.
- `DELETE /events/:id/registration`: cancel own registration; releases the seat.
- `GET /events/:id/registrations`: organizers receive consented club nickname/avatar/roles. Public/other member viewers receive only visible public identities. Hidden identities are never exposed through public counts.

Archived clubs preserve the existing audience ACL for reads but reject writes. Event completion/deadlines are computed using the database clock. No waitlist, chat or tournament bracket.
