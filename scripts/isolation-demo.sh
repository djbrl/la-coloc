#!/usr/bin/env bash
# Proves the walls hold: Moussa's app eats memory until it's killed, Jib's app never notices.
# Needs the proxy, database, API (with COLOC_DEV_LOGIN=1) and agent running (see docs/dev.md).
set -euo pipefail

API=${API:-http://127.0.0.1:4100/api/houses/sacre-coeur}
REPO=${REPO:-file://$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel)}
JIB=http://jib.coloc.localhost:8000
COOKIES=$(mktemp)
trap 'rm -f "$COOKIES"' EXIT

# Log in as Jib, the chef: the chef may deploy into any room of the house.
curl -sf -c "$COOKIES" -X POST "${API%/houses/*}/auth/dev-login" -H 'Content-Type: application/json' -d '{"login":"jib"}' > /dev/null \
  || { echo "dev login failed: start the API with COLOC_DEV_LOGIN=1"; exit 1; }

deploy() {
  curl -sf -b "$COOKIES" -X POST "$API/rooms/$1/deploy" -H 'Content-Type: application/json' \
    -d "{\"repo\":\"$REPO\",\"path\":\"$2\"}" > /dev/null
}

wait_live() {
  for _ in $(seq 1 90); do
    status=$(curl -s -b "$COOKIES" "$API" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s).rooms.find(r=>r.name==='$1');console.log(r.status)})")
    [ "$status" = live ] && return 0
    [ "$status" = failed ] && { echo "$1 failed to deploy"; exit 1; }
    sleep 2
  done
  echo "$1 never went live"; exit 1
}

echo "→ Jib moves in with examples/hello"
deploy jib examples/hello
wait_live jib
echo "  live: $(curl -s $JIB)"

echo "→ Moussa moves in with examples/memory-hog (128 MB room)"
deploy moussa examples/memory-hog
wait_live moussa

echo "→ Watching Jib's room for 45s while Moussa's app eats its memory"
fails=0
for _ in $(seq 1 45); do
  curl -sf -m 2 "$JIB" > /dev/null || fails=$((fails + 1))
  sleep 1
done
restarts=$(docker inspect -f '{{.RestartCount}}' $(docker ps -aq --filter label=coloc.room=moussa) | head -1)

echo "  Jib's failed requests: $fails / 45"
echo "  Moussa's container restarts: $restarts"
echo "→ Fridge door:"
curl -s -b "$COOKIES" "$API" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>JSON.parse(s).notes.slice(0,5).forEach(n=>console.log('   ['+n.tone+'] '+n.text)))"

[ "$fails" -eq 0 ] && [ "$restarts" -gt 0 ] && echo "PASS: the walls held." || { echo "FAIL"; exit 1; }
