# Clubs and club content API

All paths use `/api/v1`. Mutations require a verified active session and CSRF header. Lists return `{items:[...]}`; UUIDs identify clubs, memberships, posts, and revisions. Public catalog/detail contain only club metadata. The `membership` property on club detail describes the viewer's own membership, including pending/rejected state.

| Method | Path | Payload / result |
|---|---|---|
| GET | `/clubs?search=` | Public metadata catalog, `items` |
| POST | `/clubs` | `{name,description,join_mode:"open"|"approval",feed_visibility:"public"|"members_only",rules?,avatar_id?,cover_id?,event_roles?}`; neither mode has a default; public, verified owner only |
| GET | `/clubs/:id` | Metadata, public owner summary, own `membership`, `permissions` |
| PATCH | `/clubs/:id` | Owner settings: `{name?,description?,rules?,join_mode?,feed_visibility?,visibility_change_acknowledged?,event_roles?,avatar_id?,cover_id?,state?:"active"|"archived"}` |
| GET | `/clubs/:id/members` | Visible club identities only; closed club nonmembers denied; hidden identities have no profile link/user ID |
| POST | `/clubs/:id/join` | Open club; identity payload below |
| POST | `/clubs/:id/requests` | Approval club; identity payload below |
| GET | `/clubs/:id/requests` | Owner/admin pending request identities |
| POST | `/clubs/requests/:id/decision` | `{decision:"approve"|"reject",reason?}` |
| PATCH | `/clubs/:id/identity` | Identity payload below; updates future signatures; previous names stay reserved |
| POST | `/clubs/:id/leave` | `{history_acknowledged:true}`; also withdraws pending request |
| POST | `/clubs/:id/consent/revoke` | `{history_acknowledged:true}`; leaves atomically |
| PATCH | `/clubs/:id/members/:membershipId/role` | `{role:"admin"|"moderator"|"member"}`; hierarchy enforced |
| POST | `/clubs/:id/members/:membershipId/kick` | `{reason}`; owner/admin, lower roles only |
| POST | `/clubs/:id/transfers` | `{to_user_id}`; existing active member, explicit acceptance required |
| POST | `/clubs/transfers/:id/accept` | No payload; target accepts; public/verified/ownership/antispam checks repeated |
| GET | `/clubs/:id/audit` | Management-only actions and identity-change history |
| GET | `/clubs/:id/posts` | Approved posts visible to viewer |
| GET | `/clubs/:id/feed` | `{items:[{kind:"post",...post},{kind:"event",...publicClubEvent}]}` |
| POST | `/clubs/:id/posts` | `{body,images?:[mediaUUID],tags?:[string]}`; returns pending post/revision; public active member only |
| GET | `/clubs/:id/moderation` | Manager queue of pending revisions plus post IDs |
| PATCH | `/clubs/posts/:id` | `{body,images?,tags?}`; author submits separate pending revision; approved text stays live |
| DELETE | `/clubs/posts/:id` | Author or club manager removes post |
| POST | `/clubs/posts/:id/revisions/:rid/decision` | `{decision:"approve"|"reject",reason?}`; owner/admin/moderator; self-review denied except lone eligible owner with nonempty reason |
| POST | `/clubs/:id/pin` | `{post_id:UUID|null}`; single approved readable post |

Identity payload: `{nickname,avatar_id?:UUID|null,roles?:string[],consent:true,consent_version:1,history_acknowledged:true}`. Nickname uses NFC, normalized whitespace and case-insensitive club uniqueness. Hidden joiners may choose an alias or their handle. Avatar is an owned ready image. Consent covers nickname/avatar/selected game roles to current club members and pending request reviewers, with historical comment signatures retained in their original discussion after exit. Main hidden profiles, online status and follows never appear through this API. All identity changes are audited.

Owner cannot leave, revoke consent, or hide their profile before transfer. Archiving retains ownership and its limit. No delete operation is provided. Leaving/kicking/revoking consent cancels all future event registrations in the same transaction, preserving comment snapshots. Rejected applications have a 48-hour cooldown; kicked members have 7 days.

Visibility changes require `visibility_change_acknowledged:true`; historical members-only posts/events remain closed after opening. Closing limits future reads of old public material. Club creation uses DB-time anti-spam gates and owner row locking; conflicts return 409, forbidden actions 403, missing/inaccessible content 404, validation 422. Review conflicts return 409. Names: 3–60 graphemes; description 10–1000; nickname 3–32. Post text: 1–5000 characters, up to four owned image uploads of <=10 MiB.

Additional author endpoints: `GET /clubs/:id/my-posts` returns the viewer's own club posts including pending/rejected state, editable latest revision `body`, `tags`, `images:[{id,url}]`, `revision_id`, `revision_status`, `current_revision_id`, and `reason`. `GET /clubs/posts/:id/edit` returns the same editable source for one own post. These never change the approved public version.

Detail also returns `pending_transfer:{id,to_user_id}|null` only to its initiating owner or target, and `incoming_transfer_id` for the target to show explicit acceptance. `permissions` is `{manage,read_content,owner}`. POST `/clubs` accepts optional `Idempotency-Key` header (8–128 characters); same key+body returns the stored result, different body conflicts. A public-to-members-only change permanently narrows existing object audiences, so another opening does not reopen that closed history.
