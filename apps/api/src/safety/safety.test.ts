// Blocking, muting and reporting, on a real in-memory database: what each one stops (direct messages, friend requests,
// the bell, unread counts), what it leaves alone (a muted person's words still show), and the admins hearing of reports.
import "reflect-metadata";
import { type Db, notifications, reports, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthConfig } from "../auth/auth.config";
import type { AuthService } from "../auth/auth.service";
import { BoardService } from "../chat/board.service";
import { ChatService } from "../chat/chat.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { NotificationsService } from "../notifications/notifications.service";
import { seedCity } from "../seed/city";
import { isGroupChannel } from "./mutes";
import { SafetyController } from "./safety.controller";
import { SafetyService } from "./safety.service";

let db: Db;
let bell: NotificationsService;
let chat: ChatService;
let board: BoardService;
let safety: SafetyService;
let controller: SafetyController;
let rang: string[];
let as: string | null;
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
  bell = new NotificationsService(db, houses, new DoorbellService(db, houses), { devLogin: false });
  rang = [];
  bell.pushes.subscribe((login) => rang.push(login));
  chat = new ChatService(db, houses, bell);
  board = new BoardService(db, chat);
  const auth = {
    userFromRequest: async () => (as ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null : null),
    config: loadAuthConfig({ COLOC_ADMINS: "Admin,boss" }),
  } as unknown as AuthService;
  safety = new SafetyService(db, houses, bell, auth.config);
  controller = new SafetyController(safety, auth);
  as = null;
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 301);
  await newcomer("sam", 302);
  await newcomer("admin", 303);
  await newcomer("boss", 304);
  // Awa of Sacré-Cœur logged in with GitHub: a real flatmate.
  await db.update(users).set({ githubId: 305 }).where(eq(users.id, ids.awa));
});

const req = { headers: {} };

async function status(p: Promise<unknown>): Promise<number | "ok"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    if (e instanceof HttpException) return e.getStatus();
    throw e;
  }
}

// What someone's bell holds, as "kind:from".
const bellOf = async (login: string) => (await bell.list(ids[login])).items.map((n) => `${n.kind}:${n.from?.login ?? ""}`);

describe("blocking", () => {
  it("stops direct messages and friend requests both ways, and hides their words from the blocker", async () => {
    await chat.sendDm(ids.fatou, "sam", "hi");
    await chat.postToCity("Dakar", ids.fatou, "Bonjour Dakar");
    await safety.block(ids.sam, "fatou");
    expect(await status(chat.sendDm(ids.fatou, "sam", "hello?"))).toBe(403);
    expect(await status(chat.sendDm(ids.sam, "fatou", "bye"))).toBe(403);
    expect(await status(bell.askFriend(ids.fatou, "sam"))).toBe(403);
    expect(await status(bell.askFriend(ids.sam, "fatou"))).toBe(403);
    expect((await chat.cityChat("Dakar", ids.sam)).messages).toEqual([]);
    expect((await chat.cityChat("Dakar", ids.awa)).messages).toHaveLength(1);
    expect((await chat.conversations(ids.sam)).items).toEqual([]);
    // "@sam" from someone Sam blocked rings nothing.
    await chat.postToCity("Dakar", ids.fatou, "@sam t'es là ?");
    expect(await bellOf("sam")).toEqual([]);
    expect((await safety.view(ids.sam)).blocked.map((p) => p.login)).toEqual(["fatou"]);
  });
});

