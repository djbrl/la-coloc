# Local development

## 1. Start everything

```bash
npm install && npm run build
npm run dev:proxy                         # Traefik on http://*.coloc.localhost:8000, Postgres on 127.0.0.1:5433
npm run dev:seed                          # wipes the local database and plants the development city
COLOC_DEV_LOGIN=1 \
  npm run start -w @coloc/api             # API + hub on http://127.0.0.1:4100 (migrates the database first)
COLOC_HOUSE_ID=sacre-coeur \
COLOC_AGENT_SECRET=dev-secret-change-me \
COLOC_USAGE_INTERVAL_MS=5000 \
COLOC_ALLOW_LOCAL_REPOS=1 \
  npm run start -w @coloc/agent           # the caretaker; connects out to the API
npm run dev:web                           # http://localhost:5173
```

`*.localhost` resolves to your machine in browsers and curl, so no DNS setup is needed.

**The development city** (`apps/api/src/seed/city.ts`): nine houses across Dakar, Lomé, Abidjan, Douala, Kigali,
Tunis, Marrakech and Cotonou. Only **Sacré-Cœur** is real: our local agent runs it, with rooms `jib` (the chef),
`awa`, `moussa` (128 MB) and a free `room-4`. The eight others are **demo houses**: flagged `demo` in the database and
labelled "demo" in the UI, with made-up flatmates who have no GitHub account. Nothing runs in them.

**Logging in.** `COLOC_DEV_LOGIN=1` turns on a development login: on `/login`, be anyone from the seeded city (or a
new name). Never set it on a real server. GitHub login turns on when `COLOC_GITHUB_CLIENT_ID` and
`COLOC_GITHUB_CLIENT_SECRET` are set; set `COLOC_PUBLIC_URL` to the address you open the site at (default
`http://localhost:5173`) so GitHub sends you back to the right place.

## 2. Move into a room

From the house page (log in as the room's flatmate), or with curl. Only a room's flatmate, or the house's chef,
may deploy into it. The agent clones with git, so a local repo works via `file://` (it must be committed; the agent
clones `main`):

```bash
curl -c /tmp/coloc-cookies -X POST http://127.0.0.1:4100/api/auth/dev-login \
  -H 'Content-Type: application/json' -d '{"login":"jib"}'
curl -b /tmp/coloc-cookies -X POST http://127.0.0.1:4100/api/houses/sacre-coeur/rooms/jib/deploy \
  -H 'Content-Type: application/json' \
  -d '{"repo":"file:///ABSOLUTE/PATH/TO/app","path":"examples/hello"}'

curl http://jib.coloc.localhost:8000
```

## 3. The isolation demo (the jury's favourite)

```bash
scripts/isolation-demo.sh
```

It logs in as Jib (the chef), moves Jib into his room with `examples/hello`, moves Moussa into his 128 MB room with
`examples/memory-hog`, an app that eats memory until its cap kills it, then probes Jib's room for 45 seconds.
Moussa's container gets OOM-killed and restarted (Docker's restart policy), the fridge door says so, and Jib's room
never misses a request. Afterwards, redeploy Moussa's room with `examples/hello` so the hog stops eating your CPU.

## GitHub (login and chores)

One-time setup, with GitHub's App-manifest flow (no secret copied by hand):

```bash
npm run dev:github-app      # open http://localhost:4101, sign in to GitHub, confirm
```

It creates a private development App (read code, comment on PRs, request reviews; events: pull requests and
reviews), then writes its keys to `dev/.env.github` and `dev/github-app.pem`. Both are git-ignored; the API's
`start` script reads them automatically.

Webhooks go to a smee.io channel, and a relay pulls them to the local API, so the API is never exposed to the
internet:

```bash
npm run dev:webhooks
```

Then install the App on a repo you live with (the link is on the setup page's last screen). Without these keys the API
runs fine: GitHub login and chores just stay off. Known catch: smee re-encodes the JSON it relays; if a webhook ever
fails the signature check (`401` in the relay's log), that's why.

## Rooms, previews, the lobby

- **Room page** (`/houses/:id/rooms/:room`, the room's flatmate or the chef): build settings, secrets, logs,
  restart, redeploy. Secrets need `COLOC_SECRETS_KEY` (32 bytes, base64); the API's `start` script reads it from the
  git-ignored `dev/.env.local`. Create one with `openssl rand -base64 32` if it's missing.
- **Previews**: an open pull request in a linked repo is built at `preview-<room>.<house domain>` on every push and
  removed when it closes. Never for pull requests from forks.
- **The lobby's live line** is a WebSocket at `/lobby-ws` (proxied by Vite in development). Only pages from
  `COLOC_PUBLIC_URL`'s origin may connect. In the browser console (development builds), `window.lobby` is the
  running lobby.

## Database

- Schema: `packages/db/src/schema.ts`. After changing it: `npm run generate -w @coloc/db` writes a new SQL migration
  into `packages/db/drizzle/`. Commit it. The API applies pending migrations when it starts.
- Tests use PGlite (Postgres compiled to WebAssembly, in memory), so `npm test` needs no Docker.
- Local connection: `postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc` (override with `COLOC_DATABASE_URL`).

## Production notes (not done yet)
- **Traefik has no Docker socket**, even in production: the agent writes its routes to `COLOC_PROXY_CONFIG_DIR`
  (default `/tmp/coloc-agent/proxy`, mounted read-only into Traefik by `dev/docker-compose.yml`).
- **`COLOC_ALLOW_LOCAL_REPOS=1` is for development only.** Without it the agent refuses `file://` repos, which would
  let a flatmate build an image from any folder on the house server.
- **`COLOC_DEV_LOGIN=1` is for development only.** It lets anyone log in as anyone.
- **The agent refuses to connect to a remote hub over plain `ws://`**: its first message carries the house secret.
- **Session cookies** are HttpOnly and SameSite=Lax, and `Secure` once `COLOC_PUBLIC_URL` is https. Only a SHA-256 of
  each session token is stored.
- **userns-remap:** set in the Docker daemon by `install.sh`, so root in a room isn't root on the host.
- **Agent secret:** only its SHA-256 is stored; shown once at house creation.
