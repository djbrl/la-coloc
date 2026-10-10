import "reflect-metadata";
import { type Db, houses as houseRows, messages, rooms, sessions, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent } from "@coloc/protocol";
import { HttpException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { loadAuthConfig } from "../auth/auth.config";
import { AuthController } from "../auth/auth.controller";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { MembershipsService } from "../auth/memberships.service";
import { CityController } from "../houses/houses.controller";
import { HousesService } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { RoomsService } from "../rooms/rooms.service";
import { CITY, seedCity } from "../seed/city";
import { TutorialController } from "../tutorial/tutorial.controller";
import { TutorialService } from "../tutorial/tutorial.service";
import { DemoController } from "./demo.controller";
import { DemoService } from "./demo.service";

const seed = { agentSecret: "s", domain: (id: string) => `${id}.coloc.localhost`, life: true };
let db: Db;
let sent: { house: string; cmd: ApiToAgent }[];
let hungUp: string[];
let changed: string[];
let auth: AuthService;
let houses: HousesService;
let demo: DemoController;
let demoService: DemoService;
let tutorial: TutorialController;
let me: AuthController;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, seed);
  sent = [];
  hungUp = [];
  const agents = {
    isOnline: () => true,
    send: (house: string, cmd: ApiToAgent) => sent.push({ house, cmd }),
    hangUp: (house: string) => hungUp.push(house),
  } as unknown as AgentRegistry;
  houses = new HousesService(db);
  changed = [];
  houses.changes.subscribe((id) => changed.push(id));
  auth = new AuthService(db, loadAuthConfig({ COLOC_DEV_LOGIN: "1", COLOC_DEMO_RESET: "1", COLOC_ADMINS: "Fatou, jib" }));
  demoService = new DemoService(db, houses, agents, seed);
  demo = new DemoController(demoService, auth);
  const rs = new RoomsService(db, houses, null);
  tutorial = new TutorialController(new TutorialService(db, houses, rs, new RoomDeployer(db, houses, agents, null, null), agents, null, { repo: "https://x/y.git", path: "." }), auth);
  me = new AuthController(auth, new MembershipsService(db));
});

async function loggedIn(login: string) {
  const user = await auth.devLogin(login);
  return { headers: { cookie: `${SESSION_COOKIE}=${await auth.createSession(user.id)}` } };
}

const response = () => ({ status: () => ({ json: (b: unknown) => b }) });

