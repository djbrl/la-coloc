# The Arena: shared contract (17 Oct 2026, updated 6 Nov 2026)

Every city (not the tutorial's workshop map) gets a landmark, **the Arena**, a stadium on the block that used to be
the park. Players gather there, chat in the arena's own room, and take part in **the week's challenge**: a GitHub repo
folder you clone and send pull requests to (a security bug bounty, a hackathon, a coding challenge). Each week has a
new challenge per city, with a prize. **Prizes include a custom title and badge shown next to the winner's name**
everywhere a name shows (3D name tags, person cards, chat, leaderboard).

## Weeks
- A week starts Monday 00:00 UTC and ends 7 days later. `weekStart` = that Monday, ISO date `YYYY-MM-DD`.
- A city's challenge for a week is created lazily the first time anyone asks (no cron): catalogue entry
  `CATALOGUE[(weekIndex + cityIndex) % CATALOGUE.length]` where weekIndex = weeks since 2026-01-05 and cityIndex is
  the city's index in `CITIES` (apps/api/src/chat/channels.ts). So cities differ in a given week.
- When a city's new week is created, the previous week's challenge (if any) is **closed and awarded**, idempotently.

## Challenges (catalogue in apps/api/src/arena/catalogue.ts, both languages)
Each: `slug`, `kind: "bounty" | "hackathon" | "challenge"`, `title {en,fr}`, `summary {en,fr}`, `rules {en: string[], fr: string[]}`,
`path` (folder in the arena repo, e.g. `challenges/bug-bounty`), `prizeFcfa`, `points` table, and the prize
`award: { key, title: {en, fr} }` (the winner's title). French titles must be epicene (same for anyone), e.g.
bounty "Œil de lynx" / "Eagle eye", hackathon "As du hackathon" / "Hackathon ace".
Repo: env `COLOC_ARENA_REPO`, default `https://github.com/Djbrl/la-coloc-arena` (public; built from this repo's `challenges/` and
`examples/` by `node scripts/arena-repo.mjs <folder>`, then committed and pushed there). Each catalogue folder has a
README in this repo under `challenges/<slug>/README.md` explaining the task and how points work.

Points: a submission is a pull request to the arena repo by the submitter (matched by GitHub id, else login ignoring
case), opened after the week started. **Merged and labelled by the judges** → points (bounties by label: `arena:low`
10, `arena:medium` 25, `arena:high` 50, `arena:critical` 100; hackathons `arena:entry` 30; challenges `arena:entry`
20). A judge may instead write the label in a comment on the pull request ("LGTM arena:critical"): the API puts that
label on it and takes off any other `arena:` label, and the `labeled` webhook then scores it (`judgeSays`). No `arena:`
label → 0 (an ordinary contribution). Open → 0 ("waiting"), closed unmerged → 0. A merge after the
week's end scores 0. Before a week closes, the API asks GitHub once more about its open pull requests (a few seconds
at most), so a Sunday-evening merge counts without a webhook.

Rules added after the 17 Oct review (docs: challenges/README.md):
- **Judges** (`COLOC_ARENA_JUDGES`, else `COLOC_ADMINS`) merge and label; they can't join (`arenaJudge`).
- **One arena a week**: joining a second city's arena that week is refused (`arenaOtherCity`), so a pull request
  counts in one city.
- **The prize** (1st place's FCFA) goes to the winner's credit when the week closes (`closeAndAward`, keyed so it's
  paid once), and also comes off the winner's line of their house bill in the month they win it, paid by La Coloc:
  `BillLineView.prize`.
- **The repo must be public.** `ArenaView.challenge.open` says whether anyone can open the challenge's folder (asked
  without credentials, remembered 10 minutes); when false the panel says it opens soon and offers no join. Use a
  dedicated public repo (`COLOC_ARENA_REPO`) rather than the private product repo.
- Contestants fork, clone their fork and open a pull request from it: the panel's command clones `<login>/<repo>`.
- A message in the arena's room sends `what: "arenaChat"` on the city stream (only the room reloads).

## Badges (titles)
- At award time: 1st place gets the challenge's `award` title, place 1; 2nd and 3rd get a podium badge (key
  `podium`, title {en: "Podium · <challenge title>", fr: "Podium · <titre>"}), places 2 and 3. Ties: earlier last
  scoring time wins. Nobody with 0 points is awarded.
- A person's **worn badge** = their most recent award unless they picked another (`PUT /api/me/badge {awardId|null}`).
- `Badge` (JSON everywhere): `{ key: string, title: { en: string, fr: string }, place: 1 | 2 | 3, city: string, week: string }`.
- `PersonView` (apps/api/src/houses/house.types.ts, built by `person()` in doorbell/queries.ts) gains
  `badge: Badge | null`. Chat authors, person cards and leaderboards get it through that.
- The lobby WebSocket's `join` payload for a logged-in person gains `badge: Badge | null`.
- `/api/me` user gains `badge: Badge | null` and `badges: (Badge & { id: string })[]` (all their awards).
- The seed plants a finished previous week in Dakar with awards, so the demo city already shows badges (e.g. awa
  wears "Œil de lynx · Dakar").

