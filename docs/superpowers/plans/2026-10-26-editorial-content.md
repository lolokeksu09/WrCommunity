# Editorial showcase content (2026-10-26)

Base `c0d8eeee76a04cc79c490bbc4c46a37d8e4d6219`; branch `content/editorial-launch-2026-10-26`. Request: populate WrCommunity with **clearly editorial** posts, distinct profiles and public clubs, for realistic visual review on the pilot. No fake people, engagement metrics, online statuses or impersonation.

## Scope and constraints

- Five non-login editorial profile identities with unique descriptive bios; names identify them as WrCommunity editorial. `.invalid` email addresses, unusable password hash, no SMTP tokens, no accounts pretending to be real players.
- Three public/open editorial clubs with actual content, and 24 concise evergreen discussion posts (15 general / 9 clubs); no fake comments, reactions, member joins, event signups or LFG requests. Do not invent current patch/balance claims.
- Use actual PostgreSQL relations, not CSS-only pretend records. Respect constraints `users`, `clubs`, `club_memberships`, `club_name_reservations`, `posts`, `post_revisions` and feed read ACL.
- Explicit **one-shot operator invocation** after deploy, never automatic on migrate/start. CLI default is dry-run; destructive operations are not included. A repeat execution must not duplicate or overwrite existing user-authored records. Fail safely on identity collisions.
- Zero changes to existing authentic users, posts, clubs, auth, passwords, roles, emails, ACLs or migrations. Keep editorial seed isolated and identifiable. Don't publish usernames or a made-up activity counter in UI.
- Add script to runtime Docker image so trusted server operator can invoke it via `docker compose exec -T worker node ...`, under existing production controls; does not expose an HTTP seed endpoint.

## Acceptance

- Script is dry-run unless passed `--apply`; validate complete catalog and fail on user collision.
- Transactional insertion; safe retry. Data appears through real guest feed and club listing after operator runs it; no unauthorised interactions and no fake verified email/presence.
- Tests cover editorial content invariants, SQL identifiers, idempotency and safety of dry-run; run `node --check` and node unit tests.
- Draft FAST, Ready FULL Mobile+API+Docker+integration/quality-gate, main RELEASE + active VDS SHA. Desktop E2E remains off per explicit instruction.
- Final publication **requires explicit running the operator command** against production, separate from code release. Never claim data visible on VDS until a read-only feed/club query confirms it.

## Risks

- Public editorial profiles are visible and can be followed, but cannot sign in; biographies and names must disclose their nature.
- Editor personas must not be counted as real users. Content may become stale; content is evergreen by design.
- Operator needs root/control of production Docker environment. Do not place DB passwords or tokens in chat or Git.

