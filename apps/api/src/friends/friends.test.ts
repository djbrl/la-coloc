// Friends: asking (from a card or by login), answering under the bell, removing, blocks, and the list with statuses.
import "reflect-metadata";
import { blocks, type Db, friendships, notifications, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { Subject } from "rxjs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ChatService } from "../chat/chat.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import type { LobbyGateway } from "../lobby/lobby.gateway";
import { Presence } from "../lobby/presence";
import { NotificationsService } from "../notifications/notifications.service";
import { SafetyService } from "../safety/safety.service";
import { seedCity } from "../seed/city";
import { FriendsService } from "./friends.service";

let db: Db;
let service: NotificationsService;
let friends: FriendsService;
let chat: ChatService;
let presence: Presence;
let statusChanges: Subject<string[]>;
// Every one-word message the live line would send: "fatou:friends".
let told: string[];
let pushed: string[];
const ids: Record<string, string> = {};

async function newcomer(login: string, githubId: number) {
  const [u] = await db.insert(users).values({ login, name: login[0].toUpperCase() + login.slice(1), githubId }).returning();
  ids[login] = u.id;
}

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  const houses = new HousesService(db);
  service = new NotificationsService(db, houses, new DoorbellService(db, houses), { devLogin: false });
  pushed = [];
  service.pushes.subscribe((login) => pushed.push(login));
  chat = new ChatService(db, houses, service);
  presence = new Presence();
  statusChanges = new Subject();
  told = [];
  const lobby = { presence, statusChanges, notice: (login: string, type = "notice") => told.push(`${login}:${type}`) } as unknown as LobbyGateway;
  friends = new FriendsService(db, lobby);
  friends.onModuleInit();
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 201);
  await newcomer("sam", 202);
  await newcomer("kofi", 203);
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

const ask = (from: string, to: string) => service.askFriend(ids[from], to);
// Blocking is the safety service's (safety/safety.service.ts).
const safetyOf = () => new SafetyService(db, new HousesService(db), service, { admins: [] });
const logins = async (who: string) => (await friends.list(ids[who])).friends.map((f) => f.login).sort();
// Lets the async subscriber of statusChanges finish its queries.
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("asking someone to be friends", () => {
  it("puts the request under their bell and at the top of their list, and shows the sender it's waiting", async () => {
    const { id, friends: now } = await ask("fatou", "sam");
    expect(now).toBe(false);
    const bell = await service.list(ids.sam);
    expect(bell.items[0]).toMatchObject({ id, kind: "friend_request", state: "open", from: { login: "fatou" } });
    expect(pushed).toEqual(["sam"]);
    expect((await friends.list(ids.sam)).requests).toEqual([{ id, from: expect.objectContaining({ login: "fatou" }), createdAt: expect.any(String) }]);
    expect((await friends.list(ids.fatou)).sent).toEqual([{ id, to: expect.objectContaining({ login: "sam" }) }]);
    expect((await service.list(ids.fatou)).sent).toEqual([{ id, kind: "friend_request", to: "sam", houseId: null }]);
    expect(await logins("sam")).toEqual([]);
  });

  it("makes them friends when accepted, both ways, and tells the sender", async () => {
    const { id } = await ask("fatou", "sam");
    pushed = [];
    expect(await service.accept(ids.sam, id)).toEqual({ kind: "friend_request", house: null, room: null });
    expect(await logins("sam")).toEqual(["fatou"]);
    expect(await logins("fatou")).toEqual(["sam"]);
    const news = await service.list(ids.fatou);
    expect(news.items[0]).toMatchObject({ kind: "friend_accepted", from: { login: "sam" }, state: null });
    expect(pushed).toEqual(["fatou"]);
    expect((await friends.list(ids.sam)).requests).toEqual([]);
    // A second click finds it answered.
    expect(await status(service.accept(ids.sam, id))).toBe(409);
  });

  it("declines quietly: no friendship, nothing sent back, and no asking again the same day", async () => {
    const { id } = await ask("fatou", "sam");
    pushed = [];
    await service.decline(ids.sam, id);
    expect(await logins("sam")).toEqual([]);
    expect(pushed).toEqual([]);
    expect((await service.list(ids.fatou)).items).toEqual([]);
    await expect(ask("fatou", "sam")).rejects.toThrow("They said no today.");
  });

  it("refuses a second request while the first waits, and someone who's a friend already", async () => {
    const { id } = await ask("fatou", "sam");
    await expect(ask("fatou", "sam")).rejects.toThrow("You've already invited them.");
    await service.accept(ids.sam, id);
    await expect(ask("fatou", "sam")).rejects.toThrow("You're friends already.");
    await expect(ask("sam", "fatou")).rejects.toThrow("You're friends already.");
  });

  it("asking someone who already asked you is a yes", async () => {
    const { id } = await ask("fatou", "sam");
    expect(await ask("sam", "fatou")).toEqual({ id, friends: true });
    expect(await logins("fatou")).toEqual(["sam"]);
    const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
    expect(n.state).toBe("accepted");
  });

  it("refuses yourself, nobody, and an example person", async () => {
    expect(await status(ask("fatou", "fatou"))).toBe(400);
    expect(await status(ask("fatou", "nobody-here"))).toBe(404);
    // Jib is seeded: no GitHub account, and the dev login is off.
    await expect(ask("fatou", "jib")).rejects.toThrow("This is an example person");
    expect(await db.select().from(notifications).where(eq(notifications.kind, "friend_request"))).toEqual([]);
  });

  it("can be taken back by the sender while it waits", async () => {
    const { id } = await ask("fatou", "sam");
    await service.withdraw(ids.fatou, id);
    expect((await friends.list(ids.sam)).requests).toEqual([]);
    expect(await status(service.accept(ids.sam, id))).toBe(409);
  });
});

