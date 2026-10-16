# La Coloc: user story

> **Archived on 16 Oct 2026.** Kept for history; parts of it no longer match the code. What is true today: [how it works](../how-it-works.md), [architecture](../architecture.md), [TODO](../../TODO.md).

*02 10 2026. Written so Jib could picture the product. Full explanation: [how-it-works.md](../how-it-works.md). Prices are illustrative.*

**Before.** Jib's Discord bot runs on a free tier that falls asleep. Awa's app is on her laptop. Moussa's price
scraper runs on *his* laptop and dies at every power cut. Nobody reviews anyone's code; all three projects stall.

**Day 1: moving in.** Jib logs in with GitHub, rents a flat (4 vCPU / 8 GB, ~12 000 FCFA/month), invites Awa
and Moussa from the people he follows. Each picks one of their own repos to move in and installs the GitHub App.
House rules and chores live on coloc.dev. The free room gets a listing: "looking for a mobile dev".

**Week 1: living there.** Jib opens a PR. The bot assigns Moussa as reviewer and posts a guest preview link.
Moussa approves → it deploys to Jib's room. Moussa's scraper leaks memory at 3am → only his room restarts,
a note goes on the fridge. Moussa skips a review → another note, and a warning about his tontine turn.

**Week 2: the tontine.** It's Awa's turn: her app launches. The house reviews her PRs first, Jib designs
her landing page, her room gets extra RAM for launch week.

**Month end.** The bill splits by real usage (Moussa's scraper = 48%). Everyone pays with a Wave link.

**Why use it:** cheaper than each paying alone · always-on, unlike free tiers · reviews you can't dodge make you
better · social pressure makes projects ship · you learn real ops.

**Where it lives:** ~80% inside GitHub (PR comments and reviews). A small web "house page" for rooms,
fridge, bill, and listings.

**Questions the jury will ask:** "Why not a shared VPS + branch protection?" You could, but nobody sets up the
isolation, billing, rotation and reminders. That's the product. "Why not Vercel's free tier?" It's for
frontends; bots, scrapers and backends that need to stay up are where free tiers fail.
