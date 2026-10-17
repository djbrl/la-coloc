// Knocks decided by two requests at the same moment (found by the 16 Oct review): one answer, never two.
import "reflect-metadata";
import { applications, type Db, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { DoorbellService, type KnockEvent } from "./doorbell.service";

let db: Db;
let houses: HousesService;
let doorbell: DoorbellService;
let events: KnockEvent[];
const ids: Record<string, string> = {};

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  events = [];
  doorbell.listen(async (e) => void events.push(e));
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  const [fatou] = await db.insert(users).values({ login: "fatou", name: "Fatou", githubId: 201 }).returning();
  ids.fatou = fatou.id;
});

const verdicts = () => events.filter((e) => e.type === "answered").map((e) => (e as { verdict: string }).verdict);

describe("two flatmates voting at the same moment", () => {
  it("moves the applicant in once, records the knock as admitted, and answers once", async () => {
    // Sacré-Cœur has three flatmates (jib, awa, moussa): two yes votes admit.
    const { id } = await doorbell.knock("sacre-coeur", "room-4", ids.fatou, { message: "hello" });
    await doorbell.vote(id, ids.jib, true);
    // awa and moussa click "yes" together: both see a majority.
    await Promise.all([doorbell.vote(id, ids.awa, true), doorbell.vote(id, ids.moussa, true)]);

    const [room] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    expect(room.occupantId).toBe(ids.fatou);
    expect(app.status).toBe("admitted");
    expect(verdicts()).toEqual(["admitted"]);
  });

  it("two no votes together decline once", async () => {
    const { id } = await doorbell.knock("sacre-coeur", "room-4", ids.fatou, { message: "hello" });
    await doorbell.vote(id, ids.jib, false);
    await Promise.all([doorbell.vote(id, ids.awa, false), doorbell.vote(id, ids.moussa, false)]);
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    expect(app.status).toBe("declined");
    expect(verdicts()).toEqual(["declined"]);
  });
});

describe("a withdraw racing the deciding vote", () => {
  it("leaves one outcome: either admitted or withdrawn, and a refused withdraw if the vote won", async () => {
    const { id } = await doorbell.knock("sacre-coeur", "room-4", ids.fatou, { message: "hello" });
    await doorbell.vote(id, ids.jib, true);
    const [vote, withdraw] = await Promise.allSettled([doorbell.vote(id, ids.awa, true), doorbell.withdraw(id, ids.fatou)]);
    expect(vote.status).toBe("fulfilled");
    const [app] = await db.select().from(applications).where(eq(applications.id, id));
    const [room] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    if (app.status === "admitted") {
      expect(withdraw.status).toBe("rejected");
      expect(room.occupantId).toBe(ids.fatou);
    } else {
      expect(app.status).toBe("withdrawn");
      expect(room.occupantId).toBeNull();
      expect(verdicts()).toEqual([]);
    }
  });
});

// The review also found that someone who already lives in a house can knock on another and be voted in, and that
// renting never checks either. Whether "one house each" is a rule beyond invitations is a team decision, still open.
it.todo("one house each for knocks and renting: waiting on a team decision");
