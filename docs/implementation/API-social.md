# Social and media API

All endpoints are under `/api/v1`. Lists return `{items,nextCursor?}`. IDs are UUIDs. All social writes require a verified, active session and `X-CSRF-Token`. Private/unavailable resources return 404. Dates are ISO strings. Images use ACL-checked `/api/v1/media/:id`; never a storage URL.

- `GET /feed?mode=all|following&limit=20&cursor=...&tag=...` published ordinary and accessible club posts, descending creation time. Following requires login. Cursor is opaque.
- `GET /posts?authorId=<uuid>&state=published|draft&limit=20&cursor=...` author posts; drafts are owner-only. Without authorId defaults to current user.
- `GET /posts/:id` accessible ordinary/club detail.
- `POST /posts` `{body,images?:uuid[],tags?:string[],state?:"draft"|"published"}` creates an ordinary post. `PATCH /posts/:id` same optional fields, preserves immutable revisions. `DELETE /posts/:id` removes an owned ordinary post.
- `GET /posts/:id/revisions` own ordinary-post history.
- `GET /posts/:id/comments?limit=50&cursor=...` flat comment list with `parent_id` for arbitrary-depth threads. Inaccessible parents are represented by null, with no leaked text or identity.
- `POST /posts/:id/comments` `{body,parent_id?:uuid}`. Club comments require current active membership; public club comments also require a public profile. Private club comments retain the club nickname/avatar at creation.
- `PATCH /comments/:id` `{body}` and `DELETE /comments/:id` for the author.
- `PUT /posts/:id/like`, `DELETE /posts/:id/like`, `PUT /posts/:id/bookmark`, `DELETE /posts/:id/bookmark` are idempotent.
- `GET /bookmarks?limit=20&cursor=...` personal, currently accessible posts.
- `PUT /profiles/:id/follow`, `DELETE /profiles/:id/follow`, `GET /profiles/:id/followers`, `GET /profiles/:id/following`. Lists and counts never identify hidden followers.
- `PUT /comments/:id/block-author` blocks an accessible comment author without exposing a hidden profile ID; comments expose `can_block` for this action.
- `PUT /profiles/:id/block`, `DELETE /profiles/:id/block`, `GET /blocks`. Block immediately removes both follows and mutual post reactions.
- `GET /tags?q=...` accessible public tags. `GET /mentions` accessible posts mentioning the signed-in user. Mentions are parsed from `@handle`; hidden and blocked identities are never resolved or notified.
- `POST /media` multipart form with exactly one `file`, up to 10 MiB. JPEG, PNG and WebP signatures accepted; server decodes, removes metadata and re-encodes one nonanimated WebP image. Response `{id,url,mime,size_bytes,width,height}`. `GET /media/:id` checks access on every read and sends `Cache-Control: private, no-store`. `DELETE /media/:id` owner-only, rejects actively referenced images.

Post detail: `{id,author_id,club_id,state,audience,body,images:[{id,url}],tags,created_at,updated_at,revision_id,author:{id,handle,display_name,avatar_url,profile_url},like_count,comment_count,liked,bookmarked}`. Counts are filtered by the viewer's blocks and current privacy. Hidden ordinary-comment authors expose display name/handle, with null id/profile/avatar. Private club comments expose only the historic club nickname/avatar and no profile link. Deleted authors are anonymous. Comments include `{id,post_id,parent_id,body,created_at,updated_at,can_edit,can_block,author}`. Blocked-user lists retain IDs for unblocking but redact hidden/deleted identities.
