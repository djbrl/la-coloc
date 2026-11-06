import "reflect-metadata";
import { chores, type Db, deployments, houses, leaseEnds, memberships, repos, roomSecrets, rooms, usageSamples, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { MembershipsService } from "../auth/memberships.service";
import { RoomsService } from "../rooms/rooms.service";
import { seedCity } from "../seed/city";
import { HousesService } from "./houses.service";
import type { Landlord } from "./landlord";
import { LeasesService } from "./leases.service";
import { monthOf } from "./money";

let db: Db;
let service: HousesService;
let leases: LeasesService;
let sent: unknown[];
let hungUp: string[];
let retired: string[];
let online: boolean;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  // Sacré-Cœur, 12 000 FCFA a month: jib (chef), awa and moussa in their rooms, room-4 free.
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  await db.delete(leaseEnds);
  // Someone from outside the house.
  await db.insert(users).values({ login: "fatou", name: "Fatou" }).onConflictDoNothing();
  service = new HousesService(db);
  sent = [];
  hungUp = [];
  retired = [];
  online = true;
  const agents = { isOnline: () => online, send: (_: string, c: unknown) => sent.push(c), hangUp: (id: string) => hungUp.push(id) } as unknown as AgentRegistry;
  const landlord = { retire: (id: string) => retired.push(id) } as unknown as Landlord;
  leases = new LeasesService(db, service, agents, landlord);
});

const HOUSE = "sacre-coeur";
const person = async (login: string) => (await db.select().from(users).where(eq(users.login, login)))[0];
const member = async (login: string, houseId = HOUSE) =>
  (await db.select().from(memberships).where(and(eq(memberships.houseId, houseId), eq(memberships.userId, (await person(login)).id))))[0];
const room = (name: string, houseId = HOUSE) => service.room(houseId, name);
const take = async (login: string, name: string, houseId = HOUSE) => leases.take(houseId, name, await person(login));
const leave = async (login: string, name: string, now?: Date) => leases.leave(HOUSE, name, await person(login), now);
const code = (e: { getResponse: () => unknown }) => (e.getResponse() as { code: string }).code;
// What each flatmate pays this month, as the bill says it.
const billOf = async (viewer = "jib") => {
  const view = await service.view(HOUSE, (await person(viewer)).id);
  return Object.fromEntries(view!.bill!.lines.map((l) => [l.login, l.share]));
};
const nextMonth = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 2));

describe("several rooms for one person", () => {
  it("lets a flatmate take a free room and keeps their place in the house", async () => {
    const before = await member("awa");
    expect(await take("awa", "room-4")).toEqual({ room: "room-4" });
    expect((await room("room-4")).occupantId).toBe((await person("awa")).id);
    expect(await member("awa")).toMatchObject({ role: before.role, tontinePosition: before.tontinePosition, leavingMonth: null });
  });

  it("says which rooms, in the house and in `me`, with `room` still the first", async () => {
    await take("awa", "room-4");
    const awa = await person("awa");
    const view = await service.view(HOUSE, awa.id);
    expect(view!.viewer).toMatchObject({ room: "awa", rooms: ["awa", "room-4"], leavingUntil: null });
    const mine = await new MembershipsService(db).housesOf(awa.id);
    expect(mine.filter((h) => h.id === HOUSE)).toEqual([{ id: HOUSE, name: view!.name, role: "flatmate", room: "awa", rooms: ["awa", "room-4"] }]);
  });

  it("adds up a person's rooms on the bill", async () => {
    await take("awa", "room-4");
    // 256 + 256 of jib 256, awa 512, moussa 128.
    const lines = await billOf();
    expect(lines.awa).toBe(Math.round((12_000 * 512) / 896));
    expect(lines.jib + lines.awa + lines.moussa).toBe(12_000);
  });

  it("refuses someone from outside, a taken room, and the workshop", async () => {
    expect(code(await take("fatou", "room-4").catch((e) => e))).toBe("takeMembersOnly");
    expect(code(await take("awa", "moussa").catch((e) => e))).toBe("roomTaken");
    await db.insert(rooms).values({ houseId: "atelier", name: "spare", memoryMb: 256, cpus: 0.5 });
    await db.insert(memberships).values({ houseId: "atelier", userId: (await person("awa")).id });
    expect(code(await take("awa", "spare", "atelier").catch((e) => e))).toBe("takeNotHere");
  });

  it("stops at three rooms a person, not counting the workshop", async () => {
    await db.insert(rooms).values(["room-5", "room-6"].map((name) => ({ houseId: HOUSE, name, memoryMb: 256, cpus: 0.5 })));
    const awa = await person("awa");
    await db.insert(rooms).values({ houseId: "atelier", name: "awa-first", occupantId: awa.id, memoryMb: 256, cpus: 0.5 });
    await take("awa", "room-4");
    await take("awa", "room-5");
    expect(code(await take("awa", "room-6").catch((e) => e))).toBe("room_limit");
    expect((await room("room-6")).occupantId).toBeNull();
  });
});

