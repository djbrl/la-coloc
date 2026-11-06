// Chores: every pull request in a flatmate's repo gets a reviewer from the house, picked on a rotation.
// GitHub tells us what happens (webhooks); we pick, comment, request the review, and keep score.
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { chores, type Db, githubInstallations, houses, memberships, repos, rooms, users } from "@coloc/db";
import { pickReviewer, type ReviewLoad } from "@coloc/domain";
import { and, eq, isNull, lt } from "drizzle-orm";
import { isCoreDown } from "../core/core";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { noteText } from "../houses/lines";
import { REVIEW_CREDIT_FCFA } from "../houses/money";
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
  default_branch?: string;
  private?: boolean;
}

/**
 * The repos to name in a house's news, which every flatmate reads (the workshop's are every newcomer): public ones by
 * name, private ones only counted ("+2"), so a private repo's name never leaves its owner's room.
 */
export function repoList(list: Array<{ full_name: string; private?: boolean }>): string {
  const named = list.filter((r) => r.private === false).map((r) => r.full_name);
  const hidden = list.length - named.length;
  return [...named, ...(hidden ? [`+${hidden}`] : [])].join(", ");
}
export interface GhEvent {
  action?: string;
  installation?: { id: number; account?: { login: string } };
  sender?: GhUser;
  repository?: GhRepo;
  repositories?: GhRepo[];
  repositories_added?: GhRepo[];
  pull_request?: {
    number: number;
    title: string;
    html_url: string;
    draft?: boolean;
    user: GhUser;
    merged?: boolean;
    base?: { ref: string };
    // Where the changes come from. A different repo id than `repository` means a fork.
    head?: { ref: string; sha?: string; repo?: { id: number } | null };
    // What the Arena reads too (arena/scoring.ts checks them again).
    state?: string;
    created_at?: string;
    merged_at?: string | null;
    labels?: { name: string }[];
  };
  review?: { state: string; user: GhUser };
  // issue_comment: a comment on an issue or a pull request (`pull_request` is set on the issue for the latter).
  issue?: { number: number; pull_request?: unknown; labels?: { name: string }[] };
  comment?: { body: string; user: GhUser };
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
    // Every ten minutes. A failed check is logged and the next one tries again; it never takes the API down.
    this.sweeper = setInterval(
      () =>
        this.noteLateChores().catch((e) =>
          isCoreDown(e) ? this.log.warn("late-chores check skipped: the database isn't answering. Next try in 10 minutes") : this.log.error(e.message),
        ),
      SWEEP_MS,
    );
    this.sweeper.unref();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  async handle(event: string, p: GhEvent): Promise<string> {
    if ((event === "installation" && p.action === "created") || (event === "installation_repositories" && p.action === "added")) {
      await this.rememberInstaller(p);
      return this.linkRepos(p);
    }
    if (event === "installation" && p.action === "deleted" && p.installation) {
      await this.db.delete(githubInstallations).where(eq(githubInstallations.id, p.installation.id));
      return "forgot the installation";
    }
    if (event === "pull_request" && ["opened", "reopened", "ready_for_review"].includes(p.action ?? "")) return this.assign(p);
    if (event === "pull_request_review" && p.action === "submitted") return this.reviewed(p);
    return "ignored";
  }

  /**
   * Installing the App on your repos moves them into your room: whoever installed it must be a coloc user
   * (logged in with that GitHub account) who lives in exactly one room. Anything else is ignored.
   *
   * One exception, for the tutorial: someone who is still taking it has a room in the workshop. If they also live
   * in a real house they have two rooms, and the rule above would never link anything, so the tutorial would wait
   * for ever. While the tutorial isn't finished, the first repo goes to the workshop room (if it has no repo yet).
   */
  private async linkRepos(p: GhEvent): Promise<string> {
    const list = p.repositories_added ?? p.repositories ?? [];
    if (!p.installation || !p.sender || !list.length) return "nothing to link";
    const [u] = await this.db.select().from(users).where(eq(users.githubId, p.sender.id));
    if (!u) return "installer isn't a coloc user";
    const theirRooms = await this.db.select().from(rooms).where(eq(rooms.occupantId, u.id));
    // A workshop room holds one repo, the one picked in the tutorial: it never takes "every repo you installed".
    const workshops = await this.db.select({ id: houses.id }).from(houses).where(eq(houses.tutorial, true));
    const single = theirRooms.length === 1 ? theirRooms[0] : undefined;
    const onlyRoom = single && !workshops.some((h) => h.id === single.houseId) ? single : undefined;
    const tutorialRoom = await this.freeTutorialRoom(u, theirRooms);
    if (!onlyRoom && !tutorialRoom) return "installer doesn't live in exactly one room";

    // Each repo goes to a room: the first to the tutorial room if it is free, the others by the usual rule.
    const moved = new Map<typeof rooms.$inferSelect, GhRepo[]>();
    for (const [i, r] of list.entries()) {
      const room = i === 0 && tutorialRoom ? tutorialRoom : onlyRoom;
      if (!room) continue;
      await this.db
        .insert(repos)
        .values({ githubId: r.id, fullName: r.full_name, houseId: room.houseId, room: room.name, installationId: p.installation.id })
        .onConflictDoUpdate({ target: repos.githubId, set: { fullName: r.full_name, houseId: room.houseId, room: room.name, installationId: p.installation.id } });
      moved.set(room, [...(moved.get(room) ?? []), r]);
    }
    for (const [room, list] of moved) {
      await this.houses.note(room.houseId, { tone: "info", room: room.name, text: noteText("reposMoved", { name: u.name ?? u.login, repos: repoList(list) }) });
    }
    return `linked ${[...moved.values()].flat().length}`;
  }