## API
`GET /api/cities/:city/arena` (no login needed; viewer optional) → `ArenaView`:
```ts
type Text = { en: string; fr: string };
type ArenaView = {
  city: string;
  challenge: {
    id: string; slug: string; kind: "bounty" | "hackathon" | "challenge";
    title: Text; summary: Text; rules: { en: string[]; fr: string[] };
    repo: string; path: string; startsAt: string; endsAt: string; prizeFcfa: number;
    award: { key: string; title: Text };
    points: { label: string; points: number }[];
    // What each podium place wins (podium.ts prizesOf, the same rows closeWeek awards): 1st prizeFcfa and `award`,
    // 2nd and 3rd 0 FCFA and the podium badge.
    prizes: { place: 1 | 2 | 3; fcfa: number; badge: { key: string; title: Text } }[];
  };
  autoSubmit: boolean;                     // the GitHub App is configured: a joined player's PRs are added by webhook
  entrants: number;
  joined: boolean;                         // the viewer joined this week
  mine: { id: string; url: string; number: number; title: string | null; state: "open" | "merged" | "closed"; points: number }[];
  leaderboard: { person: PersonView; points: number; prs: number }[];   // top 10, points desc
  champion: { person: PersonView; badge: Badge } | null;                // last week's winner in this city
};
```
`POST /api/cities/:city/arena/join` (login) → `ArenaView`.
`DELETE /api/cities/:city/arena/join` (login) → `ArenaView`: drops out of this week's challenge. Your entry and your
pull requests in it go (you leave the leaderboard); joining again starts from nothing. Not in it: 404 `arenaNotIn`.
`POST /api/cities/:city/arena/submissions` body `{ url }` (login; joins if not yet) → `ArenaView`. The API checks the
PR via GitHub (the App client if configured, else unauthenticated public API): right repo, author == user's GitHub
login, created after the week started. Refusals carry codes (French in apps/web/src/refusals.ts):
`arenaBadUrl`, `arenaWrongRepo`, `arenaNotYourPr`, `arenaPrTooOld`, `arenaPrNotFound`, `arenaAlreadySubmitted`,
`arenaGithubDown`, `arenaGithubNeeded` (dev-login users without a GitHub login), `slowDownArena` (5 submissions/hour).
`DELETE /api/cities/:city/arena/submissions/:id` (own) → `ArenaView`.
Statuses refresh: on GitHub `pull_request` webhooks for the arena repo (opened/closed/labeled/synchronize) and lazily
on `GET` for the viewer's own open submissions not checked in the last 5 minutes.
Arena chat: channel `arena:<City>` in `messages`: `GET /api/cities/:city/arena/chat` → `{ messages: MessageView[] }`,
`POST /api/cities/:city/arena/chat` `{ body }` (same rules, blocks and limiter as the city room). The existing city
stream `GET /api/cities/:city/stream` also emits `what: "arena"` when the arena chat, entrants, leaderboard or
challenge change.
`PUT /api/me/badge` `{ id: string | null }` → `{ badge: Badge | null }` (wear one of your awards, or none).

The Arena tag on a house: `CityHouseView.arena: string[]` lists the logins of its occupants entered in a challenge
running now (not closed, between its start and end). The lobby draws a red "Arena" chip on the house's flag while it
isn't empty. Joining, dropping out and a week's close ping those people's houses, so the city stream sends them again.

News under the bell: when GitHub says (a webhook, a look at the panel, or the week's last look) that one of your
submissions went from open to merged, or from open to closed without a merge, you get a notification: `arena_merged`
or `arena_closed`, with `arena: { city, url, number, title, points, label }` (`label`: the arena:* label that gave the
points, or null). A merged one whose points change later (a judge labelled it after the merge) updates that same line,
unread again. A pull request merged before we ever heard of it, then picked up by the webhook, is news too.

## 3D (apps/web/src/lobby)
- `Neighbourhood.blocks[].kind` gains `"arena"` (replaces `"park"` in generated cities; the tutorial map keeps its
  park). `Neighbourhood.arena?: { x: number; z: number; width: number; depth: number; facing: Facing }` (the block,
  and which side its entrance faces: towards the market).
- Lobby target kind `{ kind: "arena"; city: string }`, raised like the board's (E/Enter at the entrance, or a click).
- `lobby.setArena(display: ArenaDisplay | null)` with
  `ArenaDisplay = { title: string; kind: "bounty" | "hackathon" | "challenge"; endsAt: string; champion: string | null; entrants: number }`
  (already in the chosen language; the big screen redraws at most once a minute).
- `lobby.goToArena()` walks/travels you to the entrance. Event `onArenaCrowd(n, you)` when the number of people
  (you, others online, passers-by) inside the arena changes.
- Name tags show the badge: a small chip with a trophy and the title, gold/silver/bronze by place, next to the name.
