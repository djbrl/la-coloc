# La Coloc: the docs

**New here? Read in this order, about 30 minutes:** the [front page](../README.md) → [how it works](how-it-works.md) →
[the install guide](dev.md) (get it running) → [CONTRIBUTING](../CONTRIBUTING.md) (how we work) → [TODO](../TODO.md) (what to pick up).

Dates are written "12 Oct 2026" in new text; older docs use "12 10 2026" (day, month, year).
Every doc says when it was written. If one disagrees with the code, the code is right: fix the doc in the same pull request.

## Start here

| Doc | What it is | Who needs it |
|---|---|---|
| [README.md](../README.md) | The front door: what La Coloc is, what works today, a quick start, the repo map | Everyone, first |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | How we work: orientation, branches and pull requests, code and design rules, art and licence rules, recipes for common changes | Every contributor, before the first commit |
| [TODO.md](../TODO.md) | The one list of what's left, in priority order, with sizes, "good first task" marks and decisions that wait on Jib | Everyone choosing the next thing |
| [dev.md](dev.md) | Install and run guide: prerequisites, step by step setup, environment variables, tests, GitHub App, troubleshooting | Day one, and whenever something won't start |

## Understand the product

| Doc | What it is | Who needs it |
|---|---|---|
| [how-it-works.md](how-it-works.md) | The canonical product explanation: the city, houses, rooms, chores, tontine, bill. Written for someone with zero context | Everyone; this is the jury story |
| [user-story.md](user-story.md) | One story of three flatmates over a month, plus the questions a jury will ask | Anyone preparing the pitch or the demo |
| [roadmap.md](roadmap.md) | The original three-week plan (written 02 Oct), with a pointer to today's status. The plan is history; [TODO.md](../TODO.md) is current | Anyone asking "why did we build it in this order?" |

## Understand the code

| Doc | What it is | Who needs it |
|---|---|---|
| [architecture.md](architecture.md) | The stack, the three programs, the key design choices (say these to the jury), the push-to-live flow, the data model | Every developer; read before changing the API, the caretaker or the database |
| [CONTRIBUTING.md, section 1](../CONTRIBUTING.md#1-the-10-minute-orientation) | Where things live and how a request flows web → API → caretaker → Docker | Day one |
| [CONTRIBUTING.md, "How to add things"](../CONTRIBUTING.md#how-to-add-things) | Short recipes: a migration, an API route, a lobby panel, a seed change, a protocol message | When you build something |
| [apps/web/public/lobby/README.md](../apps/web/public/lobby/README.md) | Which 3D models are in the lobby, where they came from, their licences | Anyone touching lobby art |
| [review-2026-10-10.md](review-2026-10-10.md) | A point-in-time adversarial review of the whole product, with a ranked fix list (R1 to R39). Most of it is fixed; its status table is at the end | Anyone wondering "what would a ruthless juror say?" |

## Run and test

| Doc | What it is | Who needs it |
|---|---|---|
| [dev.md](dev.md) | Install, run, reset, test, troubleshoot | Everyone |
| [CONTRIBUTING.md, testing](../CONTRIBUTING.md#testing) | What `npm test` covers, how to run one file, how to write a test | Everyone who writes logic |
| `scripts/isolation-demo.sh` | The jury's favourite: one room's memory hog is killed while its neighbour never misses a request. How to run it is in [dev.md](dev.md#the-isolation-demo-the-jurys-favourite) | The demo video, the jury |

## Project record and contest

| Doc | What it is | Who needs it |
|---|---|---|
| [contest-rules.md](contest-rules.md) | The official CADEV rules (French), copied 02 Oct. Dates, scoring grid (annexe 1), the licence rule (Art. 6), the rights cession (Art. 8) | Everyone, once; Jib for admin |
| [licences.md](licences.md) | Every dependency's licence summary and every art asset's source. **Update it when you add either** | Anyone adding a dependency or an asset |
| [ai-usage.md](ai-usage.md) | The AI declaration the contest requires. **Append a row after notable AI-assisted work** (log: append-only) | Anyone using an AI tool |
| [build-notes.md](build-notes.md) | A dated log of what was built, verified and found rough, night by night (log: append-only) | Anyone asking "when and why did this change?" |
| [archive/handoff-2026-10-10.md](archive/handoff-2026-10-10.md) | The briefing written for the previous AI agent. Superseded by [CONTRIBUTING.md](../CONTRIBUTING.md) and [TODO.md](../TODO.md); kept for history | Nobody, unless digging |

## Keeping the docs honest

- Change code that a doc describes? Change the doc in the same pull request.
- A doc that is a snapshot says "as of <date>" at the top. Don't silently rewrite a snapshot: add a new dated line.
- `build-notes.md` and `ai-usage.md` only grow. Fix a typo or a link in them, never rewrite history.
- Links between docs are relative paths, so they work on GitHub and in an editor.
