// The friends list: your friends with how present each one is right now (online, idle, away, offline) and the city
// they walk in, the friend requests waiting for your answer, and the ones you sent. Asking and answering is the bell's
// (askFriend, accept and decline in notifications.service.ts); the friendships themselves are rows (friends.ts).
//
// Statuses live in the lobby's memory (presence.ts), never in the database. When someone's changes, each of their
// friends with a tab open gets a one-word "friends" on the lobby's live line, and their page fetches the list again.
import { Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type Db, notifications, users } from "@coloc/db";
import { and, desc, eq, gte, inArray, or } from "drizzle-orm";
import type { Subscription } from "rxjs";
import { DB } from "../db/db.module";
import { person } from "../doorbell/queries";
import type { PersonView } from "../houses/house.types";
import type { Status } from "../lobby/presence";
import { LobbyGateway } from "../lobby/lobby.gateway";
import { friendIds, unfriend } from "../notifications/friends";
import { INVITE_DAYS } from "../notifications/notifications.service";

const DAY_MS = 24 * 3600 * 1000;

/** One friend, as your list shows them. Mirrored in apps/web/src/types.ts. */
export interface FriendView extends PersonView {
  status: Status;
  // The city they walk in, while they're connected and in one.
  city: string | null;
}

export interface FriendsView {
  friends: FriendView[];
  // Waiting for your answer (through the bell's accept and decline), the newest first.
  requests: { id: string; from: PersonView; createdAt: string }[];
  // Yours, still waiting: the person card says "Asked", and you can take one back.
  sent: { id: string; to: PersonView }[];
}

@Injectable()
export class FriendsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("friends");
  private sub?: Subscription;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly lobby: LobbyGateway,
  ) {}

  onModuleInit() {
    this.sub = this.lobby.statusChanges.subscribe((logins) => {
      this.tellFriendsOf(logins).catch((e: Error) => this.log.warn(e.message));
    });
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }

  async list(userId: string): Promise<FriendsView> {
    const ids = await friendIds(this.db, userId);
    const rows = ids.length ? await this.db.select().from(users).where(inArray(users.id, ids)) : [];
    const presence = this.lobby.presence;
    const friends = rows.map((u) => {
      const status = presence.statusOf(u.login);
      return { ...person(u), status, city: status === "offline" ? null : presence.cityOf(u.login) };
    });

    // Open requests either way, younger than an invitation's week (older ones lapse when the bell is read).
    const fresh = gte(notifications.createdAt, new Date(Date.now() - INVITE_DAYS * DAY_MS));
    const open = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.kind, "friend_request"), eq(notifications.state, "open"), fresh, or(eq(notifications.userId, userId), eq(notifications.fromId, userId))))
      .orderBy(desc(notifications.createdAt));
    const others = [...new Set(open.map((n) => (n.userId === userId ? n.fromId : n.userId)).filter((x): x is string => !!x))];
    const people = new Map((others.length ? await this.db.select().from(users).where(inArray(users.id, others)) : []).map((u) => [u.id, person(u)]));
    return {
      friends,
      requests: open.filter((n) => n.userId === userId && n.fromId && people.has(n.fromId)).map((n) => ({ id: n.id, from: people.get(n.fromId!)!, createdAt: n.createdAt.toISOString() })),
      sent: open.filter((n) => n.fromId === userId && people.has(n.userId)).map((n) => ({ id: n.id, to: people.get(n.userId)! })),
    };
  }

  /** Ends a friendship, from either side. The other person's list updates if they're online; they aren't told more. */
  async remove(userId: string, login: string) {
    const [other] = await this.db.select().from(users).where(eq(users.login, login));
    if (!other || !(await unfriend(this.db, userId, other.id))) throw new NotFoundException({ message: "They aren't on your friends list.", code: "notFriends" });
    this.lobby.notice(other.login, "friends");
  }

  // Someone's status or city changed: every friend of theirs with a tab open fetches their list again.
  private async tellFriendsOf(logins: string[]) {
    const online = new Set(this.lobby.presence.online());
    // Nobody else is here to tell: no need to ask the database.
    if (![...online].some((l) => !logins.includes(l))) return;
    const changed = await this.db.select({ id: users.id }).from(users).where(inArray(users.login, logins));
    const ids = new Set<string>();
    for (const c of changed) for (const id of await friendIds(this.db, c.id)) ids.add(id);
    if (!ids.size) return;
    const friends = await this.db.select({ login: users.login }).from(users).where(inArray(users.id, [...ids]));
    for (const f of friends) if (online.has(f.login)) this.lobby.notice(f.login, "friends");
  }
}
