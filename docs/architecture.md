# La Coloc: stack & architecture

*02 10 2026. First pass. Product: [how-it-works.md](how-it-works.md). Every library below is MIT/Apache/BSD/ISC (Art. 6).*

## Plain-language version (read this first)
- **GitHub** = the archive where everyone's code lives.
- **The website (coloc.dev, Vue 3)** = the letting agency's shop window: sign in, house page, floor plan, bill. Screens only.
- **The API (NestJS), which includes the hub** = the agency's counter, switchboard and back office. GitHub "rings" it when something happens (a PR is opened…). Keeps a permanent phone line open to every building's caretaker, and does the slow work in the background (pick reviewers, order deploys, compute bills, post fridge notes).
- **The agent** = the caretaker living in each building (the chef's server). The only one with the keys. Follows the hub's orders and reports back. It phones the agency itself, so the building never leaves a door open.
- **Docker** builds the rooms (sealed boxes with size limits). **Traefik** is the receptionist sending visitors to the right room. **Postgres** is the kitchen (a database, one shelf per flatmate).
- **TypeScript everywhere** so every teammate can read every part, and explain it to the jury.

## Three programs

| Program | Runs where | Job | Stack |
|---|---|---|---|
| **web** | coloc.dev (a Datacloud VPS) | Screens only: dashboard, house page + floor plan, listings. Calls the API | **Vue 3 + Vite** + TypeScript, Vue Router, Pinia, Tailwind (all MIT). Built to static files, served by the API's server |
| **api** (includes the hub) | same VPS | GitHub login, all routes, GitHub webhooks, the WebSocket link to every agent, background jobs | **NestJS** + TypeScript (MIT): a WebSocket gateway (`ws` adapter) for agents, `@nestjs/schedule` for timers, pg-boss for jobs (no Redis), Drizzle or Prisma (Apache-2.0), Postgres |
| **agent** | each house server | Creates rooms, builds and deploys, measures usage, manages the kitchen DB | **TypeScript on Node** (default, decided 02 10 2026): `dockerode` (Apache-2.0), `ws` (MIT), run by systemd; install.sh installs Node (MIT). **Go** only if the agent's owner already knows it (static binary, official Docker SDK) |

On each house server, besides the agent: **Docker Engine** (Apache-2.0), **Traefik** (MIT) as the front door with
automatic HTTPS, one **Postgres** container as the kitchen, and the room containers.

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
- **GitHub is the source of truth for code.** Backups only cover the kitchen DB and volumes.
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
  env:     room secrets + KITCHEN_URL (its own DB and role only)
optional:  Runtime "runsc" (gVisor) for houses with strangers
```
Disk: hard per-room quotas need XFS project quotas, which is a stretch goal. MVP measures disk use and leaves a fridge note.

## The main flow: push → live

1. GitHub → **api** `POST /github/webhook` (verify the signature) → enqueue a job.
2. **hub** job: PR opened → pick a reviewer (rotation), comment, request the review, order a **preview** build.
3. hub → agent over WebSocket: `build {repo, sha, token, room, kind: preview}`.
4. **agent**: clone with the token → `docker build` (Dockerfile, or Nixpacks (MIT) if there's none) → start the new
   container → health check → rewrite the room's route file to point at it → wait for Traefik to reload → stop the
   old one (zero downtime: nobody is sent to it any more) → report back.
5. Merge → same thing with `kind: prod`. If the health check fails: keep the old container and report a failed deploy.
6. hub → GitHub Deployments API + dashboard live update (server-sent events).

Every 30s the agent sends `docker stats` per room → `usage_samples` → monthly bill split.

## Repo structure (monorepo)

```
coloc/
├─ apps/
│  ├─ web/                    Vue 3 + Vite (screens only, static build)
│  │  ├─ pages/city/          the city map: every house, free rooms, presence
│  │  ├─ pages/house/         house profile + floor plan, house channel, fridge, bill
│  │  ├─ pages/doorbell/      knock + application thread + vote
│  │  └─ components/floorplan/   Jib's illustrated SVG, rooms animated by live status
│  └─ api/                    NestJS, one module per domain:
│     │                       auth · city · houses · rooms · github (webhooks + bot) · agents (WebSocket gateway)
│     │                       messages · applications · chores · ledger · tontine · billing · fridge
│     ├─ agents/              connections, auth, command dispatch
│     └─ jobs/                on-pr-opened, on-merge, sample-usage, monthly-bill, chore-deadlines
├─ apps/agent/               TypeScript (or Go, see stack)
│  └─ src/
│     ├─ link/                WebSocket to hub, reconnects, message signing
│     ├─ rooms/               networks + containers + limits
│     ├─ build/               git clone + docker build / nixpacks
│     ├─ deploy/              swap, health check, rollback, previews
│     ├─ kitchen/             per-room DB + role in the shared Postgres
│     └─ meter/               stats sampling
├─ packages/
│  ├─ db/                     Drizzle schema + migrations
│  ├─ protocol/               hub ⇄ agent messages (shared TS types; JSON Schema if the agent is in Go)
│  └─ domain/                 pure logic: reviewer rotation, tontine order, bill split. Heavily unit-tested
├─ install/install.sh         chef runs this: Docker + userns-remap, Traefik, kitchen, agent
└─ docs/                      architecture.md, licences.md, ai-usage.md (contest declarations)
```

## Data model (Postgres, on coloc.dev)

*Built 08 10 2026 in `packages/db/src/schema.ts`: `users` · `sessions` · `houses` (status making/live, `demo` flag,
agent secret hash) · `rooms` (occupant, limits, status, project, ad) · `memberships` (role, tontine position) ·
`deployments` · `fridge_notes` · `usage_samples` · `applications` + `votes` (the doorbell) · `messages` (house channel
and doorbell threads) · `repos` (a GitHub repo linked to a room) · `chores` (one PR, one reviewer). The plan below
remains the target; `bills` and `listings` aren't built yet.*


`users` · `houses` (chef, server IP, agent token hash, size) · `memberships` (role, room size, tontine position,
status) · `rooms` (repo, subdomain, limits, current deployment) · `deployments` (sha, PR, prod/preview, status,
approved_by) · `chores` (PR, assignee, due, done/skipped) · `usage_samples` · `bills` + `bill_lines` (share,
amount, Wave link, paid_at) · `fridge_notes` · `listings` + `applications` + `votes` · `channels` (one per house,
one per application) + `messages` (author, body, at, reported) · `room_members` (who can deploy to a room: one
person, or several for a team room). The exchange ledger is a view over `chores`, not a table.
Presence (who's online, where) lives in memory on the API: it's live-only and rebuilt on reconnect.

## Build order (vertical slice first)

1. **Done 02 10:** push to a repo → it's live in a room with limits, zero-downtime swaps, isolation demo, live house page.
2. **Week 1:** Postgres, GitHub login, multi-house API, the city map and house profiles.
3. **Week 2:** GitHub App (reviews, previews, deployments), knock → doorbell thread → vote → move in, house channel, presence, a real server.
4. **Week 3:** exchange ledger, emotes, tontine, team rooms, bills, hardening, Datacloud, a seeded city, demo.
**Cut first if late:** see [roadmap.md](roadmap.md). Never the city, the doorbell, the house channel or reviews.

## Possible team split
- **Jib:** web app + floor-plan art + UX (20% of the score).
- **Infra person:** agent + install script + isolation.
- **Backend person:** hub, GitHub integration, domain logic, billing.
- (4th/5th: security review + tests + docs/declarations + demo video.)

## Why not Go (by default)
Go's advantages for the agent: single static binary, Docker's own language/SDK, ~15 MB RAM instead of Node's ~60 MB.
But **nobody on the team knows it yet**, and the jury scores the team's command of its own code (30%). An agent
written in an unfamiliar language with AI help is exactly what they'll probe. TypeScript everywhere = one language,
shared types between web, hub and agent, and everyone can read every part.
Avoid **Bun's** `--compile` (it embeds JavaScriptCore, which is LGPL) and **PyInstaller** (GPL with exception, not worth explaining).

## Backend in detail (02 10 2026)
"Backend" = the NestJS API (hub included) + the coloc.dev database. The agent lives on the other side, in each house.

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
