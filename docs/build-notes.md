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

The adversarial review (`docs/archive/review-2026-10-10.md`, moved from the repo root on 12 10) said the exchange was invisible: ledgers at zero, no reviews as
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

## 15 → 16 10 2026, overnight: "Your first home", the first visit as a quest (branch `first-home`)

Jib's ask: gamify getting your first server running; make GitHub, deploy and "your URL" fun and dumb easy, one step at a
time, ending with the project live and shared; make the deployed page look like something; simplify the fridge and the
chores. Built on `ui-refresh-fr` (French and the new look). Claude Code led and wrote the quest; three subagents did the API
and the starter page, the house panel, and the engine (beacon, minimap pin, sounds), on disjoint files; a fourth wrote a
throwaway stand-in API for the browser checks (not committed). Every diff was read before committing.

### The quest, as a player meets it
A tracker at the top holds eight stamps on a string; the chapter you're in breathes, a finished one is stamped in the
orange with a thump and a line of news ("Chapter 3 done. Well done!"). Each chapter is one card at the bottom, and moves
on by itself when the game sees it done.

| # | Chapter | What you see and do | Detected by |
|---|---|---|---|
| 1 | Arrive | The welcome card ("In five minutes: your own room, your project online, and a link to show your friends."), then walk | a walk key, a click or a tap |
| 2 | Find a home | The camera flies to an orange **beacon** at L'Atelier's door (a ring, a column of light, a diamond) and back; the minimap pins it; walk there, press E; the window opens; take the free room | going in; the API saying the room is yours |
| 3 | Get the keys | The window closes; a card drops a **key** on a ring with your room's name on its tag; the keys jingle. "Move in" | one press (a ceremony) |
| 4 | Bring a project | Two tiles: **A ready-made page** (one press) or **My own, from GitHub** (opens the App's install page, where GitHub lists your repos; the card waits, then says "you/repo is linked" and offers "Put it online") | the API accepting the deploy; the API seeing the repo linked |
| 5 | Launch it | The crane on the house; a track of four stages in plain words (fetching your code → building → starting → live) with a tick for each, a clock, a striped bar; "It's live!", fireworks, your window lights up. A failure shows the build's own first line, "Try again", and (from GitHub) "Use the ready-made page" | the room's status from the API |
| 6 | Open it | Your address, big, in the monospace; one big "Open it" | the click on it (or on your room's link in the house's window) |
| 7 | Show it off | A **postcard**: your house drawn with your window lit, "From L'Atelier, Dakar", your address, a **QR code** to scan with your phone (desktop only), "Copy the link", "WhatsApp" (a `wa.me` link with the message ready) and "Share…" (the phone's share sheet where there is one); "Later" | copy, WhatsApp or share |
| 8 | Meet the house | The house's window opens on the tab each card is about, one idea per card: your flatmates; reviews ("Your flatmates review your code; you review theirs. Each review takes 500 FCFA off your rent."); news ("…your move is on it", the house's own welcome note) | Next (it's reading) |
| — | Welcome home | Your house drawn big, "Welcome home, Jib.", all eight stamps, your address, what's next; "Into the city" marks the quest done | |

**Resumable:** the API keeps the furthest chapter (`users.tutorial_chapter`). Coming back, the first card says "Welcome back.
You were at chapter 5: Launch it." with **Continue** (and "From the start"). Continue starts that chapter again from what it
needs: a failed launch goes back to choosing the project, a live one goes to its address, a lost room goes back to the door.
From chapter 3 on you're put straight at the workshop's door. **Skippable:** "Not now" on the first card, a × on every card
(the quest is in settings). One thing at a time: the screen starts empty; the tracker comes with chapter 2, the map and the
door prompt only while you look for the house, the rest of the HUD once you have a room (on a phone the round tools wait
for the city, and the map moves under the tracker while it points the way).

### The house panel, simplified (for everyone, not just the quest)
- The tabs say **Reviews** (was Chores) and **News** (was Fridge); the API keeps `chores` and `fridge`.
- Each tab opens on **one sentence about you**: "You have 1 review to do. Each one takes 500 FCFA off your rent." / "1 of your
  reviews is late…" / "Nothing for you to review…" / "3 notes this week." / the bill's total. A round **?** unfolds what the
  part is and why it matters (`panel/Explain.vue`, a disclosure button), so the simple version comes first.
- Reviews read as sentences, yours first ("Review Aïssatou's “Add a photo of Gorée”", "Due in 5h · repo#4"); the house's other
  reviews wait behind "See the house's other reviews (1)".
- News rows show the note itself (two lines), with an icon by kind (heart, warning, alert, info) and "14:02", "Yesterday" or
  a date.

### The starter page (`examples/hello/server.js`)
"Nanga def, Jib! I just moved in. Room jib of L'Atelier, Dakar." with its own address (from the Host header), a hand-drawn
house in inline SVG (baobab, wax-print band, your window lit, your room on the door plaque; sun by day, moon and stars by
night), a "Make it yours" card, and "Made in La Coloc" with when it started and the container. English or French by the
browser's language. Still one file and no dependency, built by the same Dockerfile; still JSON for curl. It reads the room
context variables the API already sets (`COLOC_ROOM`, `COLOC_HOUSE`, `COLOC_CITY`, `COLOC_NAME`…).

### Where it is
| What | Where |
|---|---|
| The step machine: chapters, steps, what each step reveals and allows, the stamps, resuming, the launch's stages (pure, tests) | `apps/web/src/components/lobby/tutorial/tutorial.ts`, `tutorial.test.ts` |
| Talking to the API (poll while a step waits, take a room, deploy the starter or the repo, save the chapter, finish) | `tutorial/useTutorial.ts` |
| The cards: coach, tracker, keys, launch, share (postcard, QR), Welcome home, the welcome / welcome back, the drawing, the icons | `tutorial/Coach.vue`, `QuestTracker.vue`, `KeysCard.vue`, `LaunchCard.vue`, `ShareCard.vue`, `HomeCard.vue`, `Welcome.vue`, `HouseArt.vue`, `QuestIcon.vue` |
| WhatsApp link and the QR code as one SVG path (`uqr`, MIT) | `tutorial/share.ts` |
| Words, English and French | `tutorial/words.ts` |
| Wiring into the lobby (beacon, map pin, camera, closing and opening the window, fireworks, sounds, phone layout) | `components/LobbyView.vue` |
| Beacon, `houseSpot`, minimap `goal`, sounds `stamp`, `keys`, `tick` | `lobby/beacon.ts`, `lobby/Lobby.ts`, `components/lobby/Minimap.vue`, `lobby/sound.ts` |
| House panel: summary + "?", Reviews and News | `panel/Explain.vue`, `panel/Panel.vue`, `HouseInside.vue`, `house/chores.ts`, `house/notes.ts`, `FridgeDoor.vue` |
| API: chapter (migration `0012_tutorial_chapter`), `POST /api/tutorial/progress`, `deploy { source }`, `room.why`, `github.repo`, room named after you, the welcome note | `apps/api/src/tutorial/*`, `packages/db` |

### How to explain it to the jury
- **The quest is a state machine with no I/O.** `TutorialMachine.send(event)` moves between steps; LobbyView only reports what
  happened (a key, a click, the API's latest word) and applies what the step allows (`SETUP[step]`: controls, HUD pieces,
  polling, beacon). That's why it has 30 plain tests and no browser in them.
- **Detected, not clicked:** the API is polled every 2 s while a step waits on it (room, project, launch, address); the
  launch's stage is the deployment's own step (`cloning`, `building`, `starting`) that the caretaker already reports.
- **The API remembers only facts** (the room, its deploys, the linked repo) plus one number: the furthest chapter. The story
  is the web's.
- **Room names are unique across houses on purpose:** a caretaker names a room's Docker network after the room alone, and the
  workshop may share a machine with another house; so Jib, who has room "jib" in Sacré-Cœur, gets "jib-home".

### Verified
- `npm run build` (vue-tsc and Vite), `npm test` (472: db 13, domain 22, protocol 4, agent 13, API 202, web 218) and
  `npm run licences:check` pass.
- **In a browser**, headless Chrome against the throwaway stand-in API (Docker, Postgres and the real API were not touched),
  the whole quest end to end: 1280×720 day in English (starter path), 1280×720 night in French, 375×812 night in French
  (GitHub path, with the link simulated), a failed first build then "Welcome back" → Continue, and the city after it.
  Screenshots in `docs/screenshots/first-home/`. The starter page at 1280 and 375, day and night, English and French.
- **Not seen for real:** a build by a real caretaker (Docker), a real GitHub App install, the welcome note and the progress
  column on a real Postgres (both tested on PGlite), the house panel at 1280×640 with a long list and the "?" open, real
  touch on a phone (the headless phone was a narrow window with a mouse), and the sounds by ear.

### Try it with the real stack
1. Merge or check out `first-home`, `npm ci`, `npm run build:packages`, start the API (it migrates on start: one new column).
2. The quest deploys the starter from `COLOC_TUTORIAL_REPO` at `examples/hello`, on `main`. Locally that's `file://$PWD`
   ([dev.md](dev.md)): **the new starter page only shows once this branch is on the clone's `main`** (or point
   `COLOC_TUTORIAL_REPO` at a clone whose `main` has it). On the real server the repo must be public (TODO M7).
3. Run the workshop's caretaker (dev.md, terminal 4), log in as a new name (or Settings → take the quest again), play it.
4. GitHub path: with the dev App configured, "My own, from GitHub" opens its install page; pick one repo. The first repo goes
   to the workshop room (`ChoresService.linkRepos`), then "Put it online" builds it from its root.

### Rough edges
- The QR can't tell us it was scanned, so sharing is detected only from copy, WhatsApp or the share sheet ("Later" is fine).
- On a phone, chapter 8's card sits over the lower half of the house's sheet; the tab and its sentence stay visible.
- The house's welcome note is written by the API, in English, like the other fridge notes.
- GitHub: if the installer picks several repos, only the first goes to the workshop room (unchanged rule).
- The quest's house is still called L'Atelier ("the workshop"); renaming it is a seed change if Jib wants a homier name.
- The 3D house name tag can sit just above the tracker when the camera frames the house.
- New French to check: the chapters ("Trouver un toit", "Prendre les clés", "Le lancer", "Le montrer"), "Votre premier
  chez-vous", "Bienvenue chez vous", "À vous de jouer" (starter page), "Nouvelles" for News, "Revues".

### 15 Oct 2026: chapter 4 lets you pick which repo to bring

Trying the quest for real showed two problems: the install event never reached the API (in development it comes
through the smee relay, which wasn't running), and once it did, every repo the newcomer had installed the App on (48)
was poured into their workshop room, so the coach named whichever came first.

Now "My own, from GitHub" opens a picker in the coach: `GET /api/tutorial/repos` asks GitHub directly (the App's
installation on the person's own account, then its repos; at most every 5 s per person) and lists them, the most
recently pushed first, five at a time with a search box (arrow keys and Enter work). Picking one calls
`POST /api/tutorial/repo`, which makes it the only repo in their workshop room (it refuses a repo they didn't allow,
or one already in someone else's room). "Change" on the next card brings the picker back; "Allow more repos" opens
GitHub's page for the installation. With nothing installed, the card offers "Open GitHub" as before; someone logged in
without GitHub is told to log in with GitHub. The webhook no longer fills a workshop room with every installed repo:
it takes one at most, and the picker decides. Limit: an install on an organisation isn't listed; its webhook still
links it. Tests in `tutorial/tutorial.test.ts` and `github/github.test.ts`.

### 15 Oct 2026, evening: Jib's review of the city, the house window, login and the HUD

Seven fixes from Jib trying the branch (Claude Code; the minimap was a subagent's, on its own files, read before
committing).

| Ask | What changed | Where |
|---|---|---|
| The city is always daytime | The engine pins the light to 11:00 local (lamps off, windows unlit) whatever the city's clock or the site's theme; the dev `setHour` still overrides. The HUD keeps its own day/night theme | `lobby/Lobby.ts` (`CITY_HOUR`), `LobbyView.vue` backdrop |
| The house card, from outside | No review counts on rooms (the list view's room rows keep them for flatmates only); no "Dakar. Its server is running." (the dot beside the name, with its hidden name; words only when wrong, `houseTrouble`); no "4 rooms, 1 free."; a room's line drops "Online."; the tontine and the month's reviews show to flatmates only. The street card follows | `HouseInside.vue`, `HouseCard.vue`, `panel/PanelHead.vue`, `panel/words.ts`, `RoomCard.vue` |
| Login page | A still of the city by day (Lomé, 100 KB WebP, ours) behind a flat card; a still, not a live render, so phones pay nothing | `pages/LoginPage.vue`, `public/login-city.webp` |
| "Where to?" | No orange stripe, no ", you're here" (the map's dot, and `aria-current`); each city is icon chips: people walking, houses, projects online (real houses only), local time in the monospace, each with a hidden name | `LobbyView.vue`, `lobby/cityStats.ts` (tested) |
| Minimap | Drawn in the city's day grounds: streets with dashes, sidewalks, parasol dots, park, sea; houses as little house shapes in their colour; you as a yellow arrow facing your way with a view cone; a solid frame with a compass; two icon chips (live here, out walking) under it | `Minimap.vue`, `minimap.ts` (tested), `minimapWords.ts` |
| Emotes | The thumbs up/down buttons, the 1 and 2 keys and their keys-sheet line are gone; a person card's wave and others' emotes stay | `LobbyView.vue`, `Lobby.ts`, `KeysSheet.vue` |
| Top chip | Silent while all is well; shows "Dakar: Sacré-Cœur's server is down." (red dot) or "1 build failed." (amber) for real houses. The core being down has its own banner already | `LobbyView.vue`, `lobby/cityStats.ts` |

**Verified** with headless Chrome against the running dev server (no server, API or Docker touched): the house window
logged out at 1440×900 (light) and 375×812 (dark, French); the flatmate view logged in as Jib in the app's browser (the
tontine line still there, the dot beside the name); a demo house logged in; "Where to?" at 1440 light and dark and 375;
the city by day in Marrakech, Dakar, Lomé and Kigali; the login page at 1440 light and 375 dark; the minimap small and
big, Dakar light and Lomé dark, and 375. `npm run build`, `npm test -w @coloc/web` and `npm run licences:check` pass.

**Rough edges.** The top chip's alert was only seen in tests (every real house was up). A logged-in non-flatmate on a
real house wasn't seen (the only real house is Jib's). The tutorial's "emotes" HUD piece is now unused but left in the
step machine. On a phone the travel sheet still scrolls its list, as before. Example houses' rows still say "An example
project." on each row.

### 16 Oct 2026: yellow road spots, the minimap, house rows, people you can reach, passers-by

Five asks from Jib's look at the branch (Claude Code, no subagents).

| Ask | What it was / what changed | Where |
|---|---|---|
| Yellow spots on the roads | Not lights: the road texture of the sandy cities (Dakar, Abidjan, Douala) had six soft sand-coloured patches drawn into a tile that repeats over the whole town, so they read as halos, and the ones on a tile's edge were cut straight. Those roads are plain asphalt now; the sand stays on the verges | `lobby/textures.ts` |
| No teleporting from the minimap | Clicking the small map opens the big one (like M); it never moves you. On the big map, a house (on the map, where its row lights up and the cursor changes, or in the list) takes you to its door (`Lobby.travelTo`, which replaces `teleport`); empty ground does nothing. The map's hint, its screen-reader line and the M tip say so | `components/lobby/Minimap.vue`, `minimap.ts` (`clickOnMap`, tested), `LobbyView.vue`, `tutorial/tips.ts`, `lobby/words.ts` |
| House cards: no left border, more recognisable | Selection is a fill everywhere a house is listed: the selected row the soft orange, yours a lighter wash, a lit row a shade stronger (no stripe, no ring), in `ListRow` and the find and travel sheets. Each house shows its badge in its own colour (dashed for an example) and three icon chips with hidden sentences: people living there, rooms, free rooms (in the free-window blue), plus a quiet "example" tag. On the big map's list, the find sheet, the list view's rows and the street card. The 3D name flag's orange pole is now a square in the house's colour | `HouseStats.vue`, `HouseBadge.vue`, `houseStats.ts` (tested), `panel/ListRow.vue`, `list/CityRow.vue`, `HouseCard.vue`, `style.css` |
| People in a house are actionable | Picking a face opens a card under the faces: name, project, one way to reach out (`personActions` in `house/crew.ts`, tested): a flatmate writes in the channel (the tab opens with "Awa, " in the box), an outsider knocks or opens their knock, someone logged out is sent to log in where there's a room to knock on. Then a GitHub profile button (new tab) only for a real GitHub account, disabled with why for an example person, and a wave from the city. **No direct messages** (the team's decision); **a light chat between two people is still a pending decision** | `house/PersonPeek.vue`, `HouseInside.vue`, `Inside.vue`, `ChatPanel.vue` (`start`), `PersonCard.vue`; API `PersonView.github` in `houses.service.ts` (tested) |
| More people, with GitHub-style handles | Up to sixteen made-up passers-by per city walk from crossing to crossing on the walk grid. Their tags show an invented handle ("mdiop221", "fatou-sow-dev": lowercase, digits, single hyphens, checked by a test); their card the full name (names of the city's languages), the "example person" marker and a disabled GitHub button. Grey dots on the minimap; they stop and turn to you when picked; in reach only when nothing else is. 16 on a desktop and 10 on a phone in high quality, 6 and 4 in low; none in the tutorial's street; still with calm motion | `lobby/passersby.ts` (tested), `Lobby.ts` (`addPassersBy`, `showPassersBy`, `walkOn`) |

**Frame time** (headless Chrome, software GL, Dakar, walking, 375×812 with 4× CPU slowdown as a cheap phone; two runs
each): high quality 18–21 fps without passers-by, 16–19 with ten (JavaScript per frame 5.5 → 6.6 ms; median frame 50 ms
either way); low quality 35–37 fps without, 30–34 with four (3.4 → 3.7 ms; median 33 ms either way). Without the
slowdown at 1440×900 the median frame didn't move (150–167 ms high, 117 ms low: software rendering is the bottleneck).

**Verified** with headless Chrome against the running dev server (no server, API or Docker touched), screenshots in the
session's scratchpad: Dakar's roads before and after; the small map opening the big one, a click on empty ground doing
nothing, the hover lighting Almadies' row and a click landing at its door ("Almadies, Go in"); the big map, the find
sheet and the list view at 1440 and 375, light and dark, English and French; the 3D flags; a passer-by's tag and card;
the house window's person card logged out (Almadies, Sacré-Cœur), and as a flatmate and as an outsider with the house
view's viewer swapped in that browser only (the dev login is off on the running API): "Write in the channel" opens the
Channel tab with "Jib, " in a focused box, "Knock" opens the knock. `npm run build`, `npm test` (web 240, API 208) and
`npm run licences:check` pass.

**To see it all:** restart the API (it now sends `github` for each person; until then nobody gets a GitHub link). No
migration, no reseed: the seed is unchanged (the passers-by are client-side; the seeded flatmates keep their logins,
which `life.ts`, the tests, `dev.md`'s dev logins and the demo reset rely on).

**Rough edges.** The wave and the knock from the person card were seen only with the swapped viewer, not with a real
login. On a phone the list view's line under a house's name still ends in "…" for a long city name (Marrakech), and the
example tag is left out there. Passers-by walk on the road as much as the sidewalk (the walk grid doesn't tell them
apart), and pass through each other. Their names should be read by someone from each city.

### 16 Oct 2026, morning: invitations, a bell, a person's actions, no "Walk there", a city seen from further

Four asks from Jib (Claude Code, no subagents). **The API changed: restart it** (it applies migration
`0013_notifications` on start: one new table, nothing else touched).

| Ask | What changed | Where |
|---|---|---|
| No "Walk there" on a house's card | The button and its words are gone. Getting there is walking, or a pick on the big map (its door) | `HouseCard.vue`, `lobby/words.ts`, `LobbyView.vue` |
| Zoomed out by default | A city opens at a half-width of 20 world units (was 13), 15 on a phone held upright; travelling to another city resets the zoom. The quest's street keeps 13; the onboarding's close-up and the close-up beside an open window override it as before | `lobby/Lobby.ts` (`ZOOM`, `setNeighbourhood({ close })`), `LobbyView.vue` |
| Actions on a person | The street card's main action comes from `streetActions` (tested): **See their house** (its window, at its door, in its city) when they have one; **Invite to my house** when they don't and yours has a free room (then "Invited" with "Take back"; "Your house is full" otherwise); **Rent a place together** when neither of you has a house; **Log in to invite** logged out. An example person's action shows disabled, with why. Then GitHub (real accounts only) and the wave. Knocking stays on the house's card and window | `PersonCard.vue`, `personActions.ts`, `LobbyView.vue` |
| Invitations and notifications | A `notifications` table (who it's for, kind, from whom, house and room, a small JSON payload, created/read/decided, and a state for invitations: open, accepted, declined, withdrawn, expired). `house_invite`: yes moves them in through `moveInto` (now shared with the doorbell's vote, so the rules are the same). `rent_together`: yes tells the sender; renting stays "Start a coloc here". News from the doorbell through a small listener: a knock on your house, the answer to your knock; and "your invitation was taken" | `packages/db` (schema, `0013_notifications`), `apps/api/src/notifications/*`, `houses/move-in.ts`, `doorbell/doorbell.service.ts` |
| The bell | In the top bar: an icon with the unread count (hidden name "Notifications, 3 unread"), opening a flat card of dense rows: their face, one line, and the actions (Move in / ×, I'm in / ×, open, Find a plot). Opening it marks them read. Moving in shows the quest's keys card, then the house's window. The lobby's WebSocket sends `{ type: "notice" }` to the recipient's open tabs; the bell also fetches on login and when the tab comes back | `components/bell/*`, `notices.ts`, `App.vue`, `lobby/link.ts`, `lobby/lobby.gateway.ts` |

**Routes** (all need a login; zod-checked bodies): `GET /api/notifications` (unread count, the latest 30, and your
invitations still waiting), `POST /api/notifications/read` (`{ ids? }`, none = all), `POST /api/notifications/:id/accept`,
`/decline` (the recipient only), `/withdraw` (the sender only), `POST /api/invites/house` (`{ to, house, room? }`),
`POST /api/invites/rent-together` (`{ to }`).

**The rules, each with a PGlite test** (`notifications/notifications.test.ts`): not yourself (400), nobody by that
name (404), not an example person, not someone already housed, not to an example house, the workshop or a full house
(409), only people who live in the house may invite (403), one open invitation per pair and kind, not again within a
day of a no, ten a day per sender (429); a week unanswered and it lapses. Accepting re-checks everything: the room
still free ("Someone else took that room first.", and it expires), the sender still living there, the person still
without a house. Moving in lapses their other house invitations, closes their own knock on that house and other
knocks on that room (those applicants are told). "Example person": seeded (a member of an example house, or in an
example room), or anyone without GitHub **while the dev login is off**; with `COLOC_DEV_LOGIN=1`, people who logged in
by name are real, so invitations can be tried on a laptop. "Housed": belongs to a house that isn't the workshop.

**How to explain it to the jury.** No free text anywhere: an invitation is a row with a kind and a state, and the web
words it. The doorbell doesn't know about notifications: it calls its listeners after a knock or a verdict, and a
listener failing never fails the knock. The bell's nudge is one word on the lobby's existing WebSocket; the page then
asks the API, so nothing private travels on the live line. Moving in has one implementation for a vote and an
invitation.

**Verified.** `npm run build`, `npm test` and `npm run licences:check` pass. API: 18 new tests (rules, accept/expire,
the doorbell's news, reading, the routes' 401/400), the gateway's nudge and presence. Web: `personActions.test.ts`
(who sees which action), `bell.test.ts` (what each notification says and offers), the nearest empty plot. A Nest
boot of the whole AppModule (against an unreachable database) checked the dependency wiring. **On screen**, in a
headless Chrome against the running dev server, with the new API calls and one extra person on the live line mocked
in that browser only (the running API is the old build; nothing was written to it): the city zoomed out at 1440 and
375; the bell closed and open at 1440 (light, English; dark, French) and 375; Move in → keys card → the house's
window; a refusal shown on its row; "I'm in" → Find a plot → walking to an empty plot and its card; the person card
as a housed viewer (invite → "Invited"), an unhoused viewer (rent together → "Asked"), logged out at 375 ("Log in to
invite"), on a passer-by (disabled, "An example person: invitations only go to real people."), and "See their house"
opening Sacré-Cœur's window. Screenshots in the session's scratchpad (`me/r3/`).

**Not seen for real** (needs the API restarted): an invitation between two real accounts end to end, the live nudge
arriving, the migration on Docker Postgres (it ran on PGlite in every test).

**Rough edges and what's left.**
- The house window's person card (`PersonPeek`) keeps its own actions (write in the channel, knock): everyone in it
  lives in that house. A real newcomer in the workshop's window isn't offered an invitation yet.
- Declining isn't told to the sender (their "Invited" just goes away); that's on purpose, but it's a product choice.
  *Changed later that day (commit 592d7ba): a no now tells the sender under the bell; see the next entries.*
- Inviting picks your first house when you have several (`me.houses[0]`), and the first free room in it.
- The other places that show a person (a knock's thread, the list view's pages, the crew row's faces in the list
  view) don't have the new actions.
- On a 375 px phone the top bar is crowded: your house's name shrinks to a letter beside the bell.
- New French to check: "Partant" (I'm in), "Inviter chez moi", "Louer ensemble", "sous sa cloche".

### 16 Oct 2026, later: loose ends (Claude Code, no subagents)

**The API changed: restart it.** It applies migration `0014_github_installations` on start (one new table). No reseed.

| Loose end | What changed | Where |
|---|---|---|
| Passers-by on the road, through each other | Each block's sidewalk is a ring of 16 points (corners cut round the palm, lamp and traffic light, two zebras a side). A passer-by walks round it in a lane (one way nearer the block, the other nearer the road) and sometimes crosses at a zebra to the next block; two who overlap step apart, a little to the right, so head-on they pass. No path search any more | `lobby/passersby.ts` (`sidewalks`, `walkAhead`, `keepApart`, tested), `Lobby.ts` |
| Phone top bar | Under 520 px your house is a house icon and Log out an arrow out of a door (their words stay as names and tooltips) | `App.vue`, `house/icons.ts` |
| Organisations' repos in the picker | GitHub won't say who belongs to an organisation without the person's own token. So the install webhooks now record who installed the App where (or last added repos to it) and forget a removed installation; the picker lists your own installation plus those you made on organisations. Other members of that organisation don't see them, so nobody can link someone else's repo. An install made before this (or whose webhook was lost) shows once repos are added to it again | `github/chores.service.ts`, `tutorial/tutorial.service.ts`, `packages/db` (`github_installations`) |
| Invitations | Several free rooms: pick the one to offer on the person card (the first by default). In the workshop's window, someone with a real house can invite a newcomer (the workshop isn't a house; the API already allowed it, now tested) | `PersonCard.vue`, `personActions.ts`, `house/crew.ts`, `house/PersonPeek.vue`, `notifications.test.ts` |
| AZERTY | W A S D, Q, E, R are read by physical key (`KeyboardEvent.code`): Z Q S D walk on a French keyboard, A and R turn. The caps (keys sheet, legend, tips, tutorial) show this keyboard's letters where the browser tells (Chrome, Edge), else W A S D | `lobby/keys.ts` (tested), `Lobby.ts`, `KeysSheet.vue`, `KeyLegend.vue`, `tutorial/tips.ts`, `Coach.vue` |
| Server-written English | Fridge notes and a knock's house lines are written from templates in one place; the same template reads a stored text back into a kind and its blanks, sent as `said`. The web says them in French or English and shows the stored text for anything else (old rows read the same way, so no migration). Errors and PR comments stay English | `houses/lines.ts` (tested), `components/said.ts` (tested), `FridgeDoor.vue`, `ChatPanel.vue` |
| GitHub profile on knock and list pages | A round icon link beside the applicant on a knock's thread, on each knock and each room's flatmate on the list view's house page, real GitHub accounts only | `GithubLink.vue`, `ApplicationPage.vue`, `list/HouseMore.vue`, `RoomCard.vue`, `doorbell/queries.ts` |
| Leftover | The quest's unused "emotes" screen piece is gone | `tutorial/tutorial.ts` |

**Verified.** `npm run build`, `npm test` (555: db 13, domain 22, protocol 4, agent 13, API 238, web 265) and
`npm run licences:check` pass. In headless Chrome against a second Vite on :5176 from this folder (the usual :5175 wasn't
running; the real API answered reads, the person and the live line were mocked in that browser): sixteen passers-by in
Dakar sampled for 30 s, 90 % of samples on a sidewalk, 8 % crossing at a zebra, the rest nudged a little off while
standing, never closer than 0.8 (two people's width); same in Lomé. At 375 × 812 with 4× CPU slowdown the engine's step
took a 0.60 ms median with ten passers-by and without. The phone top bar at 375 (French, dark) fits: logo, house icon,
bell, face, log-out icon, gear. The person card offering room-4 or room-5 and sending room-5. A French keyboard simulated:
the keys sheet says Z Q S D and A / R; Z walks, AZERTY's W doesn't. **Not seen:** the French notes and knock lines on
screen (they need the restarted API), a real organisation install, the workshop window's invite.

### 16 Oct 2026, evening: sharing from a laptop, a "no" that's told, and a cleanup for a stable version

Claude Code, no subagents. Three things that landed without their own entry, then a pass so the branch reads as a
stable version.

| What | What changed | Where |
|---|---|---|
| A declined invitation tells the sender (592d7ba) | Saying no to a house invitation or to renting together leaves the sender a notice under the bell ("Fatou said no to Sacré-Cœur", or "… won't rent with you this time"), so they stop waiting | `notifications/notifications.service.ts` (tested), `components/bell/bell.ts`, `bell/words.ts` |
| The site on another host than the API (e5d31d9) | Vercel forwards `/api` but not WebSockets, and the login cookie belongs to the site's host. So the page asks `GET /api/lobby/ticket` for a one-minute, single-use pass and opens the lobby's socket straight to the API (`VITE_LOBBY_WS`, set at build). `COLOC_WEB_ORIGIN` may list several sites | `auth/auth.service.ts`, `lobby/lobby.controller.ts`, `lobby.gateway.ts` (tested), `web/src/lobby/link.ts` |
| `npm run share` (ac6ff81) | One command: a Cloudflare quick tunnel to the API, the site built against it and deployed to Vercel with `/api` forwarded, the tunnel kept open until Ctrl+C. It prints the line to restart the API with | `scripts/share.mjs`, [dev.md](dev.md#sharing-the-city-from-a-laptop) |
| One dev port | The site always runs on 5175 (`strictPort`: it stops rather than move); the API's defaults for `COLOC_PUBLIC_URL` and `COLOC_WEB_ORIGIN`, the GitHub App script, `npm run share`, the docs and the tests agree | `apps/web/vite.config.ts`, `auth/auth.config.ts`, `main.ts`, `docs/dev.md` |
| Rent-a-server in development | Vite forwards `/agent` too, so the install command the site shows on a laptop connects | `apps/web/vite.config.ts` |
| Rooms with the same name in two houses | A room's network is named after its house and room (`coloc-room-sacre-coeur--jib`), and a caretaker only lists, swaps, restarts, measures, reads logs of and reports events for its own house's containers (they all carry the house label). Images are tagged `coloc/<house>/<room>` | `apps/agent/src/room-spec.ts` (`roomNetwork`, `roomFilter`, tested), `docker.ts`, `deploy.ts`, `meter.ts`, `events.ts`, `proxy.ts` |
| Leftovers | An unused tontine rule (skipped reviews pushing you back: not built, so the code goes), an unused house status line and its words, two unused quest words, unused CSS, a stale doc path, the schema's mention of a per-house database that doesn't exist | `packages/domain/src/tontine.ts`, `components/lobby/cards.ts`, `words.ts`, `style.css`, `packages/db/src/schema.ts` |

**Existing rooms after the caretaker restarts.** Containers started before this keep their old network (named after
the room only): on start the caretaker plugs the proxy into whatever network each container is really on, so they
keep answering. Each room's next deploy moves it to the new network and then removes the old one, if this house made
it and only the proxy is left on it. Container names don't change (the deploy id already makes them unique).

**The demo reset** deletes every chat message on purpose: it deletes every house, real ones included, and every
channel belongs to a house or a knock. Whether real people's houses should survive a reset is now a TODO for Jib.

**Verified.** `npm run build`, `npm test` (555: db 13, domain 20, protocol 4, agent 15, API 238, web 265) and
`npm run licences:check` pass. Not run against Docker: the network move was reasoned through, not watched.
**Restart the API and both caretakers** to pick it up (no migration, no reseed); restart Vite to get the `/agent`
forwarding.

### 16 Oct 2026, night: direct messages, a room and a board per city (branch `chat`)

Claude Code (Claude Opus 5.5), no subagents. The team reversed the "no direct messages" rule: people can now write to
each other, talk in their city, and post on its board. **The API changed: restart it.** It applies migration
`0015_chat` (four new tables) on start. No reseed.

**The idea in one breath.** Every conversation was already a row-per-message table with a text `channel`
(`house:<id>`, `application:<id>`). We kept that and added three channel names instead of new message tables:
`dm:<idA>:<idB>` (the two user ids sorted, so a pair always has one channel), `city:<City>` and `post:<id>` (a board
post's replies). The name alone says who may read and write, so each rule is one small check
(`canRead` in `chat.service.ts`).

| Piece | What it does | Where |
|---|---|---|
| Tables | `blocks` (who blocked whom), `chat_reads` (the last message id you saw in a conversation: what's after it, from the other person, is unread), `board_posts` (city, tag, title, body, `active_at` bumped by each reply), `reports` (a copy of the words, so it survives a delete) | `packages/db/src/schema.ts`, `drizzle/0015_chat.sql` |
| Direct messages | `GET /api/chat/conversations` (newest first, unread counts, blocked people left out), `GET /api/chat/dm/:login` (opens it, marks it read, says whether you can write and why not), `POST /api/chat/dm/:login`. Refused: yourself, an example person, anyone either of you blocked | `apps/api/src/chat/chat.service.ts` |
| Live direct messages | After a DM the service pushes both logins; the lobby gateway sends `{ "type": "chat" }` to their open tabs (like the bell's `notice`); the page fetches its conversations | `lobby.gateway.ts`, `presence.ts`, web `lobby/link.ts` |
| A city's room | `GET /api/cities/:city/chat` (last 100, anyone), `POST` (logged in). A city is one of the eight, or one a house is in; anything else is a 404 | `chat.service.ts`, `channels.ts` |
| The board | `GET/POST /api/cities/:city/board`, `GET /api/board/:id`, `POST /api/board/:id/replies`, `DELETE /api/board/:id` and `/replies/:reply` (author or admin) | `board.service.ts` |
| Live city | `GET /api/cities/:city/stream` (SSE) says `chat` or `board`; each page fetches with its own login, so hidden stays hidden | `chat.controller.ts` |
| Safety | Block / unblock (`/api/chat/blocks`), report (`POST /api/reports`, only what you can read, not your own, once each), the admins' list (`GET /api/reports`, `COLOC_ADMINS`). Blocked people's words are filtered in SQL in `channelMessages`, so the house channel and knock threads hide them too | `chat.service.ts`, `doorbell/queries.ts` |
| Brake | A sliding window per person in memory: 5 messages in 10 s (DMs, city, replies), 5 posts an hour; a 429 with a sentence. Checked after validation, so a refused message doesn't count. No new dependency | `chat/limiter.ts` |
| Text | zod at the door, then `cleanText` trims, strips control characters and caps (1 000 a message, 100 a title, 2 000 a post). Stored as typed; the web writes it as text and only makes `http(s)` links, with `rel="noopener noreferrer nofollow ugc"` | `chat.service.ts`, web `components/chat/chat.ts` (`linkParts`) |
| The chat sheet | A chat key with an unread count in the top bar (for visitors too). A flat card docked on the right (a bottom sheet under 520 px) with icon tabs: Messages, City, Board, House. Esc closes, arrows move between tabs, Enter sends, Ctrl/Cmd+Enter posts. A message's "…" offers Message, Report, Block | `components/chat/*.vue`, `conversations.ts`, `ChatPanel.vue`, `App.vue` |
| Entry points | "Message" on the street card and the house window's card (disabled with why for an example person); a board key in the HUD's round tools; "City board" on the market's chores board | `PersonCard.vue`, `PersonPeek.vue`, `LobbyView.vue`, `BoardCard.vue` |
| Demo reset | Now deletes only house and knock channels: people's DMs, city rooms and board replies stay | `demo/demo.service.ts` |

**How to explain it to a jury.** "A message is a row with a channel name. The name says who it's for: two people, a
city, a house. Reading a conversation checks you belong to that name; writing also passes a brake and a length check.
Nothing private goes over the live line: it only says 'something new', and your page asks the API, with your login."

**Verified.** `npm run build`, `npm test` (589: db 13, domain 20, protocol 4, agent 15, API 262, web 275) and
`npm run licences:check` pass. API tests (`chat/chat.test.ts`, PGlite): DMs between two people and their unread
counts, privacy from a third person, refusals (self, nobody, example person, empty, too long, logged out), block
both ways and hiding in the city, board and house channel, the city room for visitors, the 100-message history, the
brake (429, per person, refused ones not counted, the window forgetting), board order, reply counts, author/admin
delete, reports (copy kept, once, only readable things, not your own, admins only), the stream's events; the
gateway's `chat` nudge; the demo reset keeping a city message. Web tests: tabs per viewer, the card's Message,
the badge, `linkParts` (no `javascript:`, punctuation, brackets).
**On screen**, in the desktop app's browser against a Vite on :5180 from this folder and a throwaway stand-in API
on :4180 (the real built API with PGlite in memory instead of Postgres, dev login, seeded; a script in the session's
scratchpad, not committed; nothing touched :4100 or :5175): the chat key and its count; the conversation list and a
conversation, a reply sent with Enter; a DM from another account arriving live (count from 1 to 2); the city room,
with a message posted from outside appearing live and its link drawn as a link; a message's tools, Report, then
Block hiding that person's words; the board list, a new post with Ctrl+Enter, the post and a reply; a person card's
Message greyed out for an example person; the house tab; a visitor's sheet (City and Board only, "Log in to talk");
375 px dark French (bottom sheet, the top bar fits: logo, house, chat, bell, log out, gear). The admins' list read with
curl. Screenshots: [docs/screenshots/chat/](screenshots/chat/) and the session's scratchpad (`chat/`).

**Not seen:** the "City board" key on the market's chores board (wired and type-checked), Message from the house
window's card, the migration on Docker Postgres (it ran on PGlite in every test and the stand-in).

**Rough edges and what's left.**
- Reports have no screen: admins read `GET /api/reports` and delete by hand (an admin may delete any post or reply).
- The brake lives in one API process's memory; several processes would each count on their own.
- Nothing is sent to someone offline (no email): they see the count on their next visit.
- Conversations list at most 50, a conversation its last 100 messages; no "load older".
- A city room's history is not filtered by city membership: it's public by design.
- No way to delete a message in a DM or the city room (only board replies), and no edits anywhere.
- The list view (no lobby) has no live line: direct messages there refresh when the sheet opens or the tab comes back.
- New French to check: "Discussions", "Annonces" (the board), "Cherche des colocs", "Entraide", "Signaler", "Bloquer".

## 19 10 2026: a city that reacts, teaming up, and sharing a house (branch `world-life`)

From the to-do list of 10 Oct: more life in the world, teaming up, sharing, and the review's leftovers. Three agents
(API, 3D world, screens) worked at once on separate files from one written contract; the lead reviewed and committed.

| What | How it works | Where |
|---|---|---|
| **Happenings** | Each house in the city view carries `cpu` (its rooms' latest CPU, added up) and `recent`: the last ten minutes of a review done (reviewer → author), a crash (a fridge note of kind `oom`/`crashed`), a project going live, a team formed. They're built from rows the API already writes, with stable ids, so a polled page (the shared site asks every 4 s) sees them as well as a streamed one. The page plays only ids it hasn't seen, never on load | `apps/api/src/houses/happenings.ts`; `components/lobby/cityLife.ts` |
| **The city plays them** | A review: an envelope arcs from the reviewer to the author, then a coin pops over the reviewer. A crash: only that room's window flashes red and a dark puff leaves the roof, so you see one room fall while its neighbours stay lit. Live: the fireworks. A team: two-colour confetti. Calm motion turns each into a soft glow | `lobby/happenings.ts`, `courier.ts`, `glow.ts`, `particles.ts`, `windows.ts` |
| **Roof smoke** | Grows with `cpu` (none under 2 %, thickest at 150 %); one particle pool for the whole city, one draw call | `lobby/smoke.ts` |
| **Speech bubbles** | `lobby.say(login, text)`: 5 s over the person, newest replaces older, one line clipped at 80 characters, written as text (never HTML). Fed by new lines in the city's public room and, for flatmates, their house channel | `lobby/bubbles.ts`, `LobbyView.vue` |
| **Teaming up** | `room_teammates` (migration 0017). The occupant invites a flatmate (`team_invite`) or a flatmate asks (`team_ask`), through the bell's accept/decline; the sender hears the answer. A teammate has the occupant's rights on that room (deploy, restart, settings, secrets) and keeps their own room. Same house, real houses only, at most three, and the invitation brake applies. The rotation skips everyone on the pull request's own project; reviewing your own project earns no rent | `apps/api/src/notifications/teams.ts`, `packages/domain/src/rotation.ts`, `houses.service.ts` `bill`; `components/lobby/TeamUp.vue`, `team.ts` |
| **Sharing a house** | `GET /api/share/house/:id`: a tiny public page with Open Graph tags (name and city, a line about the rooms, the city's picture) that forwards to the house in the city. The share key in the house panel copies it, sends it on WhatsApp, or opens the phone's share sheet | `apps/api/src/share/`; `components/lobby/house/ShareHouse.vue` |
| **Leftovers** | The workshop has Dakar's look; Kigali has hills; the key strip shows icons; the "Strict" chip is gone (its switch ends the rule sentence) | `lobby/cityStyle.ts`, `hills.ts`; `KeyLegend.vue`, `HouseInside.vue` |
| **Lighter models** | All 78 GLBs packed with meshopt (9.2 MB to 2.1 MB), each pointed back at its folder's shared texture; `glb.test.ts` loads every one and checks the people's animations | `scripts/pack-glb.mjs`, `lobby/assets.ts` |

Checked: 935 tests (domain 21, protocol 4, db 14, agent 21, API 370, web 505), the build and `licences:check` pass. The
3D world was looked at in a throwaway static build. Not yet seen in a browser against the real stack: the bubbles,
envelopes, team flow and share page.

Rough edges:
- On the shared site, every lobby page fetches the city room's messages every 4 s (the `chat` nudge fires on every
  poll), and a flatmate's page also polls their house. Fine for a demo; a real server pushes instead.
- Share pictures exist for Dakar, Kigali, Marrakech and Tunis; Lomé, Abidjan, Cotonou and Douala still need theirs
  (their previews show no picture until then).
- A team forming posts no fridge note.
- The house's public ledger still counts reviews of your own project; only the bill ignores them.

## 31 October: holding 100 houses and 100 people

The target: 60 frames a second at 100 houses and 100 people, all moving, with lobbies of 32 keeping real life well
under that. Measured on an M1 Pro at Retina size, with `npm run perf` (no frame-rate cap, fake data, you walking too):

| | Before | After |
|---|---|---|
| 100 houses, 100 people spread out | 46 fps with name tags off | 240 fps with them on |
| 100 people all on screen | 4-99 fps | 230 fps |
| The first case, CPU 4x slower | 2 fps | 56 fps |
| Draw calls, first case | 815 | about 480 |
| Style recalculation a frame | 5-700 ms | 0.02 ms |
| Someone moves into a house | about 100 ms frozen, then an 80 ms frame | under 1 ms, up to 11 ms the first time |
| Any other change to a house (rebuild) | about 100 ms frozen, then an 80 ms frame | about 35 ms, then a 75 ms frame |
| Server, 100 people in one lobby | 96 500 sends/s, 55% of a core, 559 ms stall | 962 sends/s, 5%, 6 ms |

What did it, biggest first:
- Name tags and flags are drawn on one canvas (`tagLayer.ts`): each tag once into a small picture, then stamped. As page
  elements, each one that moved cost a style recalculation every frame. Speech bubbles stay page elements: they're rare.
- People off screen aren't in the scene, and get their model the first time they come by (`Lobby.stage`). They were 517
  of 779 draw calls, nearly all in the shadow pass, and most of the 9 500 objects three.js went through every frame.
- Models that never move are frozen (`freeze`), and the shadow map only covers the view (`SHADOW_REACH`).
- People share their shapes and paints (`models.ts`): making them was 61 of a rebuild's 99 ms.
- Rebuilds leaked a bone texture per person dressed: `disposeTree` now frees skeletons. 100 textures a rebuild became 2.

Measured and left alone: instancing the shops, towers and skyline. With people off stage they're about 60 draw calls of
480, against the code it would take to fade, outline and click on single buildings. Houses are the next thing to look
at (about 180 calls) if the budget ever needs it.

A slow machine steps down by itself (`frameBudget.ts`): under 27 fps for 3 seconds halves the pixels, then again it drops
the shadows. Not tested on a weak GPU: `npm run perf` slows the CPU only, and Metal on an M1 Pro is a strong GPU.

### The landing's room is live (31 October, branch `landing-3d`)

The wall, the name and the sign stay the picture they were. The room behind the window is now the scene that picture was
rendered from, drawn on a canvas laid exactly over the window (`lobby/landingRoom.ts`).

- **The wall holds still while the room moves.** The camera moves, but its view is pinned to the wall's plane
  (`windowFrustum` in `landing.ts`): what's on the plane stays put, and the deeper something is, the more it shifts. It
  also leans in once at the start, from the picture's distance, which deepens the room.
- **Cheap on purpose.** The canvas is about a sixth of the screen, and the furniture is merged into a few meshes.
  It only loads once the picture is up, and the city reuses what it loaded.
- **The picture is the fallback.** No WebGL, reduced motion, data saver, or too slow (`FrameBudget`: fewer pixels, then
  the picture) and the page is simply what it was.
- **Further back.** The camera stands across the road: sidewalk, the building's edges, the city behind, the name, window
  and sign gathered near the middle. The flatmates talk in turn, because three bubbles would hide a smaller window.
  `npm run render:landing` remakes the picture; its numbers must match the ones in `landing.ts`.
- **Clicks.** A flatmate reacts and the talk moves on to the next exchange (their bubble does the same, for the keyboard). The lamp
  turns on and off, and it's a real light: the shadows go with it. "Try the demo" zooms through the window into the city.

Measured at Retina size, uncapped, on an M1 Pro on battery at 41%: about 550 fps, about 300 fps with the CPU 4x slower. Not
tested on a weak GPU or a real phone (only Chrome's phone size).

Then Jib's review, the same day:

- **Night only.** The day and all-nighter versions and the clock that chose between them are gone: one picture
  (`street.webp`), one palette, one set of lights, and much less code.
- **A real header.** Name, language, log in, try the demo, in a bar of their own above the scene, in the colour of the
  sky's top. The site's name stays painted on the wall too, as part of the picture.
- **Depth.** The far buildings used to be paler than the near ones, against a flat sky, so everything looked pasted on
  one plane. Now the sky is a gradient (a glow on the horizon, nearly black overhead) and the city is three flat rows of
  silhouettes: the further back, the closer to the sky's colour. Next door stays the darkest, being the nearest.
- **A city up late.** Lots of lit windows in a few colours and a soft yellow gradient rising from the street in front of
  each row of buildings, so each row stands out from the one behind. A few windows on the picture go on and off, by
  opacity only.
- **English first, a plain door.** The site starts in English unless this browser chose French (it no longer follows the
  browser's language). The sign's button says "Sign in with GitHub", and the yellow sticker is gone.
- **What they talk about.** Four short exchanges on building things together and tech news, not on life in the flat.
  All three lines come from the same exchange, so it reads as a conversation.
- **A softer lamp.** We tried lighting the room only from the computers' blue; the warm lamp was better. It stays, dimmer
  than before, with more even light in the room so the wall behind the flatmates isn't dark.
- **The name is a broken neon sign.** Tubes drawn as one SVG path per letter, hanging crooked from the left end of its
  rail. Only the last C blinks, which makes it LA COLO (summer camp, in French) now and then. It's its own layer and only
  its opacity changes, so nothing is redrawn; reduced motion leaves it dim and still.
- **Dark-skinned flatmates, with no new art.** Kenney's people all paint themselves from one atlas with three columns of
  skin side by side. The flatmates get a copy of it with all three painted one deep brown (`deepSkinAtlas`); the city's
  people keep the original. The render script paints the same numbers.

### Fewer words, and a calmer first minute (31 October, branch `landing-polish`)

Jib's review before deploying: too much on screen, too many sentences.

- **Name tags that blinked.** A tag behind a nearer one fades back and drops its house chip, so it gets narrower. Measured
  as drawn, that made it stop overlapping, come back, overlap again, and loop. Now a tag is always measured at its full
  width (`TagLayer.widthOf`), a faded tag needs 14 px clear around it to come back, and it counts as 2 m further away when
  deciding who's nearest (`tags.ts`). Standing in Dakar for 40 s, counted in the browser: 136 flips before, 4 after.
- **Nothing until the welcome ends.** While the visitors' welcome is up the city is alone on screen, the top bar included.
  It got shorter, and its new last step shows the basic keys and `?`. The quest says the same in its walking step, and
  `?` is there from that step on. `?` is the first of the idle tips for anyone who skipped.
- **The keys work on arrival.** Someone who had already read the welcome had to click before the keys did anything: the
  city only counted as touched by a click or a closing card. Now arriving counts too (`Lobby.keysOnArrival`), without
  moving the focus, so no ring appears and Tab still starts at the top of the page.
- **Search is one key.** It opens the field on press, or with F; results come once you type: cities, people in this lobby
  (`Lobby.peopleHere`), houses. A city's name no longer lists all its houses, since it has its own row.
- **The keys are behind `?`.** The legend along the bottom is gone (`KeyLegend.vue` too), and so are the red buttons
  bottom right: the chat has the board, the big map has the arena, the top bar has your house. Touch screens keep the two
  turning keys, having no Q and R.
- **Offline is one small key** in the top bar's row, at the same top and height as the bar's keys: a dot, the word, Retry.
- **Windows have no square behind them.** The red line is the window's edge now, with its corners, and the board colour
  behind it is gone (`.sign`, `.sign-frame`, `dialog.step-sign`).
- **A scroll area's focus ring goes inside it**, because whatever holds it clips anything outside.
- **The loading screen is plain red** with one white window in the middle: the name, the greeting, the row of lit windows.
  The four city pictures it used are deleted. It covers the top bar too.
- **Words.** Sentences that explained became short lines or nothing, in English and French together, across the HUD,
  cards, arena, welcome, quest, settings and the house's panels.


## 31 Oct 2026: end to end, the house and the failed build (branch `landing-polish`)

Jib went through the whole thing on the live site and came back with nine screens.

- **No Dockerfile needed.** Builds used to stop with "Cannot locate specified Dockerfile". `apps/agent/src/recipe.ts`
  looks at the folder and writes a small Dockerfile for Node (npm, yarn, pnpm, with or without a build step), a site built
  to `dist`, `build` or `out`, Python (Django, FastAPI, Flask, a plain script), Go, PHP or a plain `index.html`. A repo's
  own Dockerfile always wins. It's still Docker underneath, so the room's walls don't change. We chose this over Nixpacks
  (maintenance mode) and Railpack (its successor, a Go program with BuildKit) because it adds no dependency and fits in one
  file anyone can read; Railpack is the swap if stacks pile up. All six stacks were really built and run with the room's
  limits (read-only disk, nobody, no capabilities, 256 MB).
- **People are told** in three places: a line over the repo list, the hint on the Code tab, and the failure itself, which
  names what we can read.
- **A failed build has a way out.** `buildTrouble` (`room/room.ts`) reads what the caretaker said and picks one plain
  sentence on what to do. The quest's card and the room's Overview both offer the whole log, another project and another
  try. The API now hands the tutorial's room its `log` as well as its first line.
- **A house opens on its floor plan** (`house/FloorPlan.vue`): one square per room with who's there, what they're making
  and what they pay, and along the top the rooms, the free ones and the month's total. People have their own tab, and
  pressing someone gives Chat, GitHub and Project. The foot stays out of the way on the chat tab, so the chat gets the full
  height. `Crew.vue` is gone. The workshop has no real bill, so it shows what a medium server costs (`houseCost`).
- **The first rent is simulated** in the quest, just before the keys (`KeysCard.vue`), and says so: nothing is sent.
- **A room says one thing.** Three numbers, then the next step: choose your code, put it online, or update. A house whose
  server isn't connected says only that, with the way forward for its chef. The manage view tells the web `house.chef`,
  because a chef who lives in the room comes back as `as: "flatmate"`.
- **Renting a server is the whole flow, with a fake payment.** Jib's call: "a complete fake payment, just to have the true
  flow in place". Pick a size, pay the first month, and the server comes by itself; nobody sees a command. Two small files
  stand in for what comes later. `houses/payment.ts` is the one door money goes through: it always succeeds and moves
  nothing, and the screens say so. `houses/landlord.ts` stands in for a hosting provider: it starts the house's caretaker
  on this machine, at most three (`COLOC_LANDLORD_MAX`), only when the launcher turns it on, and with none of the API's own
  secrets in its environment. Each house's key is worked out from its id and never stored, so the caretakers come back
  after a restart. When there's no machine to give, no money is taken and the dialog says so. A real provider replaces the
  inside of `takePayment` and `start`. "I have my own server" keeps the one-command path. A house the landlord hosts moves
  to `<id>.coloc.localhost`, since `<id>.coloc.dev` means nothing on a laptop.
- **Tried for real** on a throwaway database with the real API and caretaker: pay, house goes live by itself, the bill shows
  the month paid, a second house is refused without paying, a plain site and a Node app with no Dockerfile build and answer
  through the proxy, an empty repo fails saying why, and the caretaker returns after an API restart.
- **Fewer lines.** No side stripe on the picked repo, no rule between rows anywhere (`--row-line` is gone). Log out is the
  last thing in Settings, on its own tile. The trail of stamps left the welcome-home card.

## 1 Nov 2026: the rehearsal on a real server

Everything so far had only run on one laptop. `deploy/` puts the whole city on a fresh Ubuntu server with one command, and
the rehearsal ran on a separate 4 GB DigitalOcean droplet, not the 1 GB one already running other projects. The contest
needs Datacloud in the end, so nothing in `deploy/` knows about DigitalOcean.

- **Why Caddy as well as Traefik.** Traefik stays what it is, the rooms' router, reading the caretakers' files. Caddy
  serves the site and makes certificates, which took about ten lines. The room code didn't change.
- **Tried for real, through the public address:** a room built from the starter and opened over HTTPS, a fake payment
  brought a house online with its caretaker, and everything came back after a reboot. Inside a room: read-only disk, root
  remapped (uid 1000 inside is 101000 outside), no internet, no database, no metadata service. A second install left the
  data alone.
- **A bug only a real server could show.** To keep builds away from other machines on the cloud's private network, the
  firewall blocks `10.0.0.0/8`. DigitalOcean's DNS lives there, so builds lost DNS: anything running `npm install` would
  have failed, while the starter, which installs nothing, built fine. Containers now use public DNS. A check that should
  have passed failed, which also showed the other "blocked" results in that check proved nothing yet; they were redone
  with addresses that must work beside the ones that mustn't.
- **Not tried yet, that first day:** GitHub sign-in and a real repo on the server. Jib did both in the test below.

## 1 Nov 2026: after the first real test

Jib used the rehearsal server as a stranger would, with a real GitHub login and their own portfolio, then listed what was wrong.

- **Fake credit.** Everyone starts with 15 000 FCFA of credit. A server's first month, rent and a project's first time online (1 000) spend it; a review (+500) and first place in the Arena (the challenge's prize) earn it. One server and three projects a person, so nobody takes too much space. `credit_entries` holds the history, and its unique `key` stops anything being paid twice. Amounts are ours to change.
- **Character creation** comes at first login and after a demo reset, followed by the award.
- **The log window.** A build's lines travel caretaker → API → window as they're printed, in small batches, and the window asks about once a second while it's open (`BuildLog.vue`). They're kept in the API's memory, within limits; the end of a failed build is also in the database.
- **Reading a project first.** Before building, the caretaker clones the repo and reports how it would run it, its port and where that came from, the settings its env example names, and what would get in its way (`inspect.ts`). It reads plain small files only: a file in a stranger's repo can be a link to something on our machine. Any Git host works, because it's the caretaker that clones.
- **Docker images.** A room's source can be `docker://name:tag`: pulled and run inside the same walls as any room, thrown away if over 2 GB.
- **Nuxt.** Its own server now runs. A config built for someone's cloud makes something only that cloud can run, so those go online as plain pages (`nuxt generate`). Jib's portfolio was the case that showed this.
- **A demo reset left caretakers behind.** A deleted house's caretaker kept phoning in, refused, about once a second, and held its place on the machine. The landlord now stops it after a moment, and a caretaker refused at once keeps slowing down instead of resetting its wait.
- **The house window.** Room tiles say whose room, their GitHub name, the project, its description. Pressing one opens a full page (`RoomDetails`). Waving is gone: it's Chat if you live there, Knock or a chat request if not. A full house lets outsiders ask to join its chat (`house_guests`, migration 0019).
- **The quest.** The tracker is a slim pill. L'Atelier is the host, two learners and you, and your first message gets a scripted answer. The quest's last card says well done and only the city's says welcome. Tips no longer pop up on their own: a locked walkthrough shows the controls at the start and the new screen on reaching the city (`tour.ts`).
- **A failed build never reaches the screen.** The banner told the whole city. Flatmates get `build_failed` under the bell, except whoever ran it.
- **Checked on the server afterwards, and what that found.** A throwaway user on the droplet rented a house, paid from credit, built Jib's portfolio (88 s, live over HTTPS) and a Docker image, and hit the credit stop at 0. Then a throwaway copy of the city with its own database, deleted after, let us press through the screens. It found five things the tests hadn't:
  - A repo whose default branch isn't `main` failed to clone unless you pressed Check first. A room with no branch now clones the repo's own default.
  - "Save and build" didn't open the log window, and "Put online" stayed the main button during a build. Both fixed.
  - Every full house in the seeded city is an example house, and those refused chat requests, so nobody in the demo could see the button Jib asked for. An example house's host now lets you straight in with a line.
  - The API restarting takes the landlord's caretakers with it, and a build they were on said "starting" until a 15-minute timeout. A caretaker now says what it's still building when it reconnects (`hello.building`), and the API fails the rest with a plain reason and Try again.
  - A live room with no name said "No project yet". It now goes by its repo or image until named.
- **The landlord key.** A check printed `COLOC_LANDLORD_KEY` into a Claude session's output. It was replaced on the server the same hour, before any real paid house depended on it. Lesson: on a server, list setting names with `sed 's/=.*//'`, never a grep of the values.
- **Known overlap:** a review takes 500 off the rent and also earns 500 credit; an Arena prize does the same. The bill's sums were left alone.

## 2 Nov 2026: after the second real test

Jib tested the droplet again and sent a long list. Four agents built it in parallel on separate files, then the lead read the risky code and checked the screens on a throwaway copy on the server.

- **First minutes:** a "Welcome to La Coloc" door before the character, a counted-up credit award, a share card with room to breathe and a "Tell the house" key, and four city missions in a collapsible checklist. Jib wrote "3 missions" and listed four: all four are in. "Talk to a stranger" also counts the city chat, because most people in an empty demo city are seeded and can't be messaged, and the mission could never be finished alone.
- **Upload a project:** the Check button is gone. See "Uploading a project" in architecture.md.
- **People:** Chat is the first key on every person, greyed out for seeded ones. Invitations work on someone who already has a house. GitHub names are links, for real accounts only.
- **Rooms:** several rooms, ending a lease, and "Connect your server" removed from the rent window. The API route stays for laptop development.
- **Share pages:** a real page saying "Join X on La Coloc", no longer a redirect.

**Checked on the server:** the welcome, the award, the log opening by itself in the quest, a repo read and built, a Docker Hub image read, a real Cancel (no build process left on the machine), take, leave and claim with the bill unchanged at each step, a half-set-up house opening on Pay, a seeded person's card, the missions ticking, the share page, the knock window's picker. GitHub's list itself was faked in the browser for the screens, since the throwaway copy has no App; its code is covered by tests.

**Found and fixed while checking:**
- A build still running when someone left could start in the room after the next person had claimed it: leaving now cancels the build first. If the caretaker was offline, its first report clears the last tenant's container.
- `FROM --platform=$BUILDPLATFORM` failed with an unreadable error, since Docker's classic builder has no such variable: the flag is removed before building (`onePlatform`).
- The build log's "Another project" on a room led to the same project: it now says "Fix the setup".

**Known limits:** a pnpm lockfile older than pnpm's current format fails at install, with pnpm's own message. A freed room keeps its name, even when that's the last tenant's login, because it's the room's address. Missions are saved per browser.

## 2 Nov 2026: Docker Hub links, refused retries, and quieter first windows

Jib pasted `https://hub.docker.com/r/42dsy/bount-dev` as an image and got `invalid reference format`: the address went to Docker as if it were a name, because `:` and `/` are legal in one. `imageRef` in `room.ts` now turns a Docker Hub page or a `docker pull` line into the name, and the API and the caretaker refuse anything with `://` in it.

Testing with the real image found a second bug. Docker gives its reason for refusing a pull as a line in the stream, and the stream still ends normally, so `pullImage` carried on and failed later with "no such image". It now fails with Docker's own words, and the window explains the two usual cases: no amd64 version, and image not found.

Try again looked dead because of the limit of 5 builds per 10 minutes. The refusal was shown behind the log window. It now shows in the window, and the limit counts from the database, leaving out builds that stopped within 30 seconds or that a server restart lost. Those used nothing.

The welcome and credit moments were full-screen and loud. Jib wanted a window like the others with a better layout, so both are now plain sign-style dialogs.

Known gap: a room counts as live once its container stays up for 5 seconds, whether or not anything answers. `42dsy/bount-dev:refonte` runs `nuxt dev`, which can't write to a read-only disk: it reported live while Nuxt had stopped with EROFS.

## 2 Nov 2026: SSH into your room

`ssh -p 2222 <room>.<house>@<city host>` now opens a shell inside a room's running project. `docs/architecture.md` has the design. The main decision: no account on the server. The API is the SSH server and relays bytes to a `docker exec`, so a person gets exactly what their project has and nothing of the machine's.

Tested on the real server with the real `ssh` command, against a throwaway copy of the API and database, with four test keys.

**Allowed:** occupant, teammate, exit codes, stdout and stderr apart, terminal size and live resize, a room's secrets for its occupant, piped input through to the end.

**Refused or stopped:** a stranger, the chef, a flatmate not on the team, root, someone else's room, an unknown room (same message), passwords, sftp, local and reverse forwarding, a fifth shell. Disk writes outside /tmp fail, capabilities are 0, the network is sealed. Someone taken off a team is thrown out within a minute, and a removed key stops working. Killing `ssh` stops what it was running. Redeploying or ending the lease ends the shell. A caretaker crash says the line dropped and leaves nothing behind. A login with no shell closes after 2 minutes.

**Found and fixed by testing:**
- Output stopped at 2 MB when it came fast: a fixed "too much waiting" limit became acknowledgements.
- `ssh -tt` with piped input hung, because closing the stream cut the terminal's output: a terminal now gets Ctrl-D, as from a keyboard.
- `stty size` was wrong until the terminal's size was passed when the exec starts.
- Killing `ssh` left its processes running, because closing the line doesn't stop a `docker exec`: the shell now records its process number.
- Piped input lost data (180032 of 200000 bytes). I first blamed Docker and added a delay, which didn't cure it. The real cause was input arriving before the shell had started, so it was dropped. It now waits, and the delay is gone.
- An image with no shell showed Docker's raw error: it now says plainly that the image may have none.
- The tab imported GitHub keys whenever someone had none, so a removed key came back on the next visit: it now imports once.

**Speed:** 50 MB of output in 3.7 s on the server itself. From my laptop through a test tunnel, 5 MB took about 25 s against 5 s for plain `ssh`, so that route is much slower than the server's own. The tunnel encrypts twice, which may explain part of that, and the public port hasn't been measured with a big transfer.

**Known limits:** shell only, so no sftp, scp or port forwarding. A container that's crashed can't be entered, because there's nothing to exec into. A key added on GitHub later needs the "Use my GitHub keys" button.

## 2 Nov 2026: rooms become small servers

Jib's point after SSH shipped: we rent out a room of a server, not a deploy button. The SSH I'd built could look but not fix: read-only disk, no internet, disconnecting killed everything. Those limits were also stopping ordinary deploys. An app couldn't call Stripe or OpenAI, and SQLite data vanished on each redeploy. So on a server, rooms now have internet, a writable 1 GB disk, 1 GB kept in `/home/room`, and images run as the user they asked for. `architecture.md` has the design, and `docs/todo-jib.md` has the risks this opens up.

**Moving Docker:** hard disk limits need XFS, so `/var/lib/docker` moved onto an XFS disk file on the live droplet. I first tested limits, kept files and permissions with a separate temporary Docker daemon on a small XFS disk, without touching the city. The move kept every row (33 users, 10 houses, 38 rooms, 46 messages), and the city came back alone after a reboot.

**Tested with real `ssh` on a throwaway copy:**
- **Reached:** http and https sites.
- **Blocked:** cloud metadata, the cloud's private network, the database, another room, the API, the database port and Caddy's admin port by both the gateway and the public IP, and email on ports 25, 465 and 587.
- **Disk:** the writable disk and `/home/room` each stop at 1 GB with "no space left", and the neighbour room carries on.
- **What lasts:** a restart keeps everything. A redeploy keeps `/home/room` and resets the rest.
- **Leaving running:** `nohup` survives logging out, and a plain command stops when `ssh` dies.
- **Root:** official nginx goes live and runs as uid 100000 on the machine. `mknod`, `mount`, `dmesg`, kernel settings and network changes all fail. `apk add` and `apt-get install` work in a 256 MB room.
- **End of a lease:** a file seen on disk is gone from the machine after leaving, the old tenant can't log in, and the next tenant finds an empty home.

**Found by testing:** three of my deploys were refused by the limit of 5 builds per 10 minutes, and my test helper still counted them as passes. It would have reported the lease wipe as proven with no file ever written. I fixed the helper and reran those checks.

**Changed from what I told Jib:** I said the app wouldn't run as root in Project mode. Non-root can't write to files in most images, so a writable disk wouldn't have helped them. Root in a room is an ordinary user on the machine, so images now keep the user they asked for. `/home/room` replaces the `/home` I'd mentioned, because some images keep their app in `/home/node`.

**Known limits:** `df` on `/home/room` shows the whole pool, not 1 GB, though the limit holds. If a lease ends while a server is off and its containers are already gone, the old volume stays until someone empties that room again. The next tenant still can't see it. Jib's `42dsy/bount-dev:refonte` no longer fails on the disk, but `nuxt dev` only listens on localhost and used 245 of 256 MB, so visitors got a 503 while the room said "live".

## 2 Nov: your-room, and seeing inside without going in

Jib tried SSH and found an empty folder, with the site in `/site`. Asked for: the site in `your-room`, the folder's contents visible without SSH, who's connected as a stat, and a way to start something from SSH and have it show outside.

- **The folder is `/home/your-room`, and you arrive in it.** Same volume name, so kept files follow on the room's next deploy. A project that wrote the old path in its code has to change it.
- **The code is linked in, not copied.** `project` points at the image's folder. Copying would use up the kept 1 GB and can't work for an image we didn't build. Said plainly in the SSH tab: it's replaced by each deploy.
- **The Inside tab reads from inside the room,** with a script that needs only `/bin/sh` and `/proc`. Tried for real on busybox and node:22-slim in throwaway containers on the rehearsal server before writing the parser, then the built agent code against real Docker: link, kept real folder, `nohup` process seen as started by hand, refused ports, route moved and back.
- **Telling what was started from the project:** `docker exec` gives its process a new session id. Checked rather than assumed, including after the shell that started it has left.
- **Probing only while someone looks.** On a small server, a script in every room all the time wasn't worth it, so the city and the floor plan don't know what's running. The room page does.
- **Moving the address needed no new storage.** The route file is the record, and it names the container, so a deploy ends the choice by itself.

Caught on screen, not by the tests or the type check: the page crashed reading `tab` before it was declared, and the new line pushed the phone layout sideways.
