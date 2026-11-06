// Moving someone into a free room: the one way in, shared by the doorbell (the house voted yes) and invitations
// (a flatmate offered the room and they said yes). Keeping it in one place keeps the rules the same both ways: the
// room must still be free (two people can't both move in), the newcomer joins the back of the tontine line, and the
// room starts clean (no ad, no project, nothing online). Someone who already lives in the
// house and takes another room keeps their membership: their role and their place in the line.
import { type Db, leaseEnds, memberships, rooms } from "@coloc/db";
import { and, count, eq, isNull, max, ne } from "drizzle-orm";
import { WORKSHOP_ID } from "./money";

// A transaction or the database itself: both can run these statements.
type Runner = Pick<Db, "select" | "update" | "insert" | "delete">;

/** Puts `userId` in the free room `room` of `houseId`, as a flatmate. False when the room is no longer free. */
export async function moveInto(tx: Runner, houseId: string, room: string, userId: string): Promise<boolean> {
  // Only if the room is still free: the update matches nothing otherwise.
  const taken = await tx
    .update(rooms)
    .set({ occupantId: userId, ad: null, project: null, projectDescription: null, status: "empty", url: null })
    .where(and(eq(rooms.houseId, houseId), eq(rooms.name, room), isNull(rooms.occupantId), eq(rooms.demo, false)))
    .returning({ id: rooms.id });
  if (!taken.length) return false;
  const [{ last }] = await tx.select({ last: max(memberships.tontinePosition) }).from(memberships).where(eq(memberships.houseId, houseId));
  // Newcomers join the back of the tontine line. Someone who was on their way out is staying after all.
  await tx
    .insert(memberships)
    .values({ houseId, userId, role: "flatmate", tontinePosition: (last ?? -1) + 1 })
    .onConflictDoUpdate({ target: [memberships.houseId, memberships.userId], set: { leavingMonth: null } });
  // Back in a room they left this month: it's simply theirs again, on the bill like before.
  await tx.delete(leaseEnds).where(and(eq(leaseEnds.houseId, houseId), eq(leaseEnds.room, room), eq(leaseEnds.userId, userId)));
  return true;
}

/** How many rooms someone rents across the city, for MAX_ROOMS_PER_PERSON. The workshop doesn't count. */
export async function roomsRented(tx: Pick<Db, "select">, userId: string): Promise<number> {
  const [{ n }] = await tx.select({ n: count() }).from(rooms).where(and(eq(rooms.occupantId, userId), ne(rooms.houseId, WORKSHOP_ID)));
  return n;
}
