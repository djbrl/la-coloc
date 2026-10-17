# The Arena

Every city in La Coloc has an Arena: a stadium where people meet, talk in the arena's own room, and take part in
**the week's challenge**. Each folder here is one challenge. Every week, each city gets one of them (cities rarely
get the same one in the same week), with a prize and a title for the winner.

## How a week works

1. A week runs from Monday 00:00 UTC to the next Monday. **Only merges before Monday 00:00 UTC count.**
2. In one city's Arena (one arena a week), join the week's challenge, read its folder's README, and fork this repo.
3. Clone your fork, open a pull request to this repo **after the week started**, from your own GitHub account, and
   paste its address in the Arena (or just open it: if you joined, the Arena picks it up from GitHub by itself).
4. It scores once it's **merged and labelled** by the judges (below): an open pull request is waiting (0 points), a
   closed one scores nothing, and a merged one without an `arena:` label is an ordinary contribution, not an entry.
5. When the week ends, the podium is awarded. 1st place gets the challenge's title and its prize in FCFA, taken off
   their line of their house's bill that month (La Coloc pays it, not the house); 2nd and 3rd a podium badge. With a
   tie, whoever scored their last points first wins. Nobody with 0 points is awarded.

Your title shows next to your name everywhere in La Coloc. You can pick which one to wear, or none.

## Points

| Kind | What scores |
| --- | --- |
| Bug bounty | A merged fix, by its label: `arena:low` 10, `arena:medium` 25, `arena:high` 50, `arena:critical` 100 |
| Hackathon | A merged entry labelled `arena:entry`: 30 |
| Coding challenge | A merged solution labelled `arena:entry`: 20 |

**The judges** merge pull requests and add the `arena:` labels: the logins in `COLOC_ARENA_JUDGES` (else the city's
admins, `COLOC_ADMINS`). They can't take part. A pull request counts once, in one city.

## The challenges

- [bug-bounty](bug-bounty/README.md): security bugs in the example apps
- [accessibility-hunt](accessibility-hunt/README.md): what shuts people out of the website
- [offline-hackathon](offline-hackathon/README.md): an app that works without a connection
- [market-hackathon](market-hackathon/README.md): a tool for market traders
- [fcfa-in-words](fcfa-in-words/README.md): amounts of FCFA in words
- [test-pilot](test-pilot/README.md): tests for the example apps

The list, in English and French, lives in `apps/api/src/arena/catalogue.ts`; each entry has a folder here.

## Fair play

Be kind in reviews and in the arena's room. Never test anything on a real house, a real room or a real person's
data. Anything that copies someone else's work, or breaks the repo's licence rules (no copyleft code: see
CONTRIBUTING.md), is closed without points.
