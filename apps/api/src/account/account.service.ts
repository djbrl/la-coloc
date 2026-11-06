// Leaving La Coloc: deleting your account, or only removing the GitHub App from your repos (both from Settings).
//
// Deleting an account goes in this order, so nothing points at the person by the time their row goes:
//   1. Their rooms are emptied, as when a lease ends (clearRoom), and the caretaker removes the containers. A workshop
//      room, made for them alone, goes completely, as when the tutorial is taken again.
//   2. Each house they belong to lets them go now, as at the end of a month (LeasesService.settleHouse): if they were
//      chef, the first in the tontine line takes over; a house with nobody left closes.
//   3. GitHub is told: the App is uninstalled from their own account, and our links to its repos go. Installations on
//      organisations aren't theirs to remove: only our record of them goes. (The login authorization is revoked by a
//      last trip through GitHub, auth.service.ts `startForget`, since we never keep a person's token.)
//   4. Their data. Most tables cascade from `users`; the rest is done by hand here: chat channels named after them or
//      their knocks and posts, and the few columns that keep a house's history (deployments, reviews), set to null.
// If GitHub doesn't answer, the account is deleted all the same, and the caller tells them what to remove themselves.
import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import {
  applications,
  boardPosts,
  chatReads,
  chores,
  type Db,
  deployments,
  fridgeNotes,
  githubInstallations,
  houses,
  memberships,
  messages,
  repos,
  rooms,
  usageSamples,
  users,
} from "@coloc/db";
import { and, eq, inArray, like, or, type SQL, sql } from "drizzle-orm";
import type { User } from "../auth/auth.service";
import { DB } from "../db/db.module";
import { applicationChannel } from "../doorbell/queries";
import { GITHUB_CLIENT } from "../github/chores.service";
import type { GithubAppClient } from "../github/github.client";
import { unlinkRepos } from "../github/unlink";
import { HousesService } from "../houses/houses.service";
import { clearRoom, LeasesService } from "../houses/leases.service";
import { noteText } from "../houses/lines";

const GITHUB_TIMEOUT_MS = 8000;

/** What GitHub was told when an account was deleted. */
export interface GithubForgotten {
  // The App's installations on their own account: removed, or not (GitHub refused, or didn't answer).
  removed: number[];
  failed: number[];
  // Organisations they installed it on: not theirs to remove. Our record of them is gone.
  orgs: string[];
  // GitHub couldn't be reached at all.
  down: boolean;
}

// The two calls this needs, so tests can pass a fake.
export type AppClient = Pick<GithubAppClient, "userInstallation" | "deleteInstallation">;

