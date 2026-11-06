// The house's exchange in words: reviews as part of the rent, the month's bill, and the tontine (whose project the
// house rallies behind this fortnight). The API does the sums; this only says them, in sentences, so the house
// panel shows no labels. The sentences themselves, in English and French, are in words.ts. No DOM here, so it's
// easy to test.
import { language, locale } from "../../../i18n";
import type { Bill, BillLine, Tontine } from "../../../types";
import { fcfa } from "./server";
import { houseWords as w } from "./words";

// The shapes come from the API (types.ts): `bill` is for flatmates only, `tontine` and `reviewsThisMonth` are public.
// An API that doesn't send them yet leaves them undefined, so everything here takes null or undefined in stride.
export type { Bill, BillLine, Tontine };

const first = (p: { name: string | null; login: string }) => (p.name ?? p.login).split(" ")[0];

/** "October" (or "octobre") from "2026-10". */
export function monthName(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? w.thisMonth : d.toLocaleString(locale(), { month: "long", timeZone: "UTC" });
}

/** "19 October" (or "19 octobre") from an ISO date. French writes the first of the month "1er". */
export function dayName(iso: string): string {
  const day = new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long", timeZone: "UTC" });
  return language.lang === "fr" ? day.replace(/^1 /, "1er ") : day;
}

/** The house's one public line about reviews: "23 reviews traded this month." */
export const reviewsLine = (n: number): string => w.reviewsTraded(n);

/** The bill's first sentences: the total, the month, what a review is worth, and what the house pool covers (the
 *  credits nobody's skipped reviews paid for, so the lines add up to less than the total). */
export function billHead(bill: Pick<Bill, "total" | "month" | "reviewCredit"> & { pool?: number }): string {
  const head = w.billHead(fcfa(bill.total), monthName(bill.month), fcfa(bill.reviewCredit));
  return bill.pool ? `${head} ${w.pool(fcfa(bill.pool))}` : head;
}

/** Your own line first, then everyone else in the house's order. */
export function linesYoursFirst<T extends Pick<BillLine, "login">>(lines: T[], me: string | null): T[] {
  return [...lines].sort((a, b) => Number(b.login === me) - Number(a.login === me));
}

/** One person's line of the bill as two sentences: what their reviews took off, then what they owe (or paid).
 *  "Awa reviewed 4 PRs: 2 000 FCFA off." / "Awa owes 1 000 FCFA." Names, never he or she. */
export function lineWords(line: BillLine, me: string | null): { reviews: string; owes: string } {
  const you = line.login === me;
  const who = you ? w.you : first(line);
  const reviews = line.reviews > 0 ? w.reviewed(who, you, line.reviews, fcfa(line.credit)) : w.notReviewed(who, you);
  // Their part of everyone's credits, for reviews they let go late.
  const skipped = line.surcharge > 0 ? w.skipped(fcfa(line.surcharge)) : "";
  // An Arena prize won this month: La Coloc pays that part, not the house.
  const prize = line.prize && line.prize > 0 ? w.arenaPrize(fcfa(line.prize)) : "";
  // Paid: what was taken then (rent goes early in the month; reviews done since lower `due`, not what was paid).
  const owes = line.paid ? w.hasPaid(who, you, fcfa(line.paidAmount ?? line.due)) : line.due <= 0 ? `${prize}${w.owesNothing(who, you)}` : `${skipped}${prize}${w.owes(who, you, fcfa(line.due))}`;
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
  const day = dayName(t.until);
  const you = c.login === me;
  return c.project ? w.tontineProject(day, you, first(c), c.project) : w.tontinePerson(day, you, first(c));
}

/** The review rule as the second half of the house's line about reviews. */
export const ruleLine = (strict: boolean) => (strict ? w.ruleStrict : w.ruleRelaxed);
