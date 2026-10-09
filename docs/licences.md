# Licences (CADEV Art. 6)

The rules forbid copyleft components (GPL, AGPL, LGPL). Check before every commit that adds a dependency:

```bash
npm run licences:check
```

**State on 08 10 2026:** 307 packages, all permissive: MIT 250 · Apache-2.0 22 · ISC 16 · BSD-3-Clause 15 · BSD-2-Clause 2 · 0BSD 1 · Unlicense 1.
Added since 02 10: Drizzle ORM (Apache-2.0) and drizzle-kit (MIT), node-postgres `pg` (MIT), PGlite (Apache-2.0, tests only).
Added 09 10: three.js (MIT) for the 3D lobby; smee-client (ISC, development only) to relay GitHub webhooks.

## Art and assets
Only assets we made ourselves, or under CC0 / a permissive licence, with the source written down here.
**Never** artwork found on ArtStation, Pinterest or similar: it belongs to its artists, and the rules require the
project to be free of third-party rights (Art. 6).

| Asset | Where | Source | Licence |
|---|---|---|---|
| City Kit (Suburban) 2.0 by Kenney: 21 houses, 2 trees, a planter | `apps/web/public/lobby/houses/` | https://kenney.nl/assets/city-kit-suburban | CC0 1.0 (public domain) |
| Mini Characters 1.0 by Kenney: 12 animated characters | `apps/web/public/lobby/people/` | https://kenney.nl/assets/mini-characters | CC0 1.0 (public domain) |
| City Kit (Commercial) 2.1 by Kenney: shops, towers, skyline buildings, parasols | `apps/web/public/lobby/city/` | https://kenney.nl/assets/city-kit-commercial | CC0 1.0 (public domain) |
| City Kit (Roads) by Kenney: traffic light, sign, construction cone, barrier, fence | `apps/web/public/lobby/street/` | https://kenney.nl/assets/city-kit-roads | CC0 1.0 (public domain) |

All are development placeholders until Jib's art. Downloaded 09 and 10 10 2026; licence files kept next to the models.
Ground textures (grass, asphalt, paving, sidewalk) are drawn in code (`apps/web/src/lobby/textures.ts`).
If they fail to load, the lobby falls back to shapes built in code (`apps/web/src/lobby/models.ts`).

## Runtime environment (not distributed, not modified, not linked)
Linux kernel (GPL-2.0), Docker Engine (Apache-2.0), Traefik (MIT), Postgres (PostgreSQL licence), container base images
(e.g. `node:22-alpine`, which contains BusyBox under GPL-2.0). These run the solution; they are not part of its code.

## Traps avoided
- Redis (no longer permissive) → no Redis; jobs will use pg-boss on Postgres (MIT).
- MySQL (GPL) → Postgres.
- Bun `--compile` (embeds JavaScriptCore, LGPL) → plain Node.
- `psycopg2`, `sharp`/libvips (LGPL) → not used.
