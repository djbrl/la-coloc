// The workshop's made-up reviews and bill (Jib, 6 11: "mock data you can see as a reference"). The workshop has
// nobody but you in it, so its Reviews and Bill tabs would be empty; these fill them, in the shapes the API sends, so
// the real rows render them. The tab says "Example" once (HouseInside.vue). Nothing here is ever sent anywhere: the
// people are made up, the pull requests don't exist, and your line of the bill is already paid (the first rent was).
import type { Bill, BillLine, Chore, Person } from "../../../types";
import { houseWords } from "./words";

const HOUR = 3600_000;
const REVIEW_CREDIT = 500;
// A room's share of a 12 000 FCFA server, in a house of four (the first rent says the same).
const SHARE = 3000;

const someone = (first: string): Person => ({ login: `example-${first.toLowerCase()}`, name: first, avatarUrl: null, github: false });
const AWA = someone("Awa");
const MOUSSA = someone("Moussa");
const FATOU = someone("Fatou");

/** Three reviews in a house of four: a flatmate's on your page, one due soon between two others, one gone late. */
export function exampleReviews(you: Person, now = new Date()): Chore[] {
  const w = houseWords.examplePrs;
  const at = (hours: number) => new Date(now.getTime() + hours * HOUR).toISOString();
  return [
    { id: "example-1", repo: `example/${you.login}`, prNumber: 2, prTitle: w.greeting, prUrl: "", assignee: AWA, author: you, dueAt: at(20), late: false },
    { id: "example-2", repo: "example/prix-marche", prNumber: 14, prTitle: w.prices, prUrl: "", assignee: MOUSSA, author: AWA, dueAt: at(5), late: false },
    { id: "example-3", repo: "example/ndaje", prNumber: 31, prTitle: w.login, prUrl: "", assignee: FATOU, author: MOUSSA, dueAt: at(-3), late: true },
  ];
}

// One line of the example bill: a share, owed whole, and the credit its reviews earned.
function line(p: Pick<Person, "login" | "name">, reviews: number, paid: boolean): BillLine {
  return { login: p.login, name: p.name, share: SHARE, reviews, credit: reviews * REVIEW_CREDIT, due: SHARE, paid };
}

/** This month's bill for a house of four: you (paid, as the first rent was) and three made-up flatmates. */
export function exampleBill(you: Pick<Person, "login" | "name">, operators: string[], now = new Date()): Bill {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lines = [line(you, 2, true), line(AWA, 1, true), line(MOUSSA, 0, false), line(FATOU, 3, false)];
  return {
    month,
    total: SHARE * lines.length,
    reviewCredit: REVIEW_CREDIT,
    lines,
    operators,
    reference: `COLOC-EXAMPLE-${month}`,
  };
}
