import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { houses, rooms, users } from "./schema";
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
});