describe("the demo reset", () => {
  it("puts the city back to the seed and keeps everyone logged in", async () => {
    const req = await loggedIn("fatou");
    const fatou = await auth.userFromRequest(req);
    // Fatou starts a house, takes the tutorial to the end, and says something in Sacré-Cœur's channel.
    await new CityController(houses, auth).rent({ city: "Dakar", plot: "2.1.0.1", name: "Médina Lab" }, req);
    await tutorial.room(req, response());
    await me.updateMe(req, { tutorialDone: true });
    await db.insert(messages).values({ channel: "house:sacre-coeur", authorId: fatou!.id, body: "salut" });
    // Someone renamed a seeded room's project: the reset puts it back. The room is running, and stays so.
    await db.update(rooms).set({ project: "Changed", status: "live", url: "http://jib.coloc.localhost:8000" }).where(eq(rooms.name, "jib"));

    expect(await demo.reset(req)).toEqual({ ok: true });

    const left = await db.select({ id: houseRows.id }).from(houseRows).orderBy(asc(houseRows.id));
    expect(left.map((h) => h.id)).toEqual(CITY.map((h) => h.id).sort());
    // The workshop is back to its host and learners, in their example rooms; Fatou's tutorial room is gone.
    const workshop = await db.select().from(rooms).where(eq(rooms.houseId, "atelier"));
    expect(workshop.map((r) => r.name).sort()).toEqual(["aissatou", "babacar", "coumba", "lamine", "ndeye"]);
    expect(workshop.every((r) => r.demo && r.status === "live" && r.url === null)).toBe(true);
    // Fatou's message went with the old city; the seeded chat is back.
    const said = await db.select().from(messages);
    expect(said.some((m) => m.body === "salut")).toBe(false);
    expect(said.length).toBeGreaterThan(0);
    const [jibRoom] = await db.select().from(rooms).where(eq(rooms.name, "jib"));
    expect(jibRoom).toMatchObject({ project: "Kër Bot", status: "live", url: "http://jib.coloc.localhost:8000" });

    // The agents removed every room that's gone, and only those; the new house's agent was hung up.
    expect(sent.map((s) => `${s.house}/${(s.cmd as { room: string }).room}`).sort()).toEqual(
      ["atelier/tuto-fatou", "medina-lab/fatou", "medina-lab/room-2", "medina-lab/room-3", "medina-lab/room-4"].sort(),
    );
    expect(hungUp).toEqual(["medina-lab"]);
    expect(changed).toEqual(expect.arrayContaining(["medina-lab", "atelier", "sacre-coeur"]));

    // Same person, same session, tutorial to do again.
    expect((await auth.userFromRequest(req))!.id).toBe(fatou!.id);
    expect(await db.select().from(sessions).where(eq(sessions.userId, fatou!.id))).toHaveLength(1);
    expect((await me.me(req)).user).toMatchObject({ login: "fatou", tutorialDone: false, houses: [] });
    // The seeded people are the same rows as before, not new ones.
    expect(await db.select().from(users).where(eq(users.login, "jib"))).toHaveLength(1);
  });

  it("can run twice in a row once the cooldown is over", async () => {
    const req = await loggedIn("fatou");
    demoService.cooldownMs = 0;
    await demo.reset(req);
    await demo.reset(req);
    expect(await db.select().from(houseRows)).toHaveLength(CITY.length);
  });

  it("is off unless the server says so, and needs a login", async () => {
    const req = await loggedIn("fatou");
    const off = new DemoController(new DemoService(db, houses, {} as AgentRegistry, seed), new AuthService(db, loadAuthConfig({})));
    const e = await off.reset(req).catch((x) => x);
    expect((e as HttpException).getStatus()).toBe(403);
    expect(e.message).toBe("The demo reset is off on this server.");
    await expect(demo.reset({ headers: {} })).rejects.toThrow("Log in first.");
    expect(await me.config(req)).toMatchObject({ demoReset: true });
  });

  it("is only for the admins, and the button only shows for them", async () => {
    const awa = await loggedIn("awa");
    const e = await demo.reset(awa).catch((x) => x);
    expect((e as HttpException).getStatus()).toBe(403);
    expect(e.message).toBe("Only the city's admins can reset it.");
    expect(await me.config(awa)).toMatchObject({ demoReset: false });
    expect(await me.config({ headers: {} })).toMatchObject({ demoReset: false });
    // Logins compare without case: "Fatou, jib" lets jib in.
    expect(await me.config(await loggedIn("jib"))).toMatchObject({ demoReset: true });
  });

  it("waits ten minutes between two resets", async () => {
    const req = await loggedIn("fatou");
    await demo.reset(req);
    const e = await demo.reset(req).catch((x) => x);
    expect((e as HttpException).getStatus()).toBe(429);
    expect(e.message).toBe("The city was just reset. Try again in 10 minutes.");
  });

  it("replants a month of life: ledger, chores, channel, notes, history, tontine and payments", async () => {
    const req = await loggedIn("fatou");
    await demo.reset(req);
    const view = (await houses.view("sacre-coeur"))!;
    expect(view.ledger.find((l) => l.login === "awa")).toMatchObject({ given: 7, received: 5 });
    expect(view.reviewsThisMonth).toBeGreaterThan(0);
    expect(view.tontine?.current).toMatchObject({ login: expect.any(String) });
    const city = await houses.city();
    const sacre = city.houses.find((h) => h.id === "sacre-coeur")!;
    expect(sacre).toMatchObject({ openChores: 2, lateChores: 1 });
    // Jib, a flatmate, sees the channel, the history and the bill.
    const jib = await auth.devLogin("jib");
    const inside = (await houses.view("sacre-coeur", jib.id))!;
    expect(inside.channel!.length).toBeGreaterThanOrEqual(12);
    expect(inside.chores).toHaveLength(2);
    expect(inside.deployments!.length).toBeGreaterThanOrEqual(9);
    expect(inside.notes!.some((n) => n.tone === "thanks")).toBe(true);
    expect(inside.bill!.lines.some((l) => l.paid)).toBe(true);
    // Never an @-mention in anything seeded.
    expect(inside.channel!.every((m) => !m.body.includes("@"))).toBe(true);
  });
});
