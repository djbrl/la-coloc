import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR } from "./index";
import { arenaAwards, arenaChallenges, arenaSubmissions, houses, rooms, users } from "./schema";
import { testDb } from "./testing";

describe("schema", () => {
  it("applies the migrations to an empty database", async () => {
    const db = await testDb();
    const [jib] = await db.insert(users).values({ login: "jib" }).returning();
    await db.insert(houses).values({ id: "sacre-coeur", name: "Sacré-Cœur", city: "Dakar", country: "SN", domain: "sacre-coeur.coloc.dev" });
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "jib", occupantId: jib.id, memoryMb: 256, cpus: 0.5 });
    const [house] = await db.select().from(houses).where(eq(houses.id, "sacre-coeur"));
    expect(house.status).toBe("making");
    expect(house.rules).toEqual({ strictReviews: true });
  });

  it("refuses two rooms with the same name in one house", async () => {
    const db = await testDb();
    await db.insert(houses).values({ id: "h", name: "H", city: "Lomé", country: "TG", domain: "h.coloc.dev" });
    await db.insert(rooms).values({ houseId: "h", name: "a", memoryMb: 128, cpus: 0.5 });
    await expect(db.insert(rooms).values({ houseId: "h", name: "a", memoryMb: 128, cpus: 0.5 })).rejects.toThrow();
  });

  it("forgets a worn Arena title when its award goes, and counts a pull request once per challenge", async () => {
    const db = await testDb();
    const [awa] = await db.insert(users).values({ login: "awa" }).returning();
    const week = { city: "Dakar", weekStart: "2026-10-05", startsAt: new Date("2026-10-05T00:00:00Z"), endsAt: new Date("2026-10-12T00:00:00Z") };
    await db.insert(arenaChallenges).values({ id: "Dakar:2026-10-05", ...week, slug: "bug-bounty", kind: "bounty", repo: "https://github.com/Djbrl/la-coloc", path: "challenges/bug-bounty", prizeFcfa: 25_000 });
    const pr = { challengeId: "Dakar:2026-10-05", userId: awa.id, url: "https://github.com/Djbrl/la-coloc/pull/1", repo: "djbrl/la-coloc", number: 1 };
    await db.insert(arenaSubmissions).values(pr);
    await expect(db.insert(arenaSubmissions).values(pr)).rejects.toThrow();
    const [award] = await db
      .insert(arenaAwards)
      .values({ challengeId: "Dakar:2026-10-05", userId: awa.id, place: 1, key: "eagle-eye", titleEn: "Eagle eye", titleFr: "Œil de lynx", city: "Dakar", week: "2026-10-05" })
      .returning();
    await db.update(users).set({ wornAwardId: award.id }).where(eq(users.id, awa.id));
    await db.delete(arenaChallenges);
    const [after] = await db.select().from(users).where(eq(users.id, awa.id));
    expect(after.wornAwardId).toBeNull();
  });

  // Migration 0025, run again over a city seeded before it: the live database already has the workshop.
  it("renames the workshop to La Coloc, and nothing else, as many times as it runs", async () => {
    const db = await testDb();
    const rename = readFileSync(path.join(MIGRATIONS_DIR, "0025_workshop_named_la_coloc.sql"), "utf8");
    await db.insert(houses).values([
      { id: "atelier", name: "L'Atelier", city: "Dakar", country: "SN", domain: "atelier.coloc.dev" },
      { id: "other", name: "L'Atelier", city: "Lomé", country: "TG", domain: "other.coloc.dev" },
    ]);
    await db.execute(sql.raw(rename));
    await db.execute(sql.raw(rename));
    const names = Object.fromEntries((await db.select().from(houses)).map((h) => [h.id, h.name]));
    expect(names).toEqual({ atelier: "La Coloc", other: "L'Atelier" });
  });
});
