#!/bin/sh
# Turns a fresh Ubuntu 24.04 server into the whole of La Coloc: the site, the API, the database, the seeded city and
# the rooms. Run by deploy/push.sh, as root, from the copied code in /opt/coloc/src. Running it again is how an update
# happens: every step checks what's already there.
#
# Needs COLOC_DOMAIN: the city's address. Rooms live under it, so it needs a wildcard DNS record.
set -eu

SRC=/opt/coloc/src
ETC=/etc/coloc
DATA=/var/lib/coloc
: "${COLOC_DOMAIN:?}"

say() { printf '\n==> %s\n' "$1"; }
as_coloc() { su -s /bin/sh coloc -c "cd $SRC && $1"; }
export DEBIAN_FRONTEND=noninteractive

# --- 1. The machine: only SSH, the rooms' SSH door, 80 and 443 from outside, keys only -----------------------------------------------

say "Locking the server down"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
# The rooms' SSH (apps/api/src/ssh): not the server's own, which stays on 22.
ufw allow 2222/tcp >/dev/null
ufw --force enable >/dev/null
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-hardening.conf
sshd -t && systemctl reload ssh

# npm and the type checker need more than rooms do, for a moment.
if [ ! -e /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- 2. Node, Docker, Caddy ---------------------------------------------------------------------------------------

say "Installing Node, Docker and Caddy (if they're missing)"
apt-get update -q
apt-get install -y -q ca-certificates curl git caddy rsync xfsprogs
if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sh

# userns-remap: root in a room isn't root on the server. Logs can't fill the disk. Public DNS, because a cloud's own
# resolver usually lives on the private network that coloc-firewall.service keeps builds away from.
mkdir -p /etc/docker
cat > /tmp/coloc-daemon.json <<'JSON'
{
  "userns-remap": "default",
  "dns": ["1.1.1.1", "8.8.8.8"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
if ! cmp -s /tmp/coloc-daemon.json /etc/docker/daemon.json; then
  mv /tmp/coloc-daemon.json /etc/docker/daemon.json
  systemctl restart docker
fi

# Docker's files get a disk of their own, as XFS with quotas: the only way Docker can hold each room to a size, so one
# room can't fill the machine. It's a file on the real disk, mounted at /var/lib/docker. A server that already ran without
# it has its files copied across, and the old copy stays in /var/lib/docker.before-xfs until someone deletes it.
if ! findmnt -n -o OPTIONS --target /var/lib/docker | grep -q prjquota; then
  say "Moving Docker onto a disk that can limit each room"
  disk=/var/lib/coloc-docker.img
  systemctl stop docker.socket docker.service
  rm -f "$disk"
  truncate -s "$(( $(df --output=avail -BM / | tail -1 | tr -dc 0-9) * 85 / 100 ))M" "$disk"
  mkfs.xfs -q "$disk"
  mkdir -p /mnt/coloc-docker
  mount -o loop,pquota "$disk" /mnt/coloc-docker
  rsync -aHAX --numeric-ids /var/lib/docker/ /mnt/coloc-docker/
  umount /mnt/coloc-docker
  rmdir /mnt/coloc-docker
  mv /var/lib/docker /var/lib/docker.before-xfs
  mkdir /var/lib/docker
  grep -q "^$disk " /etc/fstab || echo "$disk /var/lib/docker xfs loop,pquota 0 0" >> /etc/fstab
  mount /var/lib/docker
fi
mkdir -p /etc/systemd/system/docker.service.d
printf '[Unit]\nRequiresMountsFor=/var/lib/docker\n' > /etc/systemd/system/docker.service.d/coloc-disk.conf
systemctl daemon-reload
systemctl enable --now docker

# --- 3. Who runs it, and its keys ---------------------------------------------------------------------------------

say "Writing the settings"
id coloc >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin coloc
usermod -aG docker coloc
mkdir -p "$ETC" "$DATA/agent/proxy"
chown -R coloc:coloc "$DATA" "$SRC"
# Traefik reads the routes from inside its container, as a remapped user: readable by everyone, writable by caretakers.
chmod 755 "$DATA" "$DATA/agent" "$DATA/agent/proxy"

# Made once and never again: a new database password or secrets key would lock the city out of its own data.
if [ ! -e "$ETC/secrets.env" ]; then
  db=$(openssl rand -hex 24)
  (
    umask 077
    cat > "$ETC/secrets.env" <<KEYS
COLOC_DB_PASSWORD=$db
COLOC_DATABASE_URL=postgres://coloc:$db@127.0.0.1:5433/coloc
COLOC_SECRETS_KEY=$(openssl rand -base64 32)
COLOC_DEV_AGENT_SECRET=$(openssl rand -hex 32)
COLOC_LANDLORD_KEY=$(openssl rand -hex 32)
KEYS
  )
fi

# Made once too: a new host key would make everyone's ssh warn that the server changed.
[ -e "$ETC/ssh_host_ed25519_key" ] || ssh-keygen -q -t ed25519 -N "" -C "la-coloc" -f "$ETC/ssh_host_ed25519_key"
rm -f "$ETC/ssh_host_ed25519_key.pub"

touch "$ETC/github.env"
cat > "$ETC/coloc.env.new" <<SETTINGS
PORT=4100
COLOC_PUBLIC_URL=https://$COLOC_DOMAIN
COLOC_WEB_ORIGIN=https://$COLOC_DOMAIN
COLOC_ADMINS=${COLOC_ADMINS:-Djbrl}
COLOC_DEMO_RESET=1
COLOC_DEV_HOUSE_DOMAIN=$COLOC_DOMAIN
COLOC_TUTORIAL_REPO=file://$DATA/starter
COLOC_LANDLORD_AGENT=$SRC/apps/agent/dist/index.js
COLOC_LANDLORD_API_URL=ws://127.0.0.1:4100/agent
COLOC_LANDLORD_DOMAIN=$COLOC_DOMAIN
COLOC_PUBLIC_SCHEME=https
COLOC_PUBLIC_PORT=443
COLOC_WORKDIR=$DATA/agent
COLOC_PROXY_CONFIG_DIR=$DATA/agent/proxy
COLOC_SSH_PORT=2222
COLOC_SSH_HOST=$COLOC_DOMAIN
COLOC_SSH_HOST_KEY_FILE=$ETC/ssh_host_ed25519_key
COLOC_ROOM_INTERNET=1
COLOC_ROOM_DISK_MB=1024
SETTINGS
cat "$ETC/secrets.env" "$ETC/github.env" >> "$ETC/coloc.env.new"
mv "$ETC/coloc.env.new" "$ETC/coloc.env"
agent_secret=$(sed -n 's/^COLOC_DEV_AGENT_SECRET=//p' "$ETC/secrets.env")

caretaker() {
  cat > "$ETC/caretaker-$1.env" <<SETTINGS
COLOC_HOUSE_ID=$1
COLOC_AGENT_SECRET=$agent_secret
COLOC_API_URL=ws://127.0.0.1:4100/agent
COLOC_HOUSE_DOMAIN=$2
COLOC_PUBLIC_SCHEME=https
COLOC_PUBLIC_PORT=443
COLOC_WORKDIR=$DATA/agent
COLOC_PROXY_CONFIG_DIR=$DATA/agent/proxy
COLOC_ALLOW_LOCAL_REPOS=file://$DATA/starter
COLOC_ROOM_INTERNET=1
COLOC_ROOM_DISK_MB=1024
SETTINGS
}
caretaker sacre-coeur "$COLOC_DOMAIN"
caretaker atelier "atelier.$COLOC_DOMAIN"
chown root:coloc "$ETC" "$ETC"/*
chmod 750 "$ETC"
chmod 640 "$ETC"/*

# The quest's starter page: GitHub can't be reached without credentials while the repo is private, so it's a small
# repo of its own on this machine, with only examples/hello in it.
as_coloc "mkdir -p $DATA/starter/examples && cp -R examples/hello $DATA/starter/examples/ && cd $DATA/starter && \
  git init -q -b main . 2>/dev/null; git add -A && git -c user.name=coloc -c user.email=coloc@localhost commit -qm starter || true"

# --- 4. Build -----------------------------------------------------------------------------------------------------

say "Building"
as_coloc "npm ci --no-audit --no-fund --loglevel=error && npm run build"

# --- 5. Start everything ------------------------------------------------------------------------------------------

say "Starting the database and the rooms' proxy"
docker compose --env-file "$ETC/coloc.env" -f "$SRC/deploy/docker-compose.yml" -p coloc up -d --remove-orphans

sed "s/COLOC_SITE/$COLOC_DOMAIN/g" "$SRC/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl restart caddy

cp "$SRC"/deploy/coloc-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable coloc-firewall.service
systemctl restart coloc-firewall.service
systemctl enable coloc-api.service coloc-caretaker@sacre-coeur.service coloc-caretaker@atelier.service
systemctl restart coloc-api.service

# The API makes the tables when it starts. Only an empty city is seeded: a second run must never wipe real houses.
say "Waiting for the API's database tables"
query() { docker exec coloc-db psql -U coloc -d coloc -tAc "$1" 2>/dev/null; }
tries=0
until [ "$(query "select to_regclass('public.houses') is not null")" = "t" ]; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { echo "the tables never appeared: journalctl -u coloc-api"; exit 1; }
  sleep 2
done
if [ "$(query 'select count(*) from houses')" = "0" ]; then
  say "Seeding the city"
  as_coloc "set -a; . $ETC/coloc.env; set +a; cd apps/api && node dist/seed/run.js"
fi
systemctl restart coloc-caretaker@sacre-coeur.service coloc-caretaker@atelier.service

printf '\nDone: https://%s\n' "$COLOC_DOMAIN"
