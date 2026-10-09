#!/bin/sh
# La Coloc: turns a fresh server into a house.
#
# The chef runs this once, as root, on a new Ubuntu 22.04 / 24.04 or Debian 12 server, with the one line the
# house page gives them:
#
#   curl -fsSL https://coloc.dev/install.sh | sudo COLOC_HOUSE_ID=… COLOC_AGENT_SECRET=… COLOC_API_URL=… COLOC_HOUSE_DOMAIN=… sh
#
# It installs Node, Docker (with userns-remap, so root in a room isn't root on the server), the Traefik front door,
# and the agent (the house's caretaker) as a system service. Once the agent phones in, the house shows as live.
#
# Running it twice is fine: every step checks what's already there. Run it again to update the agent.
#
# NOT YET TRIED ON A REAL SERVER. There is no house server yet (Jib buys one later), so this has only been
# checked with `sh -n` and shellcheck. Expect to fix small things the first time it runs for real.
#
# Optional settings, passed the same way as the others:
#   COLOC_ACME_EMAIL  an email for Let's Encrypt. Set: HTTPS on port 443 too. Not set: plain HTTP only.
#   COLOC_REPO        where to get the code (default: https://github.com/Djbrl/la-coloc.git)
#   COLOC_REF         which branch or tag (default: main)
set -eu

COLOC_REPO=${COLOC_REPO:-https://github.com/Djbrl/la-coloc.git}
COLOC_REF=${COLOC_REF:-main}
COLOC_ACME_EMAIL=${COLOC_ACME_EMAIL:-}

SRC=/opt/coloc/src
COMPOSE_FILE=/opt/coloc/docker-compose.yml
ENV_FILE=/etc/coloc/agent.env
PROXY_DIR=/var/lib/coloc/proxy
WORK_DIR=/var/lib/coloc/work
UNIT_FILE=/etc/systemd/system/coloc-agent.service

say() { printf '\n==> %s\n' "$1"; }
die() { printf 'install.sh: %s\n' "$1" >&2; exit 1; }

# --- 1. Check what we were given ---------------------------------------------------------------------------

[ "$(id -u)" -eq 0 ] || die "run this as root (the command from the house page starts with sudo)."
command -v apt-get >/dev/null 2>&1 || die "this script needs Ubuntu or Debian (apt-get wasn't found)."

for name in COLOC_HOUSE_ID COLOC_AGENT_SECRET COLOC_API_URL COLOC_HOUSE_DOMAIN; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || die "$name is missing. Copy the whole command from your house page."
done

# These values end up in files, so refuse anything with spaces, quotes or other surprises in it.
case $COLOC_HOUSE_ID in *[!a-z0-9-]*) die "COLOC_HOUSE_ID doesn't look like a house id." ;; esac
case $COLOC_AGENT_SECRET in *[!A-Za-z0-9_-]*) die "COLOC_AGENT_SECRET doesn't look like a house key." ;; esac
case $COLOC_HOUSE_DOMAIN in *[!a-z0-9.-]*) die "COLOC_HOUSE_DOMAIN doesn't look like a domain." ;; esac
case $COLOC_API_URL in *[!A-Za-z0-9.:/_-]*) die "COLOC_API_URL doesn't look like a URL." ;; esac
case $COLOC_ACME_EMAIL in *[!A-Za-z0-9.@+_-]*) die "COLOC_ACME_EMAIL doesn't look like an email." ;; esac
# The agent's first message carries the house key, so it only goes unencrypted to this same machine.
case $COLOC_API_URL in
  wss://*) ;;
  ws://localhost[:/]* | ws://127.0.0.1[:/]*) ;;
  *) die "COLOC_API_URL must start with wss://" ;;
esac

export DEBIAN_FRONTEND=noninteractive

# --- 2. Node 22 and git ------------------------------------------------------------------------------------
# First, because the next steps use Node to edit Docker's settings file safely.

say "Installing Node 22 and git (if they're missing)"
apt-get update -q
apt-get install -y -q ca-certificates curl git

node_major=0
if command -v node >/dev/null 2>&1; then
  node_major=$(node -p 'process.versions.node.split(".")[0]')
fi
if [ "$node_major" -lt 22 ]; then
  # NodeSource's own setup script adds their apt repository; then Node comes from apt like everything else.
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
NODE_BIN=$(command -v node)

# --- 3. Docker ---------------------------------------------------------------------------------------------

say "Installing Docker (if it's missing)"
if ! command -v docker >/dev/null 2>&1; then
  # Docker's official convenience script: Docker Engine plus the compose plugin.
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# --- 4. userns-remap: root in a room isn't root on the server ----------------------------------------------
# Adds "userns-remap": "default" to /etc/docker/daemon.json, keeping any other settings already in it.
# Docker only restarts if something changed.

