import { describe, expect, it } from "vitest";
import { billHead, dayName, lineWords, linesYoursFirst, monthName, reviewsLine, ruleLine, tontineLine, toPay, type BillLine } from "./exchange";
import { fcfa } from "./server";

const line = (login: string, extra: Partial<BillLine> = {}): BillLine => ({
  login,
  name: login[0].toUpperCase() + login.slice(1),
  share: 3000,
  reviews: 0,
  credit: 0,
  due: 3000,
  paid: false,
  ...extra,
});

describe("the house's exchange, in words", () => {
  it("says the reviews traded this month", () => {
    expect(reviewsLine(23)).toBe("23 reviews traded this month.");
    expect(reviewsLine(1)).toBe("1 review traded this month.");
    expect(reviewsLine(0)).toBe("No reviews traded this month.");
  });

  it("names months and days", () => {
    expect(monthName("2026-10")).toBe("October");
    expect(dayName("2026-10-19T00:00:00.000Z")).toBe("19 October");
    expect(billHead({ total: 12000, month: "2026-10", reviewCredit: 500 })).toBe(
      `${fcfa(12000)} for October, split by use. Each review earns ${fcfa(500)} in credit.`,
    );
  });

  it("says each line of the bill as two sentences, with names and no he or she", () => {
    // Reviews earn credit; the line is still the whole share.
    const awa = line("awa", { reviews: 4, credit: 2000 });
    expect(lineWords(awa, "jib")).toEqual({ reviews: `Awa reviewed 4 PRs: ${fcfa(2000)} in credit.`, owes: `Awa owes ${fcfa(3000)}.` });
    expect(lineWords(awa, "awa")).toEqual({ reviews: `You reviewed 4 PRs: ${fcfa(2000)} in credit.`, owes: `You owe ${fcfa(3000)}.` });
    expect(lineWords(line("moussa"), null).reviews).toBe("Moussa hasn't reviewed a PR yet.");
    expect(lineWords(line("moussa", { paid: true }), null).owes).toBe(`Moussa paid ${fcfa(3000)}.`);
    // Rent taken at the start of the month: what was taken, though less CPU used since brought `due` down.
    expect(lineWords(line("moussa", { paid: true, paidAmount: 3000, due: 2000 }), null).owes).toBe(`Moussa paid ${fcfa(3000)}.`);
    expect(lineWords(line("moussa", { share: 0, due: 0 }), "moussa").owes).toBe("You owe nothing this month.");
  });

  it("puts your line first and knows what you still owe", () => {
    const lines = [line("awa"), line("jib", { due: 4000 }), line("moussa", { paid: true })];
    expect(linesYoursFirst(lines, "jib").map((l) => l.login)).toEqual(["jib", "awa", "moussa"]);
    expect(toPay({ lines }, "jib")?.due).toBe(4000);
    expect(toPay({ lines }, "moussa")).toBeNull();
    expect(toPay({ lines }, "nobody")).toBeNull();
    expect(toPay(null, "jib")).toBeNull();
  });

  it("says whose turn the tontine is on, and until when", () => {
    const moussa = { login: "moussa", name: "Moussa Diop", avatarUrl: null };
    const t = { current: { ...moussa, project: "Prix Marché" }, line: [], until: "2026-10-24T00:00:00.000Z" };
    expect(tontineLine(t, "jib")).toBe("Until 24 October, Moussa's Prix Marché is reviewed first.");
    expect(tontineLine(t, "moussa")).toBe("Until 24 October, your Prix Marché is reviewed first.");
    expect(tontineLine({ ...t, current: { ...moussa, project: null } }, "jib")).toBe("Until 24 October, Moussa's PRs are reviewed first.");
    expect(tontineLine({ ...t, current: null }, "jib")).toBeNull();
    expect(tontineLine(undefined, "jib")).toBeNull();
  });

  it("says the review rule in words", () => {
    expect(ruleLine(true)).toBe("Merges wait for a flatmate's approval.");
    expect(ruleLine(false)).toBe("Merges go online without waiting for a review.");
  });
});
