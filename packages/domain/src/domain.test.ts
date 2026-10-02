import { describe, expect, it } from "vitest";
import { nextTontineLine, pickReviewer, splitBill } from "./index";

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

describe("nextTontineLine", () => {
  it("sends the beneficiary to the back", () => {
    expect(nextTontineLine(["awa", "jib", "moussa"], {})).toEqual({
      current: "jib",
      line: ["jib", "moussa", "awa"],
    });
  });

  it("pushes people who skipped too many chores behind everyone else", () => {
    expect(nextTontineLine(["awa", "jib", "moussa"], { jib: 2 }).line).toEqual(["moussa", "awa", "jib"]);
  });
});
