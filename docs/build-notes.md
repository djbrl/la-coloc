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

## 10 10 2026: procedural neighbourhoods

One neighbourhood per city, generated from the city's name (`apps/web/src/lobby/neighbourhood.ts`, 7 tests): a grid of
blocks between streets, sized to the city's houses with room to spare; a market square in the middle, a park when
there's room; real houses on the plots nearest the market, then demo houses; shops, towers and tree lots on the rest;
lamps at every crossing; a ring of low buildings beyond the last street. Same name, same map, for everyone.

- **Travel**: the city's name (top left) opens "Where to?", listing every city with its houses and how many people are
  walking around there (a live census from the server). The URL keeps the city (`/?city=Lomé`).
- **Presence per neighbourhood**: you only hear about the people where you are (8 server tests).
- **Who belongs where**: a ring at everyone's feet in their house's colour (grey: just visiting); click someone for a
  card ("Edem lives in Bè Kpota, building Akpé. Visit Bè Kpota ›").
- **Readability**: buildings between the camera and you fade; Q and R (or the buttons) turn the view a quarter turn;
  skyline buildings on the camera's side hide; name tags only show near you; only people near the camera animate.
- **Cost**, measured in Dakar: about 240 draw calls and 85 000 triangles. Street markings are two instanced meshes.
- Verified in the browser: Dakar and Lomé look different, travel works and updates the URL, the census counted a
  second real browser (Djbrl in Chrome) in Dakar, the person card, the building fade.

## 10 10 2026, later: everything in the lobby is something you can use

Jib's ask, after the neighbourhoods: no dead building, no dead person, no leaving the lobby to look at a house, and
all of it from the keyboard. Built by four subagents on disjoint files (engine, cards, API, sounds), reviewed and
verified in the browser afterwards.

| What | Where |
|---|---|
| **One target model** in the engine: every house, empty plot (shop, tower, tree lot), person and lamp. Walk up and press E, click, or **Tab / Shift+Tab** to pick one on screen (nearest first, a ring at its feet). Using something far away walks you there first. Clicking never navigates: the engine only reports | `apps/web/src/lobby/Lobby.ts` (`Target`, `onNear`, `onSelect`, `cycle`, `goToPlot`, `goToPerson`) |
| **Floating cards**, bottom left, non-modal: a house (its rooms, who's home, who's walking around, Knock on a free room, the page link), a person (name, then "Lives in Sacré-Cœur, Dakar." on its own line, room and project; Ask to join, See the house, Wave), an empty plot (Start a coloc here). Focus lands on the card's first action and goes back to the stage when it closes, so Tab keeps cycling | `apps/web/src/components/lobby/*.vue`, `LobbyView.vue` |
| **Start a coloc here**: three steps (name, tagline, a last look), then `POST /api/city/houses`. The house appears on that very plot, in the making, with fences and cones, and you're its chef | `RentSteps.vue`; `houses.service.ts` `rent()`; migration `0006_house_plot` |
| **Stable plots**: every plot has a key ("block column.block row.plot column.plot row"); a house keeps the key it rented so the neighbours never shuffle. Houses without one still take the plots nearest the market | `neighbourhood.ts` (`Plot.key`, `HouseOnMap.plot`), 2 new tests |
| **Keys**, listed bottom left: W A S D walk, Tab next thing, E use, Q R turn, 1 2 react, F find, T travel, Esc close, ? the list. Hidden on touch screens | `KeyLegend.vue` |
| **Sounds**, synthesised with Web Audio (nothing downloaded): select, open, close, lamp on/off, emote, knock, arrive, build. Off in settings | `sound.ts`, 5 tests |

### Verified in the browser (as Jib, in Dakar)
Tab cycled house → Awa → Moussa → an empty shop → lamps; E opened each card with focus on its first action;
Enter on "See Sacré-Cœur" opened the house card and walked there; Escape closed cards and sheets and put focus back
on the stage; F and T opened their sheets with focus on the first control; the rent steps ran entirely by keyboard
and the shop became "Médina Lab" (then deleted from the dev database); a mouse click on Khady opened her card with
"Lives in Almadies, Dakar."; at phone width the card is a bottom sheet and the key list is hidden.
Tests: 138 (domain 14, protocol 4, agent 13, db 2, API 91, web 14). Build and `licences:check` pass.

### Fixed on the way
- The first sound was always dropped: browsers keep audio asleep until a click or key, so the lobby now wakes it on
  the first one.
- After starting a house, its card offered the chef "Knock" on their own rooms: the page's "who am I" is refreshed.
- A mouse click's own focus (on the stage) landed after the card's, so the card waits a tick before taking focus.

