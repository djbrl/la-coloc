# Adversarial review brief

*Written Fri 16 Oct 2026. For a reviewer (human or agent) asked to find what's wrong with La Coloc before it's shown
to a contest jury and to the public. Your job is to break it, not to praise it.*

## What you're reviewing

`main` at or after `060b4fc`. Most of it was written by AI agents over two days: 78 commits since `d452316`
(257 files, about 23 000 lines added). The build passes, 589 tests pass, the licence check passes. That proves little:
the same agents wrote the tests. Assume the tests share the code's blind spots.

Read first, briefly: [README.md](README.md), [HANDOFF.md](HANDOFF.md), [docs/architecture.md](docs/architecture.md),
[docs/how-it-works.md](docs/how-it-works.md). The contest rules are in [docs/contest-rules.md](docs/contest-rules.md)
(French).

To see the full change set: `git diff d452316..HEAD`. To run it: [docs/dev.md](docs/dev.md) (`npm run up`, then
`npm run dev:web`). Tests need no Docker: `npm test`.

## How it runs today (this matters for the threat model)

The API, Postgres, Traefik and the caretakers run on one laptop. A Cloudflare quick tunnel exposes the API to the
internet; the site is on Vercel (`https://la-coloc.vercel.app`) and forwards `/api` to the tunnel. **Anyone with the
link reaches the laptop's API.** The caretakers run Docker containers with code pulled from GitHub repos. GitHub login
is the only way in (the dev login is off while sharing).

## Where to dig (highest risk first)

### 1. Who can do what (authorisation)
- **Chat** (`apps/api/src/chat/*`): DMs live in the `messages` table under `dm:<idA>:<idB>`; city rooms `city:<City>`;
  board replies `post:<id>`. Can someone read or write a channel they shouldn't (another pair's DM, another house's
  channel, a knock thread), by crafting a login, a city name or a post id? Does blocking really block, both ways,
  everywhere (DMs, city room, board, house chat, knock threads)? Can a blocked person still reach you some other way?
- **Invitations and notifications** (`apps/api/src/notifications/*`, `apps/api/src/houses/move-in.ts`): accepting a
  house invite moves you into a room. Races: two accepts for one room, an accept while the room is taken by a knock,
  inviting into a house you just left, inviting someone who just got housed. Can a non-flatmate invite? Can someone
  accept an invite meant for another? Does "example person" detection hold (seeded people must never receive real
  invites)?
- **Repo linking** (`apps/api/src/tutorial/*`, `apps/api/src/github/*`, table `github_installations`): can a user link
  a repo they don't control, or one that belongs to someone else's organisation? The picker trusts the install
  webhook's `sender` to know who installed an org install. Can a replayed or forged webhook change that? (Webhooks are
  HMAC-signed; check every path verifies.)
- **House actions**: knocks, votes, the bill's "mark paid", room settings, secrets, deploys, the demo reset (admins
  only, `COLOC_ADMINS`). Try each as an outsider, a flatmate, the chef, logged out.

### 2. The public-facing API on a laptop
- **No rate limiting** except chat (5 messages per 10 s, 5 posts an hour, in memory: `apps/api/src/chat/limiter.ts`).
  Login, knocks, invites, deploys, the repo picker (each call reaches GitHub) are unlimited. How fast can one person
  fill the database, trigger builds, or burn the GitHub App's rate limit?
- **Deploys run code from GitHub on the laptop.** Read `apps/agent/src/room-spec.ts` (the room's container: memory,
  CPU, capabilities, network, read-only filesystem…). What can a malicious repo do: reach the laptop, the database
  (port 5433), Traefik, other rooms, the Docker socket? The isolation demo is `scripts/isolation-demo.sh`.
- **The lobby WebSocket pass** (`/api/lobby/ticket`, `AuthService.issueTicket`, `apps/api/src/lobby/lobby.gateway.ts`):
  a one-minute single-use token in memory. Can it leak (URL in logs, referrers, the tunnel)? Is the origin check
  sound, including `COLOC_DEV_ORIGINS` (any `http://localhost:*` / `127.0.0.1:*`)? What if the launcher runs with
  that flag while sharing (it does)?
