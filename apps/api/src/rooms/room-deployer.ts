// One way to deploy a room, whoever asks: the room page, a merged pull request, a preview. It builds the agent's
// deploy command from the room's settings (branch, folder, port) and its decrypted secrets.
import { ConflictException, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { type Db, deployments, houses, repos, roomSecrets, rooms, users } from "@coloc/db";
import type { DeployKind } from "@coloc/protocol";
import { and, count, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { Limiter } from "../chat/limiter";
import { AgentRegistry } from "../agents/agent.registry";
import { DB } from "../db/db.module";
import { GITHUB_CLIENT } from "../github/chores.service";
import type { GithubAppClient } from "../github/github.client";
import type { DeploymentView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import { noCredit, projectKey } from "../credit/credit.service";
import { MAX_PROJECTS_PER_PERSON, PROJECT_COST_FCFA, WORKSHOP_ID } from "../houses/money";
import type { SecretBox } from "./secrets";

export const SECRETS = Symbol("SECRETS");
type Room = typeof rooms.$inferSelect;

// Deploys someone asks for by hand (the room page, the quest): each one is a build on the house's server, so a few
// in a row, then a pause. Merges and previews from GitHub don't count: they come from pushes, not from a button.
export const DEPLOYS = { count: 5, perMs: 10 * 60_000 };
// A build that hasn't reported back in this long is stuck, not running: don't let it block the room for ever.
const STUCK_MS = 15 * 60_000;
export const UNDER_WAY = ["queued", "cloning", "building", "starting"] as const;

export interface Source {
  // What the agent clones. For a GitHub repo it carries a one-hour token: never store or show it.
  url: string;
  // No ref: the repo's default branch, whatever it's called.
  ref?: string;
  github?: { repoId: number };
}

@Injectable()
export class RoomDeployer {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    @Inject(SECRETS) private readonly secrets: SecretBox | null,
    @Inject(GITHUB_CLIENT) private readonly github: GithubAppClient | null,
  ) {}

  private readonly byHand = new Limiter(DEPLOYS.count, DEPLOYS.perMs);

  /**
   * The brake on deploys asked for by hand: one at a time per room (a second press while it builds does nothing but
   * build twice), and a few per person in ten minutes. Throws the 409 or 429 to show them.
   */
  async brake(room: Room, kind: DeployKind, userId: string, now = new Date()): Promise<void> {
    const [running] = await this.db
      .select({ id: deployments.id })
      .from(deployments)
      .where(
        and(
          eq(deployments.houseId, room.houseId),
          eq(deployments.room, room.name),
          eq(deployments.kind, kind),
          inArray(deployments.status, [...UNDER_WAY]),
          gt(deployments.createdAt, new Date(now.getTime() - STUCK_MS)),
        ),
      )
      .limit(1);
    if (running) throw new ConflictException({ message: "This room is already being put online. Wait for it to finish.", code: "alreadyDeploying" });
    if (kind === "prod" && room.houseId !== WORKSHOP_ID) await this.canStartProject(room, userId);
    if (!this.byHand.take(userId, now.getTime())) {
      throw new HttpException({ message: "That's a lot of deploys in a few minutes. Wait a little before the next one.", code: "slowDownDeploys" }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /**
   * Only so many projects a person, and a new one has to be affordable. It's only paid once it's online (HousesService
   * recordDeployStatus), so a failed build costs nothing. Its occupant pays, whoever pressed the button. The workshop is free.
   */
  private async canStartProject(room: Room, userId: string): Promise<void> {
    const payer = room.occupantId ?? userId;
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(rooms)
      .where(and(eq(rooms.occupantId, payer), ne(rooms.houseId, WORKSHOP_ID), isNotNull(rooms.lastDeployId), ne(rooms.status, "empty"), ne(rooms.id, room.id)));
    if (n >= MAX_PROJECTS_PER_PERSON) {
      throw new ConflictException({ code: "project_limit", max: MAX_PROJECTS_PER_PERSON, message: `${MAX_PROJECTS_PER_PERSON} projects a person. Empty one of your rooms to start another.` });
    }
    if (room.url || (await this.houses.credit.paid(projectKey(room.houseId, room.name, payer)))) return;
    const credit = await this.houses.credit.balance(payer);
    if (credit < PROJECT_COST_FCFA) throw noCredit(PROJECT_COST_FCFA - credit);
  }

  /** The room's secrets, decrypted, as environment variables. */
  async env(houseId: string, room: string): Promise<Record<string, string>> {
    const rows = await this.db.select().from(roomSecrets).where(and(eq(roomSecrets.houseId, houseId), eq(roomSecrets.room, room)));
    if (!rows.length) return {};
    if (!this.secrets) throw new Error("This server can't open the room's secrets (COLOC_SECRETS_KEY is missing).");
    return Object.fromEntries(rows.map((r) => [r.name, this.secrets!.decrypt(r.value)]));
  }

  /**
   * Where the app lives, as environment variables, so a page can say hello in its own city: COLOC_ROOM, COLOC_HOUSE
   * (the house's name), COLOC_CITY, COLOC_COUNTRY (two letters), COLOC_LOGIN and COLOC_NAME (who lives there).
   * Nothing secret: all of it is on the house's public page already.
   */
  async context(room: Room): Promise<Record<string, string>> {
    const [h] = await this.db.select({ name: houses.name, city: houses.city, country: houses.country }).from(houses).where(eq(houses.id, room.houseId));
    const [u] = room.occupantId ? await this.db.select({ login: users.login, name: users.name }).from(users).where(eq(users.id, room.occupantId)) : [];
    const env: Record<string, string> = { COLOC_ROOM: room.name };
    if (h) Object.assign(env, { COLOC_HOUSE: h.name, COLOC_CITY: h.city, COLOC_COUNTRY: h.country });
    if (u) Object.assign(env, { COLOC_LOGIN: u.login, COLOC_NAME: u.name ?? u.login });
    return env;
  }

  /** Where the room's code comes from: its linked GitHub repo if it has one, else the repo it was deployed from by hand. */
  async source(room: Room): Promise<Source | null> {
    const [repo] = await this.db.select().from(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name)));
    if (repo && this.github) {
      const token = await this.github.installationToken(repo.installationId);
      const ref = room.branch ?? (await this.github.defaultBranch(repo.installationId, repo.fullName));
      return { url: `https://x-access-token:${token}@github.com/${repo.fullName}.git`, ref, github: { repoId: repo.githubId } };
    }
    if (room.source) return { url: room.source, ref: room.branch ?? undefined };
    return null;
  }

  async deploy(opts: {
    room: Room;
    kind: DeployKind;
    source: Source;
    requestedBy?: string | null;
    prNumber?: number;
  }): Promise<DeploymentView> {
    const { room, kind, source } = opts;
    if (!this.agents.isOnline(room.houseId)) throw new Error("The house's server is offline.");
    // The room's secrets can't reuse these names (secrets.ts RESERVED), so neither hides the other.
    const env = { ...(await this.context(room)), ...(await this.env(room.houseId, room.name)) };
    const d = await this.houses.createDeployment(
      room.houseId,
      room.name,
      kind,
      source.url,
      source.ref ?? "default",
      opts.requestedBy ?? null,
      source.github && opts.prNumber ? { repoId: source.github.repoId, prNumber: opts.prNumber } : undefined,
    );
    this.agents.send(room.houseId, {
      type: "deploy",
      deployId: d.id,
      room: room.name,
      kind,
      repo: source.url,
      ref: source.ref,
      path: room.buildPath,
      port: room.port ?? undefined,
      limits: { memoryMb: room.memoryMb, cpus: room.cpus },
      env,
    });
    return d;
  }
}
