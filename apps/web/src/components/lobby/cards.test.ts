import { describe, expect, it } from "vitest";
import { homeLine, knockOn, nearestEmptyPlot, roomOf, roomsLine, shortRepo } from "./cards";

const room = (name: string, occupied: boolean) => ({
  name,
  status: "empty" as const,
  url: null,
  project: occupied ? `${name}-app` : null,
  projectDescription: null,
  ad: null,
  occupant: occupied ? { login: name, name: null, avatarUrl: null } : null,
  building: false,
});

describe("what a house card says", () => {
  it("counts the rooms and the free ones", () => {
    expect(roomsLine({ rooms: [room("a", true), room("b", false), room("c", true), room("d", true)] })).toBe("4 rooms, 1 free");
    expect(roomsLine({ rooms: [room("a", true), room("b", true)] })).toBe("2 rooms, full");
    expect(roomsLine({ rooms: [room("a", false)] })).toBe("1 room, free");
    expect(roomsLine({ rooms: [room("a", true)] })).toBe("1 room, taken");
  });
});

describe("what a person card says", () => {
  it("says where someone lives, or nothing for a visitor", () => {
    expect(homeLine("moussa", { houseName: "Sacré-Cœur", city: "Dakar" })).toBe("@moussa · lives in Sacré-Cœur, Dakar");
    expect(homeLine("moussa", null)).toBeNull();
  });

  it("finds their room in the house", () => {
    const house = { rooms: [room("awa", true), room("moussa", true)] };
    expect(roomOf(house, "moussa")?.project).toBe("moussa-app");
    expect(roomOf(house, "nobody")).toBeNull();
    expect(roomOf(null, "moussa")).toBeNull();
    expect(roomOf(house, null)).toBeNull();
  });
});

describe("your knocks", () => {
  const knocks = [
    { id: "k1", houseId: "sacre-coeur", room: "room-4" },
    { id: "k2", houseId: "almadies", room: "room-2" },
  ];

  it("finds your open knock on a house", () => {
    expect(knockOn(knocks, "almadies")?.id).toBe("k2");
    expect(knockOn(knocks, "atelier")).toBeNull();
  });

  it("knows no knock when the API doesn't list them", () => {
    expect(knockOn(undefined, "almadies")).toBeNull();
    expect(knockOn(null, "almadies")).toBeNull();
    expect(knockOn(knocks, null)).toBeNull();
  });
});

describe("repo links", () => {
  it("drops the scheme, and GitHub's host", () => {
    expect(shortRepo("https://github.com/djbrl")).toBe("djbrl");
    expect(shortRepo("https://github.com/djbrl/app/")).toBe("djbrl/app");
    expect(shortRepo("https://github.com/djbrl/app.git")).toBe("djbrl/app");
    expect(shortRepo("https://gitlab.com/djbrl/app")).toBe("gitlab.com/djbrl/app");
  });
});

describe("finding a plot to rent together", () => {
  it("picks the nearest empty plot, never a house's", () => {
    const plots = [
      { key: "a", x: 1, z: 1, lot: { kind: "house" } },
      { key: "b", x: 10, z: 0, lot: { kind: "shop" } },
      { key: "c", x: -3, z: 2, lot: { kind: "trees" } },
    ];
    expect(nearestEmptyPlot(plots, { x: 0, z: 0 })).toBe("c");
    expect(nearestEmptyPlot(plots.slice(0, 1), { x: 0, z: 0 })).toBeNull();
  });
});
