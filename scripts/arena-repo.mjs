#!/usr/bin/env node
// Builds the public Arena repo (github.com/Djbrl/la-coloc-arena) from this one, into a folder ready to commit:
//
//   node scripts/arena-repo.mjs <folder>
//
// The Arena's challenges live here, next to the catalogue that names them (apps/api/src/arena/catalogue.ts); the
// arena repo is what contestants fork. It holds only what the challenges need: challenges/ and the example apps the
// bug bounty, the accessibility hunt and the test pilot work on. The product's own code stays in this private repo.
// Run it again after changing a challenge, then commit and push the folder.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
if (!out) {
  console.error("usage: node scripts/arena-repo.mjs <folder>");
  process.exit(1);
}
// The example apps the challenges point at. memory-hog stays out: it only exists to show a room's memory cap.
const EXAMPLES = ["hello", "ndaje", "prix-marche"];

mkdirSync(out, { recursive: true });
for (const keep of ["challenges", "examples", ".github"]) rmSync(join(out, keep), { recursive: true, force: true });

cpSync(join(root, "challenges"), join(out, "challenges"), { recursive: true });
rmSync(join(out, "challenges", "README.md"), { force: true });
for (const app of EXAMPLES) cpSync(join(root, "examples", app), join(out, "examples", app), { recursive: true });

// The front page: the Arena's README, with what only makes sense inside the product repo taken out.
const readme = readFileSync(join(root, "challenges", "README.md"), "utf8")
  .replace(/\(([\w-]+)\/README\.md\)/g, "(challenges/$1/README.md)")
  .replace(/\nThe list, in English and French, lives in `apps\/api\/src\/arena\/catalogue\.ts`; each entry has a folder here\.\n/, "\n")
  .replace("(no copyleft code: see\nCONTRIBUTING.md)", "(no copyleft code: no GPL, AGPL or LGPL)")
  .replace("Each folder here is one challenge.", "Each folder in `challenges/` is one challenge; `examples/` holds the small apps some of them work on.");
writeFileSync(
  join(out, "README.md"),
  `${readme.trim()}\n\n## Where to take part\n\nIn La Coloc: walk to your city's Arena, the stadium on the map, and press E at its gate.\n`,
);

mkdirSync(join(out, ".github"), { recursive: true });
writeFileSync(
  join(out, ".github", "pull_request_template.md"),
  `<!-- One challenge per pull request. The judges merge it and add the arena label that scores it. -->

**Challenge:** <!-- e.g. bug-bounty, fcfa-in-words -->
**City:** <!-- the Arena you joined this week -->

**What it does / what it fixes:**

**How to check it:**
`,
);
if (!existsSync(join(out, ".gitignore"))) writeFileSync(join(out, ".gitignore"), "node_modules/\n.DS_Store\n.env\n.env.*\n");
console.log(`Arena repo written to ${out}`);
