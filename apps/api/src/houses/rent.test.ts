// Rent (rent.ts): taken from people's credit the moment they move in, then once a month, never twice for one month,
// never in the workshop or an example house, never below zero; and every charge is news under the bell.
import "reflect-metadata";
import { createHash } from "node:crypto";
import { arenaAwards, arenaChallenges, billPayments, chores, creditEntries, type Db, houses as housesTable, memberships, notifications, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import type { AuthService } from "../auth/auth.service";
import { CreditController } from "../credit/credit.controller";
import { Paydunya } from "../credit/paydunya";
import { DoorbellService } from "../doorbell/doorbell.service";
import { NotificationsService } from "../notifications/notifications.service";
import { seedCity } from "../seed/city";
import { HousesService } from "./houses.service";
import { LeasesService } from "./leases.service";
import { monthOf, REVIEW_CREDIT_FCFA, WELCOME_CREDIT_FCFA, WORKSHOP_ID } from "./money";

let db: Db;
let houses: HousesService;
let doorbell: DoorbellService;
let notices: NotificationsService;
let leases: LeasesService;
const ids: Record<string, string> = {};

// Sacré-Cœur, 12 000 FCFA a month: jib (chef, 256 MB), awa (256 MB) and moussa (128 MB), room-4 free.
const HOUSE = "sacre-coeur";
const MONTH = monthOf(new Date());
// The second day of a month to come: the run's `now`.
const later = (months: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 2));
};

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  notices = new NotificationsService(db, houses, doorbell, { devLogin: false });
  leases = new LeasesService(db, houses, { isOnline: () => false } as unknown as AgentRegistry);
  // Someone new in town, with a real GitHub account, and no house.
  await db.insert(users).values({ login: "fatou", name: "Fatou", githubId: 101 });
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
});

const run = (now?: Date) => houses.rentCollector.chargeAll(now);
const balance = (login: string) => houses.credit.balance(ids[login]);
const paid = (login: string, month = MONTH) =>
  db.select().from(billPayments).where(and(eq(billPayments.userId, ids[login]), eq(billPayments.month, month)));
const rentEntries = (login: string) => db.select().from(creditEntries).where(and(eq(creditEntries.userId, ids[login]), eq(creditEntries.reason, "rent")));
// The rent news under someone's bell, newest first, as the web gets it.
const rentNews = async (login: string) => (await notices.list(ids[login])).items.filter((n) => n.kind === "rent_paid" || n.kind === "rent_due");
const myLine = async (login: string) => (await houses.view(HOUSE, ids[login]))!.bill!.lines.find((l) => l.login === login)!;
const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

describe("moving in", () => {
  it("takes the newcomer's share of this month at once, when the house says yes to their knock", async () => {
    const { id } = await doorbell.knock(HOUSE, "room-4", ids.fatou, { message: "Mobile dev from Lomé." });
    for (const who of ["jib", "awa"]) await doorbell.vote(id, ids[who], true);

    const line = await myLine("fatou");
    expect(line.due).toBeGreaterThan(0);
    // The bill tab shows it paid, with what was taken.
    expect(line).toMatchObject({ paid: true, paidAmount: line.due });
    expect(await balance("fatou")).toBe(WELCOME_CREDIT_FCFA - line.due);
    // The credit history shows the charge, keyed like the bill tab's own payment, so it can't be taken twice.
    expect(await rentEntries("fatou")).toMatchObject([{ amount: -line.due, key: `bill:${HOUSE}:${MONTH}:${ids.fatou}` }]);
    expect((await houses.credit.view(ids.fatou)).entries).toEqual([{ amount: -line.due, reason: "rent", at: expect.any(String) }]);
    // The run later finds nothing more to take.
    await run();
    expect(await balance("fatou")).toBe(WELCOME_CREDIT_FCFA - line.due);
  });

  it("does the same when they say yes to an invitation", async () => {
    await db.update(users).set({ githubId: 103 }).where(eq(users.id, ids.jib));
    const { id } = await notices.inviteToHouse(ids.jib, "fatou", HOUSE, "room-4");
    await notices.accept(ids.fatou, id);
    const line = await myLine("fatou");
    expect(await paid("fatou")).toMatchObject([{ houseId: HOUSE, amount: line.due }]);
    expect(await balance("fatou")).toBe(WELCOME_CREDIT_FCFA - line.due);
  });

  it("takes nothing more for another room in a month already paid, and takes an unpaid month with it", async () => {
    await db.insert(rooms).values([
      { houseId: HOUSE, name: "room-5", memoryMb: 256, cpus: 0.5, status: "empty" },
      { houseId: HOUSE, name: "room-6", memoryMb: 256, cpus: 0.5, status: "empty" },
    ]);
    await db.update(users).set({ credit: 0 }).where(eq(users.id, ids.awa));
    await run();
    const jibPaid = WELCOME_CREDIT_FCFA - (await balance("jib"));
    expect(jibPaid).toBeGreaterThan(0);

    // Jib paid this month: his bigger line starts next month.
    await leases.take(HOUSE, "room-5", { id: ids.jib, login: "jib", name: null });
    expect(await balance("jib")).toBe(WELCOME_CREDIT_FCFA - jibPaid);

    // Awa couldn't pay; she has the credit now, and taking a room takes this month's line, rooms and all.
    await db.update(users).set({ credit: WELCOME_CREDIT_FCFA }).where(eq(users.id, ids.awa));
    await leases.take(HOUSE, "room-6", { id: ids.awa, login: "awa", name: null });
    const [row] = await paid("awa");
    expect(row.amount).toBe((await myLine("awa")).due);
    expect(await balance("awa")).toBe(WELCOME_CREDIT_FCFA - row.amount);
  });

  it("charges nothing in a house with no bill yet, and charges whoever lives there once it has one", async () => {
    const { id } = await houses.rent(ids.fatou, { city: "Dakar", plot: "9.9.0.1", name: "Chez Fatou", tagline: null });
    await run();
    expect(await paid("fatou")).toEqual([]);
    await houses.rentServer(id, "small", false);
    await houses.rentCollector.chargeHouse(id);
    expect(await paid("fatou")).toMatchObject([{ houseId: id }]);
  });
});

