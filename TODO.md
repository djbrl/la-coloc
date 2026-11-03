# TODO

*As of Fri 16 Oct 2026. This is the one list. Take the top item that fits you, tell Jib, and tick it off in your pull
request. Sizes: S = up to two hours, M = about half a day, L = a day or more. **Needs Jib** = a decision or an
approval first. Details of anything done: [docs/build-notes.md](docs/build-notes.md).*

## Contest dates (Dakar time)

| When | What |
|---|---|
| **Sun 15 Nov, 17:00** | Registration and submissions close: nothing is accepted after it |
| **Sun 15 Nov 18:00 – Mon 16 Nov** | Peer vote: **every member must vote**, or the team is out |
| 17 – 20 Nov | Team campaign and public vote |
| 21 – 22 Nov | Jury: keep the site up until then |
| 23 Nov | Results |

## Must do

- **Payments in a sandbox** · L · **needs Jib**. Today "Pay your share" only marks the line paid
  (`POST /api/houses/:id/bill/paid`, `markBillPaid` in `apps/api/src/houses/houses.service.ts`).
  1. Stripe in test mode. *Done when:* a test card pays a bill line, a signed webhook marks it paid, and a test covers it.
  2. Then a mobile-money sandbox (FedaPay or Kkiapay). *Done when:* the same works with their test numbers.
- **Rate limiting before sharing widely** · S–M · good first task. Nothing limits login, knock, message, invite or
  deploy requests over HTTP. *Done when:* those routes are limited per person or address (for example
  `@nestjs/throttler`, MIT), a test shows the 429, and `npm run licences:check` passes.
- **The quest's starter page must be reachable on a real server** · S · **needs Jib**. The caretaker clones without
  credentials, and the default `COLOC_TUTORIAL_REPO` and the seeded rooms point at our private repo. *Done when:* the
  examples live in a public repo (or the repo goes public) and a fresh visitor finishes the quest on the shared site.
- **Risk review of rooms as small servers** · **needs Jib**. Internet, a writable disk and root inside a room open up
  abuse, disk and backup risks: see "Risk review" in [docs/todo-jib.md](docs/todo-jib.md). *Done when:* each one is fixed or accepted.
- **Real people in real rooms** · M · **needs Jib**. Eight of nine houses are examples. *Done when:* at least three
  real people with real repos live in rooms before the peer vote.
- **The demo video** · M · Jib. About three minutes, opening on the city, in French with English subtitles. A shot
  list is in [the old review, §5](docs/archive/review-2026-10-10.md#5-anything-else-a-ruthless-juror-would-say).
  *Done when:* the video is uploaded and its link is ready for the form.
- **A native speaker reads the French** · S. *Done when:* the word lists in the build notes (French, the quest, the
  invitations) are checked and fixed.

## Datacloud (the teammate handles these)

The contest needs the project deployed on Datacloud (rules, Art. 6). Until then `npm run share` is the stand-in.

- **Deploy the site, API and Postgres** · L. Nothing serves the built site in production yet (the API doesn't).
  *Done when:* our domain opens the city on a phone on mobile data, login works, and a reboot brings it all back.
- **Run `install.sh` on a real server and put Sacré-Cœur on it** · L. `apps/web/public/install.sh` has never run on a
  server. *Done when:* the chef's one-line command makes a fresh Ubuntu server a live house and a room deploys from GitHub.
- **HTTPS** · M. Rooms' route files only use plain HTTP (`apps/agent/src/proxy.ts`, `room-spec.ts`); a remote
  caretaker needs `wss://`. Use a wildcard certificate (previews make many subdomains). *Done when:* the site and
  every room answer on `https://`, and `http://` redirects.
- **A production GitHub App with direct webhooks** · M. *Done when:* a second person logs in with GitHub on the real
  site and a pull request in a linked repo gets its reviewer within seconds.
- **An uptime alarm** · S. *Done when:* the site and a room are checked every minute until 10 Nov, alerting both phones.

## Should do

- **Check reviews with two real GitHub accounts** · S · good first task. *Done when:* on a test repo, a pull request
  gets a reviewer, the review is given, it counts on the bill, and the result is in the build notes.
- **Check the quest with the real stack** · S. It was walked end to end only against a stand-in API. *Done when:* a
  new login plays it with Docker, Postgres and the workshop's caretaker, including a failed build and a reload.
- **API sentences in French** · M. Error messages, house news, knock-thread lines, GitHub comments and the example
  city are English text. *Done when:* the API sends a kind and values and the site words them.
- **A lighter first load on phones** · S. The 3D models are packed (9.2 MB to 2.1 MB, 19 Oct). *Done when:* the
  first load is measured on a cheap Android phone.
- **ESLint and Prettier** · M · good first task (agree the rules with Jib first). *Done when:* `npm run lint` runs in CI and passes.
- **Split `apps/web/src/lobby/Lobby.ts`** (about 2 200 lines) · L. *Done when:* camera, input, people and town are
  separate files with no change in behaviour.
- **Per-country currency** · S–M · **needs Jib**. Every price is in FCFA, including Kigali, Tunis and Marrakech.

## Rough edges

- **The demo reset replants the whole city** · S · **needs Jib**. `apps/api/src/demo/demo.service.ts` deletes every
  house, the ones real people started included, with their chat and knocks, then plants the seed. *Done when:* we
  decide whether real people's houses survive a reset, and the code and its test say so.
- **The tontine's turn changes at midnight without telling open pages** · S. *Done when:* the stream resends then.
- **Invitations:** the person card inside a house window doesn't offer an invitation; inviting always uses your first
  house. **The quest:** on a phone, chapter 8's card covers half the house's sheet; the QR code can't report a scan.
- **Core-down screens:** small edges listed in the build notes of 12 Oct; a real Postgres restart is untested.
- **smee** can break a webhook's signature in development (a `401` in the relay's log).

## Later, if there is time

Report, mute and leave or evict; tontine perks; GitHub's Deployments panel; recorded sounds (Kenney,
CC0, needs Jib); pinch-to-zoom on phones; graphs of a room's usage; a CI job that
runs the isolation demo.

