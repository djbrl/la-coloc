// The doorbell: someone knocks on a free room, chats with the house in a thread, and the house votes.
// Also the house's living-room chat, which works the same way.
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { applications, chores, type Db, houses, memberships, messages, rooms, users, votes } from "@coloc/db";
import { tallyVotes } from "@coloc/domain";
import { and, count, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import { DB } from "../db/db.module";
import { isChatGuest } from "../houses/guests";
import type { ApplicationView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { knockText, noteText } from "../houses/lines";
import { MAX_ROOMS_PER_PERSON } from "../houses/money";
import { moveInto, roomsRented } from "../houses/move-in";
import { applicationChannel, channelMessages, houseChannel, person, tally } from "./queries";

export const MAX_MESSAGE = 2000;
const BURST = { messages: 20, perMs: 60_000 };
// The workshop's answer to a newcomer's first word in its channel. Scripted: nobody really lives there.
const WORKSHOP_REPLY_MS = 1500;
const guestWelcome = (first: string) => `Come in, ${first}. No room left, but the kitchen's always open. What are you building?`;
const workshopReply = (first: string) => `Dalal ak jàmm, ${first}! Happy you're here. Ask us anything, we all started with the same page.`;

// What the doorbell tells its listeners (the notifications): someone knocked, or a knock was answered.
export type KnockEvent =
  | { type: "knocked"; applicationId: string; houseId: string; room: string; applicantId: string }
  | { type: "answered"; applicationId: string; houseId: string; room: string; applicantId: string; verdict: "admitted" | "declined" };
export type KnockListener = (e: KnockEvent) => Promise<void>;

@Injectable()
export class DoorbellService {
  // Pings an application's live thread with its id.
  readonly changes = new Subject<string>();
  // Messages per person in the last minute: a crude brake on flooding, enough for now.
  private recent = new Map<string, number[]>();
  private listeners: KnockListener[] = [];
  private readonly log = new Logger("doorbell");
  // How long the workshop takes to answer. A field so a test doesn't have to wait.
  replyDelayMs = WORKSHOP_REPLY_MS;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
  ) {}

  async knock(houseId: string, roomName: string, applicantId: string, input: { message: string; repo?: string | null }) {
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    if (!house) throw new NotFoundException("no such house");
    if (house.demo) throw new BadRequestException({ message: "This is a demo house: nobody lives here to answer.", code: "demoHouseKnock" });
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    if (!room) throw new NotFoundException("no such room");
    if (room.occupantId) throw new ConflictException({ message: "Someone already lives in this room.", code: "roomTaken" });
    if (await this.houses.membership(houseId, applicantId)) throw new ConflictException({ message: "You already live here.", code: "alreadyLiveHere" });
    if ((await roomsRented(this.db, applicantId)) >= MAX_ROOMS_PER_PERSON) throw new ConflictException({ message: `${MAX_ROOMS_PER_PERSON} rooms a person. End a lease to take another.`, code: "room_limit", max: MAX_ROOMS_PER_PERSON });
    const [already] = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.houseId, houseId), eq(applications.applicantId, applicantId), eq(applications.status, "open")));
    if (already) throw new ConflictException({ message: "You've already knocked on this house.", code: "alreadyKnocked", application: already.id });

    const message = cleanBody(input.message);
    const id = randomUUID().slice(0, 8);
    const [applicant] = await this.db.select().from(users).where(eq(users.id, applicantId));
    await this.db.transaction(async (tx) => {
      await tx.insert(applications).values({ id, houseId, room: roomName, applicantId, message, repo: input.repo ?? null });
      await tx.insert(messages).values([
        { channel: applicationChannel(id), authorId: null, body: knockText("knocked", { name: applicant.name ?? applicant.login }) },
        { channel: applicationChannel(id), authorId: applicantId, body: message },
      ]);
    });
    await this.houses.note(houseId, { tone: "info", room: roomName, text: noteText("knocked", { name: applicant.name ?? applicant.login }) });
    await this.tell({ type: "knocked", applicationId: id, houseId, room: roomName, applicantId });
    return { id };
  }

  /** The thread, as the applicant or a flatmate sees it. Anyone else gets a 404: knocks aren't public. */
  async view(applicationId: string, viewerId: string): Promise<ApplicationView> {
    const app = await this.db.query.applications.findFirst({
      where: eq(applications.id, applicationId),
      with: { house: true, applicant: true, votes: { with: { voter: true } } },
    });
    if (!app) throw new NotFoundException();
    const as = await this.roleIn(app, viewerId);
    // Once admitted, the applicant is a flatmate too; the vote was among the others.
    const flatmates = (await this.flatmateCount(app.houseId)) - (app.status === "admitted" ? 1 : 0);
    const [viewer] = await this.db.select().from(users).where(eq(users.id, viewerId));
    return {
      id: app.id,
      house: { id: app.house.id, name: app.house.name, city: app.house.city },
      room: app.room,
      applicant: person(app.applicant),
      message: app.message,
      repo: app.repo,
      status: app.status,
      createdAt: app.createdAt.toISOString(),
      decidedAt: app.decidedAt?.toISOString() ?? null,
      tally: tally(flatmates, app.votes),
      votes: as === "flatmate" ? app.votes.map((v) => ({ voter: person(v.voter), yes: v.yes })) : null,
      viewer: { login: viewer.login, as, vote: app.votes.find((v) => v.voterId === viewerId)?.yes ?? null },
      messages: await channelMessages(this.db, applicationChannel(app.id), undefined, viewerId),
      work: await this.work(app.applicant),
    };
  }

  // The applicant's record: their top public repos (stored at GitHub login, never fetched here) and the reviews
  // they gave and got in every house they've lived in.
  private async work(applicant: typeof users.$inferSelect): Promise<ApplicationView["work"]> {
    const done = (who: typeof chores.assigneeId | typeof chores.authorId) =>
      this.db
        .select({ n: count() })
        .from(chores)
        .where(and(eq(who, applicant.id), eq(chores.status, "done")))
        .then(([r]) => r?.n ?? 0);
    return { repos: applicant.githubRepos ?? [], given: await done(chores.assigneeId), received: await done(chores.authorId) };
  }

  async postToApplication(applicationId: string, authorId: string, body: string) {
    const app = await this.mustFind(applicationId);
    await this.roleIn(app, authorId);
    if (app.status !== "open") throw new ConflictException({ message: "This knock is closed.", code: "knockClosed" });
    await this.post(applicationChannel(app.id), authorId, body);
    this.changes.next(app.id);
  }

  async postToHouse(houseId: string, authorId: string, body: string) {
    if (!(await this.houses.membership(houseId, authorId)) && !(await isChatGuest(this.db, houseId, authorId))) throw new ForbiddenException({ message: "Only flatmates can talk in the living room.", code: "flatmatesOnlyTalk" });
    const channel = houseChannel(houseId);
    const [said] = await this.db.select({ n: count() }).from(messages).where(and(eq(messages.channel, channel), eq(messages.authorId, authorId)));
    await this.post(channel, authorId, body);
    this.houses.changes.next(houseId);
    if (said.n === 0) await this.answerFirstWord(houseId, authorId);
  }

  // Your first message in the workshop's channel gets an answer from its host, a moment later. "First" is read from
  // the channel itself, so it happens once per person, survives a refresh, and a demo reset (which empties the
  // channels) starts it over.
  private async answerFirstWord(houseId: string, authorId: string) {
    const [house] = await this.db.select({ tutorial: houses.tutorial, chefId: houses.chefId }).from(houses).where(eq(houses.id, houseId));
    if (!house?.tutorial || !house.chefId || house.chefId === authorId) return;
    const [author] = await this.db.select({ name: users.name, login: users.login }).from(users).where(eq(users.id, authorId));
    const first = (author.name ?? author.login).trim().split(/\s+/)[0];
    const reply = async () => {
      await this.db.insert(messages).values({ channel: houseChannel(houseId), authorId: house.chefId, body: workshopReply(first) });
      this.houses.changes.next(houseId);
    };
    setTimeout(() => void reply().catch((err) => this.log.warn(`couldn't answer in the workshop: ${err.message}`)), this.replyDelayMs).unref();
  }

  // An example house's host welcomes a guest let into its chat.
  async welcomeGuest(houseId: string, guestId: string) {
    const [house] = await this.db.select({ chefId: houses.chefId }).from(houses).where(eq(houses.id, houseId));
    const [guest] = await this.db.select({ name: users.name, login: users.login }).from(users).where(eq(users.id, guestId));
    if (!house?.chefId || !guest) return;
    await this.post(houseChannel(houseId), house.chefId, guestWelcome((guest.name ?? guest.login).trim().split(/\s+/)[0]));
  }

  /**
   * A flatmate votes (or changes their vote). When a strict majority agrees either way, it's decided:
   * yes moves the applicant into the room; no closes the knock politely.
   */
  async vote(applicationId: string, voterId: string, yes: boolean) {
    const app = await this.mustFind(applicationId);
    if ((await this.roleIn(app, voterId)) !== "flatmate") throw new ForbiddenException({ message: "Only flatmates vote.", code: "flatmatesOnlyVote" });
    if (app.status !== "open") throw new ConflictException({ message: "This knock is already decided.", code: "knockDecided" });

    await this.db
      .insert(votes)
      .values({ applicationId, voterId, yes })
      .onConflictDoUpdate({ target: [votes.applicationId, votes.voterId], set: { yes, at: new Date() } });

    const all = await this.db.select().from(votes).where(eq(votes.applicationId, applicationId));
    const verdict = tallyVotes(await this.flatmateCount(app.houseId), all);
    if (verdict === "admitted") await this.admit(app);
    // Two votes landing together can both see a majority: close() and admit() only act on a knock that's still
    // open, so the second one stops quietly instead of answering twice.
    if (verdict === "declined" && (await this.close(app, "declined", knockText("no"))))
      await this.tell({ type: "answered", applicationId: app.id, houseId: app.houseId, room: app.room, applicantId: app.applicantId, verdict: "declined" });
    this.changes.next(app.id);
    this.houses.changes.next(app.houseId);
    return { verdict };
  }

  async withdraw(applicationId: string, userId: string) {
    const app = await this.mustFind(applicationId);
    if (app.applicantId !== userId) throw new ForbiddenException({ message: "Only the person who knocked can withdraw.", code: "knockerOnlyWithdraws" });
    if (app.status !== "open") throw new ConflictException({ message: "This knock is already decided.", code: "knockDecided" });
    // A vote may have decided it since we read it.
    if (!(await this.close(app, "withdrawn", knockText("withdrawn")))) throw new ConflictException({ message: "This knock is already decided.", code: "knockDecided" });
    this.changes.next(app.id);
    this.houses.changes.next(app.houseId);
  }

  private async admit(app: typeof applications.$inferSelect) {
    const [applicant] = await this.db.select().from(users).where(eq(users.id, app.applicantId));
    const name = applicant.name ?? applicant.login;
    const outcome = await this.db.transaction(async (tx) => {
      // Claim the knock first: only one vote (or a withdraw) can close it. Losing that race means someone else
      // already answered, so there's nothing left to do.
      const claimed = await tx
        .update(applications)
        .set({ status: "admitted", decidedAt: new Date() })
        .where(and(eq(applications.id, app.id), eq(applications.status, "open")))
        .returning({ id: applications.id });
      if (!claimed.length) return "lost";
      // Only if the room is still free: two knocks on one room can't both move in (moveInto checks).
      if (!(await moveInto(tx, app.houseId, app.room, app.applicantId))) {
        await tx.update(applications).set({ status: "declined" }).where(eq(applications.id, app.id));
        await tx.insert(messages).values({ channel: applicationChannel(app.id), authorId: null, body: knockText("taken") });
        return "taken";
      }
      await tx.insert(messages).values({ channel: applicationChannel(app.id), authorId: null, body: knockText("yes", { name }) });
      return "moved";
    });
    if (outcome === "lost") return;
    if (outcome === "taken") {
      await this.tell({ type: "answered", applicationId: app.id, houseId: app.houseId, room: app.room, applicantId: app.applicantId, verdict: "declined" });
      return;
    }
    await this.tell({ type: "answered", applicationId: app.id, houseId: app.houseId, room: app.room, applicantId: app.applicantId, verdict: "admitted" });
    await this.movedIn(app.houseId, app.room, name, app.id);
  }

  /**
   * After someone moved into a room (by a vote, or by an invitation): anyone else knocking on that room is told it's
   * taken, and the fridge door welcomes them. `exceptApplication`: the knock that moved them in, already closed.
   */
  async movedIn(houseId: string, room: string, name: string, exceptApplication?: string) {
    const others = await this.db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.houseId, houseId),
          eq(applications.room, room),
          eq(applications.status, "open"),
          exceptApplication ? ne(applications.id, exceptApplication) : undefined,
        ),
      );
    for (const other of others) {
      if (!(await this.close(other, "declined", knockText("taken")))) continue;
      this.changes.next(other.id);
      await this.tell({ type: "answered", applicationId: other.id, houseId, room, applicantId: other.applicantId, verdict: "declined" });
    }
    await this.houses.note(houseId, { tone: "thanks", room, text: noteText("movedIn", { name }) });
  }

  /** Closes someone's own open knock on a house they just moved into another way (an invitation). */
  async closeOwnKnock(houseId: string, applicantId: string) {
    const open = await this.db
      .select()
      .from(applications)
      .where(and(eq(applications.houseId, houseId), eq(applications.applicantId, applicantId), eq(applications.status, "open")));
    for (const app of open) if (await this.close(app, "withdrawn", knockText("invited"))) this.changes.next(app.id);
  }

  /** Listens to the doorbell: a knock, and a knock answered. The notifications use it; nothing else needs to. */
  listen(listener: KnockListener) {
    this.listeners.push(listener);
  }

  // A listener failing (a notification not written) must never fail the knock or the vote itself.
  private async tell(e: KnockEvent) {
    for (const l of this.listeners) await l(e).catch((err: Error) => this.log.warn(`a doorbell listener failed: ${err.message}`));
  }

  // Closes a knock that's still open. False when it was already closed (a vote or a withdraw got there first): the
  // caller then says nothing, so nobody gets two answers.
  private async close(app: typeof applications.$inferSelect, status: "declined" | "withdrawn", why: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const closed = await tx
        .update(applications)
        .set({ status, decidedAt: new Date() })
        .where(and(eq(applications.id, app.id), eq(applications.status, "open")))
        .returning({ id: applications.id });
      if (!closed.length) return false;
      await tx.insert(messages).values({ channel: applicationChannel(app.id), authorId: null, body: why });
      return true;
    });
  }

  private async post(channel: string, authorId: string, body: string) {
    // Validate first: a refused message shouldn't count against you.
    const text = cleanBody(body);
    this.brake(authorId);
    await this.db.insert(messages).values({ channel, authorId, body: text });
  }

  private brake(userId: string) {
    const now = Date.now();
    const times = (this.recent.get(userId) ?? []).filter((t) => now - t < BURST.perMs);
    if (times.length >= BURST.messages) throw new ConflictException({ message: "Slow down a little: too many messages in a minute.", code: "slowDownKnock" });
    times.push(now);
    this.recent.set(userId, times);
  }

  private async mustFind(id: string) {
    const [app] = await this.db.select().from(applications).where(eq(applications.id, id));
    if (!app) throw new NotFoundException();
    return app;
  }

  private async roleIn(app: { houseId: string; applicantId: string }, userId: string): Promise<"applicant" | "flatmate"> {
    if (app.applicantId === userId) return "applicant";
    if (await this.houses.membership(app.houseId, userId)) return "flatmate";
    // Not your knock and not your house: as far as you're concerned, it doesn't exist.
    throw new NotFoundException();
  }

  private async flatmateCount(houseId: string): Promise<number> {
    return (await this.db.select({ u: memberships.userId }).from(memberships).where(eq(memberships.houseId, houseId))).length;
  }
}

function cleanBody(body: string): string {
  const text = (body ?? "").trim();
  if (!text) throw new BadRequestException({ message: "Write something first.", code: "writeSomething" });
  if (text.length > MAX_MESSAGE) throw new BadRequestException({ message: `Keep it under ${MAX_MESSAGE} characters.`, code: "tooLong", max: MAX_MESSAGE });
  return text;
}
