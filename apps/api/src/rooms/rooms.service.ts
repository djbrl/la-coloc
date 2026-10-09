// A room, as its flatmate manages it: build settings, secrets, history.
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { type Db, deployments, memberships, repos, roomSecrets, rooms } from "@coloc/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { SECRETS } from "./room-deployer";
import { checkSecret, MAX_SECRETS, type SecretBox } from "./secrets";

export interface RoomSettings {
  project?: string | null;
  projectDescription?: string | null;
  branch?: string | null;
  buildPath?: string;
  port?: number | null;
  source?: string | null;
}

@Injectable()
export class RoomsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    @Inject(SECRETS) private readonly box: SecretBox | null,
  ) {}

  /** The room, if `userId` may manage it: its flatmate, or the house's chef. */
  async manageable(houseId: string, roomName: string, userId: string) {
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    if (!room) throw new NotFoundException("No such room.");
    if (room.occupantId === userId) return { room, as: "flatmate" as const };
    const [m] = await this.db.select().from(memberships).where(and(eq(memberships.houseId, houseId), eq(memberships.userId, userId)));
    if (m?.role === "chef") return { room, as: "chef" as const };
    throw new ForbiddenException("This isn't your room.");
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
    return {
      house: { id: house!.id, name: house!.name, domain: house!.domain, agentOnline: house!.agentOnline, strictReviews: house!.rules.strictReviews },
      as,
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
        source: room.source,
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
    const { room } = await this.manageable(houseId, roomName, userId);
    await this.db
      .update(rooms)
      .set({
        project: s.project === undefined ? room.project : s.project?.trim() || null,
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
