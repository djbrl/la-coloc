#!/usr/bin/env bash
# From your laptop: copies the server's newest database dump (deploy/coloc-backup.sh) here, so one exists off the server.
#
#   deploy/pull-backup.sh <server ip> [folder]
#
# It lands in ~/coloc-backups unless a folder is given: never inside this checkout, which push.sh copies to the server.
# COLOC_SSH overrides how to reach the server, as for push.sh.
#
# To restore it on a server (it replaces what's in the database, so the API is stopped meanwhile):
#   ssh root@<ip> 'systemctl stop coloc-api && docker exec -i coloc-db pg_restore -U coloc -d coloc --clean --if-exists; systemctl start coloc-api' < ~/coloc-backups/coloc-<date>.dump
set -euo pipefail

ip=${1:?usage: deploy/pull-backup.sh <server ip> [folder]}
dest=${2:-$HOME/coloc-backups}
ssh_cmd=${COLOC_SSH:-ssh}

# The names sort by date, so the last one is the newest.
newest=$($ssh_cmd "root@$ip" 'ls -1 /var/backups/coloc/coloc-*.dump 2>/dev/null | tail -1')
[ -n "$newest" ] || { echo "No dump on $ip yet: wait for the night, or run systemctl start coloc-backup there." >&2; exit 1; }

# The dump holds every account and their sealed secrets.
mkdir -p "$dest"
chmod 700 "$dest"
rsync -t -e "$ssh_cmd" "root@$ip:$newest" "$dest/"
chmod 600 "$dest/$(basename "$newest")"
echo "$dest/$(basename "$newest")"
