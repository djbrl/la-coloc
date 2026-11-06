// Words meant for you, under the bell: a reply under your board post, "@you" in a public chat. And the city's room and
// board, which ring nobody's bell but count what's new on their tabs. Found by Jib's test with two friends: "no
// notifications when i left messages in the city or the board".
import "reflect-metadata";
import { blocks, type Db, messages, notifications, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { HttpException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthConfig } from "../auth/auth.config";
import type { AuthService } from "../auth/auth.service";
import { BoardService } from "../chat/board.service";
import { arenaChannel, cityChannel } from "../chat/channels";
import { ChatController } from "../chat/chat.controller";
import { ChatService } from "../chat/chat.service";
import { DoorbellService } from "../doorbell/doorbell.service";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { MAX_MENTIONS, mentionedLogins } from "./message-news";
import { NotificationsService } from "./notifications.service";

let db: Db;
let service: NotificationsService;
let chat: ChatService;
let board: BoardService;
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
  const doorbell = new DoorbellService(db, houses);
  service = new NotificationsService(db, houses, doorbell, { devLogin: false });
  chat = new ChatService(db, houses, service);
  board = new BoardService(db, chat);
  pushed = [];
  service.pushes.subscribe((login) => pushed.push(login));
  for (const u of await db.query.users.findMany()) ids[u.login] = u.id;
  await newcomer("fatou", 501);
  await newcomer("sam", 502);
  await newcomer("ines", 503);
});

// Someone's lines under the bell about messages, oldest first.
async function lines(login: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, ids[login]));
  return rows
    .filter((r) => r.kind === "post_reply" || r.kind === "mention")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({ kind: r.kind, from: Object.entries(ids).find(([, id]) => id === r.fromId)?.[0], channel: r.payload.channel, read: r.readAt !== null }));
}

async function post(login: string, title = "Cherche coloc à Dakar") {
  return (await board.create("Dakar", ids[login], { tag: "flatmates", title, body: "Deux chambres, près de la plage." })).id;
}

describe("a reply under a board post", () => {
  it("tells the post's author, and nobody else when nobody replied before", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "Je suis intéressé !");
    expect(await lines("fatou")).toEqual([{ kind: "post_reply", from: "sam", channel: `post:${id}`, read: false }]);
    expect(await lines("sam")).toEqual([]);
    expect(await lines("ines")).toEqual([]);
    expect(pushed).toContain("fatou");
  });

  it("tells the people who replied before too, but never the one replying", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "Moi !");
    await board.reply(id, ids.ines, "Moi aussi");
    expect(await lines("sam")).toEqual([{ kind: "post_reply", from: "ines", channel: `post:${id}`, read: false }]);
    expect(await lines("ines")).toEqual([]);
  });

  it("is one line per post until it's read, brought up to date by each new reply", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "1");
    await board.reply(id, ids.ines, "2");
    await board.reply(id, ids.sam, "3");
    expect(await lines("fatou")).toEqual([{ kind: "post_reply", from: "sam", channel: `post:${id}`, read: false }]);
    // Each reply still nudges her bell.
    expect(pushed.filter((l) => l === "fatou")).toHaveLength(3);

    // Read: the next reply is a new line.
    await service.markRead(ids.fatou);
    await board.reply(id, ids.ines, "4");
    expect((await lines("fatou")).map((l) => [l.from, l.read])).toEqual([
      ["sam", true],
      ["ines", false],
    ]);
  });

  it("keeps posts apart: two posts, two lines", async () => {
    const a = await post("fatou", "A");
    const b = await post("fatou", "B");
    await board.reply(a, ids.sam, "a");
    await board.reply(b, ids.sam, "b");
    expect((await lines("fatou")).map((l) => l.channel)).toEqual([`post:${a}`, `post:${b}`]);
  });

  it("tells nobody when the author answers under their own post with nobody else there", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.fatou, "Toujours dispo");
    expect(await lines("fatou")).toEqual([]);
  });

  it("doesn't reach someone who blocked the replier, or whom the replier blocked", async () => {
    const id = await post("fatou");
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.sam });
    await board.reply(id, ids.sam, "Coucou");
    expect(await lines("fatou")).toEqual([]);

    const other = await post("ines");
    await db.insert(blocks).values({ blockerId: ids.sam, blockedId: ids.ines });
    await board.reply(other, ids.sam, "Hello");
    expect(await lines("ines")).toEqual([]);
  });

  it("doesn't reach an earlier replier who blocked the post's author: for them the post isn't there", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "Moi");
    await db.insert(blocks).values({ blockerId: ids.sam, blockedId: ids.fatou });
    await board.reply(id, ids.ines, "Moi aussi");
    expect(await lines("sam")).toEqual([]);
    expect(await lines("fatou")).toEqual([{ kind: "post_reply", from: "ines", channel: `post:${id}`, read: false }]);
  });

  it("shows under the bell with the post's title, saying whose it is", async () => {
    const id = await post("fatou", "Cherche coloc");
    await board.reply(id, ids.sam, "Moi");
    await board.reply(id, ids.ines, "Moi aussi");
    const [fatous] = (await service.list(ids.fatou)).items;
    expect(fatous).toMatchObject({ kind: "post_reply", from: expect.objectContaining({ login: "ines" }), chat: { place: "post", city: "Dakar", post: { id, title: "Cherche coloc", mine: true } } });
    const [sams] = (await service.list(ids.sam)).items;
    expect(sams.chat?.post?.mine).toBe(false);
  });

  it("goes when the post is deleted: there's nothing left to open", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "Moi");
    await board.deletePost(id, ids.fatou, false);
    expect(await lines("fatou")).toEqual([]);
  });
});

