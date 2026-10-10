# La Coloc

A city of dev houses. Log in with GitHub, find a house with a free room, knock, and move in. A house is a server
rented together; everyone gets a **room** (an isolated, capped slice of it), and your repo is live the moment you push.
The house splits the bill by usage and pays part of the rent in **code reviews**.

Built for CADEV 2026: *an African exchange platform built for devs by devs.*

Product: [`docs/how-it-works.md`](docs/how-it-works.md) · Stack: [`docs/architecture.md`](docs/architecture.md) · Plan: [`docs/roadmap.md`](docs/roadmap.md) · Contest rules: [`docs/contest-rules.md`](docs/contest-rules.md)


## Every address

Open **http://localhost:5175/dev/start.html** once the dev server runs (development only; production builds don't ship it): it lists the site, the API, every house and its
rooms (live, from the city) and the development tools. The short version:

| What | Where |
|---|---|
| The site and the lobby | http://localhost:5175 |
| Your house, inside | http://localhost:5175/?city=Dakar&in=house:sacre-coeur |
| The API | http://127.0.0.1:4100/api |
| A room, through Traefik | http://jib.coloc.localhost:8000 |
| The GitHub App setup page | http://localhost:4101 (`npm run dev:github-app`) |

## What's in here

| Folder | What | Runs where |
|---|---|---|
| `apps/web` | Vue 3 + Vite: the city, house pages, the doorbell, login | browser |
| `apps/api` | NestJS: HTTP API + the hub that talks to every house's agent | coloc.dev |
| `apps/agent` | Node: the caretaker on each house server. Builds repos, runs rooms, measures usage | each house server |
| `packages/protocol` | Messages between API and agent, validated with zod on both ends | shared |
| `packages/domain` | Pure house rules: reviewer rotation, bill split, tontine line | shared |
| `packages/db` | coloc.dev's database: Drizzle schema + SQL migrations (Postgres; PGlite in tests) | coloc.dev |
| `examples/` | `hello` (the tutorial's page, greeting in the city's language), `ndaje` (a shop with a mock mobile-money button), `prix-marche` (market prices at Sandaga and Tilène), and `memory-hog` (the flatmate from hell) | rooms |
| `dev/` | Local Traefik (a house's front door) and Postgres (coloc.dev's database) | Docker |

## Status (10 10 2026)

Works locally, end to end:
- **Rooms:** deploy a repo into a room → built, started with its walls (RAM/CPU caps, no capabilities, own network),
  health-checked, swapped in with no downtime, served at `http://<room>.coloc.localhost:8000`. A room that runs out of
  memory restarts alone and leaves a fridge note. Every app is told where it lives (`COLOC_ROOM`, `COLOC_HOUSE`,
  `COLOC_CITY`…), so it can greet in its city's language.
- **GitHub:** the GitHub App, chores by rotation, deploy on merge (strict houses wait for an approval), PR previews.
- **The city:** a walkable 3D lobby per city, every house with its rooms, what's building, reviews waiting and knocks.
- **Moving in:** log in (GitHub, or the dev login), knock on a free room, talk with the house, get voted in.
- **Living together:** the house chat, the fridge door, chores and the exchange ledger, the tontine's turn (a
  fortnight each), and the monthly bill: split by room size and CPU, with each review done knocking 500 FCFA off your
  line, and mobile-money operators per country (paying is a mock for now).
- **The demo city:** seeded with a month of life; admins can reset it (`COLOC_DEMO_RESET=1`, `COLOC_ADMINS`).

Not yet: `install.sh` on a real server, real mobile-money payments (through an aggregator), French. See the roadmap.

## Run it locally

Needs Node 22+ and Docker. Full walkthrough with the isolation demo: [`docs/dev.md`](docs/dev.md).

```bash
npm install
npm run build
npm run dev:proxy                     # Traefik on :8000, Postgres on :5433
npm run dev:seed                      # the development city
COLOC_DEV_LOGIN=1 npm run start -w @coloc/api   # API on :4100
COLOC_HOUSE_ID=sacre-coeur COLOC_AGENT_SECRET=dev-secret-change-me COLOC_ALLOW_LOCAL_REPOS=1 npm run start -w @coloc/agent
npm run dev:web                       # house page on :5173
```

## Checks

```bash
npm test                # unit tests: domain rules, protocol, room walls, database, login, permissions, doorbell, chores
npm run licences:check  # fails if any dependency is copyleft (contest rule)
```