say "Turning on Docker's user namespaces"
mkdir -p /etc/docker
changed=$(node -e '
  const fs = require("fs");
  const file = "/etc/docker/daemon.json";
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    // No file yet is fine. A file we cannot read as JSON is not: stop rather than overwrite it.
    if (e.code !== "ENOENT") throw e;
  }
  if (settings["userns-remap"] === "default") {
    console.log("no");
  } else {
    settings["userns-remap"] = "default";
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
    console.log("yes");
  }
')
if [ "$changed" = "yes" ]; then
  systemctl restart docker
fi

# --- 5. The agent's code -----------------------------------------------------------------------------------

say "Fetching La Coloc ($COLOC_REF)"
mkdir -p /opt/coloc
if [ -d "$SRC/.git" ]; then
  # Already here from an earlier run: move to the latest version of the branch, dropping local edits.
  git -C "$SRC" remote set-url origin "$COLOC_REPO"
  git -C "$SRC" fetch --depth 1 origin "$COLOC_REF"
  git -C "$SRC" reset --hard FETCH_HEAD
else
  git clone --depth 1 --branch "$COLOC_REF" "$COLOC_REPO" "$SRC"
fi

say "Building the agent"
cd "$SRC"
npm ci --no-audit --no-fund
npm run build:packages
npm run build -w @coloc/agent
cd /

# --- 6. The agent's settings -------------------------------------------------------------------------------
# Readable by root only: it holds the house key.

say "Writing the agent's settings"
mkdir -p /etc/coloc "$PROXY_DIR" "$WORK_DIR"
# Traefik reads the proxy folder from inside its container, so it must be readable by everyone (not writable).
chmod 755 /var/lib/coloc "$PROXY_DIR"
old_umask=$(umask)
umask 077
cat > "$ENV_FILE.tmp" <<EOF
# Written by install.sh. Run install.sh again rather than editing this by hand.
COLOC_HOUSE_ID=$COLOC_HOUSE_ID
COLOC_AGENT_SECRET=$COLOC_AGENT_SECRET
COLOC_API_URL=$COLOC_API_URL
COLOC_HOUSE_DOMAIN=$COLOC_HOUSE_DOMAIN
COLOC_PROXY_CONFIG_DIR=$PROXY_DIR
# Visitors reach the rooms on the normal web port, not the development 8000.
COLOC_PUBLIC_PORT=80
COLOC_PUBLIC_SCHEME=http
COLOC_WORKDIR=$WORK_DIR
EOF
umask "$old_umask"
chmod 600 "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

# --- 7. The front door: Traefik ----------------------------------------------------------------------------
# Same idea as dev/docker-compose.yml: Traefik reads its routes from files the agent writes, one per room, and
# never gets the Docker socket, so a compromised proxy can't take over the house.

say "Starting the front door (Traefik)"
if [ -n "$COLOC_ACME_EMAIL" ]; then
  # HTTPS with free Let's Encrypt certificates, checked over port 443 (the TLS challenge).
  # Note: the agent's routes only use the "web" entrypoint today; rooms answer on HTTPS once they also list "websecure".
  https_flags="
      - --entrypoints.websecure.address=:443
      - --entrypoints.websecure.http.tls.certResolver=letsencrypt
      - --certificatesresolvers.letsencrypt.acme.email=$COLOC_ACME_EMAIL
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true"
  https_port='
      - "443:443"'
  https_volume='
      # Certificates survive restarts. A Docker volume, so it works with userns-remap.
      - letsencrypt:/letsencrypt'
  https_volumes='
volumes:
  letsencrypt:'
else
  https_flags=""
  https_port=""
  https_volume=""
  https_volumes=""
fi

cat > "$COMPOSE_FILE" <<EOF
# Written by install.sh. Run install.sh again rather than editing this by hand.
services:
  traefik:
    image: traefik:v3.2
    # The agent looks for this name, to plug the proxy into each room's network.
    container_name: coloc-traefik
    command:
      - --providers.file.directory=/etc/traefik/rooms
      - --providers.file.watch=true
      - --providers.providersThrottleDuration=200ms
      - --entrypoints.web.address=:80
      - --api.dashboard=false$https_flags
    ports:
      - "80:80"$https_port
    volumes:
      # Read-only: only the agent writes routes.
      - $PROXY_DIR:/etc/traefik/rooms:ro$https_volume
    restart: unless-stopped
$https_volumes
EOF
docker compose -f "$COMPOSE_FILE" -p coloc up -d --remove-orphans

# --- 8. The agent as a service -----------------------------------------------------------------------------
# User=root for now: the agent drives Docker. Starts again on its own if it crashes or the server reboots.

say "Starting the agent"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=La Coloc agent (the house's caretaker)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
User=root
EnvironmentFile=$ENV_FILE
WorkingDirectory=$SRC/apps/agent
ExecStart=$NODE_BIN $SRC/apps/agent/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable coloc-agent.service
# Restart rather than start, so a second run picks up new code and settings.
systemctl restart coloc-agent.service

printf '\nDone. The house will show as live in a moment.\n'
printf 'To see what the agent is doing: journalctl -u coloc-agent -f\n'
