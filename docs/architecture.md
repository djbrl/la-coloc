# Architecture

*Rewritten 16 Oct 2026 against the code, updated 17 Oct 2026 after the review fixes. The product's ideas:
[how-it-works.md](how-it-works.md). Words: [glossary.md](glossary.md). Every library is MIT, Apache, BSD, ISC or
OFL (contest Art. 6, checked by `npm run licences:check`).*

## The pieces

```
  Browser: the website (apps/web, Vue 3 + three.js)                GitHub (our GitHub App)
     │  HTTP /api  ·  live updates (SSE)                              │  webhooks: PR opened, review given,
     │  WebSocket /lobby-ws: the lobby's live line                    │  App installed (via smee in development)
     ▼                                                                ▼
  ┌──────────────────────────── API (apps/api, NestJS) ────────────────────────────┐
  │ login · houses · knocks · rooms · GitHub · notifications · chat · lobby · tut. │
  └───────┬──────────────────────────────────────────────────────┬─────────────────┘
          │ Drizzle (packages/db)                                 │ WebSocket /agent (packages/protocol)
          ▼                                                       ▼ the caretaker dials out; a house opens no port
      Postgres                                     Caretaker (apps/agent), one per house server
  (people, houses, rooms,                            │ Docker                  │ writes route files
   reviews, notifications)                           ▼                         ▼
                                            one container per room      Traefik sends each visitor
                                            (memory and CPU caps)       to the right room
```

| Piece | What it does | Where it runs |
|---|---|---|
| **Website** (`apps/web`) | The 3D city, the panels, the quest, the bell. Vue 3, Vite, three.js. Builds to static files | The browser |
| **API** (`apps/api`) | Login, every route, GitHub webhooks, the link to each caretaker, the lobby's live line. NestJS | One server (today: a laptop) |
| **Database** | Postgres. Tests use PGlite (Postgres in memory), so they need no Docker | Next to the API |
| **Caretaker** (`apps/agent`) | Builds each room's project with Docker, runs it with its limits, measures usage, reports back. Plain Node | Each house server |
| **Traefik** | The front door of a house server: sends `<room>.<house domain>` to the right container | Each house server, in Docker |
| **GitHub App** | Login, linking repos, reviewers on pull requests, previews, deploy on merge | GitHub |
| **Vercel + tunnel** | Only for `npm run share`: the site on Vercel, the API on a laptop behind a Cloudflare tunnel | Vercel, Cloudflare |

Choices worth saying to a jury:

- **The caretaker only dials out.** It opens a WebSocket to the API with its house's secret. The house server
  exposes no control port, so it works behind a home router and can't be used to reach the API. The API refuses that
  line to anyone who comes through Cloudflare (`cf-connecting-ip`, `cf-ray` or `cdn-loop` headers), so the tunnel
  that shares a laptop never offers it.
- **The caretaker never holds GitHub credentials.** For each build the API sends a short-lived token for that one repo.
- **Neither rooms nor Traefik get the Docker socket.** The caretaker writes one small route file per room and
  Traefik reads the folder. A broken-into room or proxy can't take over the server.
