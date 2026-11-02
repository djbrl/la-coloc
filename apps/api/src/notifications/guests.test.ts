// A full house's group chat: someone from outside asks, a flatmate answers under the bell, and a guest then reads and
// writes the house's channel, and nothing else of the house.
import "reflect-metadata";
import { type Db, houseGuests, houses as housesTable, memberships, messages, repos, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatService } from "../chat/chat.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { guestStanding, GUEST_ASK_MS, GUEST_NO_MS } from "../houses/guests";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { NotificationsService } from "./notifications.service";

let db: Db;
let houses: HousesService;
let doorbell: DoorbellService;
let service: NotificationsService;
const ids: Record<string, string> = {};
const HOUSE = "sacre-coeur";

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  service = new NotificationsService(db, houses, doorbell, { devLogin: false });
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  for (const [login, githubId] of [["jib", 201], ["awa", 202], ["moussa", 203]] as const) await db.update(users).set({ githubId }).where(eq(users.id, ids[login]));
  const [fatou] = await db.insert(users).values({ login: "fatou", name: "Fatou", githubId: 204 }).returning();
  ids.fatou = fatou.id;
  await fillHouse();
});

// Sacré-Cœur with no free room left: a seeded flatmate moves into each.
async function fillHouse() {
  const free = await db.select().from(rooms).where(and(eq(rooms.houseId, HOUSE), isNull(rooms.occupantId)));
  for (const r of free) {
    const [u] = await db.insert(users).values({ login: `f-${r.name}`, name: r.name, githubId: 900 + free.indexOf(r) }).returning();
    ids[u.login] = u.id;
    await db.insert(memberships).values({ houseId: HOUSE, userId: u.id, role: "flatmate" });
    await db.update(rooms).set({ occupantId: u.id }).where(eq(rooms.id, r.id));
  }
}

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    if (e instanceof HttpException) return (e.getResponse() as { code?: string }).code;
    throw e;
  }
}

async function theAsk(login: string) {
  return (await service.list(ids[login])).items.find((n) => n.kind === "guest_ask")!;
}

describe("asking to join a full house's chat", () => {
  it("tells every flatmate, and says so in the house view", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    expect((await theAsk("jib")).state).toBe("open");
    expect((await theAsk("awa")).from?.login).toBe("fatou");
    const view = await houses.view(HOUSE, ids.fatou);
    expect(view?.viewer?.guest).toBe("open");
    expect(view?.channel).toBeNull();
  });

  it("leaves your asks out of the invitations you sent", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    expect((await service.list(ids.fatou)).sent).toEqual([]);
  });

  it("refuses a flatmate, a second ask, a house with a free room, and the workshop", async () => {
    expect(await code(service.askToChat(ids.jib, HOUSE))).toBe("guestLivesHere");
    await service.askToChat(ids.fatou, HOUSE);
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBe("guestAlreadyAsked");
    await db.update(rooms).set({ occupantId: null }).where(and(eq(rooms.houseId, HOUSE), eq(rooms.occupantId, ids.awa)));
    await db.delete(houseGuests);
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBe("guestRoomFree");
    await db.update(housesTable).set({ tutorial: true }).where(eq(housesTable.id, HOUSE));
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBe("guestExampleHouse");
  });

  it("lets you straight in at a full example house, with a word from its host and nothing under anyone's bell", async () => {
    await db.update(housesTable).set({ demo: true }).where(eq(housesTable.id, HOUSE));
    expect(await service.askToChat(ids.fatou, HOUSE)).toEqual({ status: "accepted" });
    expect((await houses.view(HOUSE, ids.fatou))?.viewer?.guest).toBe("accepted");
    const said = await db.select().from(messages).where(eq(messages.channel, `house:${HOUSE}`));
    expect(said.at(-1)?.body).toMatch(/^Come in, /);
    expect((await service.list(ids.jib)).items.filter((n) => n.kind === "guest_ask")).toEqual([]);
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBe("guestAlreadyIn");
  });
});

