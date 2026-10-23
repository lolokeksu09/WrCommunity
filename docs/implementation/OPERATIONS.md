# Operations and acceptance evidence

This is an implementation for a controlled pilot. Public launch remains blocked by legal/retention review, image and UGC rights, production SMTP delivery, security review, moderation readiness and an off-site encrypted backup/restore exercise. A green build alone does not satisfy those gates.

## Toolchain

Node.js 24 LTS is required. The container and CI pin Node `24.22.1`; this workspace initially supplied `24.19.0`. `package-lock.json` is the installation contract; use `npm ci`, rather than regenerating dependencies in deployment. Runtime dependencies and development dependencies use exact package versions. TypeScript runs in strict mode for both server and client.

Versions were resolved from the npm registry on 23 October 2026 using `npm view <package> version engines peerDependencies --json`: Fastify `5.12.7`, React/React DOM `19.3.1`, React Router `7.18.4`, `pg` `8.23.1`, TypeScript `7.0.2`, Vite `8.3.5`, Playwright `1.64.1`. PostgreSQL is pinned to `18.6`, Caddy to `2.11.7`, and development Mailpit to `1.31.5`. Fastify plugin compatibility and Node engine metadata were checked before installing. Registry metadata, lock integrity and actual CI/tests are the evidence; version freshness must be reviewed regularly.

