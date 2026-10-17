# Adversarial review: La Coloc, `main` at `cd314fa`

> **Status, Sat 17 Oct 2026.** Fixes are on branch `review-fixes` (not merged, not pushed). Fixed: C1, C2, H1–H4,
> M1–M11, and every Low except the conversation-list index (it needs a migration and a query rewrite; today's
> table holds 48 messages) and "one house each" for knocks and renting (a team decision). Request-validation messages
> the UI never triggers stay English. UI items done: first key press, wave, off-screen arrow, home button, example-person card,
> breadcrumb, Code tab, one call to action, eyebrows, logout in settings, name tags, French 3D labels, panels that
> fit. Not done: the intro length, the blank tan blocks (art), living seed content (board posts, chat backlog), and
> everything under "Why I'd go back to Railway" (product decisions). Open team decisions are listed in HANDOFF.md.

*Fri 16 Oct 2026. Answers [REVIEW-BRIEF.md](REVIEW-BRIEF.md). Part 1 covers security and correctness, most severe
first. Part 2 is the product critique: I played it as a developer who wants to meet people and host apps for real.*

**How it was tested.** Code reading split across four reviewers (auth, laptop exposure, data/docs/tooling, web), then
live tests: `npm run up` (with `COLOC_SHARE=0` and the dev login on) and the site on :5175. I played the visitor
intro, the dev login, the whole first-home quest, the chat, the board, the room panel and a phone viewport. I also
probed a live room container from inside. "Confirmed" means reproduced. "Suspected" means reasoned from the code.

**Repro tests left in the tree** (new files only, all picked up by `npm test`; each passes while its bug exists, so
flip or delete it when the bug is fixed):
`apps/api/src/rooms/rooms.review.test.ts`, `apps/api/src/doorbell/doorbell.review.test.ts`,
`apps/api/src/notifications/notifications.review.test.ts`, `apps/api/src/houses/lines.review.test.ts` (3 fail on
purpose), `apps/web/src/stream.review.test.ts`, `apps/web/src/lobby/link.review.test.ts`,
`apps/web/src/components/chat/chat.review.test.ts`.

---

# Part 1: Findings

## Critical

### C1. Any deployed repo gets superuser access to the database, so anyone can take over any account. *Confirmed*
- **Where:** `apps/agent/src/room-spec.ts:72-91` (room network), `apps/agent/src/docker.ts:52-67` (build),
  `dev/docker-compose.yml:26-31` (`coloc` / `coloc-dev-only`, published on `127.0.0.1:5433`).
- **What happens:** on Docker Desktop, `host.docker.internal` resolves inside every container. From inside my own
  live room (`coloc-nadia-dev-prod-*`, made by the quest) a TCP connect to `host.docker.internal:5433` **and** to
  `:4100` (the API) both opened. The `coloc` role is the image's superuser, and its password is in the public repo.
  The exposure reviewer logged in from a container with the exact room flags (`super = t`) and wrote a row. It also
  works from a `RUN` step in `docker build`, which has no network limits at all. Then: insert a `sessions` row with
  `token_hash = sha256(chosen)`, set that cookie, and you are any user, admins included. You can also read
  `room_secrets` and every table. **Anyone with a GitHub account can do this: take a workshop room, link a repo, push
  a Dockerfile.**
- **Fix:** create room networks with `Internal: true` (plus a proxy-only network if Traefik needs it) and build with
  `NetworkMode: "none"`. Or at minimum add a DOCKER-USER/pf rule that drops traffic to the host gateway. Separately,
  give the API a non-superuser role with a random password.

### C2. The caretaker key is public, and the tunnel exposes the caretaker line. *Confirmed by inspection* (not fired at the live tunnel)
- **Where:** `scripts/up.mjs:140` (`COLOC_AGENT_SECRET: "dev-secret-change-me"`), `apps/api/src/seed/city.ts:264`,
  `apps/api/src/agents/agents.gateway.ts:17` (`/agent` on the API port), `scripts/share.mjs:33` (tunnels all of :4100).
