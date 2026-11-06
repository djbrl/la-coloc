// Mutes, as rows: who muted whom, and which group chats. Pure database helpers, so the bell (notifications), the
// chat's unread counts (chat.service.ts) and the safety routes (safety.service.ts) share one set of rules.
//
// A mute is quiet, never hiding: the muted person's words (or the group's) still show where they were said. What
// stops is what would call you over: a line under the bell, an unread count, a red dot.
import { type Db, mutes } from "@coloc/db";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

// A transaction, or the database itself.
type Tx = Pick<Db, "select" | "insert" | "update" | "delete">;

// The group chats that can be muted: a city's room, its arena's, and a house's living room (a newcomer's own one in
// the workshop too). A direct conversation is muted through its person, a post's replies through the bell's own line.
const GROUP_RE = /^(city|arena):[^\s:/]{1,60}$|^house:[a-z0-9-]{1,80}(\/[0-9a-f-]{36})?$/i;
export const isGroupChannel = (channel: string) => GROUP_RE.test(channel);

/** The people `userId` muted. */
export async function mutedPeople(db: Tx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: mutes.mutedId })
    .from(mutes)
    .where(and(eq(mutes.userId, userId), isNotNull(mutes.mutedId)));
  return rows.map((r) => r.id).filter((id): id is string => !!id);
}

/** The group chats `userId` muted, by channel. */
export async function mutedChannels(db: Tx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ channel: mutes.channel })
    .from(mutes)
    .where(and(eq(mutes.userId, userId), isNotNull(mutes.channel)));
  return rows.map((r) => r.channel).filter((c): c is string => !!c);
}

/** Whether `userId` muted this person. */
export async function mutedPerson(db: Tx, userId: string, otherId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mutes.userId })
    .from(mutes)
    .where(and(eq(mutes.userId, userId), eq(mutes.mutedId, otherId)))
    .limit(1);
  return !!row;
}

/** Among `userIds`, the ones who muted `authorId`, or the group chat `channel` (when given). */
export async function whoMuted(db: Tx, userIds: string[], authorId: string, channel?: string | null): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db
    .select({ id: mutes.userId })
    .from(mutes)
    .where(and(inArray(mutes.userId, userIds), or(eq(mutes.mutedId, authorId), channel ? eq(mutes.channel, channel) : undefined)));
  return new Set(rows.map((r) => r.id));
}
