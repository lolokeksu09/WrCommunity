#!/usr/bin/env bash
set -euo pipefail
# The exact local Compose topology must publish Caddy/Mailpit through its edge network.
wrc_repo=$(cd -- "$(dirname -- "$0")/.." && pwd)
wrc_temp=$(mktemp -d)
wrc_project="wrcnet$(date +%s)$$"
wrc_compose() {
  docker compose -p "$wrc_project" -f "$wrc_repo/compose.local.yml" -f "$wrc_temp/override.yml" "$@"
}
wrc_cleanup() {
  wrc_compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$wrc_temp/override.yml"
  rmdir "$wrc_temp"
}
trap wrc_cleanup EXIT
export POSTGRES_PASSWORD=disposable-local-network-test
export COOKIE_SECRET=disposable-local-network-cookie-at-least-32-characters
export LFG_CONTACT_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
cat >"$wrc_temp/override.yml" <<'YAML'
services:
  migrate:
    image: wrcommunity-smoke
  web-api:
    image: wrcommunity-smoke
  worker:
    image: wrcommunity-smoke
  caddy:
    ports: !override ['127.0.0.1::80']
  mailpit:
    ports: !override ['127.0.0.1::8025']
YAML
if ! wrc_compose up -d --no-build --wait --wait-timeout 120; then
  wrc_compose logs --no-color --tail 30
  exit 1
fi
wrc_web=$(wrc_compose port caddy 80)
wrc_mail=$(wrc_compose port mailpit 8025)
[[ $wrc_web == 127.0.0.1:* && $wrc_mail == 127.0.0.1:* ]]
curl --fail --silent --show-error "http://$wrc_web/health/ready"
curl --fail --silent --show-error "http://$wrc_mail/" >/dev/null
printf '\nLocal Compose publishes Caddy and private Mailpit; API and PostgreSQL remain unexposed.\n'
[[ -z $(wrc_compose port web-api 3000 2>/dev/null || true) ]]
[[ -z $(wrc_compose port postgres 5432 2>/dev/null || true) ]]