- **What happens:** the stored hash for both houses is the hash of that default string, and the repo is public (M7).
  The tunnel's hostname is baked into the deployed site's JS. Anyone opens `wss://<tunnel>/agent` and says hello as
  `sacre-coeur`. That kicks the real caretaker off (a DoS during the demo), and every later `deploy` arrives at the
  attacker with the room's **decrypted secrets** and a one-hour GitHub token. The attacker can also report a fake
  "live" address for a room, which the house page shows as a link.
- **Fix:** `up.mjs` generates a random key once, saves it in `dev/.env.local`, and passes it to the caretakers and the
  seed. Refuse `/agent` upgrades that arrive through the tunnel (they carry a `cf-connecting-ip` header), or serve
  `/agent` on a second port that is never tunnelled.

## High

### H1. 36 of the 128 "invented" passer-by handles are real GitHub accounts. *Confirmed*
- **Where:** `apps/web/src/lobby/passersby.ts:2-3` says "no real person's handle on purpose". The list is at lines 16-170.
- **What happens:** a `HEAD https://github.com/<handle>` returns 200 for `ibagueye`, `astoufaye`, `ousfall`,
  `rokhaya-nd`, `ykt-dev`, `fiacre-dev`, `brenda237`, `karim216`, `hamza212`… (36 in all; a made-up control handle
  returns 404). The city shows them on name tags next to invented full names. Real people get a fake identity on a
  public contest site, which also clashes with the rule that the project must be free of third-party rights (Art. 8).
- **Fix:** use handles that GitHub cannot issue, or that are clearly fake (`fatou.sow`, with a dot, is not a valid
  GitHub login). Add a test that checks the format, since a 404 check is not stable over time.

### H2. The quest promises a shareable link that only opens on the laptop: QR code, WhatsApp, "anyone, from anywhere". *Confirmed*
- **Where:** quest step 6 ("Avec elle, n'importe qui peut ouvrir votre page, de n'importe où") and step 7 (QR code
  plus "Scannez avec votre téléphone", WhatsApp, Copy) in `components/lobby/tutorial/Coach.vue` and `ShareCard.vue`.
- **What happens:** the link is `nadia-dev.coloc.localhost:8000`. The brief already knows these addresses only open on
  the laptop. What is new is that the UI tells every visitor the opposite, and a juror who scans the QR code on the
  Vercel site gets a dead page. This is the climax of the flagship flow.
- **Fix:** until rooms have public addresses, have `/api/tutorial` say whether the address is public. If it isn't,
  hide the QR and WhatsApp options and say "on this demo server, your page opens on the host machine". Better, put the
  room behind the same tunnel (a Cloudflare wildcard or a path route `/r/<house>/<room>`).

### H3. Following dev.md on a teammate's laptop shares the city with the dev login on. *Confirmed from code*
- **Where:** `dev/.env.example` turns on `COLOC_DEV_LOGIN=1`. `scripts/up.mjs` shares by default whenever
  `cloudflared` and `vercel` are installed.
- **What happens:** anyone on the Vercel site can log in as any login, including the admins (demo reset), and deploy.
  Jib's own `.env.local` has the dev login off, which is the only reason it's safe today.
- **Fix:** when `share` is true, `up.mjs` forces `COLOC_DEV_LOGIN=0` and `COLOC_DEV_ORIGINS=0`.

### H4. One request starts one heavy build, with no limit. *Confirmed path*
- **Where:** `apps/api/src/rooms/rooms.controller.ts:106-123`, the caretaker queue (one per room, none across rooms).
- **What happens:** each build gets 2 GB and a CPU. A user with a workshop room, or a few rooms, can loop
  `POST …/redeploy` and peg the laptop during the jury demo. This goes beyond the known "no rate limiting": it is the
  most expensive endpoint, and it runs builds in parallel.
- **Fix:** a global build semaphore in the caretaker (one at a time), plus "one deploy in flight per user" in the API.

## Medium