Primary references: [Node releases](https://nodejs.org/en/about/previous-releases), [PostgreSQL 18 releases](https://www.postgresql.org/docs/18/release.html), [Fastify static compatibility](https://github.com/fastify/fastify-static#compatibility), [Caddy releases](https://github.com/caddyserver/caddy/releases), [Mailpit releases](https://github.com/axllent/mailpit/releases).

## Local development

1. Copy `.env.example` to `.env`, generate `COOKIE_SECRET` and `LFG_CONTACT_KEY` using its commands, choose a development PostgreSQL password and update `DATABASE_URL` to match.
2. Start PostgreSQL: `docker compose -f compose.dev.yml up -d --wait postgres`. Optional local mail capture: `docker compose -f compose.dev.yml --profile mail up -d mailpit`. Mailpit UI is bound to `http://127.0.0.1:8025` and SMTP to `127.0.0.1:1025`; it must never be publicly exposed.
3. Run `npm ci`, `npm run migrate`, then `npm run dev` and `npm run dev:worker` in separate terminals. `npm run dev:web` serves the Vite development UI with API requests proxied to port 3000.
4. For the same-origin built application, run `npm run build` then `npm start`. The API serves `dist/web`. Stop services with `docker compose -f compose.dev.yml down`; add `--volumes` only when deliberately discarding development data.

The worker sends account verification and reset messages through SMTP. Social messages are in-app only. Auth tokens and reset URLs must not be written to application logs. Tests use synthetic accounts; use Mailpit or database-backed helpers rather than any production test endpoint.

## Production topology and configuration

`compose.yml` defines PostgreSQL, one-shot migration, API, worker and Caddy. Only Caddy publishes host ports (80/443 and HTTP/3 UDP 443). PostgreSQL and API have no published ports. The database network is internal; the worker has a separate outbound network for SMTP. The backend subnet defaults to `172.30.60.0/24`; change `BACKEND_SUBNET` if it conflicts with the host. The API trusts forwarded client IPs only from this configured private CIDR. Direct local development defaults to no trusted proxy. Caddy never mounts private media. API and worker run as the image's unprivileged `node` user, with a read-only root filesystem, dropped capabilities, a temporary `/tmp`, and a private writable media volume.

Prepare protected environment values outside Git:

- `DOMAIN` is the public DNS name. `APP_ORIGIN` is its canonical HTTPS origin, without a trailing slash.
- `DATABASE_URL` uses hostname `postgres`, port 5432, and the same database/user/password as `POSTGRES_*`. Percent-encode any reserved characters in the password; a generated hexadecimal password avoids URL ambiguity.
- `COOKIE_SECRET` is at least 32 cryptographically random characters. `LFG_CONTACT_KEY` is 32 random bytes encoded as exactly 64 hexadecimal characters. The latter encrypts stored game contacts; retain it securely with backup recovery material. Rotating it requires a planned data migration.
- Configure an authenticated external `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Use `SMTP_REQUIRE_TLS=true` for STARTTLS (typically port 587) or `SMTP_SECURE=true` for TLS from connection start (typically port 465). Verify real delivery and account recovery before launch. Local Mailpit values are development-only.
- The image uses `MEDIA_STORAGE_DIR=/app/media` and the same path is mounted in API and worker. `WEB_ROOT=dist/web` is the server default. Do not point Caddy at the media volume.

Run `docker compose config --quiet` with the prepared environment, build the image, then `docker compose up -d --build --wait`. A failed migration prevents API and worker startup. `GET /health/live` checks process liveness; `GET /health/ready` checks database/schema readiness. The worker health check requires a recent heartbeat file; monitor pending outbox count, oldest pending age and repeated failures separately. A heartbeat alone cannot prove mail delivery.

Do not publish the supplied pilot configuration before the release gates are reviewed. Never run production data reset commands or expose PostgreSQL/Mailpit through public ports.

## Migrations, backup and rollback

Migrations are versioned SQL with recorded checksums; the migration runner uses an advisory lock. Apply them before serving traffic, after taking a recoverable backup. Do not edit a migration that has already shipped. For incompatible schema changes, prepare a forward correction and a data recovery plan; rolling back only the application image may not reverse a schema change.

Back up PostgreSQL with PostgreSQL 18 `pg_dump --format=custom --no-owner --no-acl`, and back up the private media tree together with its metadata/key recovery material. Coordinate a consistent snapshot (pause writes or use an approved storage snapshot procedure). Encrypt backups, retain them off the application host and restrict access. Restore with matching PostgreSQL 18 tools into a separate database and private media directory, then verify ACL behavior before enabling traffic. RPO/RTO and retention are intentionally not claimed until approved and measured.

`NODE_ENV=test npm run backup:verify` runs a disposable verification against a dedicated test database. Its role must be allowed to create/drop databases. It creates a unique probe schema, takes a custom-format dump, restores to a unique database, verifies the probe and public table count, copies private media and compares SHA-256 checksums (including a temporary random media probe), then cleans up. It refuses other `NODE_ENV` values. `PG_DUMP_BIN` and `PG_RESTORE_BIN` can select installed PostgreSQL 18 binaries; CI uses `PG_CLIENT_CONTAINER=true` to use the pinned PostgreSQL image. This verifies logical recovery and media copying; it does not certify an off-site encrypted production backup.

## CI and local evidence

`npm run check:secrets`, `npm run typecheck`, `npm run build` and `npm test` are required checks. Integration tests use an actual PostgreSQL 18 service and exercise access rules and concurrent mutations. Browser tests run desktop and mobile Chromium against the built app with real PostgreSQL. Failure traces, screenshots, videos and the HTML report are retained for seven days in CI.

`npm run smoke:docker` creates a unique disposable Compose project, builds the production image, runs migrations, waits for API and worker health, and checks the built SPA and a private media request. It cleans up only its own containers and volumes. It does not contact a production deployment.

Workspace evidence on 23 October 2026: exact dependency install succeeded; production dependency audit reported zero known vulnerabilities; server compilation and migration copying succeeded. PostgreSQL 18.6 was installed and exercised for integration and logical restore. The workspace isolates each execution in a separate network/user namespace with only UID 0 mapped and no Linux capabilities, so local PostgreSQL needed a scratch-only initial UID-guard shim and all database consumers in one persistent shell. This shim is not included in application source or images. Docker/Compose CLIs installed, but the Docker daemon cannot create its Unix socket (`Operation not permitted`) and cannot set mount propagation. Container runtime smoke is therefore configured for CI, with local execution blocked by the workspace environment. CI status and current acceptance totals must be reported from fresh runs, not inferred from this runbook.