describe("a flatmate answering", () => {
  it("lets the guest read and write the channel, and nothing else of the house", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    await service.accept(ids.jib, (await theAsk("jib")).id);
    await doorbell.postToHouse(HOUSE, ids.fatou, "Hello from outside");
    const view = await houses.view(HOUSE, ids.fatou);
    expect(view?.viewer).toMatchObject({ guest: "accepted", member: false });
    expect(view?.channel?.at(-1)?.body).toBe("Hello from outside");
    expect(view?.guests?.map((g) => g.login)).toEqual(["fatou"]);
    expect(view?.notes).toBeNull();
    expect(view?.doorbell).toBeNull();
    expect(view?.bill).toBeNull();
    expect((await service.list(ids.fatou)).items[0]).toMatchObject({ kind: "guest_accepted", house: { id: HOUSE } });
    // The flatmates' view keeps them apart from the crew.
    expect((await houses.view(HOUSE, ids.jib))?.guests?.map((g) => g.login)).toEqual(["fatou"]);
  });

  it("counts the first answer for every flatmate", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    const awas = await theAsk("awa");
    await service.decline(ids.jib, (await theAsk("jib")).id);
    expect((await theAsk("awa")).state).toBe("declined");
    expect(await code(service.accept(ids.awa, awas.id))).toBe("inviteAnswered");
    expect((await houses.view(HOUSE, ids.fatou))?.viewer?.guest).toBe("declined");
    expect((await service.list(ids.fatou)).items[0].kind).toBe("guest_declined");
  });

  it("keeps someone turned down out of the chat, and from asking again today", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    await service.decline(ids.jib, (await theAsk("jib")).id);
    expect(await code(doorbell.postToHouse(HOUSE, ids.fatou, "Hello"))).toBe("flatmatesOnlyTalk");
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBe("saidNoToday");
  });

  it("refuses someone who has moved out meanwhile", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    const ask = await theAsk("awa");
    await db.delete(memberships).where(and(eq(memberships.houseId, HOUSE), eq(memberships.userId, ids.awa)));
    expect(await code(service.accept(ids.awa, ask.id))).toBe("guestLeftHouse");
  });
});

describe("leaving the chat", () => {
  beforeEach(async () => {
    await service.askToChat(ids.fatou, HOUSE);
    await service.accept(ids.jib, (await theAsk("jib")).id);
  });

  it("lets a guest leave, and ask again", async () => {
    await service.removeGuest(ids.fatou, HOUSE, "fatou");
    expect((await houses.view(HOUSE, ids.fatou))?.channel).toBeNull();
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBeUndefined();
  });

  it("lets a flatmate take them out, for the day", async () => {
    await service.removeGuest(ids.awa, HOUSE, "fatou");
    expect(await code(doorbell.postToHouse(HOUSE, ids.fatou, "Hello"))).toBe("flatmatesOnlyTalk");
    expect(await code(service.askToChat(ids.fatou, HOUSE))).toBe("saidNoToday");
  });

  it("refuses anyone else", async () => {
    const [kofi] = await db.insert(users).values({ login: "kofi", githubId: 205 }).returning();
    expect(await code(service.removeGuest(kofi.id, HOUSE, "fatou"))).toBe("guestFlatmatesOnly");
  });
});

describe("reading a guest's channel through the chat service", () => {
  it("opens the house's channel to a guest only", async () => {
    const chat = new ChatService(db, houses, service) as unknown as { canRead(channel: string, userId: string): Promise<boolean> };
    await service.askToChat(ids.fatou, HOUSE);
    expect(await chat.canRead(`house:${HOUSE}`, ids.fatou)).toBe(false);
    await service.accept(ids.jib, (await theAsk("jib")).id);
    expect(await chat.canRead(`house:${HOUSE}`, ids.fatou)).toBe(true);
  });
});

describe("where someone stands", () => {
  const long = new Date(0);
  it("forgets an ask nobody answered for a week, and a no after a day", () => {
    const now = Date.now();
    expect(guestStanding(undefined)).toBeNull();
    expect(guestStanding({ status: "open", askedAt: new Date(now - GUEST_ASK_MS + 1000), decidedAt: null }, now)).toBe("open");
    expect(guestStanding({ status: "open", askedAt: long, decidedAt: null }, now)).toBeNull();
    expect(guestStanding({ status: "declined", askedAt: long, decidedAt: new Date(now - GUEST_NO_MS + 1000) }, now)).toBe("declined");
    expect(guestStanding({ status: "declined", askedAt: long, decidedAt: long }, now)).toBeNull();
    expect(guestStanding({ status: "accepted", askedAt: long, decidedAt: long }, now)).toBe("accepted");
  });
});

describe("a room's repository in the house view", () => {
  it("goes to flatmates only, since a linked repo may be private", async () => {
    await db.insert(repos).values({ githubId: 1, fullName: "awa/shop", houseId: HOUSE, room: (await houses.view(HOUSE, ids.jib))!.rooms.find((r) => r.occupant?.login === "awa")!.name, installationId: 1 });
    const repoOf = (v: Awaited<ReturnType<HousesService["view"]>>) => v!.rooms.find((r) => r.occupant?.login === "awa")!.repo;
    expect(repoOf(await houses.view(HOUSE, ids.jib))).toBe("https://github.com/awa/shop");
    expect(repoOf(await houses.view(HOUSE, ids.fatou))).toBeNull();
    expect(repoOf(await houses.view(HOUSE, null))).toBeNull();
  });
});

// Asks go with the house: the demo's reset pulls every house down and the rows follow.
describe("pulling a house down", () => {
  it("takes its guests with it", async () => {
    await service.askToChat(ids.fatou, HOUSE);
    await db.delete(housesTable).where(eq(housesTable.id, HOUSE));
    expect(await db.select().from(houseGuests)).toEqual([]);
  });
});
