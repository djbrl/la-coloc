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
