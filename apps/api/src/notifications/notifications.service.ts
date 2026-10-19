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
// And two that team flatmates up on one room's project (teams.ts), between people of the same house:
// - team_invite: a room's occupant asks a flatmate to join their project. Saying yes puts them on the room's team.
// - team_ask: a flatmate asks a room's occupant to let them join it. Saying yes does the same.
//
// And news from the doorbell, through its listener: a knock on your house, and the answer to your knock.
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Db, houses, type InviteState, memberships, type NotificationKind, notifications, roomTeammates, rooms, users } from "@coloc/db";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import { Subject } from "rxjs";
import type { AuthConfig } from "../auth/auth.config";
import { AUTH_CONFIG } from "../auth/auth.service";
import { DB } from "../db/db.module";
import { DoorbellService, type KnockEvent } from "../doorbell/doorbell.service";
import { blockBetween, blockersOf } from "../doorbell/queries";
import type { PersonView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { moveInto } from "../houses/move-in";
import { joinTeam, onTeam, TEAM_MAX, teamSize } from "./teams";

// An invitation nobody answered for a week is stale: the room may have changed, the person moved on.
export const INVITE_DAYS = 7;
// How many invitations (of both kinds) one person may send in a day: enough to fill a house, not to spam a city.
export const INVITES_PER_DAY = 10;
// How many notifications the bell lists.
const RECENT = 30;
const DAY_MS = 24 * 3600 * 1000;
// Why an invitation lapsed, as the code the web says in French (see `expire`).
const LAPSED: Record<string, string> = {
  "You already live in a house now.": "youHaveHouseNow",
  "That house is gone.": "houseGone",
  "They don't live there any more, so the invitation lapsed.": "senderMovedOut",
  "Someone else took that room first.": "roomTakenFirst",
  "This invitation has expired.": "inviteExpired",
  "That team is full now.": "teamFullNow",
  "They're already on that team.": "alreadyTeammate",
  "That room has changed hands, so the request lapsed.": "teamRoomChanged",
  "One of you doesn't live in that house any more, so the request lapsed.": "teamLeftHouse",
};

// The kinds that are invitations (they have a state, and are answered), and the ones the day's brake counts.
const INVITES: NotificationKind[] = ["house_invite", "rent_together", "team_invite", "team_ask"];
type InviteKind = "house_invite" | "rent_together" | "team_invite" | "team_ask";

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
  // `room`: the room a team request is about (null for the others).
  sent: { id: string; kind: InviteKind; to: string; houseId: string | null; room: string | null }[];
}

