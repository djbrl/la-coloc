import { describe, expect, it } from "vitest";
import { splitReviews } from "./chores";
import { exampleBill, exampleReviews } from "./examples";
import { toPay } from "./exchange";

const you = { login: "fatou", name: "Fatou", avatarUrl: null };
const now = new Date("2026-11-06T10:00:00Z");

describe("the workshop's examples", () => {
  it("shows three reviews by made-up flatmates, none of them yours to do, one on your page and one late", () => {
    const reviews = exampleReviews(you, now);
    expect(reviews).toHaveLength(3);
    const { mine, others } = splitReviews(reviews, you.login);
    expect(mine).toEqual([]);
    expect(others).toHaveLength(3);
    expect(reviews.some((r) => r.author?.login === "fatou")).toBe(true);
    expect(reviews.filter((r) => r.late)).toHaveLength(1);
    // Made up: never a real GitHub profile or pull request to follow.
    expect(reviews.every((r) => r.prUrl === "" && r.assignee.github === false)).toBe(true);
  });

  it("bills a house of four for the month, adds up, and leaves you nothing to pay", () => {
    const bill = exampleBill(you, ["Wave"], now);
    expect(bill.month).toBe("2026-11");
    expect(bill.lines.map((l) => l.login)).toEqual(["fatou", "example-awa", "example-moussa", "example-fatou"]);
    const owed = bill.lines.reduce((sum, l) => sum + l.due, 0);
    expect(owed).toBe(bill.total);
    expect(bill.lines[0]).toMatchObject({ share: 3000, credit: 1000, due: 3000, paid: true });
    expect(toPay(bill, you.login)).toBeNull();
  });
});
