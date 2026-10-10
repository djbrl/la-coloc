/**
 * The tontine line: whose project the house rallies behind next.
 * After a turn, the beneficiary goes to the back. Anyone who skipped `maxSkips` or more
 * chores this cycle is moved behind everyone in good standing (order among them is kept).
 */
export function nextTontineLine(
  line: string[],
  skippedChores: Record<string, number>,
  maxSkips = 2,
): { current: string | null; line: string[] } {
  if (line.length === 0) return { current: null, line: [] };
  const [beneficiary, ...rest] = line;
  const rotated = [...rest, beneficiary];
  const good = rotated.filter((id) => (skippedChores[id] ?? 0) < maxSkips);
  const late = rotated.filter((id) => (skippedChores[id] ?? 0) >= maxSkips);
  const next = [...good, ...late];
  return { current: next[0], line: next };
}

// A turn lasts a fortnight.
export const TONTINE_TURN_MS = 14 * 24 * 3600 * 1000;

/**
 * Whose turn it is at `now`, for a line in its starting order (by tontine position). Turns pass every fourteen
 * days counted from `anchor`, so every house on the same anchor changes turn on the same day, and the answer
 * never depends on when someone looked. `line` is who comes after, in order; `until` is when the turn passes.
 */
export function tontineTurn(order: string[], anchor: number, now: number): { current: string; line: string[]; until: number } | null {
  if (order.length === 0) return null;
  const turns = Math.floor((now - anchor) / TONTINE_TURN_MS);
  const i = ((turns % order.length) + order.length) % order.length;
  return { current: order[i], line: [...order.slice(i + 1), ...order.slice(0, i)], until: anchor + (turns + 1) * TONTINE_TURN_MS };
}