describe("ending a lease", () => {
  it("frees the room at once and leaves nothing of theirs in it", async () => {
    const awa = await person("awa");
    const r = await room("awa");
    await db.insert(repos).values({ githubId: 77, fullName: "awa/ndaje", houseId: HOUSE, room: "awa", installationId: 1 });
    await db.insert(roomSecrets).values({ houseId: HOUSE, room: "awa", name: "TOKEN", value: "sealed" });
    await db.insert(chores).values({ houseId: HOUSE, repoId: 77, repoFullName: "awa/ndaje", prNumber: 1, prTitle: "x", prUrl: "u", assigneeId: (await person("jib")).id, dueAt: new Date() });
    const d = await service.createDeployment(HOUSE, "awa", "prod", "https://x/y.git", "main", awa.id);
    await db.update(rooms).set({ url: "http://awa.x", status: "live" }).where(eq(rooms.id, r.id));

    const { until } = await leave("awa", "awa", new Date(Date.UTC(2026, 10, 12)));
    expect(until).toBe("2026-11-30T23:59:59.999Z");
    expect(sent).toEqual([{ type: "cancel_build", room: "awa" }, { type: "remove_room", room: "awa" }]);

    expect(await room("awa")).toMatchObject({ occupantId: null, status: "empty", url: null, project: null, projectDescription: null, ad: null, source: null, lastDeployId: null });
    expect(await db.select().from(repos).where(eq(repos.githubId, 77))).toEqual([]);
    expect(await db.select().from(roomSecrets).where(eq(roomSecrets.houseId, HOUSE))).toEqual([]);
    expect(await db.select().from(chores).where(eq(chores.repoId, 77))).toEqual([]);
    expect(await db.select().from(deployments).where(eq(deployments.room, "awa"))).toEqual([]);

    // A build that was on its way when the lease ended has nothing to report to.
    await service.recordDeployStatus(HOUSE, { type: "deploy_status", deployId: d.id, room: "awa", status: "live", url: "http://awa.sacre-coeur" });
    expect(await room("awa")).toMatchObject({ status: "empty", url: null });

    const view = await service.view(HOUSE, (await person("jib")).id);
    expect(view!.notes!.some((n) => n.said?.kind === "endedLease")).toBe(true);
    expect(view!.rooms.find((r) => r.name === "awa")?.occupant).toBeNull();
  });

  it("asks nothing of a caretaker that's offline: its snapshot clears the room when it's back", async () => {
    online = false;
    await leave("awa", "awa");
    expect(sent).toEqual([]);
    expect(await service.applySnapshot(HOUSE, { type: "rooms_snapshot", rooms: [{ room: "awa", kind: "prod", state: "running", url: null }] } as never)).toEqual(["awa"]);
  });

  it("clears the last tenant's container when someone claimed the room while the caretaker was offline", async () => {
    online = false;
    await leave("awa", "awa");
    await take("jib", "awa");
    const snapshot = { type: "rooms_snapshot" as const, rooms: [{ room: "awa", kind: "prod" as const, state: "running" as const, url: "http://awa.x" }] };
    expect(await service.applySnapshot(HOUSE, snapshot)).toEqual(["awa"]);
    expect(await room("awa")).toMatchObject({ status: "empty", url: null });
    // Once they've built there, what runs is theirs.
    await service.createDeployment(HOUSE, "awa", "prod", "https://x/y.git", "main", (await person("jib")).id);
    expect(await service.applySnapshot(HOUSE, snapshot)).toEqual([]);
  });

  it("only lets the occupant end it, and never in the workshop", async () => {
    expect(code(await leave("jib", "awa").catch((e) => e))).toBe("leaseNotYours");
    const awa = await person("awa");
    await db.insert(rooms).values({ houseId: "atelier", name: "awa-first", occupantId: awa.id, memoryMb: 256, cpus: 0.5 });
    expect(code(await leases.leave("atelier", "awa-first", awa).catch((e) => e))).toBe("leaseNotHere");
    const [demo] = await db.select().from(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.demo, true)));
    const learner = (await db.select().from(users).where(eq(users.id, demo.occupantId!)))[0];
    expect(code(await leases.leave("atelier", demo.name, learner).catch((e) => e))).toBe("leaseNotHere");
  });

  it("doesn't move anyone's line of the bill: not when they leave, nor when someone claims the room", async () => {
    const before = await billOf();
    await leave("moussa", "moussa");
    expect(await billOf()).toEqual(before);
    // A newcomer claims it: they're on the bill, at nothing until next month.
    await db.insert(memberships).values({ houseId: HOUSE, userId: (await person("fatou")).id, tontinePosition: 9 });
    await take("fatou", "moussa");
    expect(await billOf()).toEqual({ ...before, fatou: 0 });
    // And if the newcomer leaves too, the first person is still the one paying.
    await leave("fatou", "moussa");
    expect(await billOf()).toEqual({ ...before, fatou: 0 });
  });

  it("keeps the room's CPU out of it once the lease has ended", async () => {
    const at = new Date();
    await db.insert(usageSamples).values({ houseId: HOUSE, room: "awa", at: new Date(at.getTime() - 60_000), cpuPercent: 50, memoryBytes: 1 });
    const before = await billOf();
    await leave("awa", "awa", at);
    await db.insert(usageSamples).values({ houseId: HOUSE, room: "awa", at: new Date(at.getTime() + 60_000), cpuPercent: 90, memoryBytes: 1 });
    expect(await billOf()).toEqual(before);
  });

  it("is theirs again, as before, if they take the room back", async () => {
    const before = await billOf();
    await leave("moussa", "moussa");
    await take("moussa", "moussa");
    expect(await billOf()).toEqual(before);
    expect(await member("moussa")).toMatchObject({ leavingMonth: null });
    expect(await db.select().from(leaseEnds)).toEqual([]);
  });

  it("keeps someone who still has another room a plain flatmate", async () => {
    await take("awa", "room-4");
    await leave("awa", "awa");
    expect(await member("awa")).toMatchObject({ leavingMonth: null });
  });

  it("keeps someone with no room left on the bill and in the chat until the month ends", async () => {
    const now = new Date();
    await leave("moussa", "moussa", now);
    expect(await member("moussa")).toMatchObject({ leavingMonth: monthOf(now) });
    const view = await service.view(HOUSE, (await person("moussa")).id);
    expect(view!.viewer).toMatchObject({ member: true, room: null, rooms: [] });
    expect(view!.viewer!.leavingUntil).not.toBeNull();
    expect(view!.channel).not.toBeNull();
    expect(view!.bill!.lines.find((l) => l.login === "moussa")!.share).toBeGreaterThan(0);
    // Taking a room again means they're staying.
    await take("moussa", "room-4");
    expect(await member("moussa")).toMatchObject({ leavingMonth: null });
  });

  it("still counts a chef who is leaving as running their server, until the rollover", async () => {
    const jib = await person("jib");
    await leave("jib", "jib");
    expect(await service.serversOf(jib.id, "elsewhere")).toBe(1);
    await leases.settleLeases(nextMonth());
    expect(await service.serversOf(jib.id, "elsewhere")).toBe(0);
  });
});

