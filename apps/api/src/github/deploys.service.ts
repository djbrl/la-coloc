// Deploy on merge: a pull request merged into a flatmate's default branch goes live in their room.
// House rule: in a strict house, only a merge the assigned flatmate approved deploys. In a relaxed house it
// deploys anyway and leaves a note. The result is reported back on the pull request.
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { chores, type Db, houses, repos, rooms } from "@coloc/db";
import { and, eq } from "drizzle-orm";
import type { Subscription } from "rxjs";
import { AgentRegistry } from "../agents/agent.registry";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { type GhEvent, GITHUB_CLIENT } from "./chores.service";
import type { GithubAppClient } from "./github.client";

@Injectable()
export class DeploysService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("deploys");
  private sub?: Subscription;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    @Inject(GITHUB_CLIENT) private readonly github: GithubAppClient | null,
  ) {}

  onModuleInit() {
    this.sub = this.houses.deployFinished.subscribe((e) => {
      this.reportOnPr(e.deployment, e.url).catch((err) => this.log.warn(`couldn't report on the PR: ${err.message}`));
    });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  async handle(event: string, p: GhEvent): Promise<string> {
    if (event !== "pull_request" || p.action !== "closed") return "ignored";
    const pr = p.pull_request;
    if (!pr?.merged || !p.repository) return "closed without merging";
    const [repo] = await this.db.select().from(repos).where(eq(repos.githubId, p.repository.id));
    if (!repo) return "repo not in any room";
    const branch = pr.base?.ref;
    if (!branch || branch !== p.repository.default_branch) return `merged into ${branch ?? "?"}, not the default branch`;

    const [house] = await this.db.select().from(houses).where(eq(houses.id, repo.houseId));
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, repo.houseId), eq(rooms.name, repo.room)));
    if (!house || !room) return "room is gone";
    const [chore] = await this.db.select().from(chores).where(and(eq(chores.repoId, repo.githubId), eq(chores.prNumber, pr.number)));
    const approved = chore?.status === "done" && chore.outcome === "approved";
    const ref = `${repo.fullName}#${pr.number}`;

    if (house.rules.strictReviews && !approved) {
      await this.houses.note(house.id, { tone: "warning", room: room.name, text: `${ref} was merged without a flatmate's approval. Strict house: not deployed.` });
      await this.comment(repo, pr.number, `**Not deployed.** ${house.name} is a strict house: a merge only goes live once the flatmate on review duty has approved it. The previous version is still running.`);
      return "not deployed: unreviewed in a strict house";
    }
    if (!this.agents.isOnline(house.id)) {
      await this.houses.note(house.id, { tone: "danger", room: room.name, text: `${ref} was merged, but the house's server is offline. Not deployed.` });
      await this.comment(repo, pr.number, `**Not deployed:** ${house.name}'s server is offline right now. The previous version will be back with it.`);
      return "not deployed: server offline";
    }
    if (!this.github) return "no GitHub App configured";

    // The agent never holds GitHub credentials: it gets a token valid for one hour, for this one repo's installation.
    const token = await this.github.installationToken(repo.installationId);
    const url = `https://x-access-token:${token}@github.com/${repo.fullName}.git`;
    const d = await this.houses.createDeployment(house.id, room.name, "prod", url, branch, room.occupantId, { repoId: repo.githubId, prNumber: pr.number });
    this.agents.send(house.id, {
      type: "deploy",
      deployId: d.id,
      room: room.name,
      kind: "prod",
      repo: url,
      ref: branch,
      path: ".",
      limits: { memoryMb: room.memoryMb, cpus: room.cpus },
      env: {},
    });
    if (!approved) {
      await this.houses.note(house.id, { tone: "warning", room: room.name, text: `${ref} was merged without a flatmate's approval. Relaxed house: deploying anyway.` });
    }
    return `deploying ${d.id}`;
  }

  /** Tells the pull request how its deploy went. */
  private async reportOnPr(d: { githubRepoId: number | null; prNumber: number | null; status: string; detail: string | null }, url: string | null) {
    if (!d.githubRepoId || !d.prNumber) return;
    const [repo] = await this.db.select().from(repos).where(eq(repos.githubId, d.githubRepoId));
    if (!repo) return;
    const text =
      d.status === "live"
        ? `**Deployed** to ${url ?? "the room"}. Live now.`
        : `**Deploy failed:** ${(d.detail ?? "unknown error").split("\n")[0]}. The previous version is still running.`;
    await this.comment(repo, d.prNumber, text);
  }

  private async comment(repo: { installationId: number; fullName: string }, pr: number, text: string) {
    if (!this.github) return;
    await this.github
      .comment(repo.installationId, repo.fullName, pr, `${text}\n\n<sub>[La Coloc](https://coloc.dev) deploys on merge.</sub>`)
      .catch((e) => this.log.warn(e.message));
  }
}
