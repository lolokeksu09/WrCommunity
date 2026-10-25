# Notifications and platform moderation API

Base /api/v1; csrf/session required for writes; verified required for social/moderation actions. See CONTRACT.

GET /me/notifications?limit=30&cursor=... -> {items:[{id,event_type,category,label,href,actor|null,created_at,read_at}],nextCursor:string|null}. Limit 1–50; stable created_at DESC/id DESC with PostgreSQL microseconds. Cursor is bound to recipient; invalid/cross-recipient cursor returns 422. Current ACL is applied in SQL before limiting; hidden actor DTO stays null.
GET /me/notifications/unread-count -> {unread_count:number}; counts all currently accessible unread notifications, including older pages. Root uses this endpoint instead of loading history.
PATCH /me/notifications/:id {}; POST /me/notifications/read-all {}.
GET /me/notification-preferences -> {preferences:{comments,reactions,mentions,follows,clubs,events,lfg}}; PATCH same flat category:boolean entries.
POST /reports {target_type:profile|post|comment|club|lfg|event,target_id,reason} -> 201 {id,state,created_at}. Reason 5–2000. Reports permitted despite effective blocks; hidden material still inaccessible.
GET /me/reports -> {items}; GET /me/sanctions -> {items}.

Platform moderator/admin only (club role grants no platform privileges):
GET /moderation/reports?state=open|reviewing|resolved|dismissed&limit=25&cursor=... -> {items,nextCursor:string|null}. Limit 1–50; stable created_at DESC/id DESC; cursor bound to moderator and state filter, invalid context returns 422. Old unresolved reports remain reachable.
GET /moderation/reports/:id -> case-bound metadata,evidence|null,evidence_status:available|unavailable,actions (read audited). Evidence provides permitted title/body/href (and existing public profile fields) for post/comment/profile/club/lfg/event. Event membership/consent and LFG visibility/blocks are checked using existing policies; a report grants no extra object access.
PATCH /moderation/reports/:id {state:reviewing|resolved|dismissed,reason}.
POST /moderation/content/:type/:id/remove {report_id,reason}; requires matching report. Type post|comment|club|lfg|event.
GET /moderation/sanctions; POST /moderation/sanctions {user_id,kind:warning|suspension,reason,expires_at?,report_id?}; future expires_at required for suspension, hierarchy enforced. POST /moderation/sanctions/:id/revoke {reason}.
GET /moderation/audit -> append-only decision log {items}.

All lists bounded. No blanket private profile access for moderators; no club powers over personal account fields. Privileged case reads are audited.

`POST /moderation/content/club/:id/restore` `{reason}` releases a platform hold on an archived club, with a separate audited decision. Owner settings cannot override platform restrictions. Deleted clubs cannot be restored through this operation.

Notification pages/count use set-based ACL without per-item database round trips. Compatible indexes in migration 051 support recipient/order/unread and report state/order; no new tables.
