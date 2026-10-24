#!/bin/sh
set -eu
# Isolated disposable Compose project; never starts the production Compose file.
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
project="wrcsmoke$(date +%s)$$"
cleanup() {
  docker compose -p "$project" -f "$work/compose.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM
export WRC_SMOKE_CONTEXT="$repo"
cat > "$work/compose.yml" <<'YAML'
x-env: &env
  NODE_ENV: production
  HOST: 0.0.0.0
  PORT: 3000
  APP_ORIGIN: https://smoke.example.invalid
  DATABASE_URL: postgresql://smoke:smoke-isolated-only@postgres:5432/smoke
  COOKIE_SECRET: disposable-smoke-cookie-key-with-at-least-32-characters
  LFG_CONTACT_KEY: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
  SMTP_HOST: mailpit
  SMTP_PORT: 1025
  SMTP_SECURE: false
  SMTP_USER: smoke
  SMTP_PASS: disposable-only
  SMTP_FROM: Smoke <smoke@example.invalid>
  MEDIA_DIR: /app/media
  MEDIA_STORAGE_DIR: /app/media
  WEB_ROOT: /app/dist/web
services:
  postgres:
    image: postgres:18.6-bookworm
    environment:
      POSTGRES_USER: smoke
      POSTGRES_PASSWORD: smoke-isolated-only
      POSTGRES_DB: smoke
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U smoke -d smoke']
      interval: 2s
      timeout: 3s
      retries: 30
  mailpit:
    image: axllent/mailpit:v1.31.5
  migrate:
    image: wrcommunity-smoke
    build: ${WRC_SMOKE_CONTEXT}
    environment: *env
    command: [node, dist/server/db/migrate.js]
    healthcheck: {disable: true}
    depends_on:
      postgres: {condition: service_healthy}
  api:
    image: wrcommunity-smoke
    environment: *env
    read_only: true
    tmpfs: [/tmp]
    volumes: [media:/app/media]
    depends_on:
      migrate: {condition: service_completed_successfully}
  worker:
    image: wrcommunity-smoke
    environment: *env
    read_only: true
    tmpfs: [/tmp]
    volumes: [media:/app/media]
    command: [node, dist/server/worker.js]
    healthcheck:
      test: [CMD, node, scripts/container-health.mjs, worker]
      interval: 3s
      timeout: 3s
      start_period: 5s
      retries: 20
    depends_on:
      migrate: {condition: service_completed_successfully}
volumes:
  media: {}
YAML
if ! docker compose -p "$project" -f "$work/compose.yml" up --build --wait --wait-timeout 120 api worker; then
  docker compose -p "$project" -f "$work/compose.yml" logs --no-color
  exit 1
fi
docker compose -p "$project" -f "$work/compose.yml" exec -T api node --input-type=module - <<'JS'
import { writeFile } from 'node:fs/promises';
const privateToken = 'private-smoke-' + crypto.randomUUID();
await writeFile('/app/media/smoke-private.txt', privateToken);
const ready = await fetch('http://localhost:3000/health/ready');
if (!ready.ok) throw new Error('Readiness failed');
const spa = await fetch('http://localhost:3000/');
if (!spa.ok || !(await spa.text()).includes('<div id="root"></div>')) throw new Error('Built SPA missing');
const privateFile = await fetch('http://localhost:3000/media/smoke-private.txt');
if ((await privateFile.text()).includes(privateToken)) throw new Error('Private media exposed');
const unknownMedia = await fetch('http://localhost:3000/api/v1/media/00000000-0000-4000-8000-000000000001');
if (![401, 404].includes(unknownMedia.status)) throw new Error('Unknown private media was not denied');
console.log('Container migrations, API readiness, built SPA, worker heartbeat and private media smoke passed.');
JS