### Rough edges
- Knocking from a card still goes to the application page (shared with the house page): the one remaining way a
  card leads out of the lobby. Jib to say whether the thread should open in the lobby too.
- The highlight ring is hidden when the target is behind a tower (it keeps depth testing).
- Clicking the ground doesn't close an open card; Escape or Close does.

## 10 10 2026, night: never leave the lobby

Jib's second ask of the day, after trying the first: stay in the game view for everything (the list view is the
only place things are a list), see at a glance which house people belong to, hover feedback, a map to fast-travel
from, the keys you reach for always visible, and a dash. Three subagents on disjoint files (engine, HUD, the
inside sheet), reviewed and verified in the browser.

| What | Where |
|---|---|
| **Inside**: a house's page, a knock's thread or a room page slide in as a wide sheet over the city. Links in them are caught and stay inside (a house → its room → back); `/` closes; `/login` leaves. Each page takes `embedded` (no top padding, no "back to the city") and tells the sheet its name. Knocking from a card or from inside reports the new thread instead of navigating. The URL keeps the place (`?in=…`), the top bar's house link sets it | `components/lobby/Inside.vue`, `place.ts`, the three pages, `RoomCard.vue`, `KnockSteps.vue` (`stay`), `App.vue` |
| **E at a door goes in** (a house in reach opens inside straight away); a house picked from afar still gets its card, whose main action is "Go in" | `LobbyView.vue` |
| **Hover**: an outline on whatever the mouse is over (people, houses, empty plots, lamps) and a pointer cursor. `OutlinePass` through an `EffectComposer`, used only while something is outlined (or Tab-highlighted), never on low quality | `Lobby.ts` (`aim`, `setHover`, `draw`) |
| **Name tags say the house**: a badge in the house's colour after every name, so a group reads at a glance | `Lobby.ts` (`badge`), `style.css` |
| **Dash**: tap Shift while moving (fires on release, so Shift+Tab stays "previous"): three times the speed for 0.22 s, a puff of dust, 0.9 s before the next | `Lobby.ts` (`dash`), `models.ts` (`makePuff`) |
| **Minimap**, bottom right: blocks, streets, houses in their colours, lamps, everyone walking, you with your heading and the camera's wedge. Click to fast travel (`teleport` lands you on the nearest free spot). **M** opens it big with the houses listed as buttons | `components/lobby/Minimap.vue`, `Lobby.ts` (`teleport`, `onMap`) |
| **Keys**: a one-line strip of the frequent ones (E, Tab, Shift, M, ?) bottom left; **?** opens the full list. Emotes moved to the bottom centre under the prompt | `KeyLegend.vue`, `KeysSheet.vue` |

### Verified in the browser (as Jib, in Dakar)
Walking to Sacré-Cœur opened its inside, `?in=house:sacre-coeur` in the address bar, Escape closed it with focus
back on the stage and the parameter gone; the top bar's house link did the same; walking to le QG (a house Jib
started from their own Chrome while this was being built) opened its inside, Knock on room-2 ran the steps and the
thread opened in the same sheet with Back, then the knock was withdrawn from there; hovering the remote player set
the pointer cursor and outlined five meshes; M listed the houses and Enter travelled; a click on the minimap
teleported 26 units onto free ground; a tap of Shift while walking covered 4.2 units where walking covers 1.9.
Tests: 138. Build and `licences:check` pass.

### Fixed on the way
- Shift+Tab also dashed (Shift arrives first): the dash now fires when Shift is released alone.
- The engine read E, W A S D and the rest while focus was inside a sheet; it now leaves keys to any modal dialog.
- Walking to something while a Tab highlight pointed elsewhere opened the wrong thing on arrival: setting off
  drops the highlight.

### Rough edges
- No dash button on phones yet (`lobby.dash()` exists for one).
- The inside sheet is the site's light pages over the dark city; in dark mode it's dark. Jib to judge the contrast.
- On a phone the minimap hides while a card is open (the card is a bottom sheet there).

## 10 10 2026, late: a game screen, not a page

Jib's third round after playing the second: the dash wasn't snappy and cooled down too long; the map was
transparent and busy; you got stuck on a wall when a building faced away; cards should be flat and floating, no
glass, with a day / night choice; and opening a house showed too much text, with no clear way for a new chef to
finish signing up. Four subagents (engine, looks, the house inside, the API), reviewed and verified in the browser.

