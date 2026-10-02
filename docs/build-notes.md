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
- Run the proxy for real and confirm zero-downtime swaps through Traefik.
- GitHub App + login (replaces the "Deploy main" form with webhooks).
- Postgres + Drizzle behind `HousesService`.
- Your floor-plan art on the house page.
