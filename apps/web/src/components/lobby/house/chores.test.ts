import { afterEach, describe, expect, it } from "vitest";
import { language } from "../../../i18n";
import type { Chore, Person } from "../../../types";
import { dueOf, dueWords, reviewSituation, reviewSummary, reviewTitle, splitReviews } from "./chores";

const person = (login: string): Person => ({ login, name: `${login[0].toUpperCase()}${login.slice(1)} Diop`, avatarUrl: null });
const NOW = Date.parse("2026-10-15T12:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
let ids = 0;
const chore = (assignee: string, author: string | null, extra: Partial<Chore> = {}): Chore => ({
  id: String(++ids),
  repo: `${author ?? "x"}/marche`,
  prNumber: ids,
  prTitle: "Add the price chart",
  prUrl: "https://github.com/awa/marche/pull/12",
  assignee: person(assignee),
  author: author ? person(author) : null,
  dueAt: inHours(5),
  late: false,
  ...extra,
});

afterEach(() => {
  language.lang = "en";
});

describe("the Reviews tab", () => {
  it("puts your reviews apart from the house's others, late first, then the one due soonest", () => {
    const soon = chore("jib", "awa", { dueAt: inHours(2) });
    const later = chore("jib", "awa", { dueAt: inHours(20) });
    const late = chore("jib", "moussa", { dueAt: inHours(-3), late: true });
    const theirs = chore("awa", "jib");
    const lists = splitReviews([later, theirs, soon, late], "jib");
    expect(lists.mine.map((c) => c.id)).toEqual([late.id, soon.id, later.id]);
    expect(lists.others).toEqual([theirs]);
    expect(splitReviews(null, "jib")).toEqual({ mine: [], others: [] });
  });

  it("says the most pressing thing first: a late review, then yours to do, then the others', then nothing", () => {
    const mineLate = chore("jib", "awa", { late: true });
    const mine = chore("jib", "awa");
    const theirs = chore("awa", "moussa");
    expect(reviewSituation(splitReviews([mine, mineLate, theirs], "jib"))).toEqual({ kind: "late", late: 1 });
    expect(reviewSituation(splitReviews([mine, theirs], "jib"))).toEqual({ kind: "todo", count: 1 });
    expect(reviewSituation(splitReviews([theirs], "jib"))).toEqual({ kind: "othersOnly", count: 1 });
    expect(reviewSituation(splitReviews([], "jib"))).toEqual({ kind: "none" });
    // Someone else's late review isn't yours to worry about.
    expect(reviewSituation(splitReviews([chore("awa", "jib", { late: true })], "jib")).kind).toBe("othersOnly");
  });

  it("says it in one plain sentence, with what a review earns in credit", () => {
    expect(reviewSummary(splitReviews([chore("jib", "awa")], "jib"), "500 FCFA")).toBe("1 review to do. Each earns you 500 FCFA in credit.");
    expect(reviewSummary(splitReviews([chore("jib", "awa"), chore("jib", "awa")], "jib"), "500 FCFA")).toBe(
      "2 reviews to do. Each earns you 500 FCFA in credit.",
    );
    expect(reviewSummary(splitReviews([chore("jib", "awa", { late: true })], "jib"), "500 FCFA")).toBe(
      "1 review late. It adds to your rent.",
    );
    expect(reviewSummary(splitReviews([], "jib"), "500 FCFA")).toMatch(/^Nothing to review\./);
    language.lang = "fr";
    expect(reviewSummary(splitReviews([chore("jib", "awa")], "jib"), "500 FCFA")).toBe("1 revue à faire. Chacune vous rapporte 500 FCFA de crédit.");
  });

  it("titles a row as a sentence: what you review, or who reviews whose", () => {
    expect(reviewTitle(chore("jib", "awa"), "jib")).toBe("Review Awa's “Add the price chart”");
    expect(reviewTitle(chore("jib", null), "jib")).toBe("Review “Add the price chart”");
    expect(reviewTitle(chore("moussa", "awa"), "jib")).toBe("Moussa reviews Awa's “Add the price chart”");
    expect(reviewTitle(chore("moussa", "jib"), "jib")).toBe("Moussa reviews your “Add the price chart”");
    language.lang = "fr";
    expect(reviewTitle(chore("jib", "awa"), "jib")).toBe("Relire « Add the price chart » de Awa");
  });

  it("says when a review is due, and trusts the API on lateness", () => {
    expect(dueOf(chore("jib", "awa", { dueAt: inHours(5) }), NOW)).toEqual({ kind: "hours", hours: 5 });
    expect(dueOf(chore("jib", "awa", { dueAt: inHours(0.2) }), NOW)).toEqual({ kind: "now" });
    expect(dueOf(chore("jib", "awa", { dueAt: inHours(50) }), NOW)).toEqual({ kind: "days", days: 2 });
    expect(dueOf(chore("jib", "awa", { dueAt: inHours(5), late: true }), NOW)).toEqual({ kind: "late" });
    expect(dueWords({ kind: "hours", hours: 5 })).toBe("Due in 5h");
    expect(dueWords({ kind: "days", days: 1 })).toBe("Due in 1 day");
    expect(dueWords({ kind: "late" })).toBe("Late");
  });
});
