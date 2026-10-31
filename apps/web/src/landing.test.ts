import { describe, expect, it } from "vitest";
import { moodAt, opensOnLanding } from "./landing";

const at = (hours: number, minutes = 0) => new Date(2026, 9, 31, hours, minutes);

describe("moodAt", () => {
  it("is day from 07:00 until 19:00", () => {
    expect(moodAt(at(7))).toBe("day");
    expect(moodAt(at(12))).toBe("day");
    expect(moodAt(at(18, 59))).toBe("day");
  });
  it("is a warm night from 19:00 until midnight", () => {
    expect(moodAt(at(19))).toBe("warm");
    expect(moodAt(at(23, 59))).toBe("warm");
  });
  it("is an all-nighter from midnight until 07:00", () => {
    expect(moodAt(at(0))).toBe("blue");
    expect(moodAt(at(6, 59))).toBe("blue");
  });
});

describe("opensOnLanding", () => {
  const visitor = { known: true, loggedIn: false, visiting: false, linked: false };
  it("greets someone we know is logged out", () => expect(opensOnLanding(visitor)).toBe(true));
  it("waits until the API has said who you are", () => expect(opensOnLanding({ ...visitor, known: false })).toBe(false));
  it("never stops someone logged in", () => expect(opensOnLanding({ ...visitor, loggedIn: true })).toBe(false));
  it("lets a visitor who chose the demo through", () => expect(opensOnLanding({ ...visitor, visiting: true })).toBe(false));
  it("keeps a shared link to a place working", () => expect(opensOnLanding({ ...visitor, linked: true })).toBe(false));
});