describe("the monthly run", () => {
  it("charges every flatmate once a month, however often it runs", async () => {
    await run();
    const rows = await db.select().from(billPayments).where(eq(billPayments.month, MONTH));
    expect(rows.map((r) => r.userId).sort()).toEqual([ids.jib, ids.awa, ids.moussa].sort());
    expect(rows.every((r) => r.houseId === HOUSE)).toBe(true);
    // No reviews or prizes yet: the lines are the shares, and add up to the house's cost.
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(12_000);
    for (const r of rows) expect(await houses.credit.balance(r.userId)).toBe(WELCOME_CREDIT_FCFA - r.amount);

    // Again, and twice at once (an hourly run and a move-in, say): nothing more.
    await run();
    await Promise.all([run(), run()]);
    for (const login of ["jib", "awa", "moussa"]) {
      expect(await paid(login)).toHaveLength(1);
      expect(await rentEntries(login)).toHaveLength(1);
      expect(await rentNews(login)).toHaveLength(1);
    }

    // A new month: each pays once more.
    await run(later(1));
    await run(later(1));
    for (const login of ["jib", "awa", "moussa"]) {
      expect(await paid(login, monthOf(later(1)))).toHaveLength(1);
      expect(await rentEntries(login)).toHaveLength(2);
    }
  });

  it("is what the hourly settle runs, after the leases", async () => {
    await (leases as unknown as { settleQuietly: () => Promise<void> }).settleQuietly();
    expect(await db.select().from(billPayments)).toHaveLength(3);
  });

  it("never charges in the workshop or an example house", async () => {
    await db.insert(rooms).values({ houseId: WORKSHOP_ID, name: "fatou-home", occupantId: ids.fatou, memoryMb: 256, cpus: 0.5, status: "empty" });
    await db.insert(memberships).values({ houseId: WORKSHOP_ID, userId: ids.fatou, role: "flatmate", tontinePosition: 9 });
    // Even with a cost on it, the workshop stays free.
    await db.update(housesTable).set({ monthlyCostFcfa: 10_000 }).where(eq(housesTable.id, WORKSHOP_ID));
    await run();
    await run(later(1));
    expect(await houses.rentCollector.charge(WORKSHOP_ID, ids.fatou)).toBe("none");
    // Only Sacré-Cœur paid: the example houses (Almadies and the rest, with flatmates and a cost) never do.
    const rows = await db.select().from(billPayments);
    expect(new Set(rows.map((r) => r.houseId))).toEqual(new Set([HOUSE]));
    expect(await balance("fatou")).toBe(WELCOME_CREDIT_FCFA);
    expect(await rentNews("fatou")).toEqual([]);
  });

  it("charges someone who ended their lease for the month they left, and not after", async () => {
    await leases.leave(HOUSE, "moussa", { id: ids.moussa, login: "moussa", name: null });
    await run();
    expect(await paid("moussa")).toHaveLength(1);
    await run(later(1));
    expect(await paid("moussa", monthOf(later(1)))).toEqual([]);
  });
});

