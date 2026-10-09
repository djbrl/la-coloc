// Pull requests and the room: a preview while a PR is open, the real thing when it's merged.
// - Opened or pushed to: build a preview at preview-<room>.<house>, for the reviewer to click around.
//   Never for pull requests from forks: that would run a stranger's code on the house's server.
// - Closed: the preview leaves. Merged into the default branch: deploy to the room. A strict house only
//   deploys what the flatmate on review duty approved (their latest review counts); a relaxed one deploys
//   anyway and leaves a note.
// Results are commented on the pull request.
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { chores, type Db, deployments, houses, repos, rooms } from "@coloc/db";
import { and, eq, ne } from "drizzle-orm";
import type { Subscription } from "rxjs";
import { AgentRegistry } from "../agents/agent.registry";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { RoomDeployer } from "../rooms/room-deployer";
import { type GhEvent, GITHUB_CLIENT } from "./chores.service";
import type { GithubAppClient } from "./github.client";

const PREVIEW_ACTIONS = ["opened", "reopened", "synchronize", "ready_for_review"];

@Injectable()
export class DeploysService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("deploys");
  private sub?: Subscription;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    private readonly deployer: RoomDeployer,
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
    if (event !== "pull_request" || !p.pull_request || !p.repository) return "ignored";
    if (PREVIEW_ACTIONS.includes(p.action ?? "")) return this.preview(p);
    if (p.action === "closed") return this.closed(p);
    return "ignored";
  }

  private async linked(p: GhEvent) {
    const [repo] = await this.db.select().from(repos).where(eq(repos.githubId, p.repository!.id));
    if (!repo) return null;
    const [house] = await this.db.select().from(houses).where(eq(houses.id, repo.houseId));
    const [room] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, repo.houseId), eq(rooms.name, repo.room)));
    if (!house || !room) return null;
    return { repo, house, room };
  }

  private async preview(p: GhEvent): Promise<string> {
    const pr = p.pull_request!;
    if (pr.draft) return "draft: no preview yet";
    // A fork's code is a stranger's code: it doesn't run in the house.
    if (pr.head?.repo?.id !== p.repository!.id) return "no preview for pull requests from forks";
    const l = await this.linked(p);
    if (!l) return "repo not in any room";
    if (!this.agents.isOnline(l.house.id) || !this.github) return "no preview: server offline";
    const token = await this.github.installationToken(l.repo.installationId);
    const d = await this.deployer.deploy({
      room: l.room,
      kind: "preview",
      source: { url: `https://x-access-token:${token}@github.com/${l.repo.fullName}.git`, ref: pr.head!.ref, github: { repoId: l.repo.githubId } },
      requestedBy: l.room.occupantId,
      prNumber: pr.number,
    });
    return `preview ${d.id}`;
  }

  private async closed(p: GhEvent): Promise<string> {
    const pr = p.pull_request!;
    const l = await this.linked(p);
    if (!l) return "repo not in any room";
    const { repo, house, room } = l;
    // The guest leaves when the pull request does, merged or not.
    if (this.agents.isOnline(house.id)) this.agents.send(house.id, { type: "remove_preview", room: room.name });
    if (!pr.merged) return "closed without merging: preview removed";

    const branch = pr.base?.ref;
    if (!branch || branch !== p.repository!.default_branch) return `merged into ${branch ?? "?"}, not the default branch`;
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
    const d = await this.deployer.deploy({
      room,
      kind: "prod",
      source: { url: `https://x-access-token:${token}@github.com/${repo.fullName}.git`, ref: branch, github: { repoId: repo.githubId } },
      requestedBy: room.occupantId,
      prNumber: pr.number,
    });
    if (!approved) {
      await this.houses.note(house.id, { tone: "warning", room: room.name, text: `${ref} was merged without a flatmate's approval. Relaxed house: deploying anyway.` });
    }
    return `deploying ${d.id}`;
  }

  /** Tells the pull request how its deploy or preview went. A preview says it's ready once, not on every push. */
  private async reportOnPr(
    d: { id: string; kind: string; githubRepoId: number | null; prNumber: number | null; status: string; detail: string | null },
    url: string | null,
  ) {
    if (!d.githubRepoId || !d.prNumber) return;
    const [repo] = await this.db.select().from(repos).where(eq(repos.githubId, d.githubRepoId));
    if (!repo) return;
    const reason = (d.detail ?? "unknown error").split("\n")[0];
    let text: string;
    if (d.kind === "preview") {
      if (d.status === "live") {
        const earlier = await this.db
          .select({ id: deployments.id })
          .from(deployments)
          .where(and(eq(deployments.githubRepoId, d.githubRepoId), eq(deployments.prNumber, d.prNumber), eq(deployments.kind, "preview"), eq(deployments.status, "live"), ne(deployments.id, d.id)));
        if (earlier.length) return;
        text = `**Preview** ready at ${url ?? "the room's preview address"}. It follows every push to this pull request and leaves when it closes.`;
      } else {
        text = `**Preview failed:** ${reason}.`;
      }
    } else {
      text = d.status === "live" ? `**Deployed** to ${url ?? "the room"}. Live now.` : `**Deploy failed:** ${reason}. The previous version is still running.`;
    }
    await this.comment(repo, d.prNumber, text);
  }

  private async comment(repo: { installationId: number; fullName: string }, pr: number, text: string) {
    if (!this.github) return;
    await this.github
      .comment(repo.installationId, repo.fullName, pr, `${text}\n\n<sub>[La Coloc](https://coloc.dev) deploys on merge.</sub>`)
      .catch((e) => this.log.warn(e.message));
  }
}
