import "reflect-metadata";
import { type Db, memberships, notifications, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { MembershipsService } from "../auth/memberships.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { NotificationsController } from "./notifications.controller";
import { INVITES_PER_DAY, NotificationsService } from "./notifications.service";

let db: Db;
let houses: HousesService;
let doorbell: DoorbellService;
let service: NotificationsService;
let controller: NotificationsController;
let pushed: string[];
let as: string | null;
const ids: Record<string, string> = {};

// Someone new in town, with a real GitHub account (so not an example person), and no house.
async function newcomer(login: string, githubId: number) {
  const [u] = await db.insert(users).values({ login, name: login[0].toUpperCase() + login.slice(1), githubId }).returning();
  ids[login] = u.id;
}

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  service = new NotificationsService(db, houses, doorbell, { devLogin: false });
  pushed = [];
  service.pushes.subscribe((login) => pushed.push(login));
  as = null;
  const auth = {
    userFromRequest: async () => (as ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null : null),
  } as unknown as AuthService;
  controller = new NotificationsController(service, auth);
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 101);
  await newcomer("sam", 102);
  // Awa, of Sacré-Cœur, logged in with GitHub too: a real person who already has a house.
  await db.update(users).set({ githubId: 103 }).where(eq(users.id, ids.awa));
});

const req = { headers: {} };

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

const invite = (from = "jib", to = "fatou", house = "sacre-coeur", room?: string) => service.inviteToHouse(ids[from], to, house, room);

describe("inviting someone to your house", () => {
  it("puts the invitation under their bell, for the free room, and shows the sender it's waiting", async () => {
    const { id } = await invite();
    const bell = await service.list(ids.fatou);
    expect(bell.unread).toBe(1);
    expect(bell.items).toHaveLength(1);
    expect(bell.items[0]).toMatchObject({ id, kind: "house_invite", state: "open", room: "room-4", read: false, house: { id: "sacre-coeur", name: "Sacré-Cœur", city: "Dakar" } });
    expect(bell.items[0].from).toMatchObject({ login: "jib", github: false });
    expect((await service.list(ids.jib)).sent).toEqual([{ id, kind: "house_invite", to: "fatou", houseId: "sacre-coeur" }]);
    // The live line tells Fatou.
    expect(pushed).toEqual(["fatou"]);
  });

  it("lets any flatmate invite, not only the chef, but nobody from outside the house", async () => {
    expect(await status(invite("awa"))).toBe("ok");
    expect(await status(invite("sam", "fatou"))).toBe(403);
  });

  it("refuses yourself, a stranger's name, an example person and someone who already has a house", async () => {
    expect(await status(invite("jib", "jib"))).toBe(400);
    expect(await status(invite("jib", "nobody-here"))).toBe(404);
    // Koffi is a seeded flatmate of an example house; Ndeye lives in an example room of the workshop.
    expect(await status(invite("jib", "koffi"))).toBe(409);
    expect(await status(invite("jib", "ndeye"))).toBe(409);
    await expect(invite("jib", "awa")).rejects.toThrow(/already live in a house/);
  });

  it("treats someone without GitHub as an example person, unless the dev login is on", async () => {
    await db.insert(users).values({ login: "devy", name: "Devy" });
    await expect(invite("jib", "devy")).rejects.toThrow(/example person/);
    const dev = new NotificationsService(db, houses, doorbell, { devLogin: true });
    expect(await status(dev.inviteToHouse(ids.jib, "devy", "sacre-coeur"))).toBe("ok");
  });

  it("refuses an example house, the workshop, and a full house", async () => {
    await expect(invite("koffi", "fatou", "be-kpota")).rejects.toThrow(/example house/);
    // Someone real with a room in the workshop still can't invite people to it: it's practice.
    await db.insert(memberships).values({ houseId: "atelier", userId: ids.sam, role: "flatmate" });
    await expect(invite("sam", "fatou", "atelier")).rejects.toThrow(/workshop/);
    await db.update(rooms).set({ occupantId: ids.sam }).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    await expect(invite()).rejects.toThrow(/full/);
  });

  it("allows one open invitation per person, not again the day they said no, and only so many a day", async () => {
    const { id } = await invite();
    await expect(invite()).rejects.toThrow(/already invited/);
    await service.decline(ids.fatou, id);
    // Jib is told she said no.
    expect((await service.list(ids.jib)).items[0]).toMatchObject({ kind: "invite_declined", from: { login: "fatou" }, house: { id: "sacre-coeur" } });
    await expect(invite()).rejects.toThrow(/said no today/);
    // Another flatmate may still invite her: the brake is per pair.
    expect(await status(invite("awa"))).toBe("ok");

    for (let i = 0; i < INVITES_PER_DAY; i++) await newcomer(`guest${i}`, 200 + i);
    for (let i = 0; i < INVITES_PER_DAY - 1; i++) await invite("moussa", `guest${i}`);
    await invite("moussa", `guest${INVITES_PER_DAY - 1}`);
    expect(await status(invite("moussa", "sam"))).toBe(429);
  });
});

