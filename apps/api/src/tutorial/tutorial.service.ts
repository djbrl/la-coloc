// The tutorial, server side: the quest "Your first home". A newcomer walks into the workshop (a real house flagged
// `tutorial`, run by its own agent), takes a room there, puts the starter page online in it, links the GitHub App
// and shares their address. The web side tells the story in chapters; this file keeps the facts (the room, its
// deploys, the linked repo, the furthest chapter reached). Taking the tutorial again removes that room, so the next
// run starts from nothing.
import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { type Db, deployments, fridgeNotes, githubInstallations, houses, memberships, repos, roomSecrets, rooms, usageSamples, users } from "@coloc/db";
import { and, asc, eq } from "drizzle-orm";
import { AgentRegistry } from "../agents/agent.registry";
import type { User } from "../auth/auth.service";
import { isCoreDown } from "../core/core";
import { DB } from "../db/db.module";
import { GITHUB_CLIENT } from "../github/chores.service";
import type { GithubAppClient, GhRepoInfo } from "../github/github.client";
import type { GithubAppConfig } from "../github/github.config";
import { GITHUB_CONFIG } from "../github/github.controller";
import { HousesService, slugify } from "../houses/houses.service";
import { noteText } from "../houses/lines";
import { RoomDeployer, type Source } from "../rooms/room-deployer";
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

// The quest's chapters, in order. The web side tells each one; the API only remembers the furthest reached.
export const CHAPTERS = ["arrive", "find", "keys", "project", "launch", "open", "share", "house"] as const;
export type Chapter = (typeof CHAPTERS)[number];

// Where the tutorial's project comes from: the ready-made starter page, or the repo the newcomer linked on GitHub.
export type DeploySource = "starter" | "github";

// The newcomer's room is named after them ("Djbrl" → "djbrl"), so their address reads djbrl.atelier.coloc.dev.
// A room name must be 2 to 31 lowercase letters, digits and dashes, starting with a letter (packages/protocol), and
// "preview-…" is how previews are addressed (apps/agent/src/room-spec.ts). A login that breaks a rule ("42", "a",
// "preview-x") gets "home-" in front, which always fits.
const ROOM_NAME = /^[a-z][a-z0-9-]{1,30}$/;
export function tutorialRoomName(login: string): string {
  const slug = slugify(login).slice(0, 31).replace(/-+$/, "");
  if (ROOM_NAME.test(slug) && !slug.startsWith("preview-")) return slug;
  return `home-${slug.slice(0, 26)}`.replace(/-+$/, "");
}

