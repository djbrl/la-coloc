# Contributing to La Coloc

*Written 12 Oct 2026. If something here is wrong or missing, fix it in your pull request.*

**You are a developer who just joined a two-person team building a contest entry in three weeks. Do this, in order:**

1. [Run it locally](docs/dev.md) (15 minutes).
2. Read the rest of this page (10 minutes), especially [the orientation](#1-the-10-minute-orientation) and [the working agreements](#working-agreements).
3. Read [docs/how-it-works.md](docs/how-it-works.md) so you can explain the product in a minute.
4. Pick a task from [TODO.md](TODO.md) marked **good first task**, tell Jib which one, and open a branch.

**The deadlines.** The contest submission is **Sun 25 Oct 2026**. The hard limit is **Sat 31 Oct, 17:00 Dakar time**: nothing can be
submitted or registered after it. The plan was a code freeze on the night of Sat 24 Oct and no production changes after Sunday.
Details and the scoring grid: [docs/contest-rules.md](docs/contest-rules.md).

**The contest in four facts you must know:**

- The score is relevance 25, **technical quality 30** (including whether each of us can explain the code, AI-written parts included), UX 20, innovation 15 and public vote 10.
- **No copyleft anywhere** (GPL, AGPL, LGPL): it makes the project inadmissible. `npm run licences:check` guards the code; you guard the art.
- **AI use is allowed but must be declared** ([docs/ai-usage.md](docs/ai-usage.md)).
- If the project wins, the code and art go to Systalink (Art. 8). Don't put anything in the repo you'd want to keep.

## Contents

[Orientation](#1-the-10-minute-orientation) · [Working agreements](#working-agreements) · [Branches and pull requests](#branches-and-pull-requests) ·
[Commit messages](#commit-messages) · [Code style](#code-style) · [Testing](#testing) · [Design rules](#design-rules) ·
[Art and licences](#art-and-licences) · [Secrets](#secrets) · [AI-assisted work](#ai-assisted-work) ·
[How to add things](#how-to-add-things) · [Areas and owners](#areas-and-owners) · [Getting unstuck](#getting-unstuck)

## 1. The 10-minute orientation

La Coloc has **three programs and one database**. A *house* is a server rented together; a *room* is one flatmate's container on it.

```
  Browser (apps/web)                                    GitHub
    │  HTTP + server-sent events: /api                    │  webhooks: a PR opened, a review given
    │  WebSocket: /lobby-ws (who is walking where)        │
    ▼                                                     ▼
  ┌──────────────────────── API (apps/api, NestJS) ───────────────────────┐
  │ auth · houses · doorbell · rooms · github · agents · lobby · tutorial │
  └────────┬───────────────────────────────────────────────┬──────────────┘
           │ Drizzle (packages/db)                          │ WebSocket /agent, messages from packages/protocol
           ▼                                                ▼ (the caretaker dials OUT: a house server opens no port for us)
       Postgres                        Caretaker (apps/agent), one on every house server
   (coloc.dev's database)                  │ dockerode                    │ writes route files
                                           ▼                              ▼
                                  Docker: one container          Traefik reads the files and sends
                                  per room, with walls           visitors to the right room
```

**How "put my project online" flows** (the heart of the product):

1. The browser calls `POST /api/houses/:id/rooms/:room/deploy` (`apps/api/src/rooms/rooms.controller.ts`). The API checks the viewer may deploy there.
2. `RoomDeployer` (`apps/api/src/rooms/room-deployer.ts`) builds a `deploy` command: the repo, the branch, the room's memory and CPU caps,
   its decrypted secrets and the `COLOC_ROOM`… variables. It goes to that house's caretaker over the WebSocket (`AgentRegistry.send`).
3. The caretaker (`apps/agent/src/deploy.ts`) clones the repo, builds an image, starts a container with its walls (no capabilities,
   capped memory and CPU, its own network), health-checks it, writes a Traefik route file, waits for Traefik to follow, then removes the old container.
   Zero downtime. At each step it sends a `deploy_status` message back.
4. The API records the status (`HousesService.recordDeployStatus`) and announces the change on the live streams. The browser updates: the room's window lights up and fireworks go off.

**Where things live:**

| Path | What is there | Read first |
|---|---|---|
| `packages/protocol/src/index.ts` | Every message between the API and a caretaker, as zod schemas. Short. | This one: it is the whole contract |
| `packages/domain/src` | Pure rules, no I/O: reviewer rotation, bill split, reviews as rent, tontine turn | `bill.ts`, `tontine.ts` |
| `packages/db/src/schema.ts`, `packages/db/drizzle/` | The tables, and the SQL migrations generated from them | `schema.ts` |
| `apps/api/src` | One folder per area: `auth`, `houses`, `doorbell`, `rooms`, `github`, `agents`, `lobby`, `tutorial`, `demo`, `seed` | `houses/houses.controller.ts` |
| `apps/agent/src` | The caretaker: `deploy.ts` (swap), `docker.ts`, `room-spec.ts` (the walls), `proxy.ts` (routes), `meter.ts` (usage) | `room-spec.ts`, `deploy.ts` |
| `apps/web/src/lobby` | The 3D city (three.js): `Lobby.ts` is the engine, `neighbourhood.ts` generates a city's streets, `cityStyle.ts` gives each city its look | `neighbourhood.ts` |
| `apps/web/src/components` | `LobbyView.vue` runs the lobby screen; `lobby/` holds its cards and panels; `list/` and `pages/` are the list view | `lobby/HouseInside.vue` |
| `apps/web/src/style.css` | The design tokens (colours, fonts, spacing), light and dark | the top 120 lines |
| `examples/` | Small apps to put in rooms | |

The longer version, with the design choices to say to the jury, is [docs/architecture.md](docs/architecture.md). The product is [docs/how-it-works.md](docs/how-it-works.md).

**A good hour of reading:** `packages/protocol/src/index.ts` → `apps/agent/src/room-spec.ts` → `apps/agent/src/deploy.ts` →
`apps/api/src/houses/houses.controller.ts` and `houses.service.ts` → `packages/db/src/schema.ts` → `apps/web/src/components/lobby/HouseInside.vue`.

## Working agreements

How Jib likes things done. They apply to everyone, AI assistants included.

- **Ask Jib before** downloading any art, sound or font, adding a dependency whose licence you aren't sure of, spending money, or changing what the product is.
  Give the name, the source and the size. Jib owns the web, the UX and the art, and has the last word on all three.
- **Everything must be explainable.** The jury grades the team's mastery of the code. If you can't explain a line, don't merge it, and don't ask anyone to.
- **Stage files by name**, not with `git add .` or `git add -A`: check `git status` and add what you mean. An untracked file you didn't create isn't yours to commit.
- **Never put credentials in the repo** and never type anyone's password or click "Authorize" for them. OAuth consent on GitHub is the account owner's click.
- **Never @-mention a GitHub user who hasn't linked an account.** The demo flatmates are made up; the code refuses to mention them, and so must any new code.
- **Use "they/them" for Jib.**
- **Small steps.** One pull request, one idea. A reviewer should read it in ten minutes.
- **Leave it better and say so.** Update the doc your change makes wrong, in the same pull request.

## Branches and pull requests

What we recommend for two people: simple, with `main` always green. Not set in stone; change it when it gets in the way.

1. **`main` is always working.** CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, `npm test` and `npm run licences:check` on every push and pull request. Never leave it red.
2. **One short-lived branch per task**, named `feature/<what>`, `fix/<what>` or `docs/<what>` (`feature/french-welcome`, `fix/tontine-midnight`). Live a day or two, not a week. Start from an up-to-date `main`:

   ```bash
   git switch main && git pull && git switch -c feature/my-task
   ```

3. **Commit as you go**, then push and open a pull request into `main`. The template lists what to check. Say which [TODO.md](TODO.md) item it closes.
4. **Review.** The other person reads it and approves; Jib reviews anything that touches the product, the design or the art. For a docs fix or a typo, merge on green. Look at the *behaviour* too: run the branch, open the screen.
5. **Merge with "Squash and merge"** so `main` has one readable line per task (the pull request's title, written like a [commit message](#commit-messages)). Delete the branch.
6. **Keep your branch current** with `git pull --rebase origin main` (or merge `main` in) before you open the pull request, and again if `main` moved.
7. **Migrations collide.** If you and a teammate both add a database migration, the second one to merge deletes its generated files, brings in `main`, and generates again (see [add a migration](#add-a-migration)).
8. **The last days** (the roadmap's plan): Thu 22 Oct register the team and deploy, Fri 23 seed and polish, Sat 24 night code freeze. Keep risky changes out of the last three days.

**Decision for Jib:** do you want GitHub branch protection on `main` (require the CI check, and one approval)? It stops accidents. It also stops you pushing a fast fix alone. We suggest requiring only CI green, and trusting each other on approvals. See [TODO.md](TODO.md), contest admin.

**Pushing straight to `main`** is how the project was built until now (one person, with CI). It's fine for tiny documentation fixes while there are only two of us; for anything else, use a branch.

## Commit messages

The house style (read `git log` to see it): one short, plain sentence that says what is now true, no full stop, starting with a capital.
Then, when it helps, a blank line and a paragraph of prose (wrapped near 120 characters) that says what changed and why.

```
The bill pays in reviews, the tontine has faces, and sentences replace labels

From the review (R7, R15, R16…): the Bill tab tells each flatmate what their reviews took off and what they owe,
and "Pay your share" offers the country's mobile money (a mock that marks it paid). The tontine shows whose turn it is.
```

- Say the outcome ("Knocks show the applicant's work"), not the activity ("Updated ApplicationPage").
- Mention the TODO item or review number it answers.
- **AI-assisted commits end with a trailer** naming the tool, as the existing history does:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

  Use the model name your tool reports. A commit you wrote yourself has no trailer.
- Don't commit secrets, `.env*`, `*.pem`, build output or scratch files. `.gitignore` covers most; look at `git status` anyway.

## Code style

There is no ESLint or Prettier yet (it's on [TODO.md](TODO.md)). Until then: **match the code around you**, and let `.editorconfig` set the basics
(2 spaces, LF, final newline). TypeScript everywhere, `strict` on, no `any`; double quotes and semicolons.

- **Comments explain why, in plain English.** Every file starts with a few lines saying what it is and why it exists. Explain the reason for a rule, not the syntax. Read `apps/agent/src/proxy.ts` or `packages/domain/src/bill.ts` for the tone. The jury reads this code: write for them.
- **Plain names, no abbreviations.** `monthlyCostFcfa`, `repoFullName`, `reviewerRotation`; not `mcf`, `repoFN`, `rr`. Functions are verbs. Booleans read as questions (`isOnline`, `strictReviews`).
- **Validate at the edges with zod.** HTTP bodies (see `RentBody` in `houses.controller.ts`), agent messages (`packages/protocol`) and environment settings are parsed once, where they enter. Inside, trust the types.
- **User-facing words are sentences in plain English**, kept in one place per area (`components/lobby/panel/words.ts` for the panels). That's also what will make the [French translation](TODO.md) possible.
- **Pure logic goes in plain `.ts` files** (no Vue, no I/O) so it can be tested: `packages/domain`, and next to components (`crew.ts` beside `Crew.vue`).
- **Big files are a smell.** `apps/web/src/lobby/Lobby.ts` is over 2 000 lines and is on the [tech-debt list](TODO.md). Don't make it bigger without a reason: add a new file.
- **API errors are friendly sentences** that tell the person what to do ("Only the chef rents the server."), with the right HTTP status.

## Testing

`npm test` (repo root) builds the three shared packages and runs every workspace's tests: **over 400 today**, under half a minute, **no Docker needed**: the database tests run on PGlite (Postgres in WebAssembly, in memory).
Commands for one package, one file or one name are in [docs/dev.md](docs/dev.md#running-the-tests).

| Package | What its tests cover |
|---|---|
| `packages/domain` | Reviewer rotation, bill split, reviews as rent, tontine turns, admission votes |
| `packages/protocol` | That messages parse and bad ones are refused |
| `packages/db` | That every migration applies to an empty database |
| `apps/agent` | The room's walls (`room-spec`), environment config, git safety (what the caretaker will clone). **Not Docker itself:** that is checked by hand with the isolation demo |
| `apps/api` | Login and permissions, doorbell, chores and GitHub webhooks, deploys, rooms and secrets, the exchange and bill, the tutorial, the demo reset, lobby presence |
| `apps/web` | Logic only: crew rows, the tutorial's step machine, path finding, daylight, windows, the city's live diff. **Components are not mounted in tests**, so keep logic out of `.vue` files |

**Writing a test:**

1. Put `something.test.ts` next to `something.ts`. Vitest is already set up.
2. Test what you **observe**, not how it is built: "a free room is empty whatever runs there", not "calls `applySnapshot` once".
3. For the API, copy the pattern in `apps/api/src/houses/exchange.test.ts`: `testDb()` for a real database in memory, `seedCity(db, …)` for the bare city, build the service or controller directly, call it, assert on what comes back. Don't mock the database.
4. New business rule (money, votes, turns, permissions)? Test it before you consider it done. A bug fix gets a test that failed before the fix.
5. A change you can only see (a screen, a 3D scene): say in the pull request what you looked at (screen, day and night, desktop and phone) and put the logic you can test in a `.ts` file.

CI runs `npm test` and `npm run build` (which type-checks every Vue file with `vue-tsc`). Green locally means green there.

## Design rules

Jib's rules for anything the player sees. The reference is **Apple's design philosophy**, in the language of a game's **pause menu** (the lobby of the fighting game 2XKO is the mood: warm lights, emotes, one interact prompt).

- **Flat floating cards.** No glass, no blur, no heavy shadows. A card floats over the lobby and pops in; the camera frames the thing it talks about. Panels sit on the right on desktop, and take about 70% of the height on a phone.
- **No visible form labels.** Write a sentence instead ("You live in the room called awa."), or use an icon. Hidden accessible names (`aria-label`, the `.sr-only` class) are expected and required. A coloured dot plus a sentence beats a "Status: Online" pill.
- **Plain words.** A newcomer must understand every word. Use the vocabulary in `apps/web/src/components/lobby/panel/words.ts` (house, room, project, put online, update, restart, knock) and add to it instead of inventing new names.
- **One primary action per view.** One next step in a panel's foot; the rest are quiet.
- **Light and dark** both work, always, via the tokens in `apps/web/src/style.css` (`--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--live`, `--warn`, `--danger`…). Never write a hard-coded colour in a component. Check both themes. Muted text must keep 4.5:1 contrast.
- **Panels are built on `components/lobby/panel/`**: `Panel` (head, tabs, body, foot), `PanelTabs` (the only navigation), `ListRow` (dense rows), `StatusDot`. **Panels fit without scrolling** (only a chat, logs or a long history scrolls, inside itself). Measure at 1440×900 and 1280×640.
- **Icons over text** where the meaning is clear, always with a hidden name. Reveal things one at a time: nothing the player doesn't need yet.
- **Keyboard first:** everything reachable with Tab, Esc closes the top card, single-key shortcuts only while the city has focus. Honour reduced motion.
- **Sounds are synthesised** (`apps/web/src/lobby/sound.ts`): nothing to download or declare.

## Art and licences

- **Only CC0 or permissive assets, or our own.** Never artwork from ArtStation, Pinterest or rips: it belongs to its artists, and contest Art. 6 requires a project free of third-party rights.
- **Ask Jib before downloading** anything (name, source, size). Then log it in [docs/licences.md](docs/licences.md) (asset, where it lives, source, licence) and, for lobby models, in [apps/web/public/lobby/README.md](apps/web/public/lobby/README.md). Keep the licence file next to the asset.
- **Dependencies:** run `npm run licences:check` after adding one. It must print `licences OK: no copyleft`; CI runs it. Allowed: MIT, ISC, Apache-2.0, BSD, 0BSD, CC0, Unlicense, BlueOak, Python-2.0, CC-BY-4.0, and OFL-1.1 for fonts. Not allowed: GPL, AGPL, LGPL, and anything "non-commercial". Update the summary in [docs/licences.md](docs/licences.md).
- **No brand logos** (Wave, Orange, MTN…): text names and generic colours only.
- **Traps we already avoided:** Redis (no longer permissive), MySQL, Bun's `--compile`, `sharp`/libvips. See `docs/licences.md`.

## Secrets

- **Never commit** `.env`, `.env.*`, `*.pem`, tokens, keys or passwords. `.gitignore` covers `.env*` (except `dev/.env.example`) and `*.pem`. `dev/.env.local`, `dev/.env.github` and `dev/github-app.pem` stay on your machine.
- **If you commit one by mistake**, tell Jib at once. Deleting it in a later commit doesn't help: the secret is in history, so it must be rotated (a new key, a new App secret).
- **The dev login must never be on in production.** `COLOC_DEV_LOGIN=1` lets anyone be anyone; `COLOC_ALLOW_LOCAL_REPOS=1` lets a flatmate build from any folder on the server. Both are for development only. Leave `COLOC_DEMO_RESET` off on any server you care about.
- **Room secrets** (users' API keys) are encrypted with AES-256-GCM with `COLOC_SECRETS_KEY`. Never log a decrypted secret, and never put one in a test fixture that looks real.
- **A caretaker never holds GitHub credentials.** The API sends a short-lived installation token for one repo. Keep it that way.

## AI-assisted work

The contest allows AI tools, and makes us **declare** them. It also grades whether we can explain the result. So:

1. **Log it.** After notable AI-assisted work, append a row to [docs/ai-usage.md](docs/ai-usage.md): date, tool and model, what it produced, and **who reviewed and understood it**. Put a real name and date in that last column, not "to review".
2. **Write it up.** For a notable batch, add a dated section to [docs/build-notes.md](docs/build-notes.md): what you built (a table of what and where), how you checked it, what's still rough. Both logs are append-only; fix typos and links, never rewrite history.
3. **Read it before you merge it.** Everything an AI wrote must be read by a human who can explain it to the jury. If you can't, simplify it until you can.
4. **Commit trailer:** `Co-Authored-By: <model name> <noreply@anthropic.com>` on AI-assisted commits (see [Commit messages](#commit-messages)).
5. **AI assistants in this repo** commit and push only when asked, give each parallel helper its own files, and review their work before committing. They never sign in or authorize anything for a person.

## How to add things

Short recipes taken from the code as it is. Replace the example names with yours.

### Add a migration

1. Edit the tables in `packages/db/src/schema.ts` (it's the source of truth).
2. Generate the SQL, with a readable name:

   ```bash
   npm run generate -w @coloc/db -- --name=user_pronouns
   ```

   This writes `packages/db/drizzle/00NN_user_pronouns.sql` and updates `drizzle/meta/` (a snapshot and `_journal.json`). Read the SQL. You should see only what you meant.
3. Rebuild the package so the compiled copy knows the new column, and run the tests (every migration is applied to an empty database in them):

   ```bash
   npm run build:packages
   ```

4. Commit the `.sql` **and** the `meta/` files with the schema change. Never edit a migration that has been merged. Restart the API: it migrates on start.
5. If the new column is part of a view the browser sees, also update `apps/api/src/houses/house.types.ts` and the mirror in `apps/web/src/types.ts` ("keep the two in step").

### Add an API route

1. Pick the area's controller in `apps/api/src/<area>/` (or make a module and add it to `app.module.ts`).
2. Describe the request body with a zod schema at the top of the file and parse it with the file's `parse()` helper (see `RulesBody` in `houses/houses.controller.ts`).
3. Write the method: decorate it (`@Post(":id/…")`), read who's asking (`await this.auth.userFromRequest(req)`), answer with the right status (401 not logged in, 403 not allowed, 404 not found), then hand the real work to a service method. Keep controllers thin; rules and queries live in the service.
4. If it should change what other people see live, the service announces it (`HousesService.changes`) so the streams resend.
5. Test it as in `houses/exchange.test.ts`: `testDb()`, `seedCity`, call the controller, assert. Test the 401, the 403 and the happy path.
6. Call it from the web with `postJSON` / `sendJSON` (`apps/web/src/session.ts`), which return `{ ok, data }` or `{ ok: false, message }`. Show `message` to the person as it is.

### Add a lobby panel (or a tab in a house)

1. Build on the kit in `apps/web/src/components/lobby/panel/`: `Panel` for the shape, `PanelTabs` for navigation, `ListRow` for dense rows, `StatusDot` for state. Don't invent new chrome.
2. A new tab in a house: add its key to `TabKey` and an entry (icon, one word) to `tabs` in `components/lobby/HouseInside.vue`, add its body block, and a line for it in `explain` in `panel/words.ts`. New icons go in `house/icons.ts`.
3. Put anything you can compute (what to show, in which order, which words) into a plain `.ts` file next to the component, with a test (see `house/crew.ts` and `crew.test.ts`).
4. Use sentences, not labels; give every icon-only button an accessible name; use only the tokens in `style.css`.
5. Check it at 1440×900 and 1280×640, day and night, and on a phone width: the body must not scroll unless it holds a stream.

### Change the seed (the development city and the demo)

1. The houses, rooms and flatmates are the `CITY` array in `apps/api/src/seed/city.ts`; the "month of life" (reviews, chat, notes, deploys) is `seed/life.ts`.
2. After a change: `npm run build -w @coloc/api`, stop the API, `npm run dev:seed`, start the API. Or press "Reset the demo city" in the lobby's settings (it replants the seed with the API running).
3. Tests start from the bare city (no `life`), so adding a house can change counts in tests: run `npm test -w @coloc/api` and fix what the numbers say.
4. Seed rows are only rows: nothing calls GitHub, and nobody is @-mentioned.

### Add a message between the API and a caretaker

1. In `packages/protocol/src/index.ts`, write the zod schema and export its type. Add it to `ApiToAgent` (API tells the caretaker) or `AgentToApi` (the caretaker tells the API).
2. Add a test in `packages/protocol/src/index.test.ts` that it parses and that a bad one is refused. Then `npm run build:packages`.
3. **Sending:** the API calls `AgentRegistry.send(houseId, { type: "…" })` (see `remove_room` in `houses.controller.ts`). The caretaker sends with `link.send(…)` (`apps/agent/src/index.ts`).
4. **Receiving:** the API handles caretaker messages in the `switch (msg.type)` in `apps/api/src/agents/agents.gateway.ts`. The caretaker handles commands in the `switch (cmd.type)` in `apps/agent/src/index.ts`. Neither switch complains about a missing case, so add yours on purpose.
5. Rebuild and restart both programs: a new message needs both sides running the new code.

### Add a room-level environment variable, an example app, or a house rule

Look at an existing one and copy its path: `COLOC_ROOM` (`room-deployer.ts`, reserved in `rooms/secrets.ts`), `examples/ndaje` (a Dockerfile and a small server), `PATCH /api/houses/:id/rules` (route, service, web chip, test).

## Areas and owners

**Decision for Jib:** fill in the owner column. Ownership means "first to ask, and the usual reviewer", not "only person allowed to touch".

| Area | What it covers | Where | Owner |
|---|---|---|---|
| Web, UX and art | The lobby's look, the panels, the design tokens, every asset, copy | `apps/web`, `docs/licences.md` | Jib |
| The 3D engine | Walking, camera, paths, windows, city styles, sound | `apps/web/src/lobby` | ? |
| API: people and houses | Login, houses, doorbell, tutorial, demo, seed | `apps/api/src/{auth,houses,doorbell,tutorial,demo,seed}` | ? |
| API: GitHub | The App, webhooks, chores, deploy on merge, previews | `apps/api/src/github` | ? |
| Rooms, the caretaker and servers | Builds, walls, Traefik routes, `install.sh`, the real server, HTTPS | `apps/agent`, `apps/api/src/{rooms,agents}`, `apps/web/public/install.sh`, `dev/` | ? |
| Database and rules | Schema, migrations, the domain rules, the money | `packages/db`, `packages/domain`, `apps/api/src/houses/money.ts` | ? |
| Payments | Real mobile money through an aggregator | new | ? |
| Quality and CI | Tests, CI, lint, branch protection | `.github`, every `*.test.ts` | ? |
| Docs, demo video and contest admin | These docs, the AI and licence declarations, registration, the pitch | `docs/`, [TODO.md](TODO.md) | ? |

## Getting unstuck

1. **It won't start:** the troubleshooting table in [docs/dev.md](docs/dev.md#troubleshooting) has the failures we have actually seen.
2. **What is this part for?** [docs/README.md](docs/README.md) lists every doc; [docs/architecture.md](docs/architecture.md) explains the stack and why; [docs/build-notes.md](docs/build-notes.md) says when and why each thing was built, and what was rough.
3. **Why was it done this way?** `git log -p -- <file>` (commit messages explain), then the build notes, then ask.
4. **What should I do next?** [TODO.md](TODO.md), top to bottom. A task marked "needs Jib's decision" waits for them: ask.
5. **Still stuck after 30 minutes:** ask Jib, with what you tried and what you saw. Paste the error, not a description of it.