describe("muting someone", () => {
  it("keeps their messages but drops the unread count and the dot", async () => {
    await safety.mute(ids.sam, { login: "fatou" });
    await chat.sendDm(ids.fatou, "sam", "coucou");
    const list = await chat.conversations(ids.sam);
    expect(list.unread).toBe(0);
    expect(list.items).toEqual([expect.objectContaining({ unread: 0, muted: true, last: expect.objectContaining({ body: "coucou" }) })]);
    expect(await chat.conversation(ids.sam, "fatou")).toMatchObject({ muted: true, canWrite: true, messages: [expect.objectContaining({ body: "coucou" })] });
    // Unmuted, the next one counts again.
    await safety.unmute(ids.sam, { login: "fatou" });
    await chat.sendDm(ids.fatou, "sam", "tu es là ?");
    expect((await chat.conversations(ids.sam)).unread).toBe(1);
  });

  it("rings no bell: no mention, and a friend request arrives already read", async () => {
    await safety.mute(ids.sam, { login: "fatou" });
    rang = [];
    await chat.postToCity("Dakar", ids.fatou, "@sam on code ce soir ?");
    expect(await bellOf("sam")).toEqual([]);
    const { id } = await bell.askFriend(ids.fatou, "sam");
    expect(rang).not.toContain("sam");
    const view = await bell.list(ids.sam);
    expect(view.unread).toBe(0);
    expect(view.items).toEqual([expect.objectContaining({ id, kind: "friend_request", state: "open", read: true })]);
    // Still answerable.
    expect(await status(bell.accept(ids.sam, id))).toBe("ok");
    // Someone else's mention still rings.
    await chat.postToCity("Dakar", ids.awa, "@sam bienvenue");
    expect(await bellOf("sam")).toContain("mention:awa");
  });

  it("leaves their words out of a city's unread count, and shows them in the room", async () => {
    await safety.mute(ids.sam, { login: "fatou" });
    await chat.postToCity("Dakar", ids.fatou, "Bonjour");
    await board.create("Dakar", ids.fatou, { tag: "help", title: "Docker?", body: "Help" });
    expect(await chat.cityUnread("Dakar", ids.sam)).toEqual({ chat: 0, board: 0 });
    expect((await chat.cityChat("Dakar", ids.sam)).messages.map((m) => m.body)).toEqual(["Bonjour"]);
    await chat.postToCity("Dakar", ids.awa, "Salut");
    expect((await chat.cityUnread("Dakar", ids.sam)).chat).toBe(1);
  });

  it("refuses yourself and nobody, and twice is fine", async () => {
    expect(await status(safety.mute(ids.sam, { login: "sam" }))).toBe(400);
    expect(await status(safety.mute(ids.sam, { login: "nobody-here" }))).toBe(404);
    await safety.mute(ids.sam, { login: "fatou" });
    await safety.mute(ids.sam, { login: "fatou" });
    expect((await safety.view(ids.sam)).muted.map((p) => p.login)).toEqual(["fatou"]);
  });
});

describe("muting a group chat", () => {
  it("quiets a city's room: no unread count, no mention from there; other cities still ring", async () => {
    await safety.mute(ids.sam, { channel: "city:Dakar" });
    await chat.postToCity("Dakar", ids.fatou, "@sam ici");
    expect(await chat.cityUnread("Dakar", ids.sam)).toEqual({ chat: 0, board: 0 });
    expect(await bellOf("sam")).toEqual([]);
    // The messages are still there.
    expect((await chat.cityChat("Dakar", ids.sam)).messages).toHaveLength(1);
    await chat.postToCity("Lomé", ids.fatou, "@sam et ici");
    expect(await bellOf("sam")).toEqual(["mention:fatou"]);
    expect((await safety.view(ids.sam)).groups).toEqual([{ channel: "city:Dakar", place: "city", name: "Dakar" }]);
    await safety.unmute(ids.sam, { channel: "city:Dakar" });
    expect((await chat.cityUnread("Dakar", ids.sam)).chat).toBe(1);
  });

  it("mutes a house's living room only for someone who lives there, and names it", async () => {
    expect(await status(safety.mute(ids.fatou, { channel: "house:sacre-coeur" }))).toBe(404);
    await safety.mute(ids.awa, { channel: "house:sacre-coeur" });
    const [group] = (await safety.view(ids.awa)).groups;
    expect(group).toMatchObject({ channel: "house:sacre-coeur", place: "house" });
    expect(group.name).not.toBe("sacre-coeur");
  });

  it("knows which channels are group chats", () => {
    expect(isGroupChannel("city:Dakar")).toBe(true);
    expect(isGroupChannel("arena:Lomé")).toBe(true);
    expect(isGroupChannel("house:sacre-coeur")).toBe(true);
    expect(isGroupChannel("house:atelier/0b0e5b8e-2a3c-4c55-9b61-3f1c8d0c9a11")).toBe(true);
    expect(isGroupChannel("dm:a:b")).toBe(false);
    expect(isGroupChannel("post:0b0e5b8e-2a3c-4c55-9b61-3f1c8d0c9a11")).toBe(false);
    expect(isGroupChannel("city:")).toBe(false);
  });
});

