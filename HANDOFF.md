# Handoff

*Written Fri 16 Oct 2026 for whoever picks La Coloc up next (a teammate, or a coding agent such as Codex). Read this
first, then [README.md](README.md), [TODO.md](TODO.md) and [docs/README.md](docs/README.md).*

## Where things stand

`main` is a stable version: everything builds, all 555 tests pass, the licence check passes, and nothing is half
done on purpose. All earlier branches (`french-ui`, `ui-refresh`, `ui-refresh-fr`, `first-home`) are merged into it.

What works today, in one breath: a walkable 3D city by day with passers-by and a minimap; houses (shared servers) and
rooms (one project each); a first-visit quest, "Your first home", that takes a newcomer from the street to a live,
shared project; knocks to join a house, invitations and a notification bell; reviews that pay part of the rent, the
bill and the tontine; GitHub login, repo picker, deploy on merge and PR previews; English and French; a city that
keeps working when the database is down; direct messages, a chat room and a board per city, with blocking and
reports. [docs/how-it-works.md](docs/how-it-works.md) explains each idea in plain
words; [docs/architecture.md](docs/architecture.md) shows the pieces and the folders.

What is **not** real yet: payments (a mock that only marks a line paid), the Datacloud deployment, HTTPS, and rate
limiting. See "What to do next".

## How it runs right now

The whole thing runs on Jib's laptop. A public copy of the site is shared through Vercel:

| Piece | Where |
|---|---|
| Site | `https://la-coloc.vercel.app` (Vercel project `la-coloc`, team Bountbi), built from `main` |
| API, Postgres, Traefik, caretakers | the laptop (`npm run start -w @coloc/api` on :4100, Docker for the rest) |
| Link between them | a Cloudflare quick tunnel; Vercel forwards `/api` to it |
| GitHub events | the smee relay, `npm run dev:webhooks` |

`npm run share` opens the tunnel, builds the site pointed at it, deploys it, and prints how to start the API
(`COLOC_PUBLIC_URL=https://la-coloc.vercel.app`, `COLOC_WEB_ORIGIN=https://la-coloc.vercel.app,http://localhost:5175`).
Details and caveats: [docs/dev.md](docs/dev.md#sharing-the-city-from-a-laptop).

To run it locally from scratch, follow [docs/dev.md](docs/dev.md). The site's dev port is **5175**.

## What to do next (in order)

1. **Payments in Stripe test mode** (agreed with the team). Plan:
   - a small provider layer in the API so the bill doesn't care who takes the money (the current mock, Stripe, and
     later a mobile-money sandbox such as FedaPay or Kkiapay);
   - each flatmate's share of the bill becomes a payment they can make: "Pay" opens Stripe Checkout, Stripe's signed
     webhook marks the line paid, the bill updates live for the house, and the others get a "your turn" notice;
   - honest labelling as test mode in the UI;
   - today's mock lives in `POST /api/houses/:id/bill/paid`, `markBillPaid` in
     `apps/api/src/houses/houses.service.ts`, table `bill_payments`, operators in `houses/money.ts`;
   - Jib creates the Stripe account and puts the test keys in `dev/.env.local` himself (never commit keys).
2. **Rate limiting** on login, knock, invite and deploy routes (`@nestjs/throttler`, MIT), with a test showing the
   429. Do it before the Vercel link is shared beyond the team. The chat already has its own brake (five messages in
   ten seconds, five board posts an hour: `apps/api/src/chat/limiter.ts`).
3. Everything else is in [TODO.md](TODO.md): the Datacloud items (Jib handles them), real people in rooms, the demo
   video, a native French read, and the contest admin with its dates (register by Thu 22 Oct, submit Sun 25 Oct).

## Rules of the house (please keep them)

- **Every word on screen in English and French.** UI words live in per-area dictionaries made with `defineWords`
  (`apps/web/src/i18n.ts`); a missing French key fails the build. French says "vous".
- **Talking: direct messages and public rooms are allowed** (the team reversed the old "no DMs" rule on 16 Oct). Every
  conversation is a channel in the `messages` table: a house's, a knock's, two people's (`dm:`), a city's (`city:`)
  and a board post's replies (`post:`). Keep the safety around them: block, report, the posting brake, plain text
  only. Invitations stay structured actions.
- **The look:** flat floating cards, no glass or blur; icons over words, with accessible names; short stats rather
  than sentences; status text only when something is wrong; no coloured left-border to mark a selection; panels fit
  without scrolling; keyboard first; the city is always seen by day. Details in
  [CONTRIBUTING.md](CONTRIBUTING.md) and the build notes.
- **Only CC0 or permissive code and art**, each logged in [docs/licences.md](docs/licences.md);
  `npm run licences:check` must pass.
- **Log AI-written work** in [docs/ai-usage.md](docs/ai-usage.md). The jury checks that each member can explain the
  code, so write build notes a person can learn from ([docs/build-notes.md](docs/build-notes.md)).
- Commits: small, plain-English messages in the style of `git log`.

## Gotchas

- **The quest's starter page** is cloned from a repo's `main`. The repo is private, so on the laptop the API runs
  with `COLOC_TUTORIAL_REPO` pointing at a local copy. On any other server the starter won't clone until the examples
  are public (TODO).
- **The tunnel's address changes** every time it reopens: run `npm run share` again and restart the API with what it
  prints. If the laptop sleeps, the shared site can't reach the API.
- **GitHub login on the shared site** needs `https://la-coloc.vercel.app/api/auth/github/callback` in the dev GitHub
  App's callback URLs (`la-coloc-dev`).
- **Live updates on the shared site are polled.** The quick tunnel holds back server-sent event streams, so a site
  built by `npm run share` asks every 4 s instead (`apps/web/src/stream.ts`). The lobby's WebSocket (people walking,
  the bell, messages) is not affected. A real server (Datacloud) doesn't need this.
- **Never turn on `COLOC_DEV_LOGIN`** while sharing: anyone could log in as anyone.
- **Projects deployed in rooms** answer only on the laptop (`*.coloc.localhost`): a visitor on the shared site can't
  open them. Fixing that needs a real domain (Datacloud).
- **Caretakers started before 16 Oct** run old code. Restart both (commands in docs/dev.md) to get the per-house
  Docker fix; running rooms keep answering and move to the new network on their next deploy.
- **The repo picker** lists your own GitHub installation, plus organisation installs you made yourself after 16 Oct.
- **Reports have no screen.** Admins (`COLOC_ADMINS`) read them at `GET /api/reports` and act by hand (an admin can
  delete any board post or reply).
- **Open product questions** for Jib: should real people's houses survive a demo reset; the project's own licence (none yet, and the contest asks winners to cede their rights).
