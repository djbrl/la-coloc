# Accessibility hunt

**Kind:** bug bounty · **Prize:** 20 000 FCFA · **Title:** Lookout (Vigie)

## The task

Find something in the pages the example apps serve ([`examples/`](../../examples)) that shuts people out, and fix
it: a button you can't reach with the keyboard, text too pale to read, an image with no text for screen readers, a
language the page doesn't declare.

## A good pull request

- One problem per pull request.
- Says who it kept out, and how you checked the fix (keyboard only, a screen reader, a contrast checker).
- Screenshots or a short recording help the review.
- Keeps the look of the page you fix.

## Points

When a judge merges it, they label it by how many people it kept out (no label, no points):

| Label | Points |
| --- | --- |
| `arena:low` | 10 |
| `arena:medium` | 25 |
| `arena:high` | 50 |
| `arena:critical` | 100 |

Open: 0 (waiting). Closed without a merge: 0.