describe("reporting", () => {
  it("a person: kept for the admins, and each admin hears of it once", async () => {
    as = "sam";
    expect(await status(controller.report({ kind: "person", id: "fatou", reason: "spam" }, req))).toBe("ok");
    expect(await status(controller.report({ kind: "person", id: "@fatou" }, req))).toBe("ok");
    expect(await db.select().from(reports)).toHaveLength(1);
    for (const admin of ["admin", "boss"]) {
      const { items } = await bell.list(ids[admin]);
      expect(items).toEqual([expect.objectContaining({ kind: "report", from: expect.objectContaining({ login: "sam" }), report: { kind: "person", about: "fatou", excerpt: "@fatou" } })]);
    }
    expect(await bellOf("fatou")).toEqual([]);
    expect(await status(controller.report({ kind: "person", id: "sam" }, req))).toBe(400);
    expect(await status(controller.report({ kind: "person", id: "nobody-here" }, req))).toBe(404);
  });

  it("a message, with its words, and not the admin who reported it", async () => {
    const { id } = await chat.postToCity("Dakar", ids.fatou, "something rude");
    await safety.report(ids.admin, { kind: "message", id });
    expect(await bellOf("admin")).toEqual([]);
    expect((await bell.list(ids.boss)).items[0]).toMatchObject({ kind: "report", report: { kind: "message", about: "fatou", excerpt: "something rude" } });
  });

  it("a group chat you can read, with its last lines", async () => {
    await chat.postToCity("Dakar", ids.fatou, "one");
    await chat.postToCity("Dakar", ids.sam, "two");
    await safety.report(ids.awa, { kind: "group", id: "city:Dakar" });
    const [r] = await db.select().from(reports).where(and(eq(reports.kind, "group"), eq(reports.targetId, "city:Dakar")));
    expect(r.body).toBe("fatou: one\nsam: two");
    expect(r.authorId).toBeNull();
    expect((await bell.list(ids.admin)).items[0]).toMatchObject({ report: { kind: "group", about: null } });
    // A house you don't live in isn't yours to report.
    expect(await status(safety.report(ids.fatou, { kind: "group", id: "house:sacre-coeur" }))).toBe(404);
    expect(await status(safety.report(ids.fatou, { kind: "group", id: "dm:whatever" }))).toBe(404);
  });

  it("an admin who muted the reporter isn't rung", async () => {
    await safety.mute(ids.admin, { login: "sam" });
    await safety.report(ids.sam, { kind: "person", id: "fatou" });
    expect(await db.select().from(notifications).where(eq(notifications.userId, ids.admin))).toEqual([]);
    expect(await bellOf("boss")).toEqual(["report:sam"]);
  });
});

describe("the routes", () => {
  it("need a login, and list what you blocked and muted", async () => {
    expect(await status(controller.view(req))).toBe(401);
    expect(await status(controller.mute({ login: "fatou" }, req))).toBe(401);
    as = "sam";
    await controller.mute({ login: "fatou" }, req);
    await controller.mute({ channel: "city:Lomé" }, req);
    await controller.block({ login: "awa" }, req);
    expect(await controller.view(req)).toMatchObject({
      blocked: [expect.objectContaining({ login: "awa" })],
      muted: [expect.objectContaining({ login: "fatou" })],
      groups: [{ channel: "city:Lomé", place: "city", name: "Lomé" }],
    });
    await controller.unmute("fatou", undefined, req);
    await controller.unmute(undefined, "city:Lomé", req);
    await controller.unblock("awa", req);
    expect(await controller.view(req)).toEqual({ blocked: [], muted: [], groups: [] });
    expect(await status(controller.mute({}, req))).toBe(400);
  });
});
