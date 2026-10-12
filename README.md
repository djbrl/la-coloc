# La Coloc

**A city of dev houses.** Log in with GitHub, find a house with a free room, knock, and move in. A house is a server rented
together; everyone gets a **room** (an isolated, capped slice of it), and your repo is live the moment you push. The house splits
the bill by usage and pays part of the rent in **code reviews**.

Built for CADEV 2026: *an African exchange platform built for devs by devs.* Contest submission: **Sun 25 Oct 2026**; hard
deadline **Sat 31 Oct, 17:00 Dakar time** ([rules](docs/contest-rules.md)).

**New teammate? Do this:** [run it](docs/dev.md) (15 minutes) → read [CONTRIBUTING.md](CONTRIBUTING.md) → pick a task from
[TODO.md](TODO.md). The map of every doc is in [docs/README.md](docs/README.md).

## Quick start

Needs Node 22.9+ and Docker Desktop. The full, checked walkthrough (with what you should see at each step) is [docs/dev.md](docs/dev.md).

```bash
npm ci && npm run build                     # install and build; no Docker needed
cp dev/.env.example dev/.env.local          # then add the key and tutorial lines from docs/dev.md, step 3
npm run dev:proxy && npm run dev:seed       # Docker: Traefik on :8000 and Postgres on :5433, then plant the city
npm run start -w @coloc/api                 # the API on :4100
COLOC_HOUSE_ID=sacre-coeur COLOC_AGENT_SECRET=dev-secret-change-me COLOC_ALLOW_LOCAL_REPOS=1 npm run start -w @coloc/agent
npm run dev:web                             # the site on http://localhost:5173
```

Then open http://localhost:5173/login and use the development login. The tutorial needs a second caretaker (dev.md, step 8).

## What works today (12 Oct 2026)

All of this runs locally and is covered by tests and by the dated checks in [docs/build-notes.md](docs/build-notes.md).

- **Rooms:** deploy a repo into a room and it's built, started with its walls (memory and CPU caps, no capabilities, its own
  network), health-checked, swapped in with no downtime, and served at `http://<room>.coloc.localhost:8000`. A room that runs out
  of memory restarts alone and leaves a fridge note; its neighbours never notice (`scripts/isolation-demo.sh`). Every app is told
  where it lives (`COLOC_ROOM`, `COLOC_HOUSE`, `COLOC_CITY`…).
- **GitHub:** a GitHub App for login, chores by reviewer rotation, deploy on merge (a strict house waits for an approval) and PR
  previews. Needs your own development App (dev.md); without it, the dev login covers the rest.
- **The city:** a walkable 3D lobby per city, with a different look, local light and street life in each. Every house shows its
  rooms as lit windows, a crane while something builds, darkness when its caretaker is offline, and fireworks when a project
  goes live. The top line is live city news ("Dakar: 7 projects online, 2 reviews waiting"), "Where to?" is a map of Africa, and
  a list view shows the same data as plain pages. It works on phones.
- **Moving in:** the tutorial takes a newcomer from walking to a live project in a workshop house. After that: knock on a free
  room, show your work, talk with the house, and get voted in.
- **Living together:** the house chat, the fridge door, chores, the exchange ledger, the tontine's turn (a fortnight each, shown as
  faces) and the monthly bill. The bill splits by room size and CPU used, and each review done takes 500 FCFA off your line.
  Mobile-money operators are named per country. **Paying is a mock:** it marks your line paid and moves no money.
- **Renting a server:** a chef picks a size and gets a one-line install command; the house goes live when its caretaker phones in.
  `install.sh` has never run on a real server.
- **The demo city:** nine houses in eight cities, seeded with a month of life; admins can reset it (`COLOC_DEMO_RESET=1`, `COLOC_ADMINS`).

**Not yet:** real mobile-money payments, `install.sh` on a real server, HTTPS for rooms, French, a deployment on Datacloud (the
contest requires one), and teammates' commits. The list, with sizes: [TODO.md](TODO.md).

## Every address (development)

Open **http://localhost:5173/dev/start.html** while the dev server runs: it lists the site, the API, every house and its rooms
(live, from the city) and the tools. It is development only: production builds don't ship it. The short version:

| What | Where |
|---|---|
| The site and the lobby | http://localhost:5173 |
| A house, inside it | http://localhost:5173/?city=Dakar&in=house:sacre-coeur |
| The API | http://127.0.0.1:4100/api |
| A room, through Traefik | http://jib.coloc.localhost:8000 |
| The GitHub App setup page | http://localhost:4101 (`npm run dev:github-app`) |

Jib's machine runs the web on **5175** instead (`.claude/launch.json`); see [dev.md, step 9](docs/dev.md#9-terminal-5-the-web-app) for the two settings that change.

## What's in here

| Folder | What | Runs where |
|---|---|---|
| `apps/web` | Vue 3 + Vite + three.js: the lobby, the list view, house and room pages, the doorbell, login | the browser |
| `apps/api` | NestJS: HTTP API, the live lines, and the hub that talks to every house's caretaker | coloc.dev |
| `apps/agent` | Node: the caretaker on each house server. Builds repos, runs rooms in Docker, measures usage | each house server |
| `packages/protocol` | Messages between API and caretaker, validated with zod on both ends | shared |
| `packages/domain` | Pure house rules: reviewer rotation, bill split, reviews as rent, the tontine's turn | shared |
| `packages/db` | coloc.dev's database: Drizzle schema and SQL migrations (Postgres; PGlite in tests) | coloc.dev |
| `examples/` | Small apps to deploy: `hello` (the tutorial's page), `ndaje` (a shop with a mock mobile-money button), `prix-marche` (market prices), `memory-hog` (the flatmate from hell) | inside rooms |
| `dev/` | Local Traefik and Postgres (`docker-compose.yml`), the settings template (`.env.example`). Your `.env.local`, `.env.github` and `github-app.pem` live here, git-ignored | Docker, your laptop |
| `scripts/` | The GitHub App setup (`github-app.mjs`), the webhook relay (`webhooks.mjs`), the isolation demo (`isolation-demo.sh`) | your laptop |
| `docs/` | Product, architecture, install guide, contest records. Index: [docs/README.md](docs/README.md) | |
| `.github/` | CI (`workflows/ci.yml`), the pull request template, issue templates | GitHub |

## Checks

CI runs these four on every push and pull request; run them before you open one.

```bash
npm run build
```

```bash
npm test                # over 400 tests: domain rules, protocol, room walls, database, login, permissions, doorbell, chores, money, the lobby's logic
```

```bash
npm run licences:check  # fails if any dependency is copyleft (contest rule, Art. 6)
```

## Where to go next

- [docs/dev.md](docs/dev.md): install, run, reset, troubleshoot.
- [CONTRIBUTING.md](CONTRIBUTING.md): how we work (branches, commits, code and design rules, recipes).
- [TODO.md](TODO.md): what's left, by priority.
- [docs/README.md](docs/README.md): every doc, one line each.
- [docs/how-it-works.md](docs/how-it-works.md) and [docs/architecture.md](docs/architecture.md): the product and the stack.