  /**
   * Who installed the App where (or last added repos to it), for the tutorial's repo picker: an install on an
   * organisation is listed there only to the person who made it.
   */
  private async rememberInstaller(p: GhEvent) {
    const account = p.installation?.account?.login;
    if (!p.installation || !p.sender || !account) return;
    await this.db
      .insert(githubInstallations)
      .values({ id: p.installation.id, account, installerGithubId: p.sender.id })
      .onConflictDoUpdate({ target: githubInstallations.id, set: { account, installerGithubId: p.sender.id } });
  }

  /** The workshop room of someone mid-tutorial, if it has no repo yet. Otherwise undefined. */
  private async freeTutorialRoom(u: typeof users.$inferSelect, theirRooms: (typeof rooms.$inferSelect)[]) {
    if (u.tutorialDoneAt) return undefined;
    const workshops = await this.db.select({ id: houses.id }).from(houses).where(eq(houses.tutorial, true));
    const room = theirRooms.find((r) => workshops.some((h) => h.id === r.houseId));
    if (!room) return undefined;
    const [taken] = await this.db.select().from(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name)));
    return taken ? undefined : room;
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
      // Someone on their way out, with no room left, gets no new reviews.
      .where(and(eq(memberships.houseId, repo.houseId), isNull(memberships.leavingMonth)))
      .orderBy(memberships.tontinePosition);
    const author = flatmates.find((f) => f.githubId === pr.user.id);
    // The workshop's example learners (people living in a `demo` room) are scenery: they never review anything.
    const examples = new Set(
      (await this.db.select({ id: rooms.occupantId }).from(rooms).where(and(eq(rooms.houseId, repo.houseId), eq(rooms.demo, true)))).map((r) => r.id),
    );

    const open = await this.db.select().from(chores).where(eq(chores.houseId, repo.houseId));
    const load: Record<string, ReviewLoad> = {};
    for (const c of open) {
      const l = (load[c.assigneeId] ??= { open: 0, lastAssignedAt: null });
      if (c.status === "open") l.open += 1;
      l.lastAssignedAt = Math.max(l.lastAssignedAt ?? 0, c.createdAt.getTime());
    }
    // Nobody reviews their own project: not the room's occupant, nor anyone teamed up on it.
    const sameProject = await this.houses.projectPeople(repo.houseId, repo.room);
    const reviewerId = pickReviewer(
      flatmates.filter((f) => !examples.has(f.id)).map((f) => ({ id: f.id, active: true })),
      author?.id ?? "",
      load,
      sameProject,
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
      // Only @-mention people whose GitHub account we know. A coloc login without one (a demo flatmate, a dev
      // login) may share its name with a stranger on GitHub, who must never be pinged.
      const onGithub = reviewer.githubId !== null;
      const who = onGithub ? `@${reviewer.login}` : `${reviewer.login} (no GitHub account linked)`;
      const text = `**Corvée:** ${who}, your turn to review this one, within ${CHORE_HOURS} hours. Thanks for keeping the house going.\n\n<sub>Picked by [La Coloc](https://coloc.dev) on the house's review rotation.</sub>`;
      await this.github.comment(repo.installationId, repo.fullName, pr.number, text).catch((e) => this.log.warn(e.message));
      if (onGithub) await this.github.requestReview(repo.installationId, repo.fullName, pr.number, reviewer.login);
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
    if (chore.assignee.githubId !== p.review.user.id) return "not the assignee";
    if (chore.chore.status === "done") {
      // The chore was already done (say, "changes requested"); the reviewer's latest word is what counts for
      // deploying, e.g. an approval once the changes are in.
      await this.db.update(chores).set({ outcome: p.review.state.toLowerCase() }).where(eq(chores.id, chore.chore.id));
      return `outcome now ${p.review.state.toLowerCase()}`;
    }
    await this.db
      .update(chores)
      .set({ status: "done", outcome: p.review.state.toLowerCase(), doneAt: new Date() })
      .where(eq(chores.id, chore.chore.id));
    await this.houses.credit.earn(chore.assignee.id, REVIEW_CREDIT_FCFA, "review", `review:${chore.chore.id}`);
    const late = chore.chore.dueAt.getTime() < Date.now();
    await this.houses.note(chore.chore.houseId, {
      tone: "thanks",
      text: noteText(late ? "reviewedLate" : "reviewed", { name: chore.assignee.name ?? chore.assignee.login, ref: `${chore.chore.repoFullName}#${chore.chore.prNumber}` }),
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
        text: noteText("reviewLate", { name: assignee.name ?? assignee.login, ref: `${chore.repoFullName}#${chore.prNumber}`, hours: String(CHORE_HOURS) }),
      });
    }
    return late.length;
  }
}
