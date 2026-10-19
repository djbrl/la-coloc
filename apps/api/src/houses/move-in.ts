// Moving someone into a free room: the one way in, shared by the doorbell (the house voted yes) and invitations
// (a flatmate offered the room and they said yes). Keeping it in one place keeps the rules the same both ways: the
// room must still be free (two people can't both move in), the newcomer joins the back of the tontine line, and the
// room starts clean (no ad, no project, nothing online, no team left from before).
import { type Db, memberships, roomTeammates, rooms } from "@coloc/db";
import { and, eq, isNull, max } from "drizzle-orm";

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
  await tx.delete(roomTeammates).where(eq(roomTeammates.roomId, taken[0].id));
  const [{ last }] = await tx.select({ last: max(memberships.tontinePosition) }).from(memberships).where(eq(memberships.houseId, houseId));
  // Newcomers join the back of the tontine line.
  await tx.insert(memberships).values({ houseId, userId, role: "flatmate", tontinePosition: (last ?? -1) + 1 });
  return true;
}