- **Rooms are sealed.** Each room is on its own internal Docker network (`coloc-sealed-<house>--<room>`): Traefik
  reaches it, and it reaches nothing, not the other rooms, the internet, or the machine (on Docker Desktop,
  `host.docker.internal` would lead to the laptop's database and API). A house can open its rooms to the internet
  with `COLOC_ROOM_INTERNET=1` (network `coloc-room-<house>--<room>`).

## How a push becomes a live room

1. You merge a pull request on GitHub. GitHub sends a webhook to `POST /api/github/webhook`; the API checks its
   signature (`apps/api/src/github/`). In development the webhook reaches your laptop through smee
   (`npm run dev:webhooks`).
2. The API finds the room the repo is linked to. In a strict house it checks the assigned reviewer approved.
3. It sends a `deploy` message to that house's caretaker over the WebSocket, with the repo, a one-hour GitHub
   token, the room's limits, its decrypted secrets and variables such as `COLOC_ROOM` and `COLOC_CITY`
   (`apps/api/src/rooms/room-deployer.ts`).
4. The caretaker (`apps/agent/src/deploy.ts`) clones the repo, builds the image from the repo's Dockerfile (one build
   at a time per house, `slots.ts`; with no network if `COLOC_BUILD_OFFLINE=1`) and starts a new container with its
   walls (`room-spec.ts`: memory and CPU caps, no extra rights, a read-only disk, its own sealed network, and user
   65534 unless the image picks a user other than root). It clones only `https://` repos; a `file://` folder only
   when `COLOC_ALLOW_LOCAL_REPOS` names it (in development, the quest's starter page).
5. It checks the new container answers, rewrites the room's route file so Traefik sends visitors to it, waits for
   Traefik to follow, then stops the old one. Nobody sees a gap.
6. At each step it sends a `deploy_status` message back. The API saves it, comments on the pull request, and pushes
   the change to open pages: the window lights up, fireworks go off. The room's address the caretaker reports is
   kept only if it is http(s) and `<room>.<house domain>` (or its preview's), so a caretaker can't put another
   site's link on a house page (`roomAddress` in `houses.service.ts`).

The same path builds a **preview** at `preview-<room>.<house domain>` while a pull request is open (never for forks),
and removes it when it closes. The quest and the room page use the same `deploy` message, started by a button
instead of a merge. Those have a brake: one deploy under way per room, and five by hand per person in ten minutes
(`RoomDeployer.brake`). Only the flatmate who lives in a room may change its repo, branch or folder, because a deploy
carries the room's secrets; the chef can still update and restart it. Every 30 seconds the caretaker sends each
room's CPU and memory, which feed the bill.

## The lobby's live line

- A WebSocket at `/lobby-ws` carries who is walking where, waves, and a one-word "look at your bell" to the person
  concerned. The page then asks the API for the details, so nothing private travels on the line.
- A city holds as many lobbies as it needs, 32 people each: a newcomer takes the first with room, so no page ever draws
  more than 32 people online. Visitors watch without taking a place. The head count stays per city, and a city with
  several lobbies shows a button to change (`apps/api/src/lobby/presence.ts`).
- Movement goes out ten times a second as one binary frame per lobby, 8 bytes per mover: a small number for who (their
  slot in the lobby, given in the JSON `snapshot` and `join`), x, z and heading. Joining, leaving and waves stay JSON.
- The city stream (`GET /api/city/stream`) says the whole city when it opens, then only the houses that changed. The
  API works that out once per change, at most once a second, however many pages listen, and not at all when none do.
- Only pages from our own site may connect: the API checks the page's origin against `COLOC_PUBLIC_URL` and the
  list in `COLOC_WEB_ORIGIN`. In development `npm run up` also sets `COLOC_DEV_ORIGINS=1`, which lets in any
  `http://localhost:<port>` page (Multiprise picks the port), but not while it shares the city, and never on an
  `https://` site. Logged-in people appear; visitors only watch.
- **When the site and the API are on different hosts** (the site on Vercel, the API behind a tunnel), Vercel forwards
  `/api` but not WebSockets, and the login cookie belongs to the site's host. So the page asks `GET /api/lobby/ticket`
  for a one-minute, single-use pass, opens the socket straight to the API, and sends the pass as its first message
  (never in the address, where tunnel logs would keep it; until then the socket is a visitor). The address comes from
  `VITE_LOBBY_WS`, set when the site is built (`apps/web/src/lobby/link.ts`, `apps/api/src/auth/auth.service.ts`).
- It also says "chat" to someone when a direct message reaches them; their page then fetches its conversations.
- Houses, the city, knock threads, and a city's room and board update through server-sent events (`…/stream`
  routes), a simpler one-way stream. A city's stream only says "chat" or "board"; each page then fetches with its own
  login, so what a person blocked stays hidden from them.
- On the shared site the quick tunnel holds those streams back, so the page asks every 4 seconds instead
  (`apps/web/src/stream.ts`): one poller per address, a tick skipped while the last answer is out or while the
  database is down, and an answer at once when the tab comes back into view.

## The chat

Every conversation is a channel in the `messages` table: `house:<id>`, `application:<id>`, `dm:<id>:<id>` (two
user ids, sorted, so a pair has one channel), `city:<City>` and `post:<id>` (a board post's replies). The rules
live in `apps/api/src/chat/` (`chat.service.ts`, `board.service.ts`): who reads and writes each channel, blocks,
reports, and an in-memory brake (`limiter.ts`, a sliding window per person; one API process, so that's enough).
The web's side is `apps/web/src/components/chat/` and `conversations.ts`.

## When the database is down

The API opens its port first and keeps trying to reach Postgres. Meanwhile every route except `GET /api/health`
answers `503 core_down`. The site recognises it, keeps you in the city with a card that retries, and recovers by
itself. Caretakers are asked to reconnect later; running rooms keep running. Code: `apps/api/src/core/`,
`apps/web/src/core.ts`.

## The database

The tables, in `packages/db/src/schema.ts`: `users`, `sessions`, `houses`, `rooms`, `memberships` (who lives where,
their place in the tontine), `deployments`, `fridge_notes` (house news), `usage_samples`, `applications` and `votes`
(knocks), `messages` (every chat: houses, knocks, direct, cities, board replies), `board_posts`, `blocks`,
`chat_reads` (how far you read a conversation), `reports`, `room_secrets`, `repos` (a GitHub repo linked to a room),
`github_installations` (who installed the GitHub App where, for the repo picker), `chores` (one pull request, one
reviewer), `bill_payments` and `notifications`. A month's bill is worked out from usage and
reviews when asked; it is not stored. Who is online lives only in the API's memory. Migrations are in
`packages/db/drizzle/`, and the API applies new ones when it starts.

## Where things live

```
apps/
  web/           the website
    src/lobby/       the 3D engine: Lobby.ts, streets (neighbourhood.ts), city looks (cityStyle.ts), passers-by, sounds
    src/components/  LobbyView.vue (the city screen), lobby/ (cards, panels, minimap, quest), bell/, room/, list/
    src/pages/       the list view's pages, login, and a style guide (development only)
    src/i18n.ts      English and French words
    public/          3D models (lobby/), install.sh
  api/src/       the API, one folder per area: auth, houses, doorbell (knocks), rooms, github, agents (caretakers),
                 notifications, chat (messages, city rooms, the board), lobby, tutorial (the quest), demo,
                 seed (the example city), core (database down)
  agent/src/     the caretaker: deploy.ts, docker.ts, room-spec.ts (the walls), slots.ts (builds take turns),
                 proxy.ts (route files), meter.ts
packages/
  protocol/      every message between the API and a caretaker, checked with zod
  domain/        pure rules: reviewer rotation, bill split, tontine turn, knock votes
  db/            tables and migrations
examples/        small apps to put in rooms: hello (the quest's starter page), ndaje, prix-marche, memory-hog
dev/             docker-compose.yml (Traefik and Postgres for a laptop), .env.example
scripts/         up.mjs (`npm run up`: everything at once), dev-keys.mjs (the laptop's own keys), share.mjs,
                 github-app.mjs, webhooks.mjs, isolation-demo.sh
docs/            these docs
```

A good hour of reading: `packages/protocol/src/index.ts` → `apps/agent/src/room-spec.ts` → `apps/agent/src/deploy.ts`
→ `apps/api/src/houses/houses.service.ts` → `packages/db/src/schema.ts` → `apps/web/src/components/lobby/HouseInside.vue`.

## Why these tools

- **TypeScript everywhere**, so each of us can read every part and explain it.
- **Vue 3 + Vite**, not a server-rendered framework: the site is static files.
- **NestJS**: its modules give the API a clear shape.
- **Node for the caretaker**, not Go: nobody on the team knew Go, and the jury tests that we know our code.
- **Traefik with route files**, not Docker labels: in tests, labels dropped a few requests during swaps and needed the
  Docker socket.
- **Postgres**, not Redis or MySQL: Redis is no longer permissive and MySQL is GPL.

## Not built yet

Planned at the start, not in the code. Each is on [TODO.md](../TODO.md) or was cut:

- The real server on Datacloud, HTTPS for rooms, and nothing yet serves the built site in production.
- A database per room (the "kitchen"), backups, disk limits and disk measurement.
- A job queue (pg-boss) and timed jobs: webhooks are handled straight away, and a few timers do the rest.
- Builds without a Dockerfile (Nixpacks), and gVisor for stronger walls.
- GitHub's Deployments panel (needs one more App permission).
- `bills` and `listings` tables (a free room's ad is a column on `rooms`). Teams are `room_teammates`, migration 0017.
- Real payments.
