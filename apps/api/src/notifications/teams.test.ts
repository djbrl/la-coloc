// Teaming up: flatmates of one house working on one room's project. Who may ask whom, how a yes puts someone on the
// team, the limits, leaving, and what a teammate may then do with the room.
import "reflect-metadata";
import { type Db, memberships, notifications, roomTeammates, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import type { ApiToAgent } from "@coloc/protocol";
import { HttpException } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { LogsBroker } from "../agents/logs.broker";
import { ShellBroker } from "../agents/shell.broker";
import type { AuthService } from "../auth/auth.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { RoomsController } from "../rooms/rooms.controller";
import { RoomsService } from "../rooms/rooms.service";
import { SecretBox } from "../rooms/secrets";
import { seedCity } from "../seed/city";
import { NotificationsController } from "./notifications.controller";
import { INVITES_PER_DAY, NotificationsService } from "./notifications.service";
import { TEAM_MAX } from "./teams";

let db: Db;
let houses: HousesService;
let service: NotificationsService;
let controller: NotificationsController;
let roomsController: RoomsController;
let pushed: string[];
let sent: ApiToAgent[];
let as: string | null;
const ids: Record<string, string> = {};
const req = { headers: {} };

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  // The bare city: Sacré-Cœur has Jib (the chef), Awa and Moussa, each in their own room, and no team yet.
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  service = new NotificationsService(db, houses, new DoorbellService(db, houses), { devLogin: false });
  pushed = [];
  service.pushes.subscribe((login) => pushed.push(login));
  sent = [];
  as = null;
  const auth = {
    userFromRequest: async () => (as ? ((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null) : null),
  } as unknown as AuthService;
  controller = new NotificationsController(service, auth);
  const agents = { isOnline: () => true, send: (_: string, cmd: ApiToAgent) => sent.push(cmd) } as unknown as AgentRegistry;
  const box = new SecretBox(randomBytes(32).toString("base64"));
  roomsController = new RoomsController(new RoomsService(db, houses, box), new RoomDeployer(db, houses, agents, box, null), houses, agents, new LogsBroker(agents), auth, new ShellBroker(agents));
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  // Sacré-Cœur's three logged in with GitHub: real people, not examples.
  for (const [login, githubId] of [["jib", 201], ["awa", 202], ["moussa", 203]] as const) await db.update(users).set({ githubId }).where(eq(users.id, ids[login]));
  // Fatou is real too, but lives in no house.
  const [fatou] = await db.insert(users).values({ login: "fatou", name: "Fatou", githubId: 204 }).returning();
  ids.fatou = fatou.id;
});

// The status a call is refused with, or "ok".
async function status(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HttpException) return e.getStatus();
    throw e;
  }
}

// The code a refusal carries, for the web's words.
async function code(p: Promise<unknown>): Promise<string | undefined> {
  const e = await p.then(() => null).catch((x) => x);
  return e instanceof HttpException ? (e.getResponse() as { code?: string }).code : undefined;
}

const invite = (from: string, to: string, room = from) => service.teamUp(ids[from], "sacre-coeur", room, to);
const ask = (from: string, room: string) => service.teamUp(ids[from], "sacre-coeur", room, null);
const teamOf = async (room: string) => (await houses.view("sacre-coeur"))!.rooms.find((r) => r.name === room)!.team.map((p) => p.login);
const bellOf = async (login: string) => (await service.list(ids[login])).items;

// Extra flatmates for Sacré-Cœur, without rooms of their own (a flatmate usually has one, but needn't).
async function moreFlatmates(n: number): Promise<string[]> {
  const logins: string[] = [];
  for (let i = 0; i < n; i++) {
    const login = `mate${i}`;
    const [u] = await db.insert(users).values({ login, name: `Mate ${i}`, githubId: 300 + i }).returning();
    ids[login] = u.id;
    await db.insert(memberships).values({ houseId: "sacre-coeur", userId: u.id, role: "flatmate", tontinePosition: 10 + i });
    logins.push(login);
  }
  return logins;
}

