# Bug bounty: the example apps

**Kind:** bug bounty · **Prize:** 25 000 FCFA · **Title:** Eagle eye (Œil de lynx)

## The task

Find a security bug in one of the example apps in [`examples/`](../../examples), fix it, and send the fix as a pull
request. Think: input that isn't checked, secrets in the code, a page that shows what it shouldn't, a request
anyone can forge.

Only `examples/` counts. Never test anything on a real house, a real room or someone's live site.

## A good pull request

- One bug per pull request.
- Says what the bug was, how to see it (steps, or a test that failed before), and how the change fixes it.
- Changes as little as it needs. A test that fails without the fix is the best proof.

## Points

When a judge merges it, they add one label for how serious the bug was (no label, no points):

| Label | Points |
| --- | --- |
| `arena:low` | 10 |
| `arena:medium` | 25 |
| `arena:high` | 50 |
| `arena:critical` | 100 |

Open: 0 (waiting). Closed without a merge: 0.
