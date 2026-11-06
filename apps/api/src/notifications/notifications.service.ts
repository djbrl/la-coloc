// La Coloc's notifications, and the two invitations that make most of them. GitHub can't message a user on our
// behalf (an App has no app-to-user messages), so the news lives here and shows under the bell in the top bar.
//
// Nothing here is free text: the team chose no direct messages (a house's channel and a knock's thread are the only
// conversations). An invitation is a structured action, and every notification is drawn by the web in its own words.
//
// Two invitations:
// - house_invite: a flatmate offers their house's free room to someone, housed or not. Saying yes moves them in,
//   through the same moveInto the doorbell uses, so the rules match a knock that the house voted for. Someone who
//   already lives elsewhere gains a room here and keeps the old one, up to MAX_ROOMS_PER_PERSON.
// - rent_together: someone asks another to share a house, whether or not either lives somewhere already. Saying yes
//   only tells the sender; renting is the existing flow (an empty plot, "Rent a flat"), nothing new.
//
// (Teaming up on a room's project is gone: a room is one person's, and working together goes through reviews. Old
// team_invite, team_ask, team_accepted and team_declined rows may still be in the database: the bell leaves them out,
// and they can't be answered.)
//
// And one for a full house's group chat (askToChat), since there's no room to knock on:
// - guest_ask: someone from outside asks to join it. Every flatmate gets one; the first answer counts for all of them.
//
// And news from the doorbell, through its listener: a knock on your house, and the answer to your knock.
//
// And a flatmate's failed build (build_failed), so you can offer a hand. Only your own house hears about it, only
// here, and never the person who ran it: they're already looking at it.
//
// And words meant for you (message-news.ts): a reply under your board post (post_reply), and "@you" (mention).
// And friends (askFriend): friend_request is answered like an invitation, and saying yes makes a friendship
// (friends.ts) and tells the sender (friend_accepted). A no isn't sent back.
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { boardPosts, type Db, type deployments, houseGuests, houses, type InviteState, memberships, type NotificationKind, notifications, rooms, users } from "@coloc/db";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { Subject, type Subscription } from "rxjs";
import type { AuthConfig } from "../auth/auth.config";
import { AUTH_CONFIG } from "../auth/auth.service";
import { DB } from "../db/db.module";
import { DoorbellService, type KnockEvent } from "../doorbell/doorbell.service";
import { blockBetween, blockersOf } from "../doorbell/queries";
import type { PersonView } from "../houses/house.types";
import { guestStanding, isChatGuest } from "../houses/guests";
import { HousesService } from "../houses/houses.service";
import { MAX_ROOMS_PER_PERSON } from "../houses/money";
import { moveInto, roomsRented } from "../houses/move-in";
import { messageNews } from "./message-news";
import { areFriends, befriend } from "./friends";

// An invitation nobody answered for a week is stale: the room may have changed, the person moved on.
export const INVITE_DAYS = 7;
// How many invitations (of both kinds) one person may send in a day: enough to fill a house, not to spam a city.
export const INVITES_PER_DAY = 10;
// How many notifications the bell lists.
const RECENT = 30;
const DAY_MS = 24 * 3600 * 1000;
// Why an invitation lapsed, as the code the web says in French (see `expire`).
const LAPSED: Record<string, string> = {
  "That house is gone.": "houseGone",
  "They don't live there any more, so the invitation lapsed.": "senderMovedOut",
  "Someone else took that room first.": "roomTakenFirst",
  "This invitation has expired.": "inviteExpired",
  "You don't live in that house any more, so the request lapsed.": "guestLeftHouse",
  "That friend request lapsed.": "friendRequestLapsed",
};

// The kinds that are invitations (they have a state, and are answered), and the ones the day's brake counts.
const INVITES: NotificationKind[] = ["house_invite", "rent_together", "guest_ask", "friend_request"];
type InviteKind = "house_invite" | "rent_together" | "friend_request";
// The kinds teaming up left behind. Never made any more, never listed, never answered.
const RETIRED: NotificationKind[] = ["team_invite", "team_ask", "team_accepted", "team_declined"];

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
  // Where a post_reply or a mention was said: a city's room, its arena, or under a board post (its title, and whether
  // it's yours). Null for the other kinds, and once the post is gone.
  chat?: { place: "city" | "arena" | "post"; city: string; post: { id: string; title: string; mine: boolean } | null } | null;
  createdAt: string;
  read: boolean;
}

