#!/usr/bin/env bash
# One-time operator bootstrap. Private keys never leave this host except through gh secret stdin.
set -euo pipefail
umask 077

if [[ $EUID -ne 0 ]]; then
  printf 'Run this installer as root on the VDS.\n' >&2
  exit 1
fi

wrc_repo=lolokeksu09/WrCommunity
wrc_host=139.100.205.135
wrc_source=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
wrc_key_dir=/root/.config/wrcommunity-deploy
wrc_user_home=/var/lib/wrc-deploy

for wrc_file in .env compose.local.yml compose.vds.yml compose.ip.yml Caddyfile.ip; do
  [[ -f /opt/WrCommunity/$wrc_file && ! -L /opt/WrCommunity/$wrc_file ]] || {
    printf 'Missing/unsafe active configuration file: %s\n' "$wrc_file" >&2
    exit 1
  }
done
[[ -f "$wrc_source/controller.py" ]] || exit 1

printf 'Installing Ubuntu packages needed for restricted deployment access...\n'
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  gh git python3 sudo openssh-client ca-certificates curl tar gzip util-linux

# Authenticate in an isolated temporary configuration, never the normal root gh profile.
wrc_gh_config=$(mktemp -d /root/wrc-gh-setup.XXXXXXXX)
trap 'rm -rf -- "$wrc_gh_config"' EXIT
export GH_CONFIG_DIR="$wrc_gh_config"
unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN
printf '\nAuthorize GitHub CLI in your browser. Do not send the code or a token to chat.\n'
gh auth login --hostname github.com --git-protocol https --web --scopes repo,workflow
[[ $(gh repo view "$wrc_repo" --json viewerPermission --jq .viewerPermission) == ADMIN ]] || {
  printf 'Repository administrator permission is required to register deployment secrets.\n' >&2
  exit 1
}

# Do not let an already enabled workflow observe a partially configured account/key.
gh variable set WRC_DEPLOY_ENABLED --repo "$wrc_repo" --body false

if id wrc-deploy >/dev/null 2>&1; then
  [[ $(id -u wrc-deploy) -ge 1000 && $(id -u wrc-deploy) -ne 0 ]] || exit 1
  [[ $(id -nG wrc-deploy) == wrc-deploy ]] || {
    printf 'Existing wrc-deploy account has unexpected groups; no privileges were changed.\n' >&2
    exit 1
  }
  [[ $(getent passwd wrc-deploy | cut -d: -f6) == "$wrc_user_home" ]] || exit 1
else
  useradd --no-create-home --home-dir "$wrc_user_home" --shell /bin/sh --user-group wrc-deploy
fi
usermod --lock wrc-deploy
usermod --shell /bin/sh wrc-deploy

install -d -o root -g root -m 0755 /usr/local/lib/wrcommunity-deploy
install -o root -g root -m 0644 "$wrc_source/controller.py" /usr/local/lib/wrcommunity-deploy/controller.py
install -d -o root -g root -m 0700 /var/lib/wrcommunity-deploy
install -d -o root -g root -m 0755 "$wrc_user_home" "$wrc_user_home/.ssh"

cat >/usr/local/sbin/wrc-deploy-gateway <<'GATEWAY'
#!/bin/sh
exec /usr/bin/python3 -I /usr/local/lib/wrcommunity-deploy/controller.py "$@"
GATEWAY
chown root:root /usr/local/sbin/wrc-deploy-gateway
chmod 0755 /usr/local/sbin/wrc-deploy-gateway

wrc_sudoers=$(mktemp /etc/sudoers.d/.wrcommunity-XXXXXXXX)
printf 'Defaults:wrc-deploy env_reset\nwrc-deploy ALL=(root) NOPASSWD: /usr/local/sbin/wrc-deploy-gateway\n' >"$wrc_sudoers"
chmod 0440 "$wrc_sudoers"
visudo -cf "$wrc_sudoers"
mv "$wrc_sudoers" /etc/sudoers.d/wrcommunity-deploy

install -d -o root -g root -m 0700 "$wrc_key_dir"
if [[ ! -e "$wrc_key_dir/id_ed25519" && ! -e "$wrc_key_dir/id_ed25519.pub" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C wrcommunity-actions-deploy -f "$wrc_key_dir/id_ed25519"
fi
[[ -f "$wrc_key_dir/id_ed25519" && ! -L "$wrc_key_dir/id_ed25519" && -f "$wrc_key_dir/id_ed25519.pub" && ! -L "$wrc_key_dir/id_ed25519.pub" ]] || exit 1
chown root:root "$wrc_key_dir/id_ed25519" "$wrc_key_dir/id_ed25519.pub"
chmod 0600 "$wrc_key_dir/id_ed25519"

# The account cannot edit its key list, cannot forward ports, and receives no shell/PTY.
# SSH_ORIGINAL_COMMAND is expanded by the login shell only as one quoted argument.
printf 'restrict,command=%s %s\n' \
  '"sudo -n /usr/local/sbin/wrc-deploy-gateway \"$SSH_ORIGINAL_COMMAND\""' \
  "$(cat "$wrc_key_dir/id_ed25519.pub")" >"$wrc_user_home/.ssh/authorized_keys"
chown root:root "$wrc_user_home/.ssh/authorized_keys"
chmod 0644 "$wrc_user_home/.ssh/authorized_keys"

[[ -f /etc/ssh/ssh_host_ed25519_key.pub ]] || {
  printf 'Existing SSH host public key is required. No replacement key was generated.\n' >&2
  exit 1
}
printf '%s %s\n' "$wrc_host" "$(cat /etc/ssh/ssh_host_ed25519_key.pub)" >"$wrc_key_dir/known_hosts"

# Verify the forced command and pinned host key locally before enabling any CI access.
ssh -T -i "$wrc_key_dir/id_ed25519" \
  -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes \
  -o "UserKnownHostsFile=$wrc_key_dir/known_hosts" -o "HostKeyAlias=$wrc_host" \
  -o ConnectTimeout=5 wrc-deploy@127.0.0.1 status

gh secret set WRC_DEPLOY_KEY --repo "$wrc_repo" <"$wrc_key_dir/id_ed25519"
gh secret set WRC_DEPLOY_KNOWN_HOSTS --repo "$wrc_repo" <"$wrc_key_dir/known_hosts"
gh variable set WRC_DEPLOY_HOST --repo "$wrc_repo" --body "$wrc_host"
gh variable set WRC_PUBLIC_ORIGIN --repo "$wrc_repo" --body "https://$wrc_host"
gh variable set WRC_DEPLOY_ENABLED --repo "$wrc_repo" --body true
gh workflow run ci.yml --repo "$wrc_repo" --ref main -f operation=status

printf '\nRestricted GitHub deployment access registered and enabled.\n'
printf 'Private key remains only in %s and encrypted GitHub Actions Secrets.\n' "$wrc_key_dir"
printf 'Root login and SSH daemon configuration were not changed.\n'
printf 'A read-only main Application CI status workflow was requested.\n'
printf 'External SSH access is verified only after that GitHub job succeeds.\n'
