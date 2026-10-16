import { describe, expect, it } from "vitest";
import { creditReviews, pickReviewer, splitBill, tontineTurn } from "./index";

const house = [
  { id: "jib", active: true },
  { id: "awa", active: true },
  { id: "moussa", active: true },
];

describe("pickReviewer", () => {
  it("never picks the author", () => {
    expect(pickReviewer(house, "jib", {})).toBe("awa");
  });

  it("prefers whoever has the fewest open reviews", () => {
    const load = { awa: { open: 2, lastAssignedAt: 1 }, moussa: { open: 0, lastAssignedAt: 5 } };
    expect(pickReviewer(house, "jib", load)).toBe("moussa");
  });

  it("then whoever was assigned longest ago", () => {
    const load = { awa: { open: 1, lastAssignedAt: 100 }, moussa: { open: 1, lastAssignedAt: 50 } };
    expect(pickReviewer(house, "jib", load)).toBe("moussa");
  });

  it("skips inactive flatmates and returns null when nobody is left", () => {
    expect(pickReviewer([{ id: "jib", active: true }, { id: "awa", active: false }], "jib", {})).toBeNull();
  });
});

describe("splitBill", () => {
  it("always adds up exactly to the total", () => {
    const lines = splitBill(10_000, [
      { memberId: "jib", reservedMemoryMb: 2048, cpuSeconds: 10 },
      { memberId: "awa", reservedMemoryMb: 2048, cpuSeconds: 20 },
      { memberId: "moussa", reservedMemoryMb: 2048, cpuSeconds: 70 },
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(10_000);
  });

  it("charges heavy users more, but everyone pays rent", () => {
    const [jib, moussa] = splitBill(12_000, [
      { memberId: "jib", reservedMemoryMb: 2048, cpuSeconds: 0 },
      { memberId: "moussa", reservedMemoryMb: 2048, cpuSeconds: 100 },
    ]);
    // 60% rent split evenly (3 600 each) + 40% consumption all to Moussa (4 800).
    expect(jib.amount).toBe(3_600);
    expect(moussa.amount).toBe(8_400);
  });

  it("splits by room size only when nobody used CPU", () => {
    const lines = splitBill(9_000, [
      { memberId: "jib", reservedMemoryMb: 1024, cpuSeconds: 0 },
      { memberId: "awa", reservedMemoryMb: 2048, cpuSeconds: 0 },
    ]);
    expect(lines.map((l) => l.amount)).toEqual([3_000, 6_000]);
  });

  it("refuses fractional francs", () => {
    expect(() => splitBill(10.5, [{ memberId: "jib", reservedMemoryMb: 1, cpuSeconds: 0 }])).toThrow();
  });
});

describe("creditReviews", () => {
  const line = (memberId: string, share: number, reviews: number, skipped = 0) => ({ memberId, share, reviews, skipped });

  it("knocks 500 francs off per review, and the pool pays when nobody skipped", () => {
    const { lines, pool } = creditReviews([line("awa", 4_000, 4), line("jib", 4_000, 1), line("moussa", 4_000, 0)], 500);
    expect(lines.map((l) => l.due)).toEqual([2_000, 3_500, 4_000]);
    expect(lines.map((l) => l.credit)).toEqual([2_000, 500, 0]);
    expect(pool).toBe(2_500);
  });

  it("never takes a line below zero", () => {
    const { lines, pool } = creditReviews([line("awa", 1_000, 5)], 500);
    expect(lines[0]).toMatchObject({ credit: 1_000, due: 0 });
    expect(pool).toBe(1_000);
  });

  it("makes whoever skipped chores pay for the credits, by how many they skipped", () => {
    const { lines, pool } = creditReviews([line("awa", 4_000, 3), line("jib", 4_000, 0, 1), line("moussa", 4_000, 0, 2)], 500);
    // 1 500 of credits: Jib skipped one chore (500), Moussa two (1 000). The house total is kept whole.
    expect(lines.map((l) => l.due)).toEqual([2_500, 4_500, 5_000]);
    expect(lines.reduce((s, l) => s + l.due, 0)).toBe(12_000);
    expect(pool).toBe(0);
  });

  it("charges a skipped review what a done one earns, and the pool pays the rest", () => {
    const { lines, pool } = creditReviews([line("awa", 6_000, 10), line("jib", 1_000, 0, 1)], 500);
    expect(lines[0]).toMatchObject({ credit: 5_000, due: 1_000 });
    expect(lines[1]).toMatchObject({ surcharge: 500, due: 1_500 });
    expect(pool).toBe(4_500);
  });

  it("refuses fractional credits", () => {
    expect(() => creditReviews([], 0.5)).toThrow();
  });
});

describe("tontineTurn", () => {
  const anchor = Date.UTC(2026, 9, 5); // Monday 5 October 2026
  const day = 24 * 3600 * 1000;

  it("passes the turn every fourteen days from the anchor", () => {
    expect(tontineTurn(["awa", "jib", "moussa"], anchor, anchor + 3 * day)).toMatchObject({ current: "awa", line: ["jib", "moussa"] });
    expect(tontineTurn(["awa", "jib", "moussa"], anchor, anchor + 15 * day)).toMatchObject({ current: "jib", line: ["moussa", "awa"] });
    expect(tontineTurn(["awa", "jib", "moussa"], anchor, anchor + 43 * day).current).toBe("awa");
  });

  it("says when the turn passes", () => {
    expect(tontineTurn(["awa", "jib"], anchor, anchor + 3 * day).until).toBe(anchor + 14 * day);
  });

  it("is empty for an empty house, and counts from the anchor before it too", () => {
    expect(tontineTurn([], anchor, anchor)).toBeNull();
    expect(tontineTurn(["awa", "jib"], anchor, anchor - day)).toMatchObject({ current: "jib", until: anchor });
  });
});
