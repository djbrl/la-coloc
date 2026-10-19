import { describe, expect, it } from "vitest";
import { fade } from "./particles";

describe("a particle's fade", () => {
  it("comes in quickly, holds until halfway, then goes out to nothing", () => {
    expect(fade(0)).toBe(0);
    expect(fade(0.05)).toBeLessThan(fade(0.15));
    expect(fade(0.15)).toBe(1);
    expect(fade(0.45)).toBe(1);
    expect(fade(0.75)).toBeCloseTo(0.5);
    expect(fade(1)).toBe(0);
  });
});
