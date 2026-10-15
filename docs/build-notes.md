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

## 10 10 2026, early morning: panels that fit, like a pause menu

(The two sections above are headed "11 10 2026", but their commits are from 9 October; this one is 10 October.)

Jib reviewed every panel and found them unintuitive: they scrolled, the house view had a row of icon buttons and a
tab bar with the same words, "Run", "project", "Redeploy" and "Restart" were never explained, room cards didn't say
what anyone builds, and the workshop was empty. Then they added: floating cards that feel like a game's pause menu,
not website UI, paired with the camera zoom. Rebuilt by four subagents on a shared panel kit written first.

| What | Where |
|---|---|
| **A panel kit** every inside panel is built on: a fixed head, one row of tabs as the only navigation, a body that fits (only a chat, logs or a long history scroll, inside themselves), one next step in the foot; dense rows (face, name and project, state, one action) instead of tall cards; one place for the words (house, room, project, put online, update, restart, knock) | `lobby/panel/` (`Panel`, `PanelHead`, `PanelTabs`, `ListRow`, `StatusPill`, `words.ts` + test) |
| **The sheet as a pause menu**: a floating card centred on the right that pops in; the HUD around it (who's here, the round tools, the minimap) steps back while it's open; the camera frames you on the left even when the window opens from the address bar | `Inside.vue`, `LobbyView.vue` |
| **The house**: the people as a crew row under the name (chef's crown, you ringed, knockers at the door, empty seats); rooms as rows saying who builds what and whether it's online, with Visit / Open / Knock; one foot action per viewer; tabs only for flatmates; the rundown rewritten in plain words | `HouseInside.vue`, `house/Crew.vue`, `house/crew.ts` (tests), `house/Rundown.vue`, `FridgeDoor.vue` |
| **The room**: what a room is and its address under the name; Overview / Code / Secrets / Logs / History; "Put online" or "Update" and "Restart" as big tiles with a line saying what each does; editing the project and the code as short step flows | `RoomPage.vue`, `room/*` (tests) |
| **Knocks and people**: the knock thread fits (vote strip, chat filling the rest); knocking twice goes straight to "You've already knocked"; the person card shows what they build and if it's online, and "See your knock" when you have one; game-menu cards | `ApplicationPage.vue`, `ChatPanel.vue`, `KnockSteps.vue`, `PersonCard.vue`, `HouseCard.vue`, `EmptyCard.vue`, `LobbyCard.vue`, `cards.ts` (tests) |
| **L'Atelier inhabited**: a host (Ndèye) and four learners with small first projects, as example rooms (`rooms.demo`): shown online, nothing runs, the caretaker's snapshot leaves them alone, they can't be put online, never asked to review; the tutorial's sample is named "Hello" in your room | `seed/city.ts`, migration `0009_demo_rooms`, `houses.service.ts`, `rooms.controller.ts`, `chores.service.ts`, `tutorial.service.ts` (tests) |
| **Plain tutorial words**: "Put it online", what a project and a room are, "Fetching the code… Building… Starting…" from the deployment's real step, what linking GitHub does | `tutorial/Coach.vue`, `Welcome.vue`, `tutorial.ts` |
| **API fields**: `HouseView.tutorial`, `rooms[].demo`, the city's `projectDescription`, `me.knocks` (open knocks) | `houses.service.ts`, `auth/*` |

### Verified
In a headless Chrome with a throwaway profile, at 1440×900, logged in as Jib: the whole tutorial ran on the new
panels (the workshop's five example rooms, the rundown in four steps, "Take it", "Put it online", the live room,
GitHub skipped, the room panel); then, in dark and light, Sacré-Cœur as its chef (Rooms, Channel, Chores, Fridge,
Bill), Jib's room (Overview, Code, Secrets, Logs, History), Almadies as a visitor: every one measured 715 px tall
with zero scroll in the sheet and in the panel body. A second dev login knocked on room-4 through the three steps,
landed on the thread (it fits), and the house then offered "See your knock"; the knock was withdrawn. No errors.
Tests: API 132, web 76. Build passes.

### Rough edges
- The crew row and the rundown's first bubble overlap while the bubble is on the header.
- Reviews given show on a room row only once there are some.

## 10 10 2026, night shift: the rest as pause menus, the rule switch, the list view

Jib asked for a batch to run while they slept: three subagents, one chunk each, committed separately.

| What | Where |
|---|---|
| **Pause menus everywhere else**: renting the server (sizes as tiles), starting a coloc, settings as an options menu (City Walk/List, Look Auto/Day/Night, Graphics, Calmer motion, Sounds, then the tutorial, the welcome and the demo reset as big buttons), the controls screen, the key strip, the big map, the character picker, the coach and welcomes, the loading screen, and the find and travel sheets: flat floating cards, chunky icon buttons, no text-link actions, no blur | `RentServer.vue`, `RentSteps.vue`, `SettingsPane.vue`, `KeysSheet.vue`, `KeyLegend.vue`, `Minimap.vue`, `Onboarding.vue`, `Coach.vue`, `Welcome.vue`, `LoadingScreen.vue`, `LobbyView.vue` (sheets) |
| **The house rule switches for real**: `PATCH /api/houses/:id/rules`, chef only, a note on the fridge; the chef's chip in the panel, a read-only pill for everyone else | `houses.controller.ts`, `houses.service.ts` (4 tests), `HouseInside.vue` |
| **A dash button on phones**, with the cooldown as a ring | `lobby/TouchDash.vue`, `LobbyView.vue` |
| **The list view** reads like the lobby: the house page is the lobby's house panel plus cards for knocks, use, builds and facts; the city page is dense house rows with a search and a filter | `HousePage.vue`, `CityPage.vue`, `RoomCard.vue`, `list/*` (tests) |

### Verified
The rule switch through the API as Jib (relaxed, then strict again, each with its fridge note; a non-chef gets 403).
In headless Chrome: every lobby panel and tab re-measured at 715 px with zero scroll after the restyle, no errors;
the list view's city and house pages in light and dark; the subagent checked every restyled screen at 1440×900,
1280×640 and phone width in both themes. Tests: API 136, web 88. Build and `licences:check` pass.

### Rough edges
- The find and travel sheets copy the row's look in CSS rather than using `ListRow`.
- Settings' new icons (sun, moon, walk, list…) live in `SettingsPane.vue`, not `icons.ts`.
- The loading screen is light in day mode now, so the city fades in from a light screen.

## 10 10 2026, review fixes: the API side

The adversarial review (`docs/review-2026-10-10.md`, moved from the repo root on 12 10) said the exchange was invisible: ledgers at zero, no reviews as
rent, no tontine, no mobile money. Four agents fixed it in parallel; this is the API's part.

| What | Where |
|---|---|
| **Reviews as rent (R15)**: each review done this month knocks 500 FCFA off its reviewer's line. Whoever let reviews go late pays for those credits, at most 500 per late review; the house pool pays the rest, so the lines add up to the total minus the pool | `packages/domain/src/bill.ts` `creditReviews` (5 tests) |
| **Tontine turns (R17)**: a fortnight each, in tontine-position order, counted from Monday 21 09 2026 for every house, so turns pass on the same Monday everywhere and never depend on when someone looked | `packages/domain/src/tontine.ts` `tontineTurn` (3 tests), `apps/api/src/houses/money.ts` |
| **The city's live exchange (R12, R19, R32)**: per house `openChores`, `lateChores`, `knocking`, `reviewsThisMonth`, `tontine`, and per room `building` (its latest prod deploy, `rooms.lastDeployId`, still on its way and updated in the last 15 minutes). On the city stream too | `houses.service.ts` `city()` |
| **The house page**: `reviewsThisMonth` and `tontine` for everyone, `bill` for flatmates; `POST /api/houses/:id/bill/paid` marks your own line paid (a mock; no money moves) | `houses.service.ts`, `houses.controller.ts`, migration `0010_bill_payments.sql` |
| **Mobile money (R16)**: operator names per country, text only. Amounts stay in FCFA | `money.ts` |
| **Demo reset (R7)**: only for `COLOC_ADMINS` (default `jib,Djbrl` when the dev login is on), at most once every ten minutes; `GET /api/auth/config` says `demoReset` per viewer | `demo/*`, `auth.config.ts`, `auth.controller.ts` |
| **A free room is empty (R24)**, whatever runs there, and the caretaker is asked to clear a free room that still has containers (the existing `remove_room` command) | `houses.service.ts` `applySnapshot`, `agents.gateway.ts` |
| **A month of life (R4)**: Sacré-Cœur's ledger (Awa 7/5, Jib 5/6, Moussa 4/5), two open reviews on `Djbrl/coloc-test` (one late), a dozen messages in English, French and a little Wolof, fridge notes, 3–5 deploys per lived-in room, part of the bill paid; demo houses get reviews, a short chat, notes and deploys too. Seed rows only: nothing calls GitHub, no @-mentions. The dev seed and the demo reset plant it; tests start from the bare city | `apps/api/src/seed/life.ts`, `seed/city.ts` (`life: true`) |
| **Apps that know where they live (R14)**: every deploy gets `COLOC_ROOM`, `COLOC_HOUSE`, `COLOC_CITY`, `COLOC_COUNTRY`, `COLOC_LOGIN`, `COLOC_NAME` (reserved: secrets can't use them). The tutorial's Hello is a calm page greeting in the city's language ("Nanga def, Awa!"); new `examples/ndaje` (a shop, FCFA prices, a mock mobile-money button) and `examples/prix-marche` (Sandaga and Tilène prices). Awa's and Moussa's seeded rooms point at them | `rooms/room-deployer.ts`, `examples/*` |
| **Ship hygiene (R10)**: `start.html` moved out of `public/` to `apps/web/dev/` (dev server only, at `/dev/start.html`); `lang="en"`; English description and Open Graph tags; README status | `apps/web/dev/start.html`, `apps/web/index.html`, `README.md` |

### Verified
Tests: domain 22, protocol 4, db 2, API 149 (9 new in `houses/exchange.test.ts`, 4 new in `demo.test.ts`, 1 in
`rooms.test.ts`). `npm run build -w @coloc/api` passes. A seeded city printed as expected: Sacré-Cœur shows 2 reviews
waiting (1 late), 7 this month, Awa's turn until 19 10, and a bill of 3 800 / 2 800 (paid) / 2 400 FCFA with
3 000 FCFA from the pool. The example apps were run locally with `node` and answer both a browser and curl.

Follow-ups: a knock's thread now carries the applicant's `work` (their top 3 public repos, read once at GitHub login
into `users.github_repos`, migration `0011`; empty for dev logins; and reviews given and received in every house), and
the house no longer writes room slugs: "knocked on a free room", "moved in", "moved X into their room", "restarted
Awa's app", and crash/deploy notes say "A free room" rather than a slug when nobody lives there. API tests: 152.

### Rough edges
- The tontine's turn changes at midnight without an event, so an open city stream shows it after the next change.
- The examples only reach rooms once this commit is pushed: the seed points at `Djbrl/la-coloc`'s `examples/`.
- Seeded PR links on `Djbrl/coloc-test` may not match real pull requests there.

### The web's part (World, Lobby UI and Panels agents)

| What | Where |
|---|---|
| **A city that is the status page (R12, R8, R19, R32)**: one window per room (warm: online, blue + placard: free, red flicker: down, dark: not built yet), a crane and scaffold while a room builds, the whole house dark when its caretaker is offline (délestage, with a sputter and a clunk), fireworks and a toast when a project goes live, a reviews board on the market square, a visitor with ☝️ at doors with an open knock | `lobby/windows.ts`, `live.ts`, `fireworks.ts`, `props.ts`; `LobbyView.vue` diffs the city stream |
| **Each city its own (R20, R29)**: palette (the Kenney colour atlas recoloured per city), ground (sand, laterite, terracotta, zellige, stone), zebra crossings and traffic lights only where they belong, water tanks and rebar, a baobab in Dakar, palms, pirogues on a sea for coastal cities, wax-print parasols; light from the city's real local time, lamps on at dusk | `lobby/cityStyle.ts`, `tint.ts`, `daylight.ts`, `textures.ts` |
| **The lobby explains itself (R1, R2, R5, R13)**: a 4-step welcome about the product; the top line is city news ("Dakar: 7 projects online, 2 reviews waiting."); the tutorial teaches walking and going in, the rest are one-time tips | `Onboarding.vue`, `tutorial/*`, `tutorial/tips.ts` |
| **Africa (R18)**: "Where to?" is a hand-drawn map of Africa, a dot per city, with its houses, who's around and its local time; arriving greets you in the city's language | `lobby/AfricaMap.vue`, `africa.ts` |
| **The exchange on screen (R15, R16, R17)**: the Bill tab says what each flatmate's reviews took off and what they owe; "Pay your share" offers the country's mobile money (a mock); the tontine is a row of faces with the current one lit | `house/exchange.ts`, `house/PayBill.vue`, `HouseInside.vue` |
| **No labels (R26)**: pills and tiles became sentences with a coloured dot (`panel/StatusDot.vue`); Settings rows are sentences | `room/RoomOverview.vue`, `SettingsPane.vue`, `list/*` |
| **Keyboard and phones (R6, R27, R28)**: Tab reaches the page before the city and never gets trapped; one-key shortcuts only while the city has focus, and a switch in Settings; phones get a one-line top and a 70% sheet with the house framed above it; slow devices start in Low and are offered the list | `LobbyView.vue`, `Lobby.ts`, `settings.ts` |
| **Links (R3, R9, R10)**: a link into a house puts you at its door and skips the tutorial (a "Take the tour" chip instead); tab titles follow the place | `LobbyView.vue`, `App.vue` |

Verified: web tests 113, `vue-tsc` clean, production build passes. Each agent checked its part in its own headless
Chrome (desktop and 390×844); the lead then walked the merged app: the visitor welcome, a link into Sacré-Cœur as
Jib (tontine line, 7 reviews this month, the Bill tab adding up to 12 000 FCFA minus the 3 000 pool), and the Africa
map. Draw calls in Dakar: 113 at spawn, 142 zoomed out.

Still open: the tutorial's workshop map (L'Atelier) has no city style yet; the key strip still shows words beside
its keycaps; the house panel keeps a "Strict" chip next to the sentence that says the same; Kigali's hills and roof
smoke; French.

## 12 10 2026: the core can go down, and a repo a teammate can start from

Jib stopped Docker on purpose to see what the product does without its database, and asked for a graceful break: the
player stays in the experience, can retry or wait, and it heals by itself. They also asked for a contributor guide, a
repo sweep, an install guide and a to-do list, to hand to a teammate starting the next day. Four subagents (API, web,
docs) on disjoint files, then a real run against the dead database.

| What | Where |
|---|---|
| **The API survives without Postgres**: it opens its port first, connects and migrates in the background (1 s growing to 15 s, for ever), and meanwhile every route except `/api/health` answers 503 `{code:"core_down"}`; a database that dies later gives the same 503 and heals with no restart; agents are closed with 1013 and redial; the lobby socket and the late-chores sweep survive a failed query; a lobby race that made ghost players is fixed | `apps/api/src/core/` (`core.ts`, `retry.ts`, `core.guard.ts`, `core-down.filter.ts`, `health.controller.ts`, `streams.ts`, `process-guard.ts`), `packages/db/src/errors.ts` and `index.ts`, gateways |
| **The site stays playable**: a fetch wrapper recognises "the core is down" (network error, 502/503/504, `core_down`, an empty 500 from the dev proxy); a floating card says so, counts down to the next try (2, 4, 8, 15, then 30 s), has Try now and Hide, then "Back online"; panels show "Waiting for the city…" and reload by themselves; writes return a friendly failure and keep what you typed; open streams reopen when the core returns; no redirect to the login page; the tutorial waits instead of saying it isn't on this server | `apps/web/src/core.ts`, `stream.ts`, `CoreStatus.vue`, `Waiting.vue`, `session.ts`, the panels, `LobbyView.vue`, tutorial |
| **A repo to start from**: a docs index, `CONTRIBUTING.md`, `TODO.md` (prioritised, sized, with good first tasks), an install and run guide verified from a fresh clone (install, build, 306 tests, licences), PR and issue templates, `.nvmrc`, `.editorconfig`; the old review and the old agent handoff moved into `docs/` | `README.md`, `CONTRIBUTING.md`, `TODO.md`, `docs/README.md`, `docs/dev.md`, `docs/archive/`, `.github/` |

### Verified
- The built API ran for real against a dead Postgres: `/api/health`, `/api/city`, `/api/me` and `/api/houses/atelier` all
  answered 503 `core_down` directly and through Vite, one calm log line, the process stayed up. In a headless Chrome the
  lobby rendered with the card and a countdown, and walking still worked. Scenarios with a stand-in API that fell and
  came back mid-session (panel, chat draft, stream, tutorial) recovered with no refresh.
- Recovery against a real Postgres restart was only tested with fake connections and a fake API: try
  `docker stop coloc-db` and `docker start coloc-db` with the site open.
- Tests: 417 (db 13, domain 22, protocol 4, agent 13, API 188, web 177). Build and `licences:check` pass.
- The docs agent ran `npm ci`, `npm run build`, `npm test` and `licences:check` from a fresh clone of the last commit.

### Rough edges
Listed in [TODO.md](../TODO.md) (D9 and the others). The Vite override is `COLOC_DEV_API`, not `COLOC_API_URL`, which is the caretaker's.

## 15 10 2026, night: French (M5)

Jib asked for the first-visit path in French overnight (welcome, tutorial, the lobby's top line and news, the house
panel, the bill, settings, and the switch itself), built so the rest could follow without rework; then as much of
the rest as time allowed. Branch `french-ui`, not merged. Claude Code did the engine and the first-visit path, and
three subagents did the room, knock and rent, and list and login screens on disjoint files; everything was read and
checked before committing.

### How it works (for the jury)
- **No library.** `apps/web/src/i18n.ts` is about 100 lines. Each area writes its words twice:
  `defineWords("house", { …English… }, { …French… })`. A word is a string, or a small function for a sentence with
  numbers or names in it (`owes: (who, you, amount) => …`).
- **A missing French key does not compile.** The French object's type is computed from the English one (`Words<T>`):
  a missing key, an extra key or a function with other arguments is a type error, so `npm run build` (vue-tsc) fails.
  `i18n.test.ts` checks it too at run time (same keys, nothing empty), and that the build-breaking cases really fail.
- **Switching is live.** `defineWords` returns a proxy that reads `language.lang` (a Vue `reactive`) on every access, so
  any template or computed that reads a word redraws when the language changes. Lists built once at setup were turned
  into `computed`s or functions for that reason.
- **The language** starts from what this browser chose (`localStorage` key `coloc.lang`, wrapped in try/catch), else
  `navigator.language` (any `fr…` is French, anything else English). `<html lang>` follows it. The switch is the first
  row of Settings: a globe, a sentence ("The city speaks English." / "La ville parle français."), and EN / FR, each
  named in its own language for screen readers.
- **French typography** is automatic: the dictionaries are written with plain spaces, and the French ones get no-break
  spaces before `: ; ! ? %` and inside « ». Counting follows each language (`plural`: "1 room", `pluriel`: "0 chambre").
  Dates use Intl in the chosen locale ("1er novembre"); amounts keep the existing FCFA format ("12 000 FCFA").
- **Where the words are:** `components/lobby/panel/words.ts` (the shared vocabulary: house, room, knock, states),
  `lobby/house/words.ts` (house panel, bill, tontine, paying), `lobby/tutorial/words.ts` and `tips.ts`,
  `components/words.ts` (welcome, settings, lobby HUD, chat, fridge, waiting), `lobby/words.ts` (cards, top bar,
  loading, keys, minimap, outage card), `room/words.ts`, `joinWords.ts` (knock, rent), `list/words.ts` (list view,
  login), `core.ts` (`downWords`), and each city's greeting meaning in `lobby/cityStyle.ts` (a typed `fr` part).
- **The French says "vous"** throughout, in plain words: maison, chambre, colocs, frapper (a knock is "une demande"),
  revue de code (relire), mettre en ligne, construction, merge, dépôt, corvées, frigo, facture, salon (the group chat).

### Verified
- Tests 426 (web 186, with the new `i18n.test.ts`), `npm run build` (vue-tsc) and `licences:check` pass.
- In a browser against a throwaway stand-in API (the real one and Postgres were not running, and were not started), at
  1280×640: the welcome, the tutorial's first steps, settings (fits, 597 of 608 px with the demo reset showing), the
  top line and tips, the find menu, a house card, and every tab of the house panel. Each panel tab and the pay sheet
  measured the same height in French as in English, after shortening two French tab lines and the pay sheet's note.
  The welcome card on a 375 px phone: "Passer le tutoriel" takes two lines inside its usual button height.
- Not seen on screen: the room window, the knock and rent dialogs and the list's house page (no stand-in for their
  routes); they are type-checked and tested only.

### Still English
- **Sentences the API writes**, shown as they come: error messages (`res.message`, every controller), the fridge notes
  (`apps/api/src/houses/fridge.ts`, stored as text, and the rules note in `houses.service.ts`), the system lines in a
  knock's thread (`doorbell/doorbell.service.ts`), deploy step details, the PR comments on GitHub, and the seeded city
  (taglines, project descriptions, chat). Translating them cleanly means sending a kind plus parameters instead of
  text: a separate API change.
- `index.html`'s title and share description (static, read by link previews).
- The walk keys are the letters W A S D, read by `e.key`: on a French AZERTY keyboard they sit apart. Reading
  `e.code` (Z Q S D on AZERTY) is a behaviour change for the engine, not a translation; noted in TODO.

### Words for a native speaker to check
- **Register and anglicisms:** "vous" everywhere; "merge" / "mergez" kept (vs "fusion"); "revue de code" / "relire" for
  review; "logs"; "PR" invariable; "sprint" for dash; "Salon" for the group-chat tab; "Corvées" for chores.
- **Knocks:** a knock is "une demande" ("Voir ma demande", "Demande envoyée"); "Déjà frappé"; "Emménagé"; "Faire
  entrer"; "Il faut 3 oui pour entrer".
- **Gendered words** that assume masculine or a fixed noun: "Prêt à frapper ?", "Prêt à lancer ?", "vous en êtes le
  chef", "Le chef a ouvert la maison"; "Elle a 256 Mo…" (elle = la chambre); "il n'y a que vous en balade".
- **Phrasings:** "Une ville de maisons de devs"; "Bienvenue à La Coloc" (vs "dans"); "@awa · vit à Keur Dev, Dakar";
  "Ouverte à qui met des projets en ligne" (for "Open to anyone who ships"); "la maison se mobilise pour Prix Marché,
  le projet de Moussa"; "La caisse commune de la maison"; "Pas d'argent réel pour l'instant : votre part est juste
  marquée payée."; "Revues strictes / souples"; "Résumé" for the room's Overview tab; "Constructions" for Builds;
  "Petit / Moyen / Grand" server sizes; "le gardien" for the caretaker; "Identifiant" for login name.
- **Greetings' meanings** in `cityStyle.ts`: Fon "A fɔ́n ganjí à ?" given as « Bien réveillé ? ».

## 15 10 2026, overnight: a UI refresh, between a dev tool and a game (branch `ui-refresh`)

Jib asked for a state-of-the-art look at the crossroads of a developer's dashboard (Vercel, Linear, Supabase, Neon,
GitHub) and a game (launchers, game sites, web toys), keeping the rules: flat floating cards, no glass or blur, day and
night, panels that fit, one navigation per panel, ListRow for lists, icons over words, keyboard first. Styles and
structure only: **no wording changed** (the French translation is on `french-ui`), no behaviour, route, API or 3D change.

