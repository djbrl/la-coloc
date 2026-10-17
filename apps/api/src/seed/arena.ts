// The Arena's made-up past, so the demo city shows titles from the first visit: last week's challenge in Dakar and
// Abidjan, finished, with seeded people who took part, merged pull requests and a podium (awa wears "Œil de lynx"
// in Dakar). Planted with the month of life (the dev seed and the demo reset).
//
// Safe to plant again (the demo reset does, any week): the seeded people's own arena rows go first, then last week
// is planted again. Real people's entries, pull requests and titles are never touched, and a week a real person
// took part in is left as it was played.
import { arenaAwards, arenaChallenges, arenaEntries, arenaSubmissions, type Db } from "@coloc/db";
import { eq, inArray } from "drizzle-orm";
import { wearLatest } from "../arena/badges";
import { catalogueEntry } from "../arena/catalogue";
import { closeWeek } from "../arena/podium";
import { arenaRepo, scoreOf } from "../arena/scoring";
import { challengeId, entryFor, isoDate, WEEK_MS, weekStartOf } from "../arena/weeks";

interface SeedWeek {
  city: string;
  // Not the rotation's pick: the seed chooses, so the demo shows a bounty title in Dakar.
  slug: string;
  // Who took part, in the order they joined, and their merged pull requests (the label each got; null: the
  // challenge's first label).
  people: { login: string; merged: (string | null)[] }[];
}

// Pull request numbers far above the repo's real ones: these never existed (the people are made up).
const FIRST_NUMBER = 9001;

export const ARENA_PAST: SeedWeek[] = [
  {
    city: "Dakar",
    slug: "bug-bounty",
    people: [
      { login: "awa", merged: ["arena:critical", "arena:medium"] },
      { login: "moussa", merged: ["arena:high"] },
      { login: "aminata", merged: ["arena:medium"] },
      { login: "cheikh", merged: [null] },
      { login: "jib", merged: [] },
    ],
  },
  {
    city: "Abidjan",
    slug: "market-hackathon",
    people: [
      { login: "yao", merged: [null, null] },
      { login: "mariam", merged: [null] },
      { login: "serge", merged: [] },
    ],
  },
];

// This week, already under way, so the leaderboard isn't empty on a Monday visit: who joined and what got merged so
// far. The challenge is the rotation's own (the one the API makes), and every pull request is merged (an open one
// would make the API ask GitHub about a number that never existed).
export const ARENA_NOW: { city: string; people: { login: string; merged: (string | null)[] }[] }[] = [
  { city: "Dakar", people: [{ login: "cheikh", merged: [null, null] }, { login: "moussa", merged: [null] }, { login: "aminata", merged: [] }, { login: "jib", merged: [] }] },
  { city: "Abidjan", people: [{ login: "mariam", merged: [null] }, { login: "yao", merged: [] }] },
];

