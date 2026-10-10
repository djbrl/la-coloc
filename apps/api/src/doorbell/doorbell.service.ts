// The doorbell: someone knocks on a free room, chats with the house in a thread, and the house votes.
// Also the house's living-room chat, which works the same way.
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { applications, chores, type Db, houses, memberships, messages, rooms, users, votes } from "@coloc/db";
import { tallyVotes } from "@coloc/domain";
import { and, count, eq, isNull, max, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
import { DB } from "../db/db.module";
import type { ApplicationView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { applicationChannel, channelMessages, houseChannel, person, tally } from "./queries";

export const MAX_MESSAGE = 2000;
const BURST = { messages: 20, perMs: 60_000 };

@Injectable()
export class DoorbellService {
  // Pings an application's live thread with its id.
  readonly changes = new Subject<string>();
  // Messages per person in the last minute: a crude brake on flooding, enough for now.
  private recent = new Map<string, number[]>();

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
        { channel: applicationChannel(id), authorId: null, body: `${applicant.name ?? applicant.login} knocked on a free room.` },
        { channel: applicationChannel(id), authorId: applicantId, body: message },
      ]);
    });
    await this.houses.note(houseId, { tone: "info", room: roomName, text: `${applicant.name ?? applicant.login} knocked on a free room. Answer the door!` });
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
    if (verdict === "declined") await this.close(app, "declined", "The house said no this time. Thanks for knocking.");
    this.changes.next(app.id);
    this.houses.changes.next(app.houseId);
    return { verdict };
  }

  async withdraw(applicationId: string, userId: string) {
    const app = await this.mustFind(applicationId);
    if (app.applicantId !== userId) throw new ForbiddenException("Only the person who knocked can withdraw.");
    if (app.status !== "open") throw new ConflictException("This knock is already decided.");
    await this.close(app, "withdrawn", "They withdrew their knock.");
    this.changes.next(app.id);
    this.houses.changes.next(app.houseId);
  }

  private async admit(app: typeof applications.$inferSelect) {
    const [applicant] = await this.db.select().from(users).where(eq(users.id, app.applicantId));
    const name = applicant.name ?? applicant.login;
    const moved = await this.db.transaction(async (tx) => {
      // Only if the room is still free: two knocks on one room can't both move in.
      const taken = await tx
        .update(rooms)
        .set({ occupantId: app.applicantId, ad: null, project: null, projectDescription: null, status: "empty", url: null })
        .where(and(eq(rooms.houseId, app.houseId), eq(rooms.name, app.room), isNull(rooms.occupantId)))
        .returning({ id: rooms.id });
      if (!taken.length) return false;
      const [{ last }] = await tx.select({ last: max(memberships.tontinePosition) }).from(memberships).where(eq(memberships.houseId, app.houseId));
      // Newcomers join the back of the tontine line.
      await tx.insert(memberships).values({ houseId: app.houseId, userId: app.applicantId, role: "flatmate", tontinePosition: (last ?? -1) + 1 });
      await tx.update(applications).set({ status: "admitted", decidedAt: new Date() }).where(eq(applications.id, app.id));
      await tx.insert(messages).values({ channel: applicationChannel(app.id), authorId: null, body: `The house said yes. Welcome home, ${name}!` });
      return true;
    });
    if (!moved) {
      await this.close(app, "declined", "Someone else moved into this room first. Knock on another one?");
      return;
    }
    // Anyone else knocking on the same room: it's taken now.
    const others = await this.db
      .select()
      .from(applications)
      .where(and(eq(applications.houseId, app.houseId), eq(applications.room, app.room), eq(applications.status, "open"), ne(applications.id, app.id)));
    for (const other of others) {
      await this.close(other, "declined", "Someone else moved into this room first. Knock on another one?");
      this.changes.next(other.id);
    }
    await this.houses.note(app.houseId, { tone: "thanks", room: app.room, text: `${name} moved in. Welcome home!` });
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
