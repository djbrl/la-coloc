// The tontine: whose project the house rallies behind, a fortnight each.
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
