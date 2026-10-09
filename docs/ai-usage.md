# AI usage declaration (CADEV Art. 6)

Kept up to date during the build, copied into the submission form at the end.

| Date | Tool | What it produced | Reviewed / understood by |
|---|---|---|---|
| 02 10 2026 | Claude Code (Claude Opus 5.5) | Initial monorepo scaffold and week-1 slice: protocol package, domain rules (reviewer rotation, bill split, tontine), agent (clone, build, room isolation spec, zero-downtime swap, usage meter, Docker events), NestJS API (agent gateway, houses, fridge notes, SSE), Vue house page, example apps, tests, docs | Jib (to review 03 10 2026) |
| 02 10 2026 | Claude Code (Claude Opus 5.5) | Product docs rewritten around the city (how-it-works, roadmap, architecture, README); agent routing moved from Docker labels to route files (zero-downtime swaps, no Docker socket for Traefik); dev-only `file://` repos, `wss://` requirement, failed-clone reporting, event-parsing guard, tests; CI workflow; build notes | Jib (to review) |

Rule for the team: every AI-written file gets read by a human who can explain it before the jury does.
