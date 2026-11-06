import { describe, expect, it } from "vitest";
import type { CityHappening } from "../types";
import { planFor } from "./happenings";

const at = "2026-10-19T10:00:00Z";
const rooms = ["Ndaje", "Teranga", "Sabar"];

describe("a house's happenings", () => {
  it("send a review's envelope from the reviewer to the author, both at the house", () => {
    const h: CityHappening = { id: "r1", at, kind: "review", from: "awa", to: "moussa" };
    expect(planFor(h, () => true, rooms)).toEqual({ kind: "envelope", from: "awa", to: "moussa" });
  });

  it("send it from the door up to the roof when either isn't there", () => {
    const h: CityHappening = { id: "r2", at, kind: "review", from: "awa", to: "moussa" };
    expect(planFor(h, (login) => login === "awa", rooms)).toEqual({ kind: "envelope-to-roof" });
    expect(planFor(h, (login) => login === "moussa", rooms)).toEqual({ kind: "envelope-to-roof" });
    expect(planFor(h, () => false, rooms)).toEqual({ kind: "envelope-to-roof" });
  });

  it("flash the crashed room's own window, and only find it by its name", () => {
    expect(planFor({ id: "c1", at, kind: "crash", room: "Teranga" }, () => true, rooms)).toEqual({ kind: "crash", window: 1 });
    // A room the page doesn't know (renamed meanwhile): still the puff and the sound, no window.
    expect(planFor({ id: "c2", at, kind: "crash", room: "Gone" }, () => true, rooms)).toEqual({ kind: "crash", window: -1 });
  });

  it("celebrate a project going live", () => {
    expect(planFor({ id: "l1", at, kind: "live", room: "Sabar" }, () => false, rooms)).toEqual({ kind: "celebrate" });
  });

  it("ignore a kind this page doesn't know yet", () => {
    const newer = { id: "x", at, kind: "party" } as unknown as CityHappening;
    expect(planFor(newer, () => true, rooms)).toBeNull();
  });
});
