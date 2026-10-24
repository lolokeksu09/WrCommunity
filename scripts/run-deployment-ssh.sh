#!/usr/bin/env bash
set -euo pipefail
if [[ $# == 1 && $1 == status ]]; then
  wrc_command=status
elif [[ $# == 3 && $1 == deploy && $2 =~ ^[a-f0-9]{40}$ && $3 =~ ^[1-9][0-9]*$ ]]; then
  wrc_command="deploy $2 $3"
else
  printf 'Expected status or deploy SHA RUN_ID.\n' >&2
  exit 64
fi
: "${WRC_DEPLOY_HOST:?Deployment host is not configured}"
: "${WRC_DEPLOY_KEY:?Deployment SSH secret is not configured}"
: "${WRC_DEPLOY_KNOWN_HOSTS:?Pinned SSH host key is not configured}"
[[ $WRC_DEPLOY_HOST =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 64
umask 077
wrc_ssh_dir=$(mktemp -d)
trap 'rm -f "$wrc_ssh_dir/key" "$wrc_ssh_dir/known_hosts"; rmdir "$wrc_ssh_dir"' EXIT
printf '%s\n' "$WRC_DEPLOY_KEY" >"$wrc_ssh_dir/key"
printf '%s\n' "$WRC_DEPLOY_KNOWN_HOSTS" >"$wrc_ssh_dir/known_hosts"
unset WRC_DEPLOY_KEY WRC_DEPLOY_KNOWN_HOSTS
ssh -T -i "$wrc_ssh_dir/key" \
  -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$wrc_ssh_dir/known_hosts" \
  -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
  "wrc-deploy@$WRC_DEPLOY_HOST" "$wrc_command"