describe("bringing a flatmate onto your project", () => {
  it("puts the request under their bell, shows the sender it's waiting, and a yes puts them on the team", async () => {
    const { id } = await invite("awa", "moussa");
    const [n] = await bellOf("moussa");
    expect(n).toMatchObject({ id, kind: "team_invite", state: "open", room: "awa", house: { id: "sacre-coeur" }, from: { login: "awa" } });
    expect((await service.list(ids.awa)).sent).toEqual([{ id, kind: "team_invite", to: "moussa", houseId: "sacre-coeur", room: "awa" }]);
    expect(pushed).toEqual(["moussa"]);

    expect(await service.accept(ids.moussa, id)).toMatchObject({ kind: "team_invite", house: { id: "sacre-coeur" }, room: "awa" });
    expect(await teamOf("awa")).toEqual(["moussa"]);
    // Moussa keeps his own room, and nobody joined it.
    expect((await houses.view("sacre-coeur"))!.rooms.find((r) => r.name === "moussa")!.occupant?.login).toBe("moussa");
    expect(await teamOf("moussa")).toEqual([]);
    // Awa hears it was taken.
    expect((await bellOf("awa"))[0]).toMatchObject({ kind: "team_accepted", from: { login: "moussa" }, room: "awa" });
  });

  it("shows the team on the city, and plays it as a happening", async () => {
    const { id } = await invite("awa", "moussa");
    await service.accept(ids.moussa, id);
    const house = (await houses.city()).houses.find((h) => h.id === "sacre-coeur")!;
    expect(house.rooms.find((r) => r.name === "awa")!.team.map((p) => p.login)).toEqual(["moussa"]);
    expect(house.recent).toEqual([expect.objectContaining({ kind: "team", room: "awa", logins: ["awa", "moussa"] })]);
  });

  it("is only for the room's occupant, and only towards a flatmate of the same house", async () => {
    // Jib is the chef, but it's Awa's room.
    expect(await code(invite("jib", "moussa", "awa"))).toBe("teamOccupantOnly");
    // Fatou doesn't live in Sacré-Cœur: the card offers "invite to my house" instead.
    expect(await code(invite("awa", "fatou"))).toBe("teamFlatmatesOnly");
    expect(await status(invite("awa", "awa"))).toBe(400);
    // Fatou, from outside, can't ask either.
    expect(await code(ask("fatou", "awa"))).toBe("teamFlatmatesOnly");
  });

  it("refuses an example house, the workshop, a free room and a missing one", async () => {
    // Almadies is an example house; L'Atelier the workshop.
    expect(await code(service.teamUp(ids.aminata, "almadies", "aminata", "cheikh"))).toBe("exampleHouseTeam");
    expect(await code(service.teamUp(ids.ndeye, "atelier", "ndeye", "aissatou"))).toBe("workshopTeam");
    expect(await code(ask("awa", "room-4"))).toBe("teamFreeRoom");
    expect(await status(ask("awa", "no-such-room"))).toBe(404);
  });
});

describe("asking to join a flatmate's project", () => {
  it("asks the room's occupant, and their yes puts the asker on the team", async () => {
    const { id } = await ask("moussa", "awa");
    expect((await bellOf("awa"))[0]).toMatchObject({ id, kind: "team_ask", state: "open", room: "awa", from: { login: "moussa" } });
    await service.accept(ids.awa, id);
    expect(await teamOf("awa")).toEqual(["moussa"]);
    expect((await bellOf("moussa"))[0]).toMatchObject({ kind: "team_accepted", from: { login: "awa" } });
  });

  it("isn't for your own room, nor a team you're already on", async () => {
    expect(await code(ask("awa", "awa"))).toBe("teamOwnRoom");
    await service.accept(ids.moussa, (await invite("awa", "moussa")).id);
    expect(await code(ask("moussa", "awa"))).toBe("alreadyTeammate");
    expect(await code(invite("awa", "moussa"))).toBe("alreadyTeammate");
  });
});

describe("saying no, and the brake", () => {
  it("tells the sender, and not again that day", async () => {
    const { id } = await invite("awa", "moussa");
    await service.decline(ids.moussa, id);
    expect((await bellOf("awa"))[0]).toMatchObject({ kind: "team_declined", from: { login: "moussa" }, room: "awa" });
    expect(await teamOf("awa")).toEqual([]);
    expect(await code(invite("awa", "moussa"))).toBe("saidNoToday");
  });

  it("allows one open request per person, and counts towards the day's invitations", async () => {
    await invite("awa", "moussa");
    expect(await code(invite("awa", "moussa"))).toBe("alreadyInvited");
    // Awa already sent the day's other invitations.
    await db.insert(notifications).values(Array.from({ length: INVITES_PER_DAY - 1 }, () => ({ userId: ids.fatou, kind: "rent_together" as const, fromId: ids.awa, state: "declined" as const })));
    expect(await status(invite("awa", "jib"))).toBe(429);
  });

  it("can be taken back while it's open, and answered only once", async () => {
    const first = await invite("awa", "moussa");
    await service.withdraw(ids.awa, first.id);
    expect(await code(service.accept(ids.moussa, first.id))).toBe("inviteWithdrawn");
    const second = await ask("jib", "awa");
    await service.accept(ids.awa, second.id);
    expect(await code(service.accept(ids.awa, second.id))).toBe("inviteAnswered");
    // Only the recipient answers.
    expect(await status(service.accept(ids.jib, second.id))).toBe(404);
  });
});

