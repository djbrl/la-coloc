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
| **API** (`apps/api`) | Login, every route, GitHub webhooks, the link to each caretaker, the lobby's live line. NestJS | One server (`deploy/`, or a laptop) |
| **Database** | Postgres. Tests use PGlite (Postgres in memory), so they need no Docker | Next to the API |
| **Caretaker** (`apps/agent`) | Builds each room's project with Docker, runs it with its limits, measures usage, reports back. Plain Node | Each house server |
| **Traefik** | The front door of a house server: sends `<room>.<house domain>` to the right container | Each house server, in Docker |
| **GitHub App** | Login, linking repos, reviewers on pull requests, previews, deploy on merge | GitHub |
| **Caddy** | On a real server, the only public door: the built site, HTTPS for everything, rooms handed to Traefik | The server (`deploy/`) |
| **Vercel + tunnel** | Only for `npm run share`: the site on Vercel, the API on a laptop behind a Cloudflare tunnel | Vercel, Cloudflare |

Choices worth saying to a jury:

- **The caretaker only dials out.** It opens a WebSocket to the API with its house's secret. The house server
  exposes no control port, so it works behind a home router and can't be used to reach the API. The API refuses that
  line to anyone who comes through Cloudflare (`cf-connecting-ip`, `cf-ray` or `cdn-loop` headers), so the tunnel
  that shares a laptop never offers it.
- **The caretaker never holds GitHub credentials.** For each build the API sends a short-lived token for that one repo.
- **Neither rooms nor Traefik get the Docker socket.** The caretaker writes one small route file per room and
  Traefik reads the folder. A broken-into room or proxy can't take over the server.
- **A room has its own network.** On a server (`COLOC_ROOM_INTERNET=1`, network `coloc-room-<house>--<room>`) it reaches
  the internet but not the other rooms, the database, the machine's private services, the cloud's private network or
  metadata service, and it can't send email (`deploy/coloc-firewall.service`). On a laptop it's sealed by default
  (`coloc-sealed-<house>--<room>`), because on Docker Desktop `host.docker.internal` would lead to the laptop's database and API.

## How a push becomes a live room

1. You merge a pull request on GitHub. GitHub sends a webhook to `POST /api/github/webhook`; the API checks its
   signature (`apps/api/src/github/`). In development the webhook reaches your laptop through smee
   (`npm run dev:webhooks`).
2. The API finds the room the repo is linked to. In a strict house it checks the assigned reviewer approved.
3. It sends a `deploy` message to that house's caretaker over the WebSocket, with the repo, a one-hour GitHub
   token, the room's limits, its decrypted secrets and variables such as `COLOC_ROOM` and `COLOC_CITY`
   (`apps/api/src/rooms/room-deployer.ts`).
