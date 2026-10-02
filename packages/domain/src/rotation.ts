export interface Flatmate {
  id: string;
  active: boolean;
}

export interface ReviewLoad {
  // Reviews currently assigned and not done yet.
  open: number;
  // When this flatmate was last assigned a review (ms since epoch), or null if never.
  lastAssignedAt: number | null;
}

/**
 * Picks who reviews the next pull request.
 * Never the author, never someone inactive. Among the rest: fewest open reviews first,
 * then whoever was assigned longest ago, then house order. Deterministic on purpose,
 * so the bot's choice can always be explained.
 */
export function pickReviewer(
  flatmates: Flatmate[],
  authorId: string,
  load: Record<string, ReviewLoad>,
): string | null {
  const candidates = flatmates
    .map((f, order) => ({ ...f, order, ...(load[f.id] ?? { open: 0, lastAssignedAt: null }) }))
    .filter((f) => f.active && f.id !== authorId);
  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) =>
      a.open - b.open ||
      (a.lastAssignedAt ?? -Infinity) - (b.lastAssignedAt ?? -Infinity) ||
      a.order - b.order,
  );
  return candidates[0].id;
}
