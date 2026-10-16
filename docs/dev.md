# Install and run La Coloc locally

*Install and run guide. Written 12 Oct 2026 for commit `ffce382`. Start here if you have a laptop and no history.*

**What you get:** the city in your browser, with a real house (Sacré-Cœur) whose rooms are built and served by Docker on
your machine, plus the tutorial's workshop. **Time:** about 15 minutes, most of it Docker pulling images once.
**What you need first:** Node 22.9 or newer, Git, Docker Desktop, and `openssl` (already on macOS and Linux).

Stuck? Jump to [Troubleshooting](#troubleshooting). Wondering what the pieces are? Read the
[10-minute orientation in CONTRIBUTING.md](../CONTRIBUTING.md#1-the-10-minute-orientation).

## What you need, and what each part is for

| Tool | Version | What it is for | Without it |
|---|---|---|---|
| Node | 22.9 or newer (`.nvmrc` says 22) | Everything: web, API, caretaker, tests. The API's `start` script uses `--env-file-if-exists`, added in 22.9 | Nothing runs |
| npm | 10 or newer (comes with Node 22) | Installs and runs the workspaces | Nothing runs |
| Git | any recent | Clone the repo; the caretaker also uses it to fetch the code it builds | Nothing runs |
| Docker Desktop (or Docker Engine on Linux) | any recent | Postgres, Traefik and every room (each room is a container) | **Install, build, tests and the web dev server still work.** The city needs Postgres, so it stays empty, and no room can be built |
| `openssl` | any | Makes the key that encrypts room secrets | Use any 32 random bytes, base64 |
| A GitHub account | | Only for the optional GitHub App (real login, chores, deploy on merge) | The dev login covers everything else |

**Which parts need Docker?** Only running the city. `npm ci`, `npm run build`, `npm test` and `npm run licences:check`
need no Docker: the tests use PGlite, Postgres compiled to WebAssembly, in memory.

If you use nvm:

```bash
nvm install    # reads .nvmrc (22)
nvm use
```

## The short version

Five terminals. Each step below says which one and what you should see.

| Terminal | Runs | Port |
|---|---|---|
| 1 | Docker: Traefik (the front door) and Postgres | 8000, 5433 |
| 2 | The API | 4100 |
| 3 | The caretaker of Sacré-Cœur (a real house) | none, it dials out |
| 4 | The caretaker of L'Atelier (the tutorial's workshop) | none |
| 5 | The web dev server | 5173 |

## 1. Clone and install

```bash
git clone https://github.com/Djbrl/la-coloc.git
cd la-coloc
```

```bash
npm ci
```

`npm ci` installs exactly what `package-lock.json` says. You should see `added 332 packages` (about 25 seconds). A few `npm warn deprecated` lines and a note about
"vulnerabilities" are normal here; they are about development tools and don't fail anything.

## 2. Build

```bash
npm run build
```

Builds the shared packages first (`protocol`, `domain`, `db`), then the caretaker, the API and the web app (the web build
also type-checks every Vue file). You should end with Vite's `✓ built in …s` and a harmless "chunks are larger than 500 kB" warning (about 15 seconds).

The API and the caretaker run from the compiled `dist/` folders, so **build again after you change API, caretaker or package code**
(see [the everyday loop](#the-everyday-loop)).

## 3. Your settings file

`dev/.env.local` is git-ignored and read by the API's `start` script. Make yours from the template:

```bash
cp dev/.env.example dev/.env.local
```

```bash
echo "COLOC_SECRETS_KEY=$(openssl rand -base64 32)" >> dev/.env.local
```

```bash
echo "COLOC_TUTORIAL_REPO=file://$PWD" >> dev/.env.local
```

The second line is the key that encrypts room secrets. The third tells the tutorial to deploy its sample from **your clone**,
not from GitHub: this repository is private, and the caretaker has no GitHub credentials, so the default
(`https://github.com/Djbrl/la-coloc.git`) can't be cloned. The sample comes from `main`, so it must be committed.

The template also turns on the dev login (`COLOC_DEV_LOGIN=1`) and the demo reset button. **Never set the dev login on a real server.**

## 4. Terminal 1: Postgres and Traefik

Start Docker Desktop first. On Linux, make the routes folder yourself so it isn't created as root:

```bash
mkdir -p /tmp/coloc-agent/proxy
```

```bash
npm run dev:proxy
```

First run pulls two images (`traefik:v3.2`, `postgres:17-alpine`). Check:

```bash
docker ps --format '{{.Names}}  {{.Ports}}'
```

You should see `coloc-traefik` on `0.0.0.0:8000->80` and `coloc-db` on `127.0.0.1:5433->5432`.

## 5. Plant the development city

```bash
npm run dev:seed
```

Creates the schema (runs the migrations) and wipes and replants the data. You should see `seeded the development city`.
Right after step 4, Postgres may need a few seconds to accept connections: if you get `Failed query: CREATE SCHEMA…`, wait five seconds and run it again.
It refuses any database that isn't on this machine. **It wipes every table**, so stop the API before running it again
(or use the demo reset button, which is safe while the API runs).

What's in the city (`apps/api/src/seed/city.ts`): nine houses across Dakar, Lomé, Abidjan, Douala, Kigali, Tunis,
Marrakech and Cotonou, plus the hidden workshop. Only two are *real* (a caretaker on your machine runs them):

- **Sacré-Cœur** (Dakar): rooms `jib` (the chef), `awa`, `moussa` (128 MB) and a free `room-4`.
- **L'Atelier** (Dakar): the tutorial's workshop, never drawn on the city.

Every other house is a demo house: flagged `demo`, labelled so in the UI, with made-up flatmates who have no GitHub
account. Nothing runs in them.

## 6. Terminal 2: the API

```bash
npm run start -w @coloc/api
```

Reads `dev/.env.local` and `dev/.env.github` if they exist, applies pending migrations, and listens on `127.0.0.1:4100`.
You should see Nest's start-up lines, then:

```
[api] http://127.0.0.1:4100/api · agents on ws://127.0.0.1:4100/agent
```

Expected on a fresh machine: `dev/.env.github not found. Continuing without it.`, a warning that the dev login is on (`anyone can log in as anyone`),
and `GitHub login not configured` and `GitHub App not configured … chores stay off` (see [GitHub](#github-optional-real-login-chores-deploy-on-merge)).
If you see `COLOC_SECRETS_KEY not set`, step 3 didn't take. Check it answers:

```bash
curl -s http://127.0.0.1:4100/api/city | head -c 200
```

You should get JSON starting with a list of houses.

## 7. Terminal 3: Sacré-Cœur's caretaker

```bash
COLOC_HOUSE_ID=sacre-coeur \
COLOC_AGENT_SECRET=dev-secret-change-me \
COLOC_USAGE_INTERVAL_MS=5000 \
COLOC_ALLOW_LOCAL_REPOS=1 \
  npm run start -w @coloc/agent
```

The caretaker dials out to the API with the house's secret (the seed's `dev-secret-change-me`). You should see
`[link] connected to ws://localhost:4100/agent` and `[agent] house sacre-coeur, rooms at *.coloc.localhost`; the API
logs `agent online: sacre-coeur`.

`COLOC_ALLOW_LOCAL_REPOS=1` lets it build from `file://` repos on your disk. **Development only.**

## 8. Terminal 4: the workshop's caretaker

The tutorial runs in a second house, L'Atelier, with its own caretaker (same dev secret, its own domain and work folder):

```bash
COLOC_HOUSE_ID=atelier \
COLOC_AGENT_SECRET=dev-secret-change-me \
COLOC_HOUSE_DOMAIN=atelier.coloc.localhost \
COLOC_WORKDIR=/tmp/coloc-agent-atelier \
COLOC_USAGE_INTERVAL_MS=5000 \
COLOC_ALLOW_LOCAL_REPOS=1 \
  npm run start -w @coloc/agent
```

Same lines as above, with `atelier`. Skip this terminal if you don't need the tutorial: the tutorial's "Put it online" step
just won't work. Both caretakers share one routes folder (`/tmp/coloc-agent/proxy`); each route file carries its house's name, so they never collide.

## 9. Terminal 5: the web app

```bash
npm run dev:web
```

You should see Vite say `Local: http://localhost:5173/`. Open it. You'll see the loading screen, then the lobby (a 3D city). Vite
proxies `/api` and `/lobby-ws` to the API on :4100, so the browser stays on one address.

**Port.** Vite's default is 5173, and so are the API's defaults for `COLOC_PUBLIC_URL` and `COLOC_WEB_ORIGIN`. Jib's setup
pins **5175** instead (`.claude/launch.json`). If you use 5175,
start the web with `npm run dev:web -- --port 5175 --strictPort` and start the API with `COLOC_PUBLIC_URL=http://localhost:5175`:
the lobby's live line only accepts pages from that origin.

## 10. Log in as someone

Go to `http://localhost:5173/login` and choose "Use a development login". Pick `jib` (the chef of Sacré-Cœur and a demo-reset admin),
`awa`, `moussa` or `koffi`, or type any new name to be a stranger. Each login is a separate person: use a private
window to be two people at once.

- A new person gets the **quest "Your first home"**: follow the light to the workshop, take a room, put the starter page online (this is
  what the workshop's caretaker is for), open it at `http://<login>.atelier.coloc.localhost:8000` (`<login>-home` when that room name is
  already used in another house, as for `jib`), share it, meet the house. Retake it from the lobby's settings.
- The **settings** (the gear in the top bar) hold the day / night switch, the list view, the tutorial retake and, for admins such as
  `jib`, the demo reset.
- To knock on a free room: log in as someone new, walk to Sacré-Cœur's `room-4` and knock. A majority of the flatmates decides, so
  log in as `jib` and `awa` in two other windows to vote.

### Every address

Open **http://localhost:5173/dev/start.html** while the dev server runs (development only, not part of a production build):
it lists the site, the API, every house and its rooms, and the tools. The short version:

| What | Where |
|---|---|
| The site and the lobby | http://localhost:5173 |
| Sacré-Cœur, inside | http://localhost:5173/?city=Dakar&in=house:sacre-coeur |
| The list view's pages | http://localhost:5173/houses/sacre-coeur |
| The API | http://127.0.0.1:4100/api (`/api/city`, `/api/houses/sacre-coeur`) |
| A room, through Traefik | http://jib.coloc.localhost:8000 (the project in room `jib`) |
| A workshop room | http://\<your login\>.atelier.coloc.localhost:8000 (or \<your login\>-home) |
| The GitHub App setup page | http://localhost:4101 (`npm run dev:github-app`, only while it runs) |
| Postgres | `postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc` |

`*.localhost` points at your machine in browsers and curl, so no DNS setup is needed.

## The everyday loop

| You changed | Do this |
|---|---|
| Web code (`apps/web/src`) | Nothing: Vite reloads the page |
| API code (`apps/api/src`) | `npm run build -w @coloc/api`, then restart terminal 2 (it runs from `dist/`). Or run `npm run dev:api` for rebuild-and-restart on save: it does **not** read `dev/.env.local`, so export `COLOC_SECRETS_KEY` and the others in that shell first |
| Caretaker code | `npm run build -w @coloc/agent`, restart terminals 3 and 4. Or `npm run dev:agent` (watch mode, `tsx`) with the same env as above |
| `packages/*` (protocol, domain, db) | `npm run build:packages`, then restart whatever uses it (the API, the caretakers) |
| The database schema | Generate a migration (see [CONTRIBUTING.md](../CONTRIBUTING.md#add-a-migration)), `npm run build:packages`, restart the API: it migrates on start |
| After `git pull` | `npm ci` if `package-lock.json` changed, then `npm run build`, then restart everything |

## Try a room by hand (no browser)

Only a room's flatmate, or the house's chef, may deploy into it. The caretaker clones with git, so a local repo works via
`file://` (committed, `main` branch):

```bash
curl -c /tmp/coloc-cookies -X POST http://127.0.0.1:4100/api/auth/dev-login \
  -H 'Content-Type: application/json' -d '{"login":"jib"}'
```

```bash
curl -b /tmp/coloc-cookies -X POST http://127.0.0.1:4100/api/houses/sacre-coeur/rooms/jib/deploy \
  -H 'Content-Type: application/json' \
  -d '{"repo":"file:///ABSOLUTE/PATH/TO/la-coloc","path":"examples/hello"}'
```

```bash
curl http://jib.coloc.localhost:8000
```

The `examples/` folder has four small apps: `hello`, `ndaje` (a shop with a mock mobile-money button), `prix-marche`
(market prices) and `memory-hog` (eats memory until it is killed).

## The isolation demo (the jury's favourite)

With terminals 1 to 3 running and `COLOC_ALLOW_LOCAL_REPOS=1` on Sacré-Cœur's caretaker:

```bash
scripts/isolation-demo.sh
```

It logs in as `jib`, moves Jib into his room with `examples/hello`, moves Moussa into his 128 MB room with
`examples/memory-hog`, then probes Jib's room for 45 seconds. Moussa's container is OOM-killed and restarted, the fridge door says
so, and Jib's room never misses a request. It ends with `PASS: the walls held.` It overwrites the two rooms' projects:
afterwards press "Reset the demo city" in settings, or redeploy `examples/hello` into Moussa's room so the hog stops eating CPU.

## Resetting things

| I want to | Do this |
|---|---|
| Put the demo city back as seeded, with the API running | Log in as an admin (`jib`), lobby settings, "Reset the demo city". Needs `COLOC_DEMO_RESET=1`. At most once every ten minutes; people and logins stay |
| Replant the database from scratch | Stop the API, then `npm run dev:seed`, then start the API |
| Throw the database away completely | `docker compose -f dev/docker-compose.yml down -v`, then `npm run dev:proxy`, then `npm run dev:seed` |
| Take the tutorial again | Lobby settings, "Take the tutorial again" (removes your workshop room and the done mark) |
| Remove leftover room containers | `docker ps -a --filter label=coloc.room` to look; `docker rm -f` what you don't want. Restarting a caretaker rebuilds its routes from what's running |

## Running the tests

`npm test` (from the repo root) builds the three shared packages and runs every package's tests: **over 400 tests today**
(db 2, domain 22, protocol 4, agent 13, API 152, web 113). It takes under half a minute and needs no Docker.

| I want | Command |
|---|---|
| Everything | `npm test` |
| One package | `npm test -w @coloc/api` (also `@coloc/web`, `@coloc/agent`, `@coloc/domain`, `@coloc/db`, `@coloc/protocol`) |
| One file | `npm test -w @coloc/api -- src/houses/exchange.test.ts` |
| Tests whose name matches | `npm test -w @coloc/domain -- -t "tontine"` |
| Type-check without building | `npx tsc --noEmit -p apps/api` (web: `npx vue-tsc --noEmit -p apps/web`) |
| The copyleft check | `npm run licences:check` (prints `licences OK: no copyleft`) |

Running one package skips `build:packages`. If you changed `packages/*`, run `npm run build:packages` first, or the API's tests
fail with `Failed to resolve entry for package "@coloc/db"`.

## GitHub (optional: real login, chores, deploy on merge)

Without these keys the API runs fine: the dev login works and GitHub-only features (chores, deploy on merge, previews, real login)
stay off. To turn them on you create your **own** development GitHub App (the one Jib uses is installed on Jib's private repos only):

```bash
COLOC_PUBLIC_URL=http://localhost:5173 npm run dev:github-app
```

Open http://localhost:4101, sign in to GitHub, confirm. The script creates a private App (read code, comment on PRs, request
reviews; events: pull requests and reviews) and writes its keys to `dev/.env.github` and `dev/github-app.pem`. Both are
git-ignored; the API's `start` script reads them. **Pass your site's address** as above: the script's own default is
`http://localhost:5175` and it registers GitHub's login callback there. Run it again with `--force` to create another App.

Webhooks reach your laptop through a smee.io channel, so the API is never exposed to the internet:

```bash
npm run dev:webhooks
```

Leave it running, restart the API so it picks up the keys, then install the App on a test repo you own (the link is on the
setup page's last screen). Chores need a second GitHub person who lives in a room. Known catch: smee re-encodes the JSON it
relays; if a webhook fails the signature check (`401` in the relay's log), that's why.

## Rooms, previews and the lobby (what to know)

- **Room page** (`/houses/:id/rooms/:room`, the room's flatmate or the chef): build settings, secrets, logs, restart, redeploy.
  Secrets need `COLOC_SECRETS_KEY` (step 3).
- **Previews:** an open pull request in a linked repo is built at `preview-<room>.<house domain>` on every push and removed when it
  closes. Never for pull requests from forks.
- **The lobby's live line** is a WebSocket at `/lobby-ws` (proxied by Vite in development). In the browser console of a development
  build, `window.lobby` is the running lobby.
- **Everything in the lobby is a target:** houses, empty buildings, people. Walk up and press E, click, or press Tab to pick one from
  afar. **Shift** dashes, **M** opens the map, **?** lists every key. An empty building offers "Start a coloc here"
  (`POST /api/city/houses`).
- **You never leave the lobby.** A house's inside, a knock's thread and a room page open as a sheet over the city
  (`components/lobby/Inside.vue`). The URL remembers it (`?in=house:sacre-coeur`, `in=application:<id>`, `in=room:<house>:<room>`).
  The list view (settings) is where the real pages are.
- **Renting the server:** the chef of a house in the making picks a size, gets a one-line install command
  (`POST /api/houses/:id/server`, the key is shown once), and the house goes **live** when a caretaker phones in with that key.
  The command fetches `apps/web/public/install.sh`, which has never run on a real server (see [TODO.md](../TODO.md)).
  **In development** the command tells the caretaker to phone in at the site's address (`ws://localhost:5173/agent`), which Vite doesn't proxy: run a local caretaker with `COLOC_API_URL=ws://localhost:4100/agent` instead ([TODO.md](../TODO.md) D1).
- **Looks:** the settings pane has a day / night / system switch (`data-theme` on `<html>`; tokens in `apps/web/src/style.css`).
- **Sounds** are synthesised in the browser (`apps/web/src/lobby/sound.ts`): nothing is downloaded, so nothing to declare.

## Settings reference

### The API (`apps/api`; `dev/.env.local` is read by `npm run start`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT`, `HOST` | `4100`, `127.0.0.1` | Where it listens |
| `COLOC_DATABASE_URL` | `postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc` | coloc.dev's database. Always set in production |
| `COLOC_PUBLIC_URL` | `http://localhost:5173` | Where the site lives, as the browser sees it. GitHub login returns here; the lobby's live line only accepts this origin; `https://` turns on `Secure` cookies |
| `COLOC_WEB_ORIGIN` | `http://localhost:5173` | CORS origin. The Vite proxy keeps the browser on one origin, so you rarely need it |
| `COLOC_SECRETS_KEY` | none | 32 bytes, base64. Without it rooms can't store secrets (the API says so at start) |
| `COLOC_DEV_LOGIN` | off | `1`: log in as anyone. **Development only** |
| `COLOC_DEMO_RESET` | off | `1`: allow `POST /api/demo/reset` for admins. Demo servers only |
| `COLOC_ADMINS` | `jib,Djbrl` with the dev login on, else nobody | Comma list of logins who may reset the demo |
| `COLOC_TUTORIAL_REPO` | `https://github.com/Djbrl/la-coloc.git` | Where the tutorial's sample comes from. Use `file://…` locally |
| `COLOC_TUTORIAL_PATH` | `examples/hello` | The folder in that repo that holds the Dockerfile |
| `COLOC_GITHUB_CLIENT_ID`, `COLOC_GITHUB_CLIENT_SECRET` | none | GitHub login. Written by `dev:github-app` |
| `COLOC_GITHUB_APP_ID`, `COLOC_GITHUB_APP_SLUG`, `COLOC_GITHUB_WEBHOOK_SECRET` | none | The GitHub App (chores, deploy on merge, previews) |
| `COLOC_GITHUB_PRIVATE_KEY` or `COLOC_GITHUB_PRIVATE_KEY_FILE` | none | The App's private key, inline (`\n` for newlines) or as a file path |

### The seed and the scripts

| Variable | Default | Meaning |
|---|---|---|
| `COLOC_DATABASE_URL` | as above | `dev:seed` refuses anything not on this machine |
| `COLOC_DEV_HOUSE_DOMAIN` | `coloc.localhost` | Seed only: Sacré-Cœur's rooms are `<room>.<this>` |
| `COLOC_DEV_AGENT_SECRET` | `dev-secret-change-me` | Seed only: the caretakers' key (only its hash is stored) |
| `COLOC_GITHUB_WEBHOOK_PROXY` | in `dev/.env.github` | The smee.io channel `dev:webhooks` pulls from |
| `COLOC_WEBHOOK_TARGET` | `http://127.0.0.1:4100/api/github/webhook` | Where `dev:webhooks` delivers |
| `COLOC_PUBLIC_URL` | `http://localhost:5175` (!) | `dev:github-app` only: the site's address for GitHub's callbacks. Differs from the API's default, so pass it |

### A caretaker (`apps/agent`; it reads no file, set these in the shell)

| Variable | Default | Meaning |
|---|---|---|
| `COLOC_HOUSE_ID` | **required** | Which house this caretaker looks after (`sacre-coeur`, `atelier`) |
| `COLOC_AGENT_SECRET` | **required** | The house's key |
| `COLOC_API_URL` | `ws://localhost:4100/agent` | Must be `wss://` unless it is this machine |
| `COLOC_HOUSE_DOMAIN` | `coloc.localhost` | Rooms are served at `<room>.<this>` |
| `COLOC_PUBLIC_PORT`, `COLOC_PUBLIC_SCHEME` | `8000`, `http` | How visitors reach the proxy (80 and `https` in production) |
| `COLOC_PROXY_CONTAINER` | `coloc-traefik` | The proxy's container name; the caretaker plugs it into every room's network |
| `COLOC_PROXY_CONFIG_DIR` | `/tmp/coloc-agent/proxy` | Where route files go. `dev/docker-compose.yml` mounts this exact path into Traefik |
| `COLOC_ROUTE_SETTLE_MS` | `2000` | How long to wait for Traefik to follow a new route |
| `COLOC_WORKDIR` | `/tmp/coloc-agent` | Scratch space for clones and builds. Give each caretaker on one machine its own |
| `COLOC_USAGE_INTERVAL_MS` | `30000` | How often it samples CPU and memory |
| `COLOC_ALLOW_LOCAL_REPOS` | off | `1`: build from `file://` repos. **Development only** |

Every deployed app also receives `COLOC_ROOM`, `COLOC_HOUSE`, `COLOC_CITY`, `COLOC_COUNTRY`, `COLOC_LOGIN` and `COLOC_NAME` so it can
greet in its city's language. Those names are reserved: a room's secrets can't use them.

## When the core is down

"The core" is the database. If it stops (you quit Docker, `coloc-db` crashes), the product degrades instead of breaking:

- **The API stays up.** It opens its port before the database is ready, keeps trying to connect and migrate in the background
  (1 s, growing to 15 s between tries, for ever), and answers `503` with `{"ok":false,"code":"core_down", …}` on every route
  meanwhile. `GET /api/health` is the one to poll: `200 {"ok":true}` when the database answers, the same 503 otherwise. When
  Postgres is back the API serves again by itself, no restart. Code: `apps/api/src/core/`.
- **Caretakers** are closed politely (code 1013) and redial on their own; rooms that are already running keep running.
- **The website keeps you in the lobby.** A floating card says the city can't be reached, counts down to the next automatic try
  (2, 4, 8, 15, then every 30 s), and has **Try now** and **Hide**. Panels show "Waiting for the city…" and reload by
  themselves; typed messages are kept; nothing sends you to the login page. When the core returns the card says "Back online"
  and open streams reopen. Code: `apps/web/src/core.ts` (the logic and tests), `CoreStatus.vue`, `Waiting.vue`.
- **Try it:** stop Postgres (`docker stop coloc-db`) while the site is open, watch the card, then `docker start coloc-db`.
- **Pointing Vite at another API** (to test against a stand-in): `COLOC_DEV_API=http://127.0.0.1:4199 npm run dev:web`.
  Not `COLOC_API_URL`: that is the caretaker's address for the hub.

## Troubleshooting

The API and the website now stay up when the core (Postgres) is down: see [When the core is down](#when-the-core-is-down) below.

| What you see | Why | Do this |
|---|---|---|
| `npm run start -w @coloc/agent` prints `Error: connect ENOENT /var/run/docker.sock` and exits | Docker isn't running (on macOS that path is a link into Docker Desktop's folder) | Start Docker Desktop, wait for it to say it's running, start the caretaker again |
| The site shows a card, "The city can't be reached", and every page says "Waiting for the city…" | The API can't reach Postgres (Docker stopped, or `coloc-db` not running). The API stays up and answers 503 `core_down` | Start Docker, `npm run dev:proxy`, and wait: the card says "Back online" by itself and the pages reload. Nothing to restart |
| `npm run dev:seed` exits with `Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"` | Postgres isn't reachable on :5433 (the seed, unlike the API, needs it right now). The message hides the real cause (connection refused) | `npm run dev:proxy`, check `docker ps` shows `coloc-db`, try again. Or `COLOC_DATABASE_URL` points somewhere else |
| `Error: Missing environment variable COLOC_HOUSE_ID` (or `COLOC_AGENT_SECRET`) | The caretaker reads no file; you started it without its settings | Use the full command from step 7 or 8 |
| `EADDRINUSE` on 4100 | Another API is running (maybe yours, in another terminal) | Find it: `lsof -nP -iTCP:4100 -sTCP:LISTEN`. Stop it by its PID, and only if it's yours. Vite proxies to 4100, so don't move the API: free the port |
| Vite says `Port 5173 is in use, trying another one…` and opens 5174 | Something else holds 5173 | Free 5173, or choose a port on purpose with `--port N --strictPort` and set the API's `COLOC_PUBLIC_URL` to match. On the wrong port, login redirects and the lobby's live line (closed with code 4003) break |
| The lobby loads but nobody walks, "live line" errors in the console | The page's origin isn't `COLOC_PUBLIC_URL`'s origin | Open exactly the address you set (`localhost`, not `127.0.0.1`), or fix `COLOC_PUBLIC_URL` and restart the API |
| The city is empty or the page shows errors | The API isn't running, or Postgres wasn't seeded | Check terminal 2; run `npm run dev:seed` (API stopped), start the API |
| "Put it online" fails: `can't clone` or repo errors, in the tutorial | `COLOC_TUTORIAL_REPO` is the private GitHub URL, or isn't a committed local clone | Step 3's `file://$PWD` line, workshop caretaker started with `COLOC_ALLOW_LOCAL_REPOS=1`, and the sample committed on `main` |
| A deploy ends `failed` with `local file:// repos are only allowed in development` | The caretaker isn't running with `COLOC_ALLOW_LOCAL_REPOS=1` | Restart it with the variable (steps 7 and 8) |
| A deploy fails with `no such container` / network errors mentioning `coloc-traefik` | Traefik isn't running | `npm run dev:proxy`; `docker ps` must list `coloc-traefik` |
| Migrations: `relation … does not exist`, or the API starts on an older schema | You pulled new migrations and are running an old build | `npm run build:packages`, restart the API: it migrates on start. If the data is disposable, reset the database (above) |
| `Failed to resolve entry for package "@coloc/db"` in tests | `packages/db/dist` is missing or stale | `npm run build:packages` |
| `jib.coloc.localhost` doesn't open (browser says "can't find server") | Your system doesn't resolve `*.localhost` | Chrome, Firefox and curl do. If yours doesn't, add `127.0.0.1 jib.coloc.localhost` (one line per room) to `/etc/hosts` |
| `jib.coloc.localhost:8000` answers `404 page not found` | Traefik is up but has no route: the room isn't built yet, or the caretaker isn't running | Check the caretaker's log; `ls /tmp/coloc-agent/proxy` should list `sacre-coeur--jib-prod.yml` |
| Changed API or caretaker code and nothing changed | They run from `dist/` | `npm run build -w @coloc/api` (or `@coloc/agent`), restart it |
| Stale or odd behaviour right after `git pull` | Old `dist/` folders, or new dependencies | `npm ci`, `npm run build`, restart everything |
| `COLOC_SECRETS_KEY not set: rooms can't store secrets` at API start | `dev/.env.local` is missing or has no key | Step 3. The API still runs; only the Secrets tab fails |
| `dev/.env.local not found. Continuing without it.` | You haven't made the file | Step 3. The API still runs |
| Routes folder is root-owned (Linux), the caretaker can't write routes (`EACCES`) | Docker created `/tmp/coloc-agent/proxy` before you did | `sudo chown -R $USER /tmp/coloc-agent`, or make it first (step 4) |
| A room's memory-hog keeps restarting | That's `examples/memory-hog` working as designed | Redeploy `examples/hello` into that room, or reset the demo |
| A stray caretaker or API keeps running after you closed the terminal | Background process | `lsof -nP -iTCP:4100 -sTCP:LISTEN`, check the PID's folder with `lsof -p <pid> \| grep cwd`, stop only your own |

## Not for production (and what's different there)

- **Traefik has no Docker socket**, even in production: the caretaker writes its routes to `COLOC_PROXY_CONFIG_DIR`, mounted read-only into Traefik.
- **`COLOC_ALLOW_LOCAL_REPOS=1` is for development only.** Without it the caretaker refuses `file://` repos, which would let a flatmate build an image from any folder on the house server.
- **`COLOC_DEV_LOGIN=1` is for development only.** It lets anyone log in as anyone. Leave `COLOC_DEMO_RESET` off on any server you care about, or set `COLOC_ADMINS`.
- **The caretaker refuses a remote hub over plain `ws://`**: its first message carries the house secret.
- **Session cookies** are HttpOnly and SameSite=Lax, and `Secure` once `COLOC_PUBLIC_URL` is https. Only a SHA-256 of each session token is stored.
- **userns-remap** is set in the Docker daemon by `install.sh`, so root in a room isn't root on the host.
- **The caretaker's key:** only its SHA-256 is stored; shown once at house creation.

## How this guide was checked

On 12 Oct 2026, in a fresh `git clone` of commit `ffce382` under Node 22.23 and npm 10.9, these ran and passed:
`npm ci` (25 s), `npm run build` (15 s), `npm test` (306 tests then, 26 s) and `npm run licences:check` (11 s). The single-file and name-filter
test commands, the stale-`dist` test error, and the failures in the troubleshooting table for "Docker not running", "Postgres not
reachable" and "caretaker without settings" were run for real.
**Not run** (Docker is off on the machine that wrote this): steps 4 to 10, the isolation demo, the tutorial, and the GitHub App.
Their commands come from reading the code and the previous guide, and their "you should see" lines from the code's log statements.
If a step differs on your machine, fix this file in the same pull request.

## Sharing the city from a laptop (Vercel + a tunnel)

Until the real server exists, a teammate can try the city without building it: the site goes on Vercel, the API
(and Docker, the caretakers, everything else) stays on the laptop behind a Cloudflare quick tunnel.

```bash
npm run share
```

It opens the tunnel to the API on :4100, builds the site pointed at it, deploys it to the `la-coloc` Vercel project
(`https://la-coloc.vercel.app`), and keeps the tunnel open until Ctrl+C. Then start (or restart) the API with the two
lines it prints (`COLOC_PUBLIC_URL` for the site's address, `COLOC_WEB_ORIGIN` listing it and your own dev server).
A quick tunnel gets a new address each time it opens, so run `npm run share` again after a restart. Vercel forwards
`/api`, but not WebSockets: the site opens the lobby's socket straight to the tunnel with a one-minute pass from
`/api/lobby/ticket`. The GitHub App needs `https://la-coloc.vercel.app/api/auth/github/callback` among its callback
URLs. Projects that rooms put online still answer only on this laptop (`*.coloc.localhost`). Never turn on
`COLOC_DEV_LOGIN` while sharing: anyone could log in as anyone.
