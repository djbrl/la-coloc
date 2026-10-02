# La Coloc: technical roadmap

*02 10 2026. Target: **submit Sun 25 10 2026**. Stack: [architecture.md](architecture.md). Product: [how-it-works.md](how-it-works.md).
Every week ends with a demo that works end to end. If a week slips, cut from the bottom of the next one, not the milestone.*

## Phase 0: team & setup (Fri 02 10 → Sun 04 10)
- Recruit 1–2 teammates, everyone signs the team agreement.
- Pick a domain (check `coloc.dev` is free; .dev forces HTTPS, which suits us).
- Monorepo: pnpm workspaces, TypeScript strict, ESLint/Prettier, GitHub Actions running tests + `license-checker`.
- Start `docs/ai-usage.md` and `docs/licences.md` on day one, and keep them up to date.
- **Develop locally with Docker Desktop.** No server needed until week 2.

## Week 1: "push → live in a room" (Mon 05 10 → Sun 11 10)
| Owner | Work |
|---|---|
| Infra | Agent: create room network + container with limits (dockerode), Traefik labels, build from a public repo's Dockerfile, health check, zero-downtime swap, rollback |
| Backend | API (NestJS): WebSocket gateway, agent auth token, command/response protocol (`packages/protocol`), Postgres schema v0 (Drizzle) |
| Jib | Web (Vue 3 + Vite): login screen, house page skeleton, **floor-plan art v1** (rooms as illustrated SVG with states: empty / live / down / busy) |

**Milestone Sun 11 10:** a command builds a repo and it's live at `jib.local.coloc.dev`. A memory-bomb container
in a 2nd room gets killed **alone** while the first stays up. Record it; it's the jury demo's core.

## Week 2: GitHub + real house (Mon 12 10 → Sun 18 10)
| Owner | Work |
|---|---|
| Infra | Rent a cheap test VPS. `install.sh` (Docker + userns-remap + Traefik + kitchen + agent as systemd service). Wildcard DNS per house. Kitchen: per-room DB + role. Usage sampling every 30s |
| Backend | GitHub App: webhooks (signature check), installation tokens to clone private repos, reviewer rotation (`packages/domain`, unit-tested), PR comment + review request, Deployments API, PR previews + cleanup |
| Jib | House page live via server-sent events, room page (logs, restart, secrets), invite flow from GitHub follows, onboarding (rent a flat → install command → move in) |

**Milestone Sun 18 10:** 3 real people, 3 real repos, one real server. Open a PR → reviewer assigned → preview →
approve → merge → live. The floor plan updates live.

## Week 3: the product layer + submission (Mon 19 10 → Sun 25 10)
| Day | Work |
|---|---|
| Mon 19 – Tue 20 | Bill split + payment links, fridge-notes engine, tontine turn, eviction / pause. **Tue 20: impact vote (team agreement §3)** |
| Wed 21 | Hardening: cap-drop, read-only FS, no-new-privileges, network isolation test (room A can't reach room B), webhook rate limit, secrets encryption |
| **Thu 22** | **Register the team (split key from the vote), get the 40% code, buy the Datacloud server(s).** Deploy coloc.dev + the demo house on Datacloud |
| Fri 23 | Listings + applications (if time). Landing page that explains it in 30 seconds. Seed demo house with real apps |
| Sat 24 | **Code freeze at night.** Demo video (2–3 min), README, final `licences.md` + `ai-usage.md`, each member rehearses explaining their part |
| **Sun 25** | Submit. Don't touch prod after |

## After submission
- **Keep everything up until 10 11** (peer vote 01–02 11, public + jury 04–10 11). Uptime monitor with alerts to the team's phones.
- **01–02 11: every member votes.** One missing vote eliminates the team.
- Prepare for the jury: each person can explain their part, AI-written parts included.

## Cut list (in order, if late)
1. Listings + applications
2. Browser terminal
3. Tontine perks (keep the turn order + fridge note only)
4. gVisor, hard disk quotas
5. Payment links (show amounts only)

## Known risks
| Risk | Mitigation |
|---|---|
| Let's Encrypt rate limits (50 certs/domain/week): previews create many subdomains | Wildcard cert per house via DNS-01 challenge |
| Datacloud VPS limits Docker (unknown) | Ask/test early in week 2 on a cheap Datacloud server, even at full price |
| Builds are slow on a small server and steal CPU from rooms | Cap the build container's CPU; cache images |
| Wave has no simple public payment API for individuals | MVP: amounts + "pay via Wave" + mark as paid manually |
| A teammate drops | Weekly milestones = always something to submit; the agreement handles shares |
| Registering late (22 10) and the platform being down | Account + team details ready from week 1; register as soon as the vote is done |
