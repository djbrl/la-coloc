// Chores: every pull request in a flatmate's repo gets a reviewer from the house, picked on a rotation.
// GitHub tells us what happens (webhooks); we pick, comment, request the review, and keep score.
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { chores, type Db, memberships, repos, rooms, users } from "@coloc/db";
import { pickReviewer, type ReviewLoad } from "@coloc/domain";
import { and, eq, isNull, lt } from "drizzle-orm";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import type { GithubAppClient } from "./github.client";

export const GITHUB_CLIENT = Symbol("GITHUB_CLIENT");
export const CHORE_HOURS = 24;
const SWEEP_MS = 10 * 60_000;

interface GhUser {
  id: number;
  login: string;
}
interface GhRepo {
  id: number;
  full_name: string;
}
export interface GhEvent {
  action?: string;
  installation?: { id: number };
  sender?: GhUser;
  repository?: GhRepo;
  repositories?: GhRepo[];
  repositories_added?: GhRepo[];
  pull_request?: { number: number; title: string; html_url: string; draft?: boolean; user: GhUser };
  review?: { state: string; user: GhUser };
}

@Injectable()
export class ChoresService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("chores");
  private sweeper?: NodeJS.Timeout;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    // Null when the GitHub App isn't configured: chores are still recorded, GitHub just isn't told.
    @Inject(GITHUB_CLIENT) private readonly github: GithubAppClient | null,
  ) {}

  onModuleInit() {
    this.sweeper = setInterval(() => this.noteLateChores().catch((e) => this.log.error(e.message)), SWEEP_MS);
    this.sweeper.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  async handle(event: string, p: GhEvent): Promise<string> {
    if ((event === "installation" && p.action === "created") || (event === "installation_repositories" && p.action === "added")) {
      return this.linkRepos(p);
    }
    if (event === "pull_request" && ["opened", "reopened", "ready_for_review"].includes(p.action ?? "")) return this.assign(p);
    if (event === "pull_request_review" && p.action === "submitted") return this.reviewed(p);
    return "ignored";
  }

  /**
   * Installing the App on your repos moves them into your room: whoever installed it must be a coloc user
   * (logged in with that GitHub account) who lives in exactly one room. Anything else is ignored.
   */
  private async linkRepos(p: GhEvent): Promise<string> {
    const list = p.repositories_added ?? p.repositories ?? [];
    if (!p.installation || !p.sender || !list.length) return "nothing to link";
    const [u] = await this.db.select().from(users).where(eq(users.githubId, p.sender.id));
    if (!u) return "installer isn't a coloc user";
    const theirRooms = await this.db.select().from(rooms).where(eq(rooms.occupantId, u.id));
    if (theirRooms.length !== 1) return "installer doesn't live in exactly one room";
    const [room] = theirRooms;
    for (const r of list) {
      await this.db
        .insert(repos)
        .values({ githubId: r.id, fullName: r.full_name, houseId: room.houseId, room: room.name, installationId: p.installation.id })
        .onConflictDoUpdate({ target: repos.githubId, set: { fullName: r.full_name, houseId: room.houseId, room: room.name, installationId: p.installation.id } });
    }
    await this.houses.note(room.houseId, { tone: "info", room: room.name, text: `${u.name ?? u.login} moved ${list.map((r) => r.full_name).join(", ")} into ${room.name}.` });
    return `linked ${list.length}`;
  }

  /** A PR opened in a flatmate's repo: pick the next reviewer, tell them on the PR. */
  private async assign(p: GhEvent): Promise<string> {
    const pr = p.pull_request;
    if (!pr || !p.repository) return "no pull request";
    if (pr.draft) return "draft: wait until it's ready";
    const [repo] = await this.db.select().from(repos).where(eq(repos.githubId, p.repository.id));
    if (!repo) return "repo not in any room";
    const [existing] = await this.db.select().from(chores).where(and(eq(chores.repoId, repo.githubId), eq(chores.prNumber, pr.number)));
    if (existing) return "already assigned";

    const flatmates = await this.db
      .select({ id: users.id, login: users.login, githubId: users.githubId, order: memberships.tontinePosition })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.houseId, repo.houseId))
      .orderBy(memberships.tontinePosition);
    const author = flatmates.find((f) => f.githubId === pr.user.id);

    const open = await this.db.select().from(chores).where(eq(chores.houseId, repo.houseId));
    const load: Record<string, ReviewLoad> = {};
    for (const c of open) {
      const l = (load[c.assigneeId] ??= { open: 0, lastAssignedAt: null });
      if (c.status === "open") l.open += 1;
      l.lastAssignedAt = Math.max(l.lastAssignedAt ?? 0, c.createdAt.getTime());
    }
    const reviewerId = pickReviewer(
      flatmates.map((f) => ({ id: f.id, active: true })),
      author?.id ?? "",
      load,
    );
    if (!reviewerId) return "nobody to review";
    const reviewer = flatmates.find((f) => f.id === reviewerId)!;

    const dueAt = new Date(Date.now() + CHORE_HOURS * 3600_000);
    await this.db.insert(chores).values({
      houseId: repo.houseId,
      repoId: repo.githubId,
      repoFullName: repo.fullName,
      prNumber: pr.number,
      prTitle: pr.title,
      prUrl: pr.html_url,
      authorId: author?.id ?? null,
      assigneeId: reviewer.id,
      dueAt,
    });

    if (this.github) {
      const text = `**Corvée:** @${reviewer.login}, your turn to review this one, within ${CHORE_HOURS} hours. Thanks for keeping the house going.\n\n<sub>Picked by [La Coloc](https://coloc.dev) on the house's review rotation.</sub>`;
      await this.github.comment(repo.installationId, repo.fullName, pr.number, text).catch((e) => this.log.warn(e.message));
      await this.github.requestReview(repo.installationId, repo.fullName, pr.number, reviewer.login);
    }
    this.houses.changes.next(repo.houseId);
    return `assigned ${reviewer.login}`;
  }

  /** Whoever was assigned submitted a review: chore done. Reviews by others are welcome but don't count as the chore. */
  private async reviewed(p: GhEvent): Promise<string> {
    if (!p.pull_request || !p.repository || !p.review) return "no review";
    const [chore] = await this.db
      .select({ chore: chores, assignee: users })
      .from(chores)
      .innerJoin(users, eq(users.id, chores.assigneeId))
      .where(and(eq(chores.repoId, p.repository.id), eq(chores.prNumber, p.pull_request.number)));
    if (!chore) return "no chore for this PR";
    if (chore.chore.status === "done") return "already done";
    if (chore.assignee.githubId !== p.review.user.id) return "not the assignee";
    await this.db
      .update(chores)
      .set({ status: "done", outcome: p.review.state.toLowerCase(), doneAt: new Date() })
      .where(eq(chores.id, chore.chore.id));
    const late = chore.chore.dueAt.getTime() < Date.now();
    await this.houses.note(chore.chore.houseId, {
      tone: "thanks",
      text: `${chore.assignee.name ?? chore.assignee.login} reviewed ${chore.chore.repoFullName}#${chore.chore.prNumber}${late ? " (late, but done)" : ""}. Merci!`,
    });
    return "done";
  }

  /** Reviews past their deadline get one fridge note each. */
  async noteLateChores(now = new Date()): Promise<number> {
    const late = await this.db
      .select({ chore: chores, assignee: users })
      .from(chores)
      .innerJoin(users, eq(users.id, chores.assigneeId))
      .where(and(eq(chores.status, "open"), lt(chores.dueAt, now), isNull(chores.lateNotedAt)));
    for (const { chore, assignee } of late) {
      await this.db.update(chores).set({ lateNotedAt: now }).where(eq(chores.id, chore.id));
      await this.houses.note(chore.houseId, {
        tone: "warning",
        text: `${assignee.name ?? assignee.login} hasn't reviewed ${chore.repoFullName}#${chore.prNumber} yet. It was due ${CHORE_HOURS}h after it opened.`,
      });
    }
    return late.length;
  }
}