### M1. Any user can make the laptop clone and build any local git repo, and the laptop's path is shown to everyone. *Confirmed*
- **Where:** `apps/api/src/rooms/rooms.controller.ts:31-36` accepts `file://`. `scripts/up.mjs:141` sets
  `COLOC_ALLOW_LOCAL_REPOS=1` even while sharing. `GET /api/tutorial` returns `file:///Users/dsy/la-coloc`, and the
  room's Code tab shows it (I saw it in my own room).
- **What happens:** deploying `file:///some/path` reaches the caretaker. The error text tells the attacker whether the
  path is a git repo, and a real repo gets built with its own Dockerfile.
- **Fix:** the API refuses `file://` from users. The caretaker allows only the exact tutorial path. Keep that path out
  of API responses (send `sample: true` instead).

### M2. The chef can read any flatmate's secrets. *Confirmed (test)*
- **Where:** `rooms.service.ts:27-34` (the chef manages every room) and `room-deployer.ts:85` (secrets go in as env).
- **What happens:** the chef points a flatmate's room (while it has no linked repo) at the chef's own repo, which
  prints `process.env`. Anyone becomes a chef by renting a plot.
- **Fix:** only the occupant may change a room's source. Or, when someone other than the occupant deploys, send no
  secrets.

### M3. Two "yes" votes at the same moment leave the knock marked "declined" after the person moved in. *Confirmed (test)*
- **Where:** `doorbell.service.ts:116-150, 224`. A withdraw racing a vote has the same flaw.
- **Fix:** `UPDATE … WHERE status='open'` first, inside the admit transaction. Proceed only if one row changed.

### M4. Every newcomer sees other newcomers' GitHub repo names, private ones likely included. *Confirmed display; private repos suspected*
- **Where:** `apps/api/src/github/chores.service.ts:121-123` writes `reposMoved` with every repo in the install
  event.
- **What happens:** L'Atelier's News tab shows "Djibril Sy a installé Djbrl/piscine42, Djbrl/42Projects,
  Djbrl/42_author_checker…". Every newcomer becomes a flatmate of the workshop and sees it. The install payload
  includes private repos.
- **Fix:** say "Djibril linked 6 repos", or name only public repos (`r.private === false`).

### M5. Shared-site polling has no in-flight guard and no backoff. *Confirmed (test)*
- **Where:** `apps/web/src/stream.ts:28-44`.
- **What happens:** a new request every 4 s whether or not the last one answered. A slow API piles up requests per
  tab, and polling keeps going at full rate while the core is down. One tab with house, room and chat open makes
  about 2 requests a second.
- **Fix:** skip a tick while a request is in flight or the core is down, poll once on recovery and when the tab
  becomes visible, and share one poller per URL.

### M6. The lobby WebSocket reconnects every second for ever when the server accepts and then closes. *Confirmed (test)*
- **Where:** `apps/web/src/lobby/link.ts:100-124`. `onopen` resets the backoff. On the shared site each attempt also
  asks for `/api/lobby/ticket`.
- **What happens:** during the outages Jib causes on purpose, every tab hits the laptop once a second.
- **Fix:** reset the backoff only after the first server message.

### M7. A failed ticket leaves a logged-in person connected as an anonymous visitor until reload. *Confirmed on the client*
- **Where:** `link.ts:89-94`. Others see a visitor, and bell and message nudges stop arriving.
- **Fix:** treat a failed ticket as a failed connect and retry.

### M8. The launcher leaves its children running and allows two copies. *Confirmed*
- **Where:** `scripts/up.mjs`: children start `detached`, and there is no SIGHUP handler.
- **What happens:** close the terminal and the API and caretakers keep running with parent PID 1. The next
  `npm run up` then restarts its API every 5 s for ever because 4100 is taken. Also observed live: a Multiprise
  launcher (port 8165, sharing) and an `npm run up` on 4100 ran against **one** database, so four caretakers looked
  after two houses. *(The second launcher was mine, started for this review. Nothing stopped it.)*
- **Fix:** handle SIGHUP, write a pidfile or lock in `dev/` and refuse a second copy, and don't restart the API on
  `EADDRINUSE`.

