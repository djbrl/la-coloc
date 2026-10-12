# La Coloc: stack & architecture

*02 10 2026, first pass; corrected against the code on 12 10 2026. Product: [how-it-works.md](how-it-works.md). Every library below is MIT/Apache/BSD/ISC (Art. 6).*

> **As of 12 10 2026 (commit `ffce382`).** This is the design we set on 02 10, and most of it was built as written: three programs, a
> caretaker that only dials out, rooms with walls, routes in files, zero-downtime swaps, the GitHub App. Where the code went a
> different way, the text below says so in an *"As built"* note, and the section ["What differs from the plan"](#what-differs-from-the-plan-12-10-2026)
> lists everything that is planned but not built. For how to work in the code, read [CONTRIBUTING.md](../CONTRIBUTING.md#1-the-10-minute-orientation)
> first; for what's left, [TODO.md](../TODO.md).

## Plain-language version (read this first)
- **GitHub** = the archive where everyone's code lives.
- **The website (coloc.dev, Vue 3)** = the letting agency's shop window: sign in, house page, floor plan, bill. Screens only.
- **The API (NestJS), which includes the hub** = the agency's counter, switchboard and back office. GitHub "rings" it when something happens (a PR is opened…). Keeps a permanent phone line open to every building's caretaker, and does the slow work in the background (pick reviewers, order deploys, compute bills, post fridge notes).
- **The agent** = the caretaker living in each building (the chef's server). The only one with the keys. Follows the hub's orders and reports back. It phones the agency itself, so the building never leaves a door open.
- **Docker** builds the rooms (sealed boxes with size limits). **Traefik** is the receptionist sending visitors to the right room. **Postgres** is the kitchen (a database, one shelf per flatmate). *(Today Postgres only holds coloc.dev's own data; the per-room kitchen isn't built.)*
- **TypeScript everywhere** so every teammate can read every part, and explain it to the jury.

## Three programs

| Program | Runs where | Job | Stack |
|---|---|---|---|
| **web** | coloc.dev (a Datacloud VPS) | The city (a walkable 3D lobby), house, room and knock pages, the list view. Calls the API | **Vue 3 + Vite** + TypeScript, Vue Router, three.js (all MIT). Built to static files. *As built: no Pinia, no Tailwind (plain CSS tokens in `style.css`); and nothing serves the build yet: the API doesn't, see [TODO.md](../TODO.md) M1* |
| **api** (includes the hub) | same VPS | GitHub login, all routes, GitHub webhooks, the WebSocket link to every agent, the lobby's live line | **NestJS** + TypeScript (MIT): WebSocket gateways (`ws` adapter) for agents and the lobby, **Drizzle** (Apache-2.0) on Postgres. *As built: no job queue (pg-boss) and no `@nestjs/schedule`; webhooks are handled in the request, and a few `setInterval` timers do the rest* |
| **agent** | each house server | Creates rooms, builds and deploys, measures usage. *(The per-room "kitchen" database is not built.)* | **TypeScript on Node** (decided 02 10 2026): `dockerode` (Apache-2.0), `ws` (MIT), run by systemd; install.sh installs Node (MIT). Builds from the repo's Dockerfile only (no Nixpacks). **Go** only if the agent's owner already knew it: nobody did, so it stayed Node |

On each house server, besides the agent: **Docker Engine** (Apache-2.0), **Traefik** (MIT) as the front door with
automatic HTTPS *(as built: plain HTTP on the `web` entrypoint; HTTPS for rooms is [TODO.md](../TODO.md) M3)*, and the room containers. *(The planned per-house Postgres "kitchen" container isn't built.)*

Why not Vercel: the API's hub part needs long-lived WebSocket connections. Hosting coloc.dev on Datacloud also
covers the contest's required purchase on its own.

## Key design choices (say these to the jury)

- **The agent only dials out.** It opens a WebSocket *to* the hub; the house server exposes no control port.
  Works behind NAT, and a stolen house can't be used to attack coloc.dev. One secret token per agent, set at install.
- **The agent never holds GitHub credentials.** For each build, the hub sends a short-lived GitHub App installation
  token (expires in 1h) scoped to that one repo.
- **Rooms never get the Docker socket, and neither does the proxy.** Only the agent has it. Traefik sits on every
  room's network, so it reads its routes from files the agent writes instead of watching Docker: a compromised proxy
  can't take over the house.
- **Root in a room ≠ root on the host:** Docker's `userns-remap`, set by the install script.
- **GitHub is the source of truth for code.** The plan was to back up only the kitchen DB and volumes. *(As built: no backups exist yet.)*
- **Review gate without admin rights:** coloc doesn't touch branch protection. On merge, it deploys and records
  whether a flatmate approved the PR; unreviewed deploys get a fridge note (house rule: strict mode refuses them).
- **Native GitHub UI where possible:** reviewer requests, PR comments, and the **Deployments API** (the PR shows
  "deployed to jib.sacre-coeur.coloc.dev" natively).

## A room, concretely (what the agent asks Docker for)

```
network:   room-jib (own bridge; Traefik is the only other member)
container: image built from the repo
  Memory 2 GB · NanoCPUs 1.0 · PidsLimit 256
  CapDrop ALL · no-new-privileges · ReadonlyRootfs + tmpfs /tmp
  route:   a file the agent writes for Traefik: Host(`jib.sacre-coeur.coloc.dev`) → this container
  env:     room secrets + COLOC_ROOM, COLOC_HOUSE, COLOC_CITY… (not built: KITCHEN_URL, a DB per room)
not built: Runtime "runsc" (gVisor) for houses with strangers
```
Memory, CPU, processes, capabilities, the read-only root and the network are exactly what `apps/agent/src/room-spec.ts` sets (the numbers
come from the room's size). Disk: hard per-room quotas need XFS project quotas, which is a stretch goal. MVP measures disk use and leaves a fridge note
*(as built: memory and CPU are measured; disk isn't yet)*.

## The main flow: push → live

1. GitHub → **api** `POST /api/github/webhook` (verify the signature) → handle it. *(As built: handled in the request, no queue.)*
2. **hub**: PR opened → pick a reviewer (rotation), comment, request the review, order a **preview** build.
3. hub → agent over WebSocket: `build {repo, sha, token, room, kind: preview}`.
4. **agent**: clone with the token → `docker build` (the repo's Dockerfile; *Nixpacks is not built*) → start the new
   container → health check → rewrite the room's route file to point at it → wait for Traefik to reload → stop the
   old one (zero downtime: nobody is sent to it any more) → report back.
5. Merge → same thing with `kind: prod`. If the health check fails: keep the old container and report a failed deploy.
   *Built 09 10 2026 (`apps/api/src/github/deploys.service.ts`): a PR merged into the default branch deploys into the
   author's room; a strict house needs the assigned flatmate's approval (their latest review counts). For now the
   result is a PR comment; GitHub's Deployments panel needs the `deployments: write` permission added to the App.*
6. hub → GitHub Deployments API + dashboard live update (server-sent events). *(As built: the live update works; the Deployments API call isn't made yet, see [TODO.md](../TODO.md) S4.)*

Every 30s the agent sends `docker stats` per room → `usage_samples` → monthly bill split.

## Repo structure (monorepo)

*As built, 12 10 2026.* (The 02 10 plan had one folder per domain concept; the code settled on this.)

```
la-coloc/
├─ apps/
│  ├─ web/                    Vue 3 + Vite + three.js
│  │  ├─ src/lobby/           the 3D city: Lobby.ts (engine), neighbourhood.ts (streets), cityStyle.ts, path.ts, windows.ts, sound.ts…
│  │  ├─ src/components/      LobbyView.vue (the lobby screen); lobby/ (cards, panels, tutorial); list/ + pages/ (the list view); room/
│  │  ├─ src/style.css        design tokens, light and dark
│  │  ├─ public/              install.sh and the 3D models (lobby/)
│  │  └─ dev/start.html       a development-only page listing every address
│  ├─ api/                    NestJS, one folder per area in src/:
│  │                          auth · houses (city, houses, bill, money) · doorbell (knocks, votes, chat) · rooms (deploy, secrets)
│  │                          github (webhooks, chores, deploys, previews) · agents (WebSocket gateway, registry, logs)
│  │                          lobby (live presence) · tutorial · demo (reset) · seed (the development city) · db
│  └─ agent/                  the caretaker (TypeScript, Node)
│     └─ src/                 index.ts (commands) · link.ts (WebSocket to the hub) · git.ts · docker.ts · room-spec.ts (the walls)
│                             deploy.ts (swap, health check) · proxy.ts (route files) · meter.ts (usage) · events.ts (OOM, crashes)
├─ packages/
│  ├─ protocol/               hub ⇄ caretaker messages (zod)
│  ├─ domain/                 pure rules: reviewer rotation, bill split, reviews as rent, tontine turn, admission votes
│  └─ db/                     Drizzle schema + SQL migrations (PGlite in tests)
├─ examples/                  hello, ndaje, prix-marche, memory-hog: small apps to put in rooms
├─ dev/                       docker-compose.yml (Traefik + Postgres), .env.example
├─ scripts/                   github-app.mjs, webhooks.mjs, isolation-demo.sh
└─ docs/                      this folder; index in README.md
```

## Data model (Postgres, on coloc.dev)

*Built 08 10 2026 in `packages/db/src/schema.ts`: `users` · `sessions` · `houses` (status making/live, `demo` flag,
agent secret hash) · `rooms` (occupant, limits, status, project, ad) · `memberships` (role, tontine position) ·
`deployments` · `fridge_notes` · `usage_samples` · `applications` + `votes` (the doorbell) · `messages` (house channel
and doorbell threads) · `repos` (a GitHub repo linked to a room) · `chores` (one PR, one reviewer). The plan below
remains the target. As built, the tables are exactly `users`, `sessions`, `houses`, `rooms`, `memberships`, `deployments`, `fridge_notes`,
`usage_samples`, `applications`, `votes`, `messages`, `room_secrets`, `repos`, `chores` and `bill_payments`. There is no `bills`/`bill_lines`
table (a month's bill is computed from usage and chores when asked, and `bill_payments` records who marked their line paid), no `listings`
(a free room's ad is a column on `rooms`), no `channels` (`messages.channel` is a text key), and no `room_members` (team rooms aren't built).*


`users` · `houses` (chef, server IP, agent token hash, size) · `memberships` (role, room size, tontine position,
status) · `rooms` (repo, subdomain, limits, current deployment) · `deployments` (sha, PR, prod/preview, status,
approved_by) · `chores` (PR, assignee, due, done/skipped) · `usage_samples` · `bills` + `bill_lines` (share,
amount, Wave link, paid_at) · `fridge_notes` · `listings` + `applications` + `votes` · `channels` (one per house,
one per application) + `messages` (author, body, at, reported) · `room_members` (who can deploy to a room: one
person, or several for a team room). The exchange ledger is a view over `chores`, not a table.
Presence (who's online, where) lives in memory on the API: it's live-only and rebuilt on reconnect.

## Build order (history)

*The 02 10 order; kept because it explains why things exist. What's left now is in [TODO.md](../TODO.md).*

1. **Done 02 10:** push to a repo → it's live in a room with limits, zero-downtime swaps, isolation demo, live house page.
2. **Week 1 (done by 09 10):** Postgres, GitHub login, multi-house API, the city and house profiles.
3. **Week 2 (mostly done by 10 10):** GitHub App (reviews, deploy on merge, previews), knock → doorbell thread → vote → move in, house channel, presence. **Not done:** a real server.
4. **Week 3:** the exchange ledger, reviews as rent, the tontine's turn and the bill are done; hardening, Datacloud, a seeded city with real people, the demo video are not.
**Cut first if late:** see [roadmap.md](roadmap.md). Never the city, the doorbell, the house channel or reviews.

## Who owns what
The 02 10 proposal (one person each for web, infra and backend) is replaced by the areas table in
[CONTRIBUTING.md](../CONTRIBUTING.md#areas-and-owners), which Jib fills in.

## What differs from the plan (12 10 2026)

Planned in the notes above, **not built**. Each is either on [TODO.md](../TODO.md) or a deliberate cut:

- A **per-room "kitchen" database** (a shelf of a shared Postgres per room) and its `KITCHEN_URL`.
- A **job queue** (pg-boss) and cron jobs; **Nixpacks** builds (a repo needs a Dockerfile); **gVisor**; **disk quotas and disk measurement**.
- **GitHub's Deployments panel** (needs one more App permission): a merged PR gets a comment instead.
- **Team rooms**, **reporting and muting**, **leaving and eviction** beyond emptying a room.
- The **`bills`, `listings`, `channels` and `room_members` tables**, and `install/install.sh` at that path (it is `apps/web/public/install.sh`, so the site can serve it at `/install.sh`; never run on a real server).
- **Pinia and Tailwind** in the web app; **serving the web build from the API**.
- **Real mobile-money payments**: the bill's "pay" is a mock.

Built, and not in the original plan: the walkable 3D lobby, the tutorial and its workshop house, live presence, the list view, procedural neighbourhoods
per city, the demo reset, reviews as rent, and renting a server from the lobby.

## Why not Go (by default)
Go's advantages for the agent: single static binary, Docker's own language/SDK, ~15 MB RAM instead of Node's ~60 MB.
But **nobody on the team knows it yet**, and the jury scores the team's command of its own code (30%). An agent
written in an unfamiliar language with AI help is exactly what they'll probe. TypeScript everywhere = one language,
shared types between web, hub and agent, and everyone can read every part.
Avoid **Bun's** `--compile` (it embeds JavaScriptCore, which is LGPL) and **PyInstaller** (GPL with exception, not worth explaining).

## Backend in detail (02 10 2026)
"Backend" = the NestJS API (hub included) + the coloc.dev database. The agent lives on the other side, in each house.

**As built (12 10 2026):** the routes the API really serves, from the controllers in `apps/api/src`. Everything is under `/api`; the two WebSocket
gateways are at `/agent` (caretakers) and `/lobby-ws` (the lobby's live line). The 02 10 plan below is kept for the reasoning.

| Area | Routes |
|---|---|
| Login | `GET /auth/config` · `GET /auth/github`, `GET /auth/github/callback` · `POST /auth/dev-login` (dev only) · `POST /auth/logout` · `GET`, `PATCH /me` |
| City | `GET /city` · `GET /city/stream` (SSE) · `POST /city/houses` (start a coloc on a free plot) |
| A house | `GET /houses/:id` · `GET /houses/:id/stream` (SSE) · `POST /houses/:id/server` (rent: returns the install command) · `PATCH /houses/:id/rules` · `POST /houses/:id/bill/paid` (a mock) · `POST /houses/:id/rooms/:room/empty` |
| The doorbell | `POST /houses/:id/knock` · `POST /houses/:id/messages` (house channel) · `GET /applications/:id` · `GET /applications/:id/stream` (SSE) · `POST /applications/:id/messages`, `/vote`, `/withdraw` |
| A room | `GET /houses/:id/rooms/:room/manage` · `PATCH …/settings` · `PUT`, `DELETE …/secrets/:name` · `POST …/deploy`, `/redeploy`, `/restart` · `GET …/logs` |
| GitHub | `POST /github/webhook` (signature checked) |
| Tutorial and demo | `GET /tutorial` · `POST /tutorial/room`, `/deploy`, `/reset` · `POST /demo/reset` (admins, when enabled) |

**Planned on 02 10, not built:** `/houses/:id/invites`, `/messages/:id/report`, a pg-boss job queue, and the monthly and fortnightly cron jobs (the bill and the
tontine's turn are computed from the calendar when asked: `apps/api/src/houses/money.ts`). The hub's messages are in
[packages/protocol](../packages/protocol/src/index.ts): `deploy`, `remove_room`, `restart_room`, `remove_preview` and `get_logs` one way;
`hello`, `deploy_status`, `usage`, `room_event`, `rooms_snapshot` and `logs` the other (no `create_room`, `pause_room` or `create_kitchen_shelf`).

**The 02 10 plan:**
**API routes (NestJS controllers)**
`/api/auth/github` login · `POST /api/houses` rent a flat → returns the install command with the agent's secret ·
`GET /api/houses/:id` house page data · `GET /api/houses/:id/events` live updates (server-sent events) ·
`POST /api/houses/:id/invites` · `POST /api/houses/:id/rooms` move in with a repo · `PATCH /api/rooms/:id/secrets` ·
`POST /api/rooms/:id/restart` · `POST /api/github/webhook` (GitHub's notifications, signature checked, then queued) ·
`GET /api/city` every house with its rooms, ads and presence · `GET /api/city/stream` live presence + room changes ·
`POST /api/houses/:id/knock` opens an application thread · `POST /api/applications/:id/votes` ·
`GET|POST /api/channels/:id/messages` (new messages also arrive on the house's live stream) · `POST /api/messages/:id/report`.

**Hub jobs** (pg-boss): `pr.opened` (pick reviewer, comment, request review, order preview) · `pr.closed` (remove preview in 24h) ·
`main.pushed` (order prod deploy, note if unreviewed) · `review.submitted` (chore done) · `chore.deadline` (fridge note, tontine penalty) ·
`usage.ingest` · `bill.monthly` (cron, 1st of month) · `tontine.rotate` (cron, every 2 weeks) · `agent.offline` (house shown offline).

**Hub ⇄ agent messages**
hub → agent: `create_room` · `deploy {room, repo, sha, token, kind}` · `remove_preview` · `pause_room` · `remove_room` · `create_kitchen_shelf`
agent → hub: `hello {agentSecret}` · `deploy_status {building|live|failed, logs}` · `usage {room, cpu, ram, disk, net}` · `room_health`

**Traefik**: the reverse proxy. Watches a folder of route files (one per room) that the agent writes, and reloads within
milliseconds. Decided 02 10 2026 after testing: routing by Docker labels dropped a few requests during swaps (Traefik
learns that a container stopped a moment too late) and needed the Docker socket. Gets HTTPS certificates automatically. Alternatives: Caddy (Apache-2.0), Nginx (needs config reloads).

## Decision: Vue 3 + NestJS (02 10 2026, Jib)
Replaces Next.js + a separate hub. Both MIT. Nest's modules give a clear structure the jury can read (30%), and the hub
folds into the API: **two programs on coloc.dev instead of three** (web + api), plus the agent on each house.
Front = **plain Vue 3 + Vite**, not Nuxt (changed same day): everything is behind a login, so server rendering buys nothing,
and the front becomes static files (no extra server process). Lost: per-page link previews (OG tags) for shared links.
Fix: static OG tags on the landing page, or a tiny Nest route for public house/listing previews. The agent stays **plain Node**:
Nest is too heavy for the small program that shares the house's RAM. Avoid `@nestjs/bullmq` unless using Valkey,
because BullMQ needs Redis, and Redis isn't permissive anymore.

## Decision: the city, and chat without new infrastructure (02 10 2026, Jib)
The product is now a city of houses ([how-it-works.md](how-it-works.md)): a map, house profiles, knocking, a doorbell
thread per application and a channel per house. House profiles become shareable, so the "everything is behind a login"
argument above no longer holds for them: they get OG tags from the small Nest route already planned for public previews.
Chat reuses what exists: messages are posted over HTTP and pushed over the server-sent-events stream the house page
already uses, stored in Postgres. No socket.io, no chat service. Two surfaces only (house channel, doorbell thread):
no DMs, so it can't grow into a Discord clone. Later (Q3 2027), the map can become a walkable avatar lobby
(three.js or PixiJS + Colyseus, MIT) on the same data.
