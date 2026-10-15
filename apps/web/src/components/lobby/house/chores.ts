// The house's Reviews tab, in words. Behind it are the API's "chores": when a flatmate opens a pull request, the
// house picks the next reviewer in turn (apps/api/src/github/chores.service.ts) and gives them 24 hours. Each review
// done takes a credit off the reviewer's rent, and one let go late adds up to as much to it (packages/domain bill.ts).
// The panel calls them "reviews", because that's what they are to a newcomer; "chore" stays the API's word.
//
// This file decides what the tab shows and says: your reviews first, the rest of the house's behind a button, and
// the one sentence at the top. No DOM and no Vue here, so it's tested in chores.test.ts.
import type { Chore, Person } from "../../../types";
import { houseWords as w } from "./words";

const first = (p: Person) => (p.name ?? p.login).split(" ")[0];

/** Late first (they cost you), then the one due soonest. */
export function byUrgency(a: Chore, b: Chore): number {
  if (a.late !== b.late) return a.late ? -1 : 1;
  return Date.parse(a.dueAt) - Date.parse(b.dueAt);
}

export interface ReviewLists {
  // The reviews the house gave you to do.
  mine: Chore[];
  // Everyone else's: shown only when you ask, unless you have none of your own.
  others: Chore[];
}

/** The house's open reviews split into yours and the others', each list most urgent first. */
export function splitReviews(chores: Chore[] | null | undefined, me: string | null): ReviewLists {
  const all = [...(chores ?? [])].sort(byUrgency);
  return {
    mine: all.filter((c) => c.assignee.login === me),
    others: all.filter((c) => c.assignee.login !== me),
  };
}

// What the top sentence is about, most pressing first: a late review of yours, then reviews of yours to do, then
// only the flatmates' reviews, then nothing at all.
export type ReviewSituation =
  | { kind: "late"; late: number }
  | { kind: "todo"; count: number }
  | { kind: "othersOnly"; count: number }
  | { kind: "none" };

export function reviewSituation(lists: ReviewLists): ReviewSituation {
  const late = lists.mine.filter((c) => c.late).length;
  if (late) return { kind: "late", late };
  if (lists.mine.length) return { kind: "todo", count: lists.mine.length };
  if (lists.others.length) return { kind: "othersOnly", count: lists.others.length };
  return { kind: "none" };
}

/** The tab's one sentence about you. `credit` is what a review takes off the rent, already written ("500 FCFA"). */
export function reviewSummary(lists: ReviewLists, credit: string): string {
  const s = reviewSituation(lists);
  switch (s.kind) {
    case "late":
      return w.reviews.late(s.late);
    case "todo":
      return w.reviews.todo(s.count, credit);
    case "othersOnly":
      return w.reviews.othersOnly(s.count);
    case "none":
      return w.reviews.none;
  }
}

/** A review's row title, as a sentence: "Review Awa's “Add the price chart”" for yours, "Moussa reviews Awa's …"
 *  for someone else's, "… your “…”" when the pull request is yours. */
export function reviewTitle(c: Chore, me: string | null): string {
  if (c.assignee.login === me) return c.author ? w.reviews.yours(first(c.author), c.prTitle) : w.reviews.yoursNoAuthor(c.prTitle);
  const reviewer = first(c.assignee);
  if (!c.author) return w.reviews.theirsNoAuthor(reviewer, c.prTitle);
  if (c.author.login === me) return w.reviews.theirsYourPr(reviewer, c.prTitle);
  return w.reviews.theirs(reviewer, first(c.author), c.prTitle);
}

// How long until a review is due. The API decides lateness (`late`), so the panel and the bill agree on it.
export type Due = { kind: "late" } | { kind: "now" } | { kind: "hours"; hours: number } | { kind: "days"; days: number };

export function dueOf(c: Pick<Chore, "dueAt" | "late">, now = Date.now()): Due {
  if (c.late) return { kind: "late" };
  const hours = Math.round((Date.parse(c.dueAt) - now) / 3_600_000);
  if (hours < 1) return { kind: "now" };
  if (hours < 24) return { kind: "hours", hours };
  return { kind: "days", days: Math.round(hours / 24) };
}

/** "Due in 5h", "Due in 2 days", "Due now", "Late". */
export function dueWords(due: Due): string {
  switch (due.kind) {
    case "late":
      return w.reviews.dueLate;
    case "now":
      return w.reviews.dueNow;
    case "hours":
      return w.reviews.dueHours(due.hours);
    case "days":
      return w.reviews.dueDays(due.days);
  }
}
