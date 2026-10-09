import { describe, expect, it } from "vitest";
import { tallyVotes } from "./admission";

const y = { yes: true };
const n = { yes: false };

describe("tallyVotes", () => {
  it("lets someone in when a strict majority says yes", () => {
    expect(tallyVotes(3, [y, y])).toBe("admitted");
    expect(tallyVotes(1, [y])).toBe("admitted");
    expect(tallyVotes(4, [y, y, y])).toBe("admitted");
  });

  it("waits while the outcome is still open", () => {
    expect(tallyVotes(3, [y])).toBe("open");
    expect(tallyVotes(4, [y, y])).toBe("open");
    expect(tallyVotes(3, [])).toBe("open");
  });

  it("declines as soon as yes can no longer win", () => {
    expect(tallyVotes(3, [n, n])).toBe("declined");
    expect(tallyVotes(4, [n, n])).toBe("declined");
    expect(tallyVotes(3, [y, n])).toBe("open");
  });

  it("needs a house to vote", () => {
    expect(() => tallyVotes(0, [])).toThrow();
  });
});
