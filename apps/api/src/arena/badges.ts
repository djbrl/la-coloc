// Arena titles as people wear them. Each award is a row in arena_awards; the one someone wears is
// users.worn_award_id, with a copy in users.badge so that every name in a list (chat, cards, leaderboards, the
// lobby) carries its title without asking the database again. Only the functions here change either column, so the
// two stay in step.
//
// Which one is worn: a new title goes on when it's won, unless they chose otherwise in Settings (an older title, or
// none) since their last win: a choice made by hand is never overridden. After that, whichever they pick
// (PUT /api/me/badge).
import { arenaAwards, type Badge, type Db, users } from "@coloc/db";
import { and, desc, eq, inArray } from "drizzle-orm";

type AwardRow = typeof arenaAwards.$inferSelect;

/** An award as a badge, the shape every view uses. */
export function badgeOf(a: AwardRow): Badge {
  return { key: a.key, title: { en: a.titleEn, fr: a.titleFr }, place: a.place as Badge["place"], city: a.city, week: a.week };
}

/** Puts on one of their awards (or none). The caller checks it's theirs. */
export async function wear(db: Db, userId: string, award: AwardRow | null): Promise<Badge | null> {
  const badge = award ? badgeOf(award) : null;
  await db.update(users).set({ wornAwardId: award?.id ?? null, badge }).where(eq(users.id, userId));
  return badge;
}

/**
 * A title just won: it goes on if they wore their latest title before (or had none at all), so a newer win shows
 * at once; if they had picked an older one, or none, by hand, their choice stays.
 */
export async function wearNew(db: Db, award: AwardRow): Promise<void> {
  const [u] = await db.select({ worn: users.wornAwardId }).from(users).where(eq(users.id, award.userId));
  const before = (await db.select().from(arenaAwards).where(eq(arenaAwards.userId, award.userId)).orderBy(desc(arenaAwards.week), desc(arenaAwards.createdAt))).filter(
    (a) => a.id !== award.id,
  );
  if (!before.length || u?.worn === before[0].id) await wear(db, award.userId, award);
}

/** Puts each of these people's most recent award on (or none, if they have none left). */
export async function wearLatest(db: Db, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const all = await db.select().from(arenaAwards).where(inArray(arenaAwards.userId, userIds)).orderBy(desc(arenaAwards.week), desc(arenaAwards.createdAt));
  for (const id of userIds) await wear(db, id, all.find((a) => a.userId === id) ?? null);
}

/** All of someone's awards, newest first, each with its id (to pick it). */
export async function badgesOf(db: Db, userId: string): Promise<(Badge & { id: string })[]> {
  const rows = await db.select().from(arenaAwards).where(eq(arenaAwards.userId, userId)).orderBy(desc(arenaAwards.week), desc(arenaAwards.createdAt));
  return rows.map((a) => ({ id: a.id, ...badgeOf(a) }));
}

/** One of someone's awards by id, or null if there's no such award or it's someone else's. */
export async function awardOf(db: Db, userId: string, awardId: string): Promise<AwardRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(awardId)) return null;
  const [a] = await db.select().from(arenaAwards).where(and(eq(arenaAwards.id, awardId), eq(arenaAwards.userId, userId)));
  return a ?? null;
}