describe("answering a house invitation", () => {
  it("moves them in on yes: their room, the back of the tontine line, a note, and the sender hears", async () => {
    const { id } = await invite();
    const moved = await service.accept(ids.fatou, id);
    expect(moved).toEqual({ kind: "house_invite", house: { id: "sacre-coeur", name: "Sacré-Cœur", city: "Dakar" }, room: "room-4" });
    const room = await houses.room("sacre-coeur", "room-4");
    expect(room.occupantId).toBe(ids.fatou);
    const line = await db.select().from(memberships).where(eq(memberships.houseId, "sacre-coeur"));
    const fatou = line.find((m) => m.userId === ids.fatou)!;
    expect(fatou.role).toBe("flatmate");
    expect(fatou.tontinePosition).toBe(Math.max(...line.filter((m) => m.userId !== ids.fatou).map((m) => m.tontinePosition)) + 1);
    expect(await new MembershipsService(db).housesOf(ids.fatou)).toEqual([{ id: "sacre-coeur", name: "Sacré-Cœur", role: "flatmate", room: "room-4" }]);
    const notes = (await houses.view("sacre-coeur", ids.jib))!.notes!.map((n) => n.text);
    expect(notes).toContain("Fatou moved in. Welcome home!");
    expect((await service.list(ids.fatou)).items[0].state).toBe("accepted");
    const jibs = await service.list(ids.jib);
    expect(jibs.items[0]).toMatchObject({ kind: "invite_accepted", from: { login: "fatou" }, room: "room-4" });
    expect(jibs.sent).toEqual([]);
  });

  it("invites a newcomer who only has a room in the workshop, and once they moved in, not again", async () => {
    // Fatou is doing the quest: a room of her own in the workshop, which isn't a house.
    await db.insert(memberships).values({ houseId: "atelier", userId: ids.fatou, role: "flatmate" });
    await db.insert(rooms).values({ houseId: "atelier", name: "fatou-home", memoryMb: 128, cpus: 0.5, occupantId: ids.fatou });
    const { id } = await invite();
    const moved = await service.accept(ids.fatou, id);
    expect(moved).toMatchObject({ house: { id: "sacre-coeur" }, room: "room-4" });
    // Now she has a house: nobody can invite her to another.
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "room-5", memoryMb: 128, cpus: 0.5 });
    await expect(invite("awa", "fatou", "sacre-coeur", "room-5")).rejects.toThrow(/already live in a house/);
  });

  it("offers the room the sender picked, when the house has several free", async () => {
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "room-5", memoryMb: 128, cpus: 0.5 });
    const { id } = await invite("jib", "fatou", "sacre-coeur", "room-5");
    expect((await service.list(ids.fatou)).items[0]).toMatchObject({ id, room: "room-5" });
    expect(await service.accept(ids.fatou, id)).toMatchObject({ room: "room-5" });
  });

  it("closes other knocks on that room and their own knock, and lapses their other invitations", async () => {
    await doorbell.knock("sacre-coeur", "room-4", ids.sam, { message: "I'd host a bot." });
    // A second free room, so Fatou can knock on one and be invited to the other.
    await db.insert(rooms).values({ houseId: "sacre-coeur", name: "room-5", memoryMb: 128, cpus: 0.5 });
    await doorbell.knock("sacre-coeur", "room-5", ids.fatou, { message: "Me too." });
    const { id } = await invite("jib", "fatou", "sacre-coeur", "room-4");
    const other = await db
      .insert(notifications)
      .values({ userId: ids.fatou, kind: "house_invite", fromId: ids.koffi, houseId: "be-kpota", room: "room-9", state: "open" })
      .returning();
    await service.accept(ids.fatou, id);
    const view = await houses.view("sacre-coeur", ids.jib);
    expect(view!.doorbell).toEqual([]);
    const [lapsed] = await db.select().from(notifications).where(eq(notifications.id, other[0].id));
    expect(lapsed.state).toBe("expired");
    // Sam hears that someone else moved in.
    expect((await service.list(ids.sam)).items[0]).toMatchObject({ kind: "knock_answer", verdict: "declined" });
  });

  it("expires the invitation, and says so, when the room was taken meanwhile", async () => {
    const { id } = await invite();
    await db.update(rooms).set({ occupantId: ids.sam }).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "room-4")));
    await expect(service.accept(ids.fatou, id)).rejects.toThrow(/took that room first/);
    expect((await service.list(ids.fatou)).items[0].state).toBe("expired");
    await expect(service.accept(ids.fatou, id)).rejects.toThrow(/already been answered/);
  });

  it("expires when they found a house meanwhile, or when the sender moved out", async () => {
    const a = await invite("jib");
    const b = await invite("awa");
    await db.delete(memberships).where(and(eq(memberships.houseId, "sacre-coeur"), eq(memberships.userId, ids.awa)));
    await expect(service.accept(ids.fatou, b.id)).rejects.toThrow(/don't live there/);
    await db.insert(memberships).values({ houseId: "be-kpota", userId: ids.fatou });
    await expect(service.accept(ids.fatou, a.id)).rejects.toThrow(/already live in a house/);
  });

  it("lets only the recipient answer, and only the sender take it back", async () => {
    const { id } = await invite();
    expect(await status(service.accept(ids.jib, id))).toBe(404);
    expect(await status(service.decline(ids.sam, id))).toBe(404);
    expect(await status(service.withdraw(ids.fatou, id))).toBe(404);
    expect(await status(service.withdraw(ids.awa, id))).toBe(404);
    await service.withdraw(ids.jib, id);
    await expect(service.accept(ids.fatou, id)).rejects.toThrow(/took this invitation back/);
    expect(await status(service.withdraw(ids.jib, id))).toBe(409);
  });

  it("lapses after a week unanswered", async () => {
    const { id } = await invite();
    await db.update(notifications).set({ createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) }).where(eq(notifications.id, id));
    expect((await service.list(ids.fatou)).items[0].state).toBe("expired");
    expect((await service.list(ids.jib)).sent).toEqual([]);
    expect(await status(service.accept(ids.fatou, id))).toBe(409);
  });
});

