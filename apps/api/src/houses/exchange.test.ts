// The exchange as the city and the house page show it: reviews waiting and traded, knocks, the tontine's turn,
// rooms being built, and the monthly bill with reviews paid as rent.
import "reflect-metadata";
import { applications, billPayments, chores, type Db, deployments, repos, roomTeammates, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { loadAuthConfig } from "../auth/auth.config";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { seedCity } from "../seed/city";
import { HousesController } from "./houses.controller";
import { HousesService } from "./houses.service";
import { billReference, monthOf, operatorsFor, TONTINE_ANCHOR } from "./money";

const HOUR = 3600_000;
let db: Db;
let svc: HousesService;
let auth: AuthService;
let controller: HousesController;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => `${id}.coloc.dev` });
  svc = new HousesService(db);
  auth = new AuthService(db, loadAuthConfig({ COLOC_DEV_LOGIN: "1" }));
  controller = new HousesController(svc, {} as AgentRegistry, auth);
});

async function userId(login: string) {
  const [u] = await db.select().from(users).where(eq(users.login, login));
  return u.id;
}

async function loggedIn(login: string) {
  const user = await auth.devLogin(login);
  return { headers: { cookie: `${SESSION_COOKIE}=${await auth.createSession(user.id)}` } };
}

// A review in Sacré-Cœur: `reviewer` reviews `author`'s pull request.
async function chore(n: number, reviewer: string, author: string, opts: { done?: Date; due?: Date; lateNoted?: Date } = {}) {
  await db.insert(chores).values({
    houseId: "sacre-coeur",
    repoId: 1,
    repoFullName: "Djbrl/coloc-test",
    prNumber: n,
    prTitle: `PR ${n}`,
    prUrl: `https://github.com/Djbrl/coloc-test/pull/${n}`,
    authorId: await userId(author),
    assigneeId: await userId(reviewer),
    status: opts.done ? "done" : "open",
    doneAt: opts.done ?? null,
    dueAt: opts.due ?? new Date(Date.now() + 24 * HOUR),
    lateNotedAt: opts.lateNoted ?? null,
  });
}

const sacre = async () => (await svc.city()).houses.find((h) => h.id === "sacre-coeur")!;

describe("the city's live exchange", () => {
  it("counts reviews waiting and late, reviews done this month, and open knocks, with no titles", async () => {
    await chore(1, "awa", "jib");
    await chore(2, "moussa", "jib", { due: new Date(Date.now() - HOUR) });
    await chore(3, "jib", "awa", { done: new Date() });
    // Done last year: not this month.
    await chore(4, "jib", "moussa", { done: new Date("2025-01-15T10:00:00Z") });
    await db.insert(applications).values({ id: "k1", houseId: "sacre-coeur", room: "room-4", applicantId: await userId("aminata"), message: "hi" });

    const h = await sacre();
    expect(h).toMatchObject({ openChores: 2, lateChores: 1, reviewsThisMonth: 1, knocking: 1 });
    expect(JSON.stringify(h)).not.toContain("PR 1");
    const other = (await svc.city()).houses.find((x) => x.id === "almadies")!;
    expect(other).toMatchObject({ openChores: 0, lateChores: 0, reviewsThisMonth: 0, knocking: 0 });
  });

  it("shows a room as building while its latest prod deploy runs, even when an older version is live", async () => {
    await db.update(rooms).set({ status: "live" }).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "jib")));
    const d = await svc.createDeployment("sacre-coeur", "jib", "prod", "https://x/y.git", "main");
    let jib = (await sacre()).rooms.find((r) => r.name === "jib")!;
    expect(jib).toMatchObject({ status: "live", building: true });

    await svc.recordDeployStatus("sacre-coeur", { type: "deploy_status", deployId: d.id, room: "jib", status: "live", url: "http://jib.x" });
    jib = (await sacre()).rooms.find((r) => r.name === "jib")!;
    expect(jib.building).toBe(false);

    // A deploy that lost its agent half an hour ago stops showing a crane.
    const stale = await svc.createDeployment("sacre-coeur", "jib", "prod", "https://x/y.git", "main");
    await db.update(deployments).set({ updatedAt: new Date(Date.now() - 30 * 60_000) }).where(eq(deployments.id, stale.id));
    expect((await sacre()).rooms.find((r) => r.name === "jib")!.building).toBe(false);
  });

  it("says whose project the house rallies behind this fortnight", async () => {
    const h = await sacre();
    expect(h.tontine).toMatchObject({ login: expect.stringMatching(/^(jib|awa|moussa)$/) });
    expect(["Kër Bot", "Ndaje", "Prix Marché"]).toContain(h.tontine!.project);
  });
});

describe("a free room", () => {
  it("is always empty, and the agent is asked to clear what still runs there", async () => {
    await db.update(rooms).set({ status: "live", url: "http://room-4.x" }).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    expect((await svc.view("sacre-coeur"))!.rooms.find((r) => r.name === "room-4")).toMatchObject({ status: "empty", url: null });
    expect((await sacre()).rooms.find((r) => r.name === "room-4")).toMatchObject({ status: "empty", url: null, building: false });

    const leftovers = await svc.applySnapshot("sacre-coeur", {
      type: "rooms_snapshot",
      rooms: [
        { room: "jib", kind: "prod", state: "running", url: "http://jib.x" },
        { room: "room-4", kind: "prod", state: "running", url: "http://room-4.x" },
      ],
    });
    expect(leftovers).toEqual(["room-4"]);
    const [row] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    expect(row).toMatchObject({ status: "empty", url: null });
  });
});