describe("too little credit", () => {
  it("leaves the month unpaid, never goes below zero, and says so once", async () => {
    await db.update(users).set({ credit: 100 }).where(eq(users.id, ids.awa));
    await run();
    await run();
    expect(await balance("awa")).toBe(100);
    expect(await paid("awa")).toEqual([]);
    const due = (await houses.billLine(HOUSE, ids.awa))!.due;
    expect(await rentNews("awa")).toMatchObject([{ kind: "rent_due", amount: due, month: MONTH, house: { id: HOUSE } }]);
    expect((await myLine("awa")).paid).toBe(false);
    // The bill tab's button says why, and takes nothing.
    await expect(houses.rentCollector.pay(HOUSE, ids.awa)).rejects.toThrow(/short/);
    expect(await balance("awa")).toBe(100);
  });

  it("is settled by the next run once they have the credit", async () => {
    await db.update(users).set({ credit: 100 }).where(eq(users.id, ids.awa));
    await run();
    await db.update(users).set({ credit: WELCOME_CREDIT_FCFA }).where(eq(users.id, ids.awa));
    await run();
    const [row] = await paid("awa");
    expect(await balance("awa")).toBe(WELCOME_CREDIT_FCFA - row.amount);
    expect((await rentNews("awa")).map((n) => n.kind)).toEqual(["rent_paid", "rent_due"]);
  });

  it("is settled at once by a top-up", async () => {
    await db.update(users).set({ credit: 100 }).where(eq(users.id, ids.awa));
    await run();
    const due = (await houses.billLine(HOUSE, ids.awa))!.due;
    // PayDunya, played by one paid invoice of 5 000 FCFA for Awa.
    const http = (async () =>
      Response.json({ response_code: "00", status: "completed", invoice: { total_amount: 5_000 }, custom_data: { user_id: ids.awa } })) as unknown as typeof fetch;
    const paydunya = new Paydunya({ masterKey: "master", privateKey: "p", token: "t", live: false }, http);
    const credit = new CreditController(houses.credit, {} as AuthService, paydunya, houses);
    await credit.notice({ data: { hash: sha512("master"), invoice: { token: "test_paid" } } });
    expect(await balance("awa")).toBe(100 + 5_000 - due);
    expect(await rentNews("awa")).toMatchObject([
      { kind: "rent_paid", amount: due },
      { kind: "rent_due", amount: due },
    ]);
    // Heard twice, it adds and takes nothing more.
    await credit.notice({ data: { hash: sha512("master"), invoice: { token: "test_paid" } } });
    expect(await balance("awa")).toBe(100 + 5_000 - due);
  });
});

// A review earns its reviewer credit (chores.service.ts) and a first place in the Arena earns its prize in credit
// (arena.service.ts). Neither should also come off a rent taken later in the same month: that pays it twice.
describe("rewards are paid once", () => {
  // Awa can't pay at the start of the month, then earns something, then gets enough credit for her rent.
  const shortThenEarn = async (earn: () => Promise<void>) => {
    await db.update(users).set({ credit: 100 }).where(eq(users.id, ids.awa));
    await run();
    const due = (await houses.billLine(HOUSE, ids.awa))!.due;
    await earn();
    await houses.credit.earn(ids.awa, 50_000, "topup", "topup:test");
    await run();
    return { due, charged: (await paid("awa"))[0].amount };
  };

  it("takes the whole rent after a review, since the review was already paid in credit", async () => {
    const { due, charged } = await shortThenEarn(async () => {
      const [chore] = await db
        .insert(chores)
        .values({ houseId: HOUSE, repoId: 999, repoFullName: "x/y", prNumber: 1, prTitle: "t", prUrl: "u", assigneeId: ids.awa, status: "done", dueAt: new Date(), doneAt: new Date() })
        .returning();
      await houses.credit.earn(ids.awa, REVIEW_CREDIT_FCFA, "review", `review:${chore.id}`);
    });
    expect(charged).toBe(due);
  });

  it("takes the whole rent after an Arena win, since the prize was already paid in credit", async () => {
    const { due, charged } = await shortThenEarn(async () => {
      const now = new Date();
      await db.insert(arenaChallenges).values({ id: "test-week", city: "Dakar", weekStart: now.toISOString().slice(0, 10), startsAt: now, endsAt: now, slug: "s", kind: "challenge", repo: "r", path: "p", prizeFcfa: 25_000 });
      const [award] = await db
        .insert(arenaAwards)
        .values({ challengeId: "test-week", userId: ids.awa, place: 1, key: "k", titleEn: "t", titleFr: "t", city: "Dakar", week: now.toISOString().slice(0, 10) })
        .returning();
      await houses.credit.earn(ids.awa, 25_000, "arena", `arena:${award.id}`);
    });
    expect(charged).toBe(due);
  });
});

describe("the news", () => {
  it("is one item per charge under the bell, with the amount, house and month, and rings the bell", async () => {
    const pushed: string[] = [];
    notices.pushes.subscribe((login) => pushed.push(login));
    notices.onModuleInit();
    await run();
    const [news] = await rentNews("awa");
    expect(news).toEqual({
      id: expect.any(String),
      kind: "rent_paid",
      state: null,
      from: null,
      house: { id: HOUSE, name: "Sacré-Cœur", city: "Dakar" },
      room: null,
      applicationId: null,
      verdict: null,
      amount: (await paid("awa"))[0].amount,
      month: MONTH,
      createdAt: expect.any(String),
      read: false,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(pushed.sort()).toEqual(["awa", "jib", "moussa"]);
    notices.onModuleDestroy();
  });

  it("isn't written for a line that's down to nothing", async () => {
    // Every line costs nothing this month (say, a house whose server is free).
    await db.update(housesTable).set({ monthlyCostFcfa: 0 }).where(eq(housesTable.id, HOUSE));
    await run();
    expect(await paid("awa")).toMatchObject([{ amount: 0 }]);
    expect(await db.select().from(notifications).where(eq(notifications.kind, "rent_paid"))).toEqual([]);
  });
});
