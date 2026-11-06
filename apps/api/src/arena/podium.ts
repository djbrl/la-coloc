// A challenge's standings and its podium. Plain functions on the database (no Nest), so the seed can award the
// week it plants exactly as the API awards a real one.
import { arenaAwards, arenaChallenges, arenaEntries, arenaSubmissions, type Db, users } from "@coloc/db";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { wearNew } from "./badges";
import { type CatalogueEntry, catalogueEntry, type Text } from "./catalogue";

type UserRow = typeof users.$inferSelect;
type AwardRow = typeof arenaAwards.$inferSelect;

// How many people get a title: 1st the challenge's own, 2nd and 3rd a podium badge.
export const PODIUM = 3;

/** What one place on the podium wins: credit (1st only) and a badge (the challenge's title, or a podium one). */
export interface Prize {
  place: 1 | 2 | 3;
  fcfa: number;
  badge: { key: string; title: Text };
}

/** The podium's prizes for a challenge, the ones the arena shows before the week and awards after it. */
export function prizesOf(entry: Pick<CatalogueEntry, "award" | "title">, prizeFcfa: number): Prize[] {
  const podium = { key: "podium", title: { en: `Podium · ${entry.title.en}`, fr: `Podium · ${entry.title.fr}` } };
  return [
    { place: 1, fcfa: prizeFcfa, badge: entry.award },
    { place: 2, fcfa: 0, badge: podium },
    { place: 3, fcfa: 0, badge: podium },
  ];
}

/** A challenge's standings: everyone who joined, most points first; a tie goes to whoever scored last earlier. */
export async function standings(db: Db, id: string, limit: number): Promise<{ user: UserRow; points: number; prs: number }[]> {
  const points = sql<number>`coalesce(sum(${arenaSubmissions.points}), 0)::int`;
  const prs = sql<number>`count(${arenaSubmissions.id})::int`;
  const lastScored = sql`max(${arenaSubmissions.scoredAt}) filter (where ${arenaSubmissions.points} > 0)`;
  return db
    .select({ user: users, points, prs })
    .from(arenaEntries)
    .innerJoin(users, eq(users.id, arenaEntries.userId))
    .leftJoin(arenaSubmissions, and(eq(arenaSubmissions.challengeId, arenaEntries.challengeId), eq(arenaSubmissions.userId, arenaEntries.userId)))
    .where(eq(arenaEntries.challengeId, id))
    .groupBy(users.id, arenaEntries.joinedAt)
    .orderBy(desc(points), sql`${lastScored} asc nulls last`, asc(arenaEntries.joinedAt), asc(users.id))
    .limit(limit);
}

/**
 * Closes a challenge and awards its podium, inside the caller's transaction. Nobody with 0 points is awarded. Only
 * the call that flips closed_at awards, so it awards once however many try (null: it was already closed). A title
 * just won goes on: it's the winner's most recent.
 */
export async function closeWeek(tx: Db, id: string, at: Date): Promise<{ city: string; prizeFcfa: number; awards: AwardRow[] } | null> {
  const [closed] = await tx
    .update(arenaChallenges)
    .set({ closedAt: at })
    .where(and(eq(arenaChallenges.id, id), isNull(arenaChallenges.closedAt)))
    .returning();
  if (!closed) return null;
  const prizes = prizesOf(catalogueEntry(closed.slug, closed.kind), closed.prizeFcfa);
  const podium = (await standings(tx, id, PODIUM)).filter((s) => s.points > 0);
  if (!podium.length) return { city: closed.city, prizeFcfa: closed.prizeFcfa, awards: [] };
  const awards = await tx
    .insert(arenaAwards)
    .values(
      podium.map((s, i) => ({
        challengeId: id,
        userId: s.user.id,
        place: i + 1,
        key: prizes[i].badge.key,
        titleEn: prizes[i].badge.title.en,
        titleFr: prizes[i].badge.title.fr,
        city: closed.city,
        week: closed.weekStart,
      })),
    )
    .onConflictDoNothing()
    .returning();
  for (const a of awards) await wearNew(tx, a);
  return { city: closed.city, prizeFcfa: closed.prizeFcfa, awards };
}