| What | Where |
|---|---|
| **Routes, not straight lines**: a 0.5-unit grid over the neighbourhood, A* (8 directions, no corner cutting), string-pulled; any side of a building counts as reached (distance to its footprint); a route that makes no progress for half a second is dropped | `lobby/path.ts` (9 tests), `Lobby.ts` (`routeTo`, `reach`) |
| **Dash**: an instant 0.9-unit hop, then 4.5× speed for 0.14 s, 0.35 s cooldown; works standing still | `Lobby.ts` (`dash`) |
| **Day / night / system** in settings; `data-theme` on `<html>`; every lobby panel flat on the site's tokens (no blur, no glass); the Inside view is a centred floating panel (a bottom sheet on phones) | `settings.ts`, `App.vue`, `style.css`, `components/lobby/*` |
| **The map**, plain: ground, blocks (market and park tinted), houses as round markers in their colour (dashed ring for samples, names on the big map), people as dots, you as a ring; nothing else; "{n} people here" under it | `Minimap.vue` |
| **Inside a house** as a game screen: header (name, status dot, city), icon actions by role (chef setting up: Rent · Invite · Rules; flatmate: My room · Chores · Channel · Fridge · Bill; visitor: Knock · People), one panel at a time, room tiles with a state icon and one action, a four-step first-time tour | `HouseInside.vue`, `lobby/house/*` |
| **Rent the server**: pick a size (7 000 / 12 000 / 22 000 FCFA a month), get the one-line command, wait; the house goes live when its agent phones in with the key. The key is shown once (`renew` replaces it and hangs up the old agent) | `RentServer.vue`, `POST /api/houses/:id/server`, `agents.gateway.ts` (`markLive`), migration `0007_house_plan`, 9 API tests |
| **install.sh**: Node 22, Docker with userns-remap, the repo, Traefik without a Docker socket, the agent as a systemd service. Not yet run on a real server | `apps/web/public/install.sh` |

### Verified in the browser (as Jib, in Dakar, day theme)
Walking to Sacré-Cœur from behind it reached the house and opened its inside; the tour stepped through and was
remembered; M showed the plain map and the house list; a throwaway house (Test Villa) started on a free plot, its
inside showed "Next: rent the server", the rent steps gave the command, a second local caretaker started with that
key, the API logged "house is live", the dialog said "It's live." and the action row switched to the flatmate set
(then the caretaker was stopped and the house deleted); a dash covered about twice a plain walk in the same window;
night theme and phone width checked. Tests: 159. Build and `licences:check` pass.

### Rough edges
- Rules tile is read-only (no endpoint to switch strict reviews yet).
- `install.sh` has never run on a real server; HTTPS for rooms needs the agent's route files to add the `websecure`
  entrypoint.
- The dev install command points the agent at `ws://localhost:5175/agent`; Vite doesn't proxy `/agent`, so a local
  caretaker should use port 4100 (the real site serves both on one host).
- The bill is an even split for now; the usage-based split in `packages/domain` isn't wired to the page yet.

## 11 10 2026: the tutorial, and one button to reset the demo

Jib's ask: a guided tutorial before the real lobby, on a small map, that ends with your first project live; take it
again from settings; and a button that resets the whole demo. Two subagents (API, web), reviewed and run end to end.

| What | Where |
|---|---|
| **The workshop**: a tutorial house, `atelier` ("L'Atelier"), seeded live with the same dev key as Sacré-Cœur, hidden from the city, run by its own caretaker. Each learner gets a room there (`tuto-<login>`) | seed, `GET/POST /api/tutorial*` |
| **The tutorial** in the lobby: a one-block neighbourhood (`generateNeighbourhood(…, { small: true })`), a private presence place, travel and find off, and a coach card with six steps: walk to the workshop · press E · take a room · run the sample (watch it build, open it) · link GitHub (install the App, or skip) · into the city. Starts after the welcome for anyone logged in who hasn't done it; "Skip the tutorial" and "Into the city" both mark it done on the profile | `components/lobby/tutorial/*`, `LobbyView.vue`, `users.tutorial_done_at` |
| **Take the tutorial again** in settings: the server forgets your workshop room and the done mark, and the lobby starts over | `SettingsPane.vue`, `POST /api/tutorial/reset` |
| **Reset the demo city** in settings (when `COLOC_DEMO_RESET=1`): asks once more, then online caretakers drop the rooms that won't exist, every house is deleted and the seed replanted, everyone's tutorial mark cleared; people and logins stay; this browser forgets its settings, lamps and tours and reloads | `apps/api/src/demo/*`, `POST /api/demo/reset`, `GET /api/auth/config` (`demoReset`) |
| **Two caretakers on one machine**: route files and router names now carry the house (`sacre-coeur--jib-prod.yml`), each caretaker only syncs its own house's containers, and files from before the naming are cleaned up once | `apps/agent/src/proxy.ts`, `room-spec.ts` |
| **Routes end at the walls**: a route whose last cell sat on a corner of the goal rectangle, just out of reach, takes one more straight step to the building | `Lobby.ts` |

