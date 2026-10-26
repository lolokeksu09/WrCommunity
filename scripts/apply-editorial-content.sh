#!/bin/sh
# Execute on the VDS as root, not in a GitHub Actions runner.
set -eu
[ "${1:-}" = "--apply" ] || { printf '%s\n' "Usage: sh scripts/apply-editorial-content.sh --apply" >&2; exit 2; }
[ "$(id -u)" = "0" ] || { printf '%s\n' "Root on the VDS is required" >&2; exit 2; }
sha="$(python3 -c 'import json;print(json.load(open("/var/lib/wrcommunity-deploy/active-release.json"))["sha"])')"
case "$sha" in
  *[!0-9a-f]*|'') printf '%s\n' "Invalid active revision" >&2; exit 2;;
esac
[ "${#sha}" = 40 ] || { printf '%s\n' "Invalid active SHA length" >&2; exit 2; }
release="/opt/wrcommunity-releases/$sha"
[ -d "$release" ] && [ -f "$release/compose.release.yml" ] || { printf '%s\n' "Active release files are missing" >&2; exit 2; }
docker compose --project-directory "$release" -p wrcommunity-local \
  -f "$release/compose.local.yml" \
  -f "$release/compose.vds.yml" \
  -f "$release/compose.ip.yml" \
  -f "$release/compose.release.yml" \
  exec -T worker node scripts/editorial-seed.mjs --apply
