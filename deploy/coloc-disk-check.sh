#!/bin/sh
# Every 15 minutes, from coloc-disk-check.timer. Images and build cache have no size limit, and they share Docker's disk
# with the rooms and the database: if it fills, the database stops and the city with it. At 80% this warns and clears
# what can be rebuilt: build cache older than a day and images nothing uses. Never volumes or containers, running or
# stopped: rooms keep their files there.
#
# COLOC_ALERT_URL in /etc/coloc/alert.env (optional, e.g. https://ntfy.sh/<topic>) also gets a one-line message, at most
# every 6 hours. Without it, the journal only: journalctl -p warning -u coloc-disk-check
set -eu

LIMIT=80
STAMP=${COLOC_DISK_STAMP:-/run/coloc-disk-alerted}
# Read, not sourced: only this one line. The address is never printed, since anyone who has it can read the alerts.
url=$(sed -n 's/^COLOC_ALERT_URL=//p' /etc/coloc/alert.env 2>/dev/null | tail -1 | tr -d "\"'")

used() { df --output=pcent "$1" | tail -1 | tr -dc 0-9; }
usage() { echo "/ at $(used /)%, /var/lib/docker at $(used /var/lib/docker)%"; }
full() { [ "$(used /)" -ge "$LIMIT" ] || [ "$(used /var/lib/docker)" -ge "$LIMIT" ]; }
# "<4>" in front of a line is how a service tells the journal it's a warning.
warn() { echo "<4>$1"; }

if ! full; then
  rm -f "$STAMP"
  exit 0
fi

before=$(usage)
warn "Disk at $LIMIT% or more ($before): clearing old build cache and unused images."
docker builder prune --filter until=24h -f || warn "Couldn't clear the build cache."
docker image prune -f || warn "Couldn't clear unused images."
after=$(usage)
if full; then
  warn "Still full after clearing ($after): rooms, logs or the database need a look."
else
  echo "Cleared: $after."
fi

if [ -n "$url" ] && [ -z "$(find "$STAMP" -mmin -360 2>/dev/null)" ]; then
  if curl -fsS -m 10 -d "La Coloc on $(hostname): disk was $before, now $after" "$url" >/dev/null 2>&1; then
    touch "$STAMP"
  else
    warn "Couldn't send the alert."
  fi
fi
