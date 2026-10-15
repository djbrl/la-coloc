# TODO: what's left

*As of Mon 12 Oct 2026, from commit `ffce382` plus the core-down work and this handoff. **13 days to the submission (Sun 25 Oct); the hard deadline is Sat 31 Oct, 17:00 Dakar time.***

This is the single list. The old plan is [docs/roadmap.md](docs/roadmap.md) and the old review is [docs/review-2026-10-10.md](docs/review-2026-10-10.md); both feed this
list, but this one is current. Every open item below was checked against the code on the date above.

**How to use it:** take the top item that fits you, tell Jib, make a branch ([CONTRIBUTING.md](CONTRIBUTING.md#branches-and-pull-requests)), and tick it off in your pull request.
**Sizes:** S = up to two hours, M = about half a day, L = a day or more. **Marks:** **good first task** = self-contained, low risk, a fine start for a newcomer;
**needs Jib** = a decision, a purchase or an approval is needed before the work (or part of it) can finish.

**Quick picks for day one:** S1 (check chores with two accounts), D1 (the `/agent` proxy), D2 (pick one dev port), S6 (lint), S8 (one `npm run dev`), M8 (abuse protection). Each is marked **good first task** below.

## Must (by Sun 25 Oct)

Without these the entry isn't admissible, or loses most of its relevance score.

- **M1. Put coloc.dev itself online on Datacloud (web, API, Postgres)** · L · infra · **needs Jib** (buys the server, picks the domain).
  There is no Dockerfile, compose file or systemd unit for the site, the API doesn't serve the web build (`apps/api/src/main.ts` has no static files), and `COLOC_PUBLIC_URL`, `COLOC_DATABASE_URL`, the secrets key and `COLOC_ADMINS` must be set for real (no dev login).
  *Done when:* `https://<our domain>` opens the lobby from a phone on mobile data, login works, and a restart of the server brings everything back. *Why:* contest Art. 6 needs a deployed, reachable project that uses at least one Datacloud product. Context: [roadmap](docs/roadmap.md) week 2 and the Thu 22 Oct line, review R22.
- **M2. Run `install.sh` on a real server and put Sacré-Cœur on it** · L · infra · **needs Jib**.
  `apps/web/public/install.sh` is written and has only been checked with `sh -n` and shellcheck (its header says so). Expect small fixes. Needs wildcard DNS for `*.<house domain>`.
  *Done when:* the chef's one-line command on a fresh Ubuntu server makes the house go live, a room deploys from GitHub and answers at `https://<room>.<domain>`, and a reboot brings the caretaker back.
- **M3. HTTPS everywhere** · M · infra. The site needs TLS (cookies turn `Secure` on an `https://` public URL, and a remote caretaker **must** use `wss://`). Rooms need the `websecure` entrypoint in the caretaker's route files (`apps/agent/src/room-spec.ts`, `proxy.ts`); `install.sh` already adds the entrypoint when `COLOC_ACME_EMAIL` is set but routes only use `web`. Previews create many subdomains, so use a wildcard certificate (DNS-01) to stay under Let's Encrypt's limits.
  *Done when:* every room and the site answer on `https://` with a valid certificate, and `http://` redirects.
- **M4. Production GitHub App and direct webhooks** · M · GitHub · **needs Jib** (creating the App and clicking Authorize are the owner's).
  Development uses an App on Jib's account and smee.io. Production needs its own App with the real login callback and webhook URL, and the `deployments: write` permission if [S4](#should-do-if-the-must-list-allows) goes ahead.
  *Done when:* logging in with GitHub on the real site works for a second person, and a PR opened in a linked repo gets its reviewer comment within seconds.
- **M5. French** · L · web · **needs Jib** (scope, and a native speaker to check wording). The whole UI is English; the organiser is Systalink Sénégal, the rules are French, 20 of the 25 eligible countries are francophone (review R11). It's the biggest relevance and public-vote lever left.
  *Done when:* a language switch in settings (default from `navigator.language`) turns the welcome, the tutorial, the lobby's top line, the house panel, the bill and the settings French; `lang` on `<html>` follows it. Start from `components/lobby/panel/words.ts`, which already holds the panel vocabulary. **Decision:** whole UI, or only the first-visit path (welcome, tutorial, house, bill)?
  **Status (15 Oct, branch `french-ui`, not merged):** done for every web screen, the first-visit path and the rest (room, knock, rent, list, login, cards, keys, map, outage card); how it works is in [build-notes](docs/build-notes.md#15-10-2026-night-french-m5). **Left:** (1) a native speaker reads the French, starting with the build notes' list of words to check (the tone is "vous"); (2) Jib reviews and merges the branch; (3) sentences the API writes are still English: error messages, fridge notes, knock-thread system lines, deploy details, GitHub comments, the seeded city's texts. Doing them cleanly means the API sends a kind and parameters instead of text (an API change, M size); (4) `index.html`'s title and share description; (5) on an AZERTY keyboard W A S D are scattered: reading `e.code` in `lobby/Lobby.ts` would make it Z Q S D there (a small engine change, test with a French keyboard).
- **M6. Real people in real rooms** · M · team · **needs Jib**. Eight of the nine houses are made up and say so (review R31); an empty-looking city reads as a mock to a juror and to the public.
  *Done when:* at least three real people, each with a real repo, live in rooms on the real server before the peer vote, ours included.
- **M7. The tutorial and seeded rooms must be able to fetch their sample** · S · API · **needs Jib**. The caretaker clones without credentials, but the repository `Djbrl/la-coloc` is **private**, and both the tutorial's default sample and the seeded rooms `awa` and `moussa` point at it (`apps/api/src/tutorial/tutorial.service.ts`, `seed/city.ts`). On a real server the first-run tutorial would fail.
  *Done when:* a fresh visitor completes the tutorial on the real server. **Decision:** make the repo (or a small examples repo) public, or have the API clone the examples with a token.
- **M8. Basic abuse protection before the server is public** · S–M · API · **good first task** (the rate-limit part). There is no HTTP rate limiting or security headers in `apps/api` (knocks, messages and login can be spammed); lobby presence and chat have their own limits. The roadmap's hardening day was never done.
  *Done when:* login, knock, message and deploy routes are rate-limited per person or address (try `@nestjs/throttler`, MIT), `helmet` headers are on, a test shows the 429, and `npm run licences:check` still passes. Report, mute and evict are a separate item ([N6](#nice-to-have)).
- **M9. The demo video** · M · Jib. Three minutes, opening on the city, in French with English subtitles. A shot list is in [review §5](docs/review-2026-10-10.md#5-anything-else-a-ruthless-juror-would-say): the hook, a knock, a PR to a live room, the isolation demo, the bill and the tontine, the Africa map.
  *Done when:* an uploaded video and its link are ready for the submission form. Record on the real server if M1 and M2 are done; keep a recording as the fallback anyway.

## Should (do if the Must list allows)

- **S1. Check chores with two real GitHub accounts** · S · API · **good first task**. A chore being *done* by a real review has never been seen live (the flow is tested with fake keys). With a teammate this is easy.
  *Done when:* on a private test repo you own, with your own dev GitHub App ([dev.md](docs/dev.md#github-optional-real-login-chores-deploy-on-merge)), a PR gets a reviewer by rotation, the review is given, the chore turns done, the ledger moves, and the result is noted in [build-notes](docs/build-notes.md).
- **S2. Real mobile-money payments through an aggregator** · L · payments · **needs Jib**. Paying a bill line is a mock today: it marks the line paid and moves no money (`POST /api/houses/:id/bill/paid`, `houses.service.ts` `markBillPaid`, table `bill_payments`, text-only operators in `houses/money.ts`). The code names PayDunya, CinetPay, FedaPay and Kkiapay as candidates; an aggregator needs an account and probably a registered business, and Wave has no simple public API for individuals.
  *Done when:* in the aggregator's sandbox a payment started from the Bill tab marks the line paid through a signed callback, and the mock is gone or clearly labelled. **Decision:** is this in scope for the contest, or do we pitch it as the next step and keep the honest mock?
- **S3. A phone-friendly first load** · M · web. A first visit is about 222 requests and 9.5 MB in dev, 5 MB of it 3D models (review R28). Low quality is the default on slow devices already; the models aren't packed.
  *Done when:* models are compressed (`gltf-transform` with meshopt, one shared palette), the 3D loads after first paint, and the first load is measured on a real cheap Android phone and written in the build notes.
- **S4. GitHub's Deployments panel** · M · GitHub · **needs Jib** (they must accept the new App permission). A merged PR deploys and gets a comment, but GitHub's own "deployed to…" panel needs `deployments: write` ([architecture](docs/architecture.md#the-main-flow-push--live), step 5).
  *Done when:* a merged PR shows a deployment with the room's address on GitHub.
- **S5. Keep it up through 10 Nov, with an alarm** · S · infra. *Done when:* an uptime monitor checks the site and a room every minute and messages both team phones, after M1 and M2.
- **S6. ESLint and Prettier** · M · quality · **good first task** (agree the config with Jib first, and do the one-time reformat in its own pull request). There's none today; jurors read the code (technical quality is 30%).
  *Done when:* `npm run lint` and a format check run in CI, and `main` passes them.
- **S7. Split `apps/web/src/lobby/Lobby.ts`** (2 103 lines; `LobbyView.vue` has 1 240) · L · 3D engine. It mixes input, camera, building, people and audio cues (review R35, R21). Not for day one.
  *Done when:* it's split along those lines (for example `camera.ts`, `input.ts`, `people.ts`, `town.ts`) with no behaviour change, and each part has a header saying what it is.
- **S8. A single `npm run dev`** · S · tooling · **good first task**. Five terminals are needed today ([dev.md](docs/dev.md#the-short-version)). A small `scripts/dev.mjs` could start the API, both caretakers and the web with the right settings and stop them all on Ctrl+C. No new dependency needed.
  *Done when:* one command, after Docker is up, gives a working city; the guide shows both ways.
- **S9. "UI graphs"** · M · web · **needs Jib** (what to graph). Jib wants graphs in the UI. Data that exists: `usage_samples` (CPU and memory per room every 30 s; only the latest reading is exposed today), the exchange ledger and the bill. Candidates: a room's CPU and memory over the last day on its Overview tab; reviews traded per week on the house. Draw them in plain SVG with the site's tokens (no chart library needed; if you add one it must be permissive).
  *Done when:* Jib picked the graphs, they fit the panel without scrolling, work in day and night themes, have text alternatives, and the API exposes only what flatmates may see.
- **S10. Per-country currency** · S–M · API and web · **needs Jib**. All prices are in FCFA, including Kigali (RWF), Tunis (TND) and Marrakech (MAD), and Douala uses XAF where Dakar uses XOF (review R23). The last pass skipped it on the argument that servers are rented in FCFA.
  *Done when:* Jib decided, and either the docs say why "FCFA" is right everywhere, or amounts carry `{ amount, currency }` and format with `Intl.NumberFormat`.
- **S11. Branch protection and the review rule on GitHub** · S · admin · **needs Jib**. See [CONTRIBUTING](CONTRIBUTING.md#branches-and-pull-requests). *Done when:* Jib chose (require CI green and one approval, CI only, or nothing) and set it in the repo's settings.

## Nice to have

- **N1. Recorded sounds from Kenney (CC0) instead of synthesised ones** · M · web · **needs Jib** (approval before any download: name, source, size). The sounds are built in code (`apps/web/src/lobby/sound.ts`), which needs no declaration; recorded ones need a licence line. *Done when:* Jib approved named packs, they're logged in [docs/licences.md](docs/licences.md), loaded lazily, and `sound.test.ts` still passes. Worth it only if the synthesised sounds don't satisfy.
- **N2. Each city's look with CC0 art** (review R20, §3) · M–L · art · **needs Jib** for every download. Procedural styles are done (palettes, ground, water tanks, pirogues, baobab). Real models (cars, palms, boats) need approval and logging.
- **N3. Speech bubbles from the house chat** (R33), **avatars in wax-print patterns** (R34), **chimney smoke that follows CPU** so the isolation demo is visible from the street, **a courier walking a review to its author** · M each · 3D engine.
- **N4. Pinch-to-zoom on phones** · S–M · 3D engine · **good first task**. Not implemented (no gesture handling in `Lobby.ts`). *Done when:* two fingers zoom smoothly on a phone and a test covers the zoom limits.
- **N5. A WhatsApp share button and an `og:image` per house** · S–M · web. WhatsApp is how links travel in West Africa; today `index.html` has Open Graph text but no image. *Done when:* a shared house link shows a picture and its name.
- **N6. Report, mute and leave/evict** · M–L · API and web. [how-it-works](docs/how-it-works.md) promises them (§5 and §8); only "empty a room" exists (`POST /api/houses/:id/rooms/:room/empty`, chef only). *Done when:* a flatmate can report a message, the chef can mute or evict, a flatmate can give notice, each with a fridge note and a test.
- **N7. Team rooms ("team up")** · L · API and web. Not built; it was on the roadmap's cut list. Only build it if everything above is done.
- **N8. Tontine perks** · M · API. The tontine's turn is shown, but nothing gives the person whose turn it is priority reviews yet ([how-it-works](docs/how-it-works.md) §7).
- **N9. A walk-in hangout room inside each house; houses that match their city's skyline (Kigali's hills, roof smoke)** · L.
- **N10. A CI job that runs the isolation demo** · M · quality. The caretaker's Docker code has no automated test; the demo is run by hand. GitHub's `ubuntu-latest` has Docker. *Done when:* a separate workflow runs `scripts/isolation-demo.sh` against a local stack and fails on `FAIL`.

## Known rough edges and tech debt

- **D1. The dev install command points a caretaker at `ws://localhost:5173/agent`, but Vite proxies only `/api` and `/lobby-ws`** · S · web · **good first task**. A caretaker started from the rent-a-server command in development never connects; today you must use `ws://localhost:4100/agent` ([dev.md](docs/dev.md#rooms-previews-and-the-lobby-what-to-know)). *Done when:* `apps/web/vite.config.ts` proxies `/agent` with `ws: true`, or the command is changed in development, and the note is removed from the guide.
- **D2. Pick one dev port for the web** · S · tooling · **good first task**, **needs Jib** (which port). The web has no pinned port (Vite's default 5173); the API's `COLOC_PUBLIC_URL` and `COLOC_WEB_ORIGIN` default to 5173; `.claude/launch.json` and `scripts/github-app.mjs` say 5175. *Done when:* all of them agree (or `vite.config.ts` pins the port with `strictPort`) and the docs say the same.
- **D3. The demo reset deletes every chat message** · M · API and db. Messages aren't tied to a house in the schema (`messages.channel` is text). *Done when:* the reset only removes the demo houses' messages.
- **D4. The tontine's turn changes at midnight without an event** · S · API. An open city stream shows the new turn only after the next change. *Done when:* the stream resends at the turn boundary.
- **D5. Tutorial edges** · S–M · web and API. The GitHub step only reports "linked" for someone who lives in exactly one room (skippable); other learners' workshop rooms appear as flatmates standing outside the workshop; on touch screens the dash and keys steps are skipped; the workshop's map has no city style.
- **D6. Small polish from the review** · S · web · **needs Jib** (design). The key strip still shows words beside its keycaps (R26); the house panel keeps a "Strict" chip next to the sentence that says the same; the find and travel sheets copy a row's look in CSS instead of using `ListRow`; Settings' icons live in `SettingsPane.vue`, not `icons.ts`; the loading screen is light in day mode.
- **D7. Docs describe things we haven't built** · S · docs. [architecture.md](docs/architecture.md) still lists a per-room "kitchen" database, pg-boss jobs, Nixpacks, gVisor and `bills` and `listings` tables. They're marked "not built" there. *Done when:* each is either built, or removed from the doc as a decision.
- **D8. smee re-encodes JSON**, so a webhook can fail its signature check in development (a `401` in the relay's log). Not an issue on a server with direct webhooks (M4).
- **D9. Core-down screens: small edges** · S · web. If the page opens while the core is down and you are logged in, recovery remounts the lobby once (a brief loading screen, your position resets); a single failed request shows the card for about 2 s before "Back online" (no confirmation probe); `loadConfig` reports `demoReset: false` during an outage; the router's tab title isn't refetched on recovery; the GitHub OAuth callback redirects to `/login?error=github` when the database is down. A 20-second `GET /api/health` heartbeat runs per visible tab (`HEARTBEAT_MS` in `apps/web/src/core.ts`). Recovery against a real Postgres restart was only tested with fakes: try `docker stop coloc-db` / `docker start coloc-db` with the site open.

## Risks

- **K1. Not admissible without a Datacloud deployment.** Art. 6: at least one Datacloud product bought by submission, with the 40% code from registration (Art. 9, valid until submissions close). Registration must come first. See M1, M2 and [A1](#contest-admin).
- **K2. One committer so far, and "mastery" is 30% of the score.** Every row of the AI record says "Jib (to review)". The jury grades whether each member can explain the code, AI-written parts included. Real commits from the teammate, real reviewer names in [ai-usage.md](docs/ai-usage.md), and a rehearsal each ([A5](#contest-admin), [A9](#contest-admin)).
- **K3. Demo fragility.** Development relies on smee.io and a local caretaker. Keep a recorded video as the fallback (M9). The reset is admin-only with a ten-minute cooldown; keep `COLOC_DEMO_RESET` off on the judged server unless the admins list is right.
- **K4. A mostly empty city** (M6) and a private repo behind the tutorial (M7).
- **K5. Datacloud's Docker support is unknown** (roadmap risk). Try `install.sh` on their cheapest server early, even at full price, before relying on userns-remap and capability drops.
- **K6. Low-end phones are unmeasured** (S3).
- **K7. Rights.** If we win, the code, art and documents go to Systalink (Art. 8). Keep anything you want to keep out of the repo.
- **K8. Registering late.** The platform may be slow or down on 22 to 25 Oct. Have accounts and team details ready now.

## Contest admin

All dates are Dakar time. Rules: [docs/contest-rules.md](docs/contest-rules.md) (French).

- **A1. Register the team** · Jib · **needs Jib**, by Thu 22 Oct (the roadmap's date; earlier is safer). Every member has a Datacloud account and accepts the rules; name one representative; declare the country we represent (final) and how a prize would be split. *Done when:* we are registered and have the 40% promo code.
- **A2. Buy at least one Datacloud product with the code** · Jib · **needs Jib**, before submitting. It can be the house server (M1).
- **A3. Titularity declaration, each member** (Art. 6). Each member declares the project was made outside any assignment from an employer, client or school that could claim it; if not, written permission from that party. A false declaration disqualifies. *Done when:* each of us has read it and can sign.
- **A4. Declare every component and its licence at submission** · S. Final pass on [docs/licences.md](docs/licences.md) (code and art). *Done when:* `npm run licences:check` passes on the submitted commit and the table matches the art folders.
- **A5. The AI declaration** · S. Fill the last column of [docs/ai-usage.md](docs/ai-usage.md) with real reviewer names and dates; copy it into the form (tools used, which parts).
- **A6. Submit by Sun 25 Oct** (hard limit Sat 31 Oct, 17:00). The deployed address, the declarations, the video.
- **A7. Peer vote: Sun 1 Nov 00:00 to Mon 2 Nov 23:59.** **Every member must vote** on the projects they're given (up to 10, from our national group, never ours) or the team is excluded. Put it in both calendars now. The top three per national group go through.
- **A8. Keep production up until 10 Nov.** Public vote and jury: 4 to 10 Nov. Results on 15 Nov. The jury is published by 31 Oct.
- **A9. Jury preparation.** Each member rehearses explaining their parts, AI-written ones included. Prepare a one-line answer to each likely question: "why not a shared VPS plus branch protection?", "who pays Datacloud if a flatmate doesn't?", "what stops a crypto-miner?", "what did the AI write and can you explain it?" ([review §5](docs/review-2026-10-10.md#5-anything-else-a-ruthless-juror-would-say)).
- **A10. If we win:** every member signs the rights cession within 30 days of the results (Art. 8), or the prize can go to the next project.

## Recently done

Dates are commit dates from `git log`. The detail is in [docs/build-notes.md](docs/build-notes.md).

| Date | What | Commit |
|---|---|---|
| 12 Oct 2026 | The core can go down gracefully: the API starts and answers 503 `core_down` without Postgres and heals by itself; the site keeps you in the lobby with a floating "The city can't be reached" card, a countdown and Try now; `/api/health` | (this change) |
| 10 Oct 2026 | Review fix wave 1: welcome says what La Coloc is; city news in the top line (the confusing "0 of 12 lamps lit" is gone, and so is the lamps game); a map of Africa; fireworks, cranes and power cuts on the city; links into a house skip the tutorial; Tab order; phones; slow-device default | `60d7bf5`, `3fc0de9` |
| 10 Oct 2026 | Reviews as rent (500 FCFA each), fortnightly tontine turns, mobile-money operators per country (payment is a mock), demo reset limited to admins, seeded month of life, example apps | `1c7832b`, `8b016ce` |
| 10 Oct 2026 | Knocks show the applicant's repos and reviews; room names stay out of sentences | `39c4461` |
| 10 Oct 2026 | Panels that fit like a pause menu; the list view reads like the lobby; the house rule switches for real; a dash button on phones | `e3fb821`, `79ab9ae`, `06784ce`, `809fd70` |
| 9 Oct 2026 | The tutorial (workshop house, one step at a time) and the demo reset button; the start page with every address | `a45415b`, `3d73c7d`, `b002cbd` |
| 9 Oct 2026 | The walkable lobby, procedural neighbourhoods, presence, hover and routes; the game-screen house view; renting a server and `install.sh` (written, never run on a real server) | `276c3b1`, `737d7da`, `244d99d`, `848a709` |
| 9 Oct 2026 | GitHub App, chores and rotation, deploy on merge, PR previews, the room page with encrypted secrets; CI with the licence check | `24eaf2b`, `36d6ac4`, `22e8429`, `38c00ff` |
| 9 Oct 2026 | Database (Drizzle, migrations), GitHub login, the city, the doorbell and the house chat | `6eeb574`, `06f053b`, `522a9fb` |
| 2 Oct 2026 | The first slice: caretaker, room walls, zero-downtime swaps, isolation demo | `313394a`, `d8e3aaf` |
| 12 Oct 2026 | This repo sweep: docs index, install guide, CONTRIBUTING, TODO, editor and PR templates | (this change) |

**Status of the 39 review items** ([docs/review-2026-10-10.md](docs/review-2026-10-10.md), table at the end): 28 done, 4 partly done (R20 is N2, R26 is D6, R28 is S3, R31 is M6), and 7 open: R11 is M5, R21 is K2 and S7, R22 is M1 to M3, R23 is S10, R33 and R34 are N3, R35 is S7.