### M9. A dead tunnel is neither reported nor repaired. *Confirmed from code*
- **Where:** `scripts/up.mjs` sets `COLOC_PUBLIC_URL` to Vercel before sharing works and never restarts `share.mjs`.
- **What happens:** when the tunnel dies, the public site silently can't reach the API, and GitHub login on the laptop
  is sent to that broken site too.
- **Fix:** restart `share.mjs` when it exits, and check the health URL through the tunnel every minute.

### M10. After the visitor intro, the keys shown on screen do nothing. *Confirmed*
- **Where:** `apps/web/src/lobby/Lobby.ts:1745-1749` (`ownsKeys` needs `stageTouched`).
- **What happens:** close the intro. The hint bar says `E utiliser`, the prompt says `Dire bonjour [E]`. Press E or M
  and nothing happens until you click the 3D view once. Later I also saw focus sit on a button outside the stage
  (`BUTTON.go`) and swallow M. A player's first key press failing is the worst first impression a game can make.
- **Fix:** after the intro or any card closes, focus the stage (`stage.focus()`) and set `stageTouched = true`.

### M11. The seeded house news is wrong in French, in front of the jury. *Confirmed (failing test)*
- **Where:** `apps/api/src/houses/fridge.ts`, test `houses/lines.review.test.ts`.
- **What happens:** "Jib a relu Moussa's pull request". Two other seeded notes never translate, and a display name
  containing a template's own words shifts the blanks. It is planted on every seed and every demo reset.
- **Fix:** store the seeded notes with a kind and values, like the new ones. Use a delimiter a name can't contain.

## Low
- **Blocking doesn't stop invitations or knocks** (`notifications.service.ts:89-115`, `doorbell.service.ts:39`). A
  blocked person can still invite you or ring your house. *Confirmed (test).*
- **Accept races and "one house each" isn't enforced:** two accepts at once give you two houses, and a double click
  marks your own accepted invite "expired". Knocking and renting never check for an existing house. *Confirmed (test).*
- **Room containers run as whatever the image says, root by default:** `room-spec.ts` sets no `User`. Mine ran as
  `node` only because the example's Dockerfile says so. Fix: `User: "65534:65534"`. *Confirmed.*
- **`COLOC_DEV_ORIGINS=1` is forced on while sharing** (`up.mjs:102`), so the lobby origin check accepts any
  `localhost:*` page in the exact demo configuration. Undocumented. *Confirmed.*
- **Lobby ticket in the WebSocket query string** (`lobby.gateway.ts:103`). It can leak through tunnel and proxy logs.
  Single use and 60 s limit the damage. *Suspected.*
- **A caretaker can report any string as a room's address** (`HouseInside.vue:596` renders it as a link). Phishing
  link on a house page. *Suspected.*
- **The repo picker finds your installation by login, not GitHub id** (`tutorial.service.ts:127`). After a rename, a
  stranger who takes the old login exposes their repos to you. *Suspected.*
- **The `COLOC_ADMINS` example names `jib`**, but Jib's GitHub login is `Djbrl`. `github.com/jib` is someone else.
  *Confirmed.*
- **The tutorial polls `/api/tutorial` every 2 s, even in a hidden tab** (`useTutorial.ts:13,147-157`), about 7
  queries per call. *From reading.*