describe("the house page", () => {
  it("shows everyone the reviews traded this month and the tontine's line, with when the turn passes", async () => {
    await chore(1, "awa", "jib", { done: new Date() });
    const view = (await svc.view("sacre-coeur"))!;
    expect(view.reviewsThisMonth).toBe(1);
    expect(view.tontine!.line).toHaveLength(2);
    const everyone = [view.tontine!.current!.login, ...view.tontine!.line.map((p) => p.login)].sort();
    expect(everyone).toEqual(["awa", "jib", "moussa"]);
    const until = new Date(view.tontine!.until).getTime();
    expect(until).toBeGreaterThan(Date.now());
    expect((until - TONTINE_ANCHOR) % (14 * 24 * HOUR)).toBe(0);
    // The bill is for flatmates only, and the workshop has no tontine.
    expect(view.bill).toBeNull();
    expect((await svc.view("atelier"))!.tontine).toBeNull();
  });

  it("gives flatmates the bill: usage share, reviews paid as rent, skips charged, how to pay", async () => {
    await chore(1, "awa", "jib", { done: new Date() });
    await chore(2, "awa", "moussa", { done: new Date() });
    await chore(3, "awa", "jib", { done: new Date() });
    // Moussa let a review go late.
    await chore(4, "moussa", "jib", { due: new Date(Date.now() - HOUR) });

    const bill = (await svc.view("sacre-coeur", await userId("jib")))!.bill!;
    expect(bill).toMatchObject({
      month: monthOf(new Date()),
      total: 12_000,
      reviewCredit: 500,
      operators: ["Wave", "Orange Money", "Free Money"],
      reference: billReference("sacre-coeur", monthOf(new Date())),
    });
    const line = (login: string) => bill.lines.find((l) => l.login === login)!;
    // Split by room size (256, 256, 128 MB): nobody used CPU.
    expect([line("jib").share, line("awa").share, line("moussa").share]).toEqual([4_800, 4_800, 2_400]);
    expect(line("awa")).toMatchObject({ reviews: 3, credit: 1_500, due: 3_300, paid: false });
    expect(line("moussa")).toMatchObject({ skipped: 1, surcharge: 500, due: 2_900 });
    expect(line("jib").due).toBe(4_800);
    // Moussa's skip paid 500 of Awa's 1 500; the pool pays the rest.
    expect(bill.pool).toBe(1_000);
    expect(bill.lines.reduce((s, l) => s + l.due, 0)).toBe(12_000 - bill.pool);
  });

  it("pays nothing for a review of your own project: teammates of a room reviewing each other", async () => {
    // Repo 1 lives in Moussa's room, and Awa teamed up on it.
    await db.insert(repos).values({ githubId: 1, fullName: "Djbrl/coloc-test", houseId: "sacre-coeur", room: "moussa", installationId: 7 });
    const [moussaRoom] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "moussa")));
    await db.insert(roomTeammates).values({ roomId: moussaRoom.id, userId: await userId("awa") });
    // Awa reviews Moussa's pull request (their shared project); Jib, who isn't on it, reviews another.
    await chore(1, "awa", "moussa", { done: new Date() });
    await chore(2, "jib", "moussa", { done: new Date() });
    // A late one between the two teammates isn't a skipped house chore either.
    await chore(3, "moussa", "awa", { due: new Date(Date.now() - HOUR) });

    const bill = (await svc.view("sacre-coeur", await userId("jib")))!.bill!;
    const line = (login: string) => bill.lines.find((l) => l.login === login)!;
    expect(line("awa")).toMatchObject({ reviews: 0, credit: 0 });
    expect(line("jib")).toMatchObject({ reviews: 1, credit: 500 });
    expect(line("moussa")).toMatchObject({ skipped: 0, surcharge: 0 });
  });

  it("lets a flatmate mark their own line paid, once, and nobody else", async () => {
    const awa = await loggedIn("awa");
    expect(await controller.billPaid("sacre-coeur", awa)).toMatchObject({ ok: true, month: monthOf(new Date()), amount: 4_800 });
    await controller.billPaid("sacre-coeur", awa);
    // It came out of Awa's credit, once.
    expect((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "awa") }))!.credit).toBe(15_000 - 4_800);
    expect(await db.select().from(billPayments)).toHaveLength(1);
    const bill = (await svc.view("sacre-coeur", await userId("awa")))!.bill!;
    expect(bill.lines.find((l) => l.login === "awa")!.paid).toBe(true);
    expect(bill.lines.find((l) => l.login === "jib")!.paid).toBe(false);

    const stranger = await controller.billPaid("sacre-coeur", await loggedIn("aminata")).catch((e) => e);
    expect((stranger as HttpException).getStatus()).toBe(403);
    await expect(controller.billPaid("sacre-coeur", { headers: {} })).rejects.toThrow("Log in first.");
  });

  it("has no bill where nobody pays (the workshop)", async () => {
    expect((await svc.view("atelier", await userId("ndeye")))!.bill).toBeNull();
  });
});

describe("mobile money", () => {
  it("names the operators of each country, as text", () => {
    expect(operatorsFor("CI")).toEqual(["Orange Money", "MTN MoMo", "Moov Money", "Wave"]);
    expect(operatorsFor("RW")).toEqual(["MTN MoMo", "Airtel Money"]);
    expect(operatorsFor("MA")).toEqual(["bank card", "bank transfer"]);
    expect(operatorsFor("XX")).toEqual([]);
  });
});