const person = (u: Pick<UserRow, "login" | "name" | "avatarUrl" | "githubId" | "badge">): PersonView => ({
  login: u.login,
  name: u.name,
  avatarUrl: u.avatarUrl,
  github: u.githubId !== null,
  badge: u.badge ?? null,
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
    if (!house) throw new NotFoundException({ message: "No such house.", code: "noHouse" });
    if (!(await this.houses.membership(houseId, senderId))) throw new ForbiddenException({ message: "Only the people who live in a house can invite someone to it.", code: "inviteMembersOnly" });
    if (house.demo) throw new ConflictException({ message: "This is an example house: nobody can move in.", code: "exampleHouseInvite" });
    if (house.tutorial) throw new ConflictException({ message: "The workshop is for practice. Invite them to a real house.", code: "workshopInvite" });
    if (await this.housed(to.id)) throw new ConflictException({ message: "They already live in a house.", code: "theyHaveHouse" });
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

  /** Someone with no house asks `toLogin`, who has none either, to rent a server together. */
  async rentTogether(senderId: string, toLogin: string): Promise<{ id: string }> {
    const to = await this.recipient(senderId, toLogin);
    if (await this.housed(senderId)) throw new ConflictException({ message: "You already live in a house. Invite them to it instead.", code: "youHaveHouseInvite" });
    if (await this.housed(to.id)) throw new ConflictException({ message: "They already live in a house. Knock on theirs instead.", code: "theyHaveHouseKnock" });
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
    if (n.kind === "team_invite" || n.kind === "team_ask") return this.acceptTeam(userId, n);
    const [me] = await this.db.select().from(users).where(eq(users.id, userId));
    const name = me.name ?? me.login;

    if (n.kind === "rent_together") {
      if (await this.housed(userId)) return this.expire(n, "You already live in a house now.");
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
      // one then sees the first one's house.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
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
      if (await this.housed(userId, tx)) return lapse("You already live in a house now.");
      if (!(await moveInto(tx, house.id, n.room!, userId))) return lapse("Someone else took that room first.");
      return "moved";
    });
    if (outcome === "answered") throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    if (outcome !== "moved") throw new ConflictException({ message: outcome, code: LAPSED[outcome] ?? "inviteLapsed" });

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

  /** The recipient says no, and the sender is told, so they can ask someone else. */
  async decline(userId: string, id: string) {
    const n = await this.openInvite(userId, id);
    if (!(await this.decide(n, "declined"))) throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    if (n.fromId) {
      const kind = n.kind === "rent_together" ? "rent_together_no" : n.kind === "team_invite" || n.kind === "team_ask" ? "team_declined" : "invite_declined";
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

  // ---- Teaming up ----

  /**
   * Asks to team up on the room `roomName` of `houseId`. With `toLogin`, the room's occupant asks that flatmate to
   * join their project (team_invite). Without it, a flatmate asks the room's occupant to let them join (team_ask).
   * Only between flatmates of a real house (not an example house, not the workshop), not on your own room, at most
   * TEAM_MAX teammates, and with the invitations' own brake (one open per person, not again the day they said no,
   * INVITES_PER_DAY a day).
   */
  async teamUp(senderId: string, houseId: string, roomName: string, toLogin: string | null): Promise<{ id: string }> {
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    if (!house) throw new NotFoundException({ message: "No such house.", code: "noHouse" });
    if (house.demo) throw new ConflictException({ message: "This is an example house: its flatmates are made up.", code: "exampleHouseTeam" });
    if (house.tutorial) throw new ConflictException({ message: "The workshop is for practice. Team up in a real house.", code: "workshopTeam" });
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    if (!room) throw new NotFoundException({ message: "No such room.", code: "noRoom" });
    if (!(await this.houses.membership(houseId, senderId))) throw new ForbiddenException({ message: "Only flatmates of this house can team up on its rooms.", code: "teamFlatmatesOnly" });
    if (!room.occupantId || room.demo) throw new ConflictException({ message: "Nobody lives in that room, so there's no project to join.", code: "teamFreeRoom" });

    // The occupant brings a flatmate in.
    if (toLogin !== null) {
      if (room.occupantId !== senderId) throw new ForbiddenException({ message: "Only the flatmate who lives in this room can bring someone onto its project.", code: "teamOccupantOnly" });
      const to = await this.recipient(senderId, toLogin);
      if (!(await this.houses.membership(houseId, to.id))) throw new ConflictException({ message: "They don't live in this house. Invite them to it first.", code: "teamFlatmatesOnly" });
      await this.teamRoom(room.id, to.id);
      await this.brake(senderId, to.id, "team_invite");
      return this.create({ userId: to.id, kind: "team_invite", fromId: senderId, houseId, room: room.name, state: "open" });
    }

    // A flatmate asks to join.
    if (room.occupantId === senderId) throw new BadRequestException({ message: "That's your own room: you're on its project already.", code: "teamOwnRoom" });
    const [occupant] = await this.db.select().from(users).where(eq(users.id, room.occupantId));
    const to = await this.recipient(senderId, occupant.login);
    await this.teamRoom(room.id, senderId);
    await this.brake(senderId, to.id, "team_ask");
    return this.create({ userId: to.id, kind: "team_ask", fromId: senderId, houseId, room: room.name, state: "open" });
  }

  /**
   * Takes `login` off the room's team: the room's occupant removes a teammate, or a teammate leaves. Nobody else.
   */
  async leaveTeam(userId: string, houseId: string, roomName: string, login: string) {
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    if (!room) throw new NotFoundException({ message: "No such room.", code: "noRoom" });
    const [them] = await this.db.select().from(users).where(eq(users.login, login));
    if (!them || !(await onTeam(this.db, room.id, them.id))) throw new NotFoundException({ message: "They aren't on this room's team.", code: "notTeammate" });
    if (userId !== them.id && userId !== room.occupantId) throw new ForbiddenException({ message: "Only the flatmate who lives in this room can take someone off its team.", code: "teamRemoveOccupantOnly" });
    await this.db.delete(roomTeammates).where(and(eq(roomTeammates.roomId, room.id), eq(roomTeammates.userId, them.id)));
    this.houses.changes.next(houseId);
  }

  // Refuses a team request that could never be taken: they're on the team already, or it's full.
  private async teamRoom(roomId: string, joinerId: string) {
    if (await onTeam(this.db, roomId, joinerId)) throw new ConflictException({ message: "They're already on that team.", code: "alreadyTeammate" });
    if ((await teamSize(this.db, roomId)) >= TEAM_MAX) throw new ConflictException({ message: `A room's team has ${TEAM_MAX} teammates at most, and this one is full.`, code: "teamFull" });
  }

  /**
   * Says yes to a team request. The one who joins is the recipient of a team_invite, or the sender of a team_ask;
   * the room must still be the occupant's, both must still live in the house, and the team must still have room.
   * Otherwise the request lapses and the refusal says why. The sender is told it was taken.
   */
  private async acceptTeam(userId: string, n: Row): Promise<{ kind: NotificationKind; house: { id: string; name: string; city: string } | null; room: string | null }> {
    const [house] = n.houseId ? await this.db.select().from(houses).where(eq(houses.id, n.houseId)) : [];
    if (!house || !n.room || !n.fromId) return this.expire(n, "That house is gone.");
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, house.id), eq(rooms.name, n.room)));
    const joiner = n.kind === "team_invite" ? userId : n.fromId;
    const occupant = n.kind === "team_invite" ? n.fromId : userId;
    if (!room || room.occupantId !== occupant) return this.expire(n, "That room has changed hands, so the request lapsed.");
    if (!(await this.houses.membership(house.id, joiner)) || !(await this.houses.membership(house.id, occupant)))
      return this.expire(n, "One of you doesn't live in that house any more, so the request lapsed.");

    const outcome = await this.db.transaction(async (tx) => {
      // Claim the request first: a second click finds it answered and stops without touching it.
      const claimed = await tx
        .update(notifications)
        .set({ state: "accepted", decidedAt: new Date(), readAt: new Date() })
        .where(and(eq(notifications.id, n.id), eq(notifications.state, "open")))
        .returning({ id: notifications.id });
      if (!claimed.length) return "answered";
      const joined = await joinTeam(tx, room.id, joiner);
      if (joined === "joined") return "joined";
      await tx.update(notifications).set({ state: "expired" }).where(eq(notifications.id, n.id));
      return joined === "full" ? "That team is full now." : "They're already on that team.";
    });
    if (outcome === "answered") throw new ConflictException({ message: "This invitation has already been answered.", code: "inviteAnswered" });
    if (outcome !== "joined") throw new ConflictException({ message: outcome, code: LAPSED[outcome] ?? "inviteLapsed" });

    await this.create({ userId: n.fromId, kind: "team_accepted", fromId: userId, houseId: house.id, room: room.name });
    this.houses.changes.next(house.id);
    return { kind: n.kind, house: { id: house.id, name: house.name, city: house.city }, room: room.name };
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
      .select({ id: notifications.id, kind: notifications.kind, to: users.login, houseId: notifications.houseId, room: notifications.room })
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
      sent: sent.map((s) => ({ id: s.id, kind: s.kind as InviteKind, to: s.to, houseId: s.houseId, room: isTeam(s.kind) ? s.room : null })),
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
  private async housed(userId: string, runner: Pick<Db, "select"> = this.db): Promise<boolean> {
    const [row] = await runner
      .select({ id: memberships.houseId })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .where(and(eq(memberships.userId, userId), eq(houses.tutorial, false)))
      .limit(1);
    return !!row;
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
const isTeam = (kind: NotificationKind) => kind === "team_invite" || kind === "team_ask";