describe("renting together", () => {
  it("asks someone with no house; yes tells the sender", async () => {
    const { id } = await service.rentTogether(ids.fatou, "sam");
    expect((await service.list(ids.sam)).items[0]).toMatchObject({ kind: "rent_together", state: "open", from: { login: "fatou", github: true }, house: null });
    expect(await service.accept(ids.sam, id)).toEqual({ kind: "rent_together", house: null, room: null });
    expect((await service.list(ids.fatou)).items[0]).toMatchObject({ kind: "rent_together_yes", from: { login: "sam" }, state: null });
  });

  it("refuses when either of them already has a house, and double asks", async () => {
    await expect(service.rentTogether(ids.jib, "fatou")).rejects.toThrow(/Invite them to it/);
    await expect(service.rentTogether(ids.fatou, "awa")).rejects.toThrow(/Knock on theirs/);
    await expect(service.rentTogether(ids.fatou, "koffi")).rejects.toThrow(/example person/);
    await service.rentTogether(ids.fatou, "sam");
    await expect(service.rentTogether(ids.fatou, "sam")).rejects.toThrow(/already invited/);
  });
});

describe("the doorbell's news", () => {
  it("tells the house about a knock, and the applicant about the answer", async () => {
    const { id } = await doorbell.knock("sacre-coeur", "room-4", ids.fatou, { message: "Mobile dev from Lomé." });
    for (const who of ["jib", "awa", "moussa"]) expect((await service.list(ids[who])).items[0]).toMatchObject({ kind: "knock", from: { login: "fatou" }, applicationId: id, room: "room-4" });
    expect((await service.list(ids.fatou)).items).toEqual([]);
    for (const who of ["jib", "awa"]) await doorbell.vote(id, ids[who], true);
    expect((await service.list(ids.fatou)).items[0]).toMatchObject({ kind: "knock_answer", verdict: "admitted", applicationId: id, house: { id: "sacre-coeur" } });
  });

  it("has nothing to accept on news", async () => {
    await doorbell.knock("sacre-coeur", "room-4", ids.fatou, { message: "Hi." });
    const [n] = (await service.list(ids.jib)).items;
    await expect(service.accept(ids.jib, n.id)).rejects.toThrow(/nothing to answer/);
  });
});

describe("reading", () => {
  it("marks your own as read, never someone else's", async () => {
    const a = await invite();
    await service.rentTogether(ids.sam, "fatou");
    await service.markRead(ids.jib, [a.id]);
    expect((await service.list(ids.fatou)).unread).toBe(2);
    await service.markRead(ids.fatou, [a.id]);
    expect((await service.list(ids.fatou)).unread).toBe(1);
    await service.markRead(ids.fatou);
    expect((await service.list(ids.fatou)).unread).toBe(0);
  });
});

describe("the routes", () => {
  it("need you logged in, and check what's sent", async () => {
    expect(await status(controller.list(req))).toBe(401);
    expect(await status(controller.inviteToHouse({ to: "fatou", house: "sacre-coeur" }, req))).toBe(401);
    as = "jib";
    expect(await status(controller.inviteToHouse({ house: "sacre-coeur" }, req))).toBe(400);
    expect(await status(controller.inviteToHouse({ to: "fatou", house: "sacre-coeur", room: "Not A Room!" }, req))).toBe(400);
    expect(await status(controller.read({ ids: ["nope"] }, req))).toBe(400);
    const { id } = await controller.inviteToHouse({ to: "fatou", house: "sacre-coeur" }, req);
    as = "fatou";
    expect((await controller.list(req)).unread).toBe(1);
    expect(await status(controller.accept("not-an-id", req))).toBe(404);
    expect(await controller.accept(id, req)).toMatchObject({ room: "room-4" });
  });
});
