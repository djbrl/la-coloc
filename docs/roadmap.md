# La Coloc: technical roadmap

*02 10 2026, replanned the same day around the city ([how-it-works.md](how-it-works.md)). Target: **submit Sun 25 10 2026**.
Stack: [architecture.md](architecture.md). Every week ends with a demo that works end to end. If a week slips, cut from
the bottom of the next one, not the milestone.*

**What scores** (annexe 1): relevance to "an African exchange platform built for devs by devs" 25 · technical quality 30 ·
UX 20 · innovation 15 · public vote 10. **What gates:** top 3 of the peer vote per country, and every member votes.

## Progress (08 10 2026)
- **Done:** Phase 0's technical part; week 1's backend and web (database, GitHub login code, multi-house API, city
  endpoint, city + house pages with placeholder art); and ahead of plan from week 2: the doorbell (knock, thread, vote,
  move in), the house channel, GitHub webhooks with reviewer rotation and chores, and the exchange ledger.
  Details: [build-notes.md](build-notes.md), night 2.
- **09 10, Jib's call:** the walkable lobby starts now instead of Q3 2027. First version in three.js with placeholder
  shapes: houses, your avatar (keys or click), flatmates around their houses, walk up to a door to go in. The list
  view stays as the text version.
- **Waiting on the team:** commits, the GitHub App registration, teammates, `coloc.dev`, the art.
- **09 10: deploy on merge works against real GitHub** (strict and relaxed houses, results commented on the PR).
- **09 10 (night 3):** the room page (settings, encrypted secrets, logs, restart, redeploy), PR previews, live presence
  in the lobby (characters, emotes, lamps), the full-screen lobby with a welcome, loading screen and settings, and
  an Apple-style rework of the other pages.
- **Still to build:** GitHub's Deployments panel (needs one more App permission), rent a flat (onboarding for a new
  chef → install command), `install.sh` on a real VPS, bills, tontine turns.

## Phase 0: team & setup (Fri 02 10 → Sun 04 10)
- ~~Rooms with walls, zero-downtime deploys, isolation demo, live house page~~: done on 02 10 (see [build-notes.md](build-notes.md)).
- Confirm routing through the real Traefik now that Docker Hub pulls work; delete the `test/cached-node18` branch.
- Recruit 1–2 teammates (teams are 2–5), everyone signs the team agreement.
- Pick a domain (check `coloc.dev` is free; .dev forces HTTPS, which suits us).
- CI: GitHub Actions running tests + `licences:check`. ESLint/Prettier.

## Week 1: "log in and see the city" (Mon 05 10 → Sun 11 10)
| Owner | Work |
|---|---|
| Infra | `file://` repos dev-only. Docker socket behind a read-only socket proxy. `wss://` for the agent. Record the isolation demo through Traefik |
| Backend | Postgres + Drizzle behind `HousesService` (same method names). Multi-house API. GitHub login (OAuth). `users` built from GitHub (repos, languages). City endpoint: every house, rooms, free rooms, ads |
| Jib | **City map art v1** (houses on a map, rooms full / free / looking) and **house floor plan v1** (room states: empty / live / down / busy). Login screen. House profile page |

**Milestone Sun 11 10:** log in with GitHub, land on the city (seeded houses), open Sacré-Cœur's profile, deploy into
your room, watch it go live. The isolation demo is recorded.

## Week 2: "knock, move in, get reviewed" (Mon 12 10 → Sun 18 10)
| Owner | Work |
|---|---|
| Infra | Rent a cheap test VPS (on Datacloud if possible: tests their Docker support early). `install.sh` (Docker + userns-remap + Traefik + agent as systemd service). Wildcard DNS per house. Usage sampling every 30s |
| Backend | GitHub App: webhooks (signature check), installation tokens to clone private repos, reviewer rotation (`packages/domain`), PR comment + review request, Deployments API, previews + cleanup. **Doorbell:** knock → application thread → house vote → move in. **House channel.** Messages over the existing live stream (SSE down, POST up) |
| Jib | Knock flow, application thread + house channel UI, room page (logs, restart, secrets), onboarding (rent a flat → install command → move in). **Presence:** online flatmates as small avatars in their rooms on the map |

**Milestone Sun 18 10:** a stranger finds a house on the map, knocks, chats, gets voted in, moves in with their repo.
Opens a PR → reviewer assigned → preview → approve → merge → live. 3 real people, 3 real repos, one real server.

## Week 3: the exchange layer + submission (Mon 19 10 → Sun 25 10)
| Day | Work |
|---|---|
| Mon 19 – Tue 20 | **Exchange ledger** (reviews given / received on profiles and houses), emotes (👊 review approved, ☝️❓ knock), tontine turn, team rooms, bill split + payment links, fridge notes in the house channel. **Tue 20: impact vote (team agreement §3)** |
| Wed 21 | Hardening: room A can't reach room B (re-run), webhook + message rate limits, secrets encryption, report / mute in channels |
| **Thu 22** | **Register the team (split key from the vote), get the 40% code, buy the Datacloud server(s).** Deploy coloc.dev + the demo houses on Datacloud |
| Fri 23 | **Seed the city:** ~12 believable houses (real ones first, ours included) so the map looks alive. Landing page that explains it in 30 seconds. OG tags for shared house links |
| Sat 24 | **Code freeze at night.** Demo video (2–3 min, opens on the city), README, final `licences.md` + `ai-usage.md`, each member rehearses explaining their part |
| **Sun 25** | Submit. Don't touch prod after |

## After submission
- **Keep everything up until 10 11** (peer vote 01–02 11, public + jury 04–10 11). Uptime monitor with alerts to the team's phones.
- **01–02 11: every member votes.** One missing vote eliminates the team.
- Prepare for the jury: each person can explain their part, AI-written parts included.

## Cut list (in order, if late)
1. Browser terminal
2. Team rooms (keep "looking to team up" on ads)
3. Tontine perks (keep the turn order + fridge note only)
4. gVisor, hard disk quotas
5. Payment links (show amounts only)
6. PR previews (reviewers read the diff only)

**Never cut:** the city map, knocking + the doorbell thread, the house channel, reviews on PRs, the isolation demo.
They're the exchange platform and the proof it's solid.

## Later (Q3 2027): the walkable lobby
Avatars walking through the city and into living rooms, fighting-game-lobby style. Same data as the map, new
renderer (three.js or PixiJS + Colyseus, all MIT). Mostly art and moderation work. If La Coloc wins, its code belongs
to Systalink (Art. 8), so this would be a fresh build.

## Known risks
| Risk | Mitigation |
|---|---|
| An empty city on demo day | Seed real houses first (ours, friends'), then believable demo houses; every one runs real apps |
| Messaging grows into a Discord clone | Two surfaces only: house channel + doorbell thread. No DMs, no servers, no voice |
| Abuse in public channels and threads | Report, mute, evict, ban; message rate limits; houses choose who they admit |
| Let's Encrypt rate limits (50 certs/domain/week): previews create many subdomains | Wildcard cert per house via DNS-01 challenge |
| Datacloud VPS limits Docker (unknown) | Test in week 2 on a cheap Datacloud server, even at full price |
| Builds are slow on a small server and steal CPU from rooms | Builds are CPU- and memory-capped; cache images |
| Wave has no simple public payment API for individuals | MVP: amounts + "pay via Wave" + mark as paid manually |
| A teammate drops | Weekly milestones = always something to submit; the agreement handles shares |
| Registering late (22 10) and the platform being down | Account + team details ready from week 1; register as soon as the vote is done |
