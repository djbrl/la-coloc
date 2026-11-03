#!/bin/sh
# Nightly, from coloc-backup.timer: a dump of the city's database. It goes on the root disk, not inside Docker's disk,
# so a full or broken Docker disk doesn't take the backups with it. The last 7 stay. deploy/pull-backup.sh copies the
# newest one off the server, which is the copy that counts if the server itself is lost.
#
# To restore one (it replaces what's in the database, so the API is stopped meanwhile):
#   systemctl stop coloc-api && docker exec -i coloc-db pg_restore -U coloc -d coloc --clean --if-exists < /var/backups/coloc/coloc-<date>.dump; systemctl start coloc-api
set -eu

DIR=${COLOC_BACKUP_DIR:-/var/backups/coloc}
KEEP=7
# The dump holds every account and their sealed secrets: readable by root only.
umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"

name="coloc-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
# Written under a temporary name first: a dump cut short must never count as one of the 7.
trap 'rm -f "$DIR/.partial"' EXIT
docker exec coloc-db pg_dump -U coloc -d coloc -Fc > "$DIR/.partial"
# "<3>" in front of a line is how a service tells the journal it's an error.
[ -s "$DIR/.partial" ] || { echo "<3>pg_dump wrote nothing."; exit 1; }
mv "$DIR/.partial" "$DIR/$name"

# The names sort by date, so everything after the newest 7 goes.
ls -1 "$DIR" | grep '^coloc-.*\.dump$' | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
  rm -f "$DIR/$old"
done

echo "saved $DIR/$name ($(du -h "$DIR/$name" | cut -f1)), $(ls -1 "$DIR" | grep -c '^coloc-.*\.dump$') kept"
