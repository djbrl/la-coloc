# Install and run La Coloc

*Updated 17 Oct 2026. Start here if you have a laptop and no history. What the pieces are:
[architecture.md](architecture.md).*

**What you get:** the city in your browser, a real house (Sacré-Cœur) whose rooms are built and served by Docker on
your machine, and the workshop where the first-visit quest runs. **Time:** about 15 minutes, mostly Docker pulling
images the first time. Stuck? See [Troubleshooting](#troubleshooting).

## What you need

| Tool | Why | Without it |
|---|---|---|
| Node 22.9 or newer (`.nvmrc` says 22; `nvm install && nvm use`) | Everything | Nothing runs |
| Git | Cloning; the caretaker also clones the code it builds | Nothing runs |
| Docker Desktop (or Docker Engine on Linux) | Postgres, Traefik and every room | Install, build and tests still work; the city stays empty |
| `openssl` | Makes the key that encrypts room secrets | Use any 32 random bytes in base64 |
| A GitHub account | Only for your own development GitHub App (real login, reviews, deploy on merge, the quest's repo picker) | The dev login covers the rest |

`npm ci`, `npm run build`, `npm test` and `npm run licences:check` need no Docker.

## The short way: one command

After the first install (steps 1 to 4 below, once), everything starts with one command:

```bash
npm run up
```

and the website in a second terminal: `npm run dev:web` (open http://localhost:5175). In **Multiprise**, just press
Start on the project: it runs `apps/api`'s `dev` (this same launcher) and `apps/web`'s `dev` (the website), and
gives them their ports.

`npm run up` (`scripts/up.mjs`) builds what changed, starts the API at once, starts Docker Desktop if needed, then
Postgres and Traefik, both caretakers, the GitHub webhook relay (if `dev/.env.github` has a smee channel), and shares
the city on Vercel through a tunnel (if `cloudflared` and the Vercel CLI are installed; `COLOC_SHARE=0` turns that
off). Each line of its output is tagged with the piece it comes from (`[api]`, `[sacre-coeur]`, `[share]`…).

- **This laptop's own keys.** On its first run it makes a database password, the database address that uses it, and
  the development caretakers' key, and adds them to `dev/.env.local` (`COLOC_DB_PASSWORD`, `COLOC_DATABASE_URL`,
  `COLOC_DEV_AGENT_SECRET`). Then it sets that password on Postgres and that key on the two development houses
  (`scripts/dev-keys.mjs`, through `docker exec coloc-db psql`). Keep these lines; never commit them.
- **One at a time.** It writes `dev/.up.lock` and refuses to start while another launcher runs. It also refuses to
  start when the API's port is taken, and says which process holds it.
- **It restarts what dies:** after 5 s, then twice as long each time a piece dies again within a minute, up to 5
  minutes. If a build fails, it removes that package's `dist/`, so the next start builds it again.
- **Sharing heals itself.** `scripts/share.mjs` checks the tunnel every minute and stops when the tunnel closes or
  misses three checks in a row; `npm run up` then shares again, with a new tunnel and a new deploy.
- **Stopping:** Ctrl+C, Stop in Multiprise, or closing the terminal stops everything it started. Docker keeps
  running, so the database and the rooms stay up.

> **Sharing safely.** While `npm run up` shares the city, the internet reaches your API. So it starts the API with
> `COLOC_DEV_LOGIN=0` (or anyone could log in as anyone, admins included) and `COLOC_DEV_ORIGINS=0` (or any
> `localhost` page could open the lobby's line), whatever `dev/.env.local` says. It lists your own site in
> `COLOC_WEB_ORIGIN` instead (`http://localhost:5175`, plus Multiprise's web port). The API also ignores the dev login,
> the dev origins and the default dev admins on any site served over `https://`. While it shares, GitHub login sends
> people back to the Vercel site, yours included.

The rest of this page is the long way, piece by piece: useful to understand it, or when one piece misbehaves.

## The terminals

| Terminal | Runs | Port |
|---|---|---|
| 1 | Docker: Traefik and Postgres (started once, runs in the background) | 8000, 5433 |
| 2 | The API | 4100 |
| 3 | Sacré-Cœur's caretaker | none, it dials out |
| 4 | L'Atelier's caretaker (the quest's workshop) | none |
| 5 | The website | 5175 |
| 6 | Optional: the GitHub webhook relay (`npm run dev:webhooks`) | none |

## 1. Install and build

```bash
git clone https://github.com/Djbrl/la-coloc.git && cd la-coloc
npm ci
npm run build
```

`npm run build` builds the shared packages, then the caretaker, the API and the website. A "chunks are larger than
500 kB" warning is normal. The API and the caretaker run from their compiled `dist/` folders, so **build again after
you change their code** (see [the everyday loop](#the-everyday-loop)).

## 2. Your settings file

```bash
cp dev/.env.example dev/.env.local
echo "COLOC_SECRETS_KEY=$(openssl rand -base64 32)" >> dev/.env.local
echo "COLOC_TUTORIAL_REPO=file://$PWD" >> dev/.env.local
```

- The key encrypts room secrets.
- `COLOC_TUTORIAL_REPO` tells the quest to take its starter page (`examples/hello`) from **your clone**, because the
  GitHub repo is private and the caretaker has no GitHub credentials. It reads the clone's `main` branch, so the
  starter page you see is the one committed on your `main`.
- The template already turns on the dev login (`COLOC_DEV_LOGIN=1`) and the demo reset. **Never set the dev login on a
  real server.** The API ignores it anyway when `COLOC_PUBLIC_URL` is `https://`.
- `npm run up` adds this laptop's own keys to the file on its first run (see
  [the short way](#the-short-way-one-command)). On the long way, step 3 does it.

The file is git-ignored and read by the API's `npm run start` and by `npm run dev:seed`.

## 3. Terminal 1: Postgres and Traefik

Start Docker Desktop first. On Linux, run `mkdir -p /tmp/coloc-agent/proxy` first so the folder isn't owned by root.

```bash
npm run dev:proxy
```

`docker ps` should show `coloc-traefik` on port 8000 and `coloc-db` on 5433.

Postgres starts with the password in `dev/docker-compose.yml` (`coloc-dev-only`), and the seed gives the development
houses the key `dev-secret-change-me`. Both are printed in this public repo. Your rooms' code can reach your laptop's
ports, and while you share the city so can the internet, so give the laptop its own keys (what `npm run up` does on
its first run). With Postgres up, from the repo's root:

```bash
node -e 'import("./scripts/dev-keys.mjs").then((m) => console.log(m.secureDatabase(m.ensureDevKeys(".")) ?? "keys set"))'
```

It adds `COLOC_DB_PASSWORD`, `COLOC_DATABASE_URL` and `COLOC_DEV_AGENT_SECRET` to `dev/.env.local` (only the missing
ones) and sets the password on Postgres. If you skip it, everything still works with the old defaults, but only keep it
that way while nothing is shared. If it says it couldn't connect, Postgres is still starting: wait five seconds and run
it again.

## 4. Plant the example city

```bash
npm run dev:seed
```

It runs the migrations, then **wipes every table** and replants nine houses in eight cities, plus the hidden workshop.
Stop the API before running it again. If it fails with `Failed query: CREATE SCHEMA…` right after step 3, Postgres
isn't ready yet: wait five seconds and retry.

Only two houses are real (a caretaker on your machine runs them): **Sacré-Cœur** in Dakar (rooms `jib`, `awa`,
`moussa` and a free `room-4`) and **L'Atelier**, the workshop. The others are examples with made-up people.

## 5. Terminal 2: the API

```bash
npm run start -w @coloc/api
```

It reads `dev/.env.local` (and `dev/.env.github` if you made one), applies new migrations, and says
`[api] http://127.0.0.1:4100/api · agents on ws://127.0.0.1:4100/agent`. Warnings that GitHub isn't configured are
normal. Check: `curl -s http://127.0.0.1:4100/api/health` answers `{"ok":true}`.

## 6. Terminals 3 and 4: the caretakers

Sacré-Cœur:

Both need the house key the seed stored: `COLOC_DEV_AGENT_SECRET` from `dev/.env.local`, or `dev-secret-change-me`
if you skipped the keys in step 3.

```bash
KEY=$(sed -n 's/^COLOC_DEV_AGENT_SECRET=//p' dev/.env.local)
COLOC_HOUSE_ID=sacre-coeur COLOC_AGENT_SECRET=${KEY:-dev-secret-change-me} \
COLOC_USAGE_INTERVAL_MS=5000 \
  npm run caretaker -w @coloc/agent
```

L'Atelier (the quest needs it to put your page online). It may build from one folder on disk: your clone, the same
`file://` address as `COLOC_TUTORIAL_REPO` in step 2.

```bash
KEY=$(sed -n 's/^COLOC_DEV_AGENT_SECRET=//p' dev/.env.local)
COLOC_HOUSE_ID=atelier COLOC_AGENT_SECRET=${KEY:-dev-secret-change-me} \
COLOC_HOUSE_DOMAIN=atelier.coloc.localhost COLOC_WORKDIR=/tmp/coloc-agent-atelier \
COLOC_USAGE_INTERVAL_MS=5000 COLOC_ALLOW_LOCAL_REPOS=file://$PWD \
  npm run caretaker -w @coloc/agent
```

Each says `[link] connected to ws://localhost:4100/agent`, and the API logs `agent online`.

- **Rooms are sealed.** Each room runs on an internal Docker network (`coloc-sealed-<house>--<room>`): only Traefik
  reaches it, and it reaches nothing, not the internet and not your laptop. `COLOC_ROOM_INTERNET=1` opens a house's
  rooms to the internet (network `coloc-room-<house>--<room>`); a room moves on its next deploy.
- **Builds** run one at a time per house (`COLOC_BUILD_SLOTS` for more). They can still download packages;
  `COLOC_BUILD_OFFLINE=1` builds with no network at all, which breaks Dockerfiles that install anything.
- **Rooms run as nobody** (uid 65534) unless their image picks a user other than root.
- `COLOC_ALLOW_LOCAL_REPOS` lets a caretaker build from `file://` folders: a comma list of exact `file://` addresses,
  or `1` for any folder. **Development only.** The API never takes a `file://` address from a person anyway: only the
  quest's starter page uses one.

## 7. Terminal 5: the website

```bash
npm run dev:web
```

Open http://localhost:5175. Vite forwards `/api`, `/lobby-ws` and `/agent` (a caretaker's line) to the API, so the
browser stays on one address. The port is fixed: if 5175 is taken, Vite stops instead of picking another, because
the API's `COLOC_PUBLIC_URL` and the GitHub App's callback expect 5175.

## 8. Log in

Go to http://localhost:5175/login and choose the development login. Pick `jib` (chef of Sacré-Cœur, and an admin),
`awa`, `moussa` or `koffi`, or type a new name to be a newcomer. Use a private window to be two people at once.

- A **new name gets the quest** "Your first home". Your page goes online at `http://<name>.atelier.coloc.localhost:8000`
  (`<name>-home` if that room name is taken in another house, as for `jib`). Settings can restart the quest.
- **To knock:** log in as someone new, walk to Sacré-Cœur, knock on `room-4`; then log in as `jib` and `awa` in two
  other windows to vote.
- **To invite:** log in as `jib`, click a newcomer in the street, "Invite to my house". Their bell shows it.
- **Settings** (the gear): language, day / night, sounds, the list view, the quest, and for admins the demo reset.

Every address, live, is on **http://localhost:5175/dev/start.html** (development only). The main ones:

| What | Where |
|---|---|
| The city | http://localhost:5175 |
| Sacré-Cœur, inside | http://localhost:5175/?city=Dakar&in=house:sacre-coeur |
| The API | http://127.0.0.1:4100/api/city |
| A room's project | http://jib.coloc.localhost:8000 |
| The style guide | http://localhost:5175/styleguide |
| Postgres | `COLOC_DATABASE_URL` in `dev/.env.local` (`postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc` if you skipped the keys) |

## GitHub (optional)

Without it, the dev login works and GitHub features stay off. To turn them on, make your **own** development App:

```bash
npm run dev:github-app
```

Open http://localhost:4101, sign in to GitHub, confirm. It writes `dev/.env.github` and `dev/github-app.pem`
(both git-ignored). It uses `COLOC_PUBLIC_URL` for the callback (default `http://localhost:5175`).

Then, in terminal 6, **keep the webhook relay running**. Without it GitHub's events (pull requests, reviews, the App
being installed) never reach your laptop, so reviewers aren't picked and merges don't deploy:

```bash
npm run dev:webhooks
```

Restart the API so it reads the new keys, and install the App on a test repo you own. Reviews need a second GitHub
person living in a room. Known catch: smee can re-encode a webhook so its signature check fails (`401` in the relay's
log); a real server takes webhooks directly.

## Sharing the city from a laptop

Until the real server exists, `npm run share` lets a teammate try the city without installing anything. The site goes
on Vercel; the API, Docker and the caretakers stay on your laptop behind a Cloudflare quick tunnel.

You need `cloudflared` (`brew install cloudflared`) and the Vercel CLI logged in (`npx vercel login`). Then:

```bash
npm run share
```

1. It opens the tunnel to the API on :4100, builds the site pointed at it, deploys it to the `la-coloc` Vercel
   project, and keeps the tunnel open until Ctrl+C.
2. Restart the API with the line it prints: `COLOC_PUBLIC_URL=<the site>` and `COLOC_WEB_ORIGIN=<the site>,<your
   local site>` (`http://localhost:5175`).
3. Add `<the site>/api/auth/github/callback` to your GitHub App's callback URLs.

Vercel forwards `/api` but not WebSockets, so the site opens the lobby's socket straight to the tunnel and sends a
one-minute pass from `/api/lobby/ticket` as its first message. A quick tunnel gets a new address each time: run
`npm run share` again after a restart (`npm run up` does that by itself). Rooms' own addresses (`*.coloc.localhost`)
still only work on your laptop.

Because `COLOC_PUBLIC_URL` is then `https://`, the API ignores the dev login, the dev origins and the default dev
admins, whatever `dev/.env.local` says. Name your GitHub login in `COLOC_ADMINS` to keep the demo reset. Give the
laptop its own keys first (step 3): the tunnel puts your API on the internet. The caretakers' line (`/agent`) refuses
anyone who comes through the tunnel.

The site and the API change together: deploy the site again whenever you restart a newer API (`npm run up` does).

## The everyday loop

| You changed | Do this |
|---|---|
| Website code | Nothing: the page reloads |
| API code | `npm run build -w @coloc/api`, restart terminal 2 (or restart `npm run up`, which rebuilds what changed). (`npm run dev:api` rebuilds on save, but does **not** read `dev/.env.local`) |
| Caretaker code | `npm run build -w @coloc/agent`, restart terminals 3 and 4 (or `npm run dev:agent`, same settings) |
| `packages/*` | `npm run build:packages`, restart the API and caretakers |
| The database tables | Make a migration ([CONTRIBUTING](../CONTRIBUTING.md#tests-and-database-changes)), `npm run build:packages`, restart the API |
| After `git pull` | `npm ci` if `package-lock.json` changed, `npm run build`, restart everything |

## Tests

```bash
npm test
```

Builds the shared packages and runs every package's tests (669 on 17 Oct 2026, about a minute, no Docker). One package:
`npm test -w @coloc/api`. One file: `npm test -w @coloc/api -- src/houses/exchange.test.ts`. By name:
`npm test -w @coloc/domain -- -t "tontine"`. If you changed `packages/*`, run `npm run build:packages` first.
`npm run licences:check` must print `licences OK: no copyleft`.

## The isolation demo

With terminals 1 to 3 running:

```bash
scripts/isolation-demo.sh
```

It puts `examples/hello` in Jib's room and `examples/memory-hog` in Moussa's 128 MB room, then checks Jib's room for
45 seconds. Moussa's container runs out of memory and restarts; Jib's never misses a request. It ends with
`PASS: the walls held.` Afterwards, reset the demo city from settings.

## Resetting things

| I want to | Do this |
|---|---|
| Put the example city back, API running | Log in as `jib`, settings, "Reset the demo city" (at most every ten minutes) |
| Replant the database | Stop the API, `npm run dev:seed`, start the API |
| Throw the database away | `docker compose -f dev/docker-compose.yml down -v`, `npm run dev:proxy`, `npm run dev:seed` |
| Remove leftover room containers | `docker ps -a --filter label=coloc.room`, then `docker rm -f` what you don't want |

## Settings reference

**The API** (put them in `dev/.env.local`):

| Variable | Default | Meaning |
|---|---|---|
| `PORT`, `HOST` | `4100`, `127.0.0.1` | Where it listens |
| `COLOC_DATABASE_URL` | `postgres://coloc:coloc-dev-only@127.0.0.1:5433/coloc` | The database. `npm run up` writes one with this laptop's own password |
| `COLOC_DB_PASSWORD` | none | This laptop's database password, written by `npm run up`; it sets it on Postgres |
| `COLOC_PUBLIC_URL` | `http://localhost:5175` | The site's address. GitHub login returns here; the live line accepts this origin; `https://` makes cookies `Secure` and turns off the dev login, dev origins and default dev admins |
| `COLOC_WEB_ORIGIN` | `http://localhost:5175` | Other sites allowed to call the API and open the live line, comma-separated |
| `COLOC_SECRETS_KEY` | none | 32 bytes in base64; without it rooms can't store secrets |
| `COLOC_DEV_LOGIN` | off | `1`: log in as anyone. **Development only**; ignored on an `https://` site, forced off by `npm run up` while sharing |
| `COLOC_DEV_ORIGINS` | off (`npm run up` sets `1` when not sharing) | `1`: any `http://localhost:<port>` or `127.0.0.1` page may open the live line, for Multiprise's changing ports. **Development only**; ignored on an `https://` site, forced off while sharing |
| `COLOC_DEMO_RESET`, `COLOC_ADMINS` | off; `jib,Djbrl` with the dev login | The demo reset button, and who may press it (GitHub logins, such as `Djbrl`). Admins can also delete any board post or reply and read reports |
| `COLOC_DEV_AGENT_SECRET`, `COLOC_DEV_HOUSE_DOMAIN` | `dev-secret-change-me`, `coloc.localhost` | Read by the seed and the demo reset: the development houses' key (written by `npm run up`) and their domain |
| `COLOC_TUTORIAL_REPO`, `COLOC_TUTORIAL_PATH` | the GitHub repo, `examples/hello` | Where the quest's starter page comes from |
| `COLOC_GITHUB_*` | none | The GitHub App's keys, written by `npm run dev:github-app` |

**A caretaker** (it reads no file; set them in the shell):

| Variable | Default | Meaning |
|---|---|---|
| `COLOC_HOUSE_ID`, `COLOC_AGENT_SECRET` | **required** | Which house, and its key (in development, `COLOC_DEV_AGENT_SECRET` from `dev/.env.local`) |
| `COLOC_API_URL` | `ws://localhost:4100/agent` | The API; must be `wss://` unless it is this machine |
| `COLOC_HOUSE_DOMAIN` | `coloc.localhost` | Rooms answer at `<room>.<this>` |
| `COLOC_PUBLIC_PORT`, `COLOC_PUBLIC_SCHEME` | `8000`, `http` | How visitors reach Traefik |
| `COLOC_PROXY_CONFIG_DIR` | `/tmp/coloc-agent/proxy` | Where route files go (mounted into Traefik) |
| `COLOC_WORKDIR` | `/tmp/coloc-agent` | Scratch space; one per caretaker on a machine |
| `COLOC_USAGE_INTERVAL_MS` | `30000` | How often it measures CPU and memory |
| `COLOC_PROXY_CONTAINER`, `COLOC_ROUTE_SETTLE_MS` | `coloc-traefik`, `2000` | Traefik's container, and how long to wait for it to follow a new route |
| `COLOC_ROOM_INTERNET` | off: rooms are sealed | `1`: rooms can reach the internet (never the other rooms) |
| `COLOC_BUILD_OFFLINE` | off | `1`: builds get no network |
| `COLOC_BUILD_SLOTS` | `1` | How many builds run at once on this house |
| `COLOC_ALLOW_LOCAL_REPOS` | off | Build from `file://` folders: a comma list of exact addresses, or `1` for any. **Development only** |

**The launcher** (`npm run up`): `COLOC_SHARE=0` doesn't share; `COLOC_SHARE_SITE` is the Vercel site's address
(default `https://la-coloc.vercel.app`); `PORT` is the API's port (default 4100).

**The website:** `COLOC_DEV_API` points Vite's forwarding at another API (default `http://127.0.0.1:4100`).
`VITE_LOBBY_WS` (set by `npm run share`) is the live line's address when the API is on another host.

Every project in a room receives `COLOC_ROOM`, `COLOC_HOUSE`, `COLOC_CITY`, `COLOC_COUNTRY`, `COLOC_LOGIN` and
`COLOC_NAME`; a room's secrets can't use those names.

## Troubleshooting

| What you see | Why | Do this |
|---|---|---|
| A card says "The city can't be reached" | The API can't reach Postgres (Docker stopped) | Start Docker, `npm run dev:proxy`, wait: it says "Back online" by itself |
| Caretaker exits with `connect ENOENT /var/run/docker.sock` | Docker isn't running | Start Docker Desktop, then the caretaker |
| `Missing environment variable COLOC_HOUSE_ID` | The caretaker reads no file | Use the full command from step 6 |
| `npm run dev:seed`: `Failed query: CREATE SCHEMA…` | Postgres isn't reachable yet | `npm run dev:proxy`, wait a few seconds, retry |
| `EADDRINUSE` on 4100, or `port 4100 is taken` from `npm run up` | Another API is running | `lsof -nP -iTCP:4100 -sTCP:LISTEN`; stop it only if it's yours |
| `La Coloc already runs from another launcher` | Another `npm run up` (or Multiprise) holds `dev/.up.lock` | Stop that one first. A lock left by a launcher that died is ignored |
| "The city can't be reached" stays up although `coloc-db` runs | `dev/.env.local` has this laptop's password but Postgres still has the old one (the API takes the refusal as an outage and keeps retrying) | `npm run up` sets it; on the long way, run the command in step 3 again |
| `Port 5175 is already in use` | Another site is running (perhaps yours) | Use that one, or stop it if it's yours |
| Nobody walks; "live line" errors in the console | The page's address isn't `COLOC_PUBLIC_URL` | Open exactly that address (`localhost`, not `127.0.0.1`), or fix the setting |
| The quest's launch fails with a clone error, or "isn't allowed here" | `COLOC_TUTORIAL_REPO` isn't a committed local clone, or the workshop's caretaker doesn't have that same address in `COLOC_ALLOW_LOCAL_REPOS` | Step 2 and step 6 |
| A room's app can't reach an outside service | Rooms are sealed by default | Start that house's caretaker with `COLOC_ROOM_INTERNET=1` and deploy again |
| Reviews never get a reviewer; a merge doesn't deploy | The webhook relay isn't running | `npm run dev:webhooks` |
| A deploy fails mentioning `coloc-traefik` | Traefik isn't running | `npm run dev:proxy` |
| `jib.coloc.localhost:8000` says `404 page not found` | No route yet: not built, or the caretaker is off | Check its log; `ls /tmp/coloc-agent/proxy` should list `sacre-coeur--jib-prod.yml` |
| `*.coloc.localhost` doesn't open at all | Your system doesn't resolve `*.localhost` | Use Chrome, Firefox or curl, or add a line to `/etc/hosts` |
| Code changes have no effect (API, caretaker) | They run from `dist/` | Build that package and restart it |
| `Failed to resolve entry for package "@coloc/db"` in tests | Stale `packages/*/dist` | `npm run build:packages` |
| Linux: caretaker can't write routes (`EACCES`) | Docker made `/tmp/coloc-agent/proxy` as root | `sudo chown -R $USER /tmp/coloc-agent` |

## Development only

- `COLOC_DEV_LOGIN=1` lets anyone be anyone; `COLOC_ALLOW_LOCAL_REPOS=1` lets a room build from any folder on the
  server. Never on a real server. Leave `COLOC_DEMO_RESET` off there too, or set `COLOC_ADMINS`.
- Don't share the city with the old default keys (`coloc-dev-only`, `dev-secret-change-me`): they're in this public
  repo. `npm run up` replaces them on its first run; step 3 does it on the long way.
- The caretaker refuses a remote API over plain `ws://`, because its first message carries the house's key.
- Session cookies are HttpOnly and SameSite=Lax; only a hash of each session token and each house key is stored.
