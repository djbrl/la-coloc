// The doorbell: someone knocks on a free room, chats with the house in a thread, and the house votes.
// Also the house's living-room chat, which works the same way.
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { applications, chores, type Db, houses, memberships, messages, rooms, users, votes } from "@coloc/db";
import { tallyVotes } from "@coloc/domain";
import { and, count, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import { DB } from "../db/db.module";
import type { ApplicationView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { knockText, noteText } from "../houses/lines";
import { moveInto } from "../houses/move-in";
import { applicationChannel, channelMessages, houseChannel, person, tally } from "./queries";

export const MAX_MESSAGE = 2000;
const BURST = { messages: 20, perMs: 60_000 };

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

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
  ) {}

  async knock(houseId: string, roomName: string, applicantId: string, input: { message: string; repo?: string | null }) {
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    if (!house) throw new NotFoundException("no such house");
    if (house.demo) throw new BadRequestException("This is a demo house: nobody lives here to answer.");
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    if (!room) throw new NotFoundException("no such room");
    if (room.occupantId) throw new ConflictException("Someone already lives in this room.");
    if (await this.houses.membership(houseId, applicantId)) throw new ConflictException("You already live here.");
    const [already] = await this.db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.houseId, houseId), eq(applications.applicantId, applicantId), eq(applications.status, "open")));
    if (already) throw new ConflictException({ message: "You've already knocked on this house.", application: already.id });

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
      messages: await channelMessages(this.db, applicationChannel(app.id)),
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
    if (app.status !== "open") throw new ConflictException("This knock is closed.");
    await this.post(applicationChannel(app.id), authorId, body);
    this.changes.next(app.id);
  }

  async postToHouse(houseId: string, authorId: string, body: string) {
    if (!(await this.houses.membership(houseId, authorId))) throw new ForbiddenException("Only flatmates can talk in the living room.");
    await this.post(houseChannel(houseId), authorId, body);
    this.houses.changes.next(houseId);
  }

  /**
   * A flatmate votes (or changes their vote). When a strict majority agrees either way, it's decided:
   * yes moves the applicant into the room; no closes the knock politely.
   */
  async vote(applicationId: string, voterId: string, yes: boolean) {
    const app = await this.mustFind(applicationId);
    if ((await this.roleIn(app, voterId)) !== "flatmate") throw new ForbiddenException("Only flatmates vote.");
    if (app.status !== "open") throw new ConflictException("This knock is already decided.");

    await this.db
      .insert(votes)
      .values({ applicationId, voterId, yes })
      .onConflictDoUpdate({ target: [votes.applicationId, votes.voterId], set: { yes, at: new Date() } });

    const all = await this.db.select().from(votes).where(eq(votes.applicationId, applicationId));
    const verdict = tallyVotes(await this.flatmateCount(app.houseId), all);
    if (verdict === "admitted") await this.admit(app);
    if (verdict === "declined") {
      await this.close(app, "declined", knockText("no"));
      await this.tell({ type: "answered", applicationId: app.id, houseId: app.houseId, room: app.room, applicantId: app.applicantId, verdict: "declined" });
    }
    this.changes.next(app.id);
    this.houses.changes.next(app.houseId);
    return { verdict };
  }

  async withdraw(applicationId: string, userId: string) {
    const app = await this.mustFind(applicationId);
    if (app.applicantId !== userId) throw new ForbiddenException("Only the person who knocked can withdraw.");
    if (app.status !== "open") throw new ConflictException("This knock is already decided.");
    await this.close(app, "withdrawn", knockText("withdrawn"));
    this.changes.next(app.id);
    this.houses.changes.next(app.houseId);
  }

  private async admit(app: typeof applications.$inferSelect) {
    const [applicant] = await this.db.select().from(users).where(eq(users.id, app.applicantId));
    const name = applicant.name ?? applicant.login;
    const moved = await this.db.transaction(async (tx) => {
      // Only if the room is still free: two knocks on one room can't both move in (moveInto checks).
      if (!(await moveInto(tx, app.houseId, app.room, app.applicantId))) return false;
      await tx.update(applications).set({ status: "admitted", decidedAt: new Date() }).where(eq(applications.id, app.id));
      await tx.insert(messages).values({ channel: applicationChannel(app.id), authorId: null, body: knockText("yes", { name }) });
      return true;
    });
    if (!moved) {
      await this.close(app, "declined", knockText("taken"));
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
      await this.close(other, "declined", knockText("taken"));
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
    for (const app of open) {
      await this.close(app, "withdrawn", knockText("invited"));
      this.changes.next(app.id);
    }
  }

  /** Listens to the doorbell: a knock, and a knock answered. The notifications use it; nothing else needs to. */
  listen(listener: KnockListener) {
    this.listeners.push(listener);
  }

  // A listener failing (a notification not written) must never fail the knock or the vote itself.
  private async tell(e: KnockEvent) {
    for (const l of this.listeners) await l(e).catch((err: Error) => this.log.warn(`a doorbell listener failed: ${err.message}`));
  }

  private async close(app: typeof applications.$inferSelect, status: "declined" | "withdrawn", why: string) {
    await this.db.transaction(async (tx) => {
      await tx.update(applications).set({ status, decidedAt: new Date() }).where(eq(applications.id, app.id));
      await tx.insert(messages).values({ channel: applicationChannel(app.id), authorId: null, body: why });
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
    if (times.length >= BURST.messages) throw new ConflictException("Slow down a little: too many messages in a minute.");
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
  if (!text) throw new BadRequestException("Write something first.");
  if (text.length > MAX_MESSAGE) throw new BadRequestException(`Keep it under ${MAX_MESSAGE} characters.`);
  return text;
}