/** The bell: how many are unread, the most recent ones, and the invitations you sent that are still waiting. */
export interface NotificationsView {
  unread: number;
  items: NotificationView[];
  sent: { id: string; kind: InviteKind; to: string; houseId: string | null }[];
}

const person = (u: Pick<UserRow, "login" | "name" | "avatarUrl" | "githubId" | "badge">): PersonView => ({
  login: u.login,
  name: u.name,
  avatarUrl: u.avatarUrl,
  github: u.githubId !== null,
  badge: u.badge ?? null,
});

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  // The login of someone who just got a notification: the lobby's live line tells them, if they're online.
  readonly pushes = new Subject<string>();
  private deploys?: Subscription;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly doorbell: DoorbellService,
    @Inject(AUTH_CONFIG) private readonly config: Pick<AuthConfig, "devLogin">,
  ) {
    doorbell.listen((e) => this.fromDoorbell(e));
  }

  onModuleInit() {
    this.deploys = this.houses.deployFinished.subscribe((e) => {
      this.fromDeploy(e.houseId, e.deployment).catch(() => undefined);
    });
  }

  onModuleDestroy() {
    this.deploys?.unsubscribe();
  }

  // ---- Invitations ----

  /**
   * A flatmate (or the chef) of `houseId` invites `toLogin` to take a free room: `room` if given, else the first free
   * one. They may live somewhere else already. Refused for yourself, an example person, a flatmate of this house, an
   * example house or the workshop, a full house, a second open invitation to the same person, and past the day's limit.
   */
  async inviteToHouse(senderId: string, toLogin: string, houseId: string, room?: string | null): Promise<{ id: string }> {
    const to = await this.recipient(senderId, toLogin);
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    if (!house) throw new NotFoundException({ message: "No such house.", code: "noHouse" });
    if (!(await this.houses.membership(houseId, senderId))) throw new ForbiddenException({ message: "Only the people who live in a house can invite someone to it.", code: "inviteMembersOnly" });
    if (house.demo) throw new ConflictException({ message: "This is an example house: nobody can move in.", code: "exampleHouseInvite" });
    if (house.tutorial) throw new ConflictException({ message: "The workshop is for practice. Invite them to a real house.", code: "workshopInvite" });
    if (await this.houses.membership(houseId, to.id)) throw new ConflictException({ message: "They already live in this house.", code: "alreadyFlatmate" });
    const free = await this.db
      .select({ name: rooms.name })
      .from(rooms)
      .where(and(eq(rooms.houseId, houseId), isNull(rooms.occupantId), eq(rooms.demo, false), room ? eq(rooms.name, room) : undefined))
      .orderBy(asc(rooms.name))
      .limit(1);
    if (!free.length)
      throw new ConflictException(
        room ? { message: "That room isn't free any more.", code: "roomNotFree" } : { message: "Your house is full: there's no free room to offer.", code: "houseFull" },
      );
    await this.brake(senderId, to.id, "house_invite");
    return this.create({ userId: to.id, kind: "house_invite", fromId: senderId, houseId, room: free[0].name, state: "open" });
  }

  /** Someone asks `toLogin` to share a house. Either of them may live somewhere already. */
  async rentTogether(senderId: string, toLogin: string): Promise<{ id: string }> {
    const to = await this.recipient(senderId, toLogin);
    await this.brake(senderId, to.id, "rent_together");
    return this.create({ userId: to.id, kind: "rent_together", fromId: senderId, state: "open" });
  }

  /**
   * The recipient says yes. A house invitation moves them into its room, if it's still free; otherwise it expires,
   * and the refusal says why. Someone at the room limit is refused and the invitation stays open, so they can end a
   * lease and say yes after all. Renting together tells the sender. Returns where they moved in, for the web's keys.
   */
  async accept(userId: string, id: string): Promise<{ kind: NotificationKind; house: { id: string; name: string; city: string } | null; room: string | null }> {
    const n = await this.openInvite(userId, id);
    if (n.kind === "friend_request") return this.acceptFriend(userId, n);
    if (n.kind === "guest_ask") return this.answerGuest(userId, n, "accepted");
    const [me] = await this.db.select().from(users).where(eq(users.id, userId));
    const name = me.name ?? me.login;

    if (n.kind === "rent_together") {
      if (!(await this.decide(n, "accepted"))) throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
      if (n.fromId) await this.create({ userId: n.fromId, kind: "rent_together_yes", fromId: userId });
      return { kind: n.kind, house: null, room: null };
    }

    // A house invitation.
    const [house] = n.houseId ? await this.db.select().from(houses).where(eq(houses.id, n.houseId)) : [];
    if (!house || !n.room) return this.expire(n, "That house is gone.");
    if (!n.fromId || !(await this.houses.membership(house.id, n.fromId))) return this.expire(n, "They don't live there any more, so the invitation lapsed.");
    const outcome = await this.db.transaction(async (tx) => {
      // Lock the person's own row, so two of their accepts (two houses, or a double click) take turns: the second
      // one then counts the first one's room.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      if ((await roomsRented(tx, userId)) >= MAX_ROOMS_PER_PERSON) return "limit";
      // Claim the invitation first: a second click finds it answered and stops without touching it.
      const claimed = await tx
        .update(notifications)
        .set({ state: "accepted", decidedAt: new Date(), readAt: new Date() })
        .where(and(eq(notifications.id, n.id), eq(notifications.state, "open")))
        .returning({ id: notifications.id });
      if (!claimed.length) return "answered";
      const lapse = async (why: string) => {
        await tx.update(notifications).set({ state: "expired" }).where(eq(notifications.id, n.id));
        return why;
      };
      if (!(await moveInto(tx, house.id, n.room!, userId))) return lapse("Someone else took that room first.");
      return "moved";
    });
    if (outcome === "answered") throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    if (outcome === "limit") throw new ConflictException({ message: `${MAX_ROOMS_PER_PERSON} rooms a person. End a lease to take another.`, code: "room_limit", max: MAX_ROOMS_PER_PERSON });
    if (outcome !== "moved") throw new ConflictException({ message: outcome, code: LAPSED[outcome] ?? "inviteLapsed" });

    // Their own knock here is answered. Their other invitations stay open: they can still say yes, up to the limit.
    await this.doorbell.closeOwnKnock(house.id, userId);
    await this.doorbell.movedIn(house.id, n.room, name);
    await this.create({ userId: n.fromId, kind: "invite_accepted", fromId: userId, houseId: house.id, room: n.room });
    this.houses.changes.next(house.id);
    return { kind: n.kind, house: { id: house.id, name: house.name, city: house.city }, room: n.room };
  }

  /** The recipient says no, and the sender is told, so they can ask someone else. */
  async decline(userId: string, id: string) {
    const n = await this.openInvite(userId, id);
    if (n.kind === "guest_ask") {
      await this.answerGuest(userId, n, "declined");
      return;
    }
    if (!(await this.decide(n, "declined"))) throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    // A friend request's no isn't sent back. Asking again waits a day, like any invitation (brake).
    if (n.kind === "friend_request") return;
    if (n.fromId) {
      const kind = n.kind === "rent_together" ? "rent_together_no" : "invite_declined";
      await this.create({ userId: n.fromId, kind, fromId: userId, houseId: n.houseId, room: n.room });
    }
  }

  /** The sender takes their invitation back, while it's still open. */
  async withdraw(userId: string, id: string) {
    const [n] = await this.db.select().from(notifications).where(eq(notifications.id, id));
    if (!n || n.fromId !== userId || !isInvite(n.kind)) throw new NotFoundException({ message: "No such invitation.", code: "noInvite" });
    if (n.state !== "open") throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    // Only while still open: an answer that lands first wins.
    const taken = await this.db
      .update(notifications)
      .set({ state: "withdrawn", decidedAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.state, "open")))
      .returning({ id: notifications.id });
    if (!taken.length) throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    this.pushes.next(await this.loginOf(n.userId));
  }

  // ---- A full house's group chat ----

  /**
   * Asks to join a house's group chat, when no room is free to knock on. Every flatmate hears of it under their bell,
   * except anyone who blocked you. An example house has nobody to answer, so its host lets you in with a word. Not at
   * the workshop, not if you live here or a room is free, and not again while you wait or the day they said no.
   */
  async askToChat(userId: string, houseId: string): Promise<{ status: "open" | "accepted" }> {
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    if (!house) throw new NotFoundException({ message: "No such house.", code: "noHouse" });
    if (house.tutorial) throw new ConflictException({ message: "This is an example house: nobody would answer.", code: "guestExampleHouse" });
    if (await this.houses.membership(houseId, userId)) throw new ConflictException({ message: "You live here: the chat is yours already.", code: "guestLivesHere" });
    const free = await this.db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.houseId, houseId), isNull(rooms.occupantId))).limit(1);
    if (free.length) throw new ConflictException({ message: "A room is free here. Knock on it instead.", code: "guestRoomFree" });
    const [row] = await this.db.select().from(houseGuests).where(and(eq(houseGuests.houseId, houseId), eq(houseGuests.userId, userId)));
    const standing = guestStanding(row);
    if (standing === "accepted") throw new ConflictException({ message: "You're already in this house's chat.", code: "guestAlreadyIn" });
    if (standing === "open") throw new ConflictException({ message: "You've already asked. A flatmate will answer.", code: "guestAlreadyAsked" });
    if (standing === "declined") throw new ConflictException({ message: "They said no today. Try again another day.", code: "saidNoToday" });
    const [{ asked }] = await this.db.select({ asked: count() }).from(houseGuests).where(and(eq(houseGuests.userId, userId), gte(houseGuests.askedAt, new Date(Date.now() - DAY_MS))));
    if (asked >= INVITES_PER_DAY) throw new HttpException({ message: "That's a lot of houses for one day. Try again tomorrow.", code: "tooManyGuestAsks" }, HttpStatus.TOO_MANY_REQUESTS);

    if (house.demo) {
      const accepted = { status: "accepted" as const, askedAt: new Date(), decidedAt: new Date() };
      await this.db.insert(houseGuests).values({ houseId, userId, ...accepted }).onConflictDoUpdate({ target: [houseGuests.houseId, houseGuests.userId], set: accepted });
      await this.doorbell.welcomeGuest(houseId, userId);
      this.houses.changes.next(houseId);
      return { status: "accepted" };
    }
    await this.db
      .insert(houseGuests)
      .values({ houseId, userId })
      .onConflictDoUpdate({ target: [houseGuests.houseId, houseGuests.userId], set: { status: "open", askedAt: new Date(), decidedAt: null } });
    const blockers = await blockersOf(this.db, userId);
    const flatmates = await this.db.select({ id: memberships.userId }).from(memberships).where(eq(memberships.houseId, houseId));
    for (const f of flatmates) if (!blockers.includes(f.id)) await this.create({ userId: f.id, kind: "guest_ask", fromId: userId, houseId, state: "open" });
    this.houses.changes.next(houseId);
    return { status: "open" };
  }

  /** A guest leaves the chat, or a flatmate takes them out of it (they can't ask again today). */
  async removeGuest(userId: string, houseId: string, login: string) {
    const [them] = await this.db.select().from(users).where(eq(users.login, login));
    if (!them || !(await isChatGuest(this.db, houseId, them.id))) throw new NotFoundException({ message: "They aren't a guest in this chat.", code: "notGuest" });
    const where = and(eq(houseGuests.houseId, houseId), eq(houseGuests.userId, them.id));
    if (userId === them.id) await this.db.delete(houseGuests).where(where);
    else if (await this.houses.membership(houseId, userId)) await this.db.update(houseGuests).set({ status: "declined", decidedAt: new Date() }).where(where);
    else throw new ForbiddenException({ message: "Only flatmates can take a guest out of the chat.", code: "guestFlatmatesOnly" });
    this.houses.changes.next(houseId);
  }

  // A flatmate answers. The guest row moves only once, so the first answer counts, and every flatmate's copy of the ask
  // is closed with it. The one who asked is told.
  private async answerGuest(userId: string, n: Row, answer: "accepted" | "declined"): Promise<{ kind: NotificationKind; house: { id: string; name: string; city: string } | null; room: string | null }> {
    const [house] = n.houseId ? await this.db.select().from(houses).where(eq(houses.id, n.houseId)) : [];
    if (!house || !n.fromId) return this.expire(n, "That house is gone.");
    if (!(await this.houses.membership(house.id, userId))) return this.expire(n, "You don't live in that house any more, so the request lapsed.");
    const moved = await this.db
      .update(houseGuests)
      .set({ status: answer, decidedAt: new Date() })
      .where(and(eq(houseGuests.houseId, house.id), eq(houseGuests.userId, n.fromId), eq(houseGuests.status, "open")))
      .returning({ userId: houseGuests.userId });
    const copies = await this.db
      .update(notifications)
      .set({ state: moved.length ? answer : "expired", decidedAt: new Date(), readAt: new Date() })
      .where(and(eq(notifications.kind, "guest_ask"), eq(notifications.houseId, house.id), eq(notifications.fromId, n.fromId), eq(notifications.state, "open")))
      .returning({ userId: notifications.userId });
    for (const c of copies) if (c.userId !== userId) this.pushes.next(await this.loginOf(c.userId));
    if (!moved.length) throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    await this.create({ userId: n.fromId, kind: answer === "accepted" ? "guest_accepted" : "guest_declined", fromId: userId, houseId: house.id });
    this.houses.changes.next(house.id);
    return { kind: n.kind, house: { id: house.id, name: house.name, city: house.city }, room: null };
  }

  // ---- Friends ----

  /**
   * Asks `toLogin` to be friends. The same refusals as an invitation (yourself, an example person, a block either way,
   * one open request per pair, not again the day they said no, the day's limit), and not someone who's a friend
   * already. If they had asked you first, this is a yes to their request: you're friends at once.
   */
  async askFriend(senderId: string, toLogin: string): Promise<{ id: string; friends: boolean }> {
    const to = await this.recipient(senderId, toLogin);
    if (await areFriends(this.db, senderId, to.id)) throw new ConflictException({ message: "You're friends already.", code: "alreadyFriends" });
    const [theirs] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.kind, "friend_request"), eq(notifications.fromId, to.id), eq(notifications.userId, senderId), eq(notifications.state, "open")))
      .limit(1);
    if (theirs && theirs.createdAt.getTime() >= Date.now() - INVITE_DAYS * DAY_MS) {
      await this.acceptFriend(senderId, theirs);
      return { id: theirs.id, friends: true };
    }
    await this.brake(senderId, to.id, "friend_request");
    const { id } = await this.create({ userId: to.id, kind: "friend_request", fromId: senderId, state: "open" });
    return { id, friends: false };
  }

  // Says yes to a friend request: a block since it was sent makes it lapse; otherwise they're friends, and the sender
  // is told.
  private async acceptFriend(userId: string, n: Row): Promise<{ kind: NotificationKind; house: null; room: null }> {
    if (!n.fromId || (await blockBetween(this.db, userId, n.fromId))) return this.expire(n, "That friend request lapsed.");
    if (!(await this.decide(n, "accepted"))) throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    await befriend(this.db, userId, n.fromId);
    await this.create({ userId: n.fromId, kind: "friend_accepted", fromId: userId });
    return { kind: n.kind, house: null, room: null };
  }

  // ---- The bell ----

  async list(userId: string): Promise<NotificationsView> {
    // Invitations left unanswered for a week expire as they're read.
    await this.db
      .update(notifications)
      .set({ state: "expired", decidedAt: new Date() })
      .where(and(eq(notifications.state, "open"), lt(notifications.createdAt, new Date(Date.now() - INVITE_DAYS * DAY_MS)), or(eq(notifications.userId, userId), eq(notifications.fromId, userId))));

    const current = notInArray(notifications.kind, RETIRED);
    const rows = await this.db.select().from(notifications).where(and(eq(notifications.userId, userId), current)).orderBy(desc(notifications.createdAt)).limit(RECENT);
    const [{ unread }] = await this.db.select({ unread: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt), current));
    const sent = await this.db
      .select({ id: notifications.id, kind: notifications.kind, to: users.login, houseId: notifications.houseId })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(and(eq(notifications.fromId, userId), eq(notifications.state, "open"), ne(notifications.kind, "guest_ask"), current));

    const people = await this.usersById(rows.map((r) => r.fromId).filter((x): x is string => !!x));
    const houseIds = [...new Set(rows.map((r) => r.houseId).filter((x): x is string => !!x))];
    const hs = houseIds.length ? await this.db.select({ id: houses.id, name: houses.name, city: houses.city }).from(houses).where(inArray(houses.id, houseIds)) : [];
    const postIds = [...new Set(rows.map((r) => r.payload.channel).filter((c): c is string => !!c?.startsWith("post:")).map((c) => c.slice(5)))];
    const posts = postIds.length ? await this.db.select({ id: boardPosts.id, title: boardPosts.title, city: boardPosts.city, authorId: boardPosts.authorId }).from(boardPosts).where(inArray(boardPosts.id, postIds)) : [];
    const chatOf = (channel: string | undefined): NotificationView["chat"] => {
      if (!channel) return null;
      const at = channel.indexOf(":");
      const place = channel.slice(0, at);
      const rest = channel.slice(at + 1);
      if (place === "city" || place === "arena") return { place, city: rest, post: null };
      const p = place === "post" ? posts.find((x) => x.id === rest) : undefined;
      return p ? { place: "post", city: p.city, post: { id: p.id, title: p.title, mine: p.authorId === userId } } : null;
    };
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
        ...(r.payload.channel ? { chat: chatOf(r.payload.channel) } : {}),
        createdAt: r.createdAt.toISOString(),
        read: r.readAt !== null,
      })),
      sent: sent.map((s) => ({ id: s.id, kind: s.kind as InviteKind, to: s.to, houseId: s.houseId })),
    };
  }

  /** Marks some of your notifications read (all of them when `ids` is missing). Others' are never touched. */
  async markRead(userId: string, ids?: string[]) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids ? inArray(notifications.id, ids.length ? ids : [""]) : undefined));
  }

  // ---- Words meant for you ----

  /**
   * A new message in a city's room, its arena or under a board post (chat.service.ts `write`): a line under the bell
   * for each person it's meant for (message-news.ts). Someone who hasn't read their line about that place yet keeps
   * that one, brought to the top with the latest writer, instead of a second line.
   */
  async aboutMessage(channel: string, messageId: number, authorId: string, body: string) {
    for (const n of await messageNews(this.db, channel, messageId, authorId, body)) {
      const bumped = await this.db
        .update(notifications)
        .set({ fromId: authorId, createdAt: new Date() })
        .where(and(eq(notifications.userId, n.userId), eq(notifications.kind, n.kind), isNull(notifications.readAt), sql`${notifications.payload}->>'channel' = ${channel}`))
        .returning({ id: notifications.id });
      if (bumped.length) this.pushes.next(await this.loginOf(n.userId));
      else await this.create({ userId: n.userId, kind: n.kind, fromId: authorId, payload: { channel } });
    }
  }

  /** A board post was deleted: the lines about it go with it, since there's nothing left to open. */
  async forgetChannel(channel: string) {
    await this.db.delete(notifications).where(sql`${notifications.payload}->>'channel' = ${channel}`);
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

  // The person an invitation goes to: someone real who isn't you, and nobody either of you blocked (as for messages).
  private async recipient(senderId: string, login: string): Promise<UserRow> {
    const [to] = await this.db.select().from(users).where(eq(users.login, login));
    if (!to) throw new NotFoundException({ message: "Nobody by that name lives in La Coloc.", code: "nobodyByLogin" });
    if (to.id === senderId) throw new BadRequestException({ message: "You can't invite yourself.", code: "inviteYourself" });
    if (await this.isExample(to)) throw new ConflictException({ message: "This is an example person: nobody would get the invitation.", code: "examplePersonInvite" });
    const block = await blockBetween(this.db, senderId, to.id);
    if (block === "mine") throw new ForbiddenException({ message: "You blocked them. Unblock them to invite them.", code: "youBlockedInvite" });
    if (block === "theirs") throw new ForbiddenException({ message: "They aren't taking invitations from you.", code: "theyBlockedInvite" });
    return to;
  }

  // One open invitation of a kind per pair; not again the day they said no; at most INVITES_PER_DAY a day.
  private async brake(senderId: string, toId: string, kind: InviteKind) {
    const pair = and(eq(notifications.fromId, senderId), eq(notifications.userId, toId), eq(notifications.kind, kind));
    const [open] = await this.db.select({ id: notifications.id }).from(notifications).where(and(pair, eq(notifications.state, "open"))).limit(1);
    if (open) throw new ConflictException({ message: "You've already invited them. They'll see it under their bell.", code: "alreadyInvited" });
    const today = new Date(Date.now() - DAY_MS);
    const [no] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(pair, eq(notifications.state, "declined"), gte(notifications.decidedAt, today)))
      .limit(1);
    if (no) throw new ConflictException({ message: "They said no today. Try again another day.", code: "saidNoToday" });
    const [{ sent }] = await this.db
      .select({ sent: count() })
      .from(notifications)
      .where(and(eq(notifications.fromId, senderId), inArray(notifications.kind, INVITES), gte(notifications.createdAt, today)));
    if (sent >= INVITES_PER_DAY) throw new HttpException({ message: "That's a lot of invitations for one day. Try again tomorrow.", code: "tooManyInvites" }, HttpStatus.TOO_MANY_REQUESTS);
  }

  // ---- The doorbell's news ----

  private async fromDoorbell(e: KnockEvent) {
    if (e.type === "knocked") {
      // Everyone who lives in the house hears the knock (the applicant doesn't live there), except anyone who
      // blocked the applicant.
      const blockers = await blockersOf(this.db, e.applicantId);
      const flatmates = await this.db
        .select({ id: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.houseId, e.houseId), ne(memberships.userId, e.applicantId), blockers.length ? notInArray(memberships.userId, blockers) : undefined));
      for (const f of flatmates)
        await this.create({ userId: f.id, kind: "knock", fromId: e.applicantId, houseId: e.houseId, room: e.room, payload: { applicationId: e.applicationId } });
    } else {
      await this.create({ userId: e.applicantId, kind: "knock_answer", houseId: e.houseId, room: e.room, payload: { applicationId: e.applicationId, verdict: e.verdict } });
    }
  }

  // ---- Helpers ----

  // A build that failed in a real house: the flatmates hear, not whoever ran it (a merge has nobody behind it: then
  // it counts as the room's occupant's). One unread line per room, however many times it fails again.
  private async fromDeploy(houseId: string, d: typeof deployments.$inferSelect) {
    if (d.status !== "failed" || d.kind !== "prod") return;
    const [house] = await this.db.select({ demo: houses.demo, tutorial: houses.tutorial }).from(houses).where(eq(houses.id, houseId));
    if (!house || house.demo || house.tutorial) return;
    const [room] = await this.db.select({ occupantId: rooms.occupantId }).from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, d.room)));
    const who = d.requestedBy ?? room?.occupantId ?? null;
    const blockers = who ? await blockersOf(this.db, who) : [];
    const flatmates = await this.db
      .select({ id: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.houseId, houseId), who ? ne(memberships.userId, who) : undefined, blockers.length ? notInArray(memberships.userId, blockers) : undefined));
    for (const f of flatmates) {
      const [told] = await this.db
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(eq(notifications.userId, f.id), eq(notifications.kind, "build_failed"), eq(notifications.houseId, houseId), eq(notifications.room, d.room), isNull(notifications.readAt)));
      if (!told) await this.create({ userId: f.id, kind: "build_failed", fromId: who, houseId, room: d.room });
    }
  }

  private async create(values: typeof notifications.$inferInsert): Promise<{ id: string }> {
    const [row] = await this.db.insert(notifications).values(values).returning({ id: notifications.id });
    this.pushes.next(await this.loginOf(values.userId));
    return row;
  }

  // An invitation for `userId` that's still open. Anyone else's is "no such invitation", like a knock.
  private async openInvite(userId: string, id: string): Promise<Row> {
    const [n] = id.match(/^[0-9a-f-]{36}$/i) ? await this.db.select().from(notifications).where(eq(notifications.id, id)) : [];
    if (!n || n.userId !== userId) throw new NotFoundException({ message: "No such invitation.", code: "noInvite" });
    if (!isInvite(n.kind)) throw new ConflictException({ message: "There's nothing to answer here.", code: "nothingToAnswer" });
    if (n.state === "open" && n.createdAt.getTime() < Date.now() - INVITE_DAYS * DAY_MS) return this.expire(n, "This invitation has expired.");
    if (n.state !== "open")
      throw new ConflictException(
        n.state === "withdrawn" ? { message: "They took this invitation back.", code: "inviteWithdrawn" } : { message: "This invitation has already been answered.", code: "inviteAnswered" },
      );
    return n;
  }

  // Answers an invitation that's still open. False when something else answered it first (a second click, a
  // withdraw): only one answer counts.
  private async decide(n: Row, state: InviteState): Promise<boolean> {
    const done = await this.db
      .update(notifications)
      .set({ state, decidedAt: new Date(), readAt: n.readAt ?? new Date() })
      .where(and(eq(notifications.id, n.id), eq(notifications.state, "open")))
      .returning({ id: notifications.id });
    return done.length > 0;
  }

  // Marks an invitation expired (if still open), then refuses with why. Returns `never`: callers `return` it to stop.
  private async expire(n: Row, why: string): Promise<never> {
    await this.decide(n, "expired");
    throw new ConflictException({ message: why, code: LAPSED[why] ?? "inviteLapsed" });
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

const isInvite = (kind: NotificationKind) => INVITES.includes(kind);
