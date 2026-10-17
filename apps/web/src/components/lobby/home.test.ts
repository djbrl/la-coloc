import { describe, expect, it } from "vitest";
import type { HouseView } from "../../types";
import { findHouses, homePlace, workshopRow } from "./home";

const room = (name: string, who: { login: string; name: string | null } | null, project: string | null = null) => ({
  name,
  status: "empty" as const,
  url: null,
  project,
  projectDescription: null,
  ad: null,
  occupant: who ? { ...who, avatarUrl: null } : null,
  building: false,
});

const workshop = (myRoom: string | null) =>
  ({
    id: "atelier",
    name: "L'Atelier",
    city: "Atelier",
    country: "",
    tagline: null,
    status: "live",
    agentOnline: true,
    monthlyCostFcfa: null,
    reviewsThisMonth: 0,
    viewer: myRoom ? { login: "nadia", member: true, role: "flatmate", room: myRoom, application: null } : null,
    rooms: [{ ...room("nadia-dev", { login: "nadia", name: "Nadia Ba" }), limits: { memoryMb: 256, cpus: 0.5 }, usage: null }],
  }) as unknown as HouseView;

describe("the way home", () => {
  it("goes to your room in your house first", () => {
    const me = { houses: [{ id: "sacre-coeur", name: "Sacré-Cœur", role: "flatmate" as const, room: "ndaje" }] };
    expect(homePlace(me, workshop("nadia-dev"))).toEqual({ kind: "room", houseId: "sacre-coeur", room: "ndaje" });
  });

  it("goes to your workshop room when you have no house", () => {
    expect(homePlace({ houses: [] }, workshop("nadia-dev"))).toEqual({ kind: "room", houseId: "atelier", room: "nadia-dev" });
  });

  it("has nowhere to go without a room, or logged out", () => {
    expect(homePlace({ houses: [{ id: "x", name: "X", role: "chef", room: null }] }, workshop(null))).toBeNull();
    expect(homePlace(null, null)).toBeNull();
  });
});

describe("finding a house", () => {
  const houses = [
    { name: "Sacré-Cœur", city: "Dakar", tagline: "Bots and APIs", rooms: [room("ndaje", { login: "awa", name: "Awa Diop" }, "Sunu Bot")] },
    { name: "Kigali Hub", city: "Kigali", tagline: null, rooms: [room("r1", null)] },
  ];

  it("lists every house for nothing typed", () => {
    expect(findHouses(houses, "  ")).toHaveLength(2);
  });

  it("matches a house by its name, city, project, and its people by login or name", () => {
    for (const q of ["sacré", "DAKAR", "sunu", "awa", "diop"]) expect(findHouses(houses, q).map((h) => h.name)).toEqual(["Sacré-Cœur"]);
    expect(findHouses(houses, "nobody")).toEqual([]);
  });

  it("adds the workshop for someone who lives there, so they find it and its people", () => {
    expect(workshopRow(workshop(null))).toBeNull();
    const row = workshopRow(workshop("nadia-dev"))!;
    expect(row.id).toBe("atelier");
    expect(findHouses([...houses, row], "nadia").map((h) => h.name)).toEqual(["L'Atelier"]);
  });
});
