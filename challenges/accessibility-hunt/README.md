# Accessibility hunt

**Kind:** bug bounty · **Prize:** 20 000 FCFA · **Title:** Lookout (Vigie)

## The task

Find something in the website ([`apps/web`](../../apps/web)) that shuts people out, and fix it: a button you can't
reach with the keyboard, text too pale to read, an icon with no name for screen readers, a panel that traps focus.

## A good pull request

- One problem per pull request.
- Says who it kept out, and how you checked the fix (keyboard only, a screen reader, a contrast checker).
- Screenshots or a short recording help the review.
- Keeps the look: flat cards, the colour tokens in `apps/web/src/style.css`, no visible form labels (a hidden name
  for screen readers is right).

## Points

When a maintainer merges it, they label it by how many people it kept out:

| Label | Points |
| --- | --- |
| `arena:low` | 10 |
| `arena:medium` | 25 |
| `arena:high` | 50 |
| `arena:critical` | 100 |
| no label | 10 |

Open: 0 (waiting). Closed without a merge: 0.