describe("the room page's numbers", () => {
  const manage = async (login: string, name: string, houseId = HOUSE) => new RoomsService(db, service, null).view(houseId, name, (await person(login)).id);

  it("gives the occupant their share, their rooms and the date", async () => {
    await take("awa", "room-4");
    const { lease } = await manage("awa", "awa");
    expect(lease).toMatchObject({ rooms: 2 });
    expect(lease!.share).toBeGreaterThan(0);
    expect(lease!.until).toMatch(/-\d\dT23:59:59.999Z$/);
  });

  it("gives nothing to a chef who only manages the room", async () => {
    expect((await manage("jib", "awa")).lease).toBeNull();
  });
});

describe("the month rolling over", () => {
  it("does nothing while the month is still on", async () => {
    await leave("moussa", "moussa");
    await leases.settleLeases();
    expect(await member("moussa")).toBeDefined();
    expect(await db.select().from(leaseEnds)).toHaveLength(1);
  });

  it("removes who was leaving, and new occupants start paying", async () => {
    const left = new Date();
    await leave("moussa", "moussa", left);
    await db.insert(memberships).values({ houseId: HOUSE, userId: (await person("fatou")).id, tontinePosition: 9 });
    await take("fatou", "moussa");
    await leases.settleLeases(nextMonth(left));
    expect(await member("moussa")).toBeUndefined();
    expect(await db.select().from(leaseEnds)).toEqual([]);
    const lines = await billOf();
    expect(Object.keys(lines).sort()).toEqual(["awa", "fatou", "jib"]);
    expect(lines.fatou).toBeGreaterThan(0);
    // Twice is the same as once.
    await leases.settleLeases(nextMonth(left));
    expect(await member("jib")).toMatchObject({ role: "chef" });
  });

  it("passes the chef on to the first in the line, only then", async () => {
    await leave("jib", "jib");
    expect(await member("jib")).toMatchObject({ role: "chef" });
    expect((await db.select().from(houses).where(eq(houses.id, HOUSE)))[0].chefId).toBe((await person("jib")).id);
    await leases.settleLeases(nextMonth());
    const [next] = await db.select().from(memberships).where(eq(memberships.houseId, HOUSE)).orderBy(memberships.tontinePosition);
    expect(next.role).toBe("chef");
    expect((await db.select().from(houses).where(eq(houses.id, HOUSE)))[0].chefId).toBe(next.userId);
    expect((await db.select().from(memberships).where(and(eq(memberships.houseId, HOUSE), eq(memberships.role, "chef"))))).toHaveLength(1);
  });

  it("closes a house with nobody left, and its server goes", async () => {
    await leave("awa", "awa");
    await leave("moussa", "moussa");
    await leave("jib", "jib");
    await leases.settleLeases(nextMonth());
    expect(await service.exists(HOUSE)).toBe(false);
    expect(hungUp).toEqual([HOUSE]);
    expect(retired).toEqual([HOUSE]);
  });
});
