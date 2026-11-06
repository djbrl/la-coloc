// Friendships, as rows: who is friends with whom. The asking and answering is a notification like any invitation
// (friend_request, in notifications.service.ts); the list with everyone's status is friends/friends.service.ts.
// Pure database helpers, so the bell, the friends list and blocking (chat.service.ts) share one set of rules.
import { type Db, friendships, notifications } from "@coloc/db";
import { and, eq, or } from "drizzle-orm";

// A transaction, or the database itself.
type Tx = Pick<Db, "select" | "insert" | "update" | "delete">;

// The pair as stored: the smaller id first, like a direct channel's name, so A-B and B-A are one row.
const sorted = (a: string, b: string) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a });
const thePair = (a: string, b: string) => {
  const p = sorted(a, b);
  return and(eq(friendships.userA, p.userA), eq(friendships.userB, p.userB));
};

export async function areFriends(db: Tx, a: string, b: string): Promise<boolean> {
  const [row] = await db.select({ a: friendships.userA }).from(friendships).where(thePair(a, b)).limit(1);
  return !!row;
}

/** Makes two people friends. Twice is fine: still one row. */
export async function befriend(db: Tx, a: string, b: string) {
  await db.insert(friendships).values(sorted(a, b)).onConflictDoNothing();
}

/** The ids of `userId`'s friends. */
export async function friendIds(db: Tx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ a: friendships.userA, b: friendships.userB })
    .from(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));
  return rows.map((r) => (r.a === userId ? r.b : r.a));
}

/**
 * Ends what's between two people: the friendship, and any friend request still waiting either way (it lapses, so it
 * can't be accepted later). True when they were friends. Removing a friend and blocking someone both come here.
 */
export async function unfriend(db: Tx, a: string, b: string): Promise<boolean> {
  const gone = await db.delete(friendships).where(thePair(a, b)).returning({ a: friendships.userA });
  await db
    .update(notifications)
    .set({ state: "expired", decidedAt: new Date() })
    .where(
      and(
        eq(notifications.kind, "friend_request"),
        eq(notifications.state, "open"),
        or(and(eq(notifications.fromId, a), eq(notifications.userId, b)), and(eq(notifications.fromId, b), eq(notifications.userId, a))),
      ),
    );
  return gone.length > 0;
}