// A failed deploy's detail can be a whole build log; the coach shows one sentence.
function firstLine(text: string | null): string | null {
  const line = text?.split("\n").find((l) => l.trim())?.trim();
  return line || null;
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
    // Talks to GitHub for the repo picker. Null when the App isn't configured; left out in tests that don't need it.
    @Optional() @Inject(GITHUB_CLIENT) private readonly client?: GithubAppClient | null,
  ) {}

  private readonly log = new Logger("tutorial");
  // What GitHub last said about each newcomer's repos, so the coach's 2-second poll asks it at most every 5 seconds.
  // Each repo carries the installation that lets the App see it.
  private readonly seen = new Map<string, { at: number; installation: number | null; repos: (GhRepoInfo & { installation: number })[] }>();

  /**
   * The repos the newcomer let the App see (its installation on their own account, and those they made on an
   * organisation), the most recently pushed first, and the one in their workshop room. Asked straight from GitHub, so a lost install event doesn't matter.
   * `reason` says why the list is empty: GitHub isn't set up here, they didn't log in with GitHub, or nothing is
   * installed yet.
   */
  async repoChoices(user: User) {
    if (!this.client) return { repos: [], chosen: null, reason: "off" as const };
    if (!user.githubId) return { repos: [], chosen: null, reason: "no-github" as const };
    const { installation, repos: list } = await this.installed(user);
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    const chosen = room ? ((await this.repoOf(room))?.githubId ?? null) : null;
    const repos = list
      .map((r) => ({ id: r.id, fullName: r.full_name, description: r.description, language: r.language, private: r.private, pushedAt: r.pushed_at }))
      .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
    return { repos, chosen, reason: installation ? null : ("not-installed" as const) };
  }

  /** Puts the repo they picked in their workshop room: that one, and only that one. */
  async pickRepo(user: User, githubId: number) {
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    if (!room) throw new NotFoundException({ message: "Take a room first.", code: "takeRoomFirst" });
    if (!this.client || !user.githubId) throw new ConflictException({ message: "Log in with GitHub to bring your own project.", code: "githubLoginNeeded" });
    const { repos: list } = await this.installed(user, true);
    const repo = list.find((r) => r.id === githubId);
    if (!repo) throw new NotFoundException({ message: "La Coloc can't see that repo. Allow it on GitHub first.", code: "repoNotVisible" });
    const installation = repo.installation;
    const [elsewhere] = await this.db.select().from(repos).where(eq(repos.githubId, githubId));
    if (elsewhere && (elsewhere.houseId !== room.houseId || elsewhere.room !== room.name)) {
      throw new ConflictException({ message: `${repo.full_name} already lives in another room.`, code: "repoTaken", repo: repo.full_name });
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name)));
      await tx.insert(repos).values({ githubId, fullName: repo.full_name, houseId: room.houseId, room: room.name, installationId: installation });
    });
    await this.houses.note(room.houseId, { tone: "info", room: room.name, text: noteText("reposMoved", { name: user.name ?? user.login, repos: repo.full_name }) });
    return { repo: repo.full_name };
  }

  // The App's installations this person may take repos from, and their repos, from GitHub at most every 5 seconds
  // (always when `fresh`). Their own account's, which GitHub tells the App; and any on an organisation that they
  // installed themselves, which only the install webhook tells (github_installations): GitHub won't say who belongs
  // to an organisation without the person's own token, and an organisation's other members must not be able to
  // move its repos into their room.
  private async installed(user: User, fresh = false) {
    const cached = this.seen.get(user.id);
    if (!fresh && cached && Date.now() - cached.at < 5_000) return cached;
    try {
      const own = await this.client!.userInstallation(user.login);
      const made = user.githubId
        ? await this.db.select({ id: githubInstallations.id }).from(githubInstallations).where(eq(githubInstallations.installerGithubId, user.githubId))
        : [];
      const ids = [...new Set([...(own ? [own] : []), ...made.map((m) => m.id)])];
      // An organisation's install that's gone (its removal missed) is skipped; their own account's must answer.
      const reposOf = async (id: number) => (await this.client!.installationRepos(id)).map((r) => ({ ...r, installation: id }));
      const lists = await Promise.all(ids.map((id) => (id === own ? reposOf(id) : reposOf(id).catch(() => []))));
      // A repo seen through two installations is listed once.
      const repos = [...new Map(lists.flat().map((r) => [r.id, r])).values()];
      const got = { at: Date.now(), installation: ids[0] ?? null, repos };
      this.seen.set(user.id, got);
      return got;
    } catch (e) {
      this.log.warn(`couldn't ask GitHub about ${user.login}'s repos: ${(e as Error).message}`);
      throw new ServiceUnavailableException({ message: "GitHub isn't answering. Try again in a minute.", code: "githubDown" });
    }
  }

  /** Where the newcomer is in the tutorial. */
  async state(user: User) {
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    const linked = await this.hasLinkedRepo(user.id);
    const repo = room ? await this.repoOf(room) : undefined;
    return {
      house: { id: house.id, name: house.name, city: house.city, agentOnline: this.agents.isOnline(house.id) },
      room: room ? { ...roomView(room), status: await this.finerStatus(room), why: await this.whyFailed(room) } : null,
      sample: this.sample,
      github: {
        // Installing the App on a repo moves that repo into the installer's room (see ChoresService).
        installUrl: this.github?.slug ? `https://github.com/apps/${this.github.slug}/installations/new` : null,
        linked,
        // The repo in the workshop room itself, so the coach can name it ("djbrl/portfolio is in your room").
        repo: repo?.fullName ?? null,
      },
      chapter: await this.chapterOf(user.id),
      done: !!user.tutorialDoneAt,
    };
  }

  /**
   * Remembers how far the newcomer got. Only ever forward: opening an old chapter again (or a second tab that
   * lags behind) must not lose their place. Answers the chapter now stored.
   */
  async progress(user: User, chapter: Chapter): Promise<{ chapter: Chapter }> {
    const stored = await this.chapterOf(user.id);
    if (stored && CHAPTERS.indexOf(stored) >= CHAPTERS.indexOf(chapter)) return { chapter: stored };
    await this.db.update(users).set({ tutorialChapter: chapter }).where(eq(users.id, user.id));
    return { chapter };
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
      // The name must be free in every house, not just this one: a caretaker names a room's Docker network after the
      // room alone (apps/agent/src/room-spec.ts `roomNetwork`), and the workshop may share its machine with another
      // house. Jib, who lives in Sacré-Cœur's room "jib", gets "jib-home"; two logins that make the same name
      // ("Jib" and "jib") get "-2", "-3"… after that.
      const base = tutorialRoomName(user.login);
      const taken = new Set((await this.db.select({ name: rooms.name }).from(rooms)).map((r) => r.name));
      const stem = base.slice(0, 26).replace(/-+$/, "");
      let name = taken.has(base) && !taken.has(`${stem}-home`) ? `${stem}-home` : base;
      for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 28).replace(/-+$/, "")}-${n}`;
      [room] = await this.db
        .insert(rooms)
        .values({ houseId: house.id, name, occupantId: user.id, memoryMb: 256, cpus: 0.5, status: "empty" })
        .returning();
    }
    await this.db
      .insert(memberships)
      .values({ houseId: house.id, userId: user.id, role: "flatmate", tontinePosition: 0 })
      .onConflictDoNothing();
    // The house greets them on its fridge, where the other flatmates read the news. (It also tells the live
    // streams the house changed.)
    if (created) await this.houses.note(house.id, { tone: "thanks", room: room.name, text: noteText("movedIn", { name: user.name ?? user.login }) });
    return { created, room: roomView(room) };
  }

  /**
   * Puts a project online in the newcomer's room, the same way the room page does: save the room's settings,
   * then deploy. `from` picks what: "starter" is the ready-made page (examples/hello), "github" the repo they
   * linked. Without it, the linked repo if there is one, else the starter.
   */
  async deploy(user: User, from?: DeploySource): Promise<{ id: string }> {
    const house = await this.workshop();
    const room = await this.roomOf(house.id, user.id);
    if (!room) throw new NotFoundException({ message: "Take a room in the workshop first.", code: "takeWorkshopRoomFirst" });
    if (!this.agents.isOnline(house.id)) throw new ConflictException({ message: "The workshop's server is offline.", code: "workshopOffline" });
    const repo = await this.repoOf(room);
    const pick = from ?? (repo ? "github" : "starter");
    if (pick === "github" && !repo) throw new ConflictException({ message: "Link a repo on GitHub first.", code: "linkRepoFirst" });

    if (pick === "github") {
      // Their own repo builds from its root: the starter's folder (examples/hello) means nothing in it. It takes
      // the repo's name as the project's, unless they named the room's project themselves.
      const sampleNamed = room.project === SAMPLE_PROJECT.name && room.projectDescription === SAMPLE_PROJECT.description;
      const named = !!room.project && !sampleNamed;
      await this.rooms.updateSettings(house.id, room.name, user.id, {
        buildPath: ".",
        project: named ? room.project : repo!.fullName.split("/").pop()!,
        projectDescription: named ? room.projectDescription : null,
      });
    } else if (!repo) {
      // The starter becomes the room's code, with a name and a line, so the room reads as a project on the house
      // view (unless they named it).
      await this.rooms.updateSettings(house.id, room.name, user.id, {
        source: this.sample.repo,
        buildPath: this.sample.path,
        branch: null,
        project: room.project ?? SAMPLE_PROJECT.name,
        projectDescription: room.projectDescription ?? SAMPLE_PROJECT.description,
      });
    }
    const { room: saved } = await this.rooms.manageable(house.id, room.name, user.id);
    try {
      let source: Source | null;
      let ready = saved;
      if (pick === "starter") {
        // Straight from the sample's repo, even with a GitHub repo linked: RoomDeployer.source would pick that one.
        // The starter's folder goes with this deploy only, so the room's settings stay right for their repo's next
        // merge.
        source = { url: this.sample.repo, ref: "main" };
        ready = { ...saved, buildPath: this.sample.path };
      } else {
        source = await this.deployer.source(saved);
        if (!source?.github) throw new Error("This server can't reach GitHub right now. Try again in a minute.");
      }
      const d = await this.deployer.deploy({ room: ready, kind: "prod", source, requestedBy: user.id });
      return { id: d.id };
    } catch (e) {
      if (isCoreDown(e)) throw e;
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
    await this.db.update(users).set({ tutorialDoneAt: null, tutorialChapter: null }).where(eq(users.id, user.id));
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

  // Why the room's last deploy failed, in one line (the agent's detail: "the build failed: …"). Null when it didn't.
  private async whyFailed(room: Room): Promise<string | null> {
    if (!room.lastDeployId) return null;
    const [d] = await this.db
      .select({ status: deployments.status, detail: deployments.detail })
      .from(deployments)
      .where(and(eq(deployments.id, room.lastDeployId), eq(deployments.houseId, room.houseId)));
    return d?.status === "failed" ? firstLine(d.detail) : null;
  }

  // The GitHub repo linked to this room, if any.
  private async repoOf(room: Room) {
    const [repo] = await this.db.select().from(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name))).limit(1);
    return repo;
  }

  // The furthest chapter stored. Read fresh, not from the session's user: another tab may have moved it on.
  private async chapterOf(userId: string): Promise<Chapter | null> {
    const [u] = await this.db.select({ chapter: users.tutorialChapter }).from(users).where(eq(users.id, userId));
    const chapter = u?.chapter;
    return chapter && (CHAPTERS as readonly string[]).includes(chapter) ? (chapter as Chapter) : null;
  }

  // The workshop: the first house flagged `tutorial` (the seed makes one, L'Atelier).
  private async workshop() {
    const [house] = await this.db.select().from(houses).where(eq(houses.tutorial, true)).orderBy(asc(houses.createdAt)).limit(1);
    if (!house) throw new NotFoundException({ message: "There's no workshop on this server.", code: "noWorkshop" });
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