- **Held walk keys stick after Alt-Tab:** no `blur` handler in `Lobby.ts`. *From reading.*
- **English API errors appear as-is in the French UI** (`session.ts:78`, e.g. "Slow down a little…"). The 3D labels
  have the same problem: your own tag reads **"you"**, and the knock and emote screen-reader names are English. Seeded
  house taglines and project descriptions are English too ("Where newcomers take their first room", "A Telegram bot
  that…"). *Confirmed on screen.*
- **The demo reset leaves rooms running:** a seeded free room someone deployed into keeps serving. A house whose
  caretaker is offline at reset time keeps its containers for ever. *Confirmed from code.*
- **The conversation list scans the whole `messages` table:** 193 ms at 1.5 M rows, 4 ms with two partial indexes
  (SQL in the data reviewer's notes). *Measured.*
- **`tsc` writes `dist/` even when the build fails,** so the next `up` runs code that didn't compile. *Suspected.*
- **Workshop rooms are served at `<room>.coloc.localhost`, not `<room>.atelier.coloc.localhost` as dev.md says:**
  `up.mjs` gives the atelier caretaker no `COLOC_HOUSE_DOMAIN`. Two houses with the same room name would collide.
  *Confirmed.*
- **Chat links show the address as typed:** Cyrillic lookalikes and right-to-left control characters pass. *Confirmed
  (test).* Chat times follow the browser's locale, not the chosen language.

## Docs versus code
- HANDOFF says 555 tests; there are 589. It says the site is "built from main"; it's built from the working tree.
- architecture.md says the lobby only accepts the site's own origin, but `COLOC_DEV_ORIGINS=1` is always set.
  architecture.md also leaves out `github_installations` and `up.mjs`.
- dev.md: "Ctrl+C, or Stop in Multiprise, stops all of it" doesn't hold (M8). Workshop room addresses are wrong (see
  Low). Nine variables the code reads aren't listed.
- how-it-works.md says house news is still English (it's translated now) and that only authors delete posts (admins
  can too).
- `engines` says Node ≥22; the scripts need 22.9+.

## Checked and sound
No XSS anywhere: no `v-html`, the 3D labels and minimap draw text, and links only allow http(s). I tried an `<img
onerror>` and a URL in the city chat: escaped and safely linked. Typing in chat doesn't move the avatar. DM, city and
post channels can't be reached by crafting names or ids. Webhook signatures are checked before anything else.
Seeded people can't get invites. CSRF holds (SameSite=Lax, no state-changing GET). No secrets in git history or in
the deployed build. Rooms can't reach each other. Docker lookups are scoped per house.

---

# Part 2: The product, played for real

I came in as a developer from Railway who wants two things: people to build with, and somewhere to keep my apps
running. **Short version:** the first five minutes are the best part of the product: charming, readable, and the
deploy moment lands. After that the city is a beautiful set with nobody in it and not enough hosting under it. I
would not come back on day 2.

## What works, keep it
- **The quest's arc.** Street → a key with your name on it → scaffolding and a crane on the house while it builds →
  "Elle est à vous" → your page live, with your name and city. About five minutes. That is the pitch, done well.
- **The room panel** (Summary / Code / Secrets / Logs / History, "12 Mo sur 256", Update vs Restart) is clear and
  honest. It reads like a real host.
- **AZERTY detection** (the quest showed `Z Q S D`), resume after leaving ("Bon retour… chapitre 7"), the
  graceful-outage design, and chat that doesn't steal keys. These are the details that make it feel finished.

## Where it breaks the "game" feeling
1. **The first key press fails** (M10). The game teaches E, you press E, nothing happens.
2. **"Dire bonjour" doesn't say hello.** The prompt `Dire bonjour [E]` opens a profile card. In the card, the
   "Dire bonjour" tile gives no visible feedback I could see. A verb must do what it says: either wave (emote plus a
   sound) or say "Voir".
3. **No way to follow the light.** "Suivez la lumière" — but when the house is off screen there is no edge arrow, and
   the minimap is turned relative to the camera (D walked me "up" on the minimap). I found the house by trial and
   error. Add an on-screen edge arrow toward the quest target. Every game does.
4. **Reading before playing.** A visitor clicks through four text slides on a static camera, then logs in and reads
   "Une ville de maisons de devs, de Dakar à Kigali" a second time. Cut the intro to one card and let the city
   (camera tour, lit windows) say the rest.
5. **Name tags pile up** at Sacré-Cœur's door (Jib/Awa/Moussa/you overlap on desktop, and on a phone they become an
   unreadable stack). The quest house's door is blocked by a crowd of eight seeded people standing on the beacon.
   Spread the idlers out and fade or stack labels that overlap.
