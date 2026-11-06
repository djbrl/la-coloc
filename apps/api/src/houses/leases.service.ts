// Several rooms for one person, and ending a lease. The billing cycle is the calendar month (UTC).
//
// Ending a lease takes effect in two steps. Right away the room is free for anyone, with nothing of its last occupant
// left in it. The money waits for the month to end: a lease_ends row keeps the room on their line (houses.service.ts,
// the bill), and if it was their last room here they stay a flatmate until then, with no room (memberships.leaving_month).
// settleLeases does the second step, lazily: when the API starts and every hour, for any month that's over. The same
// timer then charges the month's rent to whoever hasn't paid it yet (rent.ts).
import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { applications, chores, type Db, deployments, houses, leaseEnds, memberships, messages, repos, roomSecrets, roomTeammates, rooms } from "@coloc/db";
import { and, asc, count, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { AgentRegistry } from "../agents/agent.registry";
import { isCoreDown } from "../core/core";
import { DB } from "../db/db.module";
import { applicationChannel, houseChannel } from "../doorbell/queries";
import { HousesService } from "./houses.service";
import { Landlord } from "./landlord";
import { noteText } from "./lines";
import { MAX_ROOMS_PER_PERSON, monthEnd, monthOf } from "./money";
import { moveInto, roomsRented } from "./move-in";

const HOUR_MS = 60 * 60 * 1000;
const RETRY_DB_MS = 10_000;

@Injectable()
export class LeasesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("leases");
  private hourly?: NodeJS.Timeout;
  private retry?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    @Optional() private readonly landlord?: Landlord,
  ) {}

  /** Someone who lives in the house takes another of its free rooms. */
  async take(houseId: string, roomName: string, user: { id: string; login: string; name: string | null }): Promise<{ room: string }> {
    const { house, room } = await this.find(houseId, roomName);
    if (!(await this.houses.membership(houseId, user.id))) throw new ForbiddenException({ message: "Only people who live in this house can take another of its rooms. Knock on it instead.", code: "takeMembersOnly" });
    if (house.tutorial || house.demo || room.demo) throw new ConflictException({ message: "This room isn't for taking.", code: "takeNotHere" });
    if (room.occupantId) throw new ConflictException({ message: "Someone already lives in this room.", code: "roomTaken" });
    const moved = await this.db.transaction(async (tx) => {
      if ((await roomsRented(tx, user.id)) >= MAX_ROOMS_PER_PERSON) {
        throw new ConflictException({ message: `${MAX_ROOMS_PER_PERSON} rooms a person. End a lease to take another.`, code: "room_limit", max: MAX_ROOMS_PER_PERSON });
      }
      return moveInto(tx, houseId, roomName, user.id);
    });
    if (!moved) throw new ConflictException({ message: "Someone else took that room first.", code: "roomTakenFirst" });
    await this.houses.note(houseId, { tone: "info", room: roomName, text: noteText("tookRoom", { name: user.name ?? user.login }) });
    // Already paid this month: the bigger line starts next month. Not paid yet (short of credit): it goes now if it can.
    await this.houses.rentCollector.movedIn(houseId, user.id);
    return { room: roomName };
  }

  /**
   * The occupant ends their lease. The room is free now, its containers go, and nothing of theirs stays in it: no
   * project, no repo, no secrets, no team, no history. The rent stays as it was until the month is over: `until`.
   */
  async leave(houseId: string, roomName: string, user: { id: string; login: string; name: string | null }, now = new Date()): Promise<{ until: string }> {
    const { house, room } = await this.find(houseId, roomName);
    if (room.occupantId !== user.id) throw new ForbiddenException({ message: "This isn't your room.", code: "leaseNotYours" });
    if (house.tutorial || house.demo || room.demo) throw new ConflictException({ message: "This room has no lease to end.", code: "leaseNotHere" });
    const month = monthOf(now);
    await this.db.transaction(async (tx) => {
      await tx
        .update(rooms)
        .set({ occupantId: null, status: "empty", url: null, project: null, projectDescription: null, ad: null, lastDeployId: null, branch: null, buildPath: ".", port: null, source: null })
        .where(eq(rooms.id, room.id));
      await tx.delete(roomTeammates).where(eq(roomTeammates.roomId, room.id));
      await tx.delete(roomSecrets).where(and(eq(roomSecrets.houseId, houseId), eq(roomSecrets.room, roomName)));
      // A build still on its way has no record to report to any more (recordDeployStatus ignores it).
      await tx.delete(deployments).where(and(eq(deployments.houseId, houseId), eq(deployments.room, roomName)));
      // Its repo goes with it, and so do the reviews still waiting on that repo.
      const unlinked = await tx.delete(repos).where(and(eq(repos.houseId, houseId), eq(repos.room, roomName))).returning({ id: repos.githubId });
      if (unlinked.length) await tx.delete(chores).where(and(eq(chores.status, "open"), inArray(chores.repoId, unlinked.map((r) => r.id))));
      // Already on someone's line this month (they left, this person moved in, and now this person leaves too): it stays there.
      await tx.insert(leaseEnds).values({ houseId, room: roomName, userId: user.id, month, memoryMb: room.memoryMb, endedAt: now }).onConflictDoNothing();
      // Their last room here: they stay until the month is over, on the bill and in the chat.
      const [{ left }] = await tx.select({ left: count() }).from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.occupantId, user.id)));
      if (left === 0) await tx.update(memberships).set({ leavingMonth: month }).where(and(eq(memberships.houseId, houseId), eq(memberships.userId, user.id)));
    });
    // The caretaker stops any build on its way, then clears the room, so nothing of theirs can start in it afterwards.
    // Offline, it does when it's back: containers in a room nobody built for are a leftover (applySnapshot).
    if (this.agents.isOnline(houseId)) {
      this.agents.send(houseId, { type: "cancel_build", room: roomName });
      this.agents.send(houseId, { type: "remove_room", room: roomName });
    }
    await this.houses.emptyRoom(houseId, roomName);
    await this.houses.note(houseId, { tone: "info", room: roomName, text: noteText("endedLease", { name: user.name ?? user.login }) });
    return { until: monthEnd(month).toISOString() };
  }

  /**
   * The month rolls over, for every month that's over at `now`: old lease_ends rows go, and the people who were leaving
   * stop being flatmates. If the chef was one of them, the first in the tontine line becomes chef. That's the only time
   * the chef changes. A house with nobody left goes, and its server stops. Running it twice does nothing the second time.
   */
  async settleLeases(now = new Date()): Promise<void> {
    const month = monthOf(now);
    await this.db.delete(leaseEnds).where(lt(leaseEnds.month, month));
    const leaving = await this.db
      .select({ houseId: memberships.houseId, userId: memberships.userId })
      .from(memberships)
      .where(and(isNotNull(memberships.leavingMonth), lt(memberships.leavingMonth, month)));
    for (const houseId of new Set(leaving.map((l) => l.houseId))) {
      await this.settleHouse(houseId, leaving.filter((l) => l.houseId === houseId).map((l) => l.userId));
    }
  }

  private async settleHouse(houseId: string, gone: string[]): Promise<void> {
    const outcome = await this.db.transaction(async (tx) => {
      const houseRooms = await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.houseId, houseId));
      if (houseRooms.length) await tx.delete(roomTeammates).where(and(inArray(roomTeammates.roomId, houseRooms.map((r) => r.id)), inArray(roomTeammates.userId, gone)));
      await tx.delete(chores).where(and(eq(chores.houseId, houseId), eq(chores.status, "open"), inArray(chores.assigneeId, gone)));
      await tx.delete(memberships).where(and(eq(memberships.houseId, houseId), inArray(memberships.userId, gone)));

      const line = await tx.select().from(memberships).where(eq(memberships.houseId, houseId)).orderBy(asc(memberships.tontinePosition), asc(memberships.joinedAt));
      if (!line.length) {
        // Chat isn't tied to a house in the schema, so its channels go by hand; everything else cascades (demo.service.ts).
        const knocks = await tx.select({ id: applications.id }).from(applications).where(eq(applications.houseId, houseId));
        await tx.delete(messages).where(inArray(messages.channel, [houseChannel(houseId), ...knocks.map((k) => applicationChannel(k.id))]));
        await tx.delete(houses).where(eq(houses.id, houseId));
        return { empty: true, chef: null };
      }
      if (line.some((m) => m.role === "chef")) return { empty: false, chef: null };
      await tx.update(memberships).set({ role: "chef" }).where(and(eq(memberships.houseId, houseId), eq(memberships.userId, line[0].userId)));
      await tx.update(houses).set({ chefId: line[0].userId }).where(eq(houses.id, houseId));
      return { empty: false, chef: line[0].userId };
    });
    if (outcome.empty) {
      // Its caretaker goes too, once it has emptied what it was still emptying (landlord.ts), as when the city is reset.
      this.agents.hangUp(houseId, "the house has closed");
      this.landlord?.retire(houseId);
    } else if (outcome.chef) {
      await this.houses.note(houseId, { tone: "info", text: noteText("newChef", { name: await this.houses.occupantName(outcome.chef) }) });
    }
    this.houses.changes.next(houseId);
  }

  private async find(houseId: string, roomName: string) {
    const [house] = await this.db.select().from(houses).where(eq(houses.id, houseId));
    const room = await this.houses.room(houseId, roomName);
    if (!house || !room) throw new NotFoundException({ message: "No such room.", code: "noRoom" });
    return { house, room };
  }

  // The database may not be up yet when the API starts: it tries again until it's done once, then once an hour.
  onModuleInit(): void {
    this.hourly = setInterval(() => void this.settleQuietly(), HOUR_MS);
    this.hourly.unref();
    void this.settleQuietly(true);
  }

  onModuleDestroy(): void {
    clearInterval(this.hourly);
    clearTimeout(this.retry);
  }

  private async settleQuietly(firstRun = false): Promise<void> {
    try {
      await this.settleLeases();
      // Then the month's rent, once those whose lease ran out are gone: the first run of a month charges everyone,
      // the others only whoever is still owing (rent.ts).
      await this.houses.rentCollector.chargeAll();
    } catch (e) {
      if (!isCoreDown(e)) this.log.warn(`couldn't settle leases: ${(e as Error).message}`);
      if (firstRun) {
        this.retry = setTimeout(() => void this.settleQuietly(true), RETRY_DB_MS);
        this.retry.unref();
      }
    }
  }
}
