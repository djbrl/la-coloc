// The tutorial, server side. A newcomer walks into the workshop (a real house flagged `tutorial`, run by its own
// agent), takes a room there, puts a sample project online in it, and links the GitHub App. Taking the tutorial
// again removes that room, so the next run starts from nothing.
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Db, deployments, fridgeNotes, houses, memberships, repos, roomSecrets, rooms, usageSamples, users } from "@coloc/db";
import { and, asc, eq } from "drizzle-orm";
import { AgentRegistry } from "../agents/agent.registry";
import type { User } from "../auth/auth.service";
import { DB } from "../db/db.module";
import type { GithubAppConfig } from "../github/github.config";
import { GITHUB_CONFIG } from "../github/github.controller";
import { HousesService, slugify } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { RoomsService } from "../rooms/rooms.service";

export const TUTORIAL_SAMPLE = Symbol("TUTORIAL_SAMPLE");

// What the sample is called in your room once it's online.
export const SAMPLE_PROJECT = { name: "Hello", description: "My first project: a small page that says hello." };

// The sample project the newcomer puts online: a repo, and the folder in it that holds the Dockerfile.
export interface TutorialSample {
  repo: string;
  path: string;
}

export function loadTutorialSample(env = process.env): TutorialSample {
  return {
    repo: env.COLOC_TUTORIAL_REPO || "https://github.com/Djbrl/la-coloc.git",
    path: env.COLOC_TUTORIAL_PATH || "examples/hello",
  };
}

// The newcomer's room: "tuto-" and their login ("Djbrl" → "tuto-djbrl"), cut so it stays a valid room name
// (at most 31 characters).
export function tutorialRoomName(login: string): string {
  const slug = slugify(login).slice(0, 26).replace(/-+$/, "");
  return `tuto-${slug || "room"}`;
}

type Room = typeof rooms.$inferSelect;

// What the tutorial screens need to know about the newcomer's room.
function roomView(r: Room) {
  return { name: r.name, status: r.status, url: r.url };
}

