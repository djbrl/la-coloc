import { describe, expect, it } from "vitest";
import { evenSplit, fcfa, plans, rentOf, rentOfPerson } from "./server";

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

describe("what someone with several rooms pays", () => {
  const awa = { login: "awa" };
  const house = { monthlyCostFcfa: 12000, rooms: [{ occupant: awa }, { occupant: awa }, { occupant: { login: "jib" } }, { occupant: null }] };

  it("shares their line of the bill between their rooms, and the whole line is theirs", () => {
    const billed = { ...house, bill: { lines: [{ login: "awa", due: 8000 }, { login: "jib", due: 4000 }, { login: "moussa", due: 0 }] } };
    expect(rentOf(billed, { occupant: awa })).toBe(4000);
    expect(rentOfPerson(billed, "awa")).toBe(8000);
    // No room left, still on the bill.
    expect(rentOfPerson(billed, "moussa")).toBe(0);
  });

  it("adds up the estimate when the bill isn't to be seen", () => {
    expect(rentOf(house, { occupant: awa })).toBe(4000);
    expect(rentOfPerson(house, "awa")).toBe(8000);
    expect(rentOfPerson(house, "moussa")).toBeNull();
  });
});