## Contest admin (Jib)

- Register the team before 15 Nov, 17:00: every member has a Datacloud account; name a representative and the country.
- Buy at least one Datacloud product with the 40% code before submitting (not a VPS outside Dakar).
- Each member signs the titularity declaration (rules, Art. 6).
- Final pass on [docs/licences.md](docs/licences.md); `npm run licences:check` passes on the submitted commit.
- Fill the last column of [docs/ai-usage.md](docs/ai-usage.md) with real reviewer names and dates.
- Submit by Sun 15 Nov, 17:00: the address, the declarations, the video.
- Vote on 15–16 Nov, every member. Keep production up until 23 Nov.
- Rehearse: each member can explain their parts, AI-written ones included.
- Decide on branch protection for `main`.

## Done since 12 Oct

| What | Where it's explained |
|---|---|
| French for every screen, with a switch in settings | [build notes, 15 Oct](docs/build-notes.md#15-10-2026-night-french-m5) |
| The UI refresh: new look, fonts, shared buttons and panels, a style guide | [build notes, 15 Oct](docs/build-notes.md#15-10-2026-overnight-a-ui-refresh-between-a-dev-tool-and-a-game-branch-ui-refresh) |
| "Your first home", the eight-chapter quest, with a repo picker and a new starter page | [build notes, 15–16 Oct](docs/build-notes.md#15--16-10-2026-overnight-your-first-home-the-first-visit-as-a-quest-branch-first-home) |
| Reviews and News in plain sentences in the house panel | same |
| An always-daylight city, a game-like minimap, a new login page | same, "Jib's review of the city" |
| Passers-by, house rows with icons, a person card you can act on | same, 16 Oct |
| Invitations, the bell, and a "no" that tells the sender | same, "invitations, a bell" |
| Walking by key position, so Z Q S D walk on a French keyboard | `apps/web/src/lobby/keys.ts` |
| `npm run share`: the site on Vercel, the API behind a tunnel, a pass for the lobby's socket | [dev.md](docs/dev.md#sharing-the-city-from-a-laptop) |
| The docs rewritten short and plain; old plans archived | [docs/README.md](docs/README.md) |
| One dev port (5175), rent-a-server on a laptop, rooms with the same name in two houses kept apart, leftovers removed | [build notes, 16 Oct, evening](docs/build-notes.md#16-oct-2026-evening-sharing-from-a-laptop-a-no-thats-told-and-a-cleanup-for-a-stable-version) |
