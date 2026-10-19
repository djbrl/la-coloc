import { describe, expect, it } from "vitest";
import { SMOKE, smokeFor } from "./smoke";

describe("roof smoke", () => {
  it("doesn't show for an idle house, or with no reading", () => {
    expect(smokeFor(0)).toBeNull();
    expect(smokeFor(1.9)).toBeNull();
    expect(smokeFor(Number.NaN)).toBeNull();
    expect(smokeFor(-5)).toBeNull();
  });

  it("starts thin at 2 % of a core", () => {
    const thin = smokeFor(SMOKE.from)!;
    expect(thin).not.toBeNull();
    expect(thin.rate).toBeLessThan(1);
  });

  it("gets thicker, bigger and greyer the busier the rooms", () => {
    const levels = [5, 30, 80, 150].map((cpu) => smokeFor(cpu)!);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i].rate).toBeGreaterThan(levels[i - 1].rate);
      expect(levels[i].size).toBeGreaterThan(levels[i - 1].size);
      // Greyer: a darker red channel.
      expect(levels[i].color >> 16).toBeLessThan(levels[i - 1].color >> 16);
    }
  });

  it("stops growing at 150 % (two cores flat out look like one and a half)", () => {
    expect(smokeFor(400)).toEqual(smokeFor(SMOKE.full));
  });
});