**The direction.** One rule: game energy on titles, the main action, toasts and celebrations; dev-tool calm on data,
lists and settings. Titles and house names in a bold display face (Bricolage Grotesque); anything technical (an address,
a size, money, a key) in a monospace (JetBrains Mono); body text stays the system face. One saturated signature, a
wax-print orange (`--accent-fill` `#f2600f`, dark ink on it: 5.8:1), the same in day and night. The primary button is a
game's key with a solid lip under it that sinks when pressed (no blur); quiet buttons have a grey edge and a small lip.
Cards, rows and inputs have 1px hairline edges, status dots a soft halo of their colour (amber breathes while building),
switches are ON/OFF pills with power marks (I and O, nothing to translate). Motion is 120 to 240 ms with a tiny overshoot
on things that appear; reduced motion turns it off.

| What | Where |
|---|---|
| **Tokens**, day and night: surfaces (a warm paper day, a near-black night), text, `--line` and `--line-strong` edges, the orange (`--accent`, `--accent-fill`, `--accent-lip`, `--accent-soft`, `--on-accent`), status with soft tints, `--free` blue for free rooms (the city's free window), a type scale (`--t-*`), radii (`--r-xs` 6 to `--r-xl` 20, `--r-pill`), spacing (`--s-1` to `--s-6`), the lip (`--lip`, `--lip-pressed`), `--quiet-edge`, motion (`--dur-fast`, `--dur`, `--dur-slow`, `--ease`, `--ease-pop`). The classes `tone-night` and `tone-day` give any box that theme's tokens | `apps/web/src/style.css` |
| **Fonts**, self-hosted from npm, Latin and Latin Extended only (about 22 KB per face and weight; the Extended file loads only for letters outside Latin): Bricolage Grotesque 700 and 800, JetBrains Mono 500. OFL 1.1, now allowed by `licences:check` | `apps/web/src/fonts.css`, `docs/licences.md` |
| **Shared pieces**: primary and quiet buttons, keycaps (`kbd`), the switch, segmented controls, status pills and dots, the meter, the toast, the city's name flags; the panel kit (Panel's foot under a hairline, PanelTabs, ListRow as a dashboard row with the orange stripe for yours, StatusDot), LobbyCard, the key strip, the house window, the top bar, settings | `style.css`, `components/lobby/panel/`, `LobbyCard.vue`, `KeyLegend.vue`, `Inside.vue`, `App.vue`, `SettingsPane.vue` |
| **The city's HUD**: the place as a breadcrumb (`/ Dakar ›`), the live line with a green dot, the tools and emotes as keys, the prompt with the orange "Go in" key; the loading screen always dark, with a blueprint grid and a striped bar (closes TODO D6's "light in day mode"); the welcome card and the coach | `LobbyView.vue`, `LoadingScreen.vue`, `tutorial/Welcome.vue`, `tutorial/Coach.vue`, `TouchDash.vue`, `CoreStatus.vue`, `Minimap.vue` |
| **The screens**: house panel (chips, free door, face dots, bill amount in mono), pay sheet, room overview (dashboard cards, Update as the orange tile), room code rows, renting a server (plans like a cloud provider's table), knock and rent sheets, keys sheet, onboarding; every hard-coded corner mapped to a radius token | `HouseInside.vue`, `HouseCard.vue`, `house/*.vue`, `room/*`, `KnockSteps.vue`, `RentSteps.vue`, `KeysSheet.vue`, `Onboarding.vue`, the list view |
| **A style guide** at `/styleguide`, development builds only (the route is behind `import.meta.env.DEV`, and the page is absent from a production build): every shared piece in day and night side by side, with made-up data, no API needed | `apps/web/src/pages/StyleGuide.vue`, `main.ts` |

**Mobbin references** (what inspired what):
- Vercel deployments list and deployment page: status dots with a word, hashes and addresses in a monospace, dense hairline rows → ListRow, StatusDot, `.meta` in mono. [deployments](https://mobbin.com/screens/e9576405-bcef-419a-922a-8fb84b044a54), [deployment](https://mobbin.com/screens/ff81f1e9-25b1-46f9-8448-31fa40a77e4b)
- Vercel domain page: the breadcrumb top line and hairline-edged cards → the HUD's `/ Dakar ›`, the room's dashboard cards. [domain](https://mobbin.com/screens/ff211943-e1c1-4d25-ab63-c320cb35b9f8)
- Linear menus with shortcut keys beside each action → the key strip and keycaps. [menu](https://mobbin.com/screens/f71cec1e-a119-485b-9164-969169030e1a)
- Gumloop and Replit settings: rows on a hairline card, a switch at the end of each → settings rows and the switch. [Gumloop](https://mobbin.com/screens/0c331a3c-1fe8-4f4e-b77f-87e50ec63555), [Replit](https://mobbin.com/screens/cb92d9f4-8e47-4e53-bacf-9b61986de96a)
- NYT Games (Spelling Bee) and fal: a bold display title with one big action → titles in the display face, one chunky primary per view. [NYT Games](https://mobbin.com/screens/e9f8583e-38f8-40ea-9af8-7f879ee798be), [fal](https://mobbin.com/screens/1cac66e7-f3c2-484e-aa6a-39d005519a1a)
- Browserbase: a saturated orange on a calm developer page → the wax-print orange as the one signature. [Browserbase](https://mobbin.com/screens/6a3a60c3-4d9c-422e-91c3-c0417f6239d3)
- Microsoft Copilot's gaming controls card: keys as caps in groups → the keys sheet. [Copilot](https://mobbin.com/screens/87443be7-fcdd-4de0-be4a-4d83ad36a33a)

Screenshots of the style guide (day left, night right): `docs/screenshots/ui-refresh/styleguide-primitives.jpg`,
`styleguide-card-and-panel.jpg`, `styleguide-coach-welcome-loading.jpg`.

### Verified
- In the browser (Vite on its own, no API, no Docker touched): the style guide at 1440×900 in both themes; the lobby (the
  street the site shows while the core is down) in day and night at 1440×900 and 375×812, with the HUD, the key strip, the
  minimap and settings, which fits at 1280×640 and as a bottom sheet on a phone.
- `npm test -w @coloc/web` (177), `npm run build` (vue-tsc and Vite) and `npm run licences:check` pass.
- Not seen for real: the house panel, the bill, the room page and the knock with live data (the API wasn't running). The
  style guide shows the panel kit with made-up data; look at the real screens with the API before merging.

### How to revert
It is all on the branch `ui-refresh`, six commits on top of `d452316`. Not merging it is the revert; after a merge,
`git revert` the commits (or the squash). The fonts commit is separate if only the type should go.

### Rough edges
- Wording untouched, so some places still say in words what an icon could (D6's key strip words, the "Strict" chip).
- The find and travel sheets still copy ListRow's look in CSS (now the new look), rather than using ListRow (D6).
- The 3D scene's own colours (sky, windows) are unchanged: they don't come from the tokens.
- `.toggle` and `.segmented` are now global classes in `style.css`; a component that uses those names for something
  else would inherit them (none does today).
- The orange fill is the same in both themes; the disabled primary in night reads a little brown.
