import { describe, expect, it } from "vitest";
import { evenSplit, fcfa, plans } from "./server";

describe("the bill", () => {
  it("writes amounts the French way", () => {
    expect(fcfa(7000)).toBe("7 000 FCFA");
    expect(fcfa(12000)).toBe("12 000 FCFA");
    expect(fcfa(950)).toBe("950 FCFA");
    expect(fcfa(1234567)).toBe("1 234 567 FCFA");
  });

  it("splits the month evenly, to the nearest hundred", () => {
    expect(evenSplit(12000, 3)).toBe(4000);
    expect(evenSplit(7000, 3)).toBe(2300);
    // An empty house still shows the whole cost rather than dividing by zero.
    expect(evenSplit(7000, 0)).toBe(7000);
  });

  it("offers three plans, cheapest first", () => {
    expect(plans.map((p) => p.id)).toEqual(["small", "medium", "large"]);
    expect(plans.every((p, i) => i === 0 || p.fcfa > plans[i - 1].fcfa)).toBe(true);
  });
});
