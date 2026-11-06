import { describe, expect, it } from "vitest";
import type { CityHouse, Me, Person } from "../../types";
import { citiesOf, firstName, freeRoomsIn, housesWithSpace, myRooms, roomMatches, startCity } from "./dashboard";

const person = (login: string): Person => ({ login, name: `${login[0].toUpperCase()}${login.slice(1)} Diop`, avatarUrl: null });
type CityRoom = CityHouse["rooms"][number];
const room = (name: string, occupant: Person | null, extra: Partial<CityRoom> = {}): CityRoom => ({
  name,
  status: occupant ? "live" : "empty",
  url: null,
  project: occupant ? `${name} app` : null,
  projectDescription: null,
  ad: null,
  occupant,
  building: false,
  ...extra,
});
const house = (id: string, rooms: CityRoom[], extra: Partial<CityHouse> = {}): CityHouse =>
  ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    city: "Dakar",
    country: "SN",
    tagline: null,
    status: "live",
    demo: false,
    agentOnline: true,
    monthlyCostFcfa: null,
    plot: null,
    rooms,
    openChores: 0,
    lateChores: 0,
    knocking: 0,
    reviewsThisMonth: 0,
    tontine: null,
    ...extra,
  }) as CityHouse;
const me = (extra: Partial<Me> = {}): Me => ({ login: "awa", name: "Awa Diop", avatarUrl: null, avatar: null, houses: [], ...extra });

const city = [
  house("baobab", [room("a", person("moussa")), room("b", null, { ad: "A Go dev" }), room("c", null)], { monthlyCostFcfa: 9000 }),
  house("sample", [room("a", null)], { demo: true }),
  house("full", [room("a", person("fatou"))]),
  house("lagos-one", [room("a", null)], { city: "Lagos" }),
  house("mine", [room("a", person("awa")), room("b", null)]),
];

describe("the dashboard's free rooms", () => {
  it("lists each free room of the city, real houses first, with its share of the rent; your own house's are left out", () => {
    const rows = freeRoomsIn(city, "Dakar", me({ houses: [{ id: "mine", name: "Mine", role: "flatmate", room: "a", rooms: ["a"] }] }));
    expect(rows.map((r) => `${r.house.id}/${r.room.name}`)).toEqual(["baobab/b", "baobab/c", "sample/a"]);
    expect(rows[0].rent).toBe(3000);
    expect(rows[2].rent).toBeNull();
  });

  it("gives each its one action: knock, your knock, log in, or see an example house", () => {
    const visitor = freeRoomsIn(city, "Dakar", null);
    expect(visitor.map((r) => r.action.kind)).toEqual(["login", "login", "login", "see"]);
    const knocked = freeRoomsIn(city, "Dakar", me({ knocks: [{ id: "k1", houseId: "baobab", room: "b" }] }));
    expect(knocked[0].action).toEqual({ kind: "knocked", id: "k1" });
    expect(knocked.find((r) => r.house.id === "mine")?.action).toEqual({ kind: "knock" });
    expect(knocked.find((r) => r.house.id === "sample")?.action).toEqual({ kind: "see" });
  });

  it("are searched by house, room and what the room is looking for", () => {
    const [b] = freeRoomsIn(city, "Dakar", null);
    expect(roomMatches(b, "go dev")).toBe(true);
    expect(roomMatches(b, "baob")).toBe(true);
    expect(roomMatches(b, "rust")).toBe(false);
    expect(roomMatches(b, "  ")).toBe(true);
  });
});

describe("the dashboard's houses with space", () => {
  it("are the city's houses with a free room, real ones first, not yours", () => {
    const viewer = me({ houses: [{ id: "mine", name: "Mine", role: "chef", room: "a", rooms: ["a"] }] });
    expect(housesWithSpace(city, "Dakar", viewer).map((h) => h.id)).toEqual(["baobab", "sample"]);
    expect(housesWithSpace(city, "Lagos", null).map((h) => h.id)).toEqual(["lagos-one"]);
  });
});

describe("your rooms on the dashboard", () => {
  it("are one row per room, with what the city says about it; a house the city doesn't list keeps its own name", () => {
    const viewer = me({
      houses: [
        { id: "mine", name: "Mine", role: "chef", room: "a", rooms: ["a", "b"] },
        { id: "atelier", name: "L'Atelier", role: "flatmate", room: "x", rooms: [] },
      ],
    });
    expect(myRooms(city, viewer)).toEqual([
      { houseId: "mine", houseName: "Mine", city: "Dakar", room: "a", project: "a app", status: "live", demo: false },
      { houseId: "mine", houseName: "Mine", city: "Dakar", room: "b", project: null, status: "empty", demo: false },
      { houseId: "atelier", houseName: "L'Atelier", city: null, room: "x", project: null, status: "empty", demo: false },
    ]);
    expect(myRooms(city, null)).toEqual([]);
  });
});

describe("the dashboard's city", () => {
  it("is the address bar's, else your house's, else your home city, else the busiest", () => {
    const withHouse = me({ houses: [{ id: "lagos-one", name: "Lagos-one", role: "chef", room: "a", rooms: ["a"] }], homeCity: "Accra" });
    expect(startCity("Abidjan", city, withHouse)).toBe("Abidjan");
    expect(startCity("", city, withHouse)).toBe("Lagos");
    expect(startCity(null, city, me({ homeCity: "Accra" }))).toBe("Accra");
    expect(startCity(null, city, null)).toBe("Dakar");
    expect(startCity(null, [], null)).toBe("Dakar");
  });

  it("lists the cities, the busiest first, with their houses and free rooms", () => {
    expect(citiesOf(city)).toEqual([
      { name: "Dakar", houses: 4, free: 4 },
      { name: "Lagos", houses: 1, free: 1 },
    ]);
  });

  it("says hello by first name, else login", () => {
    expect(firstName({ name: "Awa Diop", login: "awa" })).toBe("Awa");
    expect(firstName({ name: null, login: "awa" })).toBe("awa");
    expect(firstName({ name: "  ", login: "awa" })).toBe("awa");
  });
});
