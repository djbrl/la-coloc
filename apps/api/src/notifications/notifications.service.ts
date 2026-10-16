// La Coloc's notifications, and the two invitations that make most of them. GitHub can't message a user on our
// behalf (an App has no app-to-user messages), so the news lives here and shows under the bell in the top bar.
//
// Nothing here is free text: the team chose no direct messages (a house's channel and a knock's thread are the only
// conversations). An invitation is a structured action, and every notification is drawn by the web in its own words.
//
// Two invitations:
// - house_invite: a flatmate offers their house's free room to someone with no house. Saying yes moves them in,
//   through the same moveInto the doorbell uses, so the rules match a knock that the house voted for.
// - rent_together: someone with no house asks another to rent a server together. Saying yes only tells the sender;
//   renting is the existing flow (an empty plot, "Rent a flat"), nothing new.
//
// And news from the doorbell, through its listener: a knock on your house, and the answer to your knock.
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Db, houses, type InviteState, memberships, type NotificationKind, notifications, rooms, users } from "@coloc/db";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { Subject } from "rxjs";
import type { AuthConfig } from "../auth/auth.config";
import { AUTH_CONFIG } from "../auth/auth.service";
import { DB } from "../db/db.module";
import { DoorbellService, type KnockEvent } from "../doorbell/doorbell.service";
import type { PersonView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { moveInto } from "../houses/move-in";

// An invitation nobody answered for a week is stale: the room may have changed, the person moved on.
export const INVITE_DAYS = 7;
// How many invitations (of both kinds) one person may send in a day: enough to fill a house, not to spam a city.
export const INVITES_PER_DAY = 10;
// How many notifications the bell lists.
const RECENT = 30;
const DAY_MS = 24 * 3600 * 1000;

type UserRow = typeof users.$inferSelect;
type Row = typeof notifications.$inferSelect;

/** One notification, as its recipient sees it under the bell. Mirrored in apps/web/src/types.ts. */
export interface NotificationView {
  id: string;
  kind: NotificationKind;
  // Invitations only: open, accepted, declined, withdrawn or expired. Null for news.
  state: InviteState | null;
  from: PersonView | null;
  house: { id: string; name: string; city: string } | null;
  room: string | null;
  // The knock it's about (knock, knock_answer), and how the vote went (knock_answer).
  applicationId: string | null;
  verdict: "admitted" | "declined" | null;
  createdAt: string;
  read: boolean;
}

/** The bell: how many are unread, the most recent ones, and the invitations you sent that are still waiting. */
export interface NotificationsView {
  unread: number;
  items: NotificationView[];
  sent: { id: string; kind: "house_invite" | "rent_together"; to: string; houseId: string | null }[];
}

const person = (u: Pick<UserRow, "login" | "name" | "avatarUrl" | "githubId">): PersonView => ({
  login: u.login,
  name: u.name,
  avatarUrl: u.avatarUrl,
  github: u.githubId !== null,
});

@Injectable()
export class NotificationsService {
  // The login of someone who just got a notification: the lobby's live line tells them, if they're online.
  readonly pushes = new Subject<string>();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly doorbell: DoorbellService,
    @Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, "devLogin">,
  ) {
    doorbell.listen((e) => this.fromDoorbell(e));
  }

  // ---- Invitations ----

  /**
   * A flatmate (or the chef) of `houseId` invites `toLogin`, who has no house, to take a free room: `room` if given,
   * else the first free one. Refused for yourself, an example person, someone housed, an example house or the
   * workshop, a full house, a second open invitation to the same person, and past the day's limit.
   */
  async inviteToHouse(senderId: string, toLogin: string, houseId: string, room?: string | null): Promise<{ id: string }> {
    const to = await this.recipient(senderId, toLogin);
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    if (!house) throw new NotFoundException("No such house.");
    if (!(await this.houses.membership(houseId, senderId))) throw new ForbiddenException("Only the people who live in a house can invite someone to it.");
    if (house.demo) throw new ConflictException("This is an example house: nobody can move in.");
    if (house.tutorial) throw new ConflictException("The workshop is for practice. Invite them to a real house.");
    if (await this.housed(to.id)) throw new ConflictException("They already live in a house.");
    const free = await this.db
      .select({ name: rooms.name })
      .from(rooms)
      .where(and(eq(rooms.houseId, houseId), isNull(rooms.occupantId), eq(rooms.demo, false), room ? eq(rooms.name, room) : undefined))
      .orderBy(asc(rooms.name))
      .limit(1);
    if (!free.length) throw new ConflictException(room ? "That room isn't free any more." : "Your house is full: there's no free room to offer.");
    await this.brake(senderId, to.id, "house_invite");
    return this.create({ userId: to.id, kind: "house_invite", fromId: senderId, houseId, room: free[0].name, state: "open" });
  }

  /** Someone with no house asks `toLogin`, who has none either, to rent a server together. */
  async rentTogether(senderId: string, toLogin: string): Promise<{ id: string }> {
    const to = await this.recipient(senderId, toLogin);
    if (await this.housed(senderId)) throw new ConflictException("You already live in a house. Invite them to it instead.");
    if (await this.housed(to.id)) throw new ConflictException("They already live in a house. Knock on theirs instead.");
    await this.brake(senderId, to.id, "rent_together");
    return this.create({ userId: to.id, kind: "rent_together", fromId: senderId, state: "open" });
  }

  /**
   * The recipient says yes. A house invitation moves them into its room, if it's still free and they still have no
   * house; otherwise it expires, and the refusal says why. Renting together tells the sender. Returns where they
   * moved in, for the web's keys.
   */
  async accept(userId: string, id: string): Promise<{ kind: NotificationKind; house: { id: string; name: string; city: string } | null; room: string | null }> {
    const n = await this.openInvite(userId, id);
    const [me] = await this.db.select().from(users).where(eq(users.id, userId));
    const name = me.name ?? me.login;

    if (n.kind === "rent_together") {
      if (await this.housed(userId)) return this.expire(n, "You already live in a house now.");
      await this.decide(n, "accepted");
      if (n.fromId) await this.create({ userId: n.fromId, kind: "rent_together_yes", fromId: userId });
      return { kind: n.kind, house: null, room: null };
    }

    // A house invitation.
    const [house] = n.houseId ? await this.db.select().from(houses).where(eq(houses.id, n.houseId)) : [];
    if (!house || !n.room) return this.expire(n, "That house is gone.");
    if (!n.fromId || !(await this.houses.membership(house.id, n.fromId))) return this.expire(n, "They don't live there any more, so the invitation lapsed.");
    if (await this.housed(userId)) return this.expire(n, "You already live in a house now.");
    const moved = await this.db.transaction(async (tx) => {
      if (!(await moveInto(tx, house.id, n.room!, userId))) return false;
      await tx.update(notifications).set({ state: "accepted", decidedAt: new Date(), readAt: new Date() }).where(eq(notifications.id, n.id));
      return true;
    });
    if (!moved) return this.expire(n, "Someone else took that room first.");

    // Their other house invitations can't be taken now (one house each), and their own knock here is answered.
    await this.db
      .update(notifications)
      .set({ state: "expired", decidedAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.kind, "house_invite"), eq(notifications.state, "open")));
    await this.doorbell.closeOwnKnock(house.id, userId);
    await this.doorbell.movedIn(house.id, n.room, name);
    await this.create({ userId: n.fromId, kind: "invite_accepted", fromId: userId, houseId: house.id, room: n.room });
    this.houses.changes.next(house.id);
    return { kind: n.kind, house: { id: house.id, name: house.name, city: house.city }, room: n.room };
  }

  /** The recipient says no. The sender isn't told (they see their invitation is no longer waiting). */
  async decline(userId: string, id: string) {
    const n = await this.openInvite(userId, id);
    await this.decide(n, "declined");
  }

  /** The sender takes their invitation back, while it's still open. */
  async withdraw(userId: string, id: string) {
    const [n] = await this.db.select().from(notifications).where(eq(notifications.id, id));
    if (!n || n.fromId !== userId || !isInvite(n.kind)) throw new NotFoundException("No such invitation.");
    if (n.state !== "open") throw new ConflictException("This invitation has already been answered.");
    await this.db.update(notifications).set({ state: "withdrawn", decidedAt: new Date() }).where(eq(notifications.id, id));
    this.pushes.next(await this.loginOf(n.userId));
  }

  // ---- The bell ----

  async list(userId: string): Promise<NotificationsView> {
    // Invitations left unanswered for a week expire as they're read.
    await this.db
      .update(notifications)
      .set({ state: "expired", decidedAt: new Date() })
      .where(and(eq(notifications.state, "open"), lt(notifications.createdAt, new Date(Date.now() - INVITE_DAYS * DAY_MS)), or(eq(notifications.userId, userId), eq(notifications.fromId, userId))));

    const rows = await this.db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(RECENT);
    const [{ unread }] = await this.db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    const sent = await this.db
      .select({ id: notifications.id, kind: notifications.kind, to: users.login, houseId: notifications.houseId })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(and(eq(notifications.fromId, userId), eq(notifications.state, "open")));

    const people = await this.usersById(rows.map((r) => r.fromId).filter((x): x is string => !!x));
    const houseIds = [...new Set(rows.map((r) => r.houseId).filter((x): x is string => !!x))];
    const hs = houseIds.length ? await this.db.select({ id: houses.id, name: houses.name, city: houses.city }).from(houses).where(inArray(houses.id, houseIds)) : [];
    return {
      unread,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        state: r.state,
        from: r.fromId && people.get(r.fromId) ? person(people.get(r.fromId)!) : null,
        house: hs.find((h) => h.id === r.houseId) ?? null,
        room: r.room,
        applicationId: r.payload.applicationId ?? null,
        verdict: r.payload.verdict ?? null,
        createdAt: r.createdAt.toISOString(),
        read: r.readAt !== null,
      })),
      sent: sent.map((s) => ({ id: s.id, kind: s.kind as "house_invite" | "rent_together", to: s.to, houseId: s.houseId })),
    };
  }

  /** Marks some of your notifications read (all of them when `ids` is missing). Others' are never touched. */
  async markRead(userId: string, ids?: string[]) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids ? inArray(notifications.id, ids.length ? ids : [""]) : undefined));
  }

  // ---- Rules ----

  /**
   * An example person: seeded (living in an example house, or in an example room of the workshop), or anyone who
   * never logged in with GitHub while the dev login is off. With the dev login on, someone who logged in by name is
   * real, so two people can try invitations on a laptop.
   */
  async isExample(user: Pick<UserRow, "id" | "githubId">): Promise<boolean> {
    const [inDemo] = await this.db
      .select({ id: memberships.userId })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .where(and(eq(memberships.userId, user.id), eq(houses.demo, true)))
      .limit(1);
    if (inDemo) return true;
    const [demoRoom] = await this.db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.occupantId, user.id), eq(rooms.demo, true))).limit(1);
    if (demoRoom) return true;
    return user.githubId === null && !this.config.devLogin;
  }

  /** Lives in a house: belongs to one that isn't the workshop (practice doesn't count, as in /api/me). */
  private async housed(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: memberships.houseId })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .where(and(eq(memberships.userId, userId), eq(houses.tutorial, false)))
      .limit(1);
    return !!row;
  }

  // The person an invitation goes to: someone real who isn't you.
  private async recipient(senderId: string, login: string): Promise<UserRow> {
    const [to] = await this.db.select().from(users).where(eq(users.login, login));
    if (!to) throw new NotFoundException("Nobody by that name lives in La Coloc.");
    if (to.id === senderId) throw new BadRequestException("You can't invite yourself.");
    if (await this.isExample(to)) throw new ConflictException("This is an example person: nobody would get the invitation.");
    return to;
  }

  // One open invitation of a kind per pair; not again the day they said no; at most INVITES_PER_DAY a day.
  private async brake(senderId: string, toId: string, kind: "house_invite" | "rent_together") {
    const pair = and(eq(notifications.fromId, senderId), eq(notifications.userId, toId), eq(notifications.kind, kind));
    const [open] = await this.db.select({ id: notifications.id }).from(notifications).where(and(pair, eq(notifications.state, "open"))).limit(1);
    if (open) throw new ConflictException("You've already invited them. They'll see it under their bell.");
    const today = new Date(Date.now() - DAY_MS);
    const [no] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(pair, eq(notifications.state, "declined"), gte(notifications.decidedAt, today)))
      .limit(1);
    if (no) throw new ConflictException("They said no today. Try again another day.");
    const [{ sent }] = await this.db
      .select({ sent: count() })
      .from(notifications)
      .where(and(eq(notifications.fromId, senderId), inArray(notifications.kind, ["house_invite", "rent_together"]), gte(notifications.createdAt, today)));
    if (sent >= INVITES_PER_DAY) throw new HttpException("That's a lot of invitations for one day. Try again tomorrow.", HttpStatus.TOO_MANY_REQUESTS);
  }

  // ---- The doorbell's news ----

  private async fromDoorbell(e: KnockEvent) {
    if (e.type === "knocked") {
      // Everyone who lives in the house hears the knock (the applicant doesn't live there).
      const flatmates = await this.db.select({ id: memberships.userId }).from(memberships).where(and(eq(memberships.houseId, e.houseId), ne(memberships.userId, e.applicantId)));
      for (const f of flatmates)
        await this.create({ userId: f.id, kind: "knock", fromId: e.applicantId, houseId: e.houseId, room: e.room, payload: { applicationId: e.applicationId } });
    } else {
      await this.create({ userId: e.applicantId, kind: "knock_answer", houseId: e.houseId, room: e.room, payload: { applicationId: e.applicationId, verdict: e.verdict } });
    }
  }

  // ---- Helpers ----

  private async create(values: typeof notifications.$inferInsert): Promise<{ id: string }> {
    const [row] = await this.db.insert(notifications).values(values).returning({ id: notifications.id });
    this.pushes.next(await this.loginOf(values.userId));
    return row;
  }

  // An invitation for `userId` that's still open. Anyone else's is "no such invitation", like a knock.
  private async openInvite(userId: string, id: string): Promise<Row> {
    const [n] = id.match(/^[0-9a-f-]{36}$/i) ? await this.db.select().from(notifications).where(eq(notifications.id, id)) : [];
    if (!n || n.userId !== userId) throw new NotFoundException("No such invitation.");
    if (!isInvite(n.kind)) throw new ConflictException("There's nothing to answer here.");
    if (n.state === "open" && n.createdAt.getTime() < Date.now() - INVITE_DAYS * DAY_MS) return this.expire(n, "This invitation has expired.");
    if (n.state !== "open") throw new ConflictException(n.state === "withdrawn" ? "They took this invitation back." : "This invitation has already been answered.");
    return n;
  }

  private async decide(n: Row, state: InviteState) {
    await this.db.update(notifications).set({ state, decidedAt: new Date(), readAt: n.readAt ?? new Date() }).where(eq(notifications.id, n.id));
  }

  // Marks an invitation expired, then refuses with why. Returns `never`: callers `return` it to stop there.
  private async expire(n: Row, why: string): Promise<never> {
    await this.decide(n, "expired");
    throw new ConflictException(why);
  }

  private async usersById(ids: string[]): Promise<Map<string, UserRow>> {
    if (!ids.length) return new Map();
    const rows = await this.db.select().from(users).where(inArray(users.id, [...new Set(ids)]));
    return new Map(rows.map((u) => [u.id, u]));
  }

  private async loginOf(userId: string): Promise<string> {
    const [u] = await this.db.select({ login: users.login }).from(users).where(eq(users.id, userId));
    return u?.login ?? "";
  }
}

const isInvite = (kind: NotificationKind) => kind === "house_invite" || kind === "rent_together";