6. **Unfinished-looking pieces:** the big tan blocks with no windows or texture next to Sacré-Cœur, low-contrast grey
   hint text on the loading card. *(Withdrawn on 17 Oct: "the black `/login` for about 3 s" was the test browser's
   pane being hidden, which pauses page animations; the route transition waited for a frame. Not a product bug.)*

## Where it breaks "information when I need it"
- **There's no way home.** After the quest I'm sent to Dakar. My room is in L'Atelier, which isn't in "Trouver une
  maison", and search doesn't find people ("nadia" → nothing). There is no "my room" button. A returning user has to
  remember a URL. Add a home button to the HUD (your avatar or the house icon) that goes to your room in one press.
- **Why something is disabled is hidden in a hover `title` on a disabled button** ("Une personne d'exemple : personne
  ne lirait votre message"). Touch users never see it, and many browsers don't show titles on disabled buttons. Say
  it once in the card, or don't show the button.
- **Wrong breadcrumb:** inside my L'Atelier room the top-left says "Dakar".
- **The Code tab says "Port: Aucun"** while my app listens on 3000, and shows `file:///Users/dsy/la-coloc` as the
  repo.
- **Mixed language everywhere** (see Low): seeded descriptions, house taglines, "you", API errors. A French juror
  sees half-translated screens.
- **Layout leaks:** the house panel scrolls (rows clipped at the bottom), against your own "panels fit" rule. The
  quest card covers the key hint bar ("tou…" clipped). The free room has three calls to action for one action ("La
  prendre", "Prendre la chambre", and "Prenez la chambre en haut de la liste").
- **Labels against your own rule:** "VOTRE PREMIER CHEZ-VOUS" and "4 · APPORTER UN PROJET" eyebrows, "exemple" and
  "personne d'exemple" pills. "Déconnexion" is the only text button in an icon header, and on a phone it's a bare
  icon next to the bell, one mis-tap from logging out with no confirm.

## Why I'd go back to Railway (the retention problem)
1. **Nobody to meet.** Every person I could click is an example person: Message is greyed out, GitHub is greyed out.
   The city room and the board in Dakar are empty. The only real house is Sacré-Cœur, with one free room in the
   whole city. Seven of the eight houses in search are "exemple". A social product that opens on a ghost town reads as
   a mock-up. **For the jury:** seed real-looking life you can *read* (board posts, a city chat backlog, a house
   looking for a Go dev), and make the example people answer something, even canned ("Awa est en vacances, voici
   son projet ↗"). **For real use:** show who's online now on the HUD, and send a notification when someone new
   arrives in your city.
2. **There's no reason to come back.** After the quest there's no next goal: no "review your first PR", no "find a
   house", no "your rent is due". You have the quest machinery (chapters, the tracker), so keep using it as a
   "next thing to do" line.
3. **Not enough hosting for a real app.** 256 MB, 0.5 CPU, no database, no persistent disk or volume, no custom
   domain, no public URL (H2), env only through Secrets, and builds that can take the laptop down (H4). Railway gives
   me Postgres in one click. Even one shared Postgres per house, one schema per room, would change the answer to
   "can I host my side project here?". Until then, say plainly in the room panel what the room can and cannot do.
4. **"Team up" is invisible.** The README sells flatmates teaming up and reviews paying rent, but nothing in the
   first session shows a review happening or what teaming up gives you. The Reviews tab says "Rien à relire". Seed
   one review in progress so the economy can be seen.

## Top 10 to fix before 25 Oct, in order
1. C1: isolate the room network and the build network. 2. C2: random caretaker key, keep `/agent` off the tunnel.
3. H3: dev login and dev origins forced off while sharing. 4. H1: replace the 36 real handles. 5. H2: no QR or
WhatsApp for laptop-only addresses (or give rooms public URLs). 6. M10: focus the stage after the intro and cards.
7. M1: refuse `file://`, hide the laptop path. 8. H4: one build at a time. 9. Translate the seeded content and fix
M11. 10. A home button and a living board/chat backlog in Dakar.
