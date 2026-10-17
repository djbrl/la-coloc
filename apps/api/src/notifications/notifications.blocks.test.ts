// Blocking reaches invitations and knocks, as it does messages (found by the 16 Oct review).
import "reflect-metadata";
import { blocks, type Db, notifications, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { NotificationsService } from "./notifications.service";

let db: Db;
let doorbell: DoorbellService;
let service: NotificationsService;
const ids: Record<string, string> = {};

async function newcomer(login: string, githubId: number) {
  const [u] = await db.insert(users).values({ login, name: login, githubId }).returning();
  ids[login] = u.id;
}

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  const houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  service = new NotificationsService(db, houses, doorbell, { devLogin: false });
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 301);
  await newcomer("sam", 302);
});

describe("invitations between people who blocked each other", () => {
  it("someone Fatou blocked can't invite her, to rent or to a house", async () => {
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.sam });
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.jib });
    await expect(service.rentTogether(ids.sam, "fatou")).rejects.toThrow("They aren't taking invitations from you.");
    await expect(service.inviteToHouse(ids.jib, "fatou", "sacre-coeur")).rejects.toThrow("They aren't taking invitations from you.");
    expect((await service.list(ids.fatou)).items).toEqual([]);
  });

  it("Fatou can't invite someone she blocked either", async () => {
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.sam });
    await expect(service.rentTogether(ids.fatou, "sam")).rejects.toThrow("You blocked them.");
  });
});

describe("a knock from someone a flatmate blocked", () => {
  it("doesn't reach the flatmate who blocked them; the others still hear it", async () => {
    await db.insert(blocks).values({ blockerId: ids.awa, blockedId: ids.fatou });
    await doorbell.knock("sacre-coeur", "room-4", ids.fatou, { message: "remember me?" });
    const knocks = await db.select().from(notifications).where(and(eq(notifications.kind, "knock"), eq(notifications.fromId, ids.fatou)));
    const heard = knocks.map((k) => k.userId);
    expect(heard).not.toContain(ids.awa);
    expect(heard).toContain(ids.jib);
  });
});