@Injectable()
export class AccountService {
  private readonly log = new Logger("account");

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly houses: HousesService,
    private readonly leases: LeasesService,
    // Null when the GitHub App isn't configured on this server.
    @Inject(GITHUB_CLIENT) private readonly github: AppClient | null,
  ) {}

  /** Deletes the account and everything of theirs. Never fails because of GitHub: `github` says what GitHub was told. */
  async deleteAccount(user: User): Promise<{ github: GithubForgotten }> {
    await this.emptyRooms(user.id);
    await this.leaveHouses(user.id);
    const github = await this.forgetOnGithub(user);
    await this.deleteData(user.id);
    return { github };
  }

  /**
   * Uninstalls the App from their own account and drops our links to its repos, and to any repo in their rooms. Their
   * rooms keep running their last build, but stop updating on merge. Logging in still works: that's the App's
   * authorization, not its installation. `orgs`: organisations they installed it on, which they remove there.
   */
  async removeApp(user: User): Promise<{ unlinked: number; orgs: string[] }> {
    const own = await this.ownInstallations(user);
    if (own.down) throw githubDown();
    const { removed, failed } = await this.uninstall(own.ids);
    const orgs = await this.orgInstallations(user);
    const theirRooms = await this.db.select({ houseId: rooms.houseId, name: rooms.name }).from(rooms).where(eq(rooms.occupantId, user.id));
    const unlinked = await this.db.transaction(async (tx) => {
      // If GitHub refused one, only what's really uninstalled is unlinked: they can try again for the rest.
      const where = anyOf([
        removed.length ? inArray(repos.installationId, removed) : undefined,
        ...(failed.length ? [] : theirRooms.map((r) => and(eq(repos.houseId, r.houseId), eq(repos.room, r.name)))),
      ]);
      const gone = await unlinkRepos(tx, where);
      const records = user.githubId
        ? anyOf([removed.length ? inArray(githubInstallations.id, removed) : undefined, failed.length ? undefined : eq(githubInstallations.installerGithubId, user.githubId)])
        : undefined;
      // Never without a condition: that would forget everyone's installations.
      if (records) await tx.delete(githubInstallations).where(records);
      return gone;
    });
    for (const houseId of new Set(unlinked.map((r) => r.houseId))) this.houses.changes.next(houseId);
    if (failed.length) throw githubDown();
    return { unlinked: unlinked.length, orgs };
  }

  // ---- 1. Rooms ----

  private async emptyRooms(userId: string) {
    const theirs = await this.db
      .select({ room: rooms, tutorial: houses.tutorial })
      .from(rooms)
      .innerJoin(houses, eq(houses.id, rooms.houseId))
      .where(eq(rooms.occupantId, userId));
    for (const { room, tutorial } of theirs) {
      if (tutorial) {
        // Their workshop room was made for them: it goes, with everything filed under it (tutorial.service.ts `reset`).
        await this.leases.removeContainers(room.houseId, room.name);
        await this.db.transaction(async (tx) => {
          await clearRoom(tx, room);
          await tx.delete(usageSamples).where(and(eq(usageSamples.houseId, room.houseId), eq(usageSamples.room, room.name)));
          await tx.delete(fridgeNotes).where(and(eq(fridgeNotes.houseId, room.houseId), eq(fridgeNotes.room, room.name)));
          await tx.delete(rooms).where(eq(rooms.id, room.id));
        });
        continue;
      }
      await this.db.transaction((tx) => clearRoom(tx, room));
      await this.leases.removeContainers(room.houseId, room.name);
      // No name: nothing of theirs stays, not even in the house's news.
      await this.houses.note(room.houseId, { tone: "info", room: room.name, text: noteText("flatmateLeft") });
    }
  }

  // ---- 2. Houses ----

  private async leaveHouses(userId: string) {
    const homes = await this.db.select({ id: memberships.houseId }).from(memberships).where(eq(memberships.userId, userId));
    const chefOf = await this.db.select({ id: houses.id }).from(houses).where(eq(houses.chefId, userId));
    for (const houseId of new Set([...homes, ...chefOf].map((h) => h.id))) await this.leases.settleHouse(houseId, [userId]);
  }

  // ---- 3. GitHub ----

  private async forgetOnGithub(user: User): Promise<GithubForgotten> {
    const own = await this.ownInstallations(user);
    const { removed, failed } = await this.uninstall(own.ids);
    const orgs = await this.orgInstallations(user);
    await this.db.transaction(async (tx) => {
      // Their repos go wherever they're linked, uninstalled or not: they asked to be forgotten.
      await unlinkRepos(tx, own.ids.length ? inArray(repos.installationId, own.ids) : undefined);
      if (user.githubId) {
        const records = or(eq(githubInstallations.installerGithubId, user.githubId), ...(own.ids.length ? [inArray(githubInstallations.id, own.ids)] : []));
        await tx.delete(githubInstallations).where(records);
      }
    });
    if (own.down || failed.length) {
      // Only ids: nothing about who they were.
      this.log.warn(`deleted an account; GitHub ${own.down ? "didn't answer" : "refused"}: installations not removed: ${failed.join(", ") || "unknown"}`);
    }
    return { removed, failed, orgs, down: own.down || failed.length > 0 };
  }

  /**
   * The App's installations on their own account: the one GitHub knows today, and any we recorded there (installed by
   * them, on an account with their login). `down`: GitHub couldn't say.
   */
  private async ownInstallations(user: User): Promise<{ ids: number[]; down: boolean }> {
    if (!user.githubId) return { ids: [], down: false };
    const recorded = await this.db
      .select({ id: githubInstallations.id })
      .from(githubInstallations)
      .where(and(eq(githubInstallations.installerGithubId, user.githubId), sql`lower(${githubInstallations.account}) = lower(${user.login})`));
    const ids = recorded.map((r) => r.id);
    let down = false;
    if (this.github) {
      try {
        const live = await this.github.userInstallation(user.login, user.githubId, GITHUB_TIMEOUT_MS);
        if (live) ids.push(live);
      } catch (e) {
        down = true;
        this.log.warn(`couldn't ask GitHub for an installation: ${(e as Error).message}`);
      }
    }
    return { ids: [...new Set(ids)], down };
  }

  // The organisations they installed the App on. Only their owners remove it there.
  private async orgInstallations(user: User): Promise<string[]> {
    if (!user.githubId) return [];
    const rows = await this.db
      .select({ account: githubInstallations.account })
      .from(githubInstallations)
      .where(and(eq(githubInstallations.installerGithubId, user.githubId), sql`lower(${githubInstallations.account}) <> lower(${user.login})`));
    return [...new Set(rows.map((r) => r.account))];
  }

  private async uninstall(ids: number[]): Promise<{ removed: number[]; failed: number[] }> {
    const removed: number[] = [];
    const failed: number[] = [];
    for (const id of ids) {
      if (!this.github) {
        failed.push(id);
        continue;
      }
      try {
        await this.github.deleteInstallation(id, GITHUB_TIMEOUT_MS);
        removed.push(id);
      } catch (e) {
        failed.push(id);
        this.log.warn(`couldn't remove installation ${id}: ${(e as Error).message}`);
      }
    }
    return { removed, failed };
  }

  // ---- 4. Their data ----

  private async deleteData(userId: string) {
    await this.db.transaction(async (tx) => {
      // Chat channels aren't tied to anyone in the schema, so the ones about them go by hand: their direct
      // conversations (both sides: the channel is named after them), their knocks' threads, the replies under their
      // board posts. Their own messages anywhere else go with them (messages.author_id cascades).
      const knocks = await tx.select({ id: applications.id }).from(applications).where(eq(applications.applicantId, userId));
      const posts = await tx.select({ id: boardPosts.id }).from(boardPosts).where(eq(boardPosts.authorId, userId));
      const named = [...knocks.map((k) => applicationChannel(k.id)), ...posts.map((p) => `post:${p.id}`)];
      const dm = (column: typeof messages.channel | typeof chatReads.channel) => [like(column, `dm:${userId}:%`), like(column, `dm:%:${userId}`)];
      await tx.delete(messages).where(anyOf([...dm(messages.channel), named.length ? inArray(messages.channel, named) : undefined]));
      await tx.delete(chatReads).where(anyOf([...dm(chatReads.channel), named.length ? inArray(chatReads.channel, named) : undefined]));

      // A house's history stays, without them: reviews of their pull requests, and builds they started.
      await tx.update(chores).set({ authorId: null }).where(eq(chores.authorId, userId));
      // Reviews they were asked for can't be anyone else's (the column can't be empty), so those go.
      await tx.delete(chores).where(eq(chores.assigneeId, userId));
      await tx.update(deployments).set({ requestedBy: null }).where(eq(deployments.requestedBy, userId));
      // Steps 1 and 2 left nothing here; these only make sure (an example room, a chef with no membership).
      await tx.update(rooms).set({ occupantId: null }).where(eq(rooms.occupantId, userId));
      await tx.update(houses).set({ chefId: null }).where(eq(houses.chefId, userId));

      // Everything else goes with the row (ON DELETE CASCADE): sessions, SSH keys, credit history, notifications to
      // and from them, memberships, teams, knocks and votes, chat guest requests, bills paid, lease ends, messages,
      // read marks, board posts, blocks both ways, reports they filed, Arena entries, pull requests and titles.
      // Reports about something they wrote keep the copy of the words for the admins, with no author (SET NULL).
      await tx.delete(users).where(eq(users.id, userId));
    });
  }
}

// Any of these conditions; undefined (matches nothing to delete) when there are none.
function anyOf(conditions: (SQL | undefined)[]): SQL | undefined {
  const real = conditions.filter((c): c is SQL => !!c);
  return real.length ? or(...real) : undefined;
}

const githubDown = () => new ServiceUnavailableException({ message: "GitHub isn't answering. Try again in a minute.", code: "githubDown" });
