// A full house's chat guests: someone from outside who asked to join the group chat, and a flatmate let in. The asking
// and answering live in the notifications service (a flatmate answers under the bell); these are the two questions the
// rest of the API asks.
import { type Db, type HouseGuestStatus, houseGuests } from "@coloc/db";
import { and, eq } from "drizzle-orm";

// An ask nobody answered for a week lapses, like an invitation; a no holds for a day.
export const GUEST_ASK_MS = 7 * 24 * 3600 * 1000;
export const GUEST_NO_MS = 24 * 3600 * 1000;

/** Where someone stands with a house's chat today: an old ask or an old no counts as nothing. */
export function guestStanding(row: { status: HouseGuestStatus; askedAt: Date; decidedAt: Date | null } | undefined, now = Date.now()): HouseGuestStatus | null {
  if (!row) return null;
  if (row.status === "open" && row.askedAt.getTime() < now - GUEST_ASK_MS) return null;
  if (row.status === "declined" && (row.decidedAt?.getTime() ?? 0) < now - GUEST_NO_MS) return null;
  return row.status;
}

/** A flatmate let them into the house's chat. */
export async function isChatGuest(db: Db, houseId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: houseGuests.status })
    .from(houseGuests)
    .where(and(eq(houseGuests.houseId, houseId), eq(houseGuests.userId, userId), eq(houseGuests.status, "accepted")));
  return !!row;
}