- **Cookies**: `SameSite=Lax`, `Secure` when the public URL is https, set through Vercel's rewrite. CSRF on
  state-changing POSTs?
- **Secrets**: room secrets are encrypted with `COLOC_SECRETS_KEY`. `scripts/share.mjs` deploys a build folder that
  `vercel link` writes a token file into (it deletes it and adds `.vercelignore`); check nothing secret is in the
  deployed site or in the repo history (`dev/.env.*`, `*.pem`).

### 3. Data and migrations
- Migrations `0013_notifications`, `0014_github_installations`, `0015_chat` (`packages/db/drizzle/`). Run them on a
  database with real-looking data. Missing indexes on hot paths (unread counts, conversation lists, board lists)?
- The demo reset (`apps/api/src/demo/demo.service.ts`) deletes houses and some chat; check what it leaves orphaned.
- Fridge notes and knock lines are now stored with a kind and values and parsed back from old English rows
  (`apps/api/src/houses/fridge.ts` and the doorbell). Do old rows render correctly? Can user input (a project name, a
  room name) break the parser or inject into another language's sentence?

### 4. The caretaker (`apps/agent`)
- Every Docker lookup is now scoped per house (`roomFilter`); networks are `coloc-room-<house>--<room>`. Rooms
  created before this change used `coloc-room-<room>`. Can a deploy or cleanup remove another house's container or
  network? What happens on the first deploy after the upgrade?
- Zero-downtime swaps, PR previews, logs, usage: anything still keyed by room name alone?

### 5. The web (`apps/web`)
- **XSS**: chat, board, fridge notes, knock threads, names, project descriptions. Links in chat are drawn "safely";
  check how. Anything rendered with `v-html`?
- `apps/web/src/stream.ts`: when built for sharing, every live stream becomes a poll every 4 s. Load on the API with
  N open tabs? Does polling stop when the tab is hidden and resume correctly?
- The 3D lobby: performance on a cheap Android phone (the passers-by, the minimap's per-frame drawing), memory leaks
  when travelling between cities repeatedly, keyboard handling (AZERTY via `KeyboardEvent.code`) stealing keys from
  text inputs (chat!).
- Every screen in French: missing words, overflow, sentences built by concatenation.

### 6. The tooling
- `scripts/up.mjs` (the one-command launcher, also what Multiprise runs): orphaned processes on crash, restart loops,
  what happens if Docker never starts, if port 4100 is taken, if the build fails halfway.
- `scripts/share.mjs`: what if the tunnel dies mid-session (the site silently can't reach the API)?

### 7. Docs versus code
The docs were rewritten on 16 Oct. Find any claim in README, HANDOFF, how-it-works, architecture or dev.md that the
code doesn't back, and any command that doesn't work as written.

## Already known (don't report these as new)
- Payments are a mock: "Pay" only marks the line paid (Stripe test mode is next).
- No rate limiting outside chat; no HTTPS or Datacloud deployment yet.
- Rooms' own addresses (`*.coloc.localhost`) only open on the laptop.
- The quest's starter page clones from the private repo; it only works on the laptop.
- The rate limiter is in memory (one API process).
- No editing or deleting of chat messages (board replies can be deleted); no "load older"; no screen for reports.
- An organisation's GitHub install made before 16 Oct isn't seen by the repo picker.
- The project has no `LICENSE` file (team decision pending).

## What to hand back

A single Markdown report, most severe first. For each finding:

- **Severity**: critical (data loss, account takeover, code execution, a jury-visible crash) / high / medium / low.
- **Where**: file and line.
- **What happens**: concrete steps or inputs that show it (a curl, a test, a click path). Prefer a failing test.
- **Fix**: the smallest change that closes it.

Mark each finding *confirmed* (you reproduced it) or *suspected* (reasoned from the code). Skip style opinions and
"consider adding" suggestions with no concrete failure behind them.