/** Plants last week's finished challenges (see the top of the file). `id`: the seeded people's ids by login. */
export async function plantArena(db: Db, id: Record<string, string>, now = new Date()) {
  const seeded = Object.values(id);
  if (seeded.length) {
    await db.delete(arenaAwards).where(inArray(arenaAwards.userId, seeded));
    await db.delete(arenaSubmissions).where(inArray(arenaSubmissions.userId, seeded));
    await db.delete(arenaEntries).where(inArray(arenaEntries.userId, seeded));
  }
  const start = new Date(weekStartOf(now).getTime() - WEEK_MS);
  const end = new Date(start.getTime() + WEEK_MS);
  const repo = arenaRepo();
  let number = FIRST_NUMBER;

  for (const week of ARENA_PAST) {
    const cid = challengeId(week.city, isoDate(start));
    const entry = catalogueEntry(week.slug);
    await db
      .insert(arenaChallenges)
      .values({ id: cid, city: week.city, weekStart: isoDate(start), startsAt: start, endsAt: end, slug: entry.slug, kind: entry.kind, repo: repo.url, path: entry.path, prizeFcfa: entry.prizeFcfa })
      .onConflictDoNothing();
    // A real person played that week (the seeded people's rows are gone by now): leave it as it was played.
    if ((await db.select().from(arenaEntries).where(eq(arenaEntries.challengeId, cid)).limit(1)).length) continue;
    const [c] = await db.select().from(arenaChallenges).where(eq(arenaChallenges.id, cid));

    for (const [i, p] of week.people.entries()) {
      if (!id[p.login]) continue;
      // Joined on Monday, an hour apart; each pull request merged a few hours after the one before.
      await db.insert(arenaEntries).values({ challengeId: cid, userId: id[p.login], joinedAt: new Date(start.getTime() + (i + 1) * 3_600_000) });
      for (const [k, label] of p.merged.entries()) {
        const n = number++;
        const mergedAt = new Date(start.getTime() + (24 + i * 6 + k * 30) * 3_600_000);
        // No label named: the challenge's first (an entry, or a low-severity fix), as the judges would label it.
        const score = scoreOf(c.slug, c.kind, { state: "merged", labels: [label ?? catalogueEntry(c.slug, c.kind).points[0].label] });
        await db.insert(arenaSubmissions).values({
          challengeId: cid,
          userId: id[p.login],
          url: `${repo.url}/pull/${n}`,
          repo: repo.fullName,
          number: n,
          title: `Fix ${k + 1} by ${p.login}`,
          state: "merged",
          points: score.points,
          label: score.label,
          scoredAt: mergedAt,
          checkedAt: mergedAt,
          createdAt: new Date(mergedAt.getTime() - 3 * 3_600_000),
        });
      }
    }
    // Opened again if need be, then closed and awarded the way the API does it.
    await db.update(arenaChallenges).set({ closedAt: null }).where(eq(arenaChallenges.id, cid));
    await closeWeek(db, cid, end);
  }
  await wearLatest(db, seeded);
  await plantThisWeek(db, id, now, number);
}

/** This week's entrants and merges so far (ARENA_NOW), each merge between Monday and now. */
async function plantThisWeek(db: Db, id: Record<string, string>, now: Date, first: number) {
  const start = weekStartOf(now);
  const end = new Date(start.getTime() + WEEK_MS);
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const repo = arenaRepo();
  let number = first;
  for (const week of ARENA_NOW) {
    const cid = challengeId(week.city, isoDate(start));
    const entry = entryFor(week.city, start);
    await db
      .insert(arenaChallenges)
      .values({ id: cid, city: week.city, weekStart: isoDate(start), startsAt: start, endsAt: end, slug: entry.slug, kind: entry.kind, repo: repo.url, path: entry.path, prizeFcfa: entry.prizeFcfa })
      .onConflictDoNothing();
    const [c] = await db.select().from(arenaChallenges).where(eq(arenaChallenges.id, cid));
    if (c.closedAt) continue;
    for (const [i, p] of week.people.entries()) {
      if (!id[p.login]) continue;
      const joinedAt = new Date(start.getTime() + Math.min(elapsed, (i + 1) * 3_600_000) * 0.5);
      await db.insert(arenaEntries).values({ challengeId: cid, userId: id[p.login], joinedAt }).onConflictDoNothing();
      for (const [k, label] of p.merged.entries()) {
        const n = number++;
        // Spread over the time gone by this week, never in the future.
        const mergedAt = new Date(start.getTime() + elapsed * ((i + 1) * 0.15 + k * 0.1));
        // No label named: the challenge's first (an entry, or a low-severity fix), as the judges would label it.
        const score = scoreOf(c.slug, c.kind, { state: "merged", labels: [label ?? catalogueEntry(c.slug, c.kind).points[0].label] });
        await db
          .insert(arenaSubmissions)
          .values({
            challengeId: cid,
            userId: id[p.login],
            url: `${repo.url}/pull/${n}`,
            repo: repo.fullName,
            number: n,
            title: `Fix ${k + 1} by ${p.login}`,
            state: "merged",
            points: score.points,
            label: score.label,
            scoredAt: mergedAt,
            checkedAt: now,
            createdAt: new Date(Math.max(start.getTime(), mergedAt.getTime() - 3_600_000)),
          })
          .onConflictDoNothing();
      }
    }
  }
}
