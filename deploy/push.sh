#!/usr/bin/env bash
# From your laptop: copies this checkout to a server, as it is on disk, then builds and restarts it there.
#
#   deploy/push.sh <server ip> [domain]
#
# Without a domain the city is at coloc.<ip with dashes>.sslip.io, which needs no DNS. COLOC_SSH overrides how to reach
# the server, for a particular key: COLOC_SSH="ssh -i ~/.ssh/some_key" deploy/push.sh 1.2.3.4
set -euo pipefail

ip=${1:?usage: deploy/push.sh <server ip> [domain]}
domain=${2:-coloc.${ip//./-}.sslip.io}
ssh_cmd=${COLOC_SSH:-ssh}
root=$(cd "$(dirname "$0")/.." && pwd)

$ssh_cmd "root@$ip" 'command -v rsync >/dev/null || (apt-get update -q && apt-get install -y -q rsync); mkdir -p /opt/coloc/src /etc/coloc'

# Only what the build needs. Never settings or keys: the laptop's own stay on the laptop.
rsync -az --delete -e "$ssh_cmd" \
  --exclude .git --exclude .claude --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' \
  --exclude '.env*' --exclude '*.pem' --exclude .DS_Store --exclude docs/screenshots --exclude hello-world.md \
  "$root/" "root@$ip:/opt/coloc/src/"

# The GitHub App's settings, if this checkout has them. The webhook relay is only for laptops.
if [ -f "$root/dev/.env.github" ]; then
  cat "$root/dev/.env.github" "$root/dev/.env.local" | grep -E '^COLOC_(GITHUB_|ARENA_)' | grep -vE '^COLOC_GITHUB_(WEBHOOK_PROXY|PRIVATE_KEY_FILE)=' |
    { cat; echo 'COLOC_GITHUB_PRIVATE_KEY_FILE=/etc/coloc/github-app.pem'; } |
    $ssh_cmd "root@$ip" 'umask 077; cat > /etc/coloc/github.env'
  key=$(sed -n 's/^COLOC_GITHUB_PRIVATE_KEY_FILE=//p' "$root/dev/.env.github")
  case $key in /*) ;; *) key="$root/$key" ;; esac
  $ssh_cmd "root@$ip" 'umask 077; cat > /etc/coloc/github-app.pem' < "$key"
fi

$ssh_cmd "root@$ip" "COLOC_DOMAIN=$domain sh /opt/coloc/src/deploy/setup.sh"
