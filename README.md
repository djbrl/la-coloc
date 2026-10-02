# La Coloc

Devs rent a server together, like flatmates. Everyone gets a **room** (an isolated, capped slice of the server).
Push your repo and it's live in your room. The house splits the bill by usage and pays rent in **code reviews**.

Product: [`docs/how-it-works.md`](docs/how-it-works.md) · Stack: [`docs/architecture.md`](docs/architecture.md) · Plan: [`docs/roadmap.md`](docs/roadmap.md) · Contest rules: [`docs/contest-rules.md`](docs/contest-rules.md)

## What's in here

| Folder | What | Runs where |
|---|---|---|
| `apps/web` | Vue 3 + Vite: the house page (rooms, fridge door, deploys) | browser |
| `apps/api` | NestJS: HTTP API + the hub that talks to every house's agent | coloc.dev |
| `apps/agent` | Node: the caretaker on each house server. Builds repos, runs rooms, measures usage | each house server |
| `packages/protocol` | Messages between API and agent, validated with zod on both ends | shared |
| `packages/domain` | Pure house rules: reviewer rotation, bill split, tontine line | shared |
| `examples/` | `hello` (a well-behaved app) and `memory-hog` (the flatmate from hell) | rooms |
| `dev/` | Local Traefik, standing in for a house's front door | Docker |

## Status: week-1 slice (02 10 2026)

Works: deploy a repo into a room → it's built, started with its walls (RAM/CPU caps, no capabilities, own network),
health-checked, swapped in with no downtime, and served at `http://<room>.coloc.localhost:8000`. A room that runs
out of memory restarts alone and leaves a fridge note. The house page updates live.

Not yet: GitHub App/login, reviews, previews from PRs, database (state is in memory), kitchen, bills UI, tontine UI.
See the roadmap.

## Run it locally

Needs Node 22+ and Docker. Full walkthrough with the isolation demo: [`docs/dev.md`](docs/dev.md).

```bash
npm install
npm run build
npm run dev:proxy                     # Traefik on :8000
npm run start -w @coloc/api           # API on :4100
COLOC_HOUSE_ID=sacre-coeur COLOC_AGENT_SECRET=dev-secret-change-me npm run start -w @coloc/agent
npm run dev:web                       # house page on :5173
```

## Checks

```bash
npm test                # unit tests: domain rules, protocol, room walls, checkout safety, fridge notes
npm run licences:check  # fails if any dependency is copyleft (contest rule)
```
