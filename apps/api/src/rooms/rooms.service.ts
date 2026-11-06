// A room, as its flatmate manages it: build settings, secrets, history.
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { type Db, deployments, houses, memberships, repos, roomSecrets, rooms, users } from "@coloc/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { DB } from "../db/db.module";
import { HousesService, person } from "../houses/houses.service";
import { monthEnd, monthOf } from "../houses/money";
import { SECRETS } from "./room-deployer";
import { checkSecret, MAX_SECRETS, type SecretBox } from "./secrets";
import { sshAddress } from "../ssh/ssh.service";

export interface RoomSettings {
  project?: string | null;
  projectDescription?: string | null;
  branch?: string | null;
  buildPath?: string;
  port?: number | null;
  source?: string | null;
}

/** "https://github.com/awa/ndaje.git" and "docker://ghcr.io/awa/ndaje:1.0" are both "ndaje". */
export const projectFrom = (source: string): string | null =>
  source
    .replace(/[:@][^/]*$/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .pop()
    ?.slice(0, 60) || null;

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    @Inject(SECRETS) private readonly box: SecretBox | null,
  ) {}

  /** The room's latest real build (previews have their own addresses and aren't what the room is showing). */
  async lastBuild(houseId: string, roomName: string) {
    const [d] = await this.db
      .select({ id: deployments.id, status: deployments.status, ref: deployments.ref, repo: deployments.repo, detail: deployments.detail, createdAt: deployments.createdAt, updatedAt: deployments.updatedAt })
      .from(deployments)
      .where(and(eq(deployments.houseId, houseId), eq(deployments.room, roomName), eq(deployments.kind, "prod")))
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    return d ?? null;
  }

  /**
   * The room, if `userId` may manage it: its flatmate (who lives there), or the house's chef (update and restart only).
   * Nobody else, not even another flatmate: a room is one person's. Working together goes through reviews.
   */
  async manageable(houseId: string, roomName: string, userId: string) {
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    if (!room) throw new NotFoundException("No such room.");
    if (room.occupantId === userId) return { room, as: "flatmate" as const };
    const [m] = await this.db.select().from(memberships).where(and(eq(memberships.houseId, houseId), eq(memberships.userId, userId)));
    if (m?.role === "chef") return { room, as: "chef" as const };
    throw new ForbiddenException("This isn't your room.");
  }

  /**
   * The room, if `userId` could open a shell in it: what's inside is for its flatmate alone, not the chef, who only
   * updates and restarts. Command lines and file names can say more than a project's page does. An example room has
   * nothing inside.
   */
  async enterable(houseId: string, roomName: string, userId: string) {
    const { room, as } = await this.manageable(houseId, roomName, userId);
    const [house] = await this.db.select({ demo: houses.demo }).from(houses).where(eq(houses.id, houseId));
    if (as !== "flatmate" || room.demo || house?.demo) throw new ForbiddenException("This isn't your room.");
    return room;
  }

  /** As they'd appear on the room's page: for showing who's in a room. */
  async peopleByIds(ids: string[]) {
    if (!ids.length) return [];
    const found = await this.db.select().from(users).where(inArray(users.id, ids));
    return found.map((u) => person(u)!);
  }

  /** Everything the room page shows. Secret values never leave: only their names. */
  async view(houseId: string, roomName: string, userId: string) {
    const { room, as } = await this.manageable(houseId, roomName, userId);
    const house = await this.houses.view(houseId, userId);
    const [repo] = await this.db.select().from(repos).where(and(eq(repos.houseId, houseId), eq(repos.room, roomName)));
    const secrets = await this.db
      .select({ name: roomSecrets.name, updatedAt: roomSecrets.updatedAt })
      .from(roomSecrets)
      .where(and(eq(roomSecrets.houseId, houseId), eq(roomSecrets.room, roomName)))
      .orderBy(asc(roomSecrets.name));
    const history = await this.db
      .select()
      .from(deployments)
      .where(and(eq(deployments.houseId, houseId), eq(deployments.room, roomName)))
      .orderBy(desc(deployments.createdAt))
      .limit(15);
    const live = house!.rooms.find((r) => r.name === roomName)!;
    // Only the flatmate who lives here gets in (SshService, enterable). Nobody else learns the SSH address from us:
    // if they're to have it, the flatmate gives it to them.
    const enters = as === "flatmate" && !room.demo && !house!.demo;
    return {
      house: { id: house!.id, name: house!.name, domain: house!.domain, agentOnline: house!.agentOnline, strictReviews: house!.rules.strictReviews, chef: house!.viewer?.role === "chef" },
      as,
      // The SSH tab, for the one a shell would open to. Not the chef, and not an example room.
      ssh: enters && sshAddress() ? { ...sshAddress()!, user: `${room.name}.${houseId}` } : null,
      // The Inside tab, for the same person, with or without SSH on this server.
      inside: enters,
      // For the occupant, unless the room has no lease to end (the workshop, an example): the Lease tab's numbers.
      lease:
        as === "flatmate" && !room.demo && !house!.demo && !house!.tutorial
          ? { share: house!.bill?.lines.find((l) => l.login === house!.viewer?.login)?.due ?? null, rooms: house!.viewer?.rooms.length ?? 1, until: monthEnd(monthOf(new Date())).toISOString() }
          : null,
      room: {
        name: room.name,
        status: room.status,
        url: room.url,
        previewUrl: history.some((d) => d.kind === "preview" && d.status === "live") ? previewUrl(room.url) : null,
        limits: { memoryMb: room.memoryMb, cpus: room.cpus },
        usage: live.usage,
        occupant: live.occupant,
      },
      settings: {
        project: room.project,
        projectDescription: room.projectDescription,
        branch: room.branch,
        buildPath: room.buildPath,
        port: room.port,
        // The quest's starter page is cloned from a folder on the server: its path is nobody's business.
        source: room.source?.startsWith("file://") ? "file://" : room.source,
      },
      github: repo ? { fullName: repo.fullName, url: `https://github.com/${repo.fullName}` } : null,
      secrets: secrets.map((s) => ({ name: s.name, updatedAt: s.updatedAt.toISOString() })),
      secretsEnabled: !!this.box,
      deployments: history.map((d) => ({
        id: d.id,
        kind: d.kind,
        ref: d.ref,
        status: d.status,
        detail: d.detail,
        prNumber: d.prNumber,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    };
  }

  async updateSettings(houseId: string, roomName: string, userId: string, s: RoomSettings) {
    const { room, as } = await this.manageable(houseId, roomName, userId);
    // Where the code comes from is the flatmate's: a deploy carries the room's secrets, so whoever picks the code can
    // read them. The chef may still name, restart and update a room, from the
    // code it already has.
    const moves = (k: "source" | "branch" | "buildPath") => s[k] !== undefined && (s[k]?.trim() || null) !== (room[k] ?? null);
    if (as === "chef" && room.occupantId && (moves("source") || moves("branch") || moves("buildPath"))) {
      throw new ForbiddenException({ message: "Only the flatmate who lives here can change where the room's code comes from.", code: "flatmateOnlySource" });
    }
    // A link or an image given by hand replaces the GitHub repo linked here, if any: a room has one source of code.
    const replacing = !!s.source?.trim();
    const [linked] = replacing ? await this.db.select().from(repos).where(and(eq(repos.houseId, houseId), eq(repos.room, roomName))) : [];
    if (linked) await this.db.delete(repos).where(eq(repos.githubId, linked.githubId));
    // Until someone names it, a room's project goes by its repo or image, so its tile says what's hosted. A name that
    // only came from the old code goes with it.
    const oldName = linked ? projectFrom(linked.fullName) : room.source ? projectFrom(room.source) : null;
    const ownName = room.project && (!replacing || room.project !== oldName) ? room.project : null;
    await this.db
      .update(rooms)
      .set({
        project: s.project === undefined ? (ownName ?? (s.source ? projectFrom(s.source) : null)) : s.project?.trim() || null,
        projectDescription: s.projectDescription === undefined ? room.projectDescription : s.projectDescription?.trim() || null,
        branch: s.branch === undefined ? room.branch : s.branch?.trim() || null,
        buildPath: s.buildPath === undefined ? room.buildPath : s.buildPath.trim() || ".",
        port: s.port === undefined ? room.port : s.port,
        source: s.source === undefined ? room.source : s.source?.trim() || null,
      })
      .where(eq(rooms.id, room.id));
    this.houses.changes.next(houseId);
  }

  async setSecret(houseId: string, roomName: string, userId: string, name: string, value: string) {
    await this.manageable(houseId, roomName, userId);
    if (!this.box) throw new ServiceUnavailableException("Secrets are off on this server (COLOC_SECRETS_KEY is missing).");
    const problem = checkSecret(name, value);
    if (problem) throw new BadRequestException(problem);
    const existing = await this.db.select({ name: roomSecrets.name }).from(roomSecrets).where(and(eq(roomSecrets.houseId, houseId), eq(roomSecrets.room, roomName)));
    if (existing.length >= MAX_SECRETS && !existing.some((e) => e.name === name)) throw new ConflictException(`A room keeps at most ${MAX_SECRETS} secrets.`);
    const sealed = this.box.encrypt(value);
    await this.db
      .insert(roomSecrets)
      .values({ houseId, room: roomName, name, value: sealed })
      .onConflictDoUpdate({ target: [roomSecrets.houseId, roomSecrets.room, roomSecrets.name], set: { value: sealed, updatedAt: new Date() } });
  }

  async deleteSecret(houseId: string, roomName: string, userId: string, name: string) {
    await this.manageable(houseId, roomName, userId);
    await this.db.delete(roomSecrets).where(and(eq(roomSecrets.houseId, houseId), eq(roomSecrets.room, roomName), eq(roomSecrets.name, name)));
  }
}

// Previews live next door: room.coloc.dev → preview-room.coloc.dev.
function previewUrl(roomUrl: string | null): string | null {
  if (!roomUrl) return null;
  const u = new URL(roomUrl);
  u.hostname = `preview-${u.hostname}`;
  return u.toString().replace(/\/$/, "");
}
