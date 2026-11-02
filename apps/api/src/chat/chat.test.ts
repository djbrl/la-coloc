// The chat's rules, on a real in-memory database: who may read and write each channel, direct messages between two
// people, blocking, reporting, the brake on posting, and the city board.
import "reflect-metadata";
import { type Db, messages, reports, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthConfig } from "../auth/auth.config";
import type { AuthService } from "../auth/auth.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { NotificationsService } from "../notifications/notifications.service";
import { seedCity } from "../seed/city";
import { BoardService } from "./board.service";
import { dmChannel } from "./channels";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { Limiter } from "./limiter";

let db: Db;
let houses: HousesService;
let doorbell: DoorbellService;
let chat: ChatService;
let board: BoardService;
let controller: ChatController;
let pushed: string[];
let changes: string[];
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
  houses = new HousesService(db);
  doorbell = new DoorbellService(db, houses);
  const notifications = new NotificationsService(db, houses, doorbell, { devLogin: false });
  chat = new ChatService(db, houses, notifications);
  board = new BoardService(db, chat);
  pushed = [];
  changes = [];
  chat.pushes.subscribe((login) => pushed.push(login));
  chat.changes.subscribe((c) => changes.push(`${c.city}:${c.what}`));
  as = null;
  const auth = {
    userFromRequest: async () => (as ? (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null : null),
    config: loadAuthConfig({ COLOC_ADMINS: "admin" }),
  } as unknown as AuthService;
  controller = new ChatController(chat, board, auth);
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  // Two newcomers and an admin, with real GitHub accounts; Awa of Sacré-Cœur logged in with GitHub too.
  await newcomer("fatou", 101);
  await newcomer("sam", 102);
  await newcomer("admin", 104);
  await db.update(users).set({ githubId: 103 }).where(eq(users.id, ids.awa));
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

describe("direct messages", () => {
  it("go between two people, in one channel per pair, and show as unread until opened", async () => {
    await chat.sendDm(ids.fatou, "sam", "Salut Sam, tu cherches une coloc ?");
    await chat.sendDm(ids.sam, "fatou", "Oui !");
    await chat.sendDm(ids.fatou, "sam", "Super");
    const rows = await db.select().from(messages).where(eq(messages.channel, dmChannel(ids.sam, ids.fatou)));
    expect(rows).toHaveLength(3);

    // Sam answering counts as reading what came before: only Fatou's last one is new to him.
    const sams = await chat.conversations(ids.sam);
    expect(sams.unread).toBe(1);
    expect(sams.items).toEqual([expect.objectContaining({ with: expect.objectContaining({ login: "fatou" }), unread: 1, last: expect.objectContaining({ body: "Super", mine: false }) })]);
    // Fatou wrote last: nothing unread for her.
    expect((await chat.conversations(ids.fatou)).unread).toBe(0);

    const opened = await chat.conversation(ids.sam, "fatou");
    expect(opened.messages.map((m) => m.body)).toEqual(["Salut Sam, tu cherches une coloc ?", "Oui !", "Super"]);
    expect(opened.canWrite).toBe(true);
    expect((await chat.conversations(ids.sam)).unread).toBe(0);
  });

  it("nudges both people's open tabs on the live line", async () => {
    await chat.sendDm(ids.fatou, "sam", "hello");
    expect(pushed).toEqual(["sam", "fatou"]);
  });

  it("lists the most recent conversation first", async () => {
    await chat.sendDm(ids.fatou, "sam", "1");
    await chat.sendDm(ids.fatou, "awa", "2");
    expect((await chat.conversations(ids.fatou)).items.map((i) => i.with.login)).toEqual(["awa", "sam"]);
    await chat.sendDm(ids.sam, "fatou", "3");
    expect((await chat.conversations(ids.fatou)).items.map((i) => i.with.login)).toEqual(["sam", "awa"]);
  });

  it("is private: a third person sees none of it", async () => {
    await chat.sendDm(ids.fatou, "sam", "secret");
    expect((await chat.conversations(ids.awa)).items).toEqual([]);
    expect((await chat.conversation(ids.awa, "fatou")).messages).toEqual([]);
  });

  it("refuses yourself, nobody, an empty or too long message, and visitors", async () => {
    expect(await status(chat.sendDm(ids.fatou, "fatou", "me"))).toBe(400);
    expect(await status(chat.sendDm(ids.fatou, "nobody-here", "hi"))).toBe(404);
    expect(await status(chat.sendDm(ids.fatou, "sam", "   "))).toBe(400);
    expect(await status(chat.sendDm(ids.fatou, "sam", "x".repeat(1001)))).toBe(400);
    expect(await status(controller.sendDm("sam", { body: "hi" }, req))).toBe(401);
    expect(await status(controller.conversations(req))).toBe(401);
  });

  it("reach an example person, who answers the first one, once", async () => {
    chat.replyDelayMs = 0;
    const answered = async (n: number) => {
      for (let i = 0; i < 50 && (await chat.conversation(ids.fatou, "koffi")).messages.length < n; i++) await new Promise((r) => setTimeout(r, 5));
      return (await chat.conversation(ids.fatou, "koffi")).messages;
    };
    // Koffi is a seeded flatmate of an example house.
    const open = await chat.conversation(ids.fatou, "koffi");
    expect(open.canWrite).toBe(true);
    expect(open.with.example).toBe(true);
    await chat.sendDm(ids.fatou, "koffi", "hi");
    const first = await answered(2);
    expect(first).toHaveLength(2);
    expect(first.some((m) => m.body.includes("example resident"))).toBe(true);
    await chat.sendDm(ids.fatou, "koffi", "still there?");
    await new Promise((r) => setTimeout(r, 30));
    expect(await answered(3)).toHaveLength(3);
  });

  it("reach a passer-by, who only exists once someone writes to them; any other unknown name is nobody", async () => {
    chat.replyDelayMs = 0;
    const before = await db.select().from(users).where(eq(users.login, "mdiop_221"));
    expect(before).toEqual([]);
    const open = await chat.conversation(ids.fatou, "mdiop_221");
    expect(open.with.name).toBe("Mamadou Diop");
    expect(open.with.example).toBe(true);
    await chat.sendDm(ids.fatou, "mdiop_221", "salut");
    await chat.sendDm(ids.sam, "mdiop_221", "salut aussi");
    expect(await db.select().from(users).where(eq(users.login, "mdiop_221"))).toHaveLength(1);
    expect(await status(chat.sendDm(ids.fatou, "made_up_person", "hi"))).toBe(404);
  });

  it("are stored as typed: markup is just text", async () => {
    await chat.sendDm(ids.fatou, "sam", "<script>alert(1)</script>");
    expect((await chat.conversation(ids.sam, "fatou")).messages[0].body).toBe("<script>alert(1)</script>");
  });
});

describe("blocking", () => {
  it("stops direct messages both ways, and hides the conversation for the one who blocked", async () => {
    await chat.sendDm(ids.fatou, "sam", "hi");
    await chat.block(ids.sam, "fatou");
    expect(await status(chat.sendDm(ids.fatou, "sam", "hello?"))).toBe(403);
    expect(await status(chat.sendDm(ids.sam, "fatou", "bye"))).toBe(403);
    expect((await chat.conversations(ids.sam)).items).toEqual([]);
    const forSam = await chat.conversation(ids.sam, "fatou");
    expect(forSam).toMatchObject({ blocked: true, canWrite: false, messages: [] });
    const forFatou = await chat.conversation(ids.fatou, "sam");
    expect(forFatou).toMatchObject({ blocked: false, canWrite: false });
    expect((await chat.blocks(ids.sam)).people.map((p) => p.login)).toEqual(["fatou"]);

    await chat.unblock(ids.sam, "fatou");
    expect(await status(chat.sendDm(ids.fatou, "sam", "friends again?"))).toBe("ok");
  });

  it("hides their words in the city's room, on the board and in the house's living room, for the blocker only", async () => {
    await chat.postToCity("Dakar", ids.fatou, "Bonjour Dakar");
    await chat.postToCity("Dakar", ids.sam, "Salut");
    const { id } = await board.create("Dakar", ids.fatou, { tag: "help", title: "Docker?", body: "Help" });
    await doorbell.postToHouse("sacre-coeur", ids.jib, "Hello house");
    await chat.block(ids.sam, "fatou");
    await chat.block(ids.awa, "jib");
    expect((await chat.cityChat("Dakar", ids.sam)).messages.map((m) => m.body)).toEqual(["Salut"]);
    expect((await chat.cityChat("Dakar", ids.awa)).messages.map((m) => m.body)).toEqual(["Bonjour Dakar", "Salut"]);
    expect((await chat.cityChat("Dakar", null)).messages).toHaveLength(2);
    expect((await board.board("Dakar", ids.sam)).posts).toEqual([]);
    expect(await status(board.post(id, ids.sam))).toBe(404);
    expect((await board.board("Dakar", ids.awa)).posts).toHaveLength(1);
    expect((await houses.view("sacre-coeur", ids.awa))?.channel?.map((m) => m.body)).not.toContain("Hello house");
  });

  it("needs a login", async () => {
    expect(await status(controller.block({ login: "fatou" }, req))).toBe(401);
  });
});

describe("a city's room", () => {
  it("is read by anyone, visitors too, and written by logged-in people only", async () => {
    as = "fatou";
    await controller.postToCity("Dakar", { body: "Qui code en Go ici ?" }, req);
    as = null;
    expect((await controller.cityChat("Dakar", req)).messages.map((m) => m.body)).toEqual(["Qui code en Go ici ?"]);
    expect(await status(controller.postToCity("Dakar", { body: "visitor" }, req))).toBe(401);
    expect(changes).toEqual(["Dakar:chat"]);
  });

  it("pings the city's stream, with some data (a browser drops an event without any)", async () => {
    const got: unknown[] = [];
    const sub = (await controller.stream("Dakar")).subscribe((e) => got.push(e));
    await chat.postToCity("Lomé", ids.fatou, "elsewhere");
    await chat.postToCity("Dakar", ids.fatou, "here");
    await board.create("Dakar", ids.fatou, { tag: "help", title: "t", body: "b" });
    sub.unsubscribe();
    expect(got).toEqual([
      { type: "chat", data: "chat" },
      { type: "board", data: "board" },
    ]);
  });

  it("keeps each city to itself, and knows only real cities", async () => {
    await chat.postToCity("Dakar", ids.fatou, "Dakar");
    await chat.postToCity("Lomé", ids.fatou, "Lomé");
    expect((await chat.cityChat("Lomé", null)).messages.map((m) => m.body)).toEqual(["Lomé"]);
    expect(await status(chat.cityChat("Atlantis", null))).toBe(404);
    expect(await status(chat.postToCity("Atlantis", ids.fatou, "hi"))).toBe(404);
  });

  it("gives the last hundred messages", async () => {
    await db.insert(messages).values(Array.from({ length: 120 }, (_, i) => ({ channel: "city:Dakar", authorId: ids.fatou, body: `m${i}` })));
    const got = (await chat.cityChat("Dakar", null)).messages;
    expect(got).toHaveLength(100);
    expect(got[0].body).toBe("m20");
    expect(got[99].body).toBe("m119");
  });
});

describe("the brake on posting", () => {
  it("lets five messages through in ten seconds, then answers 429", async () => {
    for (let i = 0; i < 5; i++) await chat.postToCity("Dakar", ids.fatou, `m${i}`);
    expect(await status(chat.postToCity("Dakar", ids.fatou, "one too many"))).toBe(429);
    expect(await status(chat.sendDm(ids.fatou, "sam", "also too many"))).toBe(429);
    // Someone else isn't slowed down by Fatou.
    expect(await status(chat.postToCity("Dakar", ids.sam, "hi"))).toBe("ok");
  });

  it("doesn't count a refused message", async () => {
    for (let i = 0; i < 5; i++) await status(chat.postToCity("Dakar", ids.fatou, ""));
    expect(await status(chat.postToCity("Dakar", ids.fatou, "hi"))).toBe("ok");
  });

  it("allows five board posts an hour", async () => {
    for (let i = 0; i < 5; i++) await board.create("Dakar", ids.fatou, { tag: "other", title: `t${i}`, body: "b" });
    expect(await status(board.create("Dakar", ids.fatou, { tag: "other", title: "t", body: "b" }))).toBe(429);
  });

  it("says no with a code the web can say in French, and the English sentence", async () => {
    for (let i = 0; i < 5; i++) await chat.postToCity("Dakar", ids.fatou, `hi ${i}`);
    const refused = await chat.postToCity("Dakar", ids.fatou, "one too many").catch((e: HttpException) => e.getResponse());
    expect(refused).toMatchObject({ code: "slowDownMessages", message: expect.stringContaining("Slow down") });
    const long = await chat.postToCity("Dakar", ids.sam, "x".repeat(5000)).catch((e: HttpException) => e.getResponse());
    expect(long).toMatchObject({ code: "tooLong", max: expect.any(Number) });
  });

  it("forgets after the window", () => {
    const brake = new Limiter(2, 1000);
    expect([brake.take("a", 0), brake.take("a", 10), brake.take("a", 20)]).toEqual([true, true, false]);
    expect(brake.take("a", 1001)).toBe(true);
    expect(brake.take("b", 20)).toBe(true);
  });
});

describe("the city board", () => {
  it("lists posts by latest activity, with their reply count, for visitors too", async () => {
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const a = await board.create("Dakar", ids.fatou, { tag: "flatmates", title: "Looking for two flatmates", body: "Plateau, Node devs" });
    await tick();
    const b = await board.create("Dakar", ids.sam, { tag: "project", title: "A bus app", body: "Who's in?" });
    expect((await board.board("Dakar", null)).posts.map((p) => p.id)).toEqual([b.id, a.id]);
    await tick();
    await board.reply(a.id, ids.sam, "Me!");
    const posts = (await board.board("Dakar", null)).posts;
    expect(posts.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(posts[0]).toMatchObject({ tag: "flatmates", title: "Looking for two flatmates", replies: 1, author: { login: "fatou" } });
    expect((await board.post(a.id, null)).replies.map((r) => r.body)).toEqual(["Me!"]);
    expect((await board.board("Lomé", null)).posts).toEqual([]);
    expect(changes).toContain("Dakar:board");
  });

  it("needs a login to post or reply, a known tag, a title and a body", async () => {
    expect(await status(controller.createPost("Dakar", { tag: "help", title: "t", body: "b" }, req))).toBe(401);
    as = "fatou";
    expect(await status(controller.createPost("Dakar", { tag: "memes", title: "t", body: "b" }, req))).toBe(400);
    expect(await status(controller.createPost("Dakar", { tag: "help", title: " ", body: "b" }, req))).toBe(400);
    expect(await status(controller.createPost("Dakar", { tag: "help", title: "t".repeat(101), body: "b" }, req))).toBe(400);
    const { id } = await controller.createPost("Dakar", { tag: "help", title: "t", body: "b" }, req);
    as = null;
    expect(await status(controller.reply(id, { body: "hi" }, req))).toBe(401);
  });

  it("lets the author delete their post (with its replies) or reply, and nobody else but an admin", async () => {
    const { id } = await board.create("Dakar", ids.fatou, { tag: "help", title: "t", body: "b" });
    const r = await board.reply(id, ids.sam, "a reply");
    as = "fatou";
    expect(await status(controller.deleteReply(id, r.id, req))).toBe(403);
    as = "sam";
    expect(await status(controller.deletePost(id, req))).toBe(403);
    expect(await status(controller.deleteReply(id, r.id, req))).toBe("ok");
    expect((await board.post(id, null)).replies).toEqual([]);
    await board.reply(id, ids.sam, "another");
    as = "fatou";
    expect(await status(controller.deletePost(id, req))).toBe("ok");
    expect(await status(board.post(id, null))).toBe(404);
    expect(await db.select().from(messages).where(eq(messages.channel, `post:${id}`))).toEqual([]);

    const other = await board.create("Dakar", ids.sam, { tag: "other", title: "t", body: "b" });
    as = "admin";
    expect(await status(controller.deletePost(other.id, req))).toBe("ok");
  });
});

describe("reporting", () => {
  it("keeps a copy of a message or a post for the admins, once per person", async () => {
    const m = await chat.postToCity("Dakar", ids.fatou, "something rude");
    const p = await board.create("Dakar", ids.fatou, { tag: "other", title: "Rude", body: "post" });
    as = "sam";
    expect(await status(controller.report({ kind: "message", id: m.id, reason: "rude" }, req))).toBe("ok");
    expect(await status(controller.report({ kind: "message", id: m.id }, req))).toBe("ok");
    expect(await status(controller.report({ kind: "post", id: p.id }, req))).toBe("ok");
    expect(await db.select().from(reports)).toHaveLength(2);

    expect(await status(controller.reports(req))).toBe(403);
    as = "admin";
    const { reports: list } = await controller.reports(req);
    expect(list.map((r) => [r.kind, r.reporter, r.author, r.body])).toEqual(
      expect.arrayContaining([
        ["message", "sam", "fatou", "something rude"],
        ["post", "sam", "fatou", "Rude\n\npost"],
      ]),
    );
  });

  it("only reaches what you can read, and not your own words", async () => {
    await chat.sendDm(ids.fatou, "sam", "private");
    const [dm] = await db.select().from(messages).where(eq(messages.channel, dmChannel(ids.fatou, ids.sam)));
    expect(await status(chat.report(ids.awa, { kind: "message", id: String(dm.id) }))).toBe(404);
    expect(await status(chat.report(ids.sam, { kind: "message", id: String(dm.id) }))).toBe("ok");
    expect(await status(chat.report(ids.fatou, { kind: "message", id: String(dm.id) }))).toBe(400);
    expect(await status(chat.report(ids.sam, { kind: "message", id: "999999" }))).toBe(404);
    expect(await status(chat.report(ids.sam, { kind: "post", id: "not-a-post" }))).toBe(404);
    as = null;
    expect(await status(controller.report({ kind: "message", id: String(dm.id) }, req))).toBe(401);
  });
});

describe("the house's living room keeps its rules", () => {
  it("is for flatmates only", async () => {
    expect(await status(doorbell.postToHouse("sacre-coeur", ids.fatou, "let me in"))).toBe(403);
    expect(await status(doorbell.postToHouse("sacre-coeur", ids.awa, "hello flatmates"))).toBe("ok");
    expect((await houses.view("sacre-coeur", ids.fatou))?.channel).toBeNull();
  });
});
