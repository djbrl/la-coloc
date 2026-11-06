// Keeping people safe in the chat: blocking someone, muting someone or a group chat, and reporting a person, a
// message, a post or a group chat to the admins.
//
// - Block: no direct messages either way, no friend requests or invitations either way, and their words are hidden
//   from you everywhere (doorbell/queries.ts `blockedBy`). A block ends a friendship. They aren't told.
// - Mute: no bell and no unread dot from that person or group chat; their words still show (mutes.ts). They aren't told.
// - Report: a copy of what was reported is kept, and each admin (COLOC_ADMINS) hears of it under their bell. Nothing
//   happens by itself: the admins read and act by hand.
//
// Settings lists what you blocked and muted, each with its way back (`view`).
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { applications, blocks, boardPosts, type Db, houses, messages, mutes, type ReportKind, reports, users } from "@coloc/db";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { AuthConfig } from "../auth/auth.config";
import { AUTH_CONFIG } from "../auth/auth.service";
import { cityChannel, dmPeople } from "../chat/channels";
import { DB } from "../db/db.module";
import { houseOfChannel, person } from "../doorbell/queries";
import { isChatGuest } from "../houses/guests";
import type { PersonView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { unfriend } from "../notifications/friends";
import { NotificationsService } from "../notifications/notifications.service";
import { isGroupChannel } from "./mutes";

type UserRow = typeof users.$inferSelect;

/** A muted group chat, as Settings lists it: its channel, what kind of place, and its name. */
export interface MutedGroup {
  channel: string;
  place: "city" | "arena" | "house";
  name: string;
}

/** What you blocked and muted (Settings). Mirrored in apps/web/src/types.ts. */
export interface SafetyView {
  blocked: PersonView[];
  muted: PersonView[];
  groups: MutedGroup[];
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

// What a report is about: a message or a post by id, a person by login, a group chat by channel.
export interface ReportInput {
  kind: ReportKind;
  id: string;
  reason?: string | null;
}

// The excerpt an admin's bell line carries, and how much of a group chat a report keeps.
const EXCERPT = 140;
const GROUP_LINES = 20;

@Injectable()
export class SafetyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly notifications: NotificationsService,
    @Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, "admins">,
  ) {}

  /** Everyone you blocked and muted, and the group chats you muted, the latest first. */
  async view(userId: string): Promise<SafetyView> {
    const blocked = await this.db
      .select({ u: users })
      .from(blocks)
      .innerJoin(users, eq(users.id, blocks.blockedId))
      .where(eq(blocks.blockerId, userId))
      .orderBy(desc(blocks.createdAt));
    const muted = await this.db
      .select({ u: users })
      .from(mutes)
      .innerJoin(users, eq(users.id, mutes.mutedId))
      .where(eq(mutes.userId, userId))
      .orderBy(desc(mutes.createdAt));
    const groupRows = await this.db
      .select({ channel: mutes.channel })
      .from(mutes)
      .where(and(eq(mutes.userId, userId), isNotNull(mutes.channel)))
      .orderBy(desc(mutes.createdAt));
    const channels = groupRows.map((g) => g.channel).filter((c): c is string => !!c);
    const houseIds = channels.map((c) => houseOfChannel(c)?.houseId).filter((id): id is string => !!id);
    const names = new Map(houseIds.length ? (await this.db.select({ id: houses.id, name: houses.name }).from(houses).where(inArray(houses.id, houseIds))).map((h) => [h.id, h.name]) : []);
    const groups = channels.map((channel): MutedGroup => {
      const house = houseOfChannel(channel);
      if (house) return { channel, place: "house", name: names.get(house.houseId) ?? house.houseId };
      const [place, city] = channel.split(":");
      return { channel, place: place === "arena" ? "arena" : "city", name: city };
    });
    return { blocked: blocked.map((r) => person(r.u)), muted: muted.map((r) => person(r.u)), groups };
  }

  // ---- Blocking ----

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

  /** The people you blocked (their messages' tools say "Unblock"). */
  async blocks(userId: string): Promise<{ people: PersonView[] }> {
    return { people: (await this.view(userId)).blocked };
  }

  // ---- Muting ----

  /** Mutes a person (by login) or a group chat you can read (by channel). Twice is fine. */
  async mute(userId: string, target: { login?: string; channel?: string }) {
    if (target.login) {
      const other = await this.someone(userId, target.login);
      await this.db.insert(mutes).values({ userId, mutedId: other.id }).onConflictDoNothing();
      return;
    }
    const channel = target.channel ?? "";
    if (!isGroupChannel(channel) || !(await this.canRead(channel, userId))) throw new NotFoundException({ message: "There's no such group chat.", code: "noGroup" });
    await this.db.insert(mutes).values({ userId, channel }).onConflictDoNothing();
  }

  async unmute(userId: string, target: { login?: string; channel?: string }) {
    if (target.login) {
      const [other] = await this.db.select({ id: users.id }).from(users).where(eq(users.login, target.login));
      if (other) await this.db.delete(mutes).where(and(eq(mutes.userId, userId), eq(mutes.mutedId, other.id)));
      return;
    }
    if (target.channel) await this.db.delete(mutes).where(and(eq(mutes.userId, userId), eq(mutes.channel, target.channel)));
  }

  // ---- Reports ----

  /**
   * Reports a message, a board post, a person or a group chat. Only something you can read, and not yourself or your
   * own words. Reporting the same thing twice is fine: it counts once, and the admins hear of it once. A copy of the
   * words is kept for them (a group chat's last lines).
   */
  async report(userId: string, input: ReportInput) {
    const found = await this.reported(userId, input);
    if (found.authorId === userId) throw new BadRequestException({ message: "That's yours: delete it instead.", code: "reportOwn" });
    if (input.kind === "message" && !found.authorId) throw new BadRequestException({ message: "That's the house speaking: there's nobody to report.", code: "reportHouse" });
    const [row] = await this.db
      .insert(reports)
      .values({ reporterId: userId, kind: input.kind, targetId: found.targetId, channel: found.channel, authorId: found.authorId, body: found.body, reason: input.reason ?? null })
      .onConflictDoNothing()
      .returning({ id: reports.id });
    if (!row) return;
    // The admins hear of it, except the one reporting.
    const admins = this.config.admins.map((a) => a.toLowerCase());
    if (!admins.length) return;
    const people = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(sql`lower(${users.login})`, admins));
    const about = found.authorId ? ((await this.db.select({ login: users.login }).from(users).where(eq(users.id, found.authorId)))[0]?.login ?? null) : null;
    const excerpt = found.body.replace(/\s+/g, " ").trim().slice(0, EXCERPT);
    await this.notifications.reportFiled(
      people.map((p) => p.id).filter((id) => id !== userId),
      userId,
      { kind: input.kind, about, excerpt },
    );
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

  // What a report points at, found and checked: you can read it, it exists. Throws a 404 otherwise.
  private async reported(userId: string, input: ReportInput): Promise<{ targetId: string; channel: string; authorId: string | null; body: string }> {
    const none = (what: "message" | "post" | "person" | "group"): never => {
      throw new NotFoundException(
        {
          message: { message: "There's no such message.", code: "noMessage" },
          post: { message: "There's no such post.", code: "noPost" },
          person: { message: "There's nobody by that name in the city.", code: "nobodyInCity" },
          group: { message: "There's no such group chat.", code: "noGroup" },
        }[what],
      );
    };
    switch (input.kind) {
      case "message": {
        const id = Number(input.id);
        if (!Number.isSafeInteger(id) || id <= 0) return none("message");
        const [m] = await this.db.select().from(messages).where(eq(messages.id, id));
        if (!m || !(await this.canRead(m.channel, userId))) return none("message");
        return { targetId: String(id), channel: m.channel, authorId: m.authorId, body: m.body };
      }
      case "post": {
        if (!/^[0-9a-f-]{36}$/.test(input.id)) return none("post");
        const [p] = await this.db.select().from(boardPosts).where(eq(boardPosts.id, input.id));
        if (!p) return none("post");
        return { targetId: p.id, channel: cityChannel(p.city), authorId: p.authorId, body: `${p.title}\n\n${p.body}` };
      }
      case "person": {
        const [u] = await this.db.select().from(users).where(eq(users.login, input.id.replace(/^@/, "")));
        if (!u) return none("person");
        if (u.id === userId) throw new BadRequestException({ message: "That's you.", code: "thatsYou" });
        return { targetId: u.id, channel: "", authorId: u.id, body: `@${u.login}` };
      }
      case "group": {
        const channel = input.id;
        if (!isGroupChannel(channel) || !(await this.canRead(channel, userId))) return none("group");
        // Its last lines, oldest first, for the admins to read.
        const last = await this.db
          .select({ body: messages.body, login: users.login })
          .from(messages)
          .leftJoin(users, eq(users.id, messages.authorId))
          .where(eq(messages.channel, channel))
          .orderBy(desc(messages.id))
          .limit(GROUP_LINES);
        const body = last
          .reverse()
          .map((m) => `${m.login ?? "house"}: ${m.body}`)
          .join("\n");
        return { targetId: channel, channel, authorId: null, body: body || "(empty)" };
      }
    }
  }

  // Someone else, by login: not yourself, and someone who exists.
  private async someone(userId: string, login: string): Promise<UserRow> {
    const [other] = await this.db.select().from(users).where(eq(users.login, login));
    if (!other) throw new NotFoundException({ message: "There's nobody by that name in the city.", code: "nobodyInCity" });
    if (other.id === userId) throw new BadRequestException({ message: "That's you.", code: "thatsYou" });
    return other;
  }

  // Whether `userId` may read a channel: a city's room, its arena's and a post's replies are public; a DM is its two
  // people's; a house's living room is its flatmates' and the guests they let in; a knock's thread, the applicant's
  // and the house's.
  private async canRead(channel: string, userId: string): Promise<boolean> {
    if (channel.startsWith("city:") || channel.startsWith("arena:") || channel.startsWith("post:")) return true;
    const pair = dmPeople(channel);
    if (pair) return pair.includes(userId);
    const house = houseOfChannel(channel);
    // A newcomer's own channel in the workshop is theirs alone.
    if (house?.owner) return house.owner === userId;
    if (house) return !!(await this.houses.membership(house.houseId, userId)) || (await isChatGuest(this.db, house.houseId, userId));
    if (channel.startsWith("application:")) {
      const [app] = await this.db.select().from(applications).where(eq(applications.id, channel.slice(12)));
      return !!app && (app.applicantId === userId || !!(await this.houses.membership(app.houseId, userId)));
    }
    return false;
  }
}
