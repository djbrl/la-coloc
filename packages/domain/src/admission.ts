export type Verdict = "open" | "admitted" | "declined";

/**
 * The house votes on whoever knocked. A strict majority of flatmates decides, either way:
 * more than half say yes → admitted; enough say no that yes can no longer win → declined.
 * Nobody can be let in by a minority while the others are away.
 */
export function tallyVotes(flatmates: number, votes: { yes: boolean }[]): Verdict {
  if (flatmates <= 0) throw new Error("a house needs at least one flatmate to vote");
  const yes = votes.filter((v) => v.yes).length;
  const no = votes.length - yes;
  const majority = Math.floor(flatmates / 2) + 1;
  if (yes >= majority) return "admitted";
  if (flatmates - no < majority) return "declined";
  return "open";
}
