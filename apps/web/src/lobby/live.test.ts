import { describe, expect, it } from "vitest";
import type { CityHouse } from "../types";
import { liveKey, liveState, windowState } from "./live";

const room = (status: CityHouse["rooms"][number]["status"], occupied = true, building = false): CityHouse["rooms"][number] => ({
  name: "r",
  status,
  url: null,
  project: null,
  projectDescription: null,
  ad: null,
  occupant: occupied ? { login: "awa", name: "Awa", avatarUrl: null } : null,
  building,
});

const house = (over: Partial<CityHouse> = {}): CityHouse => ({
  id: "h",
  name: "H",
  city: "Dakar",
  country: "SN",
  tagline: null,
  status: "live",
  demo: false,
  agentOnline: true,
  monthlyCostFcfa: null,
  plot: null,
  rooms: [room("live"), room("empty", false), room("down"), room("empty")],
  openChores: 2,
  lateChores: 1,
  knocking: 1,
  reviewsThisMonth: 0,
  tontine: null,
  ...over,
});

describe("a house's live state", () => {
  it("gives every room a window: lit, free, down or dark", () => {
    expect(house().rooms.map(windowState)).toEqual(["lit", "free", "down", "dark"]);
    expect(windowState(room("failed"))).toBe("down");
  });

  it("raises the crane while any room builds, even a live one", () => {
    expect(liveState(house()).building).toBe(false);
    expect(liveState(house({ rooms: [room("live", true, true)] })).building).toBe(true);
    expect(liveState(house({ rooms: [room("deploying")] })).building).toBe(true);
  });

  it("cuts the power of a real house whose caretaker is offline, never of an example house", () => {
    expect(liveState(house({ agentOnline: false })).powerCut).toBe(true);
    expect(liveState(house({ agentOnline: false, demo: true })).powerCut).toBe(false);
  });

  it("changes its key only when something drawn changes", () => {
    expect(liveKey(liveState(house()))).toBe(liveKey(liveState(house({ name: "Renamed" }))));
    expect(liveKey(liveState(house()))).not.toBe(liveKey(liveState(house({ knocking: 0 }))));
  });
});
