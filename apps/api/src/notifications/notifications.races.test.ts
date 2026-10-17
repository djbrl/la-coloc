// Invitations answered by two requests at the same moment (found by the 16 Oct review): one house each, one answer.
import "reflect-metadata";
import { type Db, memberships, notifications, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { NotificationsService } from "./notifications.service";

let db: Db;
let houses: HousesService;
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
  houses = new HousesService(db);
  service = new NotificationsService(db, houses, new DoorbellService(db, houses), { devLogin: false });
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 301);
  await newcomer("lea", 303);
});

describe("accepting two house invitations at once", () => {
  it("moves the person into one house, and the other invitation lapses", async () => {
    await houses.rent(ids.lea, { city: "Dakar", plot: "9.9.0.1", name: "Chez Lea", tagline: null });
    const a = await service.inviteToHouse(ids.jib, "fatou", "sacre-coeur");
    const b = await service.inviteToHouse(ids.lea, "fatou", "chez-lea");
    const results = await Promise.allSettled([service.accept(ids.fatou, a.id), service.accept(ids.fatou, b.id)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const mine = await db.select().from(memberships).where(eq(memberships.userId, ids.fatou));
    expect(mine).toHaveLength(1);
  });
});

describe("one invitation accepted twice at once (a double click)", () => {
  it("moves them in once and leaves the invitation accepted", async () => {
    const { id } = await service.inviteToHouse(ids.jib, "fatou", "sacre-coeur");
    const results = await Promise.allSettled([service.accept(ids.fatou, id), service.accept(ids.fatou, id)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
    expect(await houses.membership("sacre-coeur", ids.fatou)).toBeTruthy();
    expect(n.state).toBe("accepted");
  });

  it("a withdraw landing with the accept doesn't overwrite it", async () => {
    const { id } = await service.inviteToHouse(ids.jib, "fatou", "sacre-coeur");
    await Promise.allSettled([service.accept(ids.fatou, id), service.withdraw(ids.jib, id)]);
    const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
    const housed = !!(await houses.membership("sacre-coeur", ids.fatou));
    expect(n.state).toBe(housed ? "accepted" : "withdrawn");
  });
});