@Injectable()
export class TutorialService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly rooms: RoomsService,
    private readonly deployer: RoomDeployer,
    private readonly agents: AgentRegistry,
    @Inject(GITHUB_CONFIG) private readonly github: GithubAppConfig | null,
    @Inject(TUTORIAL_SAMPLE) private readonly sample: TutorialSample,
  ) {}

  /** Where the newcomer is in the tutorial. */
  async state(user: User) {
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    const linked = await this.hasLinkedRepo(user.id);
    return {
      house: { id: house.id, name: house.name, city: house.city, agentOnline: this.agents.isOnline(house.id) },
      room: room ? { ...roomView(room), status: await this.finerStatus(room) } : null,
      sample: this.sample,
      github: {
        // Installing the App on a repo moves that repo into the installer's room (see ChoresService).
        installUrl: this.github?.slug ? `https://github.com/apps/${this.github.slug}/installations/new` : null,
        linked,
      },
      done: !!user.tutorialDoneAt,
    };
  }

  /**
   * Gives the newcomer a room in the workshop, and makes them a flatmate there. Asking twice gives the same room:
   * `created` says whether it's new.
   */
  async takeRoom(user: User): Promise<{ created: boolean; room: ReturnType<typeof roomView> }> {
    const house = await this.workshop();
    let room = await this.roomOf(house.id, user.id);
    const created = !room;
    if (!room) {
      // Two logins can make the same name ("Jib" and "jib"): the second one gets "-2", and so on.
      const base = tutorialRoomName(user.login);
      const taken = new Set((await this.db.select({ name: rooms.name }).from(rooms).where(eq(rooms.houseId, house.id))).map((r) => r.name));
      let name = base;
      for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 28)}-${n}`;
      [room] = await this.db
        .insert(rooms)
        .values({ houseId: house.id, name, occupantId: user.id, memoryMb: 256, cpus: 0.5, status: "empty" })
        .returning();
    }
    await this.db
      .insert(memberships)
      .values({ houseId: house.id, userId: user.id, role: "flatmate", tontinePosition: 0 })
      .onConflictDoNothing();
    if (created) this.houses.changes.next(house.id);
    return { created, room: roomView(room) };
  }

  /**
   * Puts the sample project online in the newcomer's room, the same way the room page does: save it as the
   * room's code, then deploy. Once they've linked a GitHub repo, the room builds that instead (RoomDeployer.source).
   */
  async deploy(user: User): Promise<{ id: string }> {
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    if (!room) throw new NotFoundException("Take a room in the workshop first.");
    if (!this.agents.isOnline(house.id)) throw new ConflictException("The workshop's server is offline.");
    // The sample gets a name and a line, so the room reads as a project on the house view (unless you named it).
    await this.rooms.updateSettings(house.id, room.name, user.id, {
      source: this.sample.repo,
      buildPath: this.sample.path,
      branch: null,
      project: room.project ?? SAMPLE_PROJECT.name,
      projectDescription: room.projectDescription ?? SAMPLE_PROJECT.description,
    });
    const { room: ready } = await this.rooms.manageable(house.id, room.name, user.id);
    try {
      const source = await this.deployer.source(ready);
      if (!source) throw new Error("This room has no code yet.");
      const d = await this.deployer.deploy({ room: ready, kind: "prod", source, requestedBy: user.id });
      return { id: d.id };
    } catch (e) {
      throw new ConflictException((e as Error).message);
    }
  }

  /**
   * For taking the tutorial again: the newcomer's workshop room goes (its containers, its row, everything filed
   * under it), they stop being a flatmate there, and the tutorial counts as not done.
   */
  async reset(user: User): Promise<{ ok: true }> {
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    if (room) {
      // Like the chef's "empty": the agent stops and removes the room's containers. If it's offline, they stay
      // until someone removes them by hand; the room is gone either way.
      if (this.agents.isOnline(house.id)) this.agents.send(house.id, { type: "remove_room", room: room.name });
      await this.houses.emptyRoom(house.id, room.name);
      await this.db.transaction(async (tx) => {
        await tx.delete(repos).where(and(eq(repos.houseId, house.id), eq(repos.room, room.name)));
        await tx.delete(roomSecrets).where(and(eq(roomSecrets.houseId, house.id), eq(roomSecrets.room, room.name)));
        await tx.delete(deployments).where(and(eq(deployments.houseId, house.id), eq(deployments.room, room.name)));
        await tx.delete(usageSamples).where(and(eq(usageSamples.houseId, house.id), eq(usageSamples.room, room.name)));
        await tx.delete(fridgeNotes).where(and(eq(fridgeNotes.houseId, house.id), eq(fridgeNotes.room, room.name)));
        await tx.delete(rooms).where(eq(rooms.id, room.id));
      });
    }
    // Only a flatmate's place: the workshop's chef stays its chef, and a seeded learner still lives in their
    // example room.
    const [example] = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.houseId, house.id), eq(rooms.occupantId, user.id), eq(rooms.demo, true)))
      .limit(1);
    if (!example) {
      await this.db
        .delete(memberships)
        .where(and(eq(memberships.houseId, house.id), eq(memberships.userId, user.id), eq(memberships.role, "flatmate")));
    }
    await this.db.update(users).set({ tutorialDoneAt: null }).where(eq(users.id, user.id));
    this.houses.changes.next(house.id);
    return { ok: true };
  }

  // While the room is being put online, the step its deployment is at ("cloning", "building", "starting"), so the
  // coach can say "Fetching the code…", then "Building…", then "Starting…". Otherwise the room's own status.
  private async finerStatus(room: Room): Promise<string> {
    if (room.status !== "deploying" || !room.lastDeployId) return room.status;
    const [d] = await this.db
      .select({ status: deployments.status })
      .from(deployments)
      .where(and(eq(deployments.id, room.lastDeployId), eq(deployments.houseId, room.houseId)));
    return d && ["queued", "cloning", "building", "starting"].includes(d.status) ? d.status : room.status;
  }

  // The workshop: the first house flagged `tutorial` (the seed makes one, L'Atelier).
  private async workshop() {
    const [house] = await this.db.select().from(houses).where(eq(houses.tutorial, true)).orderBy(asc(houses.createdAt)).limit(1);
    if (!house) throw new NotFoundException("There's no workshop on this server.");
    return house;
  }

  // Has a repo been linked to a room the newcomer lives in? Their workshop room counts, and so does a room in
  // a real house: the installation may have gone there. We don't keep a list of installations by account, so a
  // login without a GitHub id (the dev login) can never be traced to one.
  private async hasLinkedRepo(userId: string): Promise<boolean> {
    const found = await this.db
      .select({ id: repos.githubId })
      .from(repos)
      .innerJoin(rooms, and(eq(rooms.houseId, repos.houseId), eq(rooms.name, repos.room)))
      .where(eq(rooms.occupantId, userId))
      .limit(1);
    return found.length > 0;
  }

  // The newcomer's own room in the workshop. The example rooms (`demo`) never count, even for a seeded learner
  // who logs in and takes the tutorial: theirs is scenery, and taking it again must not remove it.
  private async roomOf(houseId: string, userId: string): Promise<Room | undefined> {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.houseId, houseId), eq(rooms.occupantId, userId), eq(rooms.demo, false)))
      .limit(1);
    return room;
  }
}
