# Licences (CADEV Art. 6)

The rules forbid copyleft components (GPL, AGPL, LGPL). Check before every commit that adds a dependency:

```bash
npm run licences:check
```

**State on 12 10 2026** (`npm run licences`, commit `ffce382`): 318 packages, all permissive: MIT 259 · Apache-2.0 23 · ISC 17 · BSD-3-Clause 15 · BSD-2-Clause 2 · 0BSD 1 · Unlicense 1.
Added since 02 10: Drizzle ORM (Apache-2.0) and drizzle-kit (MIT), node-postgres `pg` (MIT), PGlite (Apache-2.0, tests only).
Added 09 10: three.js (MIT) for the 3D lobby; smee-client (ISC, development only) to relay GitHub webhooks.
Added 15 10 (branch `ui-refresh`): two fonts, self-hosted from npm: `@fontsource/bricolage-grotesque` and `@fontsource/jetbrains-mono`
(SIL Open Font Licence 1.1). OFL is a font licence, not copyleft for the code: it allows bundling the fonts in any software, commercial
included, and only forbids selling the fonts alone or reusing their reserved names for a modified font. `OFL-1.1` is now in
`licences:check`'s allowed list for that reason.
Added 15 10 (branch `first-home`): `uqr` 0.1.3 (MIT, no dependencies; by Anthony Fu, from Project Nayuki's QR code generator, also MIT),
in the web app, to draw the QR code of a newcomer's address in the quest's "Show it off" card (`tutorial/share.ts`).
Added 31 10 (the "Panneau" brand): two more fonts, self-hosted from npm: `@fontsource/archivo-black` and `@fontsource/caveat-brush` (SIL Open
Font Licence 1.1, same reasoning as above).
Added 2 11 (SSH into a room): `ssh2` 1.17.0 (MIT) and `@types/ssh2` (MIT, development only). `ssh2` brings `asn1` (MIT), `bcrypt-pbkdf` (BSD-3-Clause), `safer-buffer` (MIT), `tweetnacl` (Unlicense), and optionally `cpu-features`, `buildcheck` and `nan` (MIT).
Added 2 11 (the city you belong to): `mmdb-lib` 3.0.4 (MIT) to read `@ip-location-db/dbip-country-mmdb`, the DB-IP Lite country database. It's data under CC-BY-4.0: [IP Geolocation by DB-IP](https://db-ip.com), attribution kept here. The API looks an address up on its own machine, only at login, and doesn't store it.

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
| Bricolage Grotesque (weights 600, 800; Latin and Latin Extended) by the Bricolage Grotesque Project Authors (Atelier Triay) | `apps/web/src/fonts.css`, from `node_modules/@fontsource/bricolage-grotesque` | https://github.com/ateliertriay/bricolage, via https://fontsource.org | SIL OFL 1.1 |
| JetBrains Mono (weight 500; Latin and Latin Extended; real code only: logs, secrets, commands) by JetBrains | `apps/web/src/fonts.css`, from `node_modules/@fontsource/jetbrains-mono` | https://github.com/JetBrains/JetBrainsMono, via https://fontsource.org | SIL OFL 1.1 |
| Archivo Black (weight 400; Latin and Latin Extended) by the Archivo Black Project Authors (Omnibus-Type): titles and buttons | `apps/web/src/fonts.css`, from `node_modules/@fontsource/archivo-black` | https://github.com/Omnibus-Type/ArchivoBlack, via https://fontsource.org | SIL OFL 1.1 |
| Caveat Brush (weight 400; Latin and Latin Extended) by Impallari Type (© 2015 Google Inc.): only the marker writing on the landing's sign | `apps/web/src/fonts.css`, from `node_modules/@fontsource/caveat-brush` | https://fontsource.org/fonts/caveat-brush | SIL OFL 1.1 |
| The landing's picture (a flat's window on a brick wall, at night), also behind the login page: 2400×1500 WebP | `apps/web/public/landing/street.webp` | Rendered by us (`scripts/render-landing.mjs`), with Kenney's CC0 characters and city, 31 10 2026 | Ours (made from CC0 assets) |
| The login page's former background, no longer shown: a screenshot of our own 3D city (Lomé, by day), 1600×1000 WebP, about 100 KB | `apps/web/public/login-city.webp` | Rendered by the lobby from the Kenney kits above and our code, 15 10 2026 | Ours (made from CC0 assets) |
| The share previews' pictures: our own renders of the city by day, cropped to 1200×630 JPEG (Dakar, Kigali, Marrakech, Tunis; `city.jpg` is Dakar's) | `apps/web/public/og/*.jpg` | Made from our own renders, 19 10 2026 | Ours (made from CC0 assets) |

All are development placeholders until Jib's art. Downloaded 09 and 10 10 2026; licence files kept next to the models.
The models are packed with meshopt and quantization by `@gltf-transform/cli` (MIT, run once with `npx`, not a dependency;
`scripts/pack-glb.mjs`) and unpacked in the browser by three.js's `MeshoptDecoder` (MIT, part of `three`). Packing
changes the files' encoding, not what they are, so their CC0 licence is unchanged.
Ground textures (grass, asphalt, paving, sidewalk) are drawn in code (`apps/web/src/lobby/textures.ts`).
If they fail to load, the lobby falls back to shapes built in code (`apps/web/src/lobby/models.ts`).

## Runtime environment (not distributed, not modified, not linked)
Linux kernel (GPL-2.0), Docker Engine (Apache-2.0), Traefik (MIT), Postgres (PostgreSQL licence), container base images
(e.g. `node:22-alpine`, which contains BusyBox under GPL-2.0). These run the solution; they are not part of its code.

## Traps avoided
- Redis (no longer permissive) → no Redis, and no job queue: webhooks are handled straight away.
- MySQL (GPL) → Postgres.
- Bun `--compile` (embeds JavaScriptCore, LGPL) → plain Node.
- `psycopg2`, `sharp`/libvips (LGPL) → not used.
