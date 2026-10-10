// The house's exchange in words: reviews as part of the rent, the month's bill, and the tontine (whose project the
// house rallies behind this fortnight). The API does the sums; this only says them, in sentences, so the house
// panel shows no labels. No DOM here, so it's easy to test.
import type { Bill, BillLine, Tontine } from "../../../types";
import { fcfa } from "./server";

// The shapes come from the API (types.ts): `bill` is for flatmates only, `tontine` and `reviewsThisMonth` are public.
// An API that doesn't send them yet leaves them undefined, so everything here takes null or undefined in stride.
export type { Bill, BillLine, Tontine };

const first = (p: { name: string | null; login: string }) => (p.name ?? p.login).split(" ")[0];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "October" from "2026-10". */
export function monthName(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "this month" : d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
}

/** "19 October" from an ISO date. */
export function dayName(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** The house's one public line about reviews: "23 reviews traded this month." */
export function reviewsLine(n: number): string {
  return n > 0 ? `${plural(n, "review", "reviews")} traded this month.` : "No reviews traded yet this month.";
}

/** The bill's first sentences: the total, the month, what a review is worth, and what the house pool covers (the
 *  credits nobody's skipped reviews paid for, so the lines add up to less than the total). */
export function billHead(bill: Pick<Bill, "total" | "month" | "reviewCredit"> & { pool?: number }): string {
  const head = `${fcfa(bill.total)} for ${monthName(bill.month)}, split by what each project uses. Each review takes ${fcfa(bill.reviewCredit)} off.`;
  return bill.pool ? `${head} The house pool covers ${fcfa(bill.pool)} of that.` : head;
}

/** Your own line first, then everyone else in the house's order. */
export function linesYoursFirst<T extends Pick<BillLine, "login">>(lines: T[], me: string | null): T[] {
  return [...lines].sort((a, b) => Number(b.login === me) - Number(a.login === me));
}

/** One person's line of the bill as two sentences: what their reviews took off, then what they owe (or paid).
 *  "Awa reviewed 4 PRs: 2 000 FCFA off." / "Awa owes 1 000 FCFA." Names, never he or she. */
export function lineWords(line: BillLine, me: string | null): { reviews: string; owes: string } {
  const you = line.login === me;
  const who = you ? "You" : first(line);
  const reviews =
    line.reviews > 0
      ? `${who} reviewed ${plural(line.reviews, "PR", "PRs")}: ${fcfa(line.credit)} off.`
      : `${who} ${you ? "haven't" : "hasn't"} reviewed a PR yet this month.`;
  // Their part of everyone's credits, for reviews they let go late.
  const skipped = line.surcharge > 0 ? `Skipped reviews add ${fcfa(line.surcharge)}. ` : "";
  const owes = line.paid
    ? `${who} paid ${fcfa(line.due)}.`
    : line.due <= 0
      ? `${who} ${you ? "owe" : "owes"} nothing this month.`
      : `${skipped}${who} ${you ? "owe" : "owes"} ${fcfa(line.due)}.`;
  return { reviews, owes };
}

/** What you still owe this month, or null when there's nothing to pay (paid already, nothing due, no line). */
export function toPay(bill: Pick<Bill, "lines"> | null | undefined, me: string | null): BillLine | null {
  const mine = bill?.lines.find((l) => l.login === me);
  return mine && !mine.paid && mine.due > 0 ? mine : null;
}

/** The tontine in one sentence: "Until 24 October, the house rallies behind Moussa's Prix Marché: its PRs get
 *  reviewed first." Null when nobody's turn is on. */
export function tontineLine(t: Tontine | null | undefined, me: string | null): string | null {
  const c = t?.current;
  if (!t || !c) return null;
  const until = `Until ${dayName(t.until)}`;
  const you = c.login === me;
  if (c.project) return `${until}, the house rallies behind ${you ? "your" : `${first(c)}'s`} ${c.project}: its PRs get reviewed first.`;
  return `${until}, the house rallies behind ${you ? "you: your" : `${first(c)}: their`} PRs get reviewed first.`;
}

/** The review rule as the second half of the house's line about reviews. */
export const ruleLine = (strict: boolean) => (strict ? "Merges wait for a flatmate's approval." : "Merges go online without waiting for a review.");
