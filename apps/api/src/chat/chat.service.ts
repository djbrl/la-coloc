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
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { applications, blocks, boardPosts, chatReads, type Db, houses, messages, type ReportKind, reports, users } from "@coloc/db";
import { and, count, desc, eq, gt, inArray, like, max, ne, or, sql } from "drizzle-orm";
import { Subject } from "rxjs";
import { DB } from "../db/db.module";
import { blockBetween, blockedBy, channelMessages, person } from "../doorbell/queries";
import type { MessageView, PersonView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
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

export interface ConversationsView {
  // Unread messages over all your conversations: the count on the chat button.
  unread: number;
  items: ConversationItem[];
}

/** One conversation, opened. `canWrite` false says why in `why` (an example person, a block). */
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
export type CityChange = { city: string; what: "chat" | "board" | "arena" };

@Injectable()
export class ChatService {
  // The login of someone with a new direct message (and the sender, for their other tabs).
  readonly pushes = new Subject<string>();
  // Something new in a city's room, on its board, or in its Arena.
  readonly changes = new Subject<CityChange>();
  // The brakes: messages (a DM, the city's room, a reply) and board posts, per person.
  readonly messageBrake = new Limiter(MESSAGES.count, MESSAGES.perMs);
  readonly postBrake = new Limiter(POSTS.count, POSTS.perMs);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly notifications: NotificationsService,
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
    this.changes.next({ city, what: "chat" });
    return { id };
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
    const example = await this.notifications.isExample(other);
    const block = await this.blockBetween(userId, other.id);
    const list = await channelMessages(this.db, channel, CITY_HISTORY, userId);
    await this.markRead(userId, channel);
    const why = example ? "This is an example person: nobody would read your message." : block === "mine" ? "You blocked them." : block === "theirs" ? "They aren't taking messages from you." : null;
    return { with: { ...person(other), example }, blocked: block === "mine", canWrite: !why, why, messages: list };
  }

  /** A direct message to `login`. Not to yourself, an example person, or anyone either of you blocked. */
  async sendDm(userId: string, login: string, body: string): Promise<{ id: string }> {
    const other = await this.someone(userId, login);
    if (await this.notifications.isExample(other)) throw new ConflictException({ message: "This is an example person: nobody would read your message.", code: "examplePersonMessage" });
    const block = await this.blockBetween(userId, other.id);
    if (block === "mine") throw new ForbiddenException({ message: "You blocked them. Unblock them to write.", code: "youBlocked" });
    if (block === "theirs") throw new ForbiddenException({ message: "They aren't taking messages from you.", code: "theyBlocked" });
    const channel = dmChannel(userId, other.id);
    const id = await this.write(channel, userId, body);
    // Your own message is read by you.
    await this.markRead(userId, channel);
    const [me] = await this.db.select({ login: users.login }).from(users).where(eq(users.id, userId));
    this.pushes.next(other.login);
    if (me) this.pushes.next(me.login);
    return { id };
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
    await this.db
      .insert(chatReads)
      .values({ userId, channel, lastReadId: Number(last.id) })
      .onConflictDoUpdate({ target: [chatReads.userId, chatReads.channel], set: { lastReadId: sql`greatest(${chatReads.lastReadId}, excluded.last_read_id)` } });
  }

  // Someone else, by login: not yourself, and someone who exists.
  private async someone(userId: string, login: string): Promise<UserRow> {
    const [other] = await this.db.select().from(users).where(eq(users.login, login));
    if (!other) throw new NotFoundException({ message: "There's nobody by that name in the city.", code: "nobodyInCity" });
    if (other.id === userId) throw new BadRequestException({ message: "That's you.", code: "thatsYou" });
    return other;
  }

  // Whether `userId` may read a channel: a city's room, its arena's and a post's replies are public; a DM is its two people's;
  // a house's living room is its flatmates'; a knock's thread, the applicant's and the house's.
  private async canRead(channel: string, userId: string): Promise<boolean> {
    if (channel.startsWith("city:") || channel.startsWith("arena:") || channel.startsWith("post:")) return true;
    const pair = dmPeople(channel);
    if (pair) return pair.includes(userId);
    if (channel.startsWith("house:")) return !!(await this.houses.membership(channel.slice(6), userId));
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
