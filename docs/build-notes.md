# Build notes

## Night 1: 02 → 03 10 2026 (Claude, while Jib slept)

### Verified on this Mac (Docker Desktop 27.5)
| Test | Result |
|---|---|
| Unit tests (domain rules, protocol, room walls, checkout safety, fridge, house service) | **31 passing** |
| Licence check | 278 packages, **0 copyleft** |
| Agent auth: wrong secret / garbage / silence | closed with 4003 / 4000 / 4000. Real agent stays online |
| Deploy `examples/hello` into Jib's room | cloned → built → started → health-checked → live in ~10s |
| Room walls (`docker inspect`) | 256 MB, swap = memory, 0.5 CPU, 256 pids, `CapDrop ALL`, `no-new-privileges`, read-only rootfs, own network |
| Redeploy while probing the old version | old version answered 31/31 times during build + health check, removed only after the new one was healthy |
| Memory hog in Moussa's 128 MB room | OOM-killed and restarted 4× in 40s; **Jib's room: 0 failed requests out of 40** |
| Awa's room → Jib's room by IP | **timed out** (rooms can't see each other); Awa → internet works |
| API restart | agent reconnects and sends a rooms snapshot; statuses rebuilt correctly |
| House page | live updates over SSE, fridge note collapses repeats (×8) |

### Not verified tonight
**Routing through real Traefik.** Every Docker Hub pull hung on this machine (Docker Desktop is set to go through
`http.docker.internal:3128`), so `traefik:v3.2` and `node:22-alpine` never downloaded. To test anyway:
- the example apps were built from the locally cached `node:18-alpine`, on the throwaway branch `test/cached-node18`
  (`main` still says `node:22-alpine`; delete the branch when pulls work);
- a plain `node:18-alpine` container named `coloc-traefik` stood in for the proxy, so I could probe rooms from "the
  front door" network. It has been removed.

**First thing to try in the morning:** `npm run dev:proxy`, then `curl http://jib.coloc.localhost:8000` after a deploy.
If pulls still hang: Docker Desktop → Settings → Resources → Proxies.

### Decisions I made (change them freely)
- **npm workspaces**, not pnpm (pnpm isn't installed here).
- **API on port 4100**: something else of yours already listens on 4000.
- **State is in memory** for now (`HousesService`). The Postgres version keeps the same method names. Week 2.
- **Previews live at `preview-<room>.<house>`**, a single-level subdomain, so one wildcard certificate per house covers everything.
- **Plain CSS**, no Tailwind yet: the page is a placeholder until your design and floor-plan art.
- **zod** validates every message between API and agent, both ways.
- **A room whose app runs out of memory stays "live"** (Docker restarts it); the fridge note says what happened.

### Reading order (so you can explain it to the jury)
1. `packages/protocol/src/index.ts`: every message the two sides can send. ~100 lines.
2. `apps/agent/src/room-spec.ts` + its test: the walls of a room. The isolation story is here.
3. `apps/agent/src/deploy.ts`: push → live, step by step.
4. `apps/api/src/agents/agents.gateway.ts`: how an agent proves who it is.
5. `apps/api/src/houses/houses.service.ts`: the house's state and fridge notes.
6. `packages/domain/src/*`: reviewer rotation, bill split, tontine line. Not wired to the API yet.

### Next (roadmap week 1 → 2)
- ~~Run the proxy for real and confirm zero-downtime swaps through Traefik.~~ Done, see below.
- GitHub App + login (replaces the "Deploy main" form with webhooks).
- Postgres + Drizzle behind `HousesService`.
- Your floor-plan art on the house page.

## Day 1 evening: 02 10 2026 (Claude, with Jib)

Docker Hub pulls work again; `test/cached-node18` is deleted.

### Verified through the real Traefik (`traefik:v3.2`)
| Test | Result |
|---|---|
| Isolation demo (`scripts/isolation-demo.sh`) | Jib's room **0 failed requests out of 45**; Moussa's room OOM-restarted 4× |
| Redeploy under load, routing by Docker labels (the old way) | **2 failed out of 142**: Traefik kept sending visitors to the old container for a moment after it stopped |
| Redeploy under load, routing by files the agent writes (the new way) | **0 failed out of 270**, then **0 out of 266** |
| Traefik's mounts | only the routes folder, read-only. **No Docker socket** |
| Agent without `COLOC_ALLOW_LOCAL_REPOS=1`, deploying `file:///etc` | refused; the house page shows the room as failed with the reason |
| Agent pointed at `ws://coloc.dev` | refuses to start: the house secret only travels over `wss://` (or to localhost) |

### What changed
- **Routing moved from Docker labels to route files** (`apps/agent/src/proxy.ts`, `roomRoute` in `room-spec.ts`).
  A swap is now: new version healthy → route file points at it → wait for Traefik to reload → stop the old one.
  On startup the agent rebuilds the routes from what's running and plugs Traefik back into every room's network.
- **A failed clone now reports "failed"**. Before, it threw before the error handling and the room stayed "deploying".
- **A malformed Docker event is skipped** instead of crashing the agent.
- **Once traffic has switched, a deploy never rolls back** the new version, even if removing the old one fails.

## Night 2: 07 → 08 10 2026 (Claude, while Jib slept)

Week 1's milestone is in, plus most of week 2's backend. **Nothing is committed** (waiting for Jib's go); everything is
in the working tree. **82 tests passing** (domain 14, protocol 3, agent 13, db 2, API 50). Licences: 307 packages, 0 copyleft.

### What's new
| Area | What | Where |
|---|---|---|
| Database | Postgres 17 in `dev/docker-compose.yml` (port 5433). Drizzle schema + SQL migrations, applied by the API on start. Tests run on PGlite (Postgres in memory), so CI needs no Docker | `packages/db` |
| Seed | `npm run dev:seed`: nine houses in eight cities. Sacré-Cœur is real (our agent runs it); the other eight are flagged `demo` and labelled "demo" in the UI | `apps/api/src/seed/city.ts` |
| Login | GitHub OAuth (ready for the App's client id/secret), sessions in a cookie (HttpOnly, SameSite=Lax; only the token's SHA-256 is stored), and a dev-only login (`COLOC_DEV_LOGIN=1`) | `apps/api/src/auth` |
| Permissions | Only a room's flatmate (or the chef) can deploy into it; only the chef can empty a room. House pages are public; deploys, fridge notes, chores, chat and the doorbell are flatmates-only | `houses.controller.ts` |
| City | `GET /api/city` (+ live stream). The city page: houses drawn by room state, filters (free rooms, in the making, city, search) | `CityPage.vue`, `HouseDrawing.vue` |
| Doorbell | Knock on a free room → a thread with the house → flatmates vote → a strict majority lets you in (or says no). Moving in makes you a flatmate, gives you the room, puts you at the back of the tontine line | `apps/api/src/doorbell`, `ApplicationPage.vue`, `tallyVotes` in `packages/domain` |
| Living room | One chat per house, flatmates only, live | `ChatPanel.vue` |
| Chores | GitHub webhooks (signature-checked). Installing the App on your repo links it to your room. A PR → the next reviewer on the rotation (`pickReviewer`), a "Corvée" comment and a review request on GitHub. The assignee's review → chore done, thanks note. Late reviews → one fridge note | `apps/api/src/github` |
| Exchange ledger | Reviews given / received per flatmate, public on the house page | `houses.service.ts` |

### Verified tonight (in the browser and over HTTP, not just tests)
- City page, filters and search; house page as a visitor, as a flatmate, as the chef; phone width (375 px, no sideways scroll).
- Logged in as Awa, deployed `examples/hello` into her room from the page: live in ~10 s, page updated by itself.
- Isolation demo (now logged in as the chef): Jib's room 0 failed requests out of 45, Moussa's room OOM-restarted 4×.
- Sessions survive an API restart (they're in Postgres now).
- Doorbell end to end: Fatou (new user) knocked on room-4; Jib replied and voted yes, Awa voted yes from another
  session; Fatou's page switched to "You're in" live, and room-4 became hers with a deploy form.
- Chores over real HTTP with throwaway App keys: an unsigned webhook → 401; installation → Awa's repo linked to her room;
  PR opened → Jib assigned; Jib's review → chore done, ledger updated, thanks note, page updated live. (The call to
  GitHub itself failed, as it should with fake keys, and was logged without breaking anything.)
- Afterwards: database re-seeded to the clean city, throwaway keys deleted, Moussa's memory hog replaced by `hello`.

### Bugs found and fixed on the way
- Rejected chat messages (empty / too long) counted against the anti-flood limit.
- Messages written in one transaction share a timestamp in Postgres, so a thread could show them out of order. Messages
  now have an increasing id and are ordered by it.
- After someone was voted in, the vote bar counted them as one of the voters.
- Long taglines and ads overflowed the city tiles.

### Decisions I made (change them freely)
- **Drizzle** over Prisma: plain SQL migrations you can read, no generated client, Apache-2.0.
- **A strict majority of flatmates** decides a knock, either way. Flatmates can change their vote until it's decided.
  Flatmates see who voted what; the applicant only sees the counts.
- **Demo houses can't be knocked on** ("nobody lives here to answer").
- **Installing the App links repos to the installer's room**, only if they live in exactly one room. Simplest flow I
  could find; a "pick your room" step can come later.
- **The chore comment goes on the PR even when GitHub refuses the review request** (people without repo access can't be
  requested as reviewers). That's the private-repo question from 02 10, still open.
- **Live updates resend the whole view** (house, city, thread). Simple and small at our scale; worth revisiting if a
  house page gets heavy.

### What needs Jib
1. **Commit.** Backups of every stage are in my scratchpad, but the repo itself has two sessions of uncommitted work
   (02 10 evening and tonight).
2. **Register the dev GitHub App** (login + webhooks): permissions *Pull requests: read & write*, *Issues: read & write*
   (comments), *Metadata: read*; subscribe to the *Pull request* and *Pull request review* events (installation events
   come on their own). Callback URL: `http://localhost:5175/api/auth/github/callback` (match `COLOC_PUBLIC_URL`). Then set
   `COLOC_GITHUB_CLIENT_ID`, `COLOC_GITHUB_CLIENT_SECRET`, `COLOC_GITHUB_APP_ID`, `COLOC_GITHUB_PRIVATE_KEY`,
   `COLOC_GITHUB_WEBHOOK_SECRET`. Webhooks need a public URL: a tunnel to `localhost:4100` for development.
3. **Your art.** `HouseDrawing.vue` (city) and the room cards (floor plan) are placeholders built to be swapped.
4. **Read the new code before the jury does**: `packages/db/src/schema.ts` → `auth/auth.service.ts` →
   `doorbell/doorbell.service.ts` → `github/chores.service.ts`.

## 09 10 2026: the real GitHub App

**La Coloc - Dev** (https://github.com/apps/la-coloc-dev) was created with `npm run dev:github-app`: private to
Djbrl, permissions *contents: read*, *metadata: read*, *issues: write*, *pull requests: write*; events *pull request*
and *pull request review*. Keys in `dev/.env.github` and `dev/github-app.pem` (git-ignored).

Verified against real GitHub:
- **Log in with GitHub** → Djbrl (Djibril Sy) with their avatar. Then knock on Sacré-Cœur's room-4, voted in by
  Jib and Awa (dev logins): Djbrl now lives in room-4.
- App installed on the private test repo **Djbrl/coloc-test** only. The installation webhook came through the smee
  relay, passed the signature check, and linked the repo to room-4.
- **Djbrl/coloc-test#1** opened → Jib assigned on the rotation → the App commented on the PR. Jib is a demo flatmate
  with no GitHub account, so he's named in plain text, not @-mentioned (a real stranger may own that login).

Not verified yet: a chore being *done*, which needs a reviewer with a real GitHub account (a teammate, once they
log in and move in). The smee relay re-encodes JSON; it hasn't broken a signature yet, but watch for 401s.

## 09 10 2026: deploy on merge, against real GitHub

- **Strict house, unreviewed merge** (Djbrl/coloc-test#1): not deployed; the App commented why on the PR and a note
  went on the fridge.
- **Relaxed house** (Sacré-Cœur switched in the dev database for the test, then back to strict), Djbrl/coloc-test#2
  merged: the agent cloned the private repo with a one-hour installation token, built it, and swapped it into room-4
  (`http://room-4.coloc.localhost:8000` → `{"hello":"from coloc-test","version":2}`). The App commented
  "Deployed to … Live now." on the PR. The token is in no log and not in the database (`https://***@github.com/…`).
- Found while writing the tests: a reviewer who first requested changes and later approved was stuck at "changes
  requested", so a strict house would never deploy. The assignee's latest review now decides.

## Night 3: 09 → 10 10 2026 (Claude, with one subagent, while Jib slept)

### Built and verified
| What | Checked how |
|---|---|
| **Room page**: project, build settings (repo, branch, folder, port), secrets, logs (live follow), restart, redeploy, history | In the browser as Jib: saved a repo + folder, redeployed, the history followed live; the container's environment had the decrypted secret (`GREETING=salut`) and `PORT` |
| **Secrets**: AES-256-GCM before storage, names only ever shown, refused names (`PORT`), size limits | Unit tests (tampering, wrong key) + the database row holds no plaintext |
| **Agent**: `restart_room`, `get_logs` (answered by request id; a reply from another house is ignored), `remove_preview` | Live: logs came back, restart left the room answering |
| **PR previews** | Real GitHub, Djbrl/coloc-test#3: preview built at `preview-room-4…` (version 3) while the room kept version 2; the PR was told once; closing the PR removed the container and its route (404) |
| **Lobby presence** (`/lobby-ws`) | Two WebSocket clients: join, move, emote, leave all relayed; a visitor watches without appearing; another site's origin is refused (4003). In the browser: a scripted Awa walked around and waved, Jib's page showed her, hid her standing-around figure, and said "You and one other person are here." |
| **Full-screen lobby**: dusk lighting, live players, your look (saved to your profile), emotes, lamps you light with E (counted, remembered), finder sheet, zoom, loading screen, five-step welcome, settings sheet | In the browser, step by step |

### Fixed on the way
- Name tags floated above the welcome sheet and the loading screen (three.js sets a z-index on each tag); the scene now
  has its own stacking context.
- At full height the camera clipped the ground in a straight line (near plane); it now sits far back on the same angle.
- Lamps on the far kerb hid behind the next row's roofs; they're on the near kerb.
- The camera glided in from the world's origin on arrival; it now starts on you.
- A watcher I first wrote to reconnect the lobby on login would have reloaded the page forever; the city page now
  rebuilds the lobby when the logged-in person changes instead.

### Design direction (Jib, 09 10)
Apple's design philosophy for every page: system font, big headlines, whitespace, sections instead of cards, one
primary action per view, no visible labels (accessible names stay, hidden), multi-step flows. Apple's own UI kits
and fonts are licensed only for Apple-platform design, so we follow the principles, not the files. For the lobby:
2XKO's hangout lobby (warm lights, emotes over heads, an interact prompt, a corner card with who's here).