### Verified (as Jib, in the browser)
"Reset the demo city" from settings put the nine seeded houses back (le QG and Test Villa gone), kept Jib logged in,
cleared this browser's settings and reloaded onto the welcome. With the workshop's caretaker running beside
Sacré-Cœur's, the tutorial started by itself: walking to the workshop and E opened its inside; "Take a room" made
`tuto-jib`; "Run it" cloned, built and started the sample (the caretaker's log shows the four steps) and the coach
said "It's live. Open it ›"; `http://tuto-jib.coloc.localhost:8000` answered through Traefik, and so did Jib's and
Awa's rooms in Sacré-Cœur (house-scoped route files side by side); the GitHub step offered the real install link for
`la-coloc-dev` and was skipped; "Into the city" marked the profile done and rebuilt Dakar. "Take the tutorial again"
from settings removed the workshop room, cleared the mark and restarted the coach.
Tests: 175 (domain 14, protocol 4, agent 13, db 2, API 115, web 27). Build and `licences:check` pass.

### Rough edges
- The GitHub step only reports "linked" for someone who lives in exactly one room; a chef with a room elsewhere
  (Jib) would never see it, so the step is skippable.
- The workshop's caretaker is a second local process (`docs/dev.md` has the command); on the real server it's one
  more systemd unit with the same key.
- The demo reset deletes every chat message, since messages aren't tied to a house in the schema.

## 11 10 2026, later: the tutorial, one thing at a time

Jib played the first tutorial and found it overwhelming: every HUD piece, the site's header and the coach at once.
Rebuilt by four subagents (engine, tutorial flow, the inside panel, a GitHub fix), then run end to end.

| What | Where |
|---|---|
| **A hand-made map** for the tutorial: one 60-unit street, a square to start in, tree lots and a park (nothing rentable), the workshop at the far end, about six seconds' walk | `lobby/tutorialMap.ts` (tests) |
| **One thing at a time**: a welcome card on an empty screen (no header, no HUD), then walk in all four directions, dash, the map (opened and closed), every key (?), the camera flies to the workshop and back, turn with Q and R, walk there and press E. Each step only switches on its own controls and reveals its own piece of the HUD | `tutorial/tutorial.ts` (a DOM-free step machine, 10 tests), `useTutorial.ts`, `Coach.vue`, `Welcome.vue`, `LobbyView.vue`, `lobbyUi.chrome` |
| **Engine hooks**: `onAction` (walk directions, dash, turns), `setControls` (walk/dash/turn on or off, houses-only targets), `showSpot` (a camera tour that resolves when it's back), `frame("left")` | `Lobby.ts` |
| **Windows on the right**: the inside panel docks on the right with no dark scrim; the camera zooms in and puts you at 28 % across | `Inside.vue`, `Lobby.ts` (`frame`) |
| **A rundown of the window** before the first room: four coach marks (the header, the actions, the panels, the rooms) | `house/Rundown.vue`, `HouseInside.vue` |
| **Detected, not clicked**: opening your live room (the coach's link, or any link to it in the window) says "Well done."; linking GitHub too | `tutorial.ts`, `Inside.vue` (`link`) |
| **The ending**: "That's it." says what your room is and what it can do; then a second welcome for the city (meet developers, visit houses, the map, other cities, settings for help) | `Coach.vue`, `Welcome.vue` |
| **GitHub linking mid-tutorial**: an install by someone still in the tutorial links to their workshop room, even if they live in a real house too; `linked` counts any room they live in | `github/chores.service.ts`, `tutorial.service.ts`, 7 tests |

### Verified
In a headless Chrome with its own throwaway profile (the app's browser pane was hidden, which freezes animation
frames and stalls requests), logged in as Jib: the start showed only the welcome card; every step advanced on the
real key events; the camera tour went to the workshop, held, came back and resolved; walking in opened the window
with the rundown, framed with Jib at 28 % across and the panel from 52 %; the room was taken, the sample built and
went live, opening it said "Well done."; GitHub was skipped; "Into the city" and "Let's go" left the full HUD on
Dakar with the profile marked done; no errors. Then the demo was reset from the API.
Tests: 197. Build and `licences:check` pass.

### Rough edges
- Other learners' workshop rooms show up as flatmates standing outside the workshop.
- On touch screens the dash and keys steps are skipped (no Shift, no key list).
