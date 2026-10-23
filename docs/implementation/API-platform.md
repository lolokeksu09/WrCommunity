# Notifications and platform moderation API

Base /api/v1; csrf/session required for writes; verified required for social/moderation actions. See CONTRACT.

GET /me/notifications -> {items:[{id,event_type,category,label,href,actor|null,created_at,read_at}]}; current ACL rechecked, no hidden actor DTO.
PATCH /me/notifications/:id {}; POST /me/notifications/read-all {}.
GET /me/notification-preferences -> {preferences:{comments,reactions,mentions,follows,clubs,events,lfg}}; PATCH same flat category:boolean entries.
POST /reports {target_type:profile|post|comment|club|lfg|event,target_id,reason} -> 201 {id,state,created_at}. Reason 5–2000. Reports permitted despite effective blocks; hidden material still inaccessible.
GET /me/reports -> {items}; GET /me/sanctions -> {items}.

Platform moderator/admin only (club role grants no platform privileges):
GET /moderation/reports?state=open|reviewing|resolved|dismissed -> {items}; GET /moderation/reports/:id -> case-bound metadata,evidence if accessible,actions (read audited).
PATCH /moderation/reports/:id {state:reviewing|resolved|dismissed,reason}.
POST /moderation/content/:type/:id/remove {report_id,reason}; requires matching report. Type post|comment|club|lfg|event.
GET /moderation/sanctions; POST /moderation/sanctions {user_id,kind:warning|suspension,reason,expires_at?,report_id?}; future expires_at required for suspension, hierarchy enforced. POST /moderation/sanctions/:id/revoke {reason}.
GET /moderation/audit -> append-only decision log {items}.

All lists bounded. No blanket private profile access for moderators; no club powers over personal account fields. Privileged case reads are audited.
