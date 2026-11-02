// Who pays for which room this month. A pure rule, so the bill's one tricky case is easy to test and to explain: when
// a lease ends, the rent doesn't move until the month is over.

export interface BilledRoom {
  name: string;
  memoryMb: number;
  payer: string;
}

/**
 * Every room someone pays for this month. A room whose lease ended this month still counts for whoever left it, at the
 * size it had, and not for anyone who has moved in since: they start paying on the first of next month. Any other room
 * counts for whoever lives in it. A free room counts for nobody. Someone with several rooms appears once per room.
 */
export function billedRooms(
  rooms: { name: string; occupantId: string | null; memoryMb: number }[],
  ended: { room: string; userId: string; memoryMb: number }[],
): BilledRoom[] {
  return rooms.flatMap((r) => {
    const end = ended.find((e) => e.room === r.name);
    if (end) return [{ name: r.name, memoryMb: end.memoryMb, payer: end.userId }];
    return r.occupantId ? [{ name: r.name, memoryMb: r.memoryMb, payer: r.occupantId }] : [];
  });
}