describe("friends and blocks", () => {
  it("no request to or from someone who blocked you, or whom you blocked", async () => {
    await db.insert(blocks).values({ blockerId: ids.sam, blockedId: ids.fatou });
    await expect(ask("fatou", "sam")).rejects.toThrow("They aren't taking invitations from you.");
    await expect(ask("sam", "fatou")).rejects.toThrow("You blocked them.");
  });

  it("a block after the request makes it lapse", async () => {
    const { id } = await ask("fatou", "sam");
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.sam });
    await expect(service.accept(ids.sam, id)).rejects.toThrow("That friend request lapsed.");
    expect(await logins("sam")).toEqual([]);
  });

  it("blocking a friend ends the friendship, and a waiting request", async () => {
    await service.accept(ids.sam, (await ask("fatou", "sam")).id);
    const { id } = await ask("kofi", "fatou");
    await safetyOf().block(ids.fatou, "sam");
    await safetyOf().block(ids.fatou, "kofi");
    expect(await logins("fatou")).toEqual([]);
    expect(await logins("sam")).toEqual([]);
    const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
    expect(n.state).toBe("expired");
    // Unblocking doesn't bring it back.
    await safetyOf().unblock(ids.fatou, "sam");
    expect(await logins("fatou")).toEqual([]);
  });
});

describe("removing a friend", () => {
  it("works from either side, and the other's list updates", async () => {
    await service.accept(ids.sam, (await ask("fatou", "sam")).id);
    await service.accept(ids.kofi, (await ask("fatou", "kofi")).id);
    await friends.remove(ids.sam, "fatou");
    expect(told).toEqual(["fatou:friends"]);
    await friends.remove(ids.fatou, "kofi");
    expect(await logins("fatou")).toEqual([]);
    expect(await logins("kofi")).toEqual([]);
    expect(await db.select().from(friendships)).toEqual([]);
  });

  it("refuses someone who isn't a friend", async () => {
    expect(await status(friends.remove(ids.fatou, "sam"))).toBe(404);
    expect(await status(friends.remove(ids.fatou, "nobody-here"))).toBe(404);
  });

  it("can be asked again afterwards", async () => {
    await service.accept(ids.sam, (await ask("fatou", "sam")).id);
    await friends.remove(ids.fatou, "sam");
    expect((await ask("sam", "fatou")).friends).toBe(false);
  });
});

describe("the list's statuses", () => {
  const viewer = (login: string) => ({ login, name: login, avatar: null });

  beforeEach(async () => {
    await service.accept(ids.sam, (await ask("fatou", "sam")).id);
    await service.accept(ids.kofi, (await ask("fatou", "kofi")).id);
  });

  it("says who's online and where, who's idle or away, and who's offline", async () => {
    presence.join("s1", viewer("sam"));
    presence.receive("s1", { type: "place", place: "Dakar" });
    presence.join("k1", viewer("kofi"));
    presence.receive("k1", { type: "place", place: "Lomé" });
    presence.receive("k1", { type: "status", status: "idle" });
    const list = await friends.list(ids.fatou);
    const by = Object.fromEntries(list.friends.map((f) => [f.login, { status: f.status, city: f.city }]));
    expect(by).toEqual({ sam: { status: "online", city: "Dakar" }, kofi: { status: "idle", city: "Lomé" } });
    presence.receive("k1", { type: "status", status: "away" });
    presence.leave("s1");
    const after = Object.fromEntries((await friends.list(ids.fatou)).friends.map((f) => [f.login, { status: f.status, city: f.city }]));
    expect(after).toEqual({ sam: { status: "offline", city: null }, kofi: { status: "away", city: "Lomé" } });
  });

  it("tells a friend who's online when someone's status changes, and nobody else", async () => {
    presence.join("f1", viewer("fatou"));
    presence.join("w1", viewer("awa"));
    statusChanges.next(["sam"]);
    await settle();
    expect(told).toEqual(["fatou:friends"]);
    // Nobody else connected: nothing to tell.
    told = [];
    presence.leave("f1");
    presence.leave("w1");
    statusChanges.next(["sam"]);
    await settle();
    expect(told).toEqual([]);
  });

  it("still lists friends when they're simply offline", async () => {
    expect((await friends.list(ids.fatou)).friends.map((f) => ({ status: f.status, city: f.city }))).toEqual([
      { status: "offline", city: null },
      { status: "offline", city: null },
    ]);
  });
});
