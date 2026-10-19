// Teaming up: flatmates of one house working on one room's project. The room's occupant stays its occupant (and pays
// its share of the bill); a teammate may update, restart, redeploy and set up the room like them (see
// rooms.service.ts `manageable`), and keeps their own room. Nobody from another house: those get "invite to my house".
//
// How a team forms is an invitation under the bell (notifications.service.ts): the occupant asks a flatmate to join
// (team_invite), or a flatmate asks the occupant to let them join (team_ask). Here are the few statements both ways
// share, so the rules stay in one place.
import { type Db, roomTeammates, rooms } from "@coloc/db";
import { and, count, eq } from "drizzle-orm";

// At most this many teammates on one room, the occupant not counted: a room's limits are made for one project, and
// a handful of people at most.
export const TEAM_MAX = 3;

// A transaction or the database itself: both can run these statements.
type Runner = Pick<Db, "select" | "insert">;

/** How many teammates a room has (its occupant not counted). */
export async function teamSize(runner: Pick<Db, "select">, roomId: string): Promise<number> {
  const [{ n }] = await runner.select({ n: count() }).from(roomTeammates).where(eq(roomTeammates.roomId, roomId));
  return n;
}

/** Whether `userId` is already on the room's team. */
export async function onTeam(runner: Pick<Db, "select">, roomId: string, userId: string): Promise<boolean> {
  const [row] = await runner
    .select({ userId: roomTeammates.userId })
    .from(roomTeammates)
    .where(and(eq(roomTeammates.roomId, roomId), eq(roomTeammates.userId, userId)));
  return !!row;
}

/**
 * Puts `userId` on the room's team, inside a transaction. The room's row is locked first, so two answers at once
 * (two invitations accepted together) take turns, and the second one sees the first one's teammate when it counts.
 */
export async function joinTeam(tx: Runner, roomId: string, userId: string): Promise<"joined" | "already" | "full"> {
  await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).for("update");
  if (await onTeam(tx, roomId, userId)) return "already";
  if ((await teamSize(tx, roomId)) >= TEAM_MAX) return "full";
  await tx.insert(roomTeammates).values({ roomId, userId });
  return "joined";
}
