// Talking in La Coloc beyond a house: direct messages between two people, each city's public room, and the safety
// around them (blocking someone, reporting what they wrote, a brake on posting). The city board's posts are in
// board.service.ts; the house's living room and a knock's thread stay in the doorbell.
//
// Every conversation is a channel in the `messages` table (channels.ts says which). Nothing here is HTML: the text
// is stored as typed, and the web shows it as text.
//
// Live updates: a direct message nudges both people's open tabs on the lobby's live line (`pushes`, a login each;
// the page then asks for its conversations). A city's room and board ping `changes`, which the city's stream
// (chat.controller.ts) passes on to whoever has the chat open; their page then fetches what's new.
//
// Who notices what: a direct message counts on the chat button (`conversations`). A reply under your board post, or
// "@you" anywhere public, goes under your bell (notifications/message-news.ts). The city's room and its board tell
// nobody in particular: their tabs count what's new since you last looked (`cityUnread`), so nobody's bell rings for
// every hello.
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { applications, blocks, boardPosts, chatReads, type Db, houses, messages, type ReportKind, reports, users } from "@coloc/db";
import { passerbyName } from "@coloc/domain";
import { and, count, desc, eq, gt, gte, inArray, like, max, ne, notInArray, or, sql } from "drizzle-orm";
import { Subject } from "rxjs";
import { DB } from "../db/db.module";
import { blockBetween, blockedBy, channelMessages, person } from "../doorbell/queries";
import { isChatGuest } from "../houses/guests";
import type { MessageView, PersonView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { unfriend } from "../notifications/friends";
import { NotificationsService } from "../notifications/notifications.service";
import { CITIES, CITY_HISTORY, cityChannel, dmChannel, dmPeople, MAX_MESSAGE } from "./channels";
import { Limiter, MESSAGES, POSTS, slowDown } from "./limiter";

type UserRow = typeof users.$inferSelect;

/** One conversation in your list: who with, the last thing said, and how many of theirs you haven't read. */
export interface ConversationItem {
  with: PersonView;
  last: { body: string; at: string; mine: boolean };
  unread: number;
}

/** What's new in a city since you last looked: messages in its room (others', not of people you blocked), new posts. */
export interface CityUnreadView {
  chat: number;
  board: number;
}

// Someone who never opened a city's room or board counts only the last day's, not its whole history.
const FIRST_LOOK_MS = 24 * 3600 * 1000;
const boardMark = (city: string) => `board:${city}`;

export interface ConversationsView {
  // Unread messages over all your conversations: the count on the chat button.
  unread: number;
  items: ConversationItem[];
}

/** One conversation, opened. `canWrite` false says why in `why` (a block). */
export interface ConversationView {
  with: PersonView & { example: boolean };
  // You blocked them (you can unblock from here).
  blocked: boolean;
  canWrite: boolean;
  why: string | null;
  messages: MessageView[];
}

/** One report, as the admins read it. */
export interface ReportView {
  id: string;
  kind: ReportKind;
  targetId: string;
  channel: string;
  body: string;
  reason: string | null;
  reporter: string;
  author: string | null;
  createdAt: string;
}

// "arena": the arena's room, entrants, leaderboard or challenge changed (arena/arena.service.ts).
// "arenaChat": only a new message in the arena's room.
export type CityChange = { city: string; what: "chat" | "board" | "arena" | "arenaChat" };

const EXAMPLE_REPLY_MS = 1500;
const exampleReply = (first: string) => `Hey ${first}, good to meet you! I'm an example resident, so this is the only answer you'll get from me. For a real conversation, try the city's room.`;

@Injectable()
export class ChatService {
  // The login of someone with a new direct message (and the sender, for their other tabs).
  readonly pushes = new Subject<string>();
  // How long an example person takes to answer. Tests shorten it.
  replyDelayMs = EXAMPLE_REPLY_MS;
  private readonly log = new Logger(ChatService.name);
  // Something new in a city's room, on its board, or in its Arena.
  readonly changes = new Subject<CityChange>();
  // The brakes: messages (a DM, the city's room, a reply) and board posts, per person.
  readonly messageBrake = new Limiter(MESSAGES.count, MESSAGES.perMs);
  readonly postBrake = new Limiter(POSTS.count, POSTS.perMs);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    readonly notifications: NotificationsService,
  ) {}

  // ---- A city's room ----

  /** A city we know: one the city is drawn in, or one a house is in. Anything else is a 404. */
  async mustBeCity(city: string): Promise<string> {
    if (CITIES.includes(city)) return city;
    const [h] = await this.db.select({ id: houses.id }).from(houses).where(eq(houses.city, city)).limit(1);
    if (!h) throw new NotFoundException({ message: "There's no such city.", code: "noCity" });
    return city;
  }

  /** The city's room: its last hundred messages, oldest first. Anyone may read, visitors too. */
  async cityChat(city: string, viewerId: string | null): Promise<{ messages: MessageView[] }> {
    await this.mustBeCity(city);
    return { messages: await channelMessages(this.db, cityChannel(city), CITY_HISTORY, viewerId) };
  }

  async postToCity(city: string, authorId: string, body: string): Promise<{ id: string }> {
    await this.mustBeCity(city);
    const id = await this.write(cityChannel(city), authorId, body);
    // You've seen the room you just spoke in.
    await this.markRead(authorId, cityChannel(city));
    this.changes.next({ city, what: "chat" });
    return { id };
  }

  /** How much is new in a city's room and on its board since you last looked (see `markCityRead`). */
  async cityUnread(city: string, userId: string): Promise<CityUnreadView> {
    await this.mustBeCity(city);
    const hidden = await blockedBy(this.db, userId);
    const marks = await this.db
      .select()
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), inArray(chatReads.channel, [cityChannel(city), boardMark(city)])));
    const chatMark = marks.find((m) => m.channel === cityChannel(city));
    const postMark = marks.find((m) => m.channel === boardMark(city));
    const firstLook = new Date(Date.now() - FIRST_LOOK_MS);
    const [chat] = await this.db
      .select({ n: count() })
      .from(messages)
      .where(
        and(
          eq(messages.channel, cityChannel(city)),
          ne(messages.authorId, userId),
          chatMark ? gt(messages.id, chatMark.lastReadId) : gte(messages.at, firstLook),
          hidden.length ? notInArray(messages.authorId, hidden) : undefined,
        ),
      );
    const [board] = await this.db
      .select({ n: count() })
      .from(boardPosts)
      .where(
        and(
          eq(boardPosts.city, city),
          ne(boardPosts.authorId, userId),
          gt(boardPosts.createdAt, postMark ? new Date(postMark.lastReadId) : firstLook),
          hidden.length ? notInArray(boardPosts.authorId, hidden) : undefined,
        ),
      );
    return { chat: chat.n, board: board.n };
  }

  /** You looked at a city's room (its latest message) or its board (its newest post): nothing there is new any more. */
  async markCityRead(city: string, userId: string, what: "chat" | "board") {
    await this.mustBeCity(city);
    if (what === "chat") return this.markRead(userId, cityChannel(city));
    // Rounded up to the next ms: Postgres keeps microseconds, so a floor would leave that post new forever.
    const [newest] = await this.db
      .select({ ms: sql<string | null>`ceil(extract(epoch from max(${boardPosts.createdAt})) * 1000)` })
      .from(boardPosts)
      .where(eq(boardPosts.city, city));
    if (!newest?.ms) return;
    await this.mark(userId, boardMark(city), Number(newest.ms));
  }

  // ---- Direct messages ----

  /** Your conversations, the most recent first, without the people you blocked. */
  async conversations(userId: string): Promise<ConversationsView> {
    const hidden = new Set(await blockedBy(this.db, userId));
    const lasts = await this.db
      .select({ channel: messages.channel, last: max(messages.id) })
      .from(messages)
      .where(or(like(messages.channel, `dm:${userId}:%`), like(messages.channel, `dm:%:${userId}`)))
      .groupBy(messages.channel)
      .orderBy(desc(max(messages.id)))
      .limit(50);
    const mine = lasts
      .map((l) => ({ channel: l.channel, last: Number(l.last), other: (dmPeople(l.channel) ?? []).find((id) => id !== userId) }))
      .filter((l): l is { channel: string; last: number; other: string } => !!l.other && !hidden.has(l.other));
    if (!mine.length) return { unread: 0, items: [] };

    const channels = mine.map((l) => l.channel);
    const people = new Map((await this.db.select().from(users).where(inArray(users.id, mine.map((l) => l.other)))).map((u) => [u.id, u]));
    const lastRows = new Map((await this.db.select().from(messages).where(inArray(messages.id, mine.map((l) => l.last)))).map((m) => [m.channel, m]));
    const unread = new Map(
      (
        await this.db
          .select({ channel: messages.channel, n: count() })
          .from(messages)
          .leftJoin(chatReads, and(eq(chatReads.channel, messages.channel), eq(chatReads.userId, userId)))
          .where(and(inArray(messages.channel, channels), ne(messages.authorId, userId), gt(messages.id, sql`coalesce(${chatReads.lastReadId}, 0)`)))
          .groupBy(messages.channel)
      ).map((r) => [r.channel, r.n]),
    );
    const items: ConversationItem[] = [];
    for (const l of mine) {
      const u = people.get(l.other);
      const m = lastRows.get(l.channel);
      if (!u || !m) continue;
      items.push({ with: person(u), last: { body: m.body, at: m.at.toISOString(), mine: m.authorId === userId }, unread: unread.get(l.channel) ?? 0 });
    }
    return { unread: items.reduce((n, i) => n + i.unread, 0), items };
  }

  /** Your conversation with `login`, opened: it's now read. It may be empty (a first message, from their card). */
  async conversation(userId: string, login: string): Promise<ConversationView> {
    const other = await this.someone(userId, login);
    const channel = dmChannel(userId, other.id);
    const example = await this.isMadeUp(other);
    const block = await this.blockBetween(userId, other.id);
    const list = await channelMessages(this.db, channel, CITY_HISTORY, userId);
    await this.markRead(userId, channel);
    const why = block === "mine" ? "You blocked them." : block === "theirs" ? "They aren't taking messages from you." : null;
    return { with: { ...person(other), example }, blocked: block === "mine", canWrite: !why, why, messages: list };
  }

  /** A direct message to `login`. Not to yourself, or anyone either of you blocked. An example person answers once. */
  async sendDm(userId: string, login: string, body: string): Promise<{ id: string }> {
    const other = await this.someone(userId, login);
    const block = await this.blockBetween(userId, other.id);
    if (block === "mine") throw new ForbiddenException({ message: "You blocked them. Unblock them to write.", code: "youBlocked" });
    if (block === "theirs") throw new ForbiddenException({ message: "They aren't taking messages from you.", code: "theyBlocked" });
    const channel = dmChannel(userId, other.id);
    const id = await this.write(channel, userId, body);
    // Your own message is read by you.
    await this.markRead(userId, channel);
    const [me] = await this.db.select({ login: users.login, name: users.name }).from(users).where(eq(users.id, userId));
    this.pushes.next(other.login);
    if (me) {
      this.pushes.next(me.login);
      if (await this.isMadeUp(other)) await this.answerFirstWord(channel, other.id, me);
    }
    return { id };
  }

  // Nobody reads an example person's messages, so saying hello gets one answer that says so, a moment later. "First" is
  // read from the channel, so it's once per pair, and a demo reset (which empties the channels) starts it over.
  private async answerFirstWord(channel: string, authorId: string, to: { login: string; name: string | null }) {
    const [said] = await this.db.select({ n: count() }).from(messages).where(and(eq(messages.channel, channel), eq(messages.authorId, authorId)));
    if (said.n > 0) return;
    const first = (to.name ?? to.login).trim().split(/\s+/)[0];
    const reply = async () => {
      await this.db.insert(messages).values({ channel, authorId, body: exampleReply(first) });
      this.pushes.next(to.login);
    };
    setTimeout(() => void reply().catch((err) => this.log.warn(`couldn't answer as an example person: ${err.message}`)), this.replyDelayMs).unref();
  }

  // Someone nobody plays: a seeded flatmate or a passer-by.
  private async isMadeUp(other: UserRow): Promise<boolean> {
    return passerbyName(other.login) !== undefined || (await this.notifications.isExample(other));
  }

  // ---- Blocking ----

  async blocks(userId: string): Promise<{ people: PersonView[] }> {
    const rows = await this.db
      .select({ u: users })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, userId))
      .orderBy(desc(blocks.createdAt));
    return { people: rows.map((r) => person(r.u)) };
  }

  async block(userId: string, login: string) {
    const other = await this.someone(userId, login);
    await this.db.insert(blocks).values({ blockerId: userId, blockedId: other.id }).onConflictDoNothing();
    // A block ends a friendship, and any friend request between them. Unblocking doesn't bring it back.
    await unfriend(this.db, userId, other.id);
  }

  async unblock(userId: string, login: string) {
    const [other] = await this.db.select().from(users).where(eq(users.login, login));
    if (!other) return;
    await this.db.delete(blocks).where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, other.id)));
  }

  // ---- Reports ----

  /**
   * Reports a message or a board post. Only something you can read, and not your own. Reporting the same thing
   * twice is fine: it counts once. A copy of the words is kept for the admins.
   */
  async report(userId: string, input: { kind: ReportKind; id: string; reason?: string | null }) {
    let found: { channel: string; authorId: string | null; body: string } | null = null;
    if (input.kind === "message") {
      const id = Number(input.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundException({ message: "There's no such message.", code: "noMessage" });
      const [m] = await this.db.select().from(messages).where(eq(messages.id, id));
      if (m && (await this.canRead(m.channel, userId))) found = { channel: m.channel, authorId: m.authorId, body: m.body };
    } else {
      if (!/^[0-9a-f-]{36}$/.test(input.id)) throw new NotFoundException({ message: "There's no such post.", code: "noPost" });
      const [p] = await this.db.select().from(boardPosts).where(eq(boardPosts.id, input.id));
      if (p) found = { channel: cityChannel(p.city), authorId: p.authorId, body: `${p.title}\n\n${p.body}` };
    }
    if (!found) throw new NotFoundException(input.kind === "message" ? { message: "There's no such message.", code: "noMessage" } : { message: "There's no such post.", code: "noPost" });
    if (found.authorId === userId) throw new BadRequestException({ message: "That's yours: delete it instead.", code: "reportOwn" });
    if (!found.authorId) throw new BadRequestException({ message: "That's the house speaking: there's nobody to report.", code: "reportHouse" });
    await this.db
      .insert(reports)
      .values({ reporterId: userId, kind: input.kind, targetId: String(input.id), channel: found.channel, authorId: found.authorId, body: found.body, reason: input.reason ?? null })
      .onConflictDoNothing();
  }

  /** The latest reports, for the admins. */
  async reports(): Promise<ReportView[]> {
    const rows = await this.db.select().from(reports).orderBy(desc(reports.createdAt)).limit(200);
    const ids = [...new Set(rows.flatMap((r) => [r.reporterId, r.authorId]).filter((id): id is string => !!id))];
    const logins = new Map(ids.length ? (await this.db.select({ id: users.id, login: users.login }).from(users).where(inArray(users.id, ids))).map((u) => [u.id, u.login]) : []);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      targetId: r.targetId,
      channel: r.channel,
      body: r.body,
      reason: r.reason,
      reporter: logins.get(r.reporterId) ?? "?",
      author: r.authorId ? (logins.get(r.authorId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---- Shared ----

  /** Writes one message, after checking it and the brake. Returns its id. The board's replies use it too. */
  async write(channel: string, authorId: string, body: string): Promise<string> {
    // Check first: a refused message shouldn't count against you.
    const text = cleanText(body, MAX_MESSAGE);
    this.brake(authorId, "messages");
    const [row] = await this.db.insert(messages).values({ channel, authorId, body: text }).returning({ id: messages.id });
    // The people it's meant for hear of it (a reply under their post, "@them"). The message is written already, so a
    // failure here is only logged: refusing now would make them send it twice.
    if (/^(city|arena|post):/.test(channel)) {
      try {
        await this.notifications.aboutMessage(channel, Number(row.id), authorId, text);
      } catch (err) {
        this.log.warn(`couldn't tell anyone about a message: ${(err as Error).message}`);
      }
    }
    return String(row.id);
  }

  brake(userId: string, what: "messages" | "posts") {
    const ok = what === "messages" ? this.messageBrake.take(userId) : this.postBrake.take(userId);
    if (!ok) throw slowDown(what);
  }

  /** Who blocked whom between two people: "mine" (you blocked them), "theirs", or null. */
  async blockBetween(userId: string, otherId: string): Promise<"mine" | "theirs" | null> {
    return blockBetween(this.db, userId, otherId);
  }

  private async markRead(userId: string, channel: string) {
    const [last] = await this.db.select({ id: max(messages.id) }).from(messages).where(eq(messages.channel, channel));
    if (!last?.id) return;
    await this.mark(userId, channel, Number(last.id));
  }

  // Moves a read marker forward, never back (two tabs may report out of order).
  private async mark(userId: string, channel: string, lastReadId: number) {
    await this.db
      .insert(chatReads)
      .values({ userId, channel, lastReadId })
      .onConflictDoUpdate({ target: [chatReads.userId, chatReads.channel], set: { lastReadId: sql`greatest(${chatReads.lastReadId}, excluded.last_read_id)` } });
  }

  // Someone else, by login: not yourself, and someone who exists.
  private async someone(userId: string, login: string): Promise<UserRow> {
    const [found] = await this.db.select().from(users).where(eq(users.login, login));
    const other = found ?? (await this.passerby(login));
    if (!other) throw new NotFoundException({ message: "There's nobody by that name in the city.", code: "nobodyInCity" });
    if (other.id === userId) throw new BadRequestException({ message: "That's you.", code: "thatsYou" });
    return other;
  }

  // Passers-by are made up in the browser, with no account, until someone writes to one: then a message needs an author.
  private async passerby(login: string): Promise<UserRow | undefined> {
    const name = passerbyName(login);
    if (!name) return undefined;
    await this.db.insert(users).values({ login, name }).onConflictDoNothing();
    const [made] = await this.db.select().from(users).where(eq(users.login, login));
    return made;
  }

  // Whether `userId` may read a channel: a city's room, its arena's and a post's replies are public; a DM is its two people's;
  // a house's living room is its flatmates' and the guests they let in; a knock's thread, the applicant's and the house's.
  private async canRead(channel: string, userId: string): Promise<boolean> {
    if (channel.startsWith("city:") || channel.startsWith("arena:") || channel.startsWith("post:")) return true;
    const pair = dmPeople(channel);
    if (pair) return pair.includes(userId);
    if (channel.startsWith("house:")) return !!(await this.houses.membership(channel.slice(6), userId)) || (await isChatGuest(this.db, channel.slice(6), userId));
    if (channel.startsWith("application:")) {
      const [app] = await this.db.select().from(applications).where(eq(applications.id, channel.slice(12)));
      return !!app && (app.applicantId === userId || !!(await this.houses.membership(app.houseId, userId)));
    }
    return false;
  }
}

/** Trims a text and checks it isn't empty or too long. Stored as typed: the web shows it as plain text. */
export function cleanText(body: string, maxLength: number): string {
  // Control characters (other than new lines and tabs) have no place in a chat, and Postgres refuses a NUL.
  // eslint-disable-next-line no-control-regex
  const text = (body ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!text) throw new BadRequestException({ message: "Write something first.", code: "writeSomething" });
  if (text.length > maxLength) throw new BadRequestException({ message: `Keep it under ${maxLength} characters.`, code: "tooLong", max: maxLength });
  return text;
}
