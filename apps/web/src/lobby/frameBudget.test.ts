import { describe, expect, it } from "vitest";
import { FrameBudget } from "./frameBudget";

const run = (b: FrameBudget, ms: number, seconds: number) => {
  let told = 0;
  for (let t = 0; t < seconds * 1000; t += ms) if (b.add(ms)) told++;
  return told;
};

describe("the frame budget", () => {
  it("doesn't count the moments after arriving somewhere", () => {
    const b = new FrameBudget();
    run(b, 50, 15);
    b.settle();
    expect(run(b, 50, 5)).toBe(0);
  });

  it("says nothing at 60 frames a second, nor at the flat 30 of a browser saving battery", () => {
    expect(run(new FrameBudget(), 16, 30)).toBe(0);
    expect(run(new FrameBudget(), 33.4, 30)).toBe(0);
  });

  it("says so once per window of frames too slow", () => {
    // After the first few seconds, which don't count (arriving is slow by nature).
    expect(run(new FrameBudget(), 50, 15)).toBe(3);
  });

  it("ignores long gaps: a tab in the background, a town being rebuilt", () => {
    expect(run(new FrameBudget(), 1000, 30)).toBe(0);
  });
});