describe("an @mention", () => {
  it("is read from the text: logins, any case, once each, not inside an email", () => {
    expect(mentionedLogins("Salut @Fatou et @sam, @fatou encore")).toEqual(["fatou", "sam"]);
    expect(mentionedLogins("écris à fatou@mail.com")).toEqual([]);
    expect(mentionedLogins("(@ines) @moussa-dev!")).toEqual(["ines", "moussa-dev"]);
    expect(mentionedLogins("@a @b @c @d @e @f @g")).toHaveLength(MAX_MENTIONS);
  });

  it("in a city's room tells that person, and only them", async () => {
    await chat.postToCity("Dakar", ids.sam, "@Fatou tu viens au meetup ?");
    expect(await lines("fatou")).toEqual([{ kind: "mention", from: "sam", channel: cityChannel("Dakar"), read: false }]);
    expect(await lines("ines")).toEqual([]);
    const [n] = (await service.list(ids.fatou)).items;
    expect(n.chat).toEqual({ place: "city", city: "Dakar", post: null });
  });

  it("in the arena's room tells them too", async () => {
    await chat.write(arenaChannel("Dakar"), ids.sam, "gg @fatou");
    expect(await lines("fatou")).toEqual([{ kind: "mention", from: "sam", channel: arenaChannel("Dakar"), read: false }]);
    expect((await service.list(ids.fatou)).items[0].chat).toEqual({ place: "arena", city: "Dakar", post: null });
  });

  it("under a post tells someone who never replied there", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "@ines regarde ça");
    expect(await lines("ines")).toEqual([{ kind: "mention", from: "sam", channel: `post:${id}`, read: false }]);
  });

  it("of a post's author, under their post, is one line, not two", async () => {
    const id = await post("fatou");
    await board.reply(id, ids.sam, "@fatou je prends");
    expect((await lines("fatou")).map((l) => l.kind)).toEqual(["post_reply"]);
  });

  it("is one unread line per place, however many times they're called", async () => {
    await chat.postToCity("Dakar", ids.sam, "@fatou");
    await chat.postToCity("Dakar", ids.ines, "@fatou !");
    await chat.postToCity("Tunis", ids.sam, "@fatou ?");
    expect(await lines("fatou")).toEqual([
      { kind: "mention", from: "ines", channel: cityChannel("Dakar"), read: false },
      { kind: "mention", from: "sam", channel: cityChannel("Tunis"), read: false },
    ]);
  });

  it("of yourself tells nobody", async () => {
    await chat.postToCity("Dakar", ids.fatou, "c'est moi @fatou");
    expect(await lines("fatou")).toEqual([]);
  });

  it("doesn't cross a block, either way", async () => {
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.sam });
    await chat.postToCity("Dakar", ids.sam, "@fatou");
    await chat.postToCity("Dakar", ids.fatou, "@sam");
    expect(await lines("fatou")).toEqual([]);
    expect(await lines("sam")).toEqual([]);
  });

  it("of nobody, or of a login nobody has, is just a message", async () => {
    await chat.postToCity("Dakar", ids.sam, "salut tout le monde, @personne-ici");
    expect(await db.select().from(notifications).where(and(eq(notifications.fromId, ids.sam)))).toEqual([]);
  });
});