4. The caretaker (`apps/agent/src/deploy.ts`) clones the repo, builds the image from the repo's Dockerfile, or from one it
   writes when there's none (`apps/agent/src/recipe.ts`: Node, Python, Go, PHP, plain sites), one build
   at a time per house (`slots.ts`; with no network if `COLOC_BUILD_OFFLINE=1`), and starts a new container with its
   walls (`room-spec.ts`: memory and CPU caps, a limited disk, its own network; see "A room as a small server"). It clones only `https://` repos; a `file://` folder only
   when `COLOC_ALLOW_LOCAL_REPOS` names it (in development, the quest's starter page).
5. It checks the new container answers, rewrites the room's route file so Traefik sends visitors to it, waits for
   Traefik to follow, then stops the old one. Nobody sees a gap.
   A room's source can also be `docker://name:tag`: pulled instead of cloned and built, then the same walls. While it
   builds, its lines go back as `deploy_log` batches; the API keeps the latest ones in memory (`agents/logs.broker.ts`)
   and the log window asks `GET .../rooms/:room/build-log?from=N` once a second (`components/room/BuildLog.vue`).
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
- Each tab also says how present its person is, only when it changes: `{ type: "status", status: "idle" }` after five
  minutes without input, `"away"` while the tab is hidden, `"online"` again (`apps/web/src/activity.ts`). The API
  keeps it in memory with the rest, takes the most present of someone's tabs, and sends their friends a one-word
  `friends`; their page then asks `GET /api/friends` for the list with statuses and cities (`apps/api/src/friends`).
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

## Before a build, and when one is lost

- `POST .../rooms/:room/inspect` asks the caretaker to clone the repo and read small plain files, without following
  links (`apps/agent/src/inspect.ts`). It answers with the stack, the port and where that came from, the settings the
  env example names, and flags such as "nothing here to run". The Code tab (`RoomCode.vue`) shows that and blocks a
  build it knows can't work.
- Each time a caretaker's line opens, its `hello` lists the builds it's still on. The API marks any other unfinished
  build of that house as failed (`houses.service.ts`, `failLostBuilds`), so a restart never leaves a room "building".

## Credit

Fake money counted in FCFA, in `apps/api/src/credit/`: `users.credit`, and a `credit_entries` ledger whose unique `key`
stops anything being charged or paid twice. `GET /api/credit` is your balance and history; `/api/me` carries the balance.
A server's first month, rent and a project's first time online spend it. A review and first place in the Arena earn it.
Limits: one server and three projects a person (`houses/money.ts`). Replacing it with real money means swapping
`houses/payment.ts` and these few calls.

Rent goes by itself (`houses/rent.ts`): a flatmate's line of the month's bill is taken the moment they move in (a knock
admitted, an invitation accepted, another room taken, or the server paid for after they joined), then for each new month
by the hourly settle in `leases.service.ts`. A `rent` credit entry keyed by house, month and person, and a
`bill_payments` row, mean one month is never taken twice. Each charge is a `rent_paid` notification. Short of credit,
nothing goes below zero: the month stays unpaid, a `rent_due` says so once, and the next run or a PayDunya top-up pays
it. Never in the workshop or an example house. An unpaid month has no other consequence.

## A full house's chat

`house_guests` (migration 0019) holds who asked to join a full house's channel. A flatmate answers under the bell, and a
guest reads and writes that channel and nothing else (`houses/guests.ts`, `notifications.service.ts`). An example house
has nobody to answer, so its host lets you in with a line (`doorbell.service.ts`, `welcomeGuest`).

## Leases and several rooms

A person can rent up to 3 rooms (`MAX_ROOMS_PER_PERSON`; the workshop doesn't count). Someone who already lives in a house takes another free room with `POST /api/houses/:id/rooms/:room/take`. In the bill a person's memory and CPU are the sum of their rooms.

The billing cycle is the calendar month (UTC). Ending a lease (`POST .../leave`, `houses/leases.service.ts`) has two steps:

- **Right away** the room is free for anyone: any build is cancelled, its containers go, and its project, repo link, secrets and history are removed.
- **When the month ends** the money follows. A `lease_ends` row keeps the room on the bill of the person who left, and not on a new occupant's, so no line moves this month. If it was their last room there they stay a flatmate until then, with no room (`memberships.leaving_month`).

`settleLeases` does the second step, when the API starts and every hour: it removes people who have left, passes the chef's role to the first in the tontine line if the chef was one of them (the only time the chef changes), and closes a house with nobody left.

## Leaving La Coloc

Settings ends with two ways out (`apps/api/src/account/`). **Remove the GitHub App** uninstalls the App from the
person's own account (`DELETE /app/installations/{id}`) and unlinks their repos: rooms keep their last build and the
repo's address, and the Code tab says they no longer update on merge. Login still works. **Delete my account** asks for
the login typed out, then empties their rooms like an ended lease, lets each house go on without them like the end of a
month (`settleHouse`: the next in the tontine line becomes chef, a house left empty closes), uninstalls the App, and
deletes the person: most tables cascade, chat channels named after them go by hand, and a house's history (builds,
reviews of their pull requests) keeps its rows with no name. We never keep a GitHub token, so to revoke the login itself
the browser takes one last trip through GitHub's login, whose token is used only for `DELETE /applications/{id}/grant`.
If GitHub doesn't answer, the account is deleted anyway and the landing links to GitHub's pages to finish by hand.

## Uploading a project

Wherever a repo is asked for, `RepoPicker.vue` lists the repos the person let the GitHub App see (`GET /api/github/repos`, `github/repos.service.ts`, shared with the quest). In a room, picking one links it (`POST .../import`) and the caretaker reads it straight away (`POST .../inspect`). A public link or a Docker Hub image takes one Import press and is read the same way. One screen then says what was found, and the main button is Put it online. There is no separate check step.

A knock only lists public repos: its link is shown to the house.

## Cancelling a build

`POST .../cancel-build` sends the caretaker `cancel_build`. It aborts that room's real builds, running or waiting (`agent/src/builds.ts`, an `AbortController` per build; Docker stops a build when its client hangs up). The deployment ends as failed with "Build cancelled.", which the web treats as going back rather than as a failure. Whatever was online stays online.

## A room as a small server

We rent out a room of a server, not a deploy button. Deploying is the main use, but a room behaves like a small Linux machine, within these limits.

- **Disk:** writable, 1 GB, with another 1 GB in `/home/your-room` (`COLOC_ROOM_DISK_MB`). When it's full the app gets "no space left", and the neighbours notice nothing. A redeploy starts a new container, so everything resets except `/home/room`. A restart keeps everything.
- **Who keeps the disk honest:** only XFS with project quotas lets Docker enforce a size per container, so `deploy/setup.sh` puts `/var/lib/docker` on an XFS disk file (`/var/lib/coloc-docker.img`, 85% of the free space).
- **Kept files belong to a person.** The volume is named after the occupant (`roomHomeVolume`), so the next tenant gets an empty one by construction, even if a lease ended while the server was off. `removeRoom` deletes it when the room empties. A pull request's preview gets no kept files.
- **Root:** an image runs as the user it asked for, root included, because `userns-remap` makes root in a room user 100000 on the machine. It holds seven rights inside the room (`ROOM_CAPS`): enough for `apt install` or official nginx, nothing touching the kernel or the network. `no-new-privileges`, Docker's seccomp profile and the memory, CPU and process limits stay on. `rootIsRemapped` checks this: without it, the app runs as nobody.
- **Without `COLOC_ROOM_DISK_MB`** (a laptop, whose disk can't enforce a size) a room stays read-only and runs as nobody, as it did at first.

**The running code is linked, not moved.** `~/project` in the folder points at the image's `WORKDIR` (`/app`, or `/site` for a static site; `linkProject`). The code stays in the image: copying it into the kept folder would eat that folder's 1 GB and can't work for every image. So `project` shows the code and edits there are live, but each deploy replaces it, while everything else in the folder stays. A real file or folder someone named `project` is left alone. A container keeps the folder it started with until its next deploy (`roomHomeOf` reads it from the container).

**Seeing inside without going in.** The Inside tab asks `GET .../rooms/:room/inside` every 10 s while it or the Overview is open and the tab is visible, never in the background. The caretaker runs a small `/bin/sh` script in the room as the room's user (`apps/agent/src/inside.ts`): the folder's top level with sizes and what each thing looks like, listening ports from `/proc/net/tcp`, processes from `/proc/*/`. It needs no `ps` or `ss`, takes about 0.2 s, and gives up after 5 s or 256 KB. An image with no shell can't be looked into. Something started with `docker exec`, as SSH does, has its own session id, and that's how a process someone started is told from the project's. The room answers about itself and can lie, which is fine because the answer only goes to people who could open a shell there: not the chef, who only updates and restarts, and not an example room (`RoomsService.enterable`). Command names stop at the first flag or setting, where tokens tend to be.

**One address, whichever port.** `PUT .../rooms/:room/address` sends the room's address to another port of its own container, if something really listens there on more than 127.0.0.1 (`setAddress`). The route file itself is the record, so nothing else needs storing: `syncRoutes` keeps a chosen port while it's the same container, and a deploy's new container goes back to the project's port. A restart or a crash does too (`backToProject`), since what was started by hand stopped with it. What someone starts stops when they leave, unless they use `nohup` or `tmux`.

Still one room, one address: several things can run inside, and visitors reach one of them at a time.

## SSH into a room

`ssh -p 2222 <room>.<house>@<city host>` opens a shell inside a room's running project. There's no real login on the server: the API is the SSH server, and the person never touches the machine.

1. **The door** (`apps/api/src/ssh/ssh.gateway.ts`, the `ssh2` library, public keys only). The name says which room. The offered key must belong to its occupant, and nobody else (`SshService.occupant`). Only the occupant sees the address on the room page; anyone else has it only if the occupant gives it to them. The chef has no way in, and example rooms have none. Every refusal reads the same, so nobody can use it to find out which rooms exist.
2. **The line** (`apps/api/src/agents/shell.broker.ts`). Bytes go over the caretaker's existing websocket, so no room or server needs a port of its own.
3. **The shell** (`apps/agent/src/shell.ts`). A `docker exec` in the room's running prod container, so it has what the project has: same user, disk, network and limits. Closing the line doesn't stop a `docker exec`, so the shell writes down its process number and the caretaker hangs up on that group, as any server does: `nohup` and `tmux` keep running until the next deploy. `sweep` does the same for what a crashed caretaker left behind.

Only a shell or a command: no passwords, no sftp, no port forwarding. Limits: 4 shells a person, 40 a server, 200 connections, 30 new connections a minute per address, 20 s to log in, 30 min idle, and a login that opens no shell closes after 2 min. Access is checked again every 60 s, so someone who moved out is out within a minute.

Output is paced: the caretaker pauses above 1 MB not yet acknowledged and resumes below 256 KB, and the API acknowledges once SSH has taken the bytes. Input that arrives while the shell is still starting waits for it, because a pipe doesn't wait.

Keys belong to a person, not a room (`ssh_keys`, `/api/me/ssh-keys`). A real GitHub account gets `github.com/<login>.keys` the first time the tab opens, and never again by itself (`users.ssh_keys_chosen`): a key someone removed stays removed.

Who has a shell in a room is known to `ShellBroker` (`inRoom`), kept in memory, and shown on the room's Overview to the people who could open one. A change pings the house's open pages.

The gateway only starts with `COLOC_SSH_PORT` and `COLOC_SSH_HOST_KEY_FILE` set. `deploy/setup.sh` sets both, makes the host key once and opens the port.

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

## Backups and the disk

`coloc-backup.timer` dumps the database at 03:30 every night (`pg_dump -Fc` through `docker exec coloc-db`) into
`/var/backups/coloc` on the root disk, so a full or broken Docker disk doesn't take the backups with it. The newest 7
are kept. `deploy/pull-backup.sh <ip>` copies the newest one to a laptop; the restore line is in both scripts. Rooms'
kept folders (`/home/your-room`) are not backed up.

Images and build cache have no size limit and share Docker's disk with the rooms and the database. Every 15 minutes
`coloc-disk-check` looks at `/` and `/var/lib/docker`. At 80% it warns in the journal, clears build cache older than a
day and images no container uses, and posts to `COLOC_ALERT_URL` (from `/etc/coloc/alert.env`, at most every 6
hours) if one is set. It never touches volumes or containers. Build cache older than a week goes every Sunday
(`coloc-cache-prune.timer`). Before changing anything, `deploy/setup.sh` checks the machine has what it needs and
stops with one sentence per missing piece.

## The database

The tables, in `packages/db/src/schema.ts`: `users`, `sessions`, `houses`, `rooms`, `memberships` (who lives where,
their place in the tontine), `deployments`, `fridge_notes` (house news), `usage_samples`, `applications` and `votes`
(knocks), `messages` (every chat: houses, knocks, direct, cities, board replies), `board_posts`, `blocks`,
`chat_reads` (how far you read a conversation), `reports`, `room_secrets`, `repos` (a GitHub repo linked to a room),
`github_installations` (who installed the GitHub App where, for the repo picker), `chores` (one pull request, one
reviewer), `bill_payments` and `notifications`. A month's bill is worked out from usage and
reviews when asked; it is not stored. Who is online lives only in the API's memory. Migrations are in
`packages/db/drizzle/`, and the API applies new ones when it starts.

`room_teammates` is still there but unused. It held teaming up, where a flatmate got the same rights on another's
room. That went on 6 Nov: a room, its shell and its SSH address are one person's, and working together goes through
reviews. Keeping the table spared a migration. The old `team_*` notifications are left out of the bell.

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

- A database per room (the "kitchen"), backups, showing a room how much disk it uses, and a second address for a second project in a room.
- A job queue (pg-boss) and timed jobs: webhooks are handled straight away, and a few timers do the rest.
- Real payment and a real hosting provider: `houses/payment.ts` simulates the first, `houses/landlord.ts` stands in for the second.
- gVisor for stronger walls, and more stacks without a Dockerfile (Railpack would replace `recipe.ts` if they pile up).
- GitHub's Deployments panel (needs one more App permission).
- `bills` and `listings` tables (a free room's ad is a column on `rooms`).
- Real payments.
