// A person's GitHub repos, wherever they're offered (the quest, a room's Code tab, the knock window): which ones they
// let the App see, and linking one of them to a room through the `repos` table. Asked straight from GitHub, so a lost
// install event doesn't matter.
import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { type Db, githubInstallations, repos, rooms } from "@coloc/db";
import { and, eq } from "drizzle-orm";
import type { User } from "../auth/auth.service";
import { DB } from "../db/db.module";
import { HousesService } from "../houses/houses.service";
import { noteText } from "../houses/lines";
import { projectFrom } from "../rooms/rooms.service";
import { GITHUB_CLIENT, repoList } from "./chores.service";
import type { GhRepoInfo, GithubAppClient } from "./github.client";
import type { GithubAppConfig } from "./github.config";
import { GITHUB_CONFIG } from "./github.controller";

type Room = typeof rooms.$inferSelect;

@Injectable()
export class GithubRepos {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    // Null when the App isn't configured on this server.
    @Inject(GITHUB_CLIENT) private readonly client: GithubAppClient | null,
    @Inject(GITHUB_CONFIG) private readonly config: GithubAppConfig | null,
  ) {}

  private readonly log = new Logger("github-repos");
  // What GitHub last said about each person's repos, so the coach's 2-second poll asks it at most every 5 seconds.
  // Each repo carries the installation that lets the App see it.
  private readonly seen = new Map<string, { at: number; installation: number | null; repos: (GhRepoInfo & { installation: number })[] }>();

  /**
   * The repos they let the App see (its installation on their own account, and those they made on an organisation),
   * the most recently pushed first. `reason` says why the list is empty: GitHub isn't set up here, they didn't log in
   * with GitHub, or nothing is installed yet. `installUrl` is where they give it more.
   */
  async list(user: User) {
    if (!this.client) return { repos: [], reason: "off" as const, installUrl: null };
    if (!user.githubId) return { repos: [], reason: "no-github" as const, installUrl: null };
    const { installation, repos: list } = await this.installed(user);
    const seen = list
      .map((r) => ({ id: r.id, fullName: r.full_name, description: r.description, language: r.language, private: r.private, pushedAt: r.pushed_at }))
      .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
    const installUrl = this.config?.slug ? `https://github.com/apps/${this.config.slug}/installations/new` : null;
    return { repos: seen, reason: installation ? null : ("not-installed" as const), installUrl };
  }

  /**
   * Puts the repo they picked in this room: that one, and only that one. Whoever calls this has already checked that
   * they may manage the room. A repo in another room of theirs (or in a room nobody lives in any more) moves here; one
   * in someone else's room stays where it is. A different repo starts clean: the old one's branch, folder and port
   * mean nothing in it, and a project named after the old repo takes the new one's name.
   */
  async link(user: User, room: Room, githubId: number) {
    if (!this.client || !user.githubId) throw new ConflictException({ message: "Log in with GitHub to bring your own project.", code: "githubLoginNeeded" });
    const { repos: list } = await this.installed(user, true);
    const repo = list.find((r) => r.id === githubId);
    if (!repo) throw new NotFoundException({ message: "La Coloc can't see that repo. Allow it on GitHub first.", code: "repoNotVisible" });
    const [elsewhere] = await this.db.select().from(repos).where(eq(repos.githubId, githubId));
    const here = !!elsewhere && elsewhere.houseId === room.houseId && elsewhere.room === room.name;
    if (elsewhere && !here && !(await this.isTheirsToMove(elsewhere, user.id))) {
      throw new ConflictException({ message: `${repo.full_name} already lives in another room.`, code: "repoTaken", repo: repo.full_name });
    }
    const [before] = await this.db.select().from(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name)));
    await this.db.transaction(async (tx) => {
      await tx.delete(repos).where(eq(repos.githubId, githubId));
      await tx.delete(repos).where(and(eq(repos.houseId, room.houseId), eq(repos.room, room.name)));
      await tx.insert(repos).values({ githubId, fullName: repo.full_name, houseId: room.houseId, room: room.name, installationId: repo.installation });
      if (!here) {
        const oldName = before ? projectFrom(before.fullName) : room.source ? projectFrom(room.source) : null;
        const named = room.project && room.project !== oldName;
        await tx
          .update(rooms)
          .set({ branch: null, port: null, buildPath: ".", project: named ? room.project : projectFrom(repo.full_name) })
          .where(eq(rooms.id, room.id));
      }
    });
    await this.houses.note(room.houseId, { tone: "info", room: room.name, text: noteText("reposMoved", { name: user.name ?? user.login, repos: repoList([repo]) }) });
    return { repo: repo.full_name };
  }

  // The room it's in now is theirs, or nobody's.
  private async isTheirsToMove(link: typeof repos.$inferSelect, userId: string): Promise<boolean> {
    const [room] = await this.db.select({ occupantId: rooms.occupantId }).from(rooms).where(and(eq(rooms.houseId, link.houseId), eq(rooms.name, link.room)));
    return !room?.occupantId || room.occupantId === userId;
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
      // Asked by login (GitHub has no lookup by id), then checked against their id: a login someone gave up and a
      // stranger took must not show them the stranger's repos.
      const own = await this.client!.userInstallation(user.login, user.githubId ?? undefined);
      const made = user.githubId
        ? await this.db.select({ id: githubInstallations.id }).from(githubInstallations).where(eq(githubInstallations.installerGithubId, user.githubId))
        : [];
      const ids = [...new Set([...(own ? [own] : []), ...made.map((m) => m.id)])];
      // An organisation's install that's gone (its removal missed) is skipped; their own account's must answer.
      const reposOf = async (id: number) => (await this.client!.installationRepos(id)).map((r) => ({ ...r, installation: id }));
      const lists = await Promise.all(ids.map((id) => (id === own ? reposOf(id) : reposOf(id).catch(() => []))));
      // A repo seen through two installations is listed once.
      const found = [...new Map(lists.flat().map((r) => [r.id, r])).values()];
      const got = { at: Date.now(), installation: ids[0] ?? null, repos: found };
      this.seen.set(user.id, got);
      return got;
    } catch (e) {
      this.log.warn(`couldn't ask GitHub about ${user.login}'s repos: ${(e as Error).message}`);
      throw new ServiceUnavailableException({ message: "GitHub isn't answering. Try again in a minute.", code: "githubDown" });
    }
  }
}
