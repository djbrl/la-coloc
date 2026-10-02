export interface RoomUsage {
  memberId: string;
  // Reserved memory: the room's size, paid like rent whether it's used or not.
  reservedMemoryMb: number;
  // Measured CPU over the period (sum of cpu% × seconds / 100).
  cpuSeconds: number;
}

export interface BillLine {
  memberId: string;
  amount: number;
}

/**
 * Splits a bill in whole francs.
 * `reservedShare` of the total is split by room size (rent), the rest by measured CPU (consumption).
 * If nobody used any CPU, everything is split by room size. Rounding uses the largest remainder,
 * so the lines always add up exactly to the total.
 */
export function splitBill(total: number, rooms: RoomUsage[], reservedShare = 0.6): BillLine[] {
  if (!Number.isInteger(total) || total < 0) throw new Error("total must be a whole, non-negative amount");
  if (reservedShare < 0 || reservedShare > 1) throw new Error("reservedShare must be between 0 and 1");
  if (rooms.length === 0) return [];

  const reservedTotal = rooms.reduce((s, r) => s + r.reservedMemoryMb, 0);
  const cpuTotal = rooms.reduce((s, r) => s + r.cpuSeconds, 0);
  if (reservedTotal <= 0) throw new Error("rooms must reserve some memory");
  const rentShare = cpuTotal > 0 ? reservedShare : 1;

  const exact = rooms.map((r) => {
    const rent = (r.reservedMemoryMb / reservedTotal) * rentShare;
    const consumption = cpuTotal > 0 ? (r.cpuSeconds / cpuTotal) * (1 - rentShare) : 0;
    return total * (rent + consumption);
  });

  const floored = exact.map(Math.floor);
  let leftover = total - floored.reduce((s, a) => s + a, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (leftover === 0) break;
    floored[i] += 1;
    leftover -= 1;
  }

  return rooms.map((r, i) => ({ memberId: r.memberId, amount: floored[i] }));
}
