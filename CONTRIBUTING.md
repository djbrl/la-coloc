# Contributing

*Updated 16 Oct 2026. If something here is wrong, fix it in your pull request.*

**First day:** [run it](docs/dev.md), read [how it works](docs/how-it-works.md) and
[the architecture](docs/architecture.md), then pick an item from [TODO.md](TODO.md) and tell Jib.

**Four contest rules to know** ([rules](docs/contest-rules.md), in French):

- The jury checks that **each of us can explain the code**, AI-written parts included.
- **No copyleft** (GPL, AGPL, LGPL) anywhere: it makes the project inadmissible.
- **AI use is allowed but must be declared** ([docs/ai-usage.md](docs/ai-usage.md)).
- If we win, the code and art go to the organiser (Art. 8).

## Branches

- `main` always works. CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, `npm test` and
  `npm run licences:check` on every push and pull request.
- One short branch per task: `feature/…`, `fix/…` or `docs/…`, from an up-to-date `main`.
- Open a pull request into `main`, say which TODO item it closes, and get the other person's review. Jib reviews
  anything that changes the product, the design or the art. Merge with "Squash and merge".
- Stage files by name (`git add path`), never `git add .` or `git add -A`.
- Keep risky changes out of the last three days before submitting.

## Commits

One short sentence that says what is now true, starting with a capital, no full stop. Then, if useful, a paragraph
saying what changed and why.

```
Saying no to an invitation tells the sender
```

AI-assisted commits end with a trailer naming the model, for example
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.env*`, `*.pem` or keys; if you do by
mistake, tell Jib at once: the key must be replaced.

## Words: English and French

- Everything the player reads is a plain sentence, in **both English and French**, in the area's words file
  (`components/lobby/panel/words.ts`, `lobby/house/words.ts`, `components/words.ts`…), written with
  `defineWords(name, en, fr)` from `apps/web/src/i18n.ts`.
- A missing French word doesn't compile. The French says "vous".
- Reuse the vocabulary that exists (house, room, project, put online, knock, review) rather than inventing names.
- No visible form labels: a sentence or an icon, with a hidden name for screen readers.

## Design, briefly

Flat floating cards (no glass or blur); panels fit without scrolling; one main action per view; day and night both
work, using only the colour tokens in `apps/web/src/style.css`; keyboard first. Jib has the last word on the look.

## Art and licences

- **Only our own art, CC0, or permissive licences.** Never images from ArtStation, Pinterest or rips.
- **Ask Jib before downloading** any model, sound, image or font (give its name, source and size). Then log it in
  [docs/licences.md](docs/licences.md), and for 3D models in `apps/web/public/lobby/README.md`.
- After adding a dependency, run `npm run licences:check`: it must print `licences OK: no copyleft`.
- No brand logos (Wave, Orange…): names in plain text only.

## Tests and database changes

- `npm test` runs every test in under a minute, with no Docker (the database tests use PGlite). Commands for one
  package or one file are in [docs/dev.md](docs/dev.md#tests).
- Put `thing.test.ts` next to `thing.ts`. Test what you can observe, not how it's built. Business rules (money,
  votes, turns, permissions) need a test before they count as done; a bug fix needs a test that failed before.
- Vue components aren't mounted in tests, so put logic in plain `.ts` files next to them.
- For the API, copy `apps/api/src/houses/exchange.test.ts`: a real in-memory database (`testDb()`), no mocks.
- **A database change:** edit `packages/db/src/schema.ts`, then
  `npm run generate -w @coloc/db -- --name=what_changed`, read the SQL, `npm run build:packages`, and commit the
  `.sql` with the `drizzle/meta/` files. Never edit a merged migration. The API applies it on start.

## Code

TypeScript everywhere, no `any`, two spaces. Match the code around you (no linter yet). Each file starts with a few
plain lines saying what it is for. Names are whole words (`monthlyCostFcfa`, not `mcf`). Check data with zod where it
enters (HTTP bodies, caretaker messages). API errors are friendly sentences that say what to do. Never @-mention a GitHub user who hasn't linked an account:
the example people are made up.

## Using AI

1. **Read everything the AI wrote** before you merge it. If you can't explain it to the jury, simplify it.
2. **Log it:** add a row to [docs/ai-usage.md](docs/ai-usage.md) (date, tool and model, what it made, who reviewed it).
3. **Write it up** for a larger piece: a dated entry at the end of [docs/build-notes.md](docs/build-notes.md) (what,
   where, how it was checked, what's rough). Both files only grow.
4. Add the commit trailer (see [Commits](#commits)).

## Stuck?

The troubleshooting table in [docs/dev.md](docs/dev.md#troubleshooting), then `git log -p -- <file>` and the build
notes, then ask Jib with the exact error you saw.
