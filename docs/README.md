# The docs

*Updated 6 Nov 2026.* **New here?** Read the [front page](../README.md), then [how it works](how-it-works.md), then
[run it](dev.md). About 20 minutes. If a doc disagrees with the code, the code is right: fix the doc in the same change.

## Read first

| Doc | One line |
|---|---|
| [README.md](../README.md) | What La Coloc is, what you can do in it, how to start |
| [how-it-works.md](how-it-works.md) | The product's ideas in plain words: houses, rooms, applying, reviews, credit and rent, the quest, chat, SSH |
| [glossary.md](glossary.md) | Every house word and tech word, one sentence each |
| [architecture.md](architecture.md) | The pieces, how a push becomes a live room, where each thing lives in the repo |
| [dev.md](dev.md) | Install, run, share, put on a server, test, troubleshoot |

## Working on it

| Doc | One line |
|---|---|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Branches, commits, words in two languages, art and licences, tests, AI use |
| [TODO.md](../TODO.md) | The one list of what's left, with "done when" for each item |
| [ssh-walkthrough.md](ssh-walkthrough.md) | SSH into a room, end to end: the hops, each file, the security choices, jury questions, a demo |
| [arena.md](arena.md) | The Arena's rules and API: weeks, challenges, points, badges, prizes |
| [apps/web/public/lobby/README.md](../apps/web/public/lobby/README.md) | Where the 3D models come from, and their licences |

## Records (the contest asks for some of these)

| Doc | One line |
|---|---|
| [contest-rules.md](contest-rules.md) | The official CADEV rules, in French: copy of 3 Nov: dates, scoring, licences (Art. 6), rights (Art. 9) |
| [licences.md](licences.md) | Every dependency's and every asset's licence. Update it when you add one |
| [ai-usage.md](ai-usage.md) | The AI declaration. Add a row after notable AI-assisted work (only grows) |
| [declaration-soumission.md](declaration-soumission.md) | The three declarations for submission, in French: ownership, components and licences, AI |
| [build-notes.md](build-notes.md) | A dated log of what was built, how it was checked and what was rough (only grows) |
| [screenshots/](screenshots/) | Screenshots from the build notes: the quest (`first-home/`), the chat (`chat/`), the style guide (`ui-refresh/`) and the five submission shots of the live city (`submission/`) |

## Archive

Old documents kept for history. They no longer match the code; don't start from them.

| Doc | One line |
|---|---|
| [archive/roadmap.md](archive/roadmap.md) | The original three-week plan of 2 Oct. Moved here on 16 Oct |
| [archive/review-2026-10-10.md](archive/review-2026-10-10.md) | A harsh review of 10 Oct (items R1 to R39), mostly fixed; also a demo-video shot list. Moved here on 16 Oct |
| [archive/user-story.md](archive/user-story.md) | The first story of three flatmates, from 2 Oct. Moved here on 16 Oct |
| [archive/handoff-2026-10-10.md](archive/handoff-2026-10-10.md) | A briefing for an earlier AI agent, replaced by CONTRIBUTING and TODO |

## Keeping the docs honest

- Change code a doc describes? Change the doc in the same pull request.
- `build-notes.md` and `ai-usage.md` only grow: fix a typo or a link, never rewrite an entry.
- Links between docs are relative, so they work on GitHub and in an editor.