describe("the city's room and board", () => {
  it("ring nobody's bell: a message or a post without a mention is only counted on the tabs", async () => {
    await chat.postToCity("Dakar", ids.sam, "Bonjour Dakar");
    await post("sam");
    expect(await db.select().from(notifications).where(eq(notifications.fromId, ids.sam))).toEqual([]);
  });

  it("count others' new messages until you look, not your own", async () => {
    await chat.postToCity("Dakar", ids.sam, "1");
    await chat.postToCity("Dakar", ids.ines, "2");
    expect(await chat.cityUnread("Dakar", ids.fatou)).toEqual({ chat: 2, board: 0 });
    // Sam spoke, then Ines: one new for him.
    expect((await chat.cityUnread("Dakar", ids.sam)).chat).toBe(1);

    await chat.markCityRead("Dakar", ids.fatou, "chat");
    expect((await chat.cityUnread("Dakar", ids.fatou)).chat).toBe(0);
    await chat.postToCity("Dakar", ids.sam, "3");
    expect((await chat.cityUnread("Dakar", ids.fatou)).chat).toBe(1);
    // Speaking in the room is looking at it.
    await chat.postToCity("Dakar", ids.fatou, "salut");
    expect((await chat.cityUnread("Dakar", ids.fatou)).chat).toBe(0);
    // Each city counts on its own.
    expect((await chat.cityUnread("Tunis", ids.fatou)).chat).toBe(0);
  });

  it("leave out people you blocked", async () => {
    await db.insert(blocks).values({ blockerId: ids.fatou, blockedId: ids.sam });
    await chat.postToCity("Dakar", ids.sam, "1");
    await post("sam");
    expect(await chat.cityUnread("Dakar", ids.fatou)).toEqual({ chat: 0, board: 0 });
  });

  it("count only the last day's for someone who never looked", async () => {
    await chat.postToCity("Dakar", ids.sam, "old");
    await chat.postToCity("Dakar", ids.sam, "new");
    await db.update(messages).set({ at: new Date(Date.now() - 2 * 24 * 3600 * 1000) }).where(eq(messages.body, "old"));
    expect((await chat.cityUnread("Dakar", ids.fatou)).chat).toBe(1);
  });

  it("count new board posts until you look at the board, not your own", async () => {
    await post("sam");
    expect((await chat.cityUnread("Dakar", ids.fatou)).board).toBe(1);
    expect((await chat.cityUnread("Dakar", ids.sam)).board).toBe(0);
    await chat.markCityRead("Dakar", ids.fatou, "board");
    expect((await chat.cityUnread("Dakar", ids.fatou)).board).toBe(0);
    await post("ines");
    expect((await chat.cityUnread("Dakar", ids.fatou)).board).toBe(1);
    // Posting is looking at the board.
    await post("fatou");
    expect((await chat.cityUnread("Dakar", ids.fatou)).board).toBe(0);
  });

  it("are asked for and marked with a login, through the controller", async () => {
    let as: string | null = null;
    const auth = {
      userFromRequest: async () => (as ? ((await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, as!) })) ?? null) : null),
      config: loadAuthConfig({}),
    } as unknown as AuthService;
    const controller = new ChatController(chat, board, auth);
    const req = { headers: {} } as never;
    const status = async (p: Promise<unknown>) => p.then(() => "ok" as const).catch((e) => (e instanceof HttpException ? e.getStatus() : Promise.reject(e)));
    expect(await status(controller.cityUnread("Dakar", req))).toBe(401);

    await chat.postToCity("Dakar", ids.sam, "hello");
    as = "fatou";
    expect(await controller.cityUnread("Dakar", req)).toEqual({ chat: 1, board: 0 });
    await controller.markCityRead("Dakar", { what: "chat" }, req);
    expect(await controller.cityUnread("Dakar", req)).toEqual({ chat: 0, board: 0 });
    expect(await status(controller.markCityRead("Dakar", { what: "everything" }, req))).toBe(400);
    expect(await status(controller.cityUnread("Atlantis", req))).toBe(404);
  });
});
