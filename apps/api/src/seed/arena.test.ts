// The Arena's seeded past: last week's podiums in Dakar and Abidjan, planted again by the demo reset without
// touching real people's titles.
import "reflect-metadata";
import { arenaAwards, arenaChallenges, arenaEntries, arenaSubmissions, type Db, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ArenaService } from "../arena/arena.service";
import { ChatService } from "../chat/chat.service";
import { isoDate, WEEK_MS, weekStartOf } from "../arena/weeks";
import { plantArena } from "./arena";
import { seedCity } from "./city";

let db: Db;
const lastWeek = isoDate(new Date(weekStartOf(new Date()).getTime() - WEEK_MS));

const user = async (login: string) => (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) }))!;
const seededIds = async () => Object.fromEntries((await db.select().from(users)).filter((u) => u.githubId === null).map((u) => [u.login, u.id]));

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id, life: true });
});

describe("the Arena's seeded past", () => {
  it("has finished podiums last week in Dakar and Abidjan, and awa wears Eagle eye", async () => {
    const challenges = await db.select().from(arenaChallenges);
    expect(challenges.map((c) => [c.id, c.slug, c.closedAt !== null]).sort()).toEqual([
      [`Abidjan:${lastWeek}`, "market-hackathon", true],
      [`Dakar:${lastWeek}`, "bug-bounty", true],
    ]);
    expect((await user("awa")).badge).toEqual({ key: "eagle-eye", title: { en: "Eagle eye", fr: "Œil de lynx" }, place: 1, city: "Dakar", week: lastWeek });
    expect((await user("moussa")).badge).toMatchObject({ key: "podium", place: 2 });
    expect((await user("aminata")).badge).toMatchObject({ key: "podium", place: 3 });
    expect((await user("cheikh")).badge).toBeNull();
    expect((await user("yao")).badge).toMatchObject({ key: "night-owl", place: 1, city: "Abidjan" });

    // The API, looking at Dakar this week, shows awa as last week's champion.
    const arena = new ArenaService(db, new ChatService(db, {} as never, {} as never), null);
    const view = await arena.view("Dakar", null);
    expect(view.champion).toMatchObject({ person: { login: "awa", badge: { key: "eagle-eye" } }, badge: { key: "eagle-eye" } });
  });

  it("plants again without doubling, and leaves real people's titles and weeks alone", async () => {
    // A real person won a week two weeks ago in Tunis.
    const [real] = await db.insert(users).values({ login: "fatou", githubId: 101 }).returning();
    const twoWeeks = isoDate(new Date(weekStartOf(new Date()).getTime() - 2 * WEEK_MS));
    await db.insert(arenaChallenges).values({
      id: `Tunis:${twoWeeks}`,
      city: "Tunis",
      weekStart: twoWeeks,
      startsAt: new Date(`${twoWeeks}T00:00:00Z`),
      endsAt: new Date(`${twoWeeks}T00:00:00Z`),
      slug: "test-pilot",
      kind: "challenge",
      repo: "https://github.com/Djbrl/la-coloc",
      path: "challenges/test-pilot",
      prizeFcfa: 15_000,
      closedAt: new Date(),
    });
    await db.insert(arenaEntries).values({ challengeId: `Tunis:${twoWeeks}`, userId: real.id });
    const [award] = await db
      .insert(arenaAwards)
      .values({ challengeId: `Tunis:${twoWeeks}`, userId: real.id, place: 1, key: "test-pilot", titleEn: "Test pilot", titleFr: "Pilote d'essai", city: "Tunis", week: twoWeeks })
      .returning();
    await db.update(users).set({ wornAwardId: award.id }).where(eq(users.id, real.id));

    await plantArena(db, await seededIds());
    await plantArena(db, await seededIds());
    // Dakar's podium (3), Abidjan's (2: serge scored nothing), and fatou's own.
    expect(await db.select().from(arenaAwards)).toHaveLength(3 + 2 + 1);
    expect((await user("fatou")).wornAwardId).toBe(award.id);
    expect((await user("awa")).badge).toMatchObject({ key: "eagle-eye" });
  });

  it("leaves a week a real person took part in as it was played", async () => {
    const [real] = await db.insert(users).values({ login: "fatou", githubId: 101 }).returning();
    await db.insert(arenaEntries).values({ challengeId: `Dakar:${lastWeek}`, userId: real.id });
    await plantArena(db, await seededIds());
    const dakar = await db.select().from(arenaSubmissions).where(eq(arenaSubmissions.challengeId, `Dakar:${lastWeek}`));
    expect(dakar).toEqual([]);
    expect((await user("awa")).badge).toBeNull();
    // Abidjan, which nobody real played, is planted as before.
    expect((await user("yao")).badge).toMatchObject({ key: "night-owl" });
  });
});
