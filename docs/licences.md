# Licences (CADEV Art. 6)

The rules forbid copyleft components (GPL, AGPL, LGPL). Check before every commit that adds a dependency:

```bash
npm run licences:check
```

**State on 02 10 2026:** 278 packages, all permissive: MIT 227 · Apache-2.0 19 · BSD-3-Clause 14 · ISC 14 · BSD-2-Clause 2 · 0BSD 1 · Unlicense 1.

## Runtime environment (not distributed, not modified, not linked)
Linux kernel (GPL-2.0), Docker Engine (Apache-2.0), Traefik (MIT), Postgres (PostgreSQL licence), container base images
(e.g. `node:22-alpine`, which contains BusyBox under GPL-2.0). These run the solution; they are not part of its code.

## Traps avoided
- Redis (no longer permissive) → no Redis; jobs will use pg-boss on Postgres (MIT).
- MySQL (GPL) → Postgres.
- Bun `--compile` (embeds JavaScriptCore, LGPL) → plain Node.
- `psycopg2`, `sharp`/libvips (LGPL) → not used.
