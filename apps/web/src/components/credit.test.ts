import { describe, expect, it } from "vitest";
import { digits, needsCharacter, shortBy } from "./credit";

describe("credit", () => {
  it("writes an amount without its currency", () => {
    expect(digits(15_000).replace(/\s/g, " ")).toBe("15 000");
    expect(digits(500)).toBe("500");
  });

  it("says what's missing, and nothing when it's enough or unknown", () => {
    expect(shortBy(3_000, 7_000)).toBe(4_000);
    expect(shortBy(7_000, 7_000)).toBe(0);
    expect(shortBy(undefined, 7_000)).toBe(0);
  });
});

describe("the character gate", () => {
  it("waits to know who you are, and only stops someone logged in with no look", () => {
    expect(needsCharacter(false, { avatar: null })).toBe(false);
    expect(needsCharacter(true, null)).toBe(false);
    expect(needsCharacter(true, { avatar: "female-a" })).toBe(false);
    expect(needsCharacter(true, { avatar: null })).toBe(true);
  });
});
