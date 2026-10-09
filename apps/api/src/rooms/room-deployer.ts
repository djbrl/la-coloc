// One way to deploy a room, whoever asks: the room page, a merged pull request, a preview. It builds the agent's
// deploy command from the room's settings (branch, folder, port) and its decrypted secrets.
import { Inject, Injectable } from "@nestjs/common";
import { type Db, repos, roomSecrets, rooms } from "@coloc/db";
import type { DeployKind } from "@coloc/protocol";
import { and, eq } from "drizzle-orm";
import { AgentRegistry } from "../agents/agent.registry";
import { DB } from "../db/db.module";
import { GITHUB_CLIENT } from "../github/chores.service";
import type { GithubAppClient } from "../github/github.client";
import type { DeploymentView } from "../houses/house.types";
import { HousesService } from "../houses/houses.service";
import type { SecretBox } from "./secrets";

export const SECRETS = Symbol("SECRETS");
type Room = typeof rooms.$inferSelect;

export interface Source {
  // What the agent clones. For a GitHub repo it carries a one-hour token: never store or show it.
  url: string;
  ref: string;
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

  /** The room's secrets, decrypted, as environment variables. */
  async env(houseId: string, room: string): Promise<Record<string, string>> {
    const rows = await this.db.select().from(roomSecrets).where(and(eq(roomSecrets.houseId, houseId), eq(roomSecrets.room, room)));
    if (!rows.length) return {};
    if (!this.secrets) throw new Error("This server can't open the room's secrets (COLOC_SECRETS_KEY is missing).");
    return Object.fromEntries(rows.map((r) => [r.name, this.secrets!.decrypt(r.value)]));
  }

  /** Where the room's code comes from: its linked GitHub repo if it has one, else the repo it was deployed from by hand. */
  async source(room: Room): Promise<Source | null> {
    const [repo] = await this.db.select().from(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name)));
    if (repo && this.github) {
      const token = await this.github.installationToken(repo.installationId);
      const ref = room.branch ?? (await this.github.defaultBranch(repo.installationId, repo.fullName));
      return { url: `https://x-access-token:${token}@github.com/${repo.fullName}.git`, ref, github: { repoId: repo.githubId } };
    }
    if (room.source) return { url: room.source, ref: room.branch ?? "main" };
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
    const env = await this.env(room.houseId, room.name);
    const d = await this.houses.createDeployment(
      room.houseId,
      room.name,
      kind,
      source.url,
      source.ref,
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
