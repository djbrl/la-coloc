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

export interface ReviewedLine {
  memberId: string;
  // The usage share from splitBill.
  share: number;
  // Reviews this flatmate did for the house this month.
  reviews: number;
  // Reviews assigned to them this month that they let go late or never did.
  skipped: number;
}

export interface CreditedLine {
  memberId: string;
  share: number;
  // What their reviews knocked off (reviews × credit, never more than their share).
  credit: number;
  // What their skipped chores add: their part of paying for everyone else's credits.
  surcharge: number;
  // What they actually owe this month: share − credit + surcharge.
  due: number;
}

/**
 * Reviews as rent. Each review a flatmate does this month knocks `creditPerReview` francs off their line (never
 * below zero). The house still owes the server its whole total, so someone pays for those credits:
 * - first the flatmates who skipped chores, in proportion to how many they skipped (largest remainder, whole francs).
 *   A skipped review costs at most what a done review earns, so nobody pays more than `creditPerReview` per skip;
 * - whatever is left over is paid by the house pool, so the lines then add up to less than the total.
 * Returns the lines and how much the pool covers. With nobody skipping, the pool covers every credit.
 */
export function creditReviews(lines: ReviewedLine[], creditPerReview: number): { lines: CreditedLine[]; pool: number } {
  if (!Number.isInteger(creditPerReview) || creditPerReview < 0) throw new Error("creditPerReview must be a whole, non-negative amount");
  const credited = lines.map((l) => ({ ...l, credit: Math.min(l.share, l.reviews * creditPerReview), surcharge: 0 }));
  let toCover = credited.reduce((s, l) => s + l.credit, 0);

  // Spread the credits over the skippers, by skips. A skipper's own credit is netted first (they did some reviews).
  const skippers = credited.filter((l) => l.skipped > 0);
  const skips = skippers.reduce((s, l) => s + l.skipped, 0);
  if (skips > 0 && toCover > 0) {
    const exact = skippers.map((l) => (toCover * l.skipped) / skips);
    const whole = exact.map(Math.floor);
    let leftover = toCover - whole.reduce((s, a) => s + a, 0);
    const order = exact.map((x, i) => ({ i, rem: x - Math.floor(x) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (const { i } of order) {
      if (leftover === 0) break;
      whole[i] += 1;
      leftover -= 1;
    }
    skippers.forEach((l, i) => {
      // A skip costs what a review earns, no more: the rest falls to the pool.
      l.surcharge = Math.min(whole[i], l.skipped * creditPerReview);
      toCover -= l.surcharge;
    });
  }

  return {
    lines: credited.map((l) => ({ memberId: l.memberId, share: l.share, credit: l.credit, surcharge: l.surcharge, due: l.share - l.credit + l.surcharge })),
    pool: toCover,
  };
}