describe("the size of a team", () => {
  it(`has at most ${TEAM_MAX} teammates`, async () => {
    const mates = await moreFlatmates(TEAM_MAX + 1);
    const [awaRoom] = await db.select().from(rooms).where(eq(rooms.name, "awa"));
    // An invitation sent while there was still a place…
    const late = await invite("awa", mates[TEAM_MAX]);
    await db.insert(roomTeammates).values(mates.slice(0, TEAM_MAX).map((m) => ({ roomId: awaRoom.id, userId: ids[m] })));
    // …lapses when the team filled up meanwhile, and a new one is refused.
    expect(await code(service.accept(ids[mates[TEAM_MAX]], late.id))).toBe("teamFullNow");
    expect(await code(invite("awa", "moussa"))).toBe("teamFull");
    expect(await code(ask("moussa", "awa"))).toBe("teamFull");
    expect(await teamOf("awa")).toHaveLength(TEAM_MAX);
  });

  it("lets two yeses at once fill only the last place", async () => {
    const mates = await moreFlatmates(TEAM_MAX);
    const [awaRoom] = await db.select().from(rooms).where(eq(rooms.name, "awa"));
    await db.insert(roomTeammates).values(mates.slice(0, TEAM_MAX - 1).map((m) => ({ roomId: awaRoom.id, userId: ids[m] })));
    const a = await invite("awa", mates[TEAM_MAX - 1]);
    const b = await invite("awa", "moussa");
    const results = await Promise.all([status(service.accept(ids[mates[TEAM_MAX - 1]], a.id)), status(service.accept(ids.moussa, b.id))]);
    expect(results.sort()).toEqual([409, "ok"].sort());
    expect(await teamOf("awa")).toHaveLength(TEAM_MAX);
  });
});

describe("leaving a team", () => {
  beforeEach(async () => {
    await service.accept(ids.moussa, (await invite("awa", "moussa")).id);
  });

  it("lets the teammate leave, through the route", async () => {
    as = "moussa";
    expect(await controller.leaveTeam("sacre-coeur", "awa", "moussa", req)).toEqual({ ok: true });
    expect(await teamOf("awa")).toEqual([]);
  });

  it("lets the occupant remove a teammate, and nobody else", async () => {
    expect(await code(service.leaveTeam(ids.jib, "sacre-coeur", "awa", "moussa"))).toBe("teamRemoveOccupantOnly");
    await service.leaveTeam(ids.awa, "sacre-coeur", "awa", "moussa");
    expect(await teamOf("awa")).toEqual([]);
    expect(await code(service.leaveTeam(ids.awa, "sacre-coeur", "awa", "moussa"))).toBe("notTeammate");
  });

  it("forgets the team when someone new moves into the room", async () => {
    // Awa's room is freed (by hand: nobody can leave a house yet), and Fatou moves in at an invitation.
    await db.update(rooms).set({ occupantId: null }).where(eq(rooms.name, "awa"));
    await db.delete(memberships).where(inArray(memberships.userId, [ids.awa]));
    await service.accept(ids.fatou, (await service.inviteToHouse(ids.jib, "fatou", "sacre-coeur", "awa")).id);
    expect(await teamOf("awa")).toEqual([]);
  });
});

describe("what a teammate may do with the room", () => {
  beforeEach(async () => {
    await service.accept(ids.moussa, (await invite("awa", "moussa")).id);
    as = "moussa";
  });

  it("opens the room page as a teammate, with the team on it", async () => {
    const page = await roomsController.manage("sacre-coeur", "awa", req);
    expect(page.as).toBe("teammate");
    expect(page.room.team.map((p) => p.login)).toEqual(["moussa"]);
  });

  it("changes where its code comes from, its secrets, deploys and restarts it, like its flatmate", async () => {
    await roomsController.settings("sacre-coeur", "awa", { source: "https://github.com/awa/ndaje.git", branch: "next" }, req);
    await roomsController.setSecret("sacre-coeur", "awa", "WAVE_KEY", { value: "wv_test" }, req);
    await roomsController.deploy("sacre-coeur", "awa", {}, req);
    await roomsController.restart("sacre-coeur", "awa", req);
    expect(sent.map((c) => c.type)).toEqual(["deploy", "restart_room"]);
  });

  it("only on that room, and not once they've left", async () => {
    // Moussa is on Awa's team, not Jib's.
    expect(await status(roomsController.manage("sacre-coeur", "jib", req))).toBe(403);
    await controller.leaveTeam("sacre-coeur", "awa", "moussa", req);
    expect(await status(roomsController.manage("sacre-coeur", "awa", req))).toBe(403);
  });
});

describe("the route", () => {
  it("needs a login, and a login or ask: true", async () => {
    expect(await status(controller.teamUp("sacre-coeur", "awa", { login: "moussa" }, req))).toBe(401);
    as = "awa";
    expect(await status(controller.teamUp("sacre-coeur", "awa", {}, req))).toBe(400);
    expect(await status(controller.teamUp("sacre-coeur", "awa", { ask: false }, req))).toBe(400);
    expect(await status(controller.teamUp("sacre-coeur", "awa", { login: "moussa" }, req))).toBe("ok");
    as = "jib";
    expect(await status(controller.teamUp("sacre-coeur", "awa", { ask: true }, req))).toBe("ok");
  });
});
